-- KD-050: converts every ad-hoc Kinesis Link Custom Field (an ObjectField of
-- type KINESIS_LINK with templateFieldId null) into one CUSTOM-type Kinesis
-- Link (ObjectRelationship) per target, using the field's own label as the
-- customLabel verbatim -- no rewording, no best-effort match to the real DDL
-- types (SUPPORTS/BLOCKS/etc). Template-defined Kinesis Link fields
-- (templateFieldId set -- e.g. the starter template's built-in "Related"
-- field) are deliberately untouched: this only ever looks at
-- templateFieldId IS NULL.
--
-- ON CONFLICT ... DO NOTHING relies on the previous migration's partial
-- unique index rather than reimplementing that check by hand: a target that
-- would collide with an already-existing Kinesis Link of the same
-- (userId, pairKey, customLabel) -- including two ad-hoc fields on the same
-- record that happen to share the exact same label and target -- is simply
-- not duplicated, since the existing row already represents that same fact.
INSERT INTO "ObjectRelationship" ("id", "sourceObjectId", "targetObjectId", "type", "customLabel", "pairKey", "userId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  f."objectId",
  fl."targetObjectId",
  'CUSTOM',
  f."label",
  LEAST(f."objectId", fl."targetObjectId") || ':' || GREATEST(f."objectId", fl."targetObjectId"),
  o."userId",
  now(),
  now()
FROM "ObjectField" f
JOIN "FieldLink" fl ON fl."fieldId" = f."id"
JOIN "Object" o ON o."id" = f."objectId"
WHERE f."type" = 'KINESIS_LINK' AND f."templateFieldId" IS NULL
ON CONFLICT ("userId", "pairKey", "customLabel") WHERE "type" = 'CUSTOM' DO NOTHING;

-- Every ad-hoc Kinesis Link Custom Field converted above -- successfully or
-- as a deduped no-op, either way its meaning now lives in
-- ObjectRelationship -- is removed; its FieldLink rows cascade with it. A
-- field with zero targets (every target it once pointed at was already
-- deleted elsewhere) has nothing left to preserve and is removed the same
-- way.
DELETE FROM "ObjectField" WHERE "type" = 'KINESIS_LINK' AND "templateFieldId" IS NULL;
