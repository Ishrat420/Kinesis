-- KD-008 / ADR-009. A standalone To-Do is an action the user records before
-- deciding where it belongs. It is a sixth Object-backed model rather than a
-- table of its own kind, so "concerns Passport Somalia" is an ObjectRelationship
-- like any other link, and a To-Do is searchable, linkable and deletable through
-- the machinery every other module already uses.
--
-- Requires 20260905000000_todo_object_type, which commits the 'TODO' enum value.

CREATE TYPE "TodoStatus" AS ENUM ('TODO', 'WAITING', 'DONE');

CREATE TABLE "Todo" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "status"      "TodoStatus" NOT NULL DEFAULT 'TODO',
    "dueDate"     TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "userId"      TEXT NOT NULL,
    "objectId"    TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Todo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Todo_objectId_key" ON "Todo"("objectId");
CREATE INDEX "Todo_userId_status_dueDate_idx" ON "Todo"("userId", "status", "dueDate");

ALTER TABLE "Todo" ADD CONSTRAINT "Todo_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_objectId_fkey"
  FOREIGN KEY ("objectId") REFERENCES "Object"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 1. One enumeration of the Object-backed models, instead of three ------------
-- 20260903000000 and 20260904000000 each listed every model inline: the name
-- check, the type check and the owner check all asked "what is attached to this
-- Object?" and each answered it with its own copy of the same UNION. A sixth
-- model would have meant editing three lists and hoping they stayed in step.
--
-- They ask one question, so they now share one answer. This function is the
-- single place a new Object-backed model has to be registered; the three
-- triggers below read from it and need no further change.
--
-- CustomItem is owned through the module holding it, which is why ownership is
-- resolved here rather than assumed to be a "userId" column on every table.
CREATE OR REPLACE FUNCTION "kinesis_object_attachment"(p_object_id TEXT)
RETURNS TABLE (
  record_table TEXT,
  record_type "KinesisObjectType",
  record_owner TEXT,
  record_name TEXT
) LANGUAGE sql STABLE AS $$
  SELECT 'Document'::TEXT, 'DOCUMENT'::"KinesisObjectType", d."userId", d."name"
    FROM "Document" d WHERE d."objectId" = p_object_id
  UNION ALL
  SELECT 'Goal', 'GOAL', g."userId", g."name"
    FROM "Goal" g WHERE g."objectId" = p_object_id
  UNION ALL
  SELECT 'FinanceItem', 'FINANCE_ITEM', f."userId", f."name"
    FROM "FinanceItem" f WHERE f."objectId" = p_object_id
  UNION ALL
  SELECT 'Person', 'PERSON', p."userId", p."name"
    FROM "Person" p WHERE p."objectId" = p_object_id
  UNION ALL
  SELECT 'CustomItem', 'CUSTOM_ITEM', m."userId", i."name"
    FROM "CustomItem" i JOIN "CustomModule" m ON m."id" = i."moduleId" WHERE i."objectId" = p_object_id
  UNION ALL
  SELECT 'Todo', 'TODO', t."userId", t."name"
    FROM "Todo" t WHERE t."objectId" = p_object_id
  LIMIT 1;
$$;

-- 2. The three Object-side invariants, now reading that one answer ------------
-- Behaviour is unchanged; only the duplication is gone. Each still refuses the
-- write rather than repairing it, so a caller never silently loses a value.
CREATE OR REPLACE FUNCTION "kinesis_object_type_integrity"() RETURNS TRIGGER AS $$
DECLARE
  attachment RECORD;
BEGIN
  SELECT * INTO attachment FROM "kinesis_object_attachment"(NEW."id");
  IF FOUND AND attachment.record_type <> NEW."type" THEN
    RAISE EXCEPTION 'Object % has a % record attached, so its type cannot become %', NEW."id", attachment.record_type, NEW."type";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "kinesis_object_owner_integrity"() RETURNS TRIGGER AS $$
DECLARE
  attachment RECORD;
BEGIN
  SELECT * INTO attachment FROM "kinesis_object_attachment"(NEW."id");
  IF FOUND AND attachment.record_owner IS DISTINCT FROM NEW."userId" THEN
    RAISE EXCEPTION 'Object % has a % owned by %, so it cannot move to %', NEW."id", attachment.record_table, attachment.record_owner, NEW."userId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- An Object whose attachment is missing, or is not of the type the Object
-- claims, has no canonical name to be checked against -- the same state the
-- previous per-type lookup expressed by finding no row.
CREATE OR REPLACE FUNCTION "kinesis_object_name_integrity"() RETURNS TRIGGER AS $$
DECLARE
  attachment RECORD;
BEGIN
  SELECT * INTO attachment FROM "kinesis_object_attachment"(NEW."id");
  IF NOT FOUND OR attachment.record_type <> NEW."type" THEN
    RAISE EXCEPTION 'Object % claims type % but no such record is attached, so it has no name to keep', NEW."id", NEW."type";
  END IF;

  -- quote_literal rather than %L: RAISE reads % as its only placeholder, so the
  -- L in the previous message's %L was printed as a trailing letter on the name.
  IF NEW."name" IS DISTINCT FROM attachment.record_name THEN
    RAISE EXCEPTION 'Object.name is derived from the % it belongs to: refusing to name Object % % instead of %', NEW."type", NEW."id", quote_literal(NEW."name"), quote_literal(attachment.record_name);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Todo joins the invariants every other Object-backed model already has ----
-- Named as they are on the other five: kinesis_assert_object_attachment sorts
-- before kinesis_sync_object_name, and PostgreSQL fires same-event triggers in
-- name order, so a bad attachment is rejected before a name is projected onto it.
CREATE TRIGGER "kinesis_assert_object_attachment" AFTER INSERT OR UPDATE OF "objectId", "userId" ON "Todo"
FOR EACH ROW EXECUTE FUNCTION "kinesis_assert_object_attachment"('TODO', 'row');

CREATE TRIGGER "kinesis_sync_object_name" AFTER INSERT OR UPDATE OF "name", "objectId" ON "Todo"
FOR EACH ROW EXECUTE FUNCTION "kinesis_sync_object_name"();
