import Link from "next/link";
import { ArrowUpRight, FileText, Landmark, ListTodo, Target, UsersRound } from "lucide-react";
import type { LinkableObject } from "@/lib/objects/locations";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";

/**
 * A linked object, shown as the thing it is: its module, its name, and a way to
 * open it. Anything a link can point at gets an icon here; a custom item has no
 * fixed one, so it borrows the icon of the module holding it.
 */
const BUILT_IN_ICONS = { DOCUMENT: FileText, GOAL: Target, PERSON: UsersRound, FINANCE_ITEM: Landmark, TODO: ListTodo };

export function KinesisLinkCard({ option, className = "" }: { option: LinkableObject; className?: string }) {
  const color = option.color ?? "#52525b";
  const BuiltIn = BUILT_IN_ICONS[option.type as keyof typeof BUILT_IN_ICONS];
  const icon = BuiltIn ? <BuiltIn className="h-5 w-5" /> : <CustomModuleIcon name={option.icon ?? "package"} className="h-5 w-5" />;

  return (
    <Link
      href={option.href}
      aria-label={`Open ${option.name} in ${option.module}`}
      className={`group flex min-h-20 min-w-0 items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3.5 transition-colors hover:border-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${className}`}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{ color: "#3f3f46", backgroundColor: `color-mix(in srgb, ${color} 12%, white)` }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-zinc-500">{option.module}</span>
        <span className="mt-1 block truncate text-sm font-semibold text-zinc-800">{option.name}</span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:text-zinc-700" />
    </Link>
  );
}
