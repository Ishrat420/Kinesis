# KD-017 — Turn the Dashboard Into a Decision Surface

**Status:** Done — Context-Specific Actions shipped, and Step One (below)
went through all four planned phases; see "What shipped" below for the
one place this undersold itself and the one phase that turned out to be
unnecessary.
**Priority:** High  
**Tags:** UX/UI, Architecture, Technical Debt
**Planned Release:** v1.3.0

## What shipped

Every phase below is complete, verified by reading the current code
against each phase's own claim, not just trusting its "(done)" label:

* **Phase 1** — `getAttentionRecords` (`lib/data/attention-items.ts`)
  exists and is the one query each record kind needs.
* **Phase 2** — `getNeedsAttention`, `getUpcomingAndDue`, and
  `getExpiringDocuments` all confirmed filtering through it (the last one
  via the shared `documentUpcomingPhase`, exactly as claimed). The
  Milestones tile needed no change, also confirmed: it was already
  unified through its own `milestoneDueSoonWindow` helper before this
  ticket started.
* **Phase 3** — `collectNotifications` (`lib/data/notification-collection.ts`)
  sources from `getAttentionRecords` too. The bell no longer runs a sixth,
  separate query.

**The literal problem this ticket named is fixed**: "five independent
implementations, each with its own idea of a reminder window" meant five
separate database queries that could silently disagree about which
*records* even qualify. That's genuinely one query now, not a rename.

**One thing worth being exact about, not overselling:** the ticket's own
summary framed the end state as "one function computes every dated item
... every consumer becomes a filter over that one list." What actually
shipped is one shared function for the *records*, plus several small,
deliberately-separate functions deciding each record's *status* —
`lib/attention/items.ts`'s phase functions (Upcoming & Due / Needs
Attention) and `lib/notifications/engine.ts`'s candidate builders (the
bell) still each implement their own day-boundary math, not a shared one.
This is not leftover work; Phase 0's own planning explicitly decided
against unifying it, because ADR-010 treats the bell and Upcoming & Due
as answering genuinely different questions. Concretely: on a milestone's
own due date, Upcoming & Due calls it "due soon" (`milestoneUpcomingPhase`,
tested) while the bell fires `MILESTONE_DUE` ("due today") the same day —
correct per ADR-010, but it means a future change to "what counts as
overdue" for a kind still has to be made in two places, by design, not by
accident.

**Phase 4 (delete the five original functions) is moot, not skipped.**
It was written assuming the migration would produce new functions
alongside old ones to later delete. It didn't: Phases 1–3 rewired
`getNeedsAttention`, `getUpcomingAndDue`, `collectNotifications`,
`getExpiringDocuments`, and `getMilestonesDueSoon` in place, under their
own original names. Grepping the codebase for each of the five confirms
none has a second, orphaned implementation anywhere. There is nothing
left matching Phase 4's description to delete.

"Document Renewal Behaviour" (below) remains explicitly out of scope,
marked "Future work" in its own section — not part of what "Done" covers
here.

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

#### Phase 0 — Resolve the disagreements (no code)

**Revised: none of this needs a fresh decision.** ADR-010 (Notification
And Reminders Awareness Surfaces, `docs/decisions/ADR-010-...md`) is
Accepted and already specifies, per surface and per record type, exactly
the three things the first draft of this phase asked us to decide —
other tickets (KD-027, KD-028, KD-038, KD-040) already defer to it as the
source of truth for this area, and this one should too. Reading it
changes the shape of Phase 0 from "make three calls" to "match two known
bugs against an existing spec, and design Phase 1 around a constraint the
first draft missed."

* **"Should overdue ever disappear when reminders are off?" — not a
  decision, a bug.** ADR-010's per-type settings-gate tables are explicit:
  the `REMINDER_DUE`/advance row always blocks on `reminders is not
  ticked`, but the due/overdue row always **survives** it, for every
  type, no exceptions — documents' `EXPIRED`, milestones' "over its due
  date", custom items' "due", to-dos' "due/overdue" (ADR-010 §Settings
  gates, all four tables). The code the survey found disagrees with its
  own spec in exactly two places: `getUpcomingAndDue` wraps its *entire*
  milestone and custom-item computation — due-soon **and** overdue — in
  `settings.remindersEnabled ? ... : []` (`lib/data/upcoming.ts:94,140`),
  and `collectNotifications` gates milestone/custom-item candidates from
  outside the builder the same way (`lib/notifications/engine.ts:327,333-335,338`).
  Both silently drop the overdue row when reminders are off, which
  ADR-010 says should never happen. The engine's own comment (lines
  154-171) already flags this as "a known, separately-tracked
  inconsistency" without saying which side is correct — ADR-010 now says:
  the documents/to-dos pattern (gate the advance phase only, from inside
  the builder) is correct; milestones/custom items need to move to match
  it. **Phase 1 fixes these two sites**, it doesn't design new behavior.
* **"Should the Milestones tile count overdue milestones?" — confirmed:
  no, unchanged.** ADR-010's Milestones section lists "Milestones due
  within X day" only under point 1 (the reminder-period phase); point 2
  (overdue) lists Needs Attention, Upcoming & Due, bell, and calendar,
  not the tile. Matches the tile's own code comment
  (`lib/goals/milestone-window.ts:52-55`) exactly. Keep this exclusion in
  Phase 1 as documented, intended behavior, not drift to fix.
* **"Where does the due date itself fall?" — confirmed: it's meant to
  differ by surface, not converge on one rule.** This is the one place
  the original "leaning" (standardize on the bell's `>=` everywhere) was
  wrong, and ADR-010 is explicit about why it's wrong: "Needs Attention
  uses `< today` consistently... No exceptions" (line 26) is one
  deliberate rule; "the bell does flip its type on the due date... at
  `today >= dueDate`" (line 30) is a *different*, equally deliberate
  rule for a different surface answering a different question ("is this
  now late" vs. "should this notification's urgency escalate"). Upcoming
  & Due sits in between and varies by type on purpose too — milestones
  and custom items keep the due date itself as "due soon" (matching
  Needs Attention's boundary), while to-dos flip to "due" on the due date
  itself (matching the bell), because "`TODO_DUE` is a statement of fact"
  (line 123) the same way a document's `EXPIRED` is. Documents are the
  only type with one universal boundary across every surface (`>
  expiryDate`, ADR-010 lines 32, 51) because expiry semantics ("valid
  through D, expired D+1") aren't the same question as a due date's
  ("due on D, late on D+1"). **Consequence for Phase 1's design:** the
  shared item can't carry one precomputed `status: overdue | due-soon |
  fine` enum and expect every consumer to just filter on it — that would
  either force Needs Attention and the bell onto the same cutoff (wrong,
  per above) or require the shared function to already know which
  consumer is asking (defeats the point of unifying). The shared layer
  should carry the raw fields each surface's rule needs (due/expiry
  date, `completed`/`archived`, whether the parent goal is active) plus
  small per-surface status functions — one for "Needs Attention" boundary
  rules, one for "bell" boundary rules, one for Upcoming & Due's
  per-type rule — that read ADR-010's tables directly, so the tables
  stay the one place this logic is written down, exactly as ADR-010's own
  stated purpose (line 21) intends.

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

One more thing ADR-010 settles by *not* settling it: Expiring soon and
Milestones tiles (and the two pages behind them) ignore `remindersEnabled`
entirely today, unlike every other surface. ADR-010 names this
explicitly (line 40) as "never been argued... maybe revisited later" —
current, acknowledged, and deliberately left alone. Phase 1 preserves it
as-is; it is not part of this pass.

**Deliverable:** none — ADR-010 already is the deliverable this phase
was going to produce. Nothing to decide or write before Phase 1 starts,
only two confirmed bugs to fix while building it and one design
constraint (above) to build it around.

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

#### Phase 2 — Migrate the four stateless consumers, one at a time (done)

Each of these is its own small, revertable change: swap the old query for
a filter over the Phase 1 list, keep the component's own props/JSX
untouched, run the suite, check the dashboard, ship, move on. Three of
the four ended up as real code migrations; the fourth (Milestones tile)
turned out to already be unified through its own shared window helper,
which is itself a useful thing to have confirmed rather than assumed.

1. **Needs Attention card** (`components/dashboard/NeedsAttentionCard.tsx`,
   via `app/(app)/page.tsx:25`, done) — `getNeedsAttention`
   (`lib/data/attention.ts`) now filters `getAttentionRecords` through
   `isOverdueForNeedsAttention`. Component and `AttentionItem` shape
   unchanged; picks up the `activeGoalWhere` fix.
2. **Upcoming & Due** (`components/dashboard/ReminderList.tsx`, done) —
   `getUpcomingAndDue` (`lib/data/upcoming.ts`) now filters through the
   per-kind phase functions and is wrapped in React's `cache()`, fixing
   the accidental double fetch (`app/(app)/page.tsx:21` and
   `components/dashboard/ModuleGrid.tsx:19` both called the old function
   independently). Also fixes the reminders-off bug Phase 0 found: an
   overdue milestone/custom item no longer disappears when
   `remindersEnabled` is off.
3. **StatsGrid "Expiring soon" tile + `/documents/expiring-soon`**
   (`components/dashboard/StatsGrid.tsx:14`,
   `app/(app)/documents/expiring-soon/page.tsx`, done) —
   `getExpiringDocuments` now classifies through the shared
   `documentUpcomingPhase` instead of its own copy of the same expiry
   math. Revised from the original plan below, now that Phase 0 was
   reconciled against ADR-010: this tile's `remindersEnabled`-ignoring
   behaviour is confirmed intended (ADR-010 line 40) and preserved
   exactly (`remindersEnabled` passed as `true` unconditionally, not
   read from settings), and dismissal-awareness was deliberately **not**
   added — this is a reference listing, not a "what needs me right now"
   surface, and whether a dashboard dismissal should also hide a
   document here is a product decision of its own, not a side effect of
   a data-layer migration. No visible behaviour change; see
   `lib/data/documents.ts` and
   `tests/integration/documents/expiring-soon.test.ts`.
4. **StatsGrid "Milestones" tile + `/goals/milestones/due-soon`**
   (`components/dashboard/StatsGrid.tsx:16`,
   `app/(app)/goals/milestones/due-soon/page.tsx`, no code change
   needed) — revised from the original plan on actually implementing
   it: `getMilestonesDueSoon` (`lib/data/goals.ts`) already goes through
   `milestoneDueSoonWindow` (`lib/goals/milestone-window.ts`), the same
   shared helper its own "see all" page's `milestoneLists` uses, so the
   tile and the page were never two disagreeing implementations to begin
   with — Phase 0's "five implementations" count only holds once you
   don't also count this tile's own already-shared window helper. That
   window (`today` through `today + leadDays`, both ends inclusive) is
   provably the same range `milestoneUpcomingPhase`'s due-soon branch
   computes with `remindersEnabled` forced `true` (this tile ignores
   that setting too, same as Expiring soon, ADR-010 line 40). Routing
   this through `getAttentionRecords` instead would have meant either
   dropping the query's `dueDate` narrowing (fetching every incomplete
   milestone to filter in memory) or adding a `position` field to the
   shared record type purely for this one consumer's same-day tiebreak
   — real cost for a change with no behaviour or unification value,
   since there's no actual disagreement here to fix. Left as-is;
   `tests/unit/milestone-due-soon-agreement.test.ts` already guards it.

#### Phase 3 — Notification bell (deliberately last, done)

`collectNotifications` now sources its candidate records from the Phase 1
shared `getAttentionRecords`, so it stops being a sixth,
separately-maintained implementation of "what's due." Its own type
derivation, the `notificationKey` scheme (`lib/notifications/identity.ts:38-46`),
and the `NotificationRead` dedup table are completely untouched — only
which rows feed the candidate builders changes, never how the bell decides
what's already been seen. No dedicated before/after snapshot test was
needed in the end: `notificationKey`/the candidate builders' type
derivation were never touched, and the existing test suite already pins
exact key strings end to end (`tests/unit/notifications-collect.test.ts`),
so a changed key would already fail loudly.

One real behaviour fix ships with it, the mirror of Phase 2's Upcoming &
Due fix: `getMilestoneNotificationCandidate`/`getCustomItemNotificationCandidate`
used to be gated on `remindersEnabled` from the *outside*, in
`collectNotifications` itself, which dropped `MILESTONE_DUE`/
`CUSTOM_ITEM_DUE` along with their advance `REMINDER_DUE` phase. Both now
gate internally, matching the document/to-do builders' existing pattern —
the overdue type survives the switch, matching ADR-010.

Two implementation notes worth recording:

* **`getAttentionRecords` needed an escape hatch.** Unlike every Phase 2
  consumer, `collectNotifications(userId, now)` does not assume "the
  current session" — it takes `userId` explicitly (both real call sites
  happen to pass the current session's own id today, but the function
  was never written to assume that) and resolves `today` from that user's
  settings directly, never through the session-bound `getToday()`. Silently
  routing it through the ordinary, `requireKinesisUser()`-based
  `getAttentionRecords` would have made a userId-parameterized function
  secretly depend on ambient session state matching that parameter — a
  latent cross-user risk if that assumption is ever broken. Added an
  optional `scope: { userId, today }` to `getAttentionRecords`: omitted,
  every existing caller is unaffected; passed, it skips
  `requireKinesisUser()`/`getToday()` entirely, deferring to the caller's
  own explicit values.
* **`collectNotifications` moved out of `lib/notifications/engine.ts`
  entirely**, into its own `lib/data/notification-collection.ts`. Engine.ts
  holds the pure candidate-builder functions (`getDocumentNotificationCandidate`
  etc.), which a wide range of tests import with no database or session
  mocking at all — pulling `getAttentionRecords` (which reaches
  `requireKinesisUser`/`next/server`) into that same file would have made
  every one of those pure functions un-importable without stubbing both
  out, exactly the problem KD-017 Phase 1 already solved once by splitting
  `lib/attention/items.ts` (pure) from `lib/data/attention-items.ts` (I/O).
  Same fix, same shape, applied here too. It also had to be its own file
  rather than living directly in `lib/data/notifications.ts` next to
  `getRecentNotifications`/`markAllNotificationsRead`: those two are
  unit-tested by mocking `collectNotifications` away as an external
  dependency, which only works across a real module boundary.

#### Phase 4 — Cleanup (once 1–3 are shipped and stable)

Delete the five original functions once nothing calls them. Everything
past this point is optional/deferred, not blocking: a `/custom-modules/due-soon`
list page (documents/milestones already set the precedent), whether
Relationships or Finance ever get their own "due soon" list page, and
revisiting KD-011's open question ("does this replace or expand Upcoming
& Due") now that the data underneath is unified either way.

### Related

- ADR-010 (Notification And Reminders Awareness Surfaces) — the source of
  truth Phase 0 above reconciles against; every per-surface, per-type
  boundary and settings-gate this ticket's unification has to preserve is
  specified there, not re-derived here.
- KD-011 (Unified To-Do View) approaches a similar aggregation from the UI
  side — one merged view across modules — and explicitly leaves open
  "whether this should replace or expand the existing Upcoming & Due
  dashboard experience." This ticket's proposal is the opposite UI
  choice — uniform logic underneath, but deliberately kept as separate,
  addable, user-chosen cards rather than one merged list. Worth resolving
  which direction wins, or whether both can share the same data layer
  described above regardless. 