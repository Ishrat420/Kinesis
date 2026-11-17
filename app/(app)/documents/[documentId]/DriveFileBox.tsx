"use client";

import { ExternalLink, FileText, LoaderCircle, TriangleAlert, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { attachDriveFileAction, getDriveFileStatusAction, getDriveUploadTokenAction, type DriveFileStatus } from "../drive-actions";
import { driveFileName, type DriveConnectionState } from "@/lib/google-drive/shared";
import { DriveUploadError, uploadToDrive } from "@/lib/google-drive/upload";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

/**
 * The document page's "File / document location" box (KD-059): the file
 * kept in the person's Google Drive, with Open in Drive, or a way to add one.
 * Checks with Drive that the file is still there, so a file deleted from
 * Drive reads as gone rather than as a broken link.
 */
export function DriveFileBox({ documentId, documentName, file, driveState, link, uploadFailed }: {
  documentId: string;
  documentName: string;
  file: { name: string; webViewLink: string } | null;
  driveState: DriveConnectionState;
  /** The document's own typed-in link, shown as before. */
  link: string;
  /** Just created, and its file didn't reach Drive. */
  uploadFailed: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const connected = driveState === "connected";
  const [status, setStatus] = useState<DriveFileStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !connected) return;
    let current = true;
    getDriveFileStatusAction(documentId).then((result) => { if (current) setStatus(result); }, () => {});
    return () => { current = false; };
  }, [documentId, file, connected]);

  const add = async (picked: File | undefined) => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const access = await getDriveUploadTokenAction();
      if ("error" in access) throw new DriveUploadError(access.error, "permission");
      const fileId = await uploadToDrive(picked, driveFileName(documentName, picked.name), access.token);
      const attached = await attachDriveFileAction(documentId, fileId);
      if ("error" in attached) throw new DriveUploadError(attached.error, "failed");
      setStatus(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof DriveUploadError ? caught.message : "Google Drive couldn't save the file.");
    } finally {
      setBusy(false);
    }
  };

  const missing = status?.status === "missing";
  const shown = file && !missing ? { name: status?.status === "found" ? status.name : file.name, href: status?.status === "found" ? status.webViewLink : file.webViewLink } : null;

  const message = shown
    ? null
    : missing
      ? "This file is no longer in your Google Drive."
      : uploadFailed
        ? "Your file couldn't be saved to Google Drive."
        : connected
          ? "No file kept for this document yet."
          : "File has not been uploaded for this document";

  return (
    <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-5">
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-zinc-400 shadow-sm">
          {busy ? <LoaderCircle className="h-6 w-6 animate-spin text-blue-600" aria-hidden="true" /> : (missing || uploadFailed) && !shown ? <TriangleAlert className="h-6 w-6 text-amber-500" aria-hidden="true" /> : <FileText className={`h-6 w-6 ${shown ? "text-blue-600" : ""}`} aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          {shown ? (
            <>
              <p className="truncate text-sm font-semibold text-zinc-900" title={shown.name}>{shown.name}</p>
              <p className="text-xs text-zinc-500">In your Google Drive</p>
            </>
          ) : (
            <p className="text-sm font-medium text-zinc-600">{busy ? "Saving to Google Drive…" : message}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
        {shown && (
          <a href={shown.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-zinc-900 hover:underline">
            Open in Drive <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
        {connected && (
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 text-zinc-900 hover:underline disabled:opacity-50">
            <UploadCloud className="h-4 w-4" aria-hidden="true" />
            {shown ? "Replace file" : "Add file"}
          </button>
        )}
        {!connected && (
          <Link href="/settings#integrations" className="text-zinc-900 hover:underline">
            {driveState === "disabled" || file ? "Reconnect Google Drive" : "Keep files in Google Drive"}
          </Link>
        )}
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-zinc-900 hover:underline">
            Open external location <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-sm font-medium text-red-600">{error}</p>}
      {shown && !connected && <p className="mt-3 text-xs text-zinc-500">Google Drive is disconnected, so Kinesis can&apos;t check this file is still there.</p>}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(event) => {
          void add(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
