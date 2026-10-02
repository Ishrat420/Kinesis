import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * The one back-navigation control used across Kinesis. Detail pages point it at
 * the module they belong to; top-level module pages rely on the sidebar instead.
 *
 * Desktop only: on a phone the top bar's ‹ (TopbarBack) does the same job on
 * every inner page, and a second back button under it was just a repeat.
 */
export function BackLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`hidden items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 hover:shadow-md md:inline-flex ${className}`}
    >
      <ArrowLeft className="h-4 w-4" /> {children}
    </Link>
  );
}
