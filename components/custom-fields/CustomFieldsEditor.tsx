"use client";

import Link from "next/link";
import { Check, Minus, Plus } from "lucide-react";
import { useState } from "react";
import {
  CUSTOM_FIELD_TYPES,
  type CustomFieldType,
  type CustomFieldValue,
  type KinesisLinkOption,
} from "@/lib/custom-fields/types";

type FieldPhase = "choosing" | "confirming" | "ready";
type EditorField = CustomFieldValue & { key: string; phase: FieldPhase; editingName: boolean };
type FieldNames = { id: string; label: string; type: string; value: string; target: string };

const inputClass = "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100";
const defaultNames: FieldNames = {
  id: "fieldId",
  label: "fieldLabel",
  type: "fieldType",
  value: "fieldValue",
  target: "fieldTarget",
};

export function CustomFieldsEditor({
  initialFields = [],
  linkOptions,
  names = defaultNames,
}: {
  initialFields?: CustomFieldValue[];
  linkOptions: KinesisLinkOption[];
  names?: FieldNames;
}) {
  const [fields, setFields] = useState<EditorField[]>(
    initialFields.map((field) => ({
      ...field,
      key: field.id ?? crypto.randomUUID(),
      type: field.type ?? "TEXT",
      phase: "ready",
      editingName: false,
    })),
  );

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

  return (
    <fieldset>
      <legend className="sr-only">Custom fields</legend>
      <button
        type="button"
        onClick={addField}
        className="inline-flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-600 transition hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-950"
      >
        <Plus className="h-4 w-4" /> Add Custom field
      </button>

      {fields.length > 0 && (
        <div className="mt-3 space-y-2">
          {fields.map((field, index) => (
            <div
              key={field.key}
              className="grid min-h-14 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] items-start gap-2 rounded-2xl border border-zinc-100 bg-zinc-50/50 p-2 transition-all"
            >
              <FieldIdentity
                field={field}
                index={index}
                names={names}
                chooseType={(type) => chooseType(field.key, type)}
                update={(changes) => update(field.key, changes)}
              />
              <FieldInput
                field={field}
                index={index}
                linkOptions={linkOptions}
                names={names}
                update={(changes) => update(field.key, changes)}
              />
              <button
                type="button"
                aria-label={`Remove field ${index + 1}`}
                onClick={() => setFields((current) => current.filter(({ key }) => key !== field.key))}
                className="flex h-11 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-red-50 hover:text-red-600"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function FieldIdentity({ field, index, names, chooseType, update }: {
  field: EditorField;
  index: number;
  names: FieldNames;
  chooseType: (type: CustomFieldType) => void;
  update: (changes: Partial<EditorField>) => void;
}) {
  if (field.phase === "choosing") {
    return (
      <select
        defaultValue=""
        onChange={(event) => chooseType(event.target.value as CustomFieldType)}
        aria-label={`Field ${index + 1} type`}
        className={inputClass}
      >
        <option value="" disabled>Field type</option>
        {CUSTOM_FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
      </select>
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
        <input type="hidden" name={names.id} value={field.id ?? ""} />
        <input type="hidden" name={names.type} value={field.type} />
        <input type="hidden" name={names.label} value={field.label} />
        <button
          type="button"
          onDoubleClick={() => update({ editingName: true })}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "F2") update({ editingName: true });
          }}
          title="Double-click to rename"
          className="w-full truncate text-left text-sm font-medium text-zinc-700 outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
        >
          {field.label}
        </button>
      </div>
    );
  }

  return (
    <>
      <input type="hidden" name={names.id} value={field.id ?? ""} />
      <input type="hidden" name={names.type} value={field.type} />
      <input
        name={names.label}
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
    </>
  );
}

function FieldInput({ field, index, linkOptions, names, update }: {
  field: EditorField;
  index: number;
  linkOptions: KinesisLinkOption[];
  names: FieldNames;
  update: (value: Partial<EditorField>) => void;
}) {
  if (field.phase !== "ready") {
    return <input disabled aria-label={`Field ${index + 1} value`} placeholder="Value" className={`${inputClass} bg-zinc-100 text-zinc-400`} />;
  }

  if (field.type === "KINESIS_LINK") {
    const selected = field.targetType && field.targetId ? `${field.targetType}:${field.targetId}` : "";
    const modules = [...new Set(linkOptions.map(({ module }) => module))];
    const selectedOption = linkOptions.find((option) => `${option.type}:${option.id}` === selected);
    return (
      <div>
        <input type="hidden" name={names.value} value="" />
        <select
          required
          name={names.target}
          value={selected}
          onChange={(event) => {
            const [targetType, ...id] = event.target.value.split(":");
            update({ targetType: targetType as CustomFieldValue["targetType"], targetId: id.join(":") });
          }}
          aria-label={`Field ${index + 1} linked object`}
          className={inputClass}
        >
          <option value="">Select object ↗</option>
          {modules.map((module) => (
            <optgroup key={module} label={module}>
              {linkOptions.filter((option) => option.module === module).map((option) => (
                <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>{option.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {selectedOption && <Link href={selectedOption.href} className="mt-1 block truncate text-xs font-medium text-blue-700 hover:underline">Open {selectedOption.module} → {selectedOption.name}</Link>}
      </div>
    );
  }

  return (
    <>
      <input type="hidden" name={names.target} value="" />
      {field.type === "CHECKBOX" ? (
        <label className="flex h-11 items-center justify-end rounded-xl border border-zinc-200 bg-white px-4">
          <span className="sr-only">Checkbox value</span>
          <input type="hidden" name={names.value} value={field.value === "true" ? "true" : "false"} />
          <input type="checkbox" checked={field.value === "true"} onChange={(event) => update({ value: String(event.target.checked) })} className="h-5 w-5 rounded border-zinc-300" />
        </label>
      ) : (
        <input
          name={names.value}
          type={field.type === "NUMBER" ? "number" : field.type === "LINK" ? "url" : "text"}
          inputMode={field.type === "DATE" ? "numeric" : undefined}
          pattern={field.type === "DATE" ? "[0-9]{2}/[0-9]{2}/[0-9]{4}" : undefined}
          value={field.value}
          onChange={(event) => update({ value: event.target.value })}
          aria-label={`Field ${index + 1} value`}
          placeholder={valuePlaceholder(field.type)}
          className={inputClass}
        />
      )}
    </>
  );
}

function valuePlaceholder(type?: CustomFieldType) {
  if (type === "NUMBER") return "Number";
  if (type === "DATE") return "dd/mm/yyyy";
  if (type === "LINK") return "https://…";
  return "Text";
}
