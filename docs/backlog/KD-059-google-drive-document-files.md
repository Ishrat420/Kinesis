# KD-059 — Keep Document Files in Google Drive

**Status:** In Progress — built on `v1.5.0`; to test on production with the owner's account
**Priority:** Medium
**Tags:** Integration / Data Model / Security / UX / UI

## Summary

Upload document reads a file on the device (KD-016, ADR-017), pre-fills the
create form and then throws the file away. The document keeps the details but
not the file, and every document page says "File has not been uploaded for this
document" with no way to change that.

This keeps the file in the person's own **Google Drive**. Kinesis still reads
the file on the device and stores the details it does today. What it adds is
the Drive file's ID and link, so the document page can open the file.

Kinesis never stores the file itself. The file goes from the browser straight
to Drive and never passes through Kinesis's server, which keeps the promise
ADR-017 makes.

## Requirements

- **Optional, per account.** Drive is something each person connects for
  themselves. Without it, Upload works exactly as today: read, pre-fill, save
  the details, discard the file.
- **Upload on save.** With Drive connected, saving the create form uploads the
  picked file into a `Kinesis` folder in the person's Drive, created on first
  use. If the upload fails, the details are still saved and the person is told
  the file wasn't kept, with a way to retry from the document page.
- **Browser to Drive directly.** The browser uploads the file with a
  short-lived access token. The server hands out the token and stores the
  result, but never sees the file.
- **Narrowest permission.** Use only the `drive.file` scope, which reaches just
  the files Kinesis created or the person picked, never the rest of their
  Drive. It is a non-sensitive scope, so the Google app needs no security
  assessment.
- **Document page.** The "File / document location" box shows the file name,
  with **Open in Drive** and **Replace file**. Without a file it offers
  **Add file**, which uses the same upload. (Thumbnails moved to Later: Drive's
  thumbnail links are short-lived and often need the viewer's own Google
  session.)
- **Data model.** New nullable fields on `Document`: `driveFileId`,
  `driveFileName`, `driveMimeType`, `driveWebViewLink`. The ID is what counts:
  the file is still found after it is renamed or moved inside Drive. The
  existing `link` field stays as it is, for links people type themselves.
- **File gone from Drive.** If the file was deleted or the person lost access,
  the document page says so and offers **Add file**. The details are never
  affected.
- **Deleting a document** leaves the Drive file alone. Kinesis does not delete
  files from someone's Drive.
- **Renewing a document** (KD-056) can take a new file. The old one stays in
  Drive and stays listed in the document's history.

## Later (not v1)

- Thumbnails of the file on the document page.

- **Choose from Drive**, using the Google Picker to attach a file that is
  already in Drive. It works under the same `drive.file` scope.
- Upload from the capture box (KD-057) and from an object's page (ADR-003,
  contextual uploads).
- OneDrive and Dropbox, using the same fields with a `provider` column.

## Onboarding — what a new person does

Kinesis is one deployment with many invited accounts (ADR-014), so the Google
setup is done **once, by whoever runs the deployment**. A new person does none
of it.

**New person (about 10 seconds, once):**

1. Accept the Kinesis invitation and sign in, as today.
2. The first time they upload, or from Settings, click **Connect Google
   Drive**.
3. On Google's consent screen, pick their account and allow "See and manage
   only the files this app uses".

That's it. If they signed in to Kinesis with Google, step 3 is a single click.
If they signed in with email, Clerk links their Google account as an extra
connected account. Their Kinesis login doesn't change.

**Deployment owner (once, about 30 minutes plus Google's review):**

1. Create a Google Cloud project, turn on the Drive API and create an OAuth
   client.
2. Put the client ID and secret into Clerk's Google connection, and add the
   `drive.file` scope.
3. **Publish the Google app**, with the app name, logo, home page, privacy
   policy and a verified domain. This is required for a seamless flow,
   because while the app is in Testing mode:
   - only test users the owner adds by hand (100 at most) can connect;
   - their Drive connection expires every 7 days;
   - Google shows an "unverified app" warning.

   With only `drive.file` this is a brand review, not a security review. It
   usually takes a few days.

### Setup progress (17 Nov 2026)

- [x] Clerk production instance uses its own Google credentials
  (`clerk.mykinesis.app`); scopes left at openid/email/profile on purpose.
- [x] Google Cloud project `kinesis`: Google Drive API enabled.
- [x] `drive.file` added under Data access, listed as non-sensitive.
- [x] OAuth clients exist for both Clerk instances ("Kinesis dev
  production", "Kinesis Personal Production").
- [ ] Confirm the Clerk development instance uses the dev client.
- [ ] Owner added as a test user while the app is in Testing.
- [x] Public home page (`https://mykinesis.app/`, shown to signed-out
  visitors; also `/welcome`) privacy policy (`/privacy`) and terms of service (`/terms`) built.
- [ ] `PRIVACY_CONTACT_EMAIL` in `lib/legal.ts` set to a real, monitored inbox.
- [ ] Branding filled in and app published, before inviting anyone.

## Settings

**Google Drive**, in Settings:

- Connected account (email), or **Connect Google Drive**.
- **Disconnect**: Kinesis stops uploading and loses access to the files.
  Documents keep their file name, shown as unavailable. Reconnecting the same
  Google account restores access.

## What was built

- **Schema:** `Document.driveFileId/driveFileName/driveMimeType/driveWebViewLink`
  (all set or all null, enforced by a check constraint) and
  `UserSettings.googleDriveEnabled` (migration `20261117000000_google_drive_files`).
- **`lib/google-drive/`:** `shared.ts` (scope, folder, naming, parsing),
  `server.ts` (connection state from Clerk, access token, Drive metadata
  lookup, `attachDriveFile`), `upload.ts` (browser upload into
  `Kinesis/Documents` with a resumable session).
- **`app/(app)/documents/drive-actions.ts`:** upload token, attach a file,
  check a file is still there, Connect/Disconnect.
- **Create form:** with Drive connected and a file picked, Create uploads
  first, then saves with the Drive file ID. On failure: try again, or create
  without the file. If the server can't confirm the file, the document is
  still saved and its page says the file didn't reach Drive.
- **Document page:** `DriveFileBox` (Open in Drive, Replace/Add file, file
  gone from Drive, Drive disconnected).
- **Settings → Integrations:** `GoogleDriveSettings` (Connect, Disconnect,
  Reconnect; link to remove the permission at Google).
- **History:** attaching or replacing a file records a "File" field change.
- **ADR-017** amended; CSP allows `www.googleapis.com`.
- **Tests:** `tests/unit/google-drive.test.ts`,
  `tests/integration/documents/drive-file.test.ts`.

## Decisions

- **Google access through Clerk.** Kinesis gets the Drive token from Clerk
  (`getUserOauthAccessToken`) and does not run its own OAuth flow. Confirmed
  in the installed `@clerk/nextjs` 7.8 SDK:
  - `externalAccount.reauthorize({ additionalScopes })` adds a scope to an
    existing Google connection; the person sees Google's consent screen once,
    with no fresh Kinesis sign-in;
  - `user.createExternalAccount({ strategy: "oauth_google", additionalScopes })`
    connects Google for someone who signs in with email;
  - `externalAccount.approvedScopes` tells whether Drive was granted;
  - `clerkClient.users.getUserOauthAccessToken(userId, "google")` returns a
    fresh access token on the server, refreshed by Clerk.

  Needs the deployment's **own** Google OAuth credentials in Clerk (Clerk's
  shared development credentials do not allow extra scopes).
- **Folder layout: one flat folder, `Kinesis/Documents`.**
  - Kinesis finds files by Drive ID, not by path, so folders are only there
    for someone browsing Drive. Kinesis is where files get organised.
  - Folders per document type would go stale. Changing a document's type, or
    renaming a type, would mean moving files in someone's Drive, which is
    slow and fails silently when access was lost.
  - The `Documents` level leaves room for other modules to keep files later
    (for example Finance receipts) without mixing them in.
  - Files are named `<document name> — <original file name>`, for example
    `Passport — scan_0412.pdf`, so they still make sense in Drive. Kinesis
    names the file once, on upload, and never renames it afterwards.
- **No new ADR; amend ADR-017 instead.** ADR-017's rule holds: Kinesis's
  server never receives, processes or stores the file. Reading still happens
  on the device, and nothing leaves the device while reading. What changes is
  that, once the person saves and has chosen to connect Drive, the browser
  sends the file to *their own* Drive. ADR-017 needs an addendum saying so,
  because some of its wording becomes too absolute:
  - "documents never leave the device" (Consequences);
  - the create-form banner saying the file was "not uploaded or stored".

  The banner becomes: "Read on this device. Kinesis doesn't keep your file;
  it's saved to your Google Drive." Without Drive connected, it stays as it is
  today.
