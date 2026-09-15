# KD-027 — Give a To-Do a reminder window

**Status:** Done
**Priority:** Medium
**Tags:** UX / UI, Data Model

## Summary

A dated To-Do says nothing until the day it is due. There is no advance notice of any kind: a to-do due next Friday is silent all week, then appears on Friday alongside everything else that came due that day.

Every other dated object in Kinesis warns first. A document has its own lead time; milestones, relationship dates and custom items each have a configurable one. A To-Do is the only deadline that arrives without warning.

```text
Remind me about to-dos
7 days before

Pay quarterly tax
Due 30 September

  → appears in Upcoming & Due and the bell from 23 September
  → still says "overdue" from 1 October, exactly as it does now
```

## This changes an argued decision, not an oversight

Worth stating plainly, because the code argues the opposite and whoever picks this up will find that argument first.

`getTodoNotificationCandidate` carries an explicit note: a To-Do has no advance stage at all, because ADR-009 is emphatic that capture must not require a deadline, so most to-dos never have a date to look ahead from. It speaks on the day and not before — which is also why it is the one source not silenced by the Reminders switch, since it is never an *advance* notice.

That reasoning is sound but proves a narrower point than it is currently used for. "Most to-dos have no date" justifies **not requiring** a lead time. It does not justify **not offering** one. An undated to-do is untouched by any of this — it has nothing to count back from. The lead time would only ever concern to-dos that already carry a deadline, and those are precisely the ones where the person went out of their way to say when it matters.

Adopting this ticket means rewriting that comment, not deleting it: the "capture must not require a deadline" half stays true and still explains why the field is optional.

## What exists today

* `Todo.dueDate` is optional. `TODO` and `WAITING` are open; `DONE` is closed.
* `TODO_DUE` is raised once `today >= dueDate`, and only for an open to-do.
* There is no `todoReminderLeadDays`, and `todo` is not a member of `ReminderObjectType`.
* `reconcileTodo` takes no `remindersEnabled` argument at all, so `TODO_DUE` survives the Reminders switch.
* The calendar shows a due-date pin, and no reminder pin — there is no window for one to mark.

## Proposed shape

**Config.** A fourth lead-time setting, `todoReminderLeadDays`, alongside the milestone, relationship and custom-item ones.

The policy module was built for exactly this. Adding `todo` to `ReminderObjectType`, to `REMINDER_LEAD_DEFAULTS` and to the field map, plus the matching `UserSettings` column, is the whole extension — every reader already goes through `getReminderLeadDays` and `getReminderWindowStart`.

The Settings row matches the three already there: *Remind me about to-dos — how far ahead of a to-do's due date to start reminding you.*

**Phases.** A to-do gains the two-phase shape the other objects have:

| When | Type |
| --- | --- |
| `dueDate − lead ≤ today < dueDate` | `REMINDER_DUE` |
| `today ≥ dueDate` | `TODO_DUE` |

The second is exactly what happens now. Only the first is new.

## Settings gates

Following the agreed model — In-app notifications governs the bell alone; Reminders governs advance notice and leaves statements of fact alone:

|  | In-app notification is not ticked | reminders is not ticked | `Done` |
| --- | --- | --- | --- |
| Bell — `REMINDER_DUE` (before due) | blocks | blocks | blocks |
| Bell — `TODO_DUE` (due / overdue) | blocks | **survives** | blocks |
| Upcoming & Due — reminder | **survives** | blocks | blocks |
| Upcoming & Due — due / overdue | **survives** | **survives** | blocks |
| Calendar reminder pin | **survives** | blocks | blocks |
| Calendar due-date pin | **survives** | **survives** | **survives**, relabelled `Completed to-do` |
| Needs attention | **survives** | **survives** | blocks |

Nothing that behaves one way today changes. `TODO_DUE` keeps surviving the Reminders switch; the new advance phase is what that switch governs.

**The check must sit inside the candidate builder, not around it.** `reconcileMilestone` and `reconcileCustomItem` pass `remindersEnabled ? candidate : null` from outside, which silences their overdue phase along with the advance one — the inconsistency being corrected separately. The document builder checks inside and suppresses only the advance phase. Follow the document.

## Calendar

The pin machinery needs nothing new: `reminderOpensAt` already accepts a `{ kind: "leadDays" }` lead, and pins are derived from the record rather than read from notification rows, so a to-do's lead-up would be visible ahead of time like every other one.

Two things to get right:

* **Reminders are off by default in the calendar's source filter**, because each dated record already grows a second pin and a month cell shows three items before collapsing. To-do reminder pins inherit that, so they add no crowding until someone asks for them. Nothing to do — but do not "fix" the default while adding this.
* **A lead of zero must not produce a pin.** `reminderOpensAt` with a zero lead returns the due date itself, so the reminder pin would land on the same day as the due-date pin and read as a duplicate of it. Skip the pin when the lead is zero, rather than drawing two marks for one date.

## Upcoming & Due

Today a to-do is listed only once `dueDate <= today`, titled "is due". With a lead it should appear from the window opening, phrased the way milestones and custom items are — "is due soon" before the date, "is due" or "is over its due date" after.

The query currently fetches every dated to-do and filters in JS; it would narrow to `dueDate <= today + lead` like the others, which is also the cheaper query.

## Open questions

**What should the default lead be?**

Two defensible answers with a real trade-off:

* **Zero** — preserves today's behaviour exactly. Nobody's to-dos start warning them a week early because a deploy happened. The cost is a setting that does nothing until found, which is poor discovery.
* **Seven** (or thirty, matching the others) — useful immediately, but silently changes behaviour for every existing dated to-do on the day it ships.

Leaning to zero on the principle that a deploy should not start talking to people. Worth deciding explicitly rather than inheriting 30 from the other three because the constant is already there — a month of advance warning suits a passport renewal and does not suit "call the plumber".

**Global only, or a per-record override?**

A document has its own `prompt` because documents differ enormously in how far ahead they matter. A To-Do is a lightweight capture and probably does not earn per-record configuration. Recommend the global setting alone; see KD-026, which is where per-record reminder control is being thought about.

**How does this interact with KD-025?**

The to-do board introduces richer statuses. A `WAITING` to-do — blocked on someone else — may want different advance treatment from a `TODO` one. Not a blocker, but the two tickets should be read together if they land near each other.

**Does an advance to-do reminder reach Needs attention?**

No. That surface is overdue-only for every object, and a to-do should not be the exception.

## Notes

* Capture must stay dateless. Adding a lead time must not add a required field, a prompt, or a default date to quick capture — ADR-009's promise is that recording something never requires deciding when it is due.
* `getTodoNotificationCandidate` gains a `leadDays` parameter, matching the signatures of the other four builders.
* The engine's comment explaining why to-dos have no lead time has to be rewritten in the same change, or it will read as evidence that this was a mistake.
* Migration is additive: one column with a default, no backfill.
* This makes four lead-time rows in Settings. The section is becoming a list of near-identical controls, and may want grouping or a single "reminder defaults" block once this lands.

## Acceptance criteria

* A configurable to-do lead time exists in Settings and defaults to a value that leaves current behaviour unchanged.
* A dated, open to-do raises `REMINDER_DUE` from `dueDate − lead`, and `TODO_DUE` from `dueDate`, exactly as it does now.
* Turning Reminders off silences the advance phase and leaves `TODO_DUE` speaking.
* An undated to-do is unaffected in every respect.
* A completed to-do raises nothing, and keeps its relabelled calendar due-date pin.
* A zero lead produces no calendar reminder pin.

## Implementation notes

Before implementing, this ticket was re-verified against the current
codebase (it was written before several rounds of unrelated refactoring)
to check every code-level claim still held. Everything did, with one
naming drift: the ticket refers to `reconcileMilestone`/`reconcileCustomItem`/
`reconcileTodo` functions that no longer exist under those names —
`lib/notifications/engine.ts` was refactored from a reconcile-and-store
pass into pure `getXNotificationCandidate` builders plus one
`collectNotifications` reader sometime after this was written. The
*behaviour* the ticket describes (document gates `remindersEnabled`
inside its own builder; milestone/customItem gate it from outside, in
`collectNotifications`) survived that refactor exactly intact, so the
plan itself needed no changes — only this note, so nobody goes looking
for a function that isn't there.

Shipped as proposed, following the document builder's inside-the-gate
pattern for the new `REMINDER_DUE` phase rather than the milestone/
custom-item outside-the-gate one:

* `UserSettings.todoReminderLeadDays` (migration
  `20260930000000_todo_reminder_lead_days`), defaulting to 0 — chosen over
  30 specifically so this migration changes no existing to-do's visible
  behaviour.
* `todo` added to `ReminderObjectType` in `lib/reminders/policy.ts`.
* `getTodoNotificationCandidate` (`lib/notifications/engine.ts`) gained
  `leadDays` and `remindersEnabled` parameters; `collectNotifications`
  narrows its to-do query to the lead window and passes both through.
* `getUpcomingAndDue` (`lib/data/upcoming.ts`) narrows its to-do query the
  same way and titles a to-do "is due soon" before the due date, keeping
  the pre-existing "is due" wording unchanged for due-today and overdue —
  a deliberate choice to preserve current wording exactly for the states
  that already existed, rather than adopting milestone's "over its due
  date" split, which would have been a small but avoidable wording change.
* `getCalendarItems` (`lib/data/calendar.ts`) adds a lead-up pin for an
  open to-do only, skipped entirely when the lead is zero (per the
  acceptance criterion) since `reminderOpensAt` would otherwise land it on
  the same day as the due-date pin.
* Settings gained a fourth "Remind me about to-dos" row
  (`app/(app)/settings/SettingsForm.tsx`), validated the same way as the
  other three (`app/(app)/settings/actions.ts`).
* ADR-010 updated: the To-do section now has the same two-numbered-item
  shape as Milestones and Custom item, with the settings-gate table
  gaining `REMINDER_DUE` and the calendar reminder pin row.

Verified with a full typecheck, lint, the full unit suite (712 tests,
including new coverage for the lead-time policy, the candidate builder's
advance phase and its `remindersEnabled` gating, the narrowed
`collectNotifications` query, the calendar's new reminder pin and its
zero-lead skip, and settings validation), the full integration suite (363
tests, including new `getUpcomingAndDue` coverage for a to-do inside its
lead window and for reminders-off-but-overdue-survives), and a production
`next build`. New behaviour was verified red-then-green against a
reverted copy of each changed file before being accepted.

## Related

* ADR-010 — Notification and Reminders Awareness Surfaces; updated in the
  same change with the To-do section this ticket implements.
* KD-026 — Document no-reminder option; a similarly-shaped per-record
  reminder question, referenced above as the place per-record (rather
  than global) to-do reminder control would belong, if ever wanted.
* KD-025 — To-do board; a `WAITING` to-do may eventually want different
  advance treatment from a `TODO` one, not addressed here.
