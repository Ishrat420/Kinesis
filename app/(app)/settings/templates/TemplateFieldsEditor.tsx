"use client";

import { ArrowDown, ArrowUp, Check, ChevronDown, Clock3, Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { CUSTOM_FIELD_TYPES, type CustomFieldType } from "@/lib/custom-fields/types";
import { TEMPLATE_FIELDS_FORM_KEY, type TemplateFieldInput } from "@/lib/templates/parse";
import { FIELD_INPUT_CLASS } from "@/components/custom-fields/field-styles";

type EditorField = TemplateFieldInput & { key: string };

/**
 * A template's field *definitions* -- label and type, never a value. Every
 * object following this template reads these live (KD-035 Decision 1/7), so
 * add / rename / reorder are always available; type change and remove are
 * disabled together, with one reason, whenever `locked` is true (Decision 7:
 * at least one object currently uses the template). There is no per-field
 * distinction -- the whole set locks or unlocks as one.
 *
 * The one exception is the Due Date field (KD-038 / ADR-011): a distinct
 * kind of field, added through its own button rather than the type
 * dropdown, and never convertible into or out of -- its row never shows a
 * type control at all, locked or not.
 */
export function TemplateFieldsEditor({ initialFields, locked }: { initialFields: TemplateFieldInput[]; locked: boolean }) {
  const [fields, setFields] = useState<EditorField[]>(
    initialFields.map((field) => ({ ...field, key: field.id ?? crypto.randomUUID() })),
  );

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
  const addDueDateField = () => {
    const key = crypto.randomUUID();
    setFields((current) => [...current, { key, label: "Due date", type: "DATE", isDueDate: true }]);
  };
  const hasDueDateField = fields.some((field) => field.isDueDate);

  const payload = useMemo(
    () => JSON.stringify(fields.filter((field) => field.label.trim()).map(({ id, label, type, isDueDate }) => ({ id, label, type, isDueDate }))),
    [fields],
  );

  return (
    <fieldset>
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
            <div key={field.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
              <input
                value={field.label}
                onChange={(event) => update(field.key, { label: event.target.value })}
                aria-label={`Field ${index + 1} name`}
                placeholder="Field name"
                required
                className={FIELD_INPUT_CLASS}
              />
              {field.isDueDate ? (
                <div className={`flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm font-medium text-zinc-600`}>
                  <Clock3 className="h-4 w-4 text-zinc-400" /> Due date
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={field.type}
                    disabled={locked}
                    onChange={(event) => update(field.key, { type: event.target.value as CustomFieldType })}
                    aria-label={`Field ${index + 1} type`}
                    title={locked ? "This template is in use, so a field's type can't be changed." : undefined}
                    className={`${FIELD_INPUT_CLASS} appearance-none pr-11 disabled:bg-zinc-100 disabled:text-zinc-400`}
                  >
                    {CUSTOM_FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                </div>
              )}
              <div className="flex items-center gap-1">
                <button type="button" aria-label={`Move field ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)} className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" aria-label={`Move field ${index + 1} down`} disabled={index === fields.length - 1} onClick={() => move(index, 1)} className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button
                  type="button"
                  aria-label={`Remove field ${index + 1}`}
                  disabled={locked}
                  title={locked ? "This template is in use, so a field can't be removed." : undefined}
                  onClick={() => setFields((current) => current.filter(({ key }) => key !== field.key))}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30"
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={`${fields.length ? "mt-3" : "mt-2"} flex flex-wrap items-center gap-2`}>
        <button
          type="button"
          onClick={addField}
          className="inline-flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-600 transition hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-950"
        >
          <Plus className="h-4 w-4" /> Add field
        </button>
        {hasDueDateField ? (
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-zinc-400"
          >
            <Clock3 className="h-4 w-4" /> Due date <Check className="h-4 w-4" /> Added
          </button>
        ) : (
          <button
            type="button"
            onClick={addDueDateField}
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-600 transition hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-950"
          >
            <Clock3 className="h-4 w-4" /> Add due date field
          </button>
        )}
      </div>
    </fieldset>
  );
}
