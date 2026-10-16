"use client";

import { CalendarDays, FileText, LoaderCircle, Lock, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CreateDocumentDialog } from "@/app/(app)/documents/CreateDocumentDialog";
import { documentFormOptionsAction } from "@/app/(app)/documents/actions";
import type { DocumentTypeOption } from "@/app/(app)/documents/DocumentTypeSelect";
import { parseCapture } from "@/lib/capture/parse";
import type { KinesisLinkOption } from "@/lib/custom-fields/types";
import { formatDateInput, parseDateOnly } from "@/lib/dates";
import type { FieldSuggestions } from "@/lib/documents/extraction/suggest";
import { READ_FAILURE_MESSAGE, READ_STAGE_LABEL, type DocumentRead } from "@/lib/documents/extraction/use-document-read";
import { useFormatPreferences, useToday } from "@/lib/format/context";

/**
 * The pieces the capture box (KD-057, ADR-018) shares between the top bar's
 * dropdown and the phone's capture sheet, so the two can't drift apart.
 */

/** What the typed text will create: its title, and its due date unless the user picked or cleared one. */
export function useCaptureDraft(text: string) {
  const today = formatDateInput(useToday());
  const { locale } = useFormatPreferences();
  const parsed = useMemo(() => parseCapture(text, today, locale), [text, today, locale]);
  // A date picked in the card wins over the text until the text is cleared;
  // "" means the user removed the date the text gave.
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedFor, setPickedFor] = useState(text.trim() !== "");
  if (pickedFor !== (text.trim() !== "")) {
    setPickedFor(text.trim() !== "");
    if (!text.trim()) setPicked(null);
  }
  const dueDate = picked ?? parsed.dueDate ?? "";
  return {
    title: parsed.title,
    dueDate,
    rolledToNextYear: picked === null && Boolean(parsed.rolledToNextYear),
    setDueDate: (value: string) => setPicked(value),
  };
}

export function useDueDateLabel() {
  const { locale } = useFormatPreferences();
  return useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return (iso: string) => {
      const date = parseDateOnly(iso);
      return date ? format.format(date) : iso;
    };
  }, [locale]);
}

/**
 * The due date as a row with the answer on it, and a clear beside it. The
 * same layering as DocumentFields' DateRowField: the real date input is
 * stretched invisibly over the row, so a tap reaches it directly (and
 * keyboards can type a date), and showPicker() opens the calendar on a
 * desktop click, where a date input otherwise only opens from its icon.
 */
export function DueDateButton({ value, onChange, large = false }: { value: string; onChange: (value: string) => void; large?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const label = useDueDateLabel();
  const [focused, setFocused] = useState(false);
  const height = large ? "h-12 text-[15px]" : "h-9 text-[13px]";
  return (
    <div className={`flex min-w-0 items-center rounded-xl border bg-white transition ${focused ? "border-zinc-900 ring-4 ring-zinc-900/10" : "border-zinc-200"} ${large ? "w-full" : ""}`}>
      <div className={`relative flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl px-3 font-medium text-zinc-900 ${height}`}>
        <CalendarDays className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
        <span className="truncate">{value ? `Due ${label(value)}` : "Add a due date"}</span>
        {large && value && <span className="ml-auto shrink-0 text-[13px] text-zinc-600">Change</span>}
        <input
          ref={input}
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onClick={() => { try { input.current?.showPicker?.(); } catch { /* already open, or not allowed: the tap still focuses the input */ } }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label="Due date"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Remove due date" className={`mr-1 flex shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 ${large ? "h-10 w-10" : "h-7 w-7"}`}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** The one guess the parser makes for the user, said out loud. */
export function RolledYearNote() {
  return (
    <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-900">
      That day has already passed this year, so it&apos;s set for next year. Change the date if you meant otherwise.
    </p>
  );
}

const SUMMARY_FIELDS: [keyof FieldSuggestions, string][] = [
  ["documentNumber", "Number"],
  ["expiryDate", "Expiry"],
  ["issueDate", "Issued"],
  ["country", "Country"],
];

/**
 * A file being read, or what was read from it: the capture box's version of
 * the Upload dialog (KD-016). It shows the fields found so the user knows what
 * "Check & create" will fill in; the form itself is where they're checked.
 */
export function DocumentReadPanel({ fileName, state, onCheck, onFillIn, onRemove, large = false }: {
  fileName: string;
  state: DocumentRead;
  onCheck: (suggestions: FieldSuggestions) => void;
  onFillIn: () => void;
  onRemove: () => void;
  large?: boolean;
}) {
  const label = useDueDateLabel();
  const found = state.status === "read" ? SUMMARY_FIELDS.filter(([field]) => state.suggestions[field]) : [];
  const button = large ? "h-12 rounded-2xl text-[15px]" : "h-10 rounded-xl text-sm";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-blue-600 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><FileText className="h-[18px] w-[18px]" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-zinc-900">
            {state.status === "read" ? state.suggestions.name ?? "Document" : fileName}
          </p>
          <p className="truncate text-[13px] text-zinc-600">{state.status === "read" ? `Document${state.suggestions.type ? ` · ${state.suggestions.type}` : ""}` : "Reading on this device"}</p>
        </div>
        <button type="button" onClick={onRemove} aria-label="Remove file" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>

      {state.status === "reading" && (
        <p role="status" className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <LoaderCircle className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
          {READ_STAGE_LABEL[state.stage]}
        </p>
      )}
      {state.status === "failed" && (
        <p role="alert" className="text-sm font-medium text-red-700">{READ_FAILURE_MESSAGE[state.failure]}</p>
      )}
      {state.status === "read" && (found.length > 0 ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {found.map(([field, name]) => (
            <div key={field} className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              <dt className="text-xs text-zinc-600">{name}</dt>
              <dd className="mt-0.5 truncate text-sm font-semibold text-zinc-900">{field === "expiryDate" || field === "issueDate" ? label(state.suggestions[field]!) : state.suggestions[field]}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-zinc-700">Nothing we were sure of was found in this file. You can still add it and fill the details in.</p>
      ))}

      <p className="flex items-center gap-2 text-[13px] text-zinc-600">
        <Lock className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
        Read on this device. Your file isn&apos;t uploaded or stored.
      </p>

      <div className={`flex gap-2 ${large ? "flex-col-reverse" : "justify-end"}`}>
        <button type="button" onClick={onFillIn} className={`border border-zinc-200 bg-white px-4 font-semibold text-zinc-800 transition hover:bg-zinc-50 ${button}`}>Fill in myself</button>
        {state.status === "read" && (
          <button type="button" onClick={() => onCheck(state.suggestions)} className={`bg-zinc-950 px-4 font-semibold text-white transition hover:bg-black ${button}`}>Check &amp; create</button>
        )}
      </div>
    </div>
  );
}

/**
 * The Documents create form, opened from anywhere. Its type list and link
 * options are fetched when it opens, since the capture box doesn't carry them.
 */
export function CaptureDocumentDialog({ suggestions, onClose }: { suggestions?: FieldSuggestions; onClose: () => void }) {
  const [options, setOptions] = useState<{ documentTypes: DocumentTypeOption[]; linkOptions: KinesisLinkOption[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    documentFormOptionsAction().then(
      (loaded) => { if (!cancelled) setOptions(loaded); },
      () => { if (!cancelled) setFailed(true); },
    );
    return () => { cancelled = true; };
  }, []);

  if (failed) {
    return (
      <div role="alert" className="fixed inset-x-4 bottom-24 z-50 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-700 shadow-lg md:inset-x-auto md:right-8 md:top-20 md:bottom-auto">
        The document form couldn&apos;t open. Try again from Documents.
        <button type="button" onClick={onClose} className="ml-3 font-semibold text-zinc-800 underline">Close</button>
      </div>
    );
  }
  if (!options) return null;
  return <CreateDocumentDialog documentTypes={options.documentTypes} linkOptions={options.linkOptions} suggestions={suggestions} onClose={onClose} />;
}
