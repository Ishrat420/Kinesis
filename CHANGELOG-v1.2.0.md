# Kinesis v1.2.0 — Changes since v1.1.0

Range: `v1.1.0..v1.2.0` (base `9cbf7f6`… tip `79f4af5`). 60 commits (2 merges), ~285 files touched by the tagged history plus this session's follow-on work.

## To-Dos

- Added an "Add to-do" button and dialog to the To-Dos page, with status, due date, and Kinesis Link settable up front.
- Added a Notes field to both the create and edit to-do dialogs.
- Added a configurable reminder lead time for to-dos (KD-027), defaulted to 30 days to match the other three.
- Gave a to-do in Needs Attention its own Complete/Reschedule actions, not just Dismiss.

## Dashboard: Upcoming & Due / Needs Attention

- Made Upcoming & Due a real decision surface — count, actions, kept its wording (KD-017 step one).
- Added a reusable Dismiss control shared between Upcoming & Due and Needs Attention.
- Fixed a bug where dismissing a due-soon/expiring-soon row silently dismissed the overdue one too.
- Made Edit, Reschedule, and Complete icon-only in both surfaces; dropped the border on Complete/Reschedule to match Edit/Dismiss.
- Needs Attention now uses each item's real module icon with one uniform colour.
- Sorted the notification bell by newest alert first instead of soonest deadline.
- Made colour usage consistent: uniform colour on the dashboard's Upcoming & Due, real colours in notifications; amber (not blue) for document reminders in the bell and on the Expiring Documents page.
- Matched Relationships' dashboard badge colour to its Kinesis Link colour.
- Closed KD-030: dashboard badge treatment deemed satisfactory as-is.

## KD-042 — Kinesis Link rich preview cards (PR #74)

- Design docs: field-formatting/config-placement design, data model impact (new Template config, links untouched), ADR-013 (preview cards read live, batched and narrow), permissions assumption tied to ADR-013, ADR-014 (single-tenant policy vs multi-tenant infrastructure).
- Shipped the colour/icon and preview-card work above via the merge of PR #74.

## Data integrity / concurrency (BUG-007)

- Added optimistic concurrency to Document, Template, and CustomItem saves, reusing each row's `updatedAt` rather than a new version column, with a distinct UI treatment for conflicts and deduped stamp logic.
- **`saveRelationshipMap` is still open** — the relationship map has no single row whose `updatedAt` represents "the map's version," so a stale-tab save there can still silently resurrect a deleted person or drop one just added. Filed, not fixed, as a deliberate low-priority call given the single-owner deployment model.
- Fixed a real race in `ensureStarterTemplate` (catch the loser's P2002) and the same unprotected create race in `resolveDocumentType`.
- KD-032 option 4: added database-level integrity for two gaps app code alone was guarding; decided to keep Relationships off the universal object layer.

## Starter template / templates

- Added a ghost Name row to the template editor and a starter template.
- Backfilled the starter template for owners provisioned before it existed.
- Fixed `ensureStarterTemplate` to check for General Record specifically.
- Defaulted Add Module to the starter template and protected it from deletion; cleaned up the duplicate starter template and locked it at the DB level.
- Fixed migration ordering (TemplateField columns were added before the table existed) and added self-healing for databases still holding renamed migrations under their old names.

## Relationships / Important Dates

- Gave any person their own facts, and stopped implying the app maintains edges it doesn't.
- Named Important Dates by scope, dropped dates/goals from third-party edges; shortened descriptions and added a birthday example on the person tab.
- Added more person icons and bubble colours to the relationship map.
- **BUG-006 fix** — the Notifications panel could render behind the Relationships inspector. Root cause: `NotificationBell` never portaled its panel to `document.body` like `Modal`/`MobileNavDrawer` do, so it was trapped in the top bar's own stacking context. Fixed by portaling it and introducing a shared `lib/layout/z-index.ts` scale (`chrome` → `banner` → `overlay` → `top`) that overlays across the app now draw from instead of picking ad-hoc `z-*` numbers per file.
- Relationship map inspector became a real phone UI: a three-position draggable bottom sheet (collapsed / partial / expanded), a dedicated "Pan map" toggle for touch (touch defaults to page scroll; panning is opt-in), and iOS safe-area insets so the sheet doesn't sit under the home indicator/notch.

## Finance

- Deep-linked Finance search results to their row (BUG-008), then fixed the anchor-scroll bug where `loading.tsx` ate the hash before rows existed.
- Store goal target dates and milestone due dates at UTC midnight (KD-031).
- Filed (not built) KD-044: Finance automatic interest/repayment arithmetic.

## Mobile / touch (this session's follow-on work, not yet on `origin/v1.2.0`)

- **PWA installability** — added `app/manifest.ts` (name, icons, `theme_color`/`background_color`, `display: standalone`), generated 192px/512px/maskable icons from the existing app icon into `public/icons/`, and added matching `viewport.themeColor` + `appleWebApp` metadata to the root layout. `next build` now emits `/manifest.webmanifest` as a static route, enabling "Add to Home Screen" on phones.
- **Touch drag-and-drop on the dashboard grid** — the Module Shortcuts grid's reordering was pure HTML5 drag-and-drop, which never fires on a touchscreen. Added a pointer-events touch-drag path scoped to each card's grip handle (so a finger dragging elsewhere on the card still scrolls normally), sharing one pure `moveId()` reorder function with the existing mouse path (unit tested).
- **Tap-to-add for custom modules** — dragging a custom module from the sidebar drawer onto the dashboard is a cross-overlay gesture no touch device can complete (the drawer covers the dashboard while open). Added a tap-to-add affordance in the empty-slot area as a working alternative for touch (and a shortcut for mouse users too).
- Not yet hand-verified on a real phone/tablet — passed typecheck, lint, and the full unit/integration suites, but pointer/touch behavior itself hasn't been exercised in an actual mobile browser.

## Misc UI / polish

- Close the create-module dialog on success instead of leaving it open.
- Final testing pass before the tag.

## Docs / process

- Rewrote README (Getting Started, structure, fixed stale claims).
- Fixed stale claims in `testing-strategy.md`, closed the related OPS-001 item.
- Documented the dashboard data-layer unification as KD-017 step one, then moved KD-017 to Planning Needed in the backlog.
- Backlog/ticket-tracker and ADR-status housekeeping.

## Known gaps going into the release

- **BUG-007, relationship map surface** — still exposed to silent last-write-wins data loss on concurrent edits (see above). Needs its own version-counter design before it can be fixed the same way the other three surfaces were.
- **A flaky integration test** was observed in `tests/integration/settings/delete-all-data.test.ts` (intermittent failure, unrelated to any change in this release — reproduced once, passed clean on immediate re-runs). Root cause not chased down; worth tracking before leaning on CI as a release gate.
- **KD-044** (Finance interest/repayment arithmetic) is filed but not implemented — don't imply it shipped.
- Touch drag-and-drop above needs a manual pass on iOS Safari and Android Chrome before being trusted; only automated checks have run against it so far.
