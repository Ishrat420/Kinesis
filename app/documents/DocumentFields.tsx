"use client";

import { Link2, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type CustomField = { id?: string; label: string; value: string };

export function DocumentFields({
  labels = {
    expiryDate: "Expiry date",
    issueDate: "Issue date",
    documentNumber: "Document number",
    country: "Country",
    notes: "Notes",
    link: "Link",
  },
  values = {},
  initialCustomFields = [],
  onExpiryDateChange,
}: {
  labels?: Record<"expiryDate" | "issueDate" | "documentNumber" | "country" | "notes" | "link", string>;
  values?: Partial<Record<"expiryDate" | "issueDate" | "documentNumber" | "country" | "notes" | "link", string>>;
  initialCustomFields?: CustomField[];
  onExpiryDateChange?: (value: string) => void;
}) {
  const [customFields, setCustomFields] = useState(initialCustomFields);

  return (
    <div className="space-y-4">
      <EditableField label={labels.expiryDate} labelName="expiryDateLabel" name="expiryDate" type="date" value={values.expiryDate} onChange={onExpiryDateChange} />
      <EditableField label={labels.issueDate} labelName="issueDateLabel" name="issueDate" type="date" value={values.issueDate} />
      <EditableField label={labels.documentNumber} labelName="documentNumberLabel" name="documentNumber" value={values.documentNumber} />
      <EditableField label={labels.country} labelName="countryLabel" name="country" value={values.country} />
      <EditableField label={labels.link} labelName="linkLabel" name="link" value={values.link} type="url" icon />
      <EditableField label={labels.notes} labelName="notesLabel" name="notes" value={values.notes} multiline />

      {customFields.map((field, index) => (
        <div key={field.id ?? index} className="grid grid-cols-[0.8fr_1.2fr_auto] gap-2">
          <EditableLabel name="customLabel" initialValue={field.label} ariaLabel={`Custom field ${index + 1} name`} placeholder="Field name" />
          <input name="customValue" defaultValue={field.value} aria-label={`Custom field ${index + 1} value`} placeholder="Value" className={inputClass} />
          <button type="button" aria-label={`Remove custom field ${index + 1}`} onClick={() => setCustomFields((fields) => fields.filter((_, itemIndex) => itemIndex !== index))} className="rounded-xl border border-zinc-200 px-3 text-zinc-500 hover:bg-zinc-50 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      <button type="button" onClick={() => setCustomFields((fields) => [...fields, { id: crypto.randomUUID(), label: "", value: "" }])} className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
        <Plus className="h-4 w-4" /> Add field
      </button>
    </div>
  );
}

const inputClass = "h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-400";

function EditableField({ label, labelName, name, value, type = "text", multiline = false, icon = false, onChange }: { label: string; labelName: string; name: string; value?: string; type?: string; multiline?: boolean; icon?: boolean; onChange?: (value: string) => void }) {
  return (
    <div className="grid grid-cols-[0.8fr_1.2fr] gap-2">
      <EditableLabel name={labelName} initialValue={label} ariaLabel={`${label} field name`} />
      {multiline ? (
        <textarea name={name} defaultValue={value} aria-label={label} rows={3} className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none transition focus:border-zinc-400" />
      ) : (
        <div className="relative">
          {icon && <Link2 aria-hidden="true" className="absolute left-3 top-3.5 h-4 w-4 text-zinc-400" />}
          <input name={name} type={type} defaultValue={value} onChange={(event) => onChange?.(event.target.value)} aria-label={label} placeholder={icon ? "https://example.com" : undefined} className={`${inputClass} ${icon ? "pl-10" : ""}`} />
        </div>
      )}
    </div>
  );
}

function EditableLabel({ name, initialValue, ariaLabel, placeholder }: { name: string; initialValue: string; ariaLabel: string; placeholder?: string }) {
  const [value, setValue] = useState(initialValue);
  const [editing, setEditing] = useState(!initialValue);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  if (editing) {
    return <input ref={input} name={name} value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => value.trim() && setEditing(false)} onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); if (value.trim()) setEditing(false); }
      if (event.key === "Escape" && initialValue) { setValue(initialValue); setEditing(false); }
    }} aria-label={ariaLabel} placeholder={placeholder} required className={inputClass} />;
  }

  return (
    <div className="flex h-11 items-center px-3">
      <input type="hidden" name={name} value={value} />
      <button type="button" onDoubleClick={() => setEditing(true)} title="Double-click to edit field name" className="w-full cursor-default truncate text-left text-sm font-medium text-zinc-600 outline-none focus-visible:ring-2 focus-visible:ring-zinc-300">
        {value}
      </button>
    </div>
  );
}
