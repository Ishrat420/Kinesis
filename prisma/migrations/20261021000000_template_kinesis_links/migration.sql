-- KD-023: every Kinesis Link now lives in ObjectRelationship, so it shows up
-- from both sides. Two producers still wrote the older ObjectField/FieldLink
-- storage, which nothing reads from the target's side:
--
--   1. Template Kinesis Link field values on custom items (e.g. the starter
--      template's "Related" field). KD-050 deliberately left these alone.
--   2. Ad-hoc Kinesis Link custom fields added while *creating* a document or
--      custom item, which KD-050 kept on the old batched storage because
--      there's no object to link from yet -- and which the read views then
--      hide.
--
-- Both become ObjectRelationship rows here, and their ObjectField rows go.

-- 1. A link can belong to a template field.
ALTER TABLE "ObjectRelationship" ADD COLUMN "templateFieldId" TEXT;
ALTER TABLE "ObjectRelationship" ADD CONSTRAINT "ObjectRelationship_templateFieldId_fkey"
  FOREIGN KEY ("templateFieldId") REFERENCES "TemplateField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ObjectRelationship_templateFieldId_idx" ON "ObjectRelationship"("templateFieldId");

-- 2. Uniqueness. Free-standing CUSTOM links stay unique per pair and label;
-- template-owned links are unique per item, target and field instead. Keyed
-- on the direction, not the pair, so item A's "Related" -> B and item B's
-- "Related" -> A are two different facts, not a collision.
DROP INDEX "ObjectRelationship_custom_pair_label_key";
CREATE UNIQUE INDEX "ObjectRelationship_custom_pair_label_key"
  ON "ObjectRelationship" ("userId", "pairKey", "customLabel")
  WHERE "type" = 'CUSTOM' AND "templateFieldId" IS NULL;
CREATE UNIQUE INDEX "ObjectRelationship_template_field_link_key"
  ON "ObjectRelationship" ("sourceObjectId", "targetObjectId", "templateFieldId")
  WHERE "templateFieldId" IS NOT NULL;

-- 3. Template field values -> template-owned links, labelled with the field's
-- own name. createdAt is staggered by the old position so the field keeps
-- listing its targets in the same order. Self-links and cross-account
-- targets are skipped: neither is a link the app would ever create.
INSERT INTO "ObjectRelationship" ("id", "sourceObjectId", "targetObjectId", "type", "customLabel", "templateFieldId", "pairKey", "userId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  f."objectId",
  fl."targetObjectId",
  'CUSTOM',
  tf."label",
  tf."id",
  LEAST(f."objectId", fl."targetObjectId") || ':' || GREATEST(f."objectId", fl."targetObjectId"),
  source."userId",
  now() + (fl."position" * interval '1 millisecond'),
  now()
FROM "ObjectField" f
JOIN "TemplateField" tf ON tf."id" = f."templateFieldId"
JOIN "FieldLink" fl ON fl."fieldId" = f."id"
JOIN "Object" source ON source."id" = f."objectId"
JOIN "Object" target ON target."id" = fl."targetObjectId"
WHERE f."type" = 'KINESIS_LINK' AND f."templateFieldId" IS NOT NULL
  AND fl."targetObjectId" <> f."objectId"
  AND target."userId" = source."userId"
ON CONFLICT DO NOTHING;

-- 4. Ad-hoc link fields created since KD-050 (on create forms) -> CUSTOM
-- links labelled with the field's name, exactly as KD-050's migration did.
-- A link that already exists with the same label is the same fact.
INSERT INTO "ObjectRelationship" ("id", "sourceObjectId", "targetObjectId", "type", "customLabel", "pairKey", "userId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  f."objectId",
  fl."targetObjectId",
  'CUSTOM',
  f."label",
  LEAST(f."objectId", fl."targetObjectId") || ':' || GREATEST(f."objectId", fl."targetObjectId"),
  source."userId",
  now(),
  now()
FROM "ObjectField" f
JOIN "FieldLink" fl ON fl."fieldId" = f."id"
JOIN "Object" source ON source."id" = f."objectId"
JOIN "Object" target ON target."id" = fl."targetObjectId"
WHERE f."type" = 'KINESIS_LINK' AND f."templateFieldId" IS NULL
  AND fl."targetObjectId" <> f."objectId"
  AND target."userId" = source."userId"
ON CONFLICT DO NOTHING;

-- 5. Every Kinesis Link value now lives in ObjectRelationship; the old rows go
-- (their FieldLink rows cascade with them).
DELETE FROM "ObjectField" WHERE "type" = 'KINESIS_LINK';
