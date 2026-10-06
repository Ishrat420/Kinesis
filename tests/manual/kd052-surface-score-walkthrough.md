# KD-052 Phase 4 -- Surface Score Manual Walkthrough

Manual verification for the Kinesis Link "sneak peek" (Surface Score, KD-052
Phase 4) against real click-through behaviour, complementing the automated
unit (`tests/unit/significance.test.ts`, `tests/unit/surface-score.test.ts`)
and integration (`tests/integration/kinesis-links/recent-events.test.ts`)
coverage -- those already prove the scoring math and query shape in
isolation; this proves the same rules read correctly once rendered.

## Setup

```
node scripts/seed-kd052-qa-data.mjs
```

Seeds one anchor Document ("KD-052 QA Anchor") Kinesis-Linked to nine target
objects (QA1-QA8b), each carrying one `ObjectEvent` chosen to land on a
specific corner of the Surface Score rule matrix. The script prints the
anchor's URL when it finishes. Idempotent -- re-run any time (after a code
change, or to reset dates) and it clears and recreates the same fixture.

Remove the fixture without recreating it:

```
node scripts/seed-kd052-qa-data.mjs --clean
```

The script seeds into the database's one `User` row by default, which fits a
deployment with a single account. A deployment can hold several accounts
(ADR-014), so pass `--user a@b.com` to choose one whenever there's more than
one.

The Kinesis Link peek cycles automatically every `PEEK_LOOP_MS`
(`useHistorySneakPeek`) -- watch a card for a few seconds, or reload, rather
than expecting it instantly.

## Cases

Open the anchor Document (`/documents/<id>`, printed by the script) and look
at its Kinesis Links section. Each row below is one linked card.

### QA1 -- High + fresh + relevant: clearly surfaces

**Setup:** Finance item, `amount` changed $1,000 -> $1,400 (40%, 5 days ago),
linked via Depends on.
**Score:** 70 (HIGH) + 30 (fresh, <=14d) + 20 (Depends on) + 15 (magnitude,
>=25%) = **135**.
**Expect:** Peek shows "Amount Increased", a green up-arrow diff from
$1,000 to $1,400, and the card still names **QA1 High Fresh Relevant** above
the diff (the fix for "doesn't show which goal/object this belongs to").

### QA2 -- LOW-only event: never surfaces

**Setup:** To-Do, `notes` changed (1 day ago), linked via Supports.
**Score:** LOW is gated before scoring entirely -- no freshness or relevance
bonus can rescue it.
**Expect:** Card never shows a peek at all -- stays on its plain
icon/module/name view. (LOW-tier events still appear in this To-Do's own
plain History, just never compete for the peek.)

### QA3 -- HIGH event, but stale: excluded by the 90-day window

**Setup:** Finance item, `amount` changed $500 -> $1,000 (100%, 100 days
ago), linked via Blocks.
**Score:** Would be well above threshold on tier/relevance/magnitude alone,
but age (100d) exceeds the 90-day eligibility window -- excluded outright.
**Expect:** No peek, despite being the largest magnitude change in the whole
fixture. (Still visible in this Finance item's own plain History -- History
has no age window.)

### QA4 -- Exactly at the score=50 threshold: surfaces

**Setup:** Goal, an unrecognized custom field changed 10 -> 14 (45 days
ago, NORMAL default tier), linked via Supports.
**Score:** 40 (NORMAL) + 0 (freshness, 31-60d) + 10 (Supports) = **50** --
the threshold check is `score < 50`, so exactly 50 clears it.
**Expect:** Peek shows "Custom note changed", 10 -> 14.

### QA5 -- IGNORE tier: invisible everywhere, not just the peek

**Setup:** Document, `issueDate` changed (2 days ago), linked via Related to.
**Expect:** No peek on the anchor's card for QA5. Then open QA5's own page
(`/documents/kd052qa-t5`) and check its History section directly: the same
event must **not** appear there either -- IGNORE is the one tier excluded
from plain History too, not just the peek.

### QA6 -- Milestone completed: big-diff peek, green up-arrow

**Setup:** Goal with 3 milestones (2 completed), the second one completed 3
days ago, linked via Depends on.
**Score:** 70 (HIGH) + 30 (fresh, <=14d) + 20 (Depends on) = **120**.
**Expect:** Peek shows **QA6 Milestone Completed** named above it, then the
headline `Milestone "Second" completed` in bold, with the progress count
"1 of 3 milestones completed -> 2 of 3 milestones completed" underneath in
smaller, muted text alongside a green up-arrow connector -- the milestone
event is the big element; the count is secondary. (This is the exact
screenshot report that prompted this fixture and the two follow-up fixes
above: object identity, which milestone and that it was completed, and now
which one of those two facts is the headline.)

### QA7 -- Milestone reopened: big-diff peek, amber down-arrow

**Setup:** Goal with 3 milestones (1 completed), the second one reopened
(uncompleted) 6 days ago, linked via Alongside.
**Score:** 70 (HIGH) + 30 (fresh, <=14d) + 10 (Alongside) = **110**.
**Expect:** Peek shows the headline `Milestone "Second" is reopened` in
bold, with "2 of 3 milestones completed -> 1 of 3 milestones completed"
underneath in smaller, muted text alongside an amber down-arrow connector.

### QA8a / QA8b -- Relevance alone decides eligibility

Both: To-Do, the same unrecognized custom field changed 10 -> 14, 45 days
ago (identical NORMAL/aged event) -- the only difference is the Kinesis
Link's own type.

- **QA8a**, linked via Blocks: 40 (NORMAL) + 0 (freshness) + 20 (Blocks) =
  **60**. **Expect: surfaces.**
- **QA8b**, linked via a Custom link ("Ad-hoc link"): 40 + 0 + 0 (Custom
  gets no relevance boost) = **40**. **Expect: no peek.**

Side by side, these two prove relevance is genuinely deciding the outcome --
same event, same age, same tier, different link type, different result.

## Cleanup

```
node scripts/seed-kd052-qa-data.mjs --clean
```
