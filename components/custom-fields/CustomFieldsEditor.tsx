"use client";

import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELDS_FORM_KEY,
  type CustomFieldType,
  type CustomFieldValue,
  type KinesisLinkOption,
} from "@/lib/custom-fields/types";
import { KinesisLinkList } from "@/components/custom-fields/KinesisLinkField";
import { FIELD_INPUT_CLASS } from "@/components/custom-fields/field-styles";
import { parseDatedFieldValue } from "@/lib/calendar/dated-fields";
import { useFormResetKey } from "@/lib/hooks/form-reset-key";

type FieldPhase = "choosing" | "confirming" | "ready";
type EditorField = CustomFieldValue & { key: string; phase: FieldPhase; editingName: boolean };

const inputClass = FIELD_INPUT_CLASS;

function toDateInputValue(value: string) {
  const date = parseDatedFieldValue(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function buildFields(source: CustomFieldValue[]): EditorField[] {
  return source.map((field) => ({
    ...field,
    key: field.id ?? crypto.randomUUID(),
    type: field.type ?? "TEXT",
    // A date field now edits through a native <input type="date">, which
    // only ever shows a value already in yyyy-mm-dd. A value saved before
    // that change (dd/mm/yyyy) is parsed and reformatted here so opening
    // an old field for editing still shows its actual date instead of a
    // blank picker.
    value: field.type === "DATE" ? toDateInputValue(field.value) : field.value,
    phase: "ready",
    editingName: false,
  }));
}

export function CustomFieldsEditor({
  initialFields = [],
  linkOptions,
}: {
  initialFields?: CustomFieldValue[];
  linkOptions: KinesisLinkOption[];
}) {
  const [fields, setFields] = useState<EditorField[]>(() => buildFields(initialFields));

  // The saved field set can change out from under this editor -- "Add to
  // template" (EditCustomItemForm) moves one of these out of band, a save
  // elsewhere can add or remove extras too -- so it resyncs itself against
  // the ids actually present rather than the caller having to notice and
  // force a remount. Signature-based, not content-based: this only fires
  // when a field appears or disappears, never on every render, which would
  // also wipe out whatever's mid-edit here.
  const fieldSignature = initialFields.map((field) => field.id ?? "").join(",");
  const [syncedSignature, setSyncedSignature] = useState(fieldSignature);
  if (fieldSignature !== syncedSignature) {
    setSyncedSignature(fieldSignature);
    setFields(buildFields(initialFields));
  }

  const { fieldsetRef, resetRevision } = useFormResetKey();

  const update = (key: string, changes: Partial<EditorField>) => {
    setFields((current) =>
      current.map((field) => field.key === key ? { ...field, ...changes } : field),
    );
  };

  const addField = () => {
    const id = crypto.randomUUID();
    setFields((current) => [
      ...current,
      { id, key: id, label: "", value: "", phase: "choosing", editingName: false },
    ]);
  };

  const chooseType = (key: string, type: CustomFieldType) => {
    update(key, { type, phase: "confirming" });
    window.setTimeout(() => update(key, { phase: "ready", editingName: true }), 400);
  };

  // The one thing this whole editor submits: every ready, named field, as a
  // single JSON payload (KD-034) rather than positional FormData arrays.
  const payload = useMemo(
    () => JSON.stringify(
      fields
        .filter((field) => field.phase === "ready" && field.label.trim())
        .map(({ id, label, value, type, targetObjectIds }) => ({ id, label, value, type, targetObjectIds })),
    ),
    [fields],
  );

  return (
    <fieldset ref={fieldsetRef}>
      <legend className="sr-only">Custom fields</legend>
      <input type="hidden" name={CUSTOM_FIELDS_FORM_KEY} value={payload} />
      {fields.length > 0 && (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div
              key={`${field.key}:${resetRevision}`}
              className="grid min-h-11 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] items-start gap-2 transition-all"
            >
              <FieldIdentity
                field={field}
                index={index}
                chooseType={(type) => chooseType(field.key, type)}
                update={(changes) => update(field.key, changes)}
              />
              <FieldInput
                field={field}
                index={index}
                linkOptions={linkOptions}
                update={(changes) => update(field.key, changes)}
              />
              <button
                type="button"
                aria-label={`Remove field ${index + 1}`}
                onClick={() => setFields((current) => current.filter(({ key }) => key !== field.key))}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 outline-none transition hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-zinc-300"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={addField}
        className={`${fields.length ? "mt-3" : ""} inline-flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-600 outline-none transition hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-300`}
      >
        <Plus className="h-4 w-4" /> Add custom field
      </button>
    </fieldset>
  );
}

function FieldIdentity({ field, index, chooseType, update }: {
  field: EditorField;
  index: number;
  chooseType: (type: CustomFieldType) => void;
  update: (changes: Partial<EditorField>) => void;
}) {
  if (field.phase === "choosing") {
    return (
      <div className="relative">
        <select
          defaultValue=""
          onChange={(event) => chooseType(event.target.value as CustomFieldType)}
          aria-label={`Field ${index + 1} type`}
          className={`${inputClass} appearance-none pr-11`}
        >
          <option value="" disabled>Field type</option>
          {CUSTOM_FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      </div>
    );
  }

  if (field.phase === "confirming") {
    const label = CUSTOM_FIELD_TYPES.find(({ value }) => value === field.type)?.label;
    return (
      <div role="status" className="flex h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition-all">
        <Check className="h-4 w-4" /> {label}
      </div>
    );
  }

  if (!field.editingName && field.label.trim()) {
    return (
      <div className="flex h-11 min-w-0 items-center px-3">
        <button
          type="button"
          onDoubleClick={() => update({ editingName: true })}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "F2") update({ editingName: true });
          }}
          title="Double-click to rename"
          className="min-h-11 w-full truncate rounded-lg text-left text-sm font-medium text-zinc-700 outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
        >
          {field.label}
        </button>
      </div>
    );
  }

  return (
    <input
      value={field.label}
      onChange={(event) => update({ label: event.target.value })}
      onBlur={() => field.label.trim() && update({ editingName: false })}
      onKeyDown={(event) => {
        if (event.key === "Enter" && field.label.trim()) {
          event.preventDefault();
          update({ editingName: false });
        }
      }}
      aria-label={`Field ${index + 1} name`}
      placeholder="Field name"
      required
      className={inputClass}
    />
  );
}

function FieldInput({ field, index, linkOptions, update }: {
  field: EditorField;
  index: number;
  linkOptions: KinesisLinkOption[];
  update: (value: Partial<EditorField>) => void;
}) {
  if (field.phase !== "ready") {
    return <input disabled aria-label={`Field ${index + 1} value`} placeholder="Value" className={`${inputClass} bg-zinc-100 text-zinc-400`} />;
  }

  if (field.type === "KINESIS_LINK") {
    return (
      <KinesisLinkList
        options={linkOptions}
        values={field.targetObjectIds ?? []}
        onChange={(targetObjectIds) => update({ targetObjectIds })}
        ariaLabel={`Field ${index + 1} linked objects`}
      />
    );
  }

  if (field.type === "CHECKBOX") {
    return (
      <label className="flex h-11 items-center justify-end rounded-xl border border-zinc-200 bg-white px-4">
        <span className="sr-only">Checkbox value</span>
        <input type="checkbox" checked={field.value === "true"} onChange={(event) => update({ value: String(event.target.checked) })} className="h-5 w-5 rounded border-zinc-300" />
      </label>
    );
  }

  return (
    <input
      type={field.type === "NUMBER" ? "number" : field.type === "LINK" ? "url" : field.type === "DATE" ? "date" : "text"}
      value={field.value}
      onChange={(event) => update({ value: event.target.value })}
      aria-label={`Field ${index + 1} value`}
      placeholder={valuePlaceholder(field.type)}
      className={inputClass}
    />
  );
}

function valuePlaceholder(type?: CustomFieldType) {
  if (type === "NUMBER") return "Number";
  if (type === "LINK") return "https://…";
  return "Text";
}
