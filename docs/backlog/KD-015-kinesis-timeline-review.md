# KD-015 — Kinesis Year in Review / Timeline Highlights

**Status:** Idea
**Priority:** Medium
**Tags:** UX / UI, Maturity Dependent

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
