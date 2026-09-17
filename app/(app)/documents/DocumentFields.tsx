"use client";

import { CalendarDays, ChevronDown, Link2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CustomFieldsEditor } from "@/components/custom-fields/CustomFieldsEditor";
import { formatDate } from "@/lib/dates";
import { useFormatPreferences } from "@/lib/format/context";
import type { CustomFieldValue, KinesisLinkOption } from "@/lib/custom-fields/types";
import type { KinesisLinkPreviewStat } from "@/lib/data/kinesis-links";

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
  previews,
  afterDates,
}: {
  labels?: Record<"expiryDate" | "issueDate" | "documentNumber" | "country" | "notes" | "link", string>;
  values?: Partial<Record<"expiryDate" | "issueDate" | "documentNumber" | "country" | "notes" | "link", string>>;
  initialCustomFields?: CustomField[];
  onExpiryDateChange?: (value: string) => void;
  linkOptions: KinesisLinkOption[];
  previews?: Record<string, KinesisLinkPreviewStat[]>;
  /** Rendered right after the Expiry/Issue pair, in the same visual group -- lets a caller (the create dialog's Reminder field) sit beside the dates it reminds against instead of stranded in its own section. */
  afterDates?: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <EditableField label={labels.expiryDate} labelName="expiryDateLabel" name="expiryDate" type="date" value={values.expiryDate} onChange={onExpiryDateChange} />
        <EditableField label={labels.issueDate} labelName="issueDateLabel" name="issueDate" type="date" value={values.issueDate} />
      </div>

      {afterDates}

      <div className="space-y-4 border-t border-zinc-100 pt-5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">More details</p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <EditableField label={labels.documentNumber} labelName="documentNumberLabel" name="documentNumber" value={values.documentNumber} />
          <EditableField label={labels.country} labelName="countryLabel" name="country" value={values.country} />
        </div>
        <EditableField label={labels.link} labelName="linkLabel" name="link" value={values.link} type="url" icon />
        <EditableField label={labels.notes} labelName="notesLabel" name="notes" value={values.notes} multiline />

        <CustomFieldsEditor initialFields={initialCustomFields} linkOptions={linkOptions} previews={previews} />
      </div>
    </div>
  );
}

/**
 * A real border and real size (50px) at rest, the same treatment every
 * redesigned create/edit form in the app shares, in Documents' own blue.
 */
const inputClass = "h-[50px] min-w-0 w-full rounded-xl border-[1.5px] border-zinc-200 bg-white px-3.5 text-base text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/15 sm:text-sm";

function EditableField({ label, labelName, name, value, type = "text", multiline = false, icon = false, onChange }: { label: string; labelName: string; name: string; value?: string; type?: string; multiline?: boolean; icon?: boolean; onChange?: (value: string) => void }) {
  return (
    <div className="min-w-0 space-y-2">
      <EditableLabel name={labelName} initialValue={label} ariaLabel={`${label} field name`} />
      {multiline ? (
        <textarea name={name} defaultValue={value} aria-label={label} rows={3} className={`${inputClass} min-h-[92px] resize-y py-3`} />
      ) : type === "date" ? (
        <DateRowField name={name} label={label} value={value} onChange={onChange} />
      ) : (
        <div className="relative min-w-0">
          {icon && <Link2 aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />}
          <input name={name} type={type} defaultValue={value} onChange={(event) => onChange?.(event.target.value)} aria-label={label} placeholder={icon ? "https://example.com" : undefined} className={`${inputClass} ${icon ? "pl-10" : ""}`} />
        </div>
      )}
    </div>
  );
}

/**
 * Reads as a row with an answer on it rather than a native date input's
 * blank box, which is easy to mistake for a broken field, especially on
 * mobile Safari where it shows nothing at all until a value is picked. The
 * row's onClick calls showPicker() on the real input directly -- a plain
 * click-through to a transparent absolutely-positioned input isn't
 * reliably opening the calendar -- and that real input is still what stays
 * keyboard- and screen-reader-operable.
 */
function DateRowField({ name, label, value, onChange }: { name: string; label: string; value?: string; onChange?: (value: string) => void }) {
  const [current, setCurrent] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  const { locale } = useFormatPreferences();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onClick={() => inputRef.current?.showPicker?.()}
      className={`relative flex h-[50px] cursor-pointer items-center gap-2.5 rounded-xl border-[1.5px] bg-white px-3.5 transition ${
        focused ? "border-blue-600 ring-4 ring-blue-600/15" : "border-zinc-200"
      }`}
    >
      <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
      <span className={`flex-1 truncate text-base sm:text-sm ${current ? "font-medium text-zinc-900" : "text-zinc-400"}`}>
        {current ? formatDate(current, locale) : "Select a date"}
      </span>
      <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
      <input
        ref={inputRef}
        type="date"
        name={name}
        aria-label={label}
        value={current}
        onChange={(event) => { setCurrent(event.target.value); onChange?.(event.target.value); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
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
    <div className="flex min-w-0 items-center">
      <input type="hidden" name={name} value={value} />
      <button type="button" onDoubleClick={() => setEditing(true)} title="Double-click to edit field name" className="min-w-0 max-w-full cursor-default whitespace-normal break-words rounded-md text-left text-sm font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-zinc-300">
        {value}
      </button>
    </div>
  );
}
