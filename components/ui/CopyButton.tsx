"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Copies `value` to the clipboard; the icon turns into a tick for a moment to confirm.
 * The icon is 24px but its invisible hit area is 44px, so it is easy to tap on a phone.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // The async Clipboard API needs a secure context; fall back to the old selection route.
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, value.length); // iOS Safari ignores select() on its own
      const ok = document.execCommand("copy");
      area.remove();
      if (!ok) return;
    }
    setCopied(true);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? "Copied" : "Copy"}
      className="relative inline-flex h-6 w-6 before:absolute before:-inset-2.5 before:content-[''] shrink-0 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      <span aria-live="polite" className="sr-only">{copied ? "Copied" : ""}</span>
    </button>
  );
}
