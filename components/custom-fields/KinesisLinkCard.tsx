import Link from "next/link";
import { ArrowUpRight, FileText, Target } from "lucide-react";
import type { KinesisLinkOption } from "@/lib/custom-fields/types";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";

export function KinesisLinkCard({ option, className = "" }: { option: KinesisLinkOption; className?: string }) {
  const color = option.color ?? "#52525b";
  const icon = option.type === "DOCUMENT"
    ? <FileText className="h-5 w-5" />
    : option.type === "GOAL"
      ? <Target className="h-5 w-5" />
      : <CustomModuleIcon name={option.icon ?? "package"} className="h-5 w-5" />;

  return (
    <Link
      href={option.href}
      aria-label={`Open ${option.name} in ${option.module}`}
      className={`group flex min-h-20 min-w-0 items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${className}`}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, white)` }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold" style={{ color }}>{option.module}</span>
        <span className="mt-1 block truncate text-sm font-semibold text-zinc-800">{option.name}</span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:text-zinc-700" />
    </Link>
  );
}
