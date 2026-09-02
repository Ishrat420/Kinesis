-- Milestones previously had no lead time at all: the notification engine, the
-- dashboard's "due soon" list and the "Upcoming & Due" widget each surfaced a
-- milestone only once it was already overdue (or, for "due soon", used a
-- hardcoded one-month lookahead unrelated to the other two). This column is
-- the first of a per-object-type family of user-configurable lead times; see
-- lib/reminders/policy.ts for how it is resolved and defaulted.
ALTER TABLE "UserSettings" ADD COLUMN "milestoneReminderLeadDays" INTEGER NOT NULL DEFAULT 30;
