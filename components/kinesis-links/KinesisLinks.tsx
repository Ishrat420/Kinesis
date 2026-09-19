"use client";

import { useRef, useState } from "react";
import { ChevronDown, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { KinesisLinkCard } from "@/components/custom-fields/KinesisLinkCard";
import { LinkCombobox } from "@/components/custom-fields/KinesisLinkField";
import { CUSTOM_KINESIS_LINK_OPTION_VALUE, KINESIS_LINK_DIRECTION_OPTIONS, kinesisLinkDirectionValue } from "@/lib/objects/relationship-labels";
import type { LinkableObject } from "@/lib/objects/locations";
import type { KinesisLink } from "@/lib/data/object-relationships";
import type { KinesisLinkPreviewStat } from "@/lib/data/kinesis-links";

const SELECT_CLASS = "h-11 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-medium outline-none focus:border-zinc-500";

/**
 * The generalized form of the Goal-only `LinkedGoals` (KD-049 Phase 2,
 * retired in Phase 4 once Goals moved onto this component): the same one
 * canonical row, derived-label pattern, now usable from any Object's page
 * rather than only a Goal's.
 *
 * One flat list (KD-049 §4): the label already reads correctly from
 * whichever side this Object sits on, so there is no separate "outgoing"/
 * "Referenced by" split to maintain. Each link carries its own label as a
 * decoration on its card (KD-049 §3, Phase 3) rather than a shared group
 * heading.
 *
 * KD-050: this is display and edit/remove only -- adding a Kinesis Link
 * happens through "Add custom field -> Kinesis Link" (`CustomFieldsEditor`)
 * now, not a picker owned by this component, so there is no header, count,
 * "Add Kinesis Link" button, or `options`/`addAction` here anymore. A
 * caller wanting a heading over this list supplies its own.
 */
export function KinesisLinks({ links, previews, updateAction, removeAction }: {
  links: KinesisLink[];
  /** The same KD-042 rich-preview data every other Kinesis Link card on this page already shows -- keyed by objectId, so a linked target reads with exactly as much detail here as it does anywhere else. */
  previews: Record<string, KinesisLinkPreviewStat[]>;
  updateAction: (linkId: string, data: FormData) => Promise<void>;
  removeAction: (linkId: string) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  // Only one row is ever in edit mode at a time, so one shared ref is
  // enough to read back whichever row currently holds it.
  const editRowRef = useRef<HTMLDivElement>(null);

  /**
   * Not a real `<form>`: this component renders both standalone (the read
   * view) and inside `CustomFieldsEditor`, which already lives inside the
   * record's own outer form -- and HTML forms cannot nest. Reading the row's
   * named fields straight off the DOM (rather than from a `FormData`-from-
   * `<form>` a submit event would give for free) works identically in
   * either context.
   */
  const saveLink = async (linkId: string) => {
    const row = editRowRef.current;
    if (!row) return;
    const data = new FormData();
    row.querySelectorAll<HTMLSelectElement | HTMLInputElement>("[name]").forEach((field) => data.append(field.name, field.value));
    await updateAction(linkId, data);
    setEditingId(null);
  };

  if (!links.length) return null;

  return <div className="space-y-2">
    {links.map((link) => editingId === link.id ? (
      <div key={link.id} ref={editRowRef} className="flex w-full flex-col gap-2 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3 sm:flex-row sm:items-center">
        <DirectionField defaultValue={link.type === "CUSTOM" ? CUSTOM_KINESIS_LINK_OPTION_VALUE : kinesisLinkDirectionValue(link.type, link.inverse)} defaultCustomLabel={link.customLabel ?? ""} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-700">{link.target.name}</span>
        <div className="flex gap-2"><button type="button" onClick={() => saveLink(link.id)} className="h-10 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white">Save</button><button type="button" onClick={() => setEditingId(null)} className="flex h-10 items-center justify-center gap-1 rounded-xl px-3 text-sm font-medium text-zinc-500 hover:bg-zinc-100"><X className="h-4 w-4" /> Cancel</button></div>
      </div>
    ) : (
      <div key={link.id} className="flex items-center gap-2">
        <KinesisLinkCard option={link.target} label={link.label} className="flex-1" stats={previews[link.target.objectId] ?? []} />
        <details className="relative shrink-0">
          <summary aria-label={`Actions for the Kinesis Link to ${link.target.name}`} className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 [&::-webkit-details-marker]:hidden"><MoreHorizontal className="h-5 w-5" /></summary>
          <div className="absolute right-0 z-10 mt-1 w-48 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg">
            <button type="button" onClick={() => setEditingId(link.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50"><Pencil className="h-4 w-4" /> Change relationship</button>
            <button type="button" onClick={() => removeAction(link.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Remove link</button>
          </div>
        </details>
      </div>
    ))}
  </div>;
}

/** A `<select>` with the app's own custom-chevron treatment (matching `CustomFieldsEditor`'s own type picker, `DocumentTypeSelect`, etc.) instead of the browser's native dropdown arrow. */
function ChevronSelect({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { className: string }) {
  return (
    <div className="relative min-w-0">
      <select {...props} className={`${className} appearance-none pr-10`}>{children}</select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
    </div>
  );
}

/**
 * The 8-direction + Custom picker, revealing a free-text input the moment
 * Custom is chosen (KD-049 §6). Exported so the "Add custom field ->
 * Kinesis Link" flow (KD-050) can reuse the exact same picker rather than
 * a second, drifting implementation. `className` lets a caller in a
 * different visual context (e.g. `CustomFieldsEditor`'s taller, bordered
 * fields) match its own surroundings rather than inheriting this
 * component's own compact default.
 */
export function DirectionField({ defaultValue, defaultCustomLabel, className = SELECT_CLASS }: { defaultValue?: string; defaultCustomLabel?: string; className?: string }) {
  const [value, setValue] = useState(defaultValue ?? KINESIS_LINK_DIRECTION_OPTIONS[0].value);
  const isCustom = value === CUSTOM_KINESIS_LINK_OPTION_VALUE;
  return <>
    <ChevronSelect name="direction" aria-label="Relationship" value={value} onChange={(event) => setValue(event.target.value)} className={`${className} min-w-44`}>
      {KINESIS_LINK_DIRECTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      <option value={CUSTOM_KINESIS_LINK_OPTION_VALUE}>Custom…</option>
    </ChevronSelect>
    {isCustom && <input name="customLabel" required defaultValue={defaultCustomLabel} placeholder="Type a label" aria-label="Custom Kinesis Link label" className={`${className} min-w-0 flex-1`} />}
  </>;
}

/**
 * The same searchable `LinkCombobox` every other object picker in the app
 * uses (KD-050), not a plain `<select>` -- an account with even a couple
 * dozen linkable records makes scrolling an `<optgroup>` list impractical,
 * and this is now the only way to add a typed Kinesis Link.
 *
 * `targetObjectId` submits through a hidden input rather than the combobox
 * itself, since `LinkCombobox` has no form-native output of its own. Native
 * `required` validation does nothing on a hidden input per the HTML5 spec,
 * so `addKinesisLinkAction` is the real backstop ("Choose something to
 * link.").
 */
export function TargetPicker({ options, className = SELECT_CLASS }: { options: LinkableObject[]; className?: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = options.find((option) => option.objectId === selectedId) ?? null;

  return (
    <div className="min-w-0">
      <input type="hidden" name="targetObjectId" value={selectedId ?? ""} />
      {selected ? (
        <div className={`${className} flex items-center justify-between gap-2`}>
          <span className="min-w-0 truncate text-sm font-medium text-zinc-900">{selected.name}</span>
          <button type="button" onClick={() => setSelectedId(null)} aria-label="Change target" className="shrink-0 text-zinc-400 transition hover:text-zinc-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <LinkCombobox options={options} ariaLabel="Object to link" placeholder="Select something to link" onChange={setSelectedId} />
      )}
    </div>
  );
}
