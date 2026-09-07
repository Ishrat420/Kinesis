# BUG-004 — Notification Panel Appears Behind Relationship Inspector

**Status:** Open  
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

