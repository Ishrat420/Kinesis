-- KD-032, option 4a. Five tables carry a set of nullable FKs with an
-- application-level convention that exactly one is ever set -- "referential
-- integrity alone", as the schema comments put it. Every known write path
-- already honours this (reconcileChildren for the three relationship child
-- tables; linkFor in lib/data/notifications.ts and app/actions.ts, which each
-- spread exactly one key into the create call, for NotificationRead and
-- AttentionDismissal), but nothing in the database has ever required it. This
-- makes that convention a fact the database enforces rather than a promise
-- every future write path has to remember to keep.
--
-- num_nonnulls() is a built-in aggregate over its arguments, not a table
-- column count, so this reads directly as "exactly one of these is set"
-- without a CASE-per-column sum.

-- 1. Refuse to enforce an invariant the existing rows already break ---------
CREATE TEMP TABLE "kinesis_exactly_one_parent_violations" (detail TEXT) ON COMMIT DROP;

INSERT INTO "kinesis_exactly_one_parent_violations" (detail)
SELECT format('ConnectionPractice %s has %s parents set (relationshipId, selfPersonId), expected exactly 1', "id", num_nonnulls("relationshipId", "selfPersonId"))
  FROM "ConnectionPractice" WHERE num_nonnulls("relationshipId", "selfPersonId") <> 1
UNION ALL
SELECT format('RelationshipReflection %s has %s parents set (relationshipId, selfPersonId), expected exactly 1', "id", num_nonnulls("relationshipId", "selfPersonId"))
  FROM "RelationshipReflection" WHERE num_nonnulls("relationshipId", "selfPersonId") <> 1
UNION ALL
SELECT format('RelationshipImportantDate %s has %s parents set (relationshipId, selfPersonId), expected exactly 1', "id", num_nonnulls("relationshipId", "selfPersonId"))
  FROM "RelationshipImportantDate" WHERE num_nonnulls("relationshipId", "selfPersonId") <> 1
UNION ALL
SELECT format('NotificationRead %s has %s targets set (documentId, milestoneId, relationshipDateId, customItemId, todoId), expected exactly 1', "id", num_nonnulls("documentId", "milestoneId", "relationshipDateId", "customItemId", "todoId"))
  FROM "NotificationRead" WHERE num_nonnulls("documentId", "milestoneId", "relationshipDateId", "customItemId", "todoId") <> 1
UNION ALL
SELECT format('AttentionDismissal %s has %s targets set (documentId, customItemId, todoId), expected exactly 1', "id", num_nonnulls("documentId", "customItemId", "todoId"))
  FROM "AttentionDismissal" WHERE num_nonnulls("documentId", "customItemId", "todoId") <> 1;

DO $$
DECLARE
  total BIGINT;
  sample TEXT;
BEGIN
  SELECT count(*) INTO total FROM "kinesis_exactly_one_parent_violations";
  IF total > 0 THEN
    SELECT string_agg(detail, E'\n') INTO sample
      FROM (SELECT detail FROM "kinesis_exactly_one_parent_violations" ORDER BY detail LIMIT 25) listed;
    RAISE EXCEPTION E'Exactly-one-parent cannot be enforced: % existing violation(s).\n%\n(at most 25 shown) Resolve these rows, then re-run the migration.', total, sample;
  END IF;
END $$;

-- 2. Enforce it ---------------------------------------------------------
ALTER TABLE "ConnectionPractice" ADD CONSTRAINT "ConnectionPractice_exactly_one_parent" CHECK (num_nonnulls("relationshipId", "selfPersonId") = 1);
ALTER TABLE "RelationshipReflection" ADD CONSTRAINT "RelationshipReflection_exactly_one_parent" CHECK (num_nonnulls("relationshipId", "selfPersonId") = 1);
ALTER TABLE "RelationshipImportantDate" ADD CONSTRAINT "RelationshipImportantDate_exactly_one_parent" CHECK (num_nonnulls("relationshipId", "selfPersonId") = 1);
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_exactly_one_parent" CHECK (num_nonnulls("documentId", "milestoneId", "relationshipDateId", "customItemId", "todoId") = 1);
ALTER TABLE "AttentionDismissal" ADD CONSTRAINT "AttentionDismissal_exactly_one_parent" CHECK (num_nonnulls("documentId", "customItemId", "todoId") = 1);
