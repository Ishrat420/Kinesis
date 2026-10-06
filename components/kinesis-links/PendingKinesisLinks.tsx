"use client";

import { useEffect, useRef, useState } from "react";
import { Link2, Minus, Plus, X } from "lucide-react";
import { DirectionField, TargetPicker } from "./KinesisLinks";
import { CUSTOM_KINESIS_LINK_OPTION_VALUE, KINESIS_LINK_DIRECTION_OPTIONS } from "@/lib/objects/relationship-labels";
import type { LinkableObject } from "@/lib/objects/locations";

const INPUT_CLASS = "h-[50px] w-full rounded-xl border-[1.5px] border-zinc-200 bg-white px-3.5 text-base text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10 sm:text-sm";

type Pending = { key: number; direction: string; customLabel: string; targetObjectId: string };

/**
 * Kinesis Links picked on a create form, before the record exists to link
 * from (a new Finance item's): each picked link waits in this list and is
 * submitted with the form, as one JSON field (`kinesisLinks`), to be created
 * alongside the record. The same relationship and target pickers as every
 * other "Add link".
 *
 * Like "Add custom field → Kinesis Link", a link chosen but not yet added
 * with "+" blocks the form's own submit, so it can't be silently left behind.
 */
export function PendingKinesisLinks({ loadOptions }: { loadOptions: () => Promise<LinkableObject[]> }) {
  const [options, setOptions] = useState<LinkableObject[] | null>(null);
  const [links, setLinks] = useState<Pending[]>([]);
  const [adding, setAdding] = useState(false);
  const [draftKey, setDraftKey] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const draftRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const nextKey = useRef(0);

  useEffect(() => {
    let active = true;
    loadOptions().then((loaded) => { if (active) setOptions(loaded); }).catch(() => { if (active) setOptions([]); });
    return () => { active = false; };
  }, [loadOptions]);

  const draftValue = (name: string) => draftRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? "";

  const addDraft = () => {
    const targetObjectId = draftValue("targetObjectId");
    const direction = draftValue("direction");
    const customLabel = draftValue("customLabel").trim();
    if (!targetObjectId) return setWarning("Choose something to link.");
    if (direction === CUSTOM_KINESIS_LINK_OPTION_VALUE && !customLabel) return setWarning("Type a label for this link.");
    if (links.some((link) => link.targetObjectId === targetObjectId && link.direction === direction && link.customLabel === customLabel)) return setWarning("That link is already in the list.");
    setLinks((current) => [...current, { key: nextKey.current++, direction, customLabel, targetObjectId }]);
    setWarning(null);
    setAdding(false);
    setDraftKey((key) => key + 1);
  };

  // A chosen-but-not-added link would otherwise be dropped by the form's own
  // submit; refuse that submit until it's added or cancelled.
  useEffect(() => {
    if (!adding) return;
    const form = draftRef.current?.closest("form");
    if (!form) return;
    const guard = (event: SubmitEvent) => {
      if (!draftValue("targetObjectId")) return;
      event.preventDefault();
      setWarning("Add or remove this link before saving -- it hasn't been added yet.");
      addButtonRef.current?.focus();
    };
    form.addEventListener("submit", guard);
    return () => form.removeEventListener("submit", guard);
  }, [adding]);

  const describe = (link: Pending) => {
    const relationship = link.direction === CUSTOM_KINESIS_LINK_OPTION_VALUE ? link.customLabel : KINESIS_LINK_DIRECTION_OPTIONS.find((option) => option.value === link.direction)?.label ?? "";
    const target = options?.find((option) => option.objectId === link.targetObjectId);
    return { relationship, name: target?.name ?? "", module: target?.module ?? "" };
  };

  return (
    <div>
      <input type="hidden" name="kinesisLinks" value={JSON.stringify(links.map(({ direction, customLabel, targetObjectId }) => ({ direction, customLabel, targetObjectId })))} />
      {links.length > 0 && (
        <ul className="mb-2 space-y-2">
          {links.map((link) => {
            const { relationship, name, module } = describe(link);
            return (
              <li key={link.key} className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5">
                <Link2 className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="mr-1.5 rounded-full border border-zinc-200 px-2 py-0.5 text-xs font-bold text-zinc-700">{relationship}</span>
                  <span className="font-semibold text-zinc-900">{name}</span>
                  {module && <span className="text-zinc-400"> · {module}</span>}
                </span>
                <button type="button" onClick={() => setLinks((current) => current.filter((item) => item.key !== link.key))} aria-label={`Remove the link to ${name}`} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-600">
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {adding ? (
        <div key={draftKey} ref={draftRef} className="grid gap-3 rounded-xl border-[1.5px] border-dashed border-zinc-300 bg-white p-4 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]">
          <DirectionField className={INPUT_CLASS} />
          <TargetPicker options={options ?? []} className={INPUT_CLASS} />
          <div className="flex gap-2">
            <button ref={addButtonRef} type="button" onClick={addDraft} aria-label="Add this link" className={`flex h-[50px] w-[50px] items-center justify-center rounded-xl bg-zinc-950 text-white outline-none transition ${warning ? "ring-2 ring-red-500 ring-offset-2" : ""}`}>
              <Plus className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => { setAdding(false); setWarning(null); }} aria-label="Cancel adding a link" className="flex h-[50px] w-[50px] items-center justify-center rounded-xl text-zinc-400 outline-none transition hover:bg-red-50 hover:text-red-600">
              <Minus className="h-4 w-4" />
            </button>
          </div>
          {warning && <p role="alert" className="text-sm font-medium text-red-600 sm:col-span-3">{warning}</p>}
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-dashed border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-600 outline-none transition hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-300">
          <Plus className="h-4 w-4" aria-hidden="true" />Add link
        </button>
      )}
    </div>
  );
}
