-- A goal's target date and a milestone's due date were written at
-- T23:59:59.999Z, the last millisecond of the day, instead of UTC midnight
-- like every other calendar date in the app (KD-031; the same defect class
-- already fixed for custom items in 20260914000000_custom_item_due_date_midnight).
-- Nothing that read them back was ever fooled -- the two comparison sites that
-- cared had to be written as instant comparisons rather than the shared
-- day-comparison helper, specifically to tolerate this.
--
-- Existing rows are truncated to the day they were always meant to name. This
-- only ever moves a timestamp backward by up to a millisecond short of a day;
-- it cannot change which calendar day a target or due date falls on.
UPDATE "Goal" SET "targetDate" = date_trunc('day', "targetDate") WHERE "targetDate" IS NOT NULL;
UPDATE "Milestone" SET "dueDate" = date_trunc('day', "dueDate") WHERE "dueDate" IS NOT NULL;
