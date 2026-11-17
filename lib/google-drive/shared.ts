/**
 * KD-059: what both sides of the Google Drive integration agree on. Safe to
 * import from the browser and the server; holds no secrets.
 */

/** The only Drive permission Kinesis asks for: the files it saved or the person picked, nothing else. */
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** Where uploads go in the person's Drive: `Kinesis/Documents`, created on first use. */
export const DRIVE_FOLDER_PATH = ["Kinesis", "Documents"] as const;

export const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

/** The Drive fields Kinesis reads about a file. */
export const DRIVE_FILE_FIELDS = "id,name,mimeType,webViewLink,thumbnailLink,trashed";

/** On the document page's address after a create whose file didn't reach Drive. */
export const DRIVE_FILE_FAILED_PARAM = "driveFile";

/** Same limit as reading a file on the device (ADR-017). */
export const DRIVE_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Where the person stands with Drive, without any token:
 * - `connected`: Google account linked, Drive allowed, not switched off in Kinesis;
 * - `disabled`: allowed at Google, but Disconnected in Kinesis;
 * - `needs-permission`: a Google account is linked but Drive was never allowed;
 * - `not-linked`: no Google account on this Kinesis login.
 */
export type DriveConnectionState = "connected" | "disabled" | "needs-permission" | "not-linked";

export type DriveConnection = { state: DriveConnectionState; email: string | null };

/** What a document keeps about its file. */
export type DriveFileRecord = { id: string; name: string; mimeType: string; webViewLink: string };

/** Clerk names the provider "google" in the browser and "oauth_google" on the server. */
export function isGoogleProvider(provider: string) {
  return provider.replace(/^oauth_/, "") === "google";
}

/** Clerk keeps the approved scopes as one space-separated string. */
export function hasDriveScope(approvedScopes: string | null | undefined) {
  return (approvedScopes ?? "").split(/\s+/).includes(DRIVE_FILE_SCOPE);
}

export function driveConnectionState(
  googleAccount: { approvedScopes: string | null | undefined } | undefined,
  enabledInKinesis: boolean,
): DriveConnectionState {
  if (!googleAccount) return "not-linked";
  if (!hasDriveScope(googleAccount.approvedScopes)) return "needs-permission";
  return enabledInKinesis ? "connected" : "disabled";
}

/**
 * The name a file gets in Drive: `<document name> — <original file name>`, so
 * it still makes sense when browsing Drive. Named once, on upload; Kinesis
 * never renames it afterwards. Characters Drive or a synced desktop folder
 * would choke on are replaced, and the whole name is kept to 200 characters.
 */
export function driveFileName(documentName: string, originalFileName: string) {
  const clean = (value: string) => value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  const document = clean(documentName);
  const original = clean(originalFileName) || "file";
  const name = document && document.toLowerCase() !== original.toLowerCase() ? `${document} — ${original}` : original;
  if (name.length <= 200) return name;
  const dot = original.lastIndexOf(".");
  const extension = dot > 0 && original.length - dot <= 10 ? original.slice(dot) : "";
  return `${name.slice(0, 200 - extension.length - 1).trimEnd()}…${extension}`;
}

/** Reads Drive's JSON for one file, or null when it isn't a usable file record. */
export function parseDriveFile(json: unknown): (DriveFileRecord & { thumbnailLink: string | null; trashed: boolean }) | null {
  if (!json || typeof json !== "object") return null;
  const value = json as Record<string, unknown>;
  const { id, name, mimeType, webViewLink, thumbnailLink, trashed } = value;
  if (typeof id !== "string" || !id || typeof name !== "string" || typeof mimeType !== "string") return null;
  if (typeof webViewLink !== "string" || !webViewLink.startsWith("https://")) return null;
  return {
    id, name, mimeType, webViewLink,
    thumbnailLink: typeof thumbnailLink === "string" && thumbnailLink.startsWith("https://") ? thumbnailLink : null,
    trashed: trashed === true,
  };
}

/** Drive file IDs are URL-safe base64-ish; anything else never reaches a Drive URL. */
export function isDriveFileId(value: string) {
  return /^[A-Za-z0-9_-]{10,200}$/.test(value);
}
