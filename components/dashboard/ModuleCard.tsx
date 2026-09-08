"use client";

import Link from "next/link";
import { GripVertical, X } from "lucide-react";

/**
 * One shortcut on the dashboard's Module Shortcuts grid.
 *
 * Documents, Goals, Finance, Relationships and a pinned custom module all draw
 * the same card -- tinted badge, drag handle, a name over one or two lines of
 * detail, and an arrow in the corner. That shell used to exist as four separate
 * copies of the same markup, which is how they drifted: one lost its transition
 * duration, only one had a focus ring. What actually differs between them is
 * here as props; nothing else should be.
 */
type ModuleCardProps = {
  icon: React.ElementType;
  /** The badge's tint: a Tailwind class for a built-in module, or a custom module's own colour. */
  tone: { className: string } | { color: string };
  name: string;
  href: string;
  meta: string;
  /** A second line under `meta`. Omitted by the custom module card, which has only the one. */
  detail?: string;
  /** Given only for a pinned custom module, which can be taken back off the grid. */
  onRemove?: () => void;
};

const SHELL = "group relative h-full rounded-2xl border border-zinc-200/80 bg-white p-4 pb-10 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md";
const FOCUS_RING = "rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

export function ModuleCard({ icon: Icon, tone, name, href, meta, detail, onRemove }: ModuleCardProps) {
  const badge = (
    <span
      className={`flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-700 ${"className" in tone ? tone.className : ""}`}
      style={"color" in tone ? { backgroundColor: `color-mix(in srgb, ${tone.color} 10%, white)` } : undefined}
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
  const grip = <GripVertical className="h-5 w-5 cursor-grab text-zinc-300" aria-label={`Drag ${name}`} />;
  const arrow = <span className="absolute bottom-4 right-4 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-700">→</span>;
  const text = (
    <>
      <p className="font-semibold text-zinc-900">{name}</p>
      <p className="mt-1 text-sm text-zinc-500">{meta}</p>
      {detail !== undefined && <p className="text-sm text-zinc-400">{detail}</p>}
    </>
  );

  // A remove button cannot sit inside an anchor, so a card that carries one
  // links from its text block rather than as a whole.
  if (onRemove) {
    return (
      <div className={SHELL}>
        <div className="flex items-start justify-between">
          {badge}
          <div className="flex items-center gap-1">
            {grip}
            <button type="button" onClick={onRemove} aria-label={`Remove ${name} shortcut`} className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-950">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <Link href={href} className={`mt-4 block ${FOCUS_RING}`}>{text}</Link>
        {arrow}
      </div>
    );
  }

  return (
    <Link href={href} className={`block ${SHELL} ${FOCUS_RING}`}>
      <div className="flex items-start justify-between">{badge}{grip}</div>
      <div className="mt-4">{text}</div>
      {arrow}
    </Link>
  );
}
