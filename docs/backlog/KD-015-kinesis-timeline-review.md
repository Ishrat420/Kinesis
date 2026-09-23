# KD-015 — Kinesis Year in Review / Timeline Highlights

**Status:** Idea
**Priority:** Medium
**Tags:** UX / UI, Foundation Dependent

**Depends on:** KD-048 (Object Event Model) — this ticket's whole example
output is a curated read over a structured event log. KD-048's Phases
1-3 are now Done, so the foundation this ticket was waiting on exists:
every core module writes a complete `ObjectEvent` stream to build a
Timeline over. Still wants **KD-052 (Event Significance, Surfacing &
Change Awareness)** for genuine curation ("meaningful highlights over
raw counts," per this ticket's own notes below) before a Timeline reads
as more than an unfiltered activity log — `Maturity Dependent` dropped
since the blocking maturity question was specifically "does the event
substrate exist," which it now does; `Foundation Dependent` kept since
KD-052's significance work is still a real prerequisite for a good
result here.

## Summary

Introduce a feel-good **Timeline Highlights / Year in Review** experience that summarizes meaningful progress and activity across Kinesis.

The purpose is not to show a raw activity log. It should surface a curated snapshot of what the user has achieved, maintained, improved, or added over a period of time.

The Timeline should also help users see the shape and pattern of their progress over time, It should surface:

Meaningful achievements and milestones
Areas where the user has made substantial progress (big increase in cash flow, savings etc)
Areas receiving significant time, effort or attention (perhaps multiple milestones span across time, big numbers, timeframe etc)
Changes in important measures over time (multiple goals for improving on a similar domain)
Patterns in what the user has been consistently maintaining (addin many relationship goals, objects, dates OR addin many financial goals, objects, increases and momentum)
Significant changes in direction


Example:

```text
Your 2026 in Kinesis

✓ Completed goal: Learn to Drive
  10 milestones completed
  Highlight: Drove more than 20 hours

♡ 17 relationship practices completed or scheduled

+ Added 3 new people
  Jenna, Sam and Tommy

🧴 Added 7 new skincare items

↑ Monthly cash flow increased
  $2,000 → $2,300

↑ Savings increased
  $7,000 → $17,000

✓ Milestone completed
  Saved $8,000 toward House Deposit

✓ 30+ milestones completed
  Across 7 goals
```

## Behaviour

The summary should be generated from existing Kinesis data and activity history. A personal progress narrative built from the information Kinesis has accumulated.

Potential sources include:

* Goals completed
* Milestones completed
* Important milestone highlights
* Relationship practices
* New people added
* Custom module activity
* Finance changes
* Savings / asset growth
* Net worth or cash-flow improvement
* Documents renewed
* Significant reminders completed
* Other meaningful cross-module events

## Experience

Possible views:

* This Month
* This Year
* Custom period
* Annual Year in Review

The presentation should feel celebratory and reflective rather than analytical or productivity-focused.

## Principle

The Timeline should make the user's forward motion visible, helping them recognise wins, continue behaviours that are working, reconsider where their effort is going, change direction when appropriate, or simply feel pleased with what they have accomplished.

## Notes

* Prefer meaningful highlights over raw counts.
* Avoid framing inactivity or missed goals negatively.
* Data should come from existing Kinesis records rather than requiring additional manual entry.
* Future versions may use AI to help select or narrate highlights, but the underlying facts should remain deterministic and traceable.

## Open questions

* **What is this Timeline's own selection/snapshot mechanism?**
  Moved here from KD-052, which explicitly does *not* decide this on
  Timeline's behalf. Not simply "run KD-052's Surface Score and take
  the top N" — KD-052's Phase 4 deliberately excludes Timeline from its
  destination thresholds, since Timeline is a progression/snapshot view
  (what changed over a period, and what shape that took) rather than a
  "pick the single best recent event" surface the way a Kinesis Link
  peek or the Dashboard are. What actually gets captured as a
  highlight, how a period is chosen and summarized, and whether any of
  that reuses KD-052's own significance classification are this
  ticket's decisions to make.
* **Does this Timeline reuse KD-052's `classifyEventSignificance`?**
  KD-052 builds that classifier as a small, composable, reusable domain
  function specifically so other consumers can call it — but whether
  Timeline actually should is a real design choice, not a given. It
  might be a useful ingredient (e.g. filtering out LOW-significance
  noise before building a period's summary) without being the whole
  mechanism, since "significant" and "worth a Timeline highlight" are
  related but not identical questions.
