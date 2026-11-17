import { DRIVE_FOLDER_MIME_TYPE, DRIVE_FOLDER_PATH, DRIVE_MAX_UPLOAD_BYTES } from "./shared";

/**
 * KD-059: puts a file into the person's own Google Drive, straight from the
 * browser. The file never passes through Kinesis's server (ADR-017): the
 * server only hands out a short-lived access token, and afterwards records
 * which Drive file the document has.
 *
 * Runs in the browser only. Uses the `drive.file` permission, so the folder
 * search below only ever sees folders Kinesis itself created.
 */

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

export class DriveUploadError extends Error {
  constructor(message: string, readonly kind: "too-large" | "permission" | "failed") {
    super(message);
  }
}

async function driveFetch(url: string, token: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  } catch {
    throw new DriveUploadError("Couldn't reach Google Drive. Check your connection and try again.", "failed");
  }
  if (response.status === 401 || response.status === 403) {
    throw new DriveUploadError("Google Drive refused the upload. Reconnect Google Drive in Settings and try again.", "permission");
  }
  if (!response.ok) throw new DriveUploadError("Google Drive couldn't save the file. Try again in a moment.", "failed");
  return response;
}

function quote(value: string) {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/** Finds a folder Kinesis created under `parent`, or creates it. */
async function folder(token: string, name: string, parent: string) {
  const query = `name = ${quote(name)} and mimeType = ${quote(DRIVE_FOLDER_MIME_TYPE)} and ${quote(parent)} in parents and trashed = false`;
  const list = await driveFetch(`${API}?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1&spaces=drive`, token);
  const found = ((await list.json()) as { files?: { id?: string }[] }).files?.[0]?.id;
  if (found) return found;
  const created = await driveFetch(`${API}?fields=id`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ name, mimeType: DRIVE_FOLDER_MIME_TYPE, parents: [parent] }),
  });
  const id = ((await created.json()) as { id?: string }).id;
  if (!id) throw new DriveUploadError("Google Drive couldn't create the Kinesis folder.", "failed");
  return id;
}

/** Uploads `file` into `Kinesis/Documents` as `name`, and returns its Drive file ID. */
export async function uploadToDrive(file: File, name: string, token: string): Promise<string> {
  if (file.size > DRIVE_MAX_UPLOAD_BYTES) throw new DriveUploadError("That file is over 10 MB, so it wasn't saved to Google Drive.", "too-large");

  let parent = "root";
  for (const segment of DRIVE_FOLDER_PATH) parent = await folder(token, segment, parent);

  const mimeType = file.type || "application/octet-stream";
  // A resumable session: the metadata first, then the bytes to the address
  // Google hands back. Works for any size, unlike a single multipart request.
  const session = await driveFetch(`${UPLOAD_API}?uploadType=resumable&fields=id`, token, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(file.size),
    },
    body: JSON.stringify({ name, mimeType, parents: [parent] }),
  });
  const location = session.headers.get("Location");
  if (!location?.startsWith("https://www.googleapis.com/")) throw new DriveUploadError("Google Drive couldn't start the upload.", "failed");

  const uploaded = await driveFetch(location, token, { method: "PUT", headers: { "Content-Type": mimeType }, body: file });
  const id = ((await uploaded.json()) as { id?: string }).id;
  if (!id) throw new DriveUploadError("Google Drive didn't confirm the upload.", "failed");
  return id;
}
