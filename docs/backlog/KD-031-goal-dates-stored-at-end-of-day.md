# KD-031 — Goal and milestone dates are stored at end of day, not UTC midnight

**Status:** Done
**Priority:** Medium
**Tags:** Data Model, Technical Debt, Architecture

## Decision

**Option 1 — migrated to UTC midnight.**

`optionalDate` (`app/(app)/goals/actions.ts`) now returns whatever
`parseDateOnly` gives it, with no end-of-day shift, and a migration
(`20260927000000_goal_dates_midnight`) truncated every existing
`Goal.targetDate` and `Milestone.dueDate` to the start of the day they were
always meant to name, following the exact `date_trunc('day', ...)` precedent
`20260914000000_custom_item_due_date_midnight` set for custom items.

The `parseDateOnly`-adoption half of this was already done (`01c9abc`, before
this ticket was reopened) while the end-of-day shift stayed — so the "one
decision, not two" framing in the original write-up below was wrong by the
time this was picked up; the two had already been split, and only the storage
half was left.

The open question this ticket raised — should `calculateGoalHealth`'s
`daysRemaining` count the target day as a remaining day (`+1`)? — resolves
itself once the existing unit tests are read as intent rather than as
incidental coverage: `tests/unit/goal-health.test.ts` already asserted
*"returns null on the target date itself, when zero days remain"* by passing
`targetDate` and `today` as the same plain instant, with no end-of-day
adjustment. That test was already exercising the pure function's contract at
the exact boundary this ticket is about, and its answer was already "no
`+1`" — zero days remaining is exactly zero, not one. `calculateGoalHealth`
needed no code change at all; the storage fix simply makes production match
what the pure function's own tests always said was correct. The practical
effect: a goal's pace tracking now stops at the start of its due day rather
than continuing through nearly all of it, which is the correct reading of
"zero days remaining," not a regression to work around.

Every other reader in the table below needed no logic change, only comment
updates where they explained the old instant-comparison workaround
(`lib/goals/active.ts`) — confirmed by reading each one and, for
`activeGoalWhere`/`lapsedGoalWhere`/`effectiveStatus`/`archiveLapsedGoals`,
by the existing and updated tests continuing to pass unchanged in shape.

Tests added: `tests/integration/goals/goal-date-midnight.test.ts`, exercising
`createGoalAction`, `updateGoalTargetDateAction`, `addMilestoneAction`,
`updateMilestoneAction` and `updateMilestoneDueDateAction` against the real
database and asserting the stored instant is exactly UTC midnight. Existing
tests that hard-coded the end-of-day instant
(`tests/unit/goal-lapse.test.ts`, `tests/unit/validation/action-feedback.test.ts`,
`tests/integration/goals/lapsed-goal-archiving.test.ts`) were updated to
midnight fixtures; `tests/unit/goal-health.test.ts` gained a comment noting
why its existing zero-days-remaining assertion is the KD-031 answer, not
incidental.

Verified locally: a fresh `migrate deploy` applies cleanly; a scratch database
seeded with pre-migration end-of-day rows (`2030-06-01T23:59:59.999Z` /
`2030-03-15T23:59:59.999Z`) had them truncated to midnight on the same
calendar day after the migration ran; `prisma migrate diff` reports no schema
drift; full unit (686) and integration (344) suites pass; typecheck, lint and
production build are clean.

## Summary

`lib/dates/index.ts` states the rule the whole application is built on:

> Kinesis stores calendar dates — expiry, issue, due and target dates — at UTC midnight, where they represent a day rather than an instant.

Goals do not follow it. `optionalDate` in `app/(app)/goals/actions.ts` stores a goal's `targetDate` and every milestone's `dueDate` at `T23:59:59.999Z` — the last millisecond of the day rather than its first. Documents, custom items and to-dos all store midnight.

Nothing is visibly broken today. The cost is that one field family reads differently from every other, and the two places that compare it had to be written as instant comparisons with a comment explaining why the shared day-comparison helper is not being used.

## What exists today

Stored at end of day by `optionalDate`:

* `Goal.targetDate`
* `Milestone.dueDate`

Readers, and how each copes:

| Reader | Behaviour |
| --- | --- |
| `activeGoalWhere` / `lapsedGoalWhere` (`lib/goals/active.ts`) | `targetDate >= today` / `< today`, `today` at UTC midnight. Correct under either storage. |
| `effectiveStatus` (`lib/goals/format.ts`) | `targetDate.getTime() < today.getTime()`. Correct under either storage. |
| `archiveLapsedGoals` (`lib/data/goal-status.ts`) | `targetDate: { lt: today }`. Correct under either storage. |
| `calculateGoalHealth` (`lib/goals/health.ts`) | `daysRemaining = (targetDate - today) / DAY_MS`. **Reads ~1 day larger than it would at midnight.** |
| `beforeTargetDate` and the milestone/target checks (`app/(app)/goals/actions.ts`) | Compares two end-of-day values against each other; consistent as long as both move together. |
| `lib/data/calendar.ts` | Keys by `toISOString().slice(0, 10)`, so the same day either way. |
| Everything going through `lib/dates` (`formatFutureDate`, `differenceInCalendarDays`, …) | Normalises with `startOfUtcDay` first, so unaffected. |

The storage is partly acknowledged already: the comment on `activeGoalWhere` says "a target date is stored at the last millisecond of its day" and explains why the query compares days rather than the clock. What has never been written down is *why goals store it that way when nothing else does*, or whether that was a decision at all.

## Why this is worth settling

* It is the same defect class that was fixed for custom items in "Store a custom item's due date at midnight, not noon", and for finance in the date-validation work. Goals are the last holdout, and a reader who learns the midnight rule from `lib/dates` will be wrong about goals.
* `optionalDate` also carries its own `/^\d{4}-\d{2}-\d{2}$/` check rather than calling `parseDateOnly`, which is now the single parser everywhere else (KD work on documents and finance closed the last two). It cannot adopt `parseDateOnly` while it needs an end-of-day result, so the two are one decision, not two.
* Two comparison sites carry comments explaining why they cannot use `differenceInCalendarDays`. That explanation stops being needed if the storage is aligned.

## Options

### 1. Migrate to UTC midnight

Change `optionalDate` to `parseDateOnly`, and migrate existing `Goal.targetDate` and `Milestone.dueDate` rows back to midnight of the same day.

Behaviour-preserving at every reader in the table above **except `calculateGoalHealth`**, whose `daysRemaining` currently includes the target day almost in full and would lose most of a day. That shifts pace and "at risk" arithmetic slightly — needs a decision on whether `daysRemaining` should count the target day as remaining (`+1`) or not, and the answer written down rather than falling out of the storage format.

The migration itself is a single `UPDATE` per table, and both fields are set by the same helper, so they move together and the milestone-versus-target comparisons stay consistent.

### 2. Keep end of day, and make it a stated rule

Amend the invariant in `lib/dates/index.ts` to say that a *deadline* is stored at the end of its day while a *calendar date* is stored at the start, and mark the goal fields at the type level so the difference cannot be lost. The two instant comparisons stay, but stop looking like accidents.

Cheaper, and arguably the more honest model — "due by the end of the 7th" is what a deadline means. The cost is two storage conventions to hold in mind for the life of the project, and a `parseDateOnly` that cannot be used for two of the four date fields.

### 3. Leave it

Viable — nothing is broken. It stays a trap for the next person who writes a goal-date comparison, and the v1.2.0 consistency goal is exactly the argument against it.

## Open questions

* Should `daysRemaining` in goal health count the target day as a remaining day? Answer this before choosing, since it decides how much option 1 actually changes.
* Was end-of-day storage a deliberate choice for deadline semantics, or did it start as a way to make a goal stay Active through its target day (which midnight storage plus `gte` already achieves)?
* If option 2 wins, does `CustomItem.dueDate` — a deadline, and recently moved *to* midnight — belong on the deadline side of the rule instead? The two decisions would then contradict each other.

## Related

* "Store a custom item's due date at midnight, not noon" — the same fix, already applied to custom items.
* "Parse document and finance dates through the shared parseDateOnly" — closed the last two hand-rolled date parsers; `optionalDate` is the remaining one.
* KD-028 — goal lapse awareness; depends on when a goal is considered lapsed, which is this comparison.
