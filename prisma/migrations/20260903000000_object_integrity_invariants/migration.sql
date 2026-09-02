-- KD-024 follow-up. 20260901000100_universal_object_identity gave every typed
-- record a stable Object, and 20260902000000_object_capability_layer made
-- Object.name a derived value by syncing it from the typed record. Both of the
-- invariants that identity rests on were still only conventions:
--
--   1. Object.type says what kind of record is attached -- but nothing stopped a
--      Document attaching itself to an Object marked GOAL.
--   2. Object.name mirrors the typed record -- but a direct write to Object.name
--      would stand until that record happened to be saved again.
--
-- Both are enforced here in the database. Triggers rather than composite
-- (id, type) foreign keys: a composite FK needs a discriminator column on each
-- typed table, and "Document"."type" is already taken by the document's own
-- domain type. Discriminators would also become required fields on five Prisma
-- models, pushed through every create call site, to encode a constant.

-- 1. Refuse to enforce an invariant the existing rows already break -----------
-- The triggers below only police new writes. Anything already inconsistent
-- would survive silently and surface later as a mystery failure, so the
-- migration stops here instead, naming what is wrong.
CREATE TEMP TABLE "kinesis_object_integrity_violations" (kind TEXT, detail TEXT) ON COMMIT DROP;

INSERT INTO "kinesis_object_integrity_violations" (kind, detail)
-- Object.type contradicts the record attached to it.
SELECT 'type-mismatch', format('Document %s is attached to Object %s of type %s, expected DOCUMENT', d."id", o."id", o."type")
  FROM "Document" d JOIN "Object" o ON o."id" = d."objectId" WHERE o."type" <> 'DOCUMENT'
UNION ALL
SELECT 'type-mismatch', format('Goal %s is attached to Object %s of type %s, expected GOAL', g."id", o."id", o."type")
  FROM "Goal" g JOIN "Object" o ON o."id" = g."objectId" WHERE o."type" <> 'GOAL'
UNION ALL
SELECT 'type-mismatch', format('FinanceItem %s is attached to Object %s of type %s, expected FINANCE_ITEM', f."id", o."id", o."type")
  FROM "FinanceItem" f JOIN "Object" o ON o."id" = f."objectId" WHERE o."type" <> 'FINANCE_ITEM'
UNION ALL
SELECT 'type-mismatch', format('Person %s is attached to Object %s of type %s, expected PERSON', p."id", o."id", o."type")
  FROM "Person" p JOIN "Object" o ON o."id" = p."objectId" WHERE o."type" <> 'PERSON'
UNION ALL
SELECT 'type-mismatch', format('CustomItem %s is attached to Object %s of type %s, expected CUSTOM_ITEM', i."id", o."id", o."type")
  FROM "CustomItem" i JOIN "Object" o ON o."id" = i."objectId" WHERE o."type" <> 'CUSTOM_ITEM'
UNION ALL
-- An Object with nothing attached has no canonical name to be checked against,
-- which is precisely the state the name trigger below treats as a failure.
SELECT 'orphaned-object', format('Object %s of type %s has no typed record attached', o."id", o."type")
  FROM "Object" o
 WHERE NOT EXISTS (SELECT 1 FROM "Document"    d WHERE d."objectId" = o."id")
   AND NOT EXISTS (SELECT 1 FROM "Goal"        g WHERE g."objectId" = o."id")
   AND NOT EXISTS (SELECT 1 FROM "FinanceItem" f WHERE f."objectId" = o."id")
   AND NOT EXISTS (SELECT 1 FROM "Person"      p WHERE p."objectId" = o."id")
   AND NOT EXISTS (SELECT 1 FROM "CustomItem"  i WHERE i."objectId" = o."id")
UNION ALL
-- Object.name already drifted from the record it is supposed to project.
SELECT 'name-divergence', format('Object %s is named %L but its Document is named %L', o."id", o."name", d."name")
  FROM "Object" o JOIN "Document" d ON d."objectId" = o."id" WHERE o."name" <> d."name"
UNION ALL
SELECT 'name-divergence', format('Object %s is named %L but its Goal is named %L', o."id", o."name", g."name")
  FROM "Object" o JOIN "Goal" g ON g."objectId" = o."id" WHERE o."name" <> g."name"
UNION ALL
SELECT 'name-divergence', format('Object %s is named %L but its FinanceItem is named %L', o."id", o."name", f."name")
  FROM "Object" o JOIN "FinanceItem" f ON f."objectId" = o."id" WHERE o."name" <> f."name"
UNION ALL
SELECT 'name-divergence', format('Object %s is named %L but its Person is named %L', o."id", o."name", p."name")
  FROM "Object" o JOIN "Person" p ON p."objectId" = o."id" WHERE o."name" <> p."name"
UNION ALL
SELECT 'name-divergence', format('Object %s is named %L but its CustomItem is named %L', o."id", o."name", i."name")
  FROM "Object" o JOIN "CustomItem" i ON i."objectId" = o."id" WHERE o."name" <> i."name";

DO $$
DECLARE
  total BIGINT;
  sample TEXT;
BEGIN
  SELECT count(*) INTO total FROM "kinesis_object_integrity_violations";
  IF total > 0 THEN
    SELECT string_agg(detail, E'\n') INTO sample
      FROM (SELECT detail FROM "kinesis_object_integrity_violations" ORDER BY kind, detail LIMIT 25) listed;
    RAISE EXCEPTION E'Universal Object integrity cannot be enforced: % existing violation(s).\n%\n(at most 25 shown) Resolve these rows, then re-run the migration.', total, sample;
  END IF;
END $$;

-- 2. A typed record may only attach to an Object of its own kind -------------
-- One function for all five tables; the expected type is the trigger argument,
-- so a new Object-backed model adds a trigger rather than another copy of this.
-- AFTER, so the objectId foreign key has already proven the Object exists.
CREATE OR REPLACE FUNCTION "kinesis_assert_object_type"() RETURNS TRIGGER AS $$
DECLARE
  expected "KinesisObjectType" := TG_ARGV[0]::"KinesisObjectType";
  actual "KinesisObjectType";
BEGIN
  SELECT "type" INTO actual FROM "Object" WHERE "id" = NEW."objectId";
  IF actual IS NULL THEN
    RAISE EXCEPTION 'Object % does not exist, so % % cannot attach to it', NEW."objectId", TG_TABLE_NAME, NEW."id";
  END IF;
  IF actual <> expected THEN
    RAISE EXCEPTION '% % cannot attach to Object % of type %: expected %', TG_TABLE_NAME, NEW."id", NEW."objectId", actual, expected;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Named to sort before kinesis_sync_object_name: PostgreSQL fires same-event
-- triggers in name order, so a wrong-typed attachment is rejected before the
-- name sync would push a name onto the wrong identity.
DROP TRIGGER IF EXISTS "kinesis_assert_object_type" ON "Document";
CREATE TRIGGER "kinesis_assert_object_type" AFTER INSERT OR UPDATE OF "objectId" ON "Document"
FOR EACH ROW EXECUTE FUNCTION "kinesis_assert_object_type"('DOCUMENT');

DROP TRIGGER IF EXISTS "kinesis_assert_object_type" ON "Goal";
CREATE TRIGGER "kinesis_assert_object_type" AFTER INSERT OR UPDATE OF "objectId" ON "Goal"
FOR EACH ROW EXECUTE FUNCTION "kinesis_assert_object_type"('GOAL');

DROP TRIGGER IF EXISTS "kinesis_assert_object_type" ON "FinanceItem";
CREATE TRIGGER "kinesis_assert_object_type" AFTER INSERT OR UPDATE OF "objectId" ON "FinanceItem"
FOR EACH ROW EXECUTE FUNCTION "kinesis_assert_object_type"('FINANCE_ITEM');

DROP TRIGGER IF EXISTS "kinesis_assert_object_type" ON "Person";
CREATE TRIGGER "kinesis_assert_object_type" AFTER INSERT OR UPDATE OF "objectId" ON "Person"
FOR EACH ROW EXECUTE FUNCTION "kinesis_assert_object_type"('PERSON');

DROP TRIGGER IF EXISTS "kinesis_assert_object_type" ON "CustomItem";
CREATE TRIGGER "kinesis_assert_object_type" AFTER INSERT OR UPDATE OF "objectId" ON "CustomItem"
FOR EACH ROW EXECUTE FUNCTION "kinesis_assert_object_type"('CUSTOM_ITEM');

-- 3. ...and the Object cannot be retyped out from under it -------------------
-- The check above only sees writes to the typed record. Without this, an
-- attached Object could still be relabelled and break the pair from the
-- other side.
CREATE OR REPLACE FUNCTION "kinesis_object_type_integrity"() RETURNS TRIGGER AS $$
DECLARE
  attached "KinesisObjectType";
BEGIN
  SELECT candidate."type" INTO attached FROM (
    SELECT 'DOCUMENT'::"KinesisObjectType"     AS "type" WHERE EXISTS (SELECT 1 FROM "Document"    WHERE "objectId" = NEW."id")
    UNION ALL SELECT 'GOAL'::"KinesisObjectType"         WHERE EXISTS (SELECT 1 FROM "Goal"        WHERE "objectId" = NEW."id")
    UNION ALL SELECT 'FINANCE_ITEM'::"KinesisObjectType" WHERE EXISTS (SELECT 1 FROM "FinanceItem" WHERE "objectId" = NEW."id")
    UNION ALL SELECT 'PERSON'::"KinesisObjectType"       WHERE EXISTS (SELECT 1 FROM "Person"      WHERE "objectId" = NEW."id")
    UNION ALL SELECT 'CUSTOM_ITEM'::"KinesisObjectType"  WHERE EXISTS (SELECT 1 FROM "CustomItem"  WHERE "objectId" = NEW."id")
  ) candidate LIMIT 1;

  IF attached IS NOT NULL AND attached <> NEW."type" THEN
    RAISE EXCEPTION 'Object % has a % record attached, so its type cannot become %', NEW."id", attached, NEW."type";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "kinesis_object_type_integrity" ON "Object";
CREATE TRIGGER "kinesis_object_type_integrity" BEFORE UPDATE OF "type" ON "Object"
FOR EACH ROW EXECUTE FUNCTION "kinesis_object_type_integrity"();

-- 4. Object.name is a projection, and a projection cannot be edited ----------
-- kinesis_sync_object_name pushes the typed record's name onto the Object. This
-- rejects any write that does not agree with the record the Object belongs to,
-- so the typed model stays the only source of a name.
--
-- The two work together rather than fighting: the sync trigger is AFTER, so by
-- the time it issues its UPDATE the typed row already holds the new name, and
-- the value being written is exactly the canonical one. Neither trigger writes
-- from inside this function, so there is no recursion. Only UPDATE is covered:
-- an Object is inserted before the record that names it exists, and the sync
-- trigger reconciles the seeded value on the record's own INSERT.
CREATE OR REPLACE FUNCTION "kinesis_object_name_integrity"() RETURNS TRIGGER AS $$
DECLARE
  canonical TEXT;
BEGIN
  CASE NEW."type"
    WHEN 'DOCUMENT'     THEN SELECT "name" INTO canonical FROM "Document"    WHERE "objectId" = NEW."id";
    WHEN 'GOAL'         THEN SELECT "name" INTO canonical FROM "Goal"        WHERE "objectId" = NEW."id";
    WHEN 'FINANCE_ITEM' THEN SELECT "name" INTO canonical FROM "FinanceItem" WHERE "objectId" = NEW."id";
    WHEN 'PERSON'       THEN SELECT "name" INTO canonical FROM "Person"      WHERE "objectId" = NEW."id";
    WHEN 'CUSTOM_ITEM'  THEN SELECT "name" INTO canonical FROM "CustomItem"  WHERE "objectId" = NEW."id";
    ELSE RAISE EXCEPTION 'Object % has unrecognised type %', NEW."id", NEW."type";
  END CASE;

  -- An Object claiming a type whose record is missing is broken, not renameable.
  IF canonical IS NULL THEN
    RAISE EXCEPTION 'Object % claims type % but no such record is attached, so it has no name to keep', NEW."id", NEW."type";
  END IF;

  IF NEW."name" IS DISTINCT FROM canonical THEN
    RAISE EXCEPTION 'Object.name is derived from the % it belongs to: refusing to name Object % %L instead of %L', NEW."type", NEW."id", NEW."name", canonical;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "kinesis_object_name_integrity" ON "Object";
CREATE TRIGGER "kinesis_object_name_integrity" BEFORE UPDATE OF "name" ON "Object"
FOR EACH ROW EXECUTE FUNCTION "kinesis_object_name_integrity"();
