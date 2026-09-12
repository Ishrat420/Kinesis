"use client";

import { ArrowDown, ArrowUp, ChevronDown, Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { CUSTOM_FIELD_TYPES, NUMBER_FIELD_FORMATS, type CustomFieldType, type NumberFieldFormat } from "@/lib/custom-fields/types";
import { TEMPLATE_FIELDS_FORM_KEY, type TemplateFieldInput } from "@/lib/templates/parse";
import { FIELD_INPUT_CLASS } from "@/components/custom-fields/field-styles";
import { useFormResetKey } from "@/lib/hooks/form-reset-key";

type EditorField = TemplateFieldInput & { key: string };

/** The dropdown's sentinel value for Due Date -- not a real `CustomFieldType`, since a due-date field is still `type: "DATE"` underneath (KD-038), just with `isDueDate: true` alongside it. */
const DUE_DATE_OPTION = "DUE_DATE";

/** The Format control's own "no refinement" option, alongside the two real `NumberFieldFormat` values. */
const NUMBER_FORMAT_OPTIONS: { value: NumberFieldFormat | undefined; label: string; example: string }[] = [
  { value: undefined, label: "Plain", example: "42" },
  ...NUMBER_FIELD_FORMATS,
];

/**
 * A template's field *definitions* -- label and type, never a value. Every
 * object following this template reads these live (KD-035 Decision 1/7), so
 * add / rename / reorder are always available; type change and remove are
 * disabled together, with one reason, whenever `locked` is true (Decision 7:
 * at least one object currently uses the template). There is no per-field
 * distinction -- the whole set locks or unlocks as one.
 *
 * The Due Date field (KD-038 / ADR-011, revised by KD-040) is still never
 * convertible into or out of -- but rather than a separate button, "◷ Due
 * date" is a selectable option in a *new*, not-yet-saved row's own type
 * dropdown, since choosing it there converts nothing (the row has no prior
 * type to convert from). An *existing*, already-saved field's dropdown never
 * offers it, at any point, editable or not -- and once a row is the Due
 * Date field, its own dropdown goes back to being a disabled, single-option
 * control, the same locked look every field's dropdown already gets once a
 * template is in use, just unconditional from the moment it's created.
 */
export function TemplateFieldsEditor({ initialFields, locked }: { initialFields: TemplateFieldInput[]; locked: boolean }) {
  const [fields, setFields] = useState<EditorField[]>(
    initialFields.map((field) => ({ ...field, key: field.id ?? crypto.randomUUID() })),
  );
  const { fieldsetRef, resetRevision } = useFormResetKey();

  const update = (key: string, changes: Partial<EditorField>) => {
    setFields((current) => current.map((field) => field.key === key ? { ...field, ...changes } : field));
  };
  const move = (index: number, direction: -1 | 1) => {
    setFields((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const addField = () => {
    const key = crypto.randomUUID();
    setFields((current) => [...current, { key, label: "", type: "TEXT" }]);
  };
  const chooseType = (key: string, value: CustomFieldType | typeof DUE_DATE_OPTION, currentLabel: string) => {
    if (value === DUE_DATE_OPTION) {
      update(key, { type: "DATE", isDueDate: true, label: currentLabel.trim() || "Due date", numberFormat: undefined });
    } else {
      // Format only ever means something on a NUMBER field -- leaving the
      // type drops whatever refinement was chosen rather than carrying a
      // now-meaningless value along.
      update(key, { type: value, numberFormat: value === "NUMBER" ? fields.find((field) => field.key === key)?.numberFormat : undefined });
    }
  };
  const hasDueDateField = fields.some((field) => field.isDueDate);

  const payload = useMemo(
    () => JSON.stringify(fields.filter((field) => field.label.trim()).map(({ id, label, type, isDueDate, numberFormat }) => ({ id, label, type, isDueDate, numberFormat }))),
    [fields],
  );

  return (
    <fieldset ref={fieldsetRef}>
      <legend className="text-sm font-semibold">Fields</legend>
      <input type="hidden" name={TEMPLATE_FIELDS_FORM_KEY} value={payload} />

      {locked && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This template is in use, so its fields can&rsquo;t be retyped or removed. You can still rename, reorder, or add fields.
        </p>
      )}

      {fields.length > 0 && (
        <div className="mt-3 space-y-2">
          {fields.map((field, index) => (
            <div key={`${field.key}:${resetRevision}`} className="grid min-w-0 grid-cols-1 items-center gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <input
                value={field.label}
                onChange={(event) => update(field.key, { label: event.target.value })}
                aria-label={`Field ${index + 1} name`}
                placeholder="Field name"
                required
                className={FIELD_INPUT_CLASS}
              />
              {field.isDueDate ? (
                <div className="relative min-w-0">
                  <select disabled value={DUE_DATE_OPTION} aria-label={`Field ${index + 1} type`} title="A Due Date field can't be changed into or out of another type." className={`${FIELD_INPUT_CLASS} appearance-none pr-11 disabled:bg-zinc-100 disabled:text-zinc-400`}>
                    <option value={DUE_DATE_OPTION}>◷ Due date</option>
                  </select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                </div>
              ) : (
                <div className="relative min-w-0">
                  <select
                    value={field.type}
                    disabled={locked}
                    onChange={(event) => chooseType(field.key, event.target.value as CustomFieldType | typeof DUE_DATE_OPTION, field.label)}
                    aria-label={`Field ${index + 1} type`}
                    title={locked ? "This template is in use, so a field's type can't be changed." : undefined}
                    className={`${FIELD_INPUT_CLASS} appearance-none pr-11 disabled:bg-zinc-100 disabled:text-zinc-400`}
                  >
                    {CUSTOM_FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                    {/* Only offered on a brand-new, not-yet-saved row -- an
                        existing field's dropdown never gets this option, at
                        any point, which is what keeps "no conversion, ever"
                        true (KD-038/ADR-011, amended by KD-040). */}
                    {!field.id && !hasDueDateField && <option value={DUE_DATE_OPTION}>◷ Due date</option>}
                  </select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                </div>
              )}
              <div className="flex w-full items-center justify-end gap-1 md:w-auto">
                <button type="button" aria-label={`Move field ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)} className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 outline-none transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:ring-2 focus-visible:ring-zinc-300 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" aria-label={`Move field ${index + 1} down`} disabled={index === fields.length - 1} onClick={() => move(index, 1)} className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 outline-none transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:ring-2 focus-visible:ring-zinc-300 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button
                  type="button"
                  aria-label={`Remove field ${index + 1}`}
                  disabled={locked}
                  title={locked ? "This template is in use, so a field can't be removed." : undefined}
                  onClick={() => setFields((current) => current.filter(({ key }) => key !== field.key))}
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 outline-none transition hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-zinc-300 disabled:pointer-events-none disabled:opacity-30"
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>
              {field.type === "NUMBER" && (
                <div className="flex flex-wrap items-center gap-2 pl-0.5 md:col-span-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Format</span>
                  <div className="inline-flex gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1">
                    {NUMBER_FORMAT_OPTIONS.map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        aria-pressed={field.numberFormat === option.value}
                        onClick={() => update(field.key, { numberFormat: option.value })}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                          field.numberFormat === option.value ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-white hover:text-zinc-800"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <span className="ml-auto text-xs text-zinc-400">e.g. {NUMBER_FORMAT_OPTIONS.find((option) => option.value === field.numberFormat)?.example}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className={`${fields.length ? "mt-3" : "mt-2"} flex flex-wrap items-center gap-2`}>
        <button
          type="button"
          onClick={addField}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-600 outline-none transition hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-300"
        >
          <Plus className="h-4 w-4" /> Add field
        </button>
      </div>
    </fieldset>
  );
}
