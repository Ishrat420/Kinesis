"use client";

import { useState } from "react";
import { useReverification } from "@clerk/nextjs";

async function requestExport(): Promise<Blob | Response> {
  const response = await fetch("/api/settings/export", { cache: "no-store" });
  if (!response.ok) return response;
  return response.blob();
}

export function ExportDataButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const verifiedExport = useReverification(requestExport);

  async function download() {
    setPending(true);
    setError(undefined);
    try {
      const blob = await verifiedExport() as Blob;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `kinesis-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("The export was cancelled or could not be completed.");
    } finally {
      setPending(false);
    }
  }

  return <div className="text-right"><button type="button" disabled={pending} onClick={download} className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold transition hover:bg-zinc-50 disabled:opacity-50">{pending ? "Verifying…" : "Verify and export"}</button>{error && <p role="alert" className="mt-2 max-w-56 text-xs text-red-600">{error}</p>}</div>;
}
