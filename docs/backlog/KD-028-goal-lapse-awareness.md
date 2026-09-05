# KD-028 — Goal lapse awareness

**Status:** Idea
**Priority:** Medium
**Tags:** UX / UI, Architecture, Needs Research

## Summary

A goal whose target date passes is archived automatically, and nothing says so. The goal leaves Goals at risk, its unfinished milestones stop appearing in Needs Attention and Upcoming & Due, they stop counting toward the Milestones tile, and their reminder pins disappear from the calendar. All of it happens on a page load, silently.

The intent behind the quiet is right — a goal is a high-level thing, and the low-level nagging belongs to milestones and to-dos. But "we don't pester you" and "we act on your behalf without telling you" are different policies, and only the first one was decided.

```text
Move house
Target date 12 June 2026, 3 milestones outstanding

  13 June, on the next page load:
  → status becomes Archived
  → drops out of Goals at risk
  → its 3 unfinished milestones leave Needs Attention and Upcoming & Due
  → their reminder pins vanish from the calendar
  → nothing is said, anywhere
```

## What exists today

* `archiveLapsedGoals` sets `status: "Archived"` on any Active goal whose `targetDate` has passed. It runs inside `getGoalDashboardSummary`, so a dashboard visit triggers it.
* `activeGoalWhere` treats such a goal as inactive from the moment the date passes, whether or not the column has caught up. Every reminder-side query goes through it, which is what makes the effect immediate and total.
* **Milestones are not modified.** They are not completed, archived or deleted. They simply stop being counted.
* The calendar still draws the goal's `"{name} target"` item — the goal query there has no status filter — but no reminder pin, and never had one.
* `NotificationType` has no goal member, and `getUpcomingAndDue` has no goal query.

## Why this is not simply "add a notification"

Every notification in the table today is **reconciled state**: the engine rebuilds a candidate from the record and deletes any row that no longer matches. A lapse is an **event** — it happened once, on a day, and there is no ongoing condition to recompute.

Worse, `archiveLapsedGoals` writes the status in the same request, so by the next reconcile the "Active but past its target" condition is already false. A naive `GOAL_ARCHIVED` row would be deleted as stale, possibly before it was ever seen.

Making it work in the bell means exempting one row type from the delete pass — a genuinely new shape for that table. That cost is what makes the alternatives below worth weighing first.

## Options

### 1. A Needs Attention row

The existing "a date passed, you should look" surface, and the best structural fit:

* It is **derived from current state** (archived, target date passed, unfinished milestones remain), so there is no event row to write once and protect.
* It already has **dismissal**, and the key shape `<kind>:<id>:<yyyy-mm-dd>` maps onto this exactly. `goal:<id>:<targetDate>` means: dismiss it and it stays gone; give the goal a new target date and the key stops matching, so a second lapse returns it. The FK cascade and migration pattern already exist.

Per KD-017's precedent, the row should carry specific actions — *Give it a new target date* and *Keep archived* — rather than a bare Dismiss.

**Cost.** Needs Attention currently means strictly "overdue", and its copy says so. This widens it to "past its date, and here is what that changed". Defensible, but a deliberate widening with copy to match.

### 2. An activity feed entry

`ActivityEvent` is append-only, which is the shape this event actually wants, and `getActivityForHref` lets the goal's own page show the lapse in its history permanently. Adding `Archived` to the existing `Added | Updated | Completed | Converted` actions is a natural extension.

It is a log, not a prompt — low salience, and its action/module/object shape carries no room to explain a consequence. Good as the permanent record, never as the only channel.

**Note.** `addActivity` calls `requireKinesisUser()`, so it needs a request context. Fine where `archiveLapsedGoals` runs today; if the lapse ever moves to the cron, the userId has to be passed in.

### 3. In place, on the goal and in the goals list

The status chip already reflects the lapse through `effectiveStatus`. Missing are the **distinction** (archived by you, versus archived because the date passed) and the **consequence** ("3 unfinished milestones no longer remind you"), with the remedy alongside.

Passive — only seen if you visit — but this is where the explanation belongs. Whatever else is built, someone clicking through from a notice must not land on a page that fails to mention what they came about.

### 4. Do not archive silently at all

The reason an announcement is needed is that the system acted unilaterally. Remove the unilateral action and the problem dissolves: when the target date passes, the goal needs a decision — extend, close, or mark achieved.

The behaviour can stay and only the framing change: lapsed goals still stop counting, `activeGoalWhere` is untouched, only the status label and the prompt differ. This addresses the root rather than the symptom.

**Cost.** A third status state to reason about, where the current two-state rule is clean and several surfaces depend on it.

### 5. A "while you were away" digest

Real, but overkill for one event type in a single-user app. Worth remembering only if silent state changes ever multiply.

## Proposed shape

1. **Option 3, always.** The goal explains its own state — lapsed rather than closed by hand, what stopped, and how to resume.
2. **Option 1 as the announcement channel.** Reuses dismissal, avoids the event/reconcile mismatch entirely.
3. **Option 2 as the record.** One activity entry, so the goal page keeps the history.
4. **No bell notification**, which is what sidesteps the delete-pass problem.

Option 4 stays open as the better long-term answer, since everything above compensates for an action nobody asked for.

## Wording

Say what actually happened. The milestones were not archived or cancelled — they stopped counting. "Its milestones were archived" sends the reader looking for archived milestones and finding ordinary unfinished ones.

> **Move house**
> Its target date passed, so it moved to Archived. 3 unfinished milestones have stopped reminding you — give it a new target date to pick it back up.

Counting rules:

| Unfinished milestones | Second sentence |
| --- | --- |
| 0, or none at all | omitted entirely — nothing stopped |
| 1 | "1 unfinished milestone has stopped reminding you." |
| N | "N unfinished milestones have stopped reminding you." |

Completed milestones are never counted. Their stopping is not news.

**Do not offer "reopen it."** `archiveLapsedGoals` re-archives any Active goal still past its target date, so reopening without moving the date loops silently on the next page load. *"Give it a new target date"* is the only remedy that holds, and any Reopen control has to demand a new date in the same step.

Drop "and associated data" — it sounds ominous and says nothing. The only other associated records are metric history and relationship links, and neither was reminding anyone.

## Addition to Goals at risk 

Goals at risk is also revelant here. The target date only reaches at-risk through calculateGoalHealth, which requires targetValue and currentValue. An unmeasured goal with a target three days away and eight incomplete milestones isn't at risk unless one has already lapsed. Proximity to the target with substantial work outstanding is the definition of at risk, and it needs no notification to be useful. This could be very supportive feature to compliment this. 

## If the bell is chosen anyway

Two details that would otherwise ship wrong:

* The bell row has three slots — `documentName`, `message`, then `documentType · expiryDate`. Put the goal name in the first and the date in the third; the message carries only what happened and what it means.
* That metadata row labels the date "Due" for milestones and "Expires" otherwise. A goal would render "Expires 12 June 2026", which is wrong — it needs a "Target" branch. `documentType` should read "Goal".

## Open questions

* Does widening Needs Attention beyond "overdue" hold, or does a lapsed goal want its own surface?
* Should the calendar keep drawing target dates for archived goals? It does today, while an archived *document* is excluded from the calendar entirely. One rule should win, and the inconsistency should not be accidental.
* Should a lapse be announced at all when the goal had no unfinished milestones and no measure — that is, when nothing observable changed?

## Related

* Goal lapse behaviour introduced by "Lapse a goal when its target date passes, not when someone visits".
* KD-017 — Needs Attention rows carry actions specific to what they are for.
* ADR-010 — reminders and awareness surfaces; this ticket is the first case of a *statement about something that already happened* rather than a prediction, and should be recorded there as such so it is not later gated behind the Reminders switch.