"use client";

import { useReverification, useUser } from "@clerk/nextjs";
import { ExternalLink, HardDrive } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setGoogleDriveEnabledAction } from "@/app/(app)/documents/drive-actions";
import { DRIVE_FILE_SCOPE, isGoogleProvider, type DriveConnection } from "@/lib/google-drive/shared";

/**
 * Settings → Integrations → Google Drive (KD-059).
 *
 * Connect asks Google, through Clerk, for the `drive.file` permission on the
 * Google account linked to this login, or links a Google account first for
 * someone who signs in with email. Their Kinesis login doesn't change.
 * Disconnect stops Kinesis using Drive; removing the permission itself is
 * done in the Google account, which is linked from here.
 */
export function GoogleDriveSettings({ connection }: { connection: DriveConnection }) {
  const router = useRouter();
  const { user } = useUser();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Clerk may ask the person to confirm it's them before linking an account.
  const askGoogle = useReverification(async () => {
    if (!user) throw new Error("Not signed in");
    const redirectUrl = `${window.location.origin}/settings#integrations`;
    const google = user.externalAccounts.find((account) => isGoogleProvider(account.provider));
    const account = google
      ? await google.reauthorize({ additionalScopes: [DRIVE_FILE_SCOPE], redirectUrl })
      : await user.createExternalAccount({ strategy: "oauth_google", additionalScopes: [DRIVE_FILE_SCOPE], redirectUrl });
    return account.verification?.externalVerificationRedirectURL?.toString() ?? null;
  });

  const connect = () => startTransition(async () => {
    setError(null);
    try {
      await setGoogleDriveEnabledAction(true);
      // Already allowed at Google, only switched off in Kinesis.
      if (connection.state === "disabled") { router.refresh(); return; }
      const googleConsent = await askGoogle();
      if (googleConsent) window.location.assign(googleConsent);
      else router.refresh();
    } catch {
      setError("Couldn't start connecting Google Drive. Try again in a moment.");
    }
  });

  const disconnect = () => startTransition(async () => {
    setError(null);
    await setGoogleDriveEnabledAction(false);
    router.refresh();
  });

  const connected = connection.state === "connected";
  const detail = connected
    ? `Files you upload are kept in ${connection.email ?? "your Google Drive"}, in a Kinesis folder.`
    : connection.state === "disabled"
      ? "Disconnected. Kinesis isn't saving or opening files in your Drive."
      : "Keep the files you upload in your own Google Drive. Kinesis can only see the files it saves there.";

  return (
    <div className="mt-5 rounded-2xl border border-zinc-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <HardDrive className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              Google Drive
              {connected && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Connected</span>}
            </p>
            <p className="text-sm text-zinc-500">{detail}</p>
          </div>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={connected ? disconnect : connect}
          className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 ${connected ? "border border-zinc-200 hover:bg-zinc-50" : "bg-zinc-900 text-white hover:bg-black"}`}
        >
          {pending ? "One moment…" : connected ? "Disconnect" : connection.state === "disabled" ? "Reconnect" : "Connect Google Drive"}
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-red-600">{error}</p>}
      {connection.state === "disabled" && (
        <p className="mt-3 text-xs text-zinc-500">
          To remove Kinesis&apos;s permission completely, remove it from your{" "}
          <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-zinc-700 underline underline-offset-2">
            Google account <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
          . Your files stay in your Drive.
        </p>
      )}
    </div>
  );
}
