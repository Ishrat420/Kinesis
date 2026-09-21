"use client";

import { useMemo, useState } from "react";
import { Check, Clock3 } from "lucide-react";
import { KinesisLinkList } from "./KinesisLinkField";
import { CHECKBOX_INPUT_CLASS, FIELD_INPUT_CLASS } from "./field-styles";
import type { CustomFieldType, KinesisLinkOption, NumberFieldFormat } from "@/lib/custom-fields/types";
import type { KinesisLinkPreviewStat } from "@/lib/data/kinesis-links";
import { TEMPLATE_FIELD_VALUES_FORM_KEY } from "@/lib/templates/parse";
import { parseDatedFieldValue } from "@/lib/calendar/dated-fields";
import { LINK_LIMIT, NOTES_LIMIT, TEXT_LIMIT } from "@/lib/validation/field-limits";

export type TemplateFieldValue = { templateFieldId: string; label: string; type: CustomFieldType; isDueDate: boolean; multiline: boolean; numberFormat?: NumberFieldFormat; value: string; targetObjectIds: string[] };

function toDateInputValue(value: string) {
  const date = parseDatedFieldValue(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function buildValues(fields: TemplateFieldValue[]) {
  return fields.map((field) => ({ ...field, value: field.type === "DATE" ? toDateInputValue(field.value) : field.value }));
}

/**
 * An object's values for the template it follows (KD-035 Phase 3) --
 * always present, in the template's own order, every time it's rendered:
 * label and type come from the template, live, and are never editable
 * here. Only the value is this object's own. Unlike `CustomFieldsEditor`,
 * there is no add/rename/reorder/remove -- those are template edits, made
 * from Settings, not from an individual object.
 *
 * `fields` can change out from under this component -- "Add to template"
 * (`EditCustomItemForm`) turns one of this object's own extras into a new
 * entry here -- so it resyncs itself against the current field-id set
 * rather than the caller having to notice and force a remount. Only the
 * identity set is compared, not the full content: this must not fire on
 * every render, which would also wipe out whatever value is mid-edit here.
 */
export function TemplateFieldValues({ fields, linkOptions, previews = {} }: { fields: TemplateFieldValue[]; linkOptions: KinesisLinkOption[]; previews?: Record<string, KinesisLinkPreviewStat[]> }) {
  const [values, setValues] = useState(() => buildValues(fields));

  const fieldSignature = fields.map((field) => field.templateFieldId).join(",");
  const [syncedSignature, setSyncedSignature] = useState(fieldSignature);
  if (fieldSignature !== syncedSignature) {
    setSyncedSignature(fieldSignature);
    setValues(buildValues(fields));
  }

  const update = (templateFieldId: string, changes: Partial<TemplateFieldValue>) => {
    setValues((current) => current.map((field) => field.templateFieldId === templateFieldId ? { ...field, ...changes } : field));
  };

  const payload = useMemo(
    () => JSON.stringify(values.map(({ templateFieldId, value, targetObjectIds }) => ({ templateFieldId, value, targetObjectIds }))),
    [values],
  );

  if (!values.length) return null;

  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">Template fields</legend>
      <input type="hidden" name={TEMPLATE_FIELD_VALUES_FORM_KEY} value={payload} />
      {values.map((field) => (
        <div key={field.templateFieldId} className="grid min-w-0 grid-cols-1 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-h-11 min-w-0 items-center gap-1.5 px-3 py-1">
            {field.isDueDate && <Clock3 className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
            <span className="min-w-0 break-words text-sm font-medium text-zinc-700">{field.label}</span>
          </div>
          <FieldValueInput field={field} onChange={(changes) => update(field.templateFieldId, changes)} linkOptions={linkOptions} previews={previews} />
        </div>
      ))}
    </fieldset>
  );
}

function FieldValueInput({ field, onChange, linkOptions, previews }: { field: TemplateFieldValue; onChange: (changes: Partial<TemplateFieldValue>) => void; linkOptions: KinesisLinkOption[]; previews: Record<string, KinesisLinkPreviewStat[]> }) {
  if (field.type === "KINESIS_LINK") {
    return <KinesisLinkList options={linkOptions} values={field.targetObjectIds} onChange={(targetObjectIds) => onChange({ targetObjectIds })} ariaLabel={`${field.label} linked objects`} previews={previews} />;
  }

  if (field.type === "CHECKBOX") {
    return (
      <label className="flex h-11 items-center justify-end px-4">
        <span className="sr-only">{field.label}</span>
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <input type="checkbox" checked={field.value === "true"} onChange={(event) => onChange({ value: String(event.target.checked) })} className={CHECKBOX_INPUT_CLASS} />
          <Check aria-hidden="true" className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100" />
        </span>
      </label>
    );
  }

  if (field.multiline) {
    return (
      <textarea
        value={field.value}
        onChange={(event) => onChange({ value: event.target.value })}
        aria-label={field.label}
        placeholder="Notes"
        rows={5}
        maxLength={NOTES_LIMIT}
        className="w-full min-w-0 resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-base outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 sm:text-sm"
      />
    );
  }

  return (
    <input
      type={field.type === "NUMBER" ? "number" : field.type === "LINK" ? "url" : field.type === "DATE" ? "date" : "text"}
      value={field.value}
      onChange={(event) => onChange({ value: event.target.value })}
      aria-label={field.label}
      placeholder={field.type === "NUMBER" ? "Number" : field.type === "LINK" ? "https://…" : "Text"}
      maxLength={field.type === "LINK" ? LINK_LIMIT : field.type === "NUMBER" || field.type === "DATE" ? undefined : TEXT_LIMIT}
      className={FIELD_INPUT_CLASS}
    />
  );
}
