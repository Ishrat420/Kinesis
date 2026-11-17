import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { getAuthenticatedClerkUser } from "@/lib/auth";
import { prisma } from "@/lib/data/prisma";
import { setDocumentDriveFile } from "@/lib/data/documents";
import { refusalOf } from "@/lib/actions/refusal";
import { DRIVE_FILE_FIELDS, driveConnectionState, hasDriveScope, isDriveFileId, isGoogleProvider, parseDriveFile, type DriveConnection } from "./shared";

/**
 * KD-059: Google Drive access, through the Google account linked to the
 * person's Clerk login. Kinesis runs no OAuth flow of its own and stores no
 * Google token: Clerk holds and refreshes it, and hands out a short-lived
 * access token when asked.
 */

/** Where the signed-in person stands with Drive. No call to Google. */
export async function getDriveConnection(kinesisUserId: string): Promise<DriveConnection> {
  const clerkUser = await getAuthenticatedClerkUser();
  const google = clerkUser.externalAccounts.find((account) => isGoogleProvider(account.provider));
  const settings = await prisma.userSettings.findUnique({ where: { userId: kinesisUserId }, select: { googleDriveEnabled: true } });
  return { state: driveConnectionState(google, settings?.googleDriveEnabled ?? true), email: google?.emailAddress ?? null };
}

/**
 * A Google access token that may use Drive, or null when the person hasn't
 * connected Drive (or switched it off). Valid for about an hour.
 */
export async function getDriveAccessToken(kinesisUserId: string): Promise<string | null> {
  const connection = await getDriveConnection(kinesisUserId);
  if (connection.state !== "connected") return null;
  const clerkUser = await getAuthenticatedClerkUser();
  const client = await clerkClient();
  const { data } = await client.users.getUserOauthAccessToken(clerkUser.id, "google");
  // Clerk's own record of the scopes can lag a re-consent by a moment, so
  // trust the token's scopes when it reports them.
  const token = data.find((candidate) => !candidate.scopes || hasDriveScope(candidate.scopes.join(" ")));
  return token?.token ?? null;
}

export type DriveFileLookup =
  | { status: "found"; file: NonNullable<ReturnType<typeof parseDriveFile>> }
  | { status: "missing" }
  | { status: "error" };

/**
 * Reads one file's details from Drive. "missing" covers deleted, trashed and
 * no-longer-accessible files alike: from Kinesis's side they're all gone.
 * Only metadata is read, never the file's contents.
 */
export async function lookUpDriveFile(token: string, fileId: string): Promise<DriveFileLookup> {
  if (!isDriveFileId(fileId)) return { status: "missing" };
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  } catch {
    return { status: "error" };
  }
  if (response.status === 404) return { status: "missing" };
  // 403 is both "you can no longer see this file" and Google's rate limit.
  if (response.status === 403) return isRateLimited(await response.json().catch(() => null)) ? { status: "error" } : { status: "missing" };
  if (!response.ok) return { status: "error" };
  const file = parseDriveFile(await response.json().catch(() => null));
  if (!file) return { status: "error" };
  return file.trashed ? { status: "missing" } : { status: "found", file };
}

function isRateLimited(body: unknown) {
  const errors = (body as { error?: { errors?: { reason?: unknown }[] } } | null)?.error?.errors ?? [];
  return errors.some((error) => typeof error.reason === "string" && /ratelimit/i.test(error.reason));
}

export type AttachDriveFileResult = { ok: true } | { error: string };

/**
 * Records `fileId` as the document's file once Drive confirms the file is
 * there and the person's Google account can see it. Name, type and link come
 * from Drive, not from the browser. Used by the create action and by
 * attachDriveFileAction; `userId` is always the signed-in person's.
 */
export async function attachDriveFile(userId: string, documentId: string, fileId: string): Promise<AttachDriveFileResult> {
  let token: string | null;
  try {
    token = await getDriveAccessToken(userId);
  } catch {
    return { error: "Couldn't reach Google Drive to check the file." };
  }
  if (!token) return { error: "Connect Google Drive in Settings to keep your files." };
  const lookup = await lookUpDriveFile(token, fileId);
  if (lookup.status !== "found") return { error: lookup.status === "missing" ? "That file isn't in your Google Drive." : "Couldn't reach Google Drive to check the file." };
  const { id, name, mimeType, webViewLink } = lookup.file;
  try {
    await setDocumentDriveFile(documentId, { id, name, mimeType, webViewLink });
  } catch (error) {
    const refusal = refusalOf(error);
    if (refusal) return { error: refusal };
    throw error;
  }
  return { ok: true };
}

