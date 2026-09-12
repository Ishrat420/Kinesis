import type { KinesisLinkPreviewStat } from "@/lib/data/kinesis-links";

/**
 * The stat tiles for a rich Kinesis Link preview (KD-042) -- shared by the
 * live card (below its header row, behind a divider the card renders itself)
 * and the Template settings page's live preview (standalone, no header to
 * divide from), so the two can never drift apart on how a value actually
 * renders. Tiles sit together and wrap rather than stretching a label/value
 * pair across the full width: a lone linked field's card can stretch to
 * fill an entire row, and a value pinned hard right against a label pinned
 * hard left would leave a dead gap between them at that width.
 */
export function PreviewStats({ stats }: { stats: KinesisLinkPreviewStat[] }) {
  if (!stats.length) return null;

  return (
    <div className="flex flex-wrap gap-x-7 gap-y-3">
      {stats.map((stat, index) => (
        <div key={index} className="flex min-w-0 flex-col gap-0.5">
          <span className="whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">{stat.label}</span>
          {stat.kind === "status" ? (
            <span className="inline-block w-fit rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-700">{stat.value}</span>
          ) : (
            <span className="max-w-full truncate text-sm font-bold text-zinc-800">{stat.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}
