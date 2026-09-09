"use client";

import { useMemo, useState } from "react";
import { KinesisLinkList } from "./KinesisLinkField";
import { FIELD_INPUT_CLASS } from "./field-styles";
import type { CustomFieldType, KinesisLinkOption } from "@/lib/custom-fields/types";
import { TEMPLATE_FIELD_VALUES_FORM_KEY } from "@/lib/templates/parse";
import { parseDatedFieldValue } from "@/lib/calendar/dated-fields";

export type TemplateFieldValue = { templateFieldId: string; label: string; type: CustomFieldType; value: string; targetObjectIds: string[] };

function toDateInputValue(value: string) {
  const date = parseDatedFieldValue(value);
  return date ? date.toISOString().slice(0, 10) : "";
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
 * entry here -- but that's a separate action, not this component editing
 * its own props, so the object detail page keys this component off the
 * current field list rather than this component watching for the change
 * itself: a changed key remounts it fresh against the new list, the same
 * way `CustomFieldsEditor` is keyed there for its own extras.
 */
export function TemplateFieldValues({ fields, linkOptions }: { fields: TemplateFieldValue[]; linkOptions: KinesisLinkOption[] }) {
  const [values, setValues] = useState(() => fields.map((field) => ({ ...field, value: field.type === "DATE" ? toDateInputValue(field.value) : field.value })));

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
        <div key={field.templateFieldId} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-2">
          <div className="flex h-11 min-w-0 items-center px-3"><span className="truncate text-sm font-medium text-zinc-700">{field.label}</span></div>
          <FieldValueInput field={field} onChange={(changes) => update(field.templateFieldId, changes)} linkOptions={linkOptions} />
        </div>
      ))}
    </fieldset>
  );
}

function FieldValueInput({ field, onChange, linkOptions }: { field: TemplateFieldValue; onChange: (changes: Partial<TemplateFieldValue>) => void; linkOptions: KinesisLinkOption[] }) {
  if (field.type === "KINESIS_LINK") {
    return <KinesisLinkList options={linkOptions} values={field.targetObjectIds} onChange={(targetObjectIds) => onChange({ targetObjectIds })} ariaLabel={`${field.label} linked objects`} />;
  }

  if (field.type === "CHECKBOX") {
    return (
      <label className="flex h-11 items-center justify-end rounded-xl border border-zinc-200 bg-white px-4">
        <span className="sr-only">{field.label}</span>
        <input type="checkbox" checked={field.value === "true"} onChange={(event) => onChange({ value: String(event.target.checked) })} className="h-5 w-5 rounded border-zinc-300" />
      </label>
    );
  }

  return (
    <input
      type={field.type === "NUMBER" ? "number" : field.type === "LINK" ? "url" : field.type === "DATE" ? "date" : "text"}
      value={field.value}
      onChange={(event) => onChange({ value: event.target.value })}
      aria-label={field.label}
      placeholder={field.type === "NUMBER" ? "Number" : field.type === "LINK" ? "https://…" : "Text"}
      className={FIELD_INPUT_CLASS}
    />
  );
}
