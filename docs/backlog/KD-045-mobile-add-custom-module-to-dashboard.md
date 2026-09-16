# KD-045 — Add Custom Module to Dashboard on Mobile

**Status:** Planning Needed  
**Priority:** Medium  
**Tags:** UX / UI

## Summary

On a phone there is no way to add a custom module to the dashboard's Module
Shortcuts grid. Two things compound:

1. Adding a module only happens by dragging its link from the sidebar and
   dropping it onto the grid's drop zone (`ModuleShortcuts.tsx`'s
   `onDrop`/`addCustomModule`, sourced from `DraggableCustomModuleLink.tsx`'s
   native `draggable`/`dataTransfer`). That's plain HTML5 drag-and-drop,
   which never fires from a touchscreen — the same limitation KD-020's
   Mobile/touch follow-through fixed for *reordering* modules (a dedicated
   pointer-events touch-drag path on each card's grip handle,
   `gripHandlers`/`moveId`, shared with the mouse path via `moveId()`). That
   fix only covers the grip handle's reorder path; adding a module is a
   separate code path and never got the same treatment.
2. Even if touch drag-and-drop worked here, the only place custom module
   links live on a phone is inside `MobileNavDrawer`, which renders as a
   `fixed inset-0` overlay portaled to `document.body` — it covers the
   dashboard, including the Module Shortcuts grid, while open. There is no
   view on a phone where both the source (the module link) and the target
   (the drop zone) are visible at the same time.

Removing a module already has a tap-friendly affordance — the X button in
`ModuleCard`'s `onRemove` — so this is specifically a one-way gap: mobile
can remove a module from the dashboard but not add one.

## What exists today

- `components/dashboard/ModuleShortcuts.tsx` — `dragProps`/`addCustomModule`
  accept a drop carrying the `application/x-kinesis-custom-module` MIME
  type; `addCustomModuleById` is the underlying, input-method-agnostic
  function that actually adds an id to the order. `gripHandlers` gives
  grip-handle reordering a touch-pointer path; adding has no equivalent.
- `components/navigation/DraggableCustomModuleLink.tsx` — the only place a
  custom module can currently be picked up from, native `draggable` only.
- `components/navigation/MobileNavDrawer.tsx` — the full-screen overlay
  that covers the dashboard while a phone user would be looking for that
  link.
- `lib/dashboard/module-order.ts` — `MAX_CUSTOM_DASHBOARD_MODULES = 2`,
  enforced both client-side and in `resolveDashboardOrder`, independent of
  how a module id gets added.

## Options

1. **Tap-to-add.** Give the drawer's custom module links (mobile only, or
   universally) a plus / "Add to dashboard" affordance that calls
   `addCustomModuleById` directly, no drag involved. Mirrors the existing
   X-button-to-remove pattern, avoids reimplementing drag semantics for
   touch, and sidesteps the drawer-covers-dashboard problem entirely since
   no drop target needs to be visible at the same time. Needs the action to
   reach from the drawer (rendered near the top bar) to the dashboard grid's
   state — a server action plus revalidation, or a shared client store —
   since they live in different parts of the tree today.
2. **Touch drag path for adding**, matching KD-020's grip-handle solution.
   Still needs the drawer open (to grab the link) *and* the grid visible (to
   drop on it) at once, so on its own it only closes half the gap — it would
   also need the drawer to stop being a full-screen overlay on the dashboard
   route specifically (e.g. a non-modal collapsible panel instead). Larger
   surface area than option 1 for the same outcome.
3. **An explicit "Add module" picker on the dashboard itself** — e.g. a
   button on the empty drop-zone hint ("Drop a custom module here · N slots
   available") that opens a small sheet/dialog listing custom modules not
   yet on the grid. Doesn't depend on the sidebar/drawer at all, works
   identically on desktop and mobile, and could replace desktop
   drag-and-drop too rather than adding a second, mobile-only mechanism.
   Larger change than 1 or 2 — a new UI surface rather than reusing what's
   there.

## Leaning

Option 3 is the cleanest fix: it removes the drag-and-drop dependency (and
the drawer/dashboard visibility conflict) for every input method instead of
patching touch specifically, and it's the only option that doesn't require
the sidebar/drawer and the dashboard to be on screen simultaneously. Option
1 is the smaller change if a picker is judged out of scope for now, and the
two aren't mutually exclusive — 1 could ship first, 3 later, or 3 could
simply replace 1.

## Open questions

- Should drag-and-drop from the sidebar stay as a desktop shortcut once a
  picker/tap-to-add exists, or get replaced entirely so there's only one way
  to add a module?
- Where does the "add module" entry point live in option 3 — always visible
  next to the drop-zone hint, or only while
  `selectedCustomCount < MAX_CUSTOM_DASHBOARD_MODULES` (mirroring the
  existing hint's own condition)? And what happens when there are zero
  custom modules to offer?
- Does this fold into KD-017 (the dashboard is already under a broader
  "decision surface" rework), or ship independently since it's a narrower,
  mobile-specific gap?

## Related

- KD-020 — shipped the touch-drag path for *reordering* modules; this
  ticket is the sibling gap that work didn't cover (adding, not reordering).
- CHANGELOG-v1.2.0.md, "Mobile / touch" section — where this gap was first
  called out, in the review notes following that work.
