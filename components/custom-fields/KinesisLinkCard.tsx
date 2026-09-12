import Link from "next/link";
import { ArrowUpRight, FileText, Landmark, ListTodo, Target, UsersRound } from "lucide-react";
import type { LinkableObject } from "@/lib/objects/locations";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import { PreviewStats } from "./PreviewStats";
import type { KinesisLinkPreviewStat } from "@/lib/data/kinesis-links";

/**
 * A linked object, shown as the thing it is: its module, its name, and a way to
 * open it. Anything a link can point at gets an icon here; a custom item has no
 * fixed one, so it borrows the icon of the module holding it.
 */
const BUILT_IN_ICONS = { DOCUMENT: FileText, GOAL: Target, PERSON: UsersRound, FINANCE_ITEM: Landmark, TODO: ListTodo };

/**
 * `stats` is the rich preview (KD-042) -- omitted, or resolving to nothing
 * for this particular record, and the card renders exactly as it always
 * has. There is no separate "compact" component: the compact card is just
 * this one with an empty `stats` array.
 */
export function KinesisLinkCard({ option, stats = [], className = "" }: { option: LinkableObject; stats?: KinesisLinkPreviewStat[]; className?: string }) {
  const color = option.color ?? "#52525b";
  const BuiltIn = BUILT_IN_ICONS[option.type as keyof typeof BUILT_IN_ICONS];
  const icon = BuiltIn ? <BuiltIn className="h-5 w-5" /> : <CustomModuleIcon name={option.icon ?? "package"} className="h-5 w-5" />;

  return (
    <Link
      href={option.href}
      aria-label={`Open ${option.name} in ${option.module}`}
      style={{ "--kl-accent": color } as React.CSSProperties}
      className={`group flex min-h-20 min-w-0 flex-col justify-center rounded-[20px] border bg-white p-4 shadow-sm transition duration-200 ease-out border-[color-mix(in_srgb,var(--kl-accent)_28%,#e4e4e7)] hover:-translate-y-0.5 hover:scale-[1.01] hover:border-[color-mix(in_srgb,var(--kl-accent)_55%,#e4e4e7)] hover:shadow-lg active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${className}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ color: "#3f3f46", backgroundColor: `color-mix(in srgb, ${color} 12%, white)` }}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{option.module}</span>
          <span className="mt-1.5 block break-words text-[15px] font-bold tracking-tight text-zinc-800">{option.name}</span>
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-700" />
      </div>
      {stats.length > 0 && (
        <>
          <div className="mt-3.5 mb-3 h-px bg-zinc-200/80" />
          <PreviewStats stats={stats} />
        </>
      )}
    </Link>
  );
}
