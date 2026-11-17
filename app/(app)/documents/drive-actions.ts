"use server";

import { revalidatePath } from "next/cache";
import { requireKinesisUser } from "@/lib/auth";
import { prisma } from "@/lib/data/prisma";
import { getDocumentDriveFileId } from "@/lib/data/documents";
import { attachDriveFile, getDriveAccessToken, lookUpDriveFile, type AttachDriveFileResult } from "@/lib/google-drive/server";

/**
 * KD-059: the server's part of keeping document files in Google Drive. The
 * browser uploads the file itself; these actions only hand out a token, check
 * what the browser says it uploaded, and record it.
 */

export type DriveTokenResult = { token: string } | { error: string };

/** A short-lived Google access token for uploading, or why there isn't one. */
export async function getDriveUploadTokenAction(): Promise<DriveTokenResult> {
  const user = await requireKinesisUser();
  try {
    const token = await getDriveAccessToken(user.id);
    return token ? { token } : { error: "Connect Google Drive in Settings to keep your files." };
  } catch {
    return { error: "Couldn't reach Google Drive right now. Try again in a moment." };
  }
}

/**
 * Records `fileId` as the document's file, once Drive confirms the file is
 * there and this person's Google account can see it. Its name, type and link
 * come from Drive, not from the browser.
 */
export async function attachDriveFileAction(documentId: string, fileId: string): Promise<AttachDriveFileResult> {
  const user = await requireKinesisUser();
  if (typeof documentId !== "string" || typeof fileId !== "string") return { error: "That file couldn't be attached." };
  const result = await attachDriveFile(user.id, documentId, fileId);
  if ("ok" in result) revalidatePath(`/documents/${documentId}`);
  return result;
}

export type DriveFileStatus =
  | { status: "found"; name: string; webViewLink: string }
  | { status: "missing" }
  | { status: "unavailable" };

/**
 * Whether the document's file is still in Drive, for the document page.
 * "unavailable" means Kinesis can't ask right now (Drive disconnected, or
 * Google unreachable), which is not the same as the file being gone.
 */
export async function getDriveFileStatusAction(documentId: string): Promise<DriveFileStatus> {
  const user = await requireKinesisUser();
  const fileId = await getDocumentDriveFileId(documentId);
  if (!fileId) return { status: "missing" };
  let token: string | null;
  try {
    token = await getDriveAccessToken(user.id);
  } catch {
    return { status: "unavailable" };
  }
  if (!token) return { status: "unavailable" };
  const lookup = await lookUpDriveFile(token, fileId);
  if (lookup.status === "found") return { status: "found", name: lookup.file.name, webViewLink: lookup.file.webViewLink };
  return lookup.status === "missing" ? { status: "missing" } : { status: "unavailable" };
}

/** Settings' Connect / Disconnect. Disconnecting stops Kinesis using Drive; Google's permission is removed at Google. */
export async function setGoogleDriveEnabledAction(enabled: boolean) {
  if (typeof enabled !== "boolean") return;
  const user = await requireKinesisUser();
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { googleDriveEnabled: enabled },
    create: { userId: user.id, googleDriveEnabled: enabled },
  });
  revalidatePath("/settings");
  revalidatePath("/documents", "layout");
}
