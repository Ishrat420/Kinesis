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

### Implementation Phases

A code survey (reading all five functions in full, not just their intent)
turned up eight concrete disagreements between them, cited below by
file:line. Some are bugs (nobody chose the inconsistency, it just
happened); some are real product decisions (both behaviors are
defensible, but the five currently disagree). Unifying without telling
these apart first is how a "read-only, low-risk" refactor quietly ships a
product change. Phases are ordered so each is independently shippable and
revertable, and so the highest-risk piece (the bell) is deliberately last,
per the risk assessment above.

#### Phase 0 — Resolve the disagreements (decisions, no code)

Three of the eight are genuine product calls that need a yes/no before
Phase 1 can pick one behavior to implement:

* **Should "overdue" ever disappear when reminders are turned off?**
  Currently inconsistent: `getNeedsAttention` never checks
  `remindersEnabled` (overdue always shows); `getUpcomingAndDue` hides
  overdue milestones/custom items entirely when it's off
  (`lib/data/upcoming.ts:94,140`); `collectNotifications` does the same
  for the same two types (`lib/notifications/engine.ts:327,333-335,338`,
  which its own comment at lines 154-171 already flags as "a known,
  separately-tracked inconsistency"). Documents and todos never hide
  their overdue phase, by design (`upcoming.ts:115-120`: "due and overdue
  are statements of fact"). **Leaning:** extend that same reasoning to
  milestones and custom items — reminders-off should only ever suppress
  advance notice, never a fact that's already true.
* **Should the StatsGrid Milestones tile start counting overdue
  milestones?** It's the only one of the four milestone-aware functions
  that excludes them by design (`lib/goals/milestone-window.ts:52-55`:
  "Overdue is never filtered... the tile does not count it either",
  enforced by the two-sided window at `lib/data/goals.ts:144`). Needs Attention, Upcoming & Due, and the bell all include overdue milestones. **Leaning:**
  keep the tile's current scope — it's documented, deliberate design, not
  drift — but this means the shared list's consumers need a raw date to
  filter on, not just a precomputed status, since this is the one place
  that needs an unusual filter.
* **Where does "the due date itself" fall — due-soon or already
  overdue?** Three different answers today for milestones/custom
  items/todos: `getNeedsAttention` says not yet overdue (strict `<`,
  `lib/data/attention.ts:25,26,29`); `getUpcomingAndDue` says due-soon
  for milestones/custom items but already-actionable for todos
  (`lib/data/upcoming.ts:99,150` vs `125-127`); `collectNotifications`
  says already overdue for all three (`>=`,
  `lib/notifications/engine.ts:79,141-143,182`). Documents are the one
  type all three already agree on (expiry day itself isn't expired yet).
  **Leaning:** standardize on the bell's convention (due date itself =
  overdue) for the other three, since it's the most recently written and
  most carefully commented of the three.

Two more are bugs to just fix while building Phase 1, not decisions:

* `activeGoalWhere(now)` is called with the raw, time-of-day-bearing `now`
  instead of the precomputed midnight `today` in two of five places
  (`lib/data/attention.ts:25`, `lib/data/upcoming.ts:46`) — everywhere
  else (`lib/data/goals.ts:109,145,158`, `lib/notifications/engine.ts:283`)
  passes `today` correctly. Can make a goal due exactly today flicker out
  of two of the five lists for part of the day.
* `collectNotifications` resolves "today" through its own
  settings-fetch-and-compute path (`lib/notifications/engine.ts:263-270`)
  instead of the shared, `cache()`-wrapped `getToday()` the other four
  use (`lib/format/server.ts:34-36`) — same formula, duplicated code,
  and not deduped against the others within one request.

The remaining two (differing sort orders per consumer; `getExpiringDocuments`
never checking dismissals the way documents everywhere else do) aren't
decisions — sort stays a per-consumer, presentation-layer concern over
the shared list, and the missing dismissal check is just absorbed once
that consumer moves onto the shared, dismissal-aware layer.

**Deliverable:** this section, above, edited to record whatever was
actually decided (not just "leaning"), before Phase 1 starts.

#### Phase 1 — Build the shared data layer

One new function (e.g. `lib/data/attention-items.ts`) covering documents,
milestones, todos, relationships, and custom items — not finance yet
(matches every existing consumer's scope; Finance joins later per the
Summary above, once its own overhaul lands). Returns one row per item
carrying whatever the Phase 0 decisions and every current consumer
actually need: module/kind, id, title, href, the raw date (for the
Milestones-tile-style exclusion), and a computed `status`
(`overdue`/`due-soon`/`fine`) using the Phase 0 boundary decisions. Fixes
the two bugs above while building it — one canonical `getToday()` call,
`activeGoalWhere(today)` everywhere.

No consumer is touched yet. Ship this phase as passing unit tests against
hand-built fixtures that exercise each Phase 0 decision explicitly (the
ticket's own "verifiable before shipping" plan above) — proof the new
function does what Phase 0 decided, independent of anything downstream.

#### Phase 2 — Migrate the four stateless consumers, one at a time

Each of these is its own small, revertable change: swap the old query for
a filter over the Phase 1 list, keep the component's own props/JSX
untouched, run the suite, check the dashboard, ship, move on.

1. **Needs Attention card** (`components/dashboard/NeedsAttentionCard.tsx`,
   via `app/(app)/page.tsx:25`) — filter `status === "overdue"`, scoped to
   `getNeedsAttention`'s current module set.
2. **Upcoming & Due** (`components/dashboard/ReminderList.tsx`) — filter
   `status !== "fine"`, scoped to `getUpcomingAndDue`'s module set (the
   only one that includes relationships). Also fix the accidental double
   fetch while here — `app/(app)/page.tsx:21` and
   `components/dashboard/ModuleGrid.tsx:19` each call the old function
   independently today; wrapping the new shared function in React's
   `cache()` collapses both to one query per request.
3. **StatsGrid "Expiring soon" tile + `/documents/expiring-soon`**
   (`components/dashboard/StatsGrid.tsx:14`,
   `app/(app)/documents/expiring-soon/page.tsx`) — filter
   `kind === "document"`. Picks up dismissal-awareness this consumer
   never had (§G above) and the Phase 0 reminders-off decision, both for
   the first time — call out any visible count/list change this causes
   explicitly when shipping this step.
4. **StatsGrid "Milestones" tile + `/goals/milestones/due-soon`**
   (`components/dashboard/StatsGrid.tsx:16`,
   `app/(app)/goals/milestones/due-soon/page.tsx`) — filter
   `kind === "milestone"` plus whichever date-window rule Phase 0 settled
   on for this one deliberately-different tile.

#### Phase 3 — Notification bell (deliberately last)

Teach `collectNotifications` to source its candidate records from the
Phase 1 shared query, so it stops being a sixth, separately-maintained
implementation of "what's due" — but leave its own type derivation
(`REMINDER_DUE`/`EXPIRED`/`MILESTONE_DUE`/etc.), the `notificationKey`
scheme (`lib/notifications/identity.ts:38-46`), and the `NotificationRead`
dedup table completely untouched. Only which rows feed it changes, never
how it decides what's already been seen. Needs its own before/after
snapshot test asserting every existing key still resolves identically —
a changed key silently un-reads something a real user already dismissed.

#### Phase 4 — Cleanup (once 1–3 are shipped and stable)

Delete the five original functions once nothing calls them. Everything
past this point is optional/deferred, not blocking: a `/custom-modules/due-soon`
list page (documents/milestones already set the precedent), whether
Relationships or Finance ever get their own "due soon" list page, and
revisiting KD-011's open question ("does this replace or expand Upcoming
& Due") now that the data underneath is unified either way.

### Related

- KD-011 (Unified To-Do View) approaches a similar aggregation from the UI
  side — one merged view across modules — and explicitly leaves open
  "whether this should replace or expand the existing Upcoming & Due
  dashboard experience." This ticket's proposal is the opposite UI
  choice — uniform logic underneath, but deliberately kept as separate,
  addable, user-chosen cards rather than one merged list. Worth resolving
  which direction wins, or whether both can share the same data layer
  described above regardless. 