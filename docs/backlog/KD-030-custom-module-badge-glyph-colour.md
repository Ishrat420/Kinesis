# KD-030 — Custom module badge shows a different glyph colour on the dashboard

**Status:** Done
**Priority:** Low
**Tags:** UX / UI, Technical Debt

## Decision

**Satisfactory as it stands — Option 3, recorded and closed. No code change.**

Revisiting this with a side-by-side visual comparison (four sample custom modules, rendered exactly as each surface's real markup draws them) and then checking it against the actual dashboard changed the read on this:

* **The dashboard's Module Shortcuts grid does not look inconsistent on its own.** Looked at by itself — which is how every real user encounters it — each module gets its own soft background tint (a distinct pastel per module) while every glyph stays one uniform dark tone. That reads as coherent, deliberate colour-coding, not as a bug. Nothing about it looks broken until you go looking for a different surface to compare it against.
* **The comparison that makes it look inconsistent is one an ordinary user never makes.** The "mismatch" only exists in the abstract, between this screen and the notification bell (the one remaining surface that still tints the glyph itself) — a comparison that requires having both open side by side, which nobody does in the course of using the app.
* **The visual mockup argued for uniform treatment anyway, and the dashboard already has it.** Comparing "full colour" against "fully uniform" for this exact grid, uniform was the clearer read — a custom module shouldn't outrank Documents just because of which colour it was given. `ModuleCard` already does this; there is nothing to bring it in line with.
* This also matches the precedent `NeedsAttentionCard` and `ReminderList` independently set (see "What exists today" below): both moved away from per-module glyph colour, in a mixed list, for the identical reason. The dashboard was never the odd one out in spirit — it was already the earliest example of the pattern the other two later adopted, just never written down as a rule.

Option 1 (colourize the dashboard glyph) is explicitly declined: it would make the dashboard the *one* surface pulling toward more colour while three others (Needs Attention, Upcoming & Due, and now this) have converged on less. Option 2 was already off the table per the original options list. This closes as Option 3.

## Summary

A custom module's badge is drawn two different ways depending on where you are looking. Everywhere a custom module's object surfaces outside its own module, the glyph is tinted with the module's own colour. On the dashboard's Module Shortcuts grid, the same module's badge tints only its *background* with that colour and draws the glyph in `zinc-700`.

Same module, same badge, two different readings of "wear your own colour" — at the time this was filed, against the surfaces that still agreed with each other. See "What exists today" for the corrected, current picture: it's now one surface still fully colouring the glyph, against three (including this one) that don't.

```text
bell (only holdout)          Needs Attention        Upcoming & Due         dashboard shortcut
┌───────────────┐            ┌───────────────┐      ┌───────────────┐     ┌───────────────┐
│ ▣ tinted bg   │            │ ▣ flat amber  │      │ ▣ flat grey   │     │ ▣ tinted bg   │
│   coloured    │            │   fixed glyph │      │   fixed glyph │     │   fixed glyph │
│   glyph       │            └───────────────┘      └───────────────┘     └───────────────┘
└───────────────┘
```

## What exists today

Four surfaces, three different treatments — this list is corrected from the ticket's original version, which named a 3-vs-1 split (`NeedsAttentionCard` / `ReminderList` / `NotificationBell` agreeing, only the dashboard differing) that two of those three have since moved away from, independently of this ticket:

* **`NotificationBell`** — still uses `CustomModuleBadge` (`lib/custom-modules/icons.tsx`), which sets both `backgroundColor: color-mix(in srgb, <colour> 10%, white)` **and** `color: <colour>`, so the glyph inherits the module's own colour. This is now the only surface doing full per-module branding.
* **`NeedsAttentionCard`** (`components/dashboard/NeedsAttentionCard.tsx`) — no longer uses `CustomModuleBadge` at all. Every item, custom modules included, renders in one fixed amber (`bg-amber-50 text-amber-700`); only the icon still varies by module. Changed deliberately, in a separate pass, with the reasoning recorded in its own commit: *"a custom item's own colour was the one thing breaking that shared visual language"* of an "these all need attention" list.
* **`ReminderList`** (Upcoming & Due) — same move, to a fixed flat grey instead of amber, same stated reason: *"one colourful item made the rest of the flat grey list look like an oversight rather than a choice."*
* **The dashboard's shortcut card** (`components/dashboard/ModuleCard.tsx`) — applies the `color-mix` background tint per module but keeps `text-zinc-700` for the glyph. Unchanged since this ticket was filed, and the only one of the four never revisited or written down.

So this was never really a 3-vs-1 split. It's one surface (the bell) still fully branding, and three — Needs Attention, Upcoming & Due, and the dashboard — that already don't, for the same underlying reason, arrived at independently three separate times without anyone connecting the three or writing the rule down. This ticket is that write-down.

## Options

1. **Bring the dashboard in line — not chosen.** Give `ModuleCard` the module's colour for the glyph when it is tinted by `color` rather than by class. Rejected: a visual mockup comparing this against the current and uniform treatments (four sample modules, including `#65a30d` and `#d97706`, sitting beside a built-in module in the same grid) showed this makes every custom module outrank the built-in one it sits next to — the opposite of what a shortcuts grid presenting modules as peers wants. It would also pull the dashboard toward more colour while Needs Attention and Upcoming & Due have both already moved the other way.
2. **Bring the rest in line with the dashboard — not chosen.** Drop `color` from `CustomModuleBadge`. Still off the table for the reason originally given: it throws away the one surface (the bell) where a custom module's own colour is still the clearest signal of where an item came from.
3. **Say the difference is intentional and write it down — chosen.** See Decision above. The dashboard's existing background-tint-only treatment already matches the reasoning `NeedsAttentionCard` and `ReminderList` separately arrived at; nothing needed changing, only recording.

## Open questions

Resolved:

* ~~In the shortcuts grid, do custom modules *wanting* to stand out from the built-in four read as useful or as noisy?~~ **Noisy** — confirmed by the visual mockup: a coloured glyph made every custom module outrank Documents in the same grid, every time. This was the deciding factor against Option 1.
* ~~If the glyph takes the module's colour, does the badge still have enough contrast at the lighter end of the palette (`#65a30d`, `#d97706`)?~~ **Yes, contrast is fine at 10% tint** — checked directly in the mockup. Turned out not to be the reason to avoid Option 1; the "shouts over the built-ins" problem was.

## Related

* Consolidation of the dashboard shortcut cards onto one `ModuleCard`, which is where this was noticed and deliberately not changed.
* KD-003 — custom object fields; the module colour and icon come from there.
* `87ebc0d` "Needs Attention: use each item's real module icon, one uniform colour" and `12d2440` "Uniform colour on the dashboard's Upcoming & Due, real colours in notifications" — the two commits that moved `NeedsAttentionCard` and `ReminderList` off per-module glyph colour, independently of this ticket and before it was reopened; the precedent this Decision leans on.
