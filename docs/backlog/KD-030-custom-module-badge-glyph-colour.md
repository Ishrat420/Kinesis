# KD-030 — Custom module badge shows a different glyph colour on the dashboard

**Status:** Idea
**Priority:** Low
**Tags:** UX / UI, Technical Debt

## Summary

A custom module's badge is drawn two different ways depending on where you are looking. Everywhere a custom module's object surfaces outside its own module, the glyph is tinted with the module's own colour. On the dashboard's Module Shortcuts grid, the same module's badge tints only its *background* with that colour and draws the glyph in `zinc-700`.

Same module, same badge, two different readings of "wear your own colour".

```text
Needs Attention / Upcoming & Due / bell   dashboard shortcut
┌───────────────┐                         ┌───────────────┐
│ ▣ tinted bg   │                         │ ▣ tinted bg   │
│   coloured    │                         │   zinc-700    │
│   glyph       │                         │   glyph       │
└───────────────┘                         └───────────────┘
```

## What exists today

* `CustomModuleBadge` (`lib/custom-modules/icons.tsx`) sets both `backgroundColor: color-mix(in srgb, <colour> 10%, white)` **and** `color: <colour>` on the badge, so the glyph inherits the module's colour. Used by `NeedsAttentionCard`, `ReminderList` and `NotificationBell`.
* The dashboard's shortcut card (`components/dashboard/ModuleCard.tsx`) applies the same `color-mix` background but keeps `text-zinc-700` for the glyph, because that is what the built-in modules' badges use and the card draws one badge for both.

This is a deliberate leftover, not an oversight in the consolidation: the four dashboard cards were merged onto one `ModuleCard` without changing how any of them looked, and bringing the glyph in line is a visible restyle rather than deduplication, so it was left for a decision.

## Options

1. **Bring the dashboard in line.** Give `ModuleCard` the module's colour for the glyph when it is tinted by `color` rather than by class. One rule everywhere; the dashboard's custom shortcuts become more colourful than the built-in ones sitting beside them in the same grid.
2. **Bring the rest in line with the dashboard.** Drop `color` from `CustomModuleBadge`. Quieter and more uniform, but throws away the strongest signal that a row in Needs Attention or the bell came from a particular custom module — which is the stated reason that badge exists.
3. **Say the difference is intentional and write it down.** The dashboard grid is a set of peer modules where a coloured glyph would make custom modules shout over the built-in ones; a row in a mixed list is the opposite case. Defensible, but it needs to be a recorded rule rather than an accident, in both components.

Option 1 or 3. Option 2 undoes something that was added on purpose.

## Open questions

* In the shortcuts grid, do custom modules *wanting* to stand out from the built-in four read as useful or as noisy?
* If the glyph takes the module's colour, does the badge still have enough contrast at the lighter end of the palette (`#65a30d`, `#d97706`) against a 10% tint of itself?

## Related

* Consolidation of the dashboard shortcut cards onto one `ModuleCard`, which is where this was noticed and deliberately not changed.
* KD-003 — custom object fields; the module colour and icon come from there.
