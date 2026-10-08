"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Clock3, Repeat2 } from "lucide-react";
import { KinesisLinkList } from "./KinesisLinkField";
import { CHECKBOX_INPUT_CLASS, FIELD_INPUT_CLASS } from "./field-styles";
import type { CustomFieldType, KinesisLinkOption, NumberFieldFormat } from "@/lib/custom-fields/types";
import type { KinesisLinkPreviewStat } from "@/lib/data/kinesis-links";
import { TEMPLATE_FIELD_VALUES_FORM_KEY } from "@/lib/templates/parse";
import { parseDatedFieldValue } from "@/lib/calendar/dated-fields";
import { LINK_LIMIT, NOTES_LIMIT, TEXT_LIMIT } from "@/lib/validation/field-limits";
import { RECURRENCE_DAYS_MAX, RECURRENCE_OPTIONS, type Recurrence } from "@/lib/custom-modules/recurrence";

/**
 * `isRecurringDueDate`/`recurrence` (KD-055): a Recurring Due Date field's
 * `value` is the item's current `dueDate`, like a Due Date field's, and
 * `recurrence` is its stored repeat rule -- null for every other field, and
 * for a recurring one nobody has filled in yet.
 */
export type TemplateFieldValue = { templateFieldId: string; label: string; type: CustomFieldType; isDueDate: boolean; isRecurringDueDate: boolean; recurrence: Recurrence | null; multiline: boolean; numberFormat?: NumberFieldFormat; value: string; targetObjectIds: string[] };

function toDateInputValue(value: string) {
  const date = parseDatedFieldValue(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

/** A field's in-progress edit state -- for a Recurring Due Date field, the two Repeats inputs as raw strings alongside its date. */
type EditableValue = TemplateFieldValue & { recurrenceRule: string; recurrenceDays: string };

function buildValues(fields: TemplateFieldValue[]): EditableValue[] {
  return fields.map((field) => ({
    ...field,
    value: field.type === "DATE" ? toDateInputValue(field.value) : field.value,
    recurrenceRule: field.recurrence?.rule ?? "",
    recurrenceDays: field.recurrence?.days ? String(field.recurrence.days) : "",
  }));
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

  const update = (templateFieldId: string, changes: Partial<EditableValue>) => {
    setValues((current) => current.map((field) => field.templateFieldId === templateFieldId ? { ...field, ...changes } : field));
  };

  const payload = useMemo(
    () => JSON.stringify(values.map(({ templateFieldId, value, targetObjectIds, isRecurringDueDate, recurrenceRule, recurrenceDays }) => (
      isRecurringDueDate ? { templateFieldId, value, targetObjectIds, recurrenceRule, recurrenceDays } : { templateFieldId, value, targetObjectIds }
    ))),
    [values],
  );

  if (!values.length) return null;

  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">Template fields</legend>
      <input type="hidden" name={TEMPLATE_FIELD_VALUES_FORM_KEY} value={payload} />
      {/*
        Stacked -- label above a full-width control -- the same layout as the
        Name field these always sit under, rather than a label/value split that
        squeezed every input into half the form's width. A checkbox is the
        exception: it reads as one row, label and toggle together.
      */}
      {values.map((field) => field.type === "CHECKBOX" ? (
        <FieldValueInput key={field.templateFieldId} field={field} onChange={(changes) => update(field.templateFieldId, changes)} linkOptions={linkOptions} previews={previews} />
      ) : (
        <div key={field.templateFieldId} className="min-w-0">
          <div className="mb-2 flex min-w-0 items-center gap-1.5 text-sm font-semibold text-zinc-900">
            {field.isDueDate && <Clock3 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
            {field.isRecurringDueDate && <Repeat2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
            <span className="min-w-0 break-words">{field.label}</span>
          </div>
          <FieldValueInput field={field} onChange={(changes) => update(field.templateFieldId, changes)} linkOptions={linkOptions} previews={previews} />
        </div>
      ))}
    </fieldset>
  );
}

function FieldValueInput({ field, onChange, linkOptions, previews }: { field: EditableValue; onChange: (changes: Partial<EditableValue>) => void; linkOptions: KinesisLinkOption[]; previews: Record<string, KinesisLinkPreviewStat[]> }) {
  if (field.isRecurringDueDate) return <RecurringDueDateInput field={field} onChange={onChange} />;

  if (field.type === "KINESIS_LINK") {
    return <KinesisLinkList options={linkOptions} values={field.targetObjectIds} onChange={(targetObjectIds) => onChange({ targetObjectIds })} ariaLabel={`${field.label} linked objects`} previews={previews} />;
  }

  if (field.type === "CHECKBOX") {
    return (
      <label className="flex h-[50px] cursor-pointer items-center justify-between gap-3 rounded-xl border-[1.5px] border-zinc-200 bg-white px-3.5 transition hover:bg-zinc-50">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-zinc-900">
          {field.isDueDate && <Clock3 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
          <span className="min-w-0 truncate">{field.label}</span>
        </span>
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <input type="checkbox" checked={field.value === "true"} onChange={(event) => onChange({ value: String(event.target.checked) })} className={CHECKBOX_INPUT_CLASS} />
          <Check aria-hidden="true" className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100" />
        </span>
      </label>
    );
  }

  if (field.multiline) {
    return (
      <textarea spellCheck
        value={field.value}
        onChange={(event) => onChange({ value: event.target.value })}
        aria-label={field.label}
        placeholder="Notes"
        rows={4}
        maxLength={NOTES_LIMIT}
        className="w-full min-w-0 resize-y rounded-xl border-[1.5px] border-zinc-200 bg-white px-3.5 py-3 text-base outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10 sm:text-sm"
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

/**
 * A Recurring Due Date field's two questions (KD-055 Decision 3): the date of
 * the current occurrence, and how often it repeats -- with N asked for only
 * once "Every N days" is chosen. Both are required together; the save action
 * says so rather than this form blocking submission.
 */
function RecurringDueDateInput({ field, onChange }: { field: EditableValue; onChange: (changes: Partial<EditableValue>) => void }) {
  const everyNDays = field.recurrenceRule === "EVERY_N_DAYS";
  return (
    <div className="space-y-2">
      <input type="date" value={field.value} onChange={(event) => onChange({ value: event.target.value })} aria-label={`${field.label} date`} className={FIELD_INPUT_CLASS} />
      <div className={`grid min-w-0 gap-2 ${everyNDays ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className="relative min-w-0">
          <select value={field.recurrenceRule} onChange={(event) => onChange({ recurrenceRule: event.target.value })} aria-label={`${field.label} repeats`} className={`${FIELD_INPUT_CLASS} appearance-none pr-11`}>
            <option value="">Repeats…</option>
            {RECURRENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        </div>
        {everyNDays && (
          <input type="number" inputMode="numeric" min={1} max={RECURRENCE_DAYS_MAX} step={1} value={field.recurrenceDays} onChange={(event) => onChange({ recurrenceDays: event.target.value })} aria-label={`${field.label}: repeat every how many days`} placeholder="N (days)" className={FIELD_INPUT_CLASS} />
        )}
      </div>
    </div>
  );
}
