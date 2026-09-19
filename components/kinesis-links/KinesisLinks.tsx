"use client";

import { useActionState, useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { KinesisLinkCard } from "@/components/custom-fields/KinesisLinkCard";
import { CUSTOM_KINESIS_LINK_OPTION_VALUE, KINESIS_LINK_DIRECTION_OPTIONS, kinesisLinkDirectionValue } from "@/lib/objects/relationship-labels";
import type { LinkableObject } from "@/lib/objects/locations";
import type { KinesisLink } from "@/lib/data/object-relationships";
import type { KinesisLinkPreviewStat } from "@/lib/data/kinesis-links";
import type { KinesisLinkActionState } from "@/app/actions";

const SELECT_CLASS = "h-11 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-medium outline-none focus:border-zinc-500";

/**
 * The generalized form of the Goal-only `LinkedGoals` (KD-049 Phase 2,
 * retired in Phase 4 once Goals moved onto this component): the same one
 * canonical row, derived-label pattern, now usable from any Object's page
 * rather than only a Goal's. Multiple Kinesis Links to the same target are
 * expected (Phase 1's uniqueness is per-type, not per-pair), so unlike the
 * old goal picker, `options` never drops an already-linked object -- a
 * second, differently-typed link to the same target is a normal thing to
 * add, not a duplicate to prevent.
 *
 * One flat list (KD-049 §4): the label already reads correctly from
 * whichever side this Object sits on, so there is no separate "outgoing"/
 * "Referenced by" split to maintain. Each link carries its own label as a
 * decoration on its card (KD-049 §3, Phase 3) rather than a shared group
 * heading -- a card reads correctly on its own, without depending on which
 * heading it happens to sit under.
 */
export function KinesisLinks({ links, options, previews, addAction, updateAction, removeAction }: {
  links: KinesisLink[];
  options: LinkableObject[];
  /** The same KD-042 rich-preview data every other Kinesis Link card on this page already shows -- keyed by objectId, so a linked target reads with exactly as much detail here as it does anywhere else. */
  previews: Record<string, KinesisLinkPreviewStat[]>;
  addAction: (state: KinesisLinkActionState, data: FormData) => Promise<KinesisLinkActionState>;
  updateAction: (linkId: string, data: FormData) => Promise<void>;
  removeAction: (linkId: string) => Promise<void>;
}) {
  const [state, formAction] = useActionState(addAction, {});
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const totalLinks = links.length;

  const saveLink = async (linkId: string, data: FormData) => {
    await updateAction(linkId, data);
    setEditingId(null);
  };

  if (!totalLinks && !options.length) return null;

  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      {totalLinks > 0 && <div className="flex items-center gap-3"><h2 className="text-xl font-semibold">Kinesis Links</h2><span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500">{totalLinks}</span></div>}
      {options.length > 0 && !creating && <button type="button" onClick={() => setCreating(true)} className="flex h-10 items-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800"><Plus className="h-4 w-4" /> Add Kinesis Link</button>}
    </div>

    {creating && options.length > 0 && (
      <form action={formAction} className={`grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] ${totalLinks > 0 ? "mt-5" : "mt-3"}`}>
        <DirectionField />
        <TargetPicker options={options} />
        <div className="flex gap-2"><button className="flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Add link</button><button type="button" onClick={() => setCreating(false)} aria-label="Cancel adding Kinesis Link" className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-200"><X className="h-4 w-4" /></button></div>
        {state.error && <p role="alert" className="text-sm font-medium text-red-600 sm:col-span-3">{state.error}</p>}
      </form>
    )}

    {totalLinks > 0 && <div className="mt-5 space-y-2">
      {links.map((link) => editingId === link.id ? (
        <form key={link.id} action={(data) => saveLink(link.id, data)} className="flex w-full flex-col gap-2 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3 sm:flex-row sm:items-center">
          <DirectionField defaultValue={link.type === "CUSTOM" ? CUSTOM_KINESIS_LINK_OPTION_VALUE : kinesisLinkDirectionValue(link.type, link.inverse)} defaultCustomLabel={link.customLabel ?? ""} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-700">{link.target.name}</span>
          <div className="flex gap-2"><button className="h-10 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white">Save</button><button type="button" onClick={() => setEditingId(null)} className="flex h-10 items-center justify-center gap-1 rounded-xl px-3 text-sm font-medium text-zinc-500 hover:bg-zinc-100"><X className="h-4 w-4" /> Cancel</button></div>
        </form>
      ) : (
        <div key={link.id} className="flex items-center gap-2">
          <KinesisLinkCard option={link.target} label={link.label} className="flex-1" stats={previews[link.target.objectId] ?? []} />
          <details className="relative shrink-0">
            <summary aria-label={`Actions for the Kinesis Link to ${link.target.name}`} className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 [&::-webkit-details-marker]:hidden"><MoreHorizontal className="h-5 w-5" /></summary>
            <div className="absolute right-0 z-10 mt-1 w-48 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg">
              <button type="button" onClick={() => setEditingId(link.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50"><Pencil className="h-4 w-4" /> Change relationship</button>
              <form action={removeAction.bind(null, link.id)}><button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Remove link</button></form>
            </div>
          </details>
        </div>
      ))}
    </div>}
  </div>;
}

/** The 8-direction + Custom picker, revealing a free-text input the moment Custom is chosen (KD-049 §6). */
function DirectionField({ defaultValue, defaultCustomLabel }: { defaultValue?: string; defaultCustomLabel?: string }) {
  const [value, setValue] = useState(defaultValue ?? KINESIS_LINK_DIRECTION_OPTIONS[0].value);
  const isCustom = value === CUSTOM_KINESIS_LINK_OPTION_VALUE;
  return <>
    <select name="direction" aria-label="Relationship" value={value} onChange={(event) => setValue(event.target.value)} className={`${SELECT_CLASS} min-w-44`}>
      {KINESIS_LINK_DIRECTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      <option value={CUSTOM_KINESIS_LINK_OPTION_VALUE}>Custom…</option>
    </select>
    {isCustom && <input name="customLabel" required defaultValue={defaultCustomLabel} placeholder="Type a label" aria-label="Custom Kinesis Link label" className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-zinc-500" />}
  </>;
}

/** Grouped by module, matching the order `getKinesisLinkOptions` already returns. */
function TargetPicker({ options }: { options: LinkableObject[] }) {
  const modules = [...new Set(options.map((option) => option.module))];
  return (
    <select name="targetObjectId" required aria-label="Object to link" defaultValue="" className={`${SELECT_CLASS} min-w-0`}>
      <option value="" disabled>Select something to link</option>
      {modules.map((module) => (
        <optgroup key={module} label={module}>
          {options.filter((option) => option.module === module).map((option) => <option key={option.objectId} value={option.objectId}>{option.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
