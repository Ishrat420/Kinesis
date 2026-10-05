# Kinesis v1.3.1 — Changes since v1.3.0

Range: `v1.3.0..523517d` (base `b126547`, tip `523517d`). 11 commits.

## Upgrade notes

- **Next.js 16.2.9 → 16.3.8** (and `eslint-config-next` to match). This closes the open Next.js security advisories listed under v1.3.0's known gaps, including the critical proxy bypass for Turbopack App Router apps. No source changes were needed: the 16.3 codemods only prepare for Cache Components and Partial Prefetching, which Kinesis doesn't enable.
- **1 new database migration**, `20261012500000_repair_person_self_notes`. It runs on its own during the Vercel build (`npm run db:deploy`) and only adds a missing column, so nothing is lost.

## Deploy fix

- **Fixed `prisma migrate deploy` failing with P3018 / 42703 (`column "selfNotes" does not exist`) on `20261013000000_field_length_limits`.** Databases that started on `prisma db push` were marked as having every migration up to `20260831010000` without being checked column by column. A database pushed before `Person.selfNotes` existed therefore never got the column. The length-limit migration then failed on it before the deploy script's final schema check could add it.
- The new repair migration adds `selfNotes` if it's missing, just before the length-limit migration runs. On every other database it does nothing.
- `scripts/deploy-database.mjs` now clears a failed `20261013000000_field_length_limits` record, so the migration runs again. The failed attempt rolled back whole, so nothing is left to clean up.
- Checked against a local copy of the broken state: the original error came back, then the fixed deploy applied every migration and reported "Database matches the schema". Running it again is a no-op, and a brand-new database also deploys cleanly.

## Top bar

- **Flatter controls** that sit flush with the bar instead of looking like raised cards:
  - The search field is now a soft grey filled box with no border or shadow. It turns white with a thin border when focused, is 44px tall (was 52px), and its ⌘K hint is a small key-style badge. Results, errors and the capture confirmation moved up to match.
  - The bell is a plain icon with a grey hover and open state. It no longer has a circle, border, shadow or hover lift.
  - The avatar no longer has a border or shadow and is smaller (36px).
- **Unread badge:** the count is a red badge with a white number, pinned to the bell's top-right corner with a white ring. It's 18px and widens for "12" or "99+". The bell keeps a fixed size whether or not there's a count.

## Forms

- **Custom module items:** template fields (Due date, Reference, Related, Notes and the rest) are stacked, with the label above a full-width field, in place of the old two-column layout that squeezed each field into half the form. They use the same 50px bordered field as Name. Notes matches the other fields' border and focus style. Checkbox fields are a single bordered row with the label and checkbox together. This applies to both the new-item and edit-item forms.
- The new-item close button shows a soft ring when focused, in place of the browser's blue box.
- **Add document manually:** removed the "We'll notify you before the expiry date arrives." line under Reminder.

## Settings

- **Redesigned field styles:**
  - Region, Currency and Time zone use the shared 50px bordered field with a chevron.
  - The four "days before" reminder inputs share its border and focus ring at a compact size.
  - In-app notifications, Reminders and Push notifications on this device use the app's own checkbox in place of the browser's.
- **Export your data:** the description is gone and the button now reads **Export**. Your identity is still checked first, and the button shows "Verifying…" while that happens.
- **Delete your data:** the confirmation opens inside the card itself, below a divider, in place of a second tinted box nested inside it. The phrase field and buttons sit on one row and stack on phones. The field shows the phrase as a placeholder and gets focus when the card opens. Verify and delete stays neutral grey until the phrase matches. Cancel clears what you typed. The row's icon is now a trash can (was a cloud).

## Relationships

- Removed the "My constellation" box from the top-left of the map. It looked like a dropdown but had no menu and repeated the breadcrumb. On phones the gesture hint moved up into the freed space and hides while the "Connect … to…" banner is showing.

## Tests

- Updated the responsive-layout test for the stacked template fields.
- At release: lint and typecheck clean, 993 unit and 573 integration tests passing, production build passing.

## Known gaps

- `npm audit` still flags `deepmerge-ts` (high, through Prisma) and `baseline-browser-mapping` (moderate). Fixing the Prisma one means downgrading Prisma to 6.12.0, a breaking change, so it's left for now.
- The UI changes in this patch were checked with lint, types, tests and a build. They haven't been tried in a signed-in browser session.
- Carried over from v1.3.0: push and the tab bar are untested on Android, and push is untested in production until the first scheduled cron run.
