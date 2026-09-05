-- KD-024 follow-up. 20260903000000 made an Object's type and name agree with the
-- record attached to it. Ownership was still unchecked: a Goal owned by one user
-- could attach to an Object owned by another, and because Object.objectId
-- cascades, the Object's owner deleting their data then deleted the other user's
-- Goal with it. That is cross-account data loss, not an untidy row.
--
-- Required invariant, for every Object-backed model:
--   the record's owner = the owner of the Object it is attached to.
--
-- A composite (objectId, userId) -> Object(id, userId) foreign key was the first
-- candidate and was rejected on three findings:
--
--   * CustomItem has no userId at all. It is owned through CustomModule, so a
--     composite key cannot express its ownership and it would need a trigger
--     regardless -- leaving one invariant enforced two different ways.
--   * Left out of the Prisma schema, the constraint is drift: `migrate diff`
--     emits DROP CONSTRAINT / DROP INDEX for it, and the deploy script's
--     reconciliation would push the protection away on the next deploy.
--   * Put into the schema, Prisma requires @@unique([id, userId]) on Object and
--     @@unique([objectId, userId]) on each typed model -- five unique indexes
--     that duplicate the primary key and the existing @unique on objectId.
--
-- So ownership joins type in the attachment check, which already runs on exactly
-- the writes that could break it, covers all five models the same way, and needs
-- no schema change.

-- 1. Refuse to enforce an invariant the existing rows already break -----------
CREATE TEMP TABLE "kinesis_object_ownership_violations" (detail TEXT) ON COMMIT DROP;

INSERT INTO "kinesis_object_ownership_violations" (detail)
SELECT format('Document %s is owned by %s but its Object %s is owned by %s', d."id", d."userId", o."id", o."userId")
  FROM "Document" d JOIN "Object" o ON o."id" = d."objectId" WHERE d."userId" <> o."userId"
UNION ALL
SELECT format('Goal %s is owned by %s but its Object %s is owned by %s', g."id", g."userId", o."id", o."userId")
  FROM "Goal" g JOIN "Object" o ON o."id" = g."objectId" WHERE g."userId" <> o."userId"
UNION ALL
SELECT format('FinanceItem %s is owned by %s but its Object %s is owned by %s', f."id", f."userId", o."id", o."userId")
  FROM "FinanceItem" f JOIN "Object" o ON o."id" = f."objectId" WHERE f."userId" <> o."userId"
UNION ALL
SELECT format('Person %s is owned by %s but its Object %s is owned by %s', p."id", p."userId", o."id", o."userId")
  FROM "Person" p JOIN "Object" o ON o."id" = p."objectId" WHERE p."userId" <> o."userId"
UNION ALL
-- CustomItem is owned by whoever owns the module holding it.
SELECT format('CustomItem %s is owned by %s through module %s but its Object %s is owned by %s', i."id", m."userId", m."id", o."id", o."userId")
  FROM "CustomItem" i
  JOIN "CustomModule" m ON m."id" = i."moduleId"
  JOIN "Object" o ON o."id" = i."objectId"
 WHERE m."userId" <> o."userId";

DO $$
DECLARE
  total BIGINT;
  sample TEXT;
BEGIN
  SELECT count(*) INTO total FROM "kinesis_object_ownership_violations";
  IF total > 0 THEN
    SELECT string_agg(detail, E'\n') INTO sample
      FROM (SELECT detail FROM "kinesis_object_ownership_violations" ORDER BY detail LIMIT 25) listed;
    RAISE EXCEPTION E'Object ownership integrity cannot be enforced: % existing violation(s).\n%\n(at most 25 shown) Resolve these rows, then re-run the migration.', total, sample;
  END IF;
END $$;

-- 2. A record may only attach to an Object of its own kind and its own owner --
-- This replaces kinesis_assert_object_type from 20260903000000. Type and owner
-- are two halves of the same question -- may this record attach to this Object --
-- and answering both from one lookup keeps them from drifting apart.
--
-- TG_ARGV[0] is the type this table must attach to. TG_ARGV[1] says where the
-- table keeps its owner: 'row' for the four that carry userId themselves, and
-- 'module' for CustomItem, which is owned through the module holding it.
CREATE OR REPLACE FUNCTION "kinesis_assert_object_attachment"() RETURNS TRIGGER AS $$
DECLARE
  expected_type "KinesisObjectType" := TG_ARGV[0]::"KinesisObjectType";
  owner_source TEXT := TG_ARGV[1];
  record_owner TEXT;
  object_type "KinesisObjectType";
  object_owner TEXT;
BEGIN
  IF owner_source = 'module' THEN
    SELECT "userId" INTO record_owner FROM "CustomModule" WHERE "id" = NEW."moduleId";
  ELSE
    record_owner := NEW."userId";
  END IF;

  SELECT "type", "userId" INTO object_type, object_owner FROM "Object" WHERE "id" = NEW."objectId";
  IF object_type IS NULL THEN
    RAISE EXCEPTION 'Object % does not exist, so % % cannot attach to it', NEW."objectId", TG_TABLE_NAME, NEW."id";
  END IF;
  IF object_type <> expected_type THEN
    RAISE EXCEPTION '% % cannot attach to Object % of type %: expected %', TG_TABLE_NAME, NEW."id", NEW."objectId", object_type, expected_type;
  END IF;
  IF record_owner IS DISTINCT FROM object_owner THEN
    RAISE EXCEPTION '% % is owned by % and cannot attach to Object %, which is owned by %', TG_TABLE_NAME, NEW."id", record_owner, NEW."objectId", object_owner;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- The triggers now also fire on the column that carries ownership, so moving a
-- record to another account is checked the same way attaching it was.
DROP TRIGGER IF EXISTS "kinesis_assert_object_type" ON "Document";
DROP TRIGGER IF EXISTS "kinesis_assert_object_attachment" ON "Document";
CREATE TRIGGER "kinesis_assert_object_attachment" AFTER INSERT OR UPDATE OF "objectId", "userId" ON "Document"
FOR EACH ROW EXECUTE FUNCTION "kinesis_assert_object_attachment"('DOCUMENT', 'row');

DROP TRIGGER IF EXISTS "kinesis_assert_object_type" ON "Goal";
DROP TRIGGER IF EXISTS "kinesis_assert_object_attachment" ON "Goal";
CREATE TRIGGER "kinesis_assert_object_attachment" AFTER INSERT OR UPDATE OF "objectId", "userId" ON "Goal"
FOR EACH ROW EXECUTE FUNCTION "kinesis_assert_object_attachment"('GOAL', 'row');

DROP TRIGGER IF EXISTS "kinesis_assert_object_type" ON "FinanceItem";
DROP TRIGGER IF EXISTS "kinesis_assert_object_attachment" ON "FinanceItem";
CREATE TRIGGER "kinesis_assert_object_attachment" AFTER INSERT OR UPDATE OF "objectId", "userId" ON "FinanceItem"
FOR EACH ROW EXECUTE FUNCTION "kinesis_assert_object_attachment"('FINANCE_ITEM', 'row');

DROP TRIGGER IF EXISTS "kinesis_assert_object_type" ON "Person";
DROP TRIGGER IF EXISTS "kinesis_assert_object_attachment" ON "Person";
CREATE TRIGGER "kinesis_assert_object_attachment" AFTER INSERT OR UPDATE OF "objectId", "userId" ON "Person"
FOR EACH ROW EXECUTE FUNCTION "kinesis_assert_object_attachment"('PERSON', 'row');

-- CustomItem's owner changes when it moves to a different module, so moduleId is
-- the column to watch here rather than a userId it does not have.
DROP TRIGGER IF EXISTS "kinesis_assert_object_type" ON "CustomItem";
DROP TRIGGER IF EXISTS "kinesis_assert_object_attachment" ON "CustomItem";
CREATE TRIGGER "kinesis_assert_object_attachment" AFTER INSERT OR UPDATE OF "objectId", "moduleId" ON "CustomItem"
FOR EACH ROW EXECUTE FUNCTION "kinesis_assert_object_attachment"('CUSTOM_ITEM', 'module');

DROP FUNCTION IF EXISTS "kinesis_assert_object_type"();

-- 3. ...and the Object cannot be moved to another account either -------------
-- The mirror of the check above, for the same reason 20260903000000 guards
-- Object.type from the Object side: otherwise the pair could still be broken by
-- editing the half the typed record's own triggers never see.
CREATE OR REPLACE FUNCTION "kinesis_object_owner_integrity"() RETURNS TRIGGER AS $$
DECLARE
  attached TEXT;
  attached_owner TEXT;
BEGIN
  SELECT candidate."table", candidate."owner" INTO attached, attached_owner FROM (
    SELECT 'Document' AS "table", d."userId" AS "owner" FROM "Document" d WHERE d."objectId" = NEW."id"
    UNION ALL SELECT 'Goal', g."userId" FROM "Goal" g WHERE g."objectId" = NEW."id"
    UNION ALL SELECT 'FinanceItem', f."userId" FROM "FinanceItem" f WHERE f."objectId" = NEW."id"
    UNION ALL SELECT 'Person', p."userId" FROM "Person" p WHERE p."objectId" = NEW."id"
    UNION ALL SELECT 'CustomItem', m."userId" FROM "CustomItem" i JOIN "CustomModule" m ON m."id" = i."moduleId" WHERE i."objectId" = NEW."id"
  ) candidate LIMIT 1;

  IF attached IS NOT NULL AND attached_owner IS DISTINCT FROM NEW."userId" THEN
    RAISE EXCEPTION 'Object % has a % owned by %, so it cannot move to %', NEW."id", attached, attached_owner, NEW."userId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "kinesis_object_owner_integrity" ON "Object";
CREATE TRIGGER "kinesis_object_owner_integrity" BEFORE UPDATE OF "userId" ON "Object"
FOR EACH ROW EXECUTE FUNCTION "kinesis_object_owner_integrity"();

-- 4. A module cannot carry its items into another account --------------------
-- CustomItem's owner is the module's owner, so re-owning a module would move
-- every item in it away from the Objects they are attached to. This is the
-- third way the pair could be broken, and the one neither check above sees.
CREATE OR REPLACE FUNCTION "kinesis_module_owner_integrity"() RETURNS TRIGGER AS $$
DECLARE
  stranded BIGINT;
BEGIN
  SELECT count(*) INTO stranded
    FROM "CustomItem" i JOIN "Object" o ON o."id" = i."objectId"
   WHERE i."moduleId" = NEW."id" AND o."userId" IS DISTINCT FROM NEW."userId";

  IF stranded > 0 THEN
    RAISE EXCEPTION 'CustomModule % holds % item(s) whose Object is owned by someone else, so it cannot move to %', NEW."id", stranded, NEW."userId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "kinesis_module_owner_integrity" ON "CustomModule";
CREATE TRIGGER "kinesis_module_owner_integrity" BEFORE UPDATE OF "userId" ON "CustomModule"
FOR EACH ROW EXECUTE FUNCTION "kinesis_module_owner_integrity"();
