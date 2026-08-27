"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { CUSTOM_FIELD_TYPES, type CustomFieldType, type CustomFieldValue, type KinesisLinkOption } from "@/lib/custom-fields/types";

type EditorField = CustomFieldValue & { key: string };
const inputClass = "h-11 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400";

export function CustomFieldsEditor({ initialFields = [], linkOptions, names = { label: "fieldLabel", type: "fieldType", value: "fieldValue", target: "fieldTarget" } }: {
  initialFields?: CustomFieldValue[];
  linkOptions: KinesisLinkOption[];
  names?: { label: string; type: string; value: string; target: string };
}) {
  const [fields, setFields] = useState<EditorField[]>(initialFields.map((field) => ({ ...field, key: field.id ?? crypto.randomUUID() })));
  const update = (key: string, changes: Partial<EditorField>) => setFields((current) => current.map((field) => field.key === key ? { ...field, ...changes } : field));
  return <fieldset>
    <div className="flex items-center justify-between"><legend className="font-semibold text-zinc-800">Custom fields</legend><button type="button" onClick={() => setFields((current) => [...current, { key: crypto.randomUUID(), label: "", value: "", type: "TEXT" }])} className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-zinc-950"><Plus className="h-4 w-4"/> Add field</button></div>
    {fields.length ? <div className="mt-3 space-y-3">{fields.map((field, index) => <div key={field.key} className="grid gap-2 rounded-2xl border border-zinc-100 bg-zinc-50/50 p-3 sm:grid-cols-[1fr_150px_1.2fr_40px]">
      <input name={names.label} value={field.label} onChange={(event) => update(field.key, { label: event.target.value })} aria-label={`Field ${index + 1} name`} placeholder="Field name" className={inputClass}/>
      <select name={names.type} value={field.type ?? "TEXT"} onChange={(event) => update(field.key, { type: event.target.value as CustomFieldType, value: "", targetId: null, targetType: null })} aria-label={`Field ${index + 1} type`} className={`${inputClass} bg-white`}>{CUSTOM_FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select>
      <FieldInput field={field} index={index} linkOptions={linkOptions} valueName={names.value} targetName={names.target} update={(changes) => update(field.key, changes)}/>
      <button type="button" aria-label={`Remove field ${index + 1}`} onClick={() => setFields((current) => current.filter(({ key }) => key !== field.key))} className="flex h-11 items-center justify-center rounded-xl text-zinc-400 hover:bg-red-50 hover:text-red-600"><Minus className="h-4 w-4"/></button>
    </div>)}</div> : <p className="mt-3 text-sm text-zinc-400">No custom fields. Add text, dates, links and more whenever you need them.</p>}
  </fieldset>;
}

function FieldInput({ field, index, linkOptions, valueName, targetName, update }: { field: EditorField; index: number; linkOptions: KinesisLinkOption[]; valueName: string; targetName: string; update: (value: Partial<EditorField>) => void }) {
  if (field.type === "KINESIS_LINK") {
    const selected = field.targetType && field.targetId ? `${field.targetType}:${field.targetId}` : "";
    const modules = [...new Set(linkOptions.map(({ module }) => module))];
    const selectedOption = linkOptions.find((option) => `${option.type}:${option.id}` === selected);
    return <div><input type="hidden" name={valueName} value=""/><select required name={targetName} value={selected} onChange={(event) => { const [targetType, ...id] = event.target.value.split(":"); update({ targetType: targetType as CustomFieldValue["targetType"], targetId: id.join(":") }); }} aria-label={`Field ${index + 1} linked object`} className={`${inputClass} w-full bg-white`}><option value="">Select module → object</option>{modules.map((module) => <optgroup key={module} label={module}>{linkOptions.filter((option) => option.module === module).map((option) => <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>{option.name}</option>)}</optgroup>)}</select>{selectedOption && <Link href={selectedOption.href} className="mt-1 block truncate text-xs font-medium text-blue-700 hover:underline">Open {selectedOption.module} → {selectedOption.name}</Link>}</div>;
  }
  return <><input type="hidden" name={targetName} value=""/>{field.type === "CHECKBOX" ? <label className="flex h-11 items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 text-sm"><input type="hidden" name={valueName} value={field.value === "true" ? "true" : "false"}/><input type="checkbox" checked={field.value === "true"} onChange={(event) => update({ value: String(event.target.checked) })}/> Checked</label> : <input name={valueName} type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : field.type === "LINK" ? "url" : "text"} value={field.value} onChange={(event) => update({ value: event.target.value })} aria-label={`Field ${index + 1} value`} placeholder={field.type === "LINK" ? "https://…" : "Value"} className={inputClass}/>}</>;
}
