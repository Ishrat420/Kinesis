-- The previous migration (20260928000000_template_is_starter) added
-- isStarter, defaulting every *existing* row -- including a template
-- already correctly seeded under the old name-based check -- to false.
-- That left the deployed ensureStarterTemplate (now keyed on isStarter,
-- not name) finding none and creating a second "General Record": exactly
-- one duplicate per owner who had already been backfilled once before this
-- column existed.
--
-- This is a one-time cleanup for that specific transition, not a general
-- dedup pass: it only removes a template matching the orphaned duplicate's
-- exact signature -- named "General Record", not itself marked isStarter,
-- never linked to a module or used by any object, carrying precisely the
-- four fields ensureStarterTemplate seeds and no others, for an owner who
-- already has a real isStarter template. Nothing broader is touched; an
-- owner's own template that merely happens to share the name but not the
-- exact field shape, or that's already in use, survives untouched.
DELETE FROM "Template" t
WHERE t."isStarter" = false
  AND t.name = 'General Record'
  AND EXISTS (SELECT 1 FROM "Template" starter WHERE starter."userId" = t."userId" AND starter."isStarter" = true)
  AND NOT EXISTS (SELECT 1 FROM "CustomModule" cm WHERE cm."templateId" = t.id)
  AND NOT EXISTS (SELECT 1 FROM "Object" o WHERE o."templateId" = t.id)
  AND (SELECT COUNT(*) FROM "TemplateField" tf WHERE tf."templateId" = t.id) = 4
  AND (
    SELECT COUNT(*) FROM "TemplateField" tf WHERE tf."templateId" = t.id AND (
      (tf.label = 'Due date' AND tf.type = 'DATE' AND tf."isDueDate" = true)
      OR (tf.label = 'Reference' AND tf.type = 'LINK')
      OR (tf.label = 'Related' AND tf.type = 'KINESIS_LINK')
      OR (tf.label = 'Notes' AND tf.type = 'TEXT' AND tf.multiline = true)
    )
  ) = 4;

-- Belt and suspenders: a database-level guarantee that an owner can never
-- have more than one isStarter template, whatever future application code
-- does. A plain Prisma `@@unique` can't express "unique only when true" (it
-- would also cap every owner at one *non*-starter template, which is the
-- entire point of the feature), so this exists only here, as a partial
-- index -- see the comment on Template.isStarter in schema.prisma. Placed
-- after the cleanup above so this migration itself fails loudly, instead of
-- silently leaving a duplicate, if any deployment's data doesn't match the
-- exact signature the DELETE above expects.
CREATE UNIQUE INDEX "Template_one_starter_per_user" ON "Template" ("userId") WHERE "isStarter" = true;
