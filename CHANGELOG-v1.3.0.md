# Kinesis v1.3.0 — Changes since v1.2.0

Range: `v1.2.0..a1bf0df` (base `b4e76f5`, tip `a1bf0df`). 238 commits (3 merges, including PR #76).

## Upgrade notes

- **17 new database migrations** (`20261003…` to `20261019…`). They run on their own during the Vercel build (`npm run db:deploy`). Several move or reshape existing data: Kinesis Link custom fields become typed Kinesis Links, and the old `ActivityEvent` table is retired in favour of `ObjectEvent`. **Back up the production database before deploying.**
- **New environment variables for push:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `CRON_SECRET`. Set them for **Production** in Vercel (use a separate VAPID key pair from Preview). Listed in `.env.example`.
- **New Vercel Cron:** `/api/cron/push-notifications`, daily at 20:00 UTC (`vercel.json`). Vercel only runs crons on the production deployment.
- **`viewport-fit=cover`** is now set, so the installed app draws edge to edge; the top bar, tab bar, sheets and dialogs all pad for the iPhone's safe areas.

## Web Push notifications and the installed app (KD-053)

- Bell items are now pushed to your phone once a day (20:00 UTC; 6–7am Sydney). Push mirrors the bell exactly, with the same items and wording, and sends each item once. Going overdue, or a moved deadline, counts as a new item. Items already read in the app are skipped.
- No flood of old items: turning push on for the first time (or again after turning it off everywhere) records everything already on the bell as sent.
- Nothing is pushed while in-app notifications are off.
- Tapping a push opens the item and marks it read on the bell.
- Per-device on/off toggle in Settings, with "Add to Home Screen first" guidance on iPhone and an Install button on Android/Chrome. Blocked permission and unsupported browsers are explained rather than failing silently.
- Dead subscriptions (404/410 from the push service) are removed automatically.
- Service worker (`public/sw.js`) for push only, with no caching or offline mode. Added `app/apple-icon.png` for the iPhone Home Screen and `worker-src 'self'` to the CSP.
- **App icon badge:** the Home Screen icon shows the bell's unread count (iOS 16.4+). It updates while the app is open and with each push while it's closed.
- New tables `WebPushSubscription` and `NotificationPushed`, covered by data export and delete-all.
- Status: Done, pending an Android test and the first production cron run.

## Phone navigation (KD-054)

- **Floating bottom tab bar** on phones: Home, To-dos, **+**, Calendar, More, as a frosted pill with a highlight that slides to the tapped tab. It replaces the ☰ menu and the slide-out drawer, which are removed.
- **More sheet** slides up with your modules, custom modules, Add module and Settings. It uses the sidebar's own list, so the two can't drift apart. It closes on swipe down, tapping outside, Escape or picking an item. More shows as current on any page reached through it.
- **+** focuses the existing quick capture box in the top bar.
- The bar hides while typing, and every page has bottom padding so nothing sits under it.
- **‹ Back** in the top bar on every inner page (a bare chevron), since the installed app has no browser back. It goes up to the parent page, or steps back through history when the parent is where you came from. The in-page "Back to …" buttons are now desktop-only.
- **Pull to refresh** in the installed app, which loses Safari's own. It refreshes the page's data in place, and leaves alone sheets, dialogs, the tab bar, scrolled lists, and drags such as the relationship map and dashboard card handles.
- Top bar, notifications panel, dialogs and toasts clear the status bar and Dynamic Island.
- Status: Done, pending an Android test.

## Mobile polish

- Press feedback on touch screens (a slight shrink while a finger is down), with 44px tap targets for small icon buttons.
- iPhone no longer zooms in when a field is tapped (16px fields on touch screens).
- No contact AutoFill or spellcheck on short Kinesis fields; spellcheck stays on in notes.
- Compact phone layouts for: page headers, goal and document cards, to-do stats, dashboard stat tiles, module shortcut cards, Upcoming & Due and Recent activity (short times, subtle dividers, first five rows with "Show all"), the Milestones list and the Expiring documents list.
- Card padding tightened on phones.
- The capture confirmation ("To-Do created") fits a phone: the message wraps, the actions drop to a second row, and the ✕ stays inside.
- Actions show progress: a spinner on the pressed Save/submit button while it runs.
- Sidebar shows a small spinner while a tapped page loads.

## History and the Object Event Model (KD-048, KD-052)

- **Universal Object Event Model** replaces the old Document-only `ActivityEvent`. Every object type records its own History: field and status changes, renames, Kinesis Link added/removed/retyped, milestones added/updated/completed/reopened/deleted, goal reopened, and a document entering its reminder window.
- History entries read as a title plus a from → to detail line. Finance amounts read "Increased/Decreased by", custom-module currency and percent fields are formatted, and goal values carry their unit.
- **History is collapsed by default** on documents, goals, custom items, to-dos and finance. The closed card shows the count and the latest entry, and opens in place.
- Relationships' Person and Relationship tabs gained a collapsed History card.
- Recent Activity on the dashboard moved onto the new event model, with monochrome icons.
- **Kinesis Link History sneak peek:** a linked card briefly rolls into a "big diff" of the target's most significant recent change. Picked by a Surface Score (significance + freshness + link type + size of change, 90-day window). Starts every 8 seconds and holds for 5. Milestones and relationship changes have their own styling. Respects reduced motion.
- KD-052 Phase 4 (significance classification and Surface Score) shipped. Phase 5 (Change Awareness) remains in planning.

## Kinesis Links (KD-049, KD-050)

- Typed Kinesis Links generalised from Goals to Documents and Custom Items, with type-aware uniqueness and a shared label table. Labels show on the link cards.
- Kinesis Link custom fields converged into typed Kinesis Links (migrated automatically).
- The Kinesis Link picker is a searchable combobox.
- An item can no longer link to itself.
- Fixes: preview stats dropped from the Links section, retype/remove broken inside a form, the Add panel jumping, and Save allowed while a link was picked but not added.

## Dashboard, bell and reminders (KD-017, KD-028, KD-046, KD-047)

- **KD-017:** Needs Attention, Upcoming & Due, Expiring soon and the bell now share one "what's due" data layer, so they can't disagree. Closed KD-011: Upcoming & Due is the unified view.
- **KD-028:** overdue goals surface in Upcoming & Due, Needs Attention and the bell. Lapsed goals are no longer auto-archived; they show Overdue instead.
- **KD-046:** milestones are ordered by due date, not creation order.
- **KD-047:** Important Dates in Upcoming & Due get Create To-Do and Dismiss actions.
- The bell sorts by when each alert first reached you.
- Shared important dates credit both people in notifications and reminders.
- Fixed the "This month" cash flow tile always showing a trending-up icon, and an undefined same-day order in Upcoming & Due.
- A document's status (e.g. Expired) now updates in the Documents list and search as soon as it lapses, not only after opening it.

## Forms and design

- The bordered, roomier form design rolled out across the app: to-dos, finance, custom items, Add document manually, Edit document, milestones, goals, the custom-fields editor, templates and Relationships' inline fields. It includes tappable date rows, a styled inline date picker everywhere, required-field asterisks and modern checkboxes.
- Forms no longer reset after saving (React 19 form actions), so Settings, goal status, documents, custom items and templates keep showing what was saved. This fixes a bug where saving Settings silently changed the time zone.
- Finance's AT RISK / ON TRACK badge recomputes live while editing. "Interest / growth rate" is renamed "Interest rate".
- Every Finance item and To-Do has its own detail page, opened as a big window over the list. A to-do's whole card is clickable.
- The to-do board is grouped by urgency, with status, notes and reschedule inline. Completing a milestone or to-do feels instant.
- Thin, unobtrusive scrollbars app-wide.

## Relationships

- New relationship types: Dating, Spouse, Ex-partner, Pet, Housemate, Professional and Other.
- **Unsaved changes bar:** a slim pill with Discard and Save floats up while the map has unsaved edits. Discard asks for a second tap and keeps dragged bubble positions.
- New people get a random unused bubble colour (never your own near-black). There's also a custom colour picker.
- **BUG-007 closed:** the relationship map now has optimistic concurrency (`relationship_map_version`), so a stale tab can't silently overwrite newer changes.

## Custom modules

- **Icon picker:** grew from 112 to 188 icons, adding everyday life admin (car, bills, subscriptions, savings, home and utilities, chores, garden, groceries, sleep and mood, kids, moving, documents, media, trips and more), rings, and love and dating.
- **The module name is the icon search:** typing "Car maintenance" brings the matching icons to the front. Matching is local and ranks the icon's own names, then our own keywords (`icon-keywords.ts`), then Lucide's tags (`icon-tags.json`, refreshed with `scripts/sync-icon-tags.mjs`). It handles partial words, plurals and small typos. Nothing is hidden or disabled, and your pick is never changed by typing.
- Checkbox fields can show in a template's linked card preview. Fixed an untouched checkbox being dropped from the preview.

## Data integrity and limits

- **KD-043 / ADR-015:** length and number-size limits by field kind, enforced at all three layers (URL/link limit 2,000 characters).

## Tests

- Server-action integration coverage for Documents, To-dos, Settings, Templates and the remaining actions.
- Coverage for the notification identity layer, the reminder lead-day settings, the daily maintenance cron, push (payload, sender, cron route and the daily run), the tab bar and back navigation, pull to refresh, relationship discard and colours, and icon search.
- At release: 993 unit and 573 integration tests passing.

## Docs and process

- New tickets: KD-045 to KD-054. Done this release: KD-011, KD-017, KD-028, KD-043, KD-046, KD-047, KD-048, KD-049, KD-050, KD-053 and KD-054.
- ADR-016: event significance, Surface Score and Change Awareness.
- Manual walkthroughs for KD-052 and KD-053 (`tests/manual/`).
- KD-012, KD-016, KD-023, KD-025 and KD-041 moved to v1.4.0.

## Known gaps

- **Next.js 16.2.9 has open security advisories,** including a critical proxy bypass for Turbopack App Router apps. Patched in Next 16.3.8. Upgrade pending.
- Push and the tab bar are untested on Android. Push is untested in production until the first scheduled cron run.
- Swipe down to close the More sheet hasn't been tried on a real phone.
- KD-052 Phase 5 (Change Awareness) and the rest of KD-023 are not in this release.
