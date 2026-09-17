"use client";

import { Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CustomFieldsEditor } from "@/components/custom-fields/CustomFieldsEditor";
import type { CustomFieldValue, KinesisLinkOption } from "@/lib/custom-fields/types";
import type { KinesisLinkPreviewStat } from "@/lib/data/kinesis-links";

export type CustomField = CustomFieldValue;

/** `size="lg"` is the bordered/roomy treatment used by the create-document
 * dialog; the default stays exactly as it was for the edit form, which
 * shares this component and isn't part of that redesign. */
type FieldSize = "default" | "lg";

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
  previews,
  size = "default",
}: {
  labels?: Record<"expiryDate" | "issueDate" | "documentNumber" | "country" | "notes" | "link", string>;
  values?: Partial<Record<"expiryDate" | "issueDate" | "documentNumber" | "country" | "notes" | "link", string>>;
  initialCustomFields?: CustomField[];
  onExpiryDateChange?: (value: string) => void;
  linkOptions: KinesisLinkOption[];
  previews?: Record<string, KinesisLinkPreviewStat[]>;
  size?: FieldSize;
}) {
  return (
    <div className="space-y-4">
      <EditableField size={size} label={labels.expiryDate} labelName="expiryDateLabel" name="expiryDate" type="date" value={values.expiryDate} onChange={onExpiryDateChange} />
      <EditableField size={size} label={labels.issueDate} labelName="issueDateLabel" name="issueDate" type="date" value={values.issueDate} />
      <EditableField size={size} label={labels.documentNumber} labelName="documentNumberLabel" name="documentNumber" value={values.documentNumber} />
      <EditableField size={size} label={labels.country} labelName="countryLabel" name="country" value={values.country} />
      <EditableField size={size} label={labels.link} labelName="linkLabel" name="link" value={values.link} type="url" icon />
      <EditableField size={size} label={labels.notes} labelName="notesLabel" name="notes" value={values.notes} multiline />

      <CustomFieldsEditor initialFields={initialCustomFields} linkOptions={linkOptions} previews={previews} />
    </div>
  );
}

const inputClass = "h-11 min-w-0 w-full rounded-xl border border-zinc-200 px-3 text-base outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 sm:text-sm";
const inputClassLg = "h-[50px] min-w-0 w-full rounded-xl border-[1.5px] border-zinc-200 bg-white px-3.5 text-base text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/15 sm:text-sm";

function EditableField({ label, labelName, name, value, type = "text", multiline = false, icon = false, onChange, size = "default" }: { label: string; labelName: string; name: string; value?: string; type?: string; multiline?: boolean; icon?: boolean; onChange?: (value: string) => void; size?: FieldSize }) {
  const lg = size === "lg";
  return (
    <div className={`grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] ${lg ? "sm:items-center" : ""}`}>
      <EditableLabel name={labelName} initialValue={label} ariaLabel={`${label} field name`} size={size} />
      {multiline ? (
        <textarea name={name} defaultValue={value} aria-label={label} rows={3} className={lg ? `${inputClassLg} min-h-[92px] resize-y py-3` : "min-h-11 min-w-0 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-base outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 sm:text-sm"} />
      ) : (
        <div className="relative min-w-0">
          {icon && <Link2 aria-hidden="true" className={`absolute left-3 ${lg ? "top-1/2 -translate-y-1/2" : "top-3.5"} h-4 w-4 text-zinc-400`} />}
          <input name={name} type={type} defaultValue={value} onChange={(event) => onChange?.(event.target.value)} aria-label={label} placeholder={icon ? "https://example.com" : undefined} className={`${lg ? inputClassLg : inputClass} ${icon ? "pl-10" : ""}`} />
        </div>
      )}
    </div>
  );
}

function EditableLabel({ name, initialValue, ariaLabel, placeholder, size = "default" }: { name: string; initialValue: string; ariaLabel: string; placeholder?: string; size?: FieldSize }) {
  const [value, setValue] = useState(initialValue);
  const [editing, setEditing] = useState(!initialValue);
  const input = useRef<HTMLInputElement>(null);
  const lg = size === "lg";

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  if (editing) {
    return <input ref={input} name={name} value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => value.trim() && setEditing(false)} onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); if (value.trim()) setEditing(false); }
      if (event.key === "Escape" && initialValue) { setValue(initialValue); setEditing(false); }
    }} aria-label={ariaLabel} placeholder={placeholder} required className={lg ? inputClassLg : inputClass} />;
  }

  return (
    <div className={`flex ${lg ? "min-h-[50px]" : "min-h-11"} min-w-0 items-center px-3 py-1`}>
      <input type="hidden" name={name} value={value} />
      <button type="button" onDoubleClick={() => setEditing(true)} title="Double-click to edit field name" className={`${lg ? "min-h-[50px] text-sm font-semibold text-zinc-900" : "min-h-11 text-sm font-medium text-zinc-600"} min-w-0 w-full cursor-default whitespace-normal break-words rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-zinc-300`}>
        {value}
      </button>
    </div>
  );
}
