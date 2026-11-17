# KD-059 — Keep Document Files in Google Drive

**Status:** Accepted
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
  with **Open in Drive**, plus a thumbnail where Drive provides one. Without a
  file it offers **Add file**, which uses the same upload.
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

## Settings

**Google Drive**, in Settings:

- Connected account (email), or **Connect Google Drive**.
- **Disconnect**: Kinesis stops uploading and loses access to the files.
  Documents keep their file name, shown as unavailable. Reconnecting the same
  Google account restores access.

## Open questions

- Should the Google access token come from Clerk
  (`getUserOauthAccessToken`), or should Kinesis run its own OAuth flow? Clerk
  is simpler and is the current plan. Confirm that Clerk can add the scope to
  an existing connection without forcing a fresh sign-in.
- Folder layout: one flat `Kinesis` folder, or one sub-folder per document
  type?
- Is a new ADR needed, extending ADR-017 to say where files may live?
