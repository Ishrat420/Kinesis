"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "System settings", match: (path: string) => path === "/settings" },
  { href: "/settings/templates", label: "Template settings", match: (path: string) => path.startsWith("/settings/templates") },
] as const;

/**
 * The segmented control every Settings page sits under (rendered once, from
 * the shared layout). Which tab reads as active comes from the URL, not
 * component state, so a template's own detail page still shows "Template
 * settings" selected rather than resetting to the first tab.
 */
export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <div role="tablist" aria-label="Settings" className="inline-flex items-center gap-1 rounded-2xl bg-zinc-100 p-1">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            // Both tabs are visible at once, so there is no "on hover" to wait
            // for -- prefetch the one you're not on the moment this bar mounts,
            // rather than only once the pointer reaches it.
            prefetch
            role="tab"
            aria-selected={active}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              active ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
