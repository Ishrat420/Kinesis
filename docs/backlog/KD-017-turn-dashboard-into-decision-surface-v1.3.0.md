# KD-017 — Turn the Dashboard Into a Decision Surface

**Status:** Planning Needed — the original Context-Specific Actions
section below has shipped (Dismiss/Edit on documents and custom items,
Complete/Reschedule on milestones and to-dos); what remains is the Step
One data-layer work, which needs its own planning pass before anything
else in this ticket can proceed correctly.  
**Priority:** High  
**Tags:** UX/UI, Architecture, Technical Debt
**Planned Release:** v1.3.0

## Summary

Evolve the Kinesis dashboard from primarily a status/reporting surface into a **daily decision surface**.

The dashboard already answers:

> What needs my attention?

It should increasingly also answer:

> What can I do about it right now?

---

## 1. Context-Specific Actions

### Documents

For an expired document, in Needs attention list, it currently it shows just "Cancel"
Please rename cancel to "Dismiss" which should dismiss it permanently.  

And show Edit option, where they are taken into edit mode for that doument.

Example:

> **Passport.....** `Edit` `Dismiss` 

### Milestones widget

Provide option to

- Mark it complete from the menu, by clicking on a circle. 
- Reschedule it 

Rescheduling should allow the target date to be changed directly from the dashboard.

### Custom Items / Fields

Should behave the same way as document. For an overdue custom object, in Needs attention list, it currently it shows just "Cancel"

Please rename cancel to "Dismiss" which should dismiss it permanently. 
And show Edit option, where they are taken into edit mode for that object and via that they can manage it. 


---

## Document Renewal Behaviour

Future work

---

## Step One — Unify the "What's Due" Data Layer

**Status:** Planning Needed (this section only — split out of the ticket's
broader "Accepted" status because it needs its own design pass before
implementation)

### Why this has to come before the rest of KD-017

The decision surface this ticket is named for ("3 things need attention,
everything else is fine") can't be built correctly on top of what's
actually there today. A repo survey turned up **five independent
implementations** of "what's due/overdue," each written separately, each
with its own idea of a reminder window, and none of them calling any of
the others:

1. `getNeedsAttention` — `lib/data/attention.ts` — overdue-only, no lead
   window. Feeds `NeedsAttentionCard`.
2. `getUpcomingAndDue` — `lib/data/upcoming.ts` — overdue + due-soon, with
   its own per-type lead windows (`lib/reminders/policy.ts`). Feeds
   `ReminderList` ("Upcoming & Due").
3. `collectNotifications` — `lib/notifications/engine.ts` — its own
   per-type "candidate" logic entirely separate from (1) and (2). Feeds
   `NotificationBell`.
4. `getExpiringDocuments` — `lib/data/documents.ts` — feeds StatsGrid's
   "Expiring soon" tile.
5. `getMilestonesDueSoon` — `lib/data/goals.ts` — feeds StatsGrid's
   "Milestones" tile.

Five sources of truth for the same underlying question means the cards
sitting next to each other on the dashboard can (and likely already do,
in edge cases) quietly disagree. A one-line decision surface can never be
trustworthy while that's true — it would just be a sixth opinion.

### The proposed shape

One function computes every dated/actionable item across whichever
modules currently opt in — documents, milestones, todos, relationship
dates, custom items today; Finance later, once its own overhaul lands,
just by teaching it to emit into the same shape. Every item carries its
module/kind and a computed status (overdue / due-soon / fine).

Every consumer becomes a filter or a view over that one list, never its
own query:

* `NeedsAttentionCard` = filter `status === "overdue"`
* `ReminderList` = filter `status !== "fine"`
* StatsGrid's two tiles = a count over a filtered slice
* A future Milestones-only, Documents-only, or Custom-Modules-only card =
  filter on `kind`
* A future per-user widget picker becomes cheap: a "widget" is a saved
  filter over the shared list, not a new query someone has to write
* The eventual one-line decision surface is just another view over the
  same list, so it can never disagree with the cards next to it — there's
  only one source left to disagree with itself

### Constraints agreed before any implementation starts

* **Milestones:** no new list screen needed. `/goals/milestones/due-soon`
  already doubles as "every upcoming milestone" via
  `MILESTONES_ALL_HREF` in `lib/goals/milestone-window.ts` (same route,
  filter param removed) — reuse it as-is for any milestone-only card's
  "see all" link.
* **Documents / Custom Modules:** the easy cases. Documents already has
  `/documents/expiring-soon` as a precedent. Custom modules have no
  equivalent page yet, but the reminder-window config
  (`lib/reminders/policy.ts`) already drives custom-item filtering in both
  existing dashboard queries, so a `/custom-modules/due-soon`-shaped page
  is low-risk to add later, copying the documents page's shape.
* **Relationships / Finance:** confirmed gap — neither module has any
  "upcoming/due" list page today (grepped `app/(app)/relationships/` and
  `app/(app)/finance/`, nothing there). Both are currently only ever
  visible via the two dashboard cards or the bell, which link straight to
  each item's own record rather than a filtered module list. This only
  blocks a *future* per-module-only card for either — it does not block
  unifying the data layer while keeping today's two aggregate cards as the
  only consumers. Build the missing list screens later, only when a
  dedicated Relationships or Finance card is actually wanted.
* **Existing cards must keep working as-is.** Architecturally this holds —
  cards become thin filters, so their JSX/UX doesn't need to change. But
  literally: since the five implementations above don't already agree
  exactly (different windows, different overdue boundaries, different
  exclusions), unifying them will necessarily pick one behaviour, and any
  surface whose old behaviour differed from that will visibly change the
  first time it ships — most likely as a small shift in which items/counts
  appear, not a UX change. That trade-off needs to be made deliberately,
  not discovered after the fact: audit the five for where they actually
  disagree before implementation, and call out each disagreement's
  resolution explicitly in the follow-up plan.

### Risk assessment

* **Read-only.** No schema changes to existing data, no writes at risk.
  Worst case is a wrong count/item shown somewhere, not data loss.
* **Blast radius:** the five functions above, their five consumers, and
  the dismissal system (`lib/attention/dismissal.ts`), which is coupled to
  `getNeedsAttention`'s specific item shape and `dismissalKey` scheme —
  needs to survive the refactor without orphaning existing
  `AttentionDismissal` rows.
* **The notification bell is the highest-risk piece and should not be in
  the first pass.** The other four consumers all answer "what's due right
  now" — a stateless snapshot, safe to compute from one shared list. The
  bell answers a different question — "has this crossed a threshold I
  haven't already notified about" — which is inherently stateful (it needs
  to know what's already been sent). Forcing it into the same shape risks
  re-notifying or breaking dedup. Recommend unifying the four
  snapshot-based consumers first (both dashboard cards + both StatsGrid
  tiles), and treating `lib/notifications/engine.ts` as a deliberate,
  separate follow-up once the shared shape has proven itself.
* **Verifiable before shipping.** Since this is entirely read-side, a
  before/after comparison (snapshot each of the five's current output
  against fixtures, assert the new unified-and-filtered list matches
  wherever the old five already agreed, and explicitly document/approve
  every place they didn't) is realistic and should gate the change.

### Related

- KD-011 (Unified To-Do View) approaches a similar aggregation from the UI
  side — one merged view across modules — and explicitly leaves open
  "whether this should replace or expand the existing Upcoming & Due
  dashboard experience." This ticket's proposal is the opposite UI
  choice — uniform logic underneath, but deliberately kept as separate,
  addable, user-chosen cards rather than one merged list. Worth resolving
  which direction wins, or whether both can share the same data layer
  described above regardless. 