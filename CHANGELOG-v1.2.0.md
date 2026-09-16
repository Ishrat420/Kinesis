# Kinesis v1.2.0 — Changes since v1.1.0

Range: `v1.1.0..684f66b` (base `9cbf7f6`, tip `684f66b`). 69 commits (2 merges).

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
- **KD-044 — automatic interest/repayment arithmetic (Section A).** An asset/liability's `rate` field finally does something: the current balance now projects live from the last confirmed `amount` (`balanceAsOf`, stamped on every save) plus an optional fixed monthly repayment/contribution, compounding monthly and clamped so a liability can't go negative or keep accruing once paid off. No persisted ledger table — the monthly breakdown (shown in the edit form as "Last auto-applied") is computed fresh on every read, matching the notification engine's derive-don't-store precedent; correcting a wrong number means editing the balance directly, which becomes the new baseline. Applies to both assets and liabilities. New migration (`20261002000000_finance_automatic_arithmetic`) adds `monthlyContribution` and `balanceAsOf` columns to `FinanceItem`.
- **"Next interest" timing** — the list row shows a short "Next interest \<date\>" line, and the edit form shows "Interest added monthly on the Nth." Both derived from `balanceAsOf`'s day-of-month, clamped for short months (31 Jan → 28/29 Feb), no new fields.
- **KD-044 Section B — liability ON TRACK / AT RISK, edit-only.** Scoped to the one case with a real yes/no answer without inventing a target Finance doesn't have: does a liability's fixed monthly payment cover the interest accruing on it? Shown as a small amber/emerald panel (with a `TrendingUp`/`TrendingDown` icon and its own line-broken paragraphs) in the edit form only, reusing Goals' ON TRACK/AT RISK vocabulary and colour convention — not shown on the list row. Three message shapes depending on whether the payment is below, exactly at, or above the accruing interest (a payment that only matches interest is still AT RISK, since the balance would never actually reach zero). ON TRACK adds a payoff estimate ("about 1 year, 8 months to pay off"), computed by simulating the same month-by-month arithmetic forward rather than a separate formula, capped at 100 years.

## Mobile / touch

- **PWA installability** — added `app/manifest.ts` (name, icons, `theme_color`/`background_color`, `display: standalone`), generated 192px/512px/maskable icons from the existing app icon into `public/icons/`, and added matching `viewport.themeColor` + `appleWebApp` metadata to the root layout. `next build` now emits `/manifest.webmanifest` as a static route, enabling "Add to Home Screen" on phones.
- **Touch drag-and-drop on the dashboard grid** — the Module Shortcuts grid's reordering was pure HTML5 drag-and-drop, which never fires on a touchscreen. Added a pointer-events touch-drag path scoped to each card's grip handle (so a finger dragging elsewhere on the card still scrolls normally), sharing one pure `moveId()` reorder function with the existing mouse path (unit tested).
- A tap-to-add affordance for custom modules was added and then removed at the user's request — adding a custom module to the dashboard is drag-and-drop only again. On a phone this means there is currently no way to add one (the sidebar drawer covers the dashboard while open, so that drag can't be completed there either); a known, accepted gap for now.
- Not yet hand-verified on a real phone/tablet — passed typecheck, lint, and the full unit/integration suites, but pointer/touch behavior itself hasn't been exercised in an actual mobile browser.

## Misc UI / polish

- Close the create-module dialog on success instead of leaving it open.
- Final testing pass before the tag.
- Removed three unnecessary dialog hint lines: Documents' "Enter the document details now. You can attach a file later.", the command bar's "Nothing matches that yet — capture it instead." on a no-results search, and Finance's "Keep it high-level — you can update this anytime." (the Finance "choose a type" screen's own subtitle is unaffected).
- Dropped the "SYSTEM" eyebrow above the Settings page title.
- Vertically centered the dashboard's "Recent activity" empty state ("Your latest changes will appear here.") to match "Upcoming & Due"'s — the two sat at different heights side by side before.

## Docs / process

- Rewrote README (Getting Started, structure, fixed stale claims).
- Fixed stale claims in `testing-strategy.md`, closed the related OPS-001 item.
- Documented the dashboard data-layer unification as KD-017 step one, then moved KD-017 to Planning Needed in the backlog.
- Backlog/ticket-tracker and ADR-status housekeeping.

## Known gaps going into the release

- **BUG-007, relationship map surface** — still exposed to silent last-write-wins data loss on concurrent edits (see above). Needs its own version-counter design before it can be fixed the same way the other three surfaces were.
- **A flaky integration test** was observed in `tests/integration/settings/delete-all-data.test.ts` (intermittent failure, unrelated to any change in this release — reproduced once, passed clean on immediate re-runs). Root cause not chased down; worth tracking before leaning on CI as a release gate.
- Touch drag-and-drop above needs a manual pass on iOS Safari and Android Chrome before being trusted; only automated checks have run against it so far.
- **On a phone, there is no way to add a custom module to the dashboard** (see Mobile / touch above) — drag-and-drop only, and the sidebar drawer covers the dashboard while open.
- **KD-044's ledger choice is a real tradeoff, not free.** Because the monthly breakdown is computed on the fly rather than stored, there's no way to correct one specific past month in isolation — fixing a wrong number always means re-baselining from today forward. Fine for the common case (a bank statement disagrees with the current total), but worth knowing before relying on it for detailed historical bookkeeping.
- **KD-044 Section B (ON TRACK/AT RISK) is liability-only and edit-only** — nothing shown for assets (no target to be at risk of missing) or on the list row (by request, for now).
- **`v1.2.0` has no git tag yet** — attempted to create one but this session's GitHub credentials returned a 403 on the tag push specifically (branch pushes work fine). Needs to be tagged from outside this session — see chat for details.
