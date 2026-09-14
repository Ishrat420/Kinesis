-- KD-032, option 4b. Extends 20260904000000_object_ownership_integrity's
-- pattern -- a record may only reference something its own account owns --
-- to the three places gap B named: Relationship, ObjectRelationship, and
-- FieldLink. Each references two other rows without anything checking they
-- agree on an owner; application code (addGoalRelationshipAction,
-- validateKinesisTargets) already checks before writing, but that is one call
-- site's convention, not a guarantee every future write path inherits.
--
-- This is not the same function reused three times: 20260904's
-- kinesis_assert_object_attachment covers five tables because they share one
-- shape exactly -- one FK to Object, one owner column, the same two questions
-- ("right type", "right owner") every time. These three don't share a shape
-- with each other: Relationship checks two Person endpoints against its own
-- userId, ObjectRelationship checks two Object endpoints against its own
-- userId, and FieldLink has no userId of its own at all -- its check is
-- whether its two referenced Objects agree with *each other*. Three
-- functions, not one made to pretend the shapes match.
--
-- Left out of this migration, matching 20260904's own reasoning for
-- Document/Goal/FinanceItem/Person/CustomItem: the mirror-direction guard
-- (blocking Person.userId or Object.userId from being changed out from under
-- an existing Relationship/ObjectRelationship/FieldLink). Object.userId is
-- already pinned by kinesis_object_owner_integrity for every Object-backed
-- model, and Person.userId is already pinned transitively through
-- kinesis_assert_object_attachment on Person itself (changing Person.userId
-- without also moving its Object would already fail that check) -- and no
-- code path in this application updates either column after creation. Adding
-- a second guard for a mutation nothing can currently perform would be
-- defence against a threat model that does not exist yet; if that ever
-- changes, extending kinesis_object_owner_integrity to also see
-- ObjectRelationship/FieldLink references is the same shape of work as this
-- migration, not a redesign.

-- 1. Refuse to enforce an invariant the existing rows already break ---------
CREATE TEMP TABLE "kinesis_relationship_ownership_violations" (detail TEXT) ON COMMIT DROP;

INSERT INTO "kinesis_relationship_ownership_violations" (detail)
SELECT format('Relationship %s is owned by %s but its firstPerson %s is owned by %s', r."id", r."userId", p1."id", p1."userId")
  FROM "Relationship" r JOIN "Person" p1 ON p1."id" = r."firstPersonId" WHERE p1."userId" <> r."userId"
UNION ALL
SELECT format('Relationship %s is owned by %s but its secondPerson %s is owned by %s', r."id", r."userId", p2."id", p2."userId")
  FROM "Relationship" r JOIN "Person" p2 ON p2."id" = r."secondPersonId" WHERE p2."userId" <> r."userId"
UNION ALL
SELECT format('ObjectRelationship %s is owned by %s but its sourceObject %s is owned by %s', orl."id", orl."userId", so."id", so."userId")
  FROM "ObjectRelationship" orl JOIN "Object" so ON so."id" = orl."sourceObjectId" WHERE so."userId" <> orl."userId"
UNION ALL
SELECT format('ObjectRelationship %s is owned by %s but its targetObject %s is owned by %s', orl."id", orl."userId", tgo."id", tgo."userId")
  FROM "ObjectRelationship" orl JOIN "Object" tgo ON tgo."id" = orl."targetObjectId" WHERE tgo."userId" <> orl."userId"
UNION ALL
SELECT format('FieldLink %s: its field %s is owned by %s but its target Object %s is owned by %s', fl."id", of."id", fo."userId", tgo."id", tgo."userId")
  FROM "FieldLink" fl
  JOIN "ObjectField" of ON of."id" = fl."fieldId"
  JOIN "Object" fo ON fo."id" = of."objectId"
  JOIN "Object" tgo ON tgo."id" = fl."targetObjectId"
 WHERE fo."userId" <> tgo."userId";

DO $$
DECLARE
  total BIGINT;
  sample TEXT;
BEGIN
  SELECT count(*) INTO total FROM "kinesis_relationship_ownership_violations";
  IF total > 0 THEN
    SELECT string_agg(detail, E'\n') INTO sample
      FROM (SELECT detail FROM "kinesis_relationship_ownership_violations" ORDER BY detail LIMIT 25) listed;
    RAISE EXCEPTION E'Relationship ownership integrity cannot be enforced: % existing violation(s).\n%\n(at most 25 shown) Resolve these rows, then re-run the migration.', total, sample;
  END IF;
END $$;

-- 2. A Relationship may only connect two Persons it owns ---------------------
CREATE OR REPLACE FUNCTION "kinesis_assert_relationship_ownership"() RETURNS TRIGGER AS $$
DECLARE
  first_owner TEXT;
  second_owner TEXT;
BEGIN
  SELECT "userId" INTO first_owner FROM "Person" WHERE "id" = NEW."firstPersonId";
  IF first_owner IS NULL THEN
    RAISE EXCEPTION 'Person % does not exist, so Relationship % cannot connect to it', NEW."firstPersonId", NEW."id";
  END IF;

  SELECT "userId" INTO second_owner FROM "Person" WHERE "id" = NEW."secondPersonId";
  IF second_owner IS NULL THEN
    RAISE EXCEPTION 'Person % does not exist, so Relationship % cannot connect to it', NEW."secondPersonId", NEW."id";
  END IF;

  IF first_owner IS DISTINCT FROM NEW."userId" OR second_owner IS DISTINCT FROM NEW."userId" THEN
    RAISE EXCEPTION 'Relationship % is owned by % and cannot connect Person % (owned by %) to Person % (owned by %)',
      NEW."id", NEW."userId", NEW."firstPersonId", first_owner, NEW."secondPersonId", second_owner;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "kinesis_assert_relationship_ownership" ON "Relationship";
CREATE TRIGGER "kinesis_assert_relationship_ownership" AFTER INSERT OR UPDATE OF "firstPersonId", "secondPersonId", "userId" ON "Relationship"
FOR EACH ROW EXECUTE FUNCTION "kinesis_assert_relationship_ownership"();

-- 3. An ObjectRelationship may only connect two Objects it owns -------------
CREATE OR REPLACE FUNCTION "kinesis_assert_object_relationship_ownership"() RETURNS TRIGGER AS $$
DECLARE
  source_owner TEXT;
  target_owner TEXT;
BEGIN
  SELECT "userId" INTO source_owner FROM "Object" WHERE "id" = NEW."sourceObjectId";
  IF source_owner IS NULL THEN
    RAISE EXCEPTION 'Object % does not exist, so ObjectRelationship % cannot connect to it', NEW."sourceObjectId", NEW."id";
  END IF;

  SELECT "userId" INTO target_owner FROM "Object" WHERE "id" = NEW."targetObjectId";
  IF target_owner IS NULL THEN
    RAISE EXCEPTION 'Object % does not exist, so ObjectRelationship % cannot connect to it', NEW."targetObjectId", NEW."id";
  END IF;

  IF source_owner IS DISTINCT FROM NEW."userId" OR target_owner IS DISTINCT FROM NEW."userId" THEN
    RAISE EXCEPTION 'ObjectRelationship % is owned by % and cannot connect Object % (owned by %) to Object % (owned by %)',
      NEW."id", NEW."userId", NEW."sourceObjectId", source_owner, NEW."targetObjectId", target_owner;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "kinesis_assert_object_relationship_ownership" ON "ObjectRelationship";
CREATE TRIGGER "kinesis_assert_object_relationship_ownership" AFTER INSERT OR UPDATE OF "sourceObjectId", "targetObjectId", "userId" ON "ObjectRelationship"
FOR EACH ROW EXECUTE FUNCTION "kinesis_assert_object_relationship_ownership"();

-- 4. A FieldLink may only point a field at a target its own account owns ----
-- FieldLink carries no userId of its own -- a Kinesis Link field belongs to
-- whoever owns the object it lives on -- so the question here is whether the
-- field's own object and the target it names agree with each other, not with
-- a third value.
CREATE OR REPLACE FUNCTION "kinesis_assert_field_link_ownership"() RETURNS TRIGGER AS $$
DECLARE
  field_owner TEXT;
  target_owner TEXT;
BEGIN
  SELECT o."userId" INTO field_owner FROM "ObjectField" f JOIN "Object" o ON o."id" = f."objectId" WHERE f."id" = NEW."fieldId";
  IF field_owner IS NULL THEN
    RAISE EXCEPTION 'ObjectField % does not exist, so FieldLink % cannot attach to it', NEW."fieldId", NEW."id";
  END IF;

  SELECT "userId" INTO target_owner FROM "Object" WHERE "id" = NEW."targetObjectId";
  IF target_owner IS NULL THEN
    RAISE EXCEPTION 'Object % does not exist, so FieldLink % cannot target it', NEW."targetObjectId", NEW."id";
  END IF;

  IF field_owner IS DISTINCT FROM target_owner THEN
    RAISE EXCEPTION 'FieldLink % cannot point a field owned by % at Object %, which is owned by %', NEW."id", field_owner, NEW."targetObjectId", target_owner;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "kinesis_assert_field_link_ownership" ON "FieldLink";
CREATE TRIGGER "kinesis_assert_field_link_ownership" AFTER INSERT OR UPDATE OF "fieldId", "targetObjectId" ON "FieldLink"
FOR EACH ROW EXECUTE FUNCTION "kinesis_assert_field_link_ownership"();
