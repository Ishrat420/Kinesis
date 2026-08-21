"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

export type CustomField = { id?: string; label: string; value: string };

export function DocumentFields({
  labels = {
    expiryDate: "Expiry date",
    issueDate: "Issue date",
    documentNumber: "Document number",
    country: "Country",
    notes: "Notes",
  },
  values = {},
  initialCustomFields = [],
}: {
  labels?: Record<"expiryDate" | "issueDate" | "documentNumber" | "country" | "notes", string>;
  values?: Partial<Record<"expiryDate" | "issueDate" | "documentNumber" | "country" | "notes", string>>;
  initialCustomFields?: CustomField[];
}) {
  const [customFields, setCustomFields] = useState(initialCustomFields);

  return (
    <div className="space-y-4">
      <EditableField label={labels.expiryDate} labelName="expiryDateLabel" name="expiryDate" type="date" value={values.expiryDate} />
      <EditableField label={labels.issueDate} labelName="issueDateLabel" name="issueDate" type="date" value={values.issueDate} />
      <EditableField label={labels.documentNumber} labelName="documentNumberLabel" name="documentNumber" value={values.documentNumber} />
      <EditableField label={labels.country} labelName="countryLabel" name="country" value={values.country} />
      <EditableField label={labels.notes} labelName="notesLabel" name="notes" value={values.notes} multiline />

      {customFields.map((field, index) => (
        <div key={field.id ?? index} className="grid grid-cols-[0.8fr_1.2fr_auto] gap-2">
          <input name="customLabel" defaultValue={field.label} aria-label={`Custom field ${index + 1} name`} placeholder="Field name" required className={inputClass} />
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

function EditableField({ label, labelName, name, value, type = "text", multiline = false }: { label: string; labelName: string; name: string; value?: string; type?: string; multiline?: boolean }) {
  return (
    <div className="grid grid-cols-[0.8fr_1.2fr] gap-2">
      <input name={labelName} defaultValue={label} aria-label={`${label} field name`} required className={inputClass} />
      {multiline ? (
        <textarea name={name} defaultValue={value} aria-label={label} rows={3} className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none transition focus:border-zinc-400" />
      ) : (
        <input name={name} type={type} defaultValue={value} aria-label={label} className={inputClass} />
      )}
    </div>
  );
}
