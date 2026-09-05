"use client";

import { ExternalLink } from "lucide-react";
import { useClerk } from "@clerk/nextjs";

export function ManageAccountButton() {
  const clerk = useClerk();

  return <button type="button" onClick={() => clerk.openUserProfile()} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium transition hover:bg-zinc-50">
    Manage account &amp; security <ExternalLink className="h-4 w-4" />
  </button>;
}
