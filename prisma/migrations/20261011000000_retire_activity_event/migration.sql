-- Retires ActivityEvent (KD-048 Phase 2): the dashboard's "Recent activity"
-- widget now reads ObjectEvent instead (lib/data/object-event-history.ts's
-- getRecentActivity), and every write call site (documents/goals/todos/
-- finance/custom-modules actions, the quick-capture conversion path, and
-- Relationships' person add/edit, which now records ITEM_CREATED/
-- FIELD_CHANGED on ObjectEvent the same way) has moved off it. Dropping the
-- table also drops its own FK to User.
DROP TABLE "ActivityEvent";
