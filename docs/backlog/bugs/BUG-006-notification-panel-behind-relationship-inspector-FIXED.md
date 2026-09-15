# BUG-006 — Notification Panel Appears Behind Relationship Inspector

**Status:** Fixed
**Priority:** Medium  
**Tags:** UX/UI

## Issue

When the Notifications panel is opened while the Relationships inspector is visible, the inspector renders above part of the Notifications panel.

This causes notification content to be visually obscured and makes the layering of the UI incorrect.

## Expected

The Notifications panel should render above normal page-level content and inspectors.

Notifications
    ↑
Relationship inspector
    ↑
Page content

## Actual

The Relationship inspector overlaps the Notifications panel.

## Likely Area

Check stacking context / `z-index` between:

* Notifications popover/panel
* Relationship inspector
* any parent containers creating new stacking contexts

## Acceptance Criteria

* Notifications always appear above page inspectors and normal content.
* Relationship inspector remains usable when Notifications are closed.
* No regression to other overlays, menus, or modals.

## Fix

The root cause wasn't the z-index numbers themselves but where `NotificationBell`
rendered: unlike Modal.tsx and MobileNavDrawer.tsx, its panel was never portaled
to `document.body`, so it painted inside the top bar's own stacking context (the
top bar's `backdrop-blur` makes it a stacking context, the same trap those two
components already document). A `z-50` panel confined to that context can never
out-rank a sibling like the Relationships inspector sitting outside it, no matter
how high its number is set.

`NotificationBell` now portals its backdrop and panel to `document.body`, the
same escape Modal and MobileNavDrawer already use, with its position measured
off the trigger button since CSS positioning relative to the trigger no longer
reaches once the panel has moved. Every fixed/sticky overlay in the app --
including the Relationships inspector -- now also draws its z-index from a
shared scale (`lib/layout/z-index.ts`) instead of picking a number per file, so
a new overlay's stacking is chosen deliberately rather than guessed.

