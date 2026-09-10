"use client";

import { Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CustomFieldsEditor } from "@/components/custom-fields/CustomFieldsEditor";
import type { CustomFieldValue, KinesisLinkOption } from "@/lib/custom-fields/types";

export type CustomField = CustomFieldValue;

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
  linkOptions,
}: {
  labels?: Record<"expiryDate" | "issueDate" | "documentNumber" | "country" | "notes" | "link", string>;
  values?: Partial<Record<"expiryDate" | "issueDate" | "documentNumber" | "country" | "notes" | "link", string>>;
  initialCustomFields?: CustomField[];
  onExpiryDateChange?: (value: string) => void;
  linkOptions: KinesisLinkOption[];
}) {
  return (
    <div className="space-y-4">
      <EditableField label={labels.expiryDate} labelName="expiryDateLabel" name="expiryDate" type="date" value={values.expiryDate} onChange={onExpiryDateChange} />
      <EditableField label={labels.issueDate} labelName="issueDateLabel" name="issueDate" type="date" value={values.issueDate} />
      <EditableField label={labels.documentNumber} labelName="documentNumberLabel" name="documentNumber" value={values.documentNumber} />
      <EditableField label={labels.country} labelName="countryLabel" name="country" value={values.country} />
      <EditableField label={labels.link} labelName="linkLabel" name="link" value={values.link} type="url" icon />
      <EditableField label={labels.notes} labelName="notesLabel" name="notes" value={values.notes} multiline />

      <CustomFieldsEditor initialFields={initialCustomFields} linkOptions={linkOptions} />
    </div>
  );
}

const inputClass = "h-11 min-w-0 w-full rounded-xl border border-zinc-200 px-3 text-base outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 sm:text-sm";

function EditableField({ label, labelName, name, value, type = "text", multiline = false, icon = false, onChange }: { label: string; labelName: string; name: string; value?: string; type?: string; multiline?: boolean; icon?: boolean; onChange?: (value: string) => void }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <EditableLabel name={labelName} initialValue={label} ariaLabel={`${label} field name`} />
      {multiline ? (
        <textarea name={name} defaultValue={value} aria-label={label} rows={3} className="min-h-11 min-w-0 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-base outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 sm:text-sm" />
      ) : (
        <div className="relative min-w-0">
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
    <div className="flex min-h-11 min-w-0 items-center px-3 py-1">
      <input type="hidden" name={name} value={value} />
      <button type="button" onDoubleClick={() => setEditing(true)} title="Double-click to edit field name" className="min-h-11 min-w-0 w-full cursor-default whitespace-normal break-words rounded-lg text-left text-sm font-medium text-zinc-600 outline-none focus-visible:ring-2 focus-visible:ring-zinc-300">
        {value}
      </button>
    </div>
  );
}
