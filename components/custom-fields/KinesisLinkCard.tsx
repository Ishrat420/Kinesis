"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Ban, FileText, GitBranch, GitCompare, Handshake, Landmark, Link2, Link as LinkIcon, ListTodo, Milestone, OctagonAlert, Target, TrendingUp, Unlink, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { LinkableObject } from "@/lib/objects/locations";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import { PreviewStats } from "./PreviewStats";
import type { KinesisLinkPreviewStat, KinesisLinkRecentEvent } from "@/lib/data/kinesis-links";
import type { RelationshipIconKey } from "@/lib/objects/relationship-labels";
import { formatActivityTime } from "@/lib/dates";
import { useFormatPreferences } from "@/lib/format/context";

/** One purpose-picked glyph per canonical relationship label (`relationshipIconKey`'s own vocabulary) -- "generic" (an ad-hoc `CUSTOM` link, or a row with no relationship type at all) has no entry here and falls back to the plain Link2/Unlink pair in `DiffConnector` below instead. */
const RELATIONSHIP_ICONS: Record<Exclude<RelationshipIconKey, "generic">, typeof Link2> = {
  "supports": TrendingUp,
  "supported-by": Handshake,
  "blocks": Ban,
  "blocked-by": OctagonAlert,
  "depends-on": GitBranch,
  "required-for": Milestone,
  "related-to": LinkIcon,
  "alongside": GitCompare,
};

/**
 * The diff row's connector, between `change.from` and `change.to`. A
 * magnitude change (Finance amount, a plain field, status) gets the
 * direction-tinted arrow. A relationship's `added`/`removed` gets a glyph
 * picked for that link's own type -- `change.icon`, from `RELATIONSHIP_ICONS`
 * above, or the generic Link2/Unlink pair for an ad-hoc `CUSTOM` link with no
 * fixed type to key off -- colored by the action (indigo added, amber
 * removed) rather than the type, so an added "Blocks" link doesn't read as a
 * warning just because "blocks" sounds alarming. A retype (`action:
 * "changed"`) crosses two different types at once, so no single icon could
 * describe it honestly -- it keeps the same neutral arrow a flat value
 * change gets.
 */
function DiffConnector({ change }: { change: NonNullable<KinesisLinkRecentEvent["change"]> }) {
  if (change.kind !== "relationship") {
    return <ArrowRight className={`h-4 w-4 shrink-0 ${
      change.direction === "up" ? "text-emerald-600" : change.direction === "down" ? "text-amber-600" : "text-zinc-400"
    }`} />;
  }
  if (change.action !== "added" && change.action !== "removed") return <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400" />;
  const Icon = (change.icon && change.icon !== "generic" ? RELATIONSHIP_ICONS[change.icon] : undefined) ?? (change.action === "added" ? Link2 : Unlink);
  return <Icon className={`h-4 w-4 shrink-0 ${change.action === "added" ? "text-indigo-600" : "text-amber-700"}`} />;
}

/**
 * How often the card rolls into its own "sneak peek" of the linked
 * record's most recent change, and how long it holds there before rolling
 * back. Never runs at all without a `recentEvent` (no history yet), and
 * respects `prefers-reduced-motion` the same way any other autoplaying
 * transition in the app should -- the loop simply never starts.
 */
const PEEK_LOOP_MS = 8_000;
const PEEK_HOLD_MS = 2_800;

/** Cycles a card's preview between its live content and a brief look at its most recent History entry, on a fixed loop -- purely presentational, so it lives here rather than in a shared hook nothing else needs. */
function useHistorySneakPeek(enabled: boolean) {
  const [peeking, setPeeking] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let hold: ReturnType<typeof setTimeout>;
    const loop = setInterval(() => {
      setPeeking(true);
      hold = setTimeout(() => setPeeking(false), PEEK_HOLD_MS);
    }, PEEK_LOOP_MS);
    return () => { clearInterval(loop); clearTimeout(hold); setPeeking(false); };
  }, [enabled]);
  return peeking;
}

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
 *
 * `label` is a presentation-layer decoration (KD-049 §3), not something the
 * card owns intrinsically -- omitted everywhere except the Kinesis Links
 * section, which is the only caller that actually has a Kinesis Link label
 * to show. It renders as a fixed, neutral pill (never tinted to the
 * target's own module color) so it reads as "this is the relationship",
 * not as another property of the target itself.
 *
 * `recentEvent` is the History sneak peek: omitted (no History yet, or a
 * caller that doesn't have it in hand) and the card only ever shows its
 * live content, no loop, exactly as before this existed. Given one, the
 * card rolls into a brief look at that record's most recent change every
 * `PEEK_LOOP_MS`, holds it, then rolls back -- a vertical slide/fade
 * swap of the content only, never the card itself, so nothing here
 * spins or carousels.
 *
 * The peek itself is a "big diff": `recentEvent.change`'s two sides laid
 * out as a single before -> after line, connected by `DiffConnector` below
 * -- a direction-tinted arrow for a magnitude change, a type-specific icon
 * for a relationship's own added/removed, a struck-through "from" and muted
 * "to" for removed specifically. A retype gets a caption line naming the
 * target underneath, since its two labels alone don't say what they're
 * labeling. Not every event has a clean two-sided `change` at all (a
 * created or archived moment has nothing to diff) -- that case falls back
 * to the same title/detail line every other History surface shows.
 */
export function KinesisLinkCard({ option, stats = [], label, recentEvent, className = "" }: { option: LinkableObject; stats?: KinesisLinkPreviewStat[]; label?: string; recentEvent?: KinesisLinkRecentEvent; className?: string }) {
  const color = option.color ?? "#52525b";
  const BuiltIn = BUILT_IN_ICONS[option.type as keyof typeof BUILT_IN_ICONS];
  const icon = BuiltIn ? <BuiltIn className="h-5 w-5" /> : <CustomModuleIcon name={option.icon ?? "package"} className="h-5 w-5" />;
  const peeking = useHistorySneakPeek(Boolean(recentEvent));
  const { locale } = useFormatPreferences();

  return (
    <Link
      href={option.href}
      aria-label={`Open ${option.name} in ${option.module}`}
      style={{ "--kl-accent": color } as React.CSSProperties}
      className={`group flex min-h-20 min-w-0 flex-col justify-center rounded-[20px] border bg-white p-4 shadow-sm transition duration-200 ease-out border-[color-mix(in_srgb,var(--kl-accent)_28%,#e4e4e7)] hover:-translate-y-0.5 hover:scale-[1.01] hover:border-[color-mix(in_srgb,var(--kl-accent)_55%,#e4e4e7)] hover:shadow-lg active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${className}`}
    >
      {/* Both layers share one grid cell, so the card's own height follows
        * whichever is taller instead of jumping as the swap happens. */}
      <div className="grid">
        <div className={`col-start-1 row-start-1 min-w-0 transition-all duration-500 ease-out ${peeking ? "pointer-events-none -translate-y-1.5 opacity-0" : "translate-y-0 opacity-100"}`}>
          {label && (
            <span className="mb-2.5 inline-flex w-fit shrink-0 items-center self-start rounded-full border border-zinc-200 bg-white px-3.5 py-1 text-[13px] font-bold text-zinc-700">
              {label}
            </span>
          )}
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
        </div>
        {recentEvent && (
          <div className={`col-start-1 row-start-1 min-w-0 self-center transition-all duration-500 ease-out ${peeking ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1.5 opacity-0"}`}>
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide" style={{ color }}>Latest change</span>
            {recentEvent.change ? (
              <>
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <span className={`break-words text-base font-medium ${recentEvent.change.action === "removed" ? "text-zinc-400 line-through" : "text-zinc-400"}`}>{recentEvent.change.from}</span>
                  <DiffConnector change={recentEvent.change} />
                  <span className={`break-words text-lg font-bold tracking-tight ${recentEvent.change.action === "removed" ? "text-zinc-400" : "text-zinc-900"}`}>{recentEvent.change.to}</span>
                </div>
                {recentEvent.change.caption && <p className="mt-0.5 break-words text-sm text-zinc-500">{recentEvent.change.caption}</p>}
              </>
            ) : (
              <>
                <p className="break-words text-sm font-bold text-zinc-800">{recentEvent.title}</p>
                {recentEvent.detail && <p className="mt-0.5 break-words text-sm text-zinc-500">{recentEvent.detail}</p>}
              </>
            )}
            <p className="mt-1.5 text-xs text-zinc-400">{formatActivityTime(recentEvent.occurredAt, undefined, locale)}</p>
          </div>
        )}
      </div>
    </Link>
  );
}
