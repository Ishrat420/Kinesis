"use client";

import { useMemo, useState } from "react";
import { PreviewStats } from "@/components/custom-fields/PreviewStats";
import { resolveKind, formatPreviewValue } from "@/lib/custom-fields/kinds";
import type { CustomFieldType, NumberFieldFormat } from "@/lib/custom-fields/types";
import { TEMPLATE_PREVIEW_FIELDS_FORM_KEY } from "@/lib/templates/parse";

const MAX_PREVIEW_FIELDS = 3;

type PreviewableField = { id: string; label: string; type: CustomFieldType; numberFormat?: NumberFieldFormat; isDueDate: boolean };
type SampleValues = { dueDate: string; values: Record<string, { value: string; linkCount: number }> } | null;

/** A placeholder raw value per kind, used only when nothing exists under the template yet to show a real one. */
function placeholderRaw(kind: ReturnType<typeof resolveKind>, todayIso: string): { value?: string; linkCount?: number } {
  switch (kind) {
    case "date": {
      const date = new Date(todayIso);
      date.setUTCDate(date.getUTCDate() + 21);
      return { value: date.toISOString().slice(0, 10) };
    }
    case "number": return { value: "42" };
    case "currency": return { value: "1234" };
    case "percent": return { value: "12.5" };
    case "status": return { value: "Example" };
    case "text": return { value: "Example text" };
    case "link-count": return { linkCount: 2 };
    default: return {};
  }
}

/**
 * "Show on card" (KD-042) -- lives on the template's *own* saved field list,
 * independent of any not-yet-saved edits happening in the field editor above
 * it on the same page: a brand-new field can be picked as a preview field
 * only after it's been saved once and has a real id, the same constraint
 * `numberFormat`/`multiline` don't have but a genuinely new row does (there
 * is nothing yet to reference).
 */
export function PreviewFieldsPicker({ fields, initialSelected, sample, locale, currency, today }: {
  fields: PreviewableField[];
  initialSelected: string[];
  sample: SampleValues;
  locale: string;
  currency: string;
  today: string;
}) {
  const eligible = useMemo(() => fields.filter((field) => resolveKind(field.type, field.numberFormat) !== null), [fields]);
  const eligibleIds = useMemo(() => new Set(eligible.map((field) => field.id)), [eligible]);
  const [selected, setSelected] = useState<string[]>(() => initialSelected.filter((id) => eligibleIds.has(id)).slice(0, MAX_PREVIEW_FIELDS));

  const toggle = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((existing) => existing !== id) : current.length < MAX_PREVIEW_FIELDS ? [...current, id] : current);
  };

  const previewStats = useMemo(() => selected.flatMap((id) => {
    const field = eligible.find((candidate) => candidate.id === id);
    if (!field) return [];
    const kind = resolveKind(field.type, field.numberFormat);
    if (!kind) return [];
    const raw = field.isDueDate
      ? { value: sample?.dueDate }
      : sample?.values[id] ?? (sample ? undefined : placeholderRaw(kind, today));
    if (!raw) return [];
    const formatted = formatPreviewValue(kind, raw, { locale, currency, today: new Date(today) });
    return formatted !== null ? [{ label: field.label, kind, value: formatted }] : [];
  }), [selected, eligible, sample, locale, currency, today]);

  return (
    <fieldset className="border-t border-zinc-100 pt-6">
      <input type="hidden" name={TEMPLATE_PREVIEW_FIELDS_FORM_KEY} value={JSON.stringify(selected)} />
      <legend className="text-sm font-semibold">Linked card preview</legend>
      <p className="mt-1 text-sm text-zinc-500">Choose up to 3 fields to show on this template&rsquo;s linked cards, instead of just its name.</p>

      {eligible.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-zinc-200 px-3 py-2 text-sm text-zinc-400">
          No field on this template can be previewed yet -- Checkbox and Link fields aren&rsquo;t eligible.
        </p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {eligible.map((field) => {
            const checked = selected.includes(field.id);
            const disabled = !checked && selected.length >= MAX_PREVIEW_FIELDS;
            return (
              <label key={field.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${disabled ? "opacity-40" : "hover:bg-zinc-50"}`}>
                <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(field.id)} className="h-4 w-4 rounded border-zinc-300" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-700">{field.label}</span>
                <span className="text-xs font-medium text-zinc-400">{field.isDueDate ? "Due date" : field.type === "TEXT" ? "Text" : field.type === "NUMBER" ? "Number" : field.type === "DATE" ? "Date" : "Kinesis Link"}</span>
              </label>
            );
          })}
        </div>
      )}

      {selected.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Preview{!sample && " (example values -- no item under this template yet)"}</p>
          <div className="max-w-xs rounded-2xl border border-zinc-200 bg-white p-4">
            <PreviewStats stats={previewStats} />
          </div>
        </div>
      )}
    </fieldset>
  );
}
