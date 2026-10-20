"use client";

import { CalendarDays, Check, FileText, Link2, LoaderCircle, Lock, MoreHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CreateDocumentDialog } from "@/app/(app)/documents/CreateDocumentDialog";
import { documentFormOptionsAction } from "@/app/(app)/documents/actions";
import type { DocumentTypeOption } from "@/app/(app)/documents/DocumentTypeSelect";
import { parseCapture } from "@/lib/capture/parse";
import type { KinesisLinkOption } from "@/lib/custom-fields/types";
import { formatDateInput, parseDateOnly } from "@/lib/dates";
import type { FieldSuggestions, FileReading, SaveAs, TodoSuggestion } from "@/lib/documents/extraction/suggest";
import { READ_FAILURE_MESSAGE, READ_STAGE_LABEL, type DocumentRead } from "@/lib/documents/extraction/use-document-read";
import { useFormatPreferences, useToday } from "@/lib/format/context";

/**
 * The pieces the capture box (KD-057, ADR-018) shares between the top bar's
 * dropdown and the phone's capture sheet, so the two can't drift apart.
 *
 * `large` is the phone's size: taller targets and a little more explanation.
 * The computer's dropdown is the same layout, tighter.
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

function useDateLabel(withWeekday: boolean) {
  const { locale } = useFormatPreferences();
  return useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { ...(withWeekday ? { weekday: "short" as const } : {}), day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return (iso: string) => {
      const date = parseDateOnly(iso);
      return date ? format.format(date) : iso;
    };
  }, [locale, withWeekday]);
}

/**
 * The due date, with a clear beside it: a full row on the phone, a chip on
 * the computer. The same layering as DocumentFields' DateRowField: the real
 * date input is stretched invisibly over it, so a tap reaches it directly
 * (and keyboards can type a date), and showPicker() opens the calendar on a
 * desktop click, where a date input otherwise only opens from its icon.
 */
export function DueDateButton({ value, onChange, large = false }: { value: string; onChange: (value: string) => void; large?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const label = useDateLabel(large);
  const [focused, setFocused] = useState(false);
  return (
    <div className={`flex min-w-0 shrink-0 items-center rounded-xl border bg-white transition ${focused ? "border-zinc-900 ring-4 ring-zinc-900/10" : "border-zinc-200"} ${large ? "w-full" : ""}`}>
      <div className={`relative flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl font-medium text-zinc-900 ${large ? "h-12 px-3 text-[15px]" : "h-8 px-2.5 text-[13px]"}`}>
        <CalendarDays className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
        <span className="truncate">{value ? (large ? `Due ${label(value)}` : label(value)) : "Add a due date"}</span>
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
        <button type="button" onClick={() => onChange("")} aria-label="Remove due date" className={`mr-1 flex shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 ${large ? "h-10 w-10" : "h-6 w-6"}`}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** The one guess the parser makes for the user, said out loud. */
export function RolledYearNote() {
  return <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">That date has passed this year, so it&apos;s set for next year.</p>;
}

const SAVE_AS_LABEL: Record<SaveAs, string> = { TODO: "To-Do", DOCUMENT: "Document", BOTH: "Both" };

/**
 * What a capture is saved as. Kinesis pre-selects one and marks it
 * "Suggested"; the user decides. ⋯ holds the rarer types (Goal).
 */
export function SaveAsSwitch({ value, suggested, onChange, onGoal, large = false }: { value: SaveAs; suggested?: SaveAs; onChange: (value: SaveAs) => void; onGoal?: () => void; large?: boolean }) {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <div className="flex gap-1.5">
      <div role="group" aria-label="Save as" className="grid flex-1 grid-cols-3 gap-[3px] rounded-xl bg-zinc-200 p-[3px]">
        {(Object.keys(SAVE_AS_LABEL) as SaveAs[]).map((option) => (
          <button
            key={option} type="button" aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={`flex items-center justify-center gap-1.5 rounded-[9px] transition ${large ? "h-[42px] text-[15px]" : "h-9 text-sm"} ${value === option ? "bg-white font-semibold text-zinc-950 shadow-sm" : "font-medium text-zinc-700 hover:text-zinc-950"}`}
          >
            {SAVE_AS_LABEL[option]}
            {suggested === option && <span className="rounded-[5px] bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">Suggested</span>}
          </button>
        ))}
      </div>
      {onGoal && (
        <div className="relative">
          <button type="button" aria-label="More types" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)} className={`flex items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 transition hover:bg-zinc-200 ${large ? "h-12 w-12" : "h-[42px] w-[42px]"}`}>
            <MoreHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
          {moreOpen && (
            <div role="menu" className="absolute right-0 top-full z-10 mt-1 min-w-36 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg">
              <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); onGoal(); }} className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-50">Goal</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The to-do half of a card. The title is an input when it was generated (a file's "Pay …"), plain text when it came from what was typed. */
export function TodoCard({ title, onTitle, dueDate, onDueDate, rolled = false, large = false }: {
  title: string; onTitle?: (title: string) => void; dueDate: string; onDueDate: (value: string) => void; rolled?: boolean; large?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-2.5 rounded-2xl border-[1.5px] border-zinc-900 ${large ? "p-3.5" : "p-3"}`}>
      <div className="flex items-center gap-3">
        <span className={`flex shrink-0 items-center justify-center rounded-[10px] bg-zinc-950 text-white ${large ? "h-9 w-9" : "h-[34px] w-[34px]"}`}><Check className="h-4 w-4" aria-hidden="true" /></span>
        {onTitle ? (
          <input value={title} onChange={(event) => onTitle(event.target.value)} aria-label="To-do" className={`min-w-0 flex-1 rounded-md bg-transparent font-semibold text-zinc-950 outline-none focus:bg-zinc-50 ${large ? "text-base" : "text-[15px]"}`} />
        ) : (
          <span className={`min-w-0 flex-1 truncate font-semibold text-zinc-950 ${large ? "text-base" : "text-[15px]"}`}>{title}</span>
        )}
        {!large && <DueDateButton value={dueDate} onChange={onDueDate} />}
      </div>
      {large && <DueDateButton large value={dueDate} onChange={onDueDate} />}
      {rolled && <RolledYearNote />}
    </div>
  );
}

/** The document half of a card: its name and, in one line, what was read for it. */
export function DocumentCard({ name, detail, large = false }: { name: string; detail?: string; large?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border-[1.5px] border-blue-600 ${large ? "p-3.5" : "p-3"}`}>
      <span className={`flex shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-blue-700 ${large ? "h-9 w-9" : "h-[34px] w-[34px]"}`}><FileText className="h-4 w-4" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-semibold text-zinc-950 ${large ? "text-base" : "text-[15px]"}`}>{name}</span>
        {detail && <span className="block truncate text-xs text-zinc-600">{detail}</span>}
      </span>
    </div>
  );
}

export function LinkedNote() {
  return <p className="flex items-center gap-1.5 pl-3.5 text-xs text-zinc-600"><Link2 className="h-3.5 w-3.5" aria-hidden="true" />and a to-do, linked to it</p>;
}

/** The document's fields in one line: number · dates · country. */
function useDocumentDetail() {
  const label = useDateLabel(false);
  return (document: FieldSuggestions) => [
    document.documentNumber,
    document.issueDate && label(document.issueDate),
    document.expiryDate && `Expires ${label(document.expiryDate)}`,
    document.country,
  ].filter(Boolean).join(" · ");
}

/**
 * For a file with no to-do of its own (a passport) when the user asks for
 * one anyway: renewing it, by its expiry.
 */
function fallbackTodo(document: FieldSuggestions): TodoSuggestion {
  const name = document.name ?? document.type;
  return { title: name ? `Renew ${name.toLowerCase()}` : "", ...(document.expiryDate ? { dueDate: document.expiryDate } : {}) };
}

export type FileActions = {
  /** Save the to-do on its own, straight away. */
  createTodo: (todo: TodoSuggestion) => void;
  /** Open the document form, pre-filled, with the linked to-do when there is one. */
  openDocument: (document: FieldSuggestions | undefined, alsoTodo?: TodoSuggestion) => void;
};

/**
 * A file being read, or what was read from it, with Save as (KD-057). The
 * document part opens in the Documents form for checking; a to-do on its own
 * saves straight away, like a typed one.
 */
export function FilePanel({ fileName, state, onRemove, actions, busy = false, large = false }: {
  fileName: string; state: DocumentRead; onRemove: () => void; actions: FileActions; busy?: boolean; large?: boolean;
}) {
  const reading: FileReading | null = state.status === "read" ? state.reading : null;
  return (
    <div className="flex flex-col gap-3">
      {reading ? (
        <ReadFile key={fileName} reading={reading} onRemove={onRemove} actions={actions} busy={busy} large={large} />
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-blue-700"><FileText className="h-4 w-4" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">{fileName}</span>
            <button type="button" onClick={onRemove} aria-label="Remove file" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"><X className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          {state.status === "reading" && (
            <p role="status" className="flex items-center gap-2 text-sm font-medium text-zinc-700"><LoaderCircle className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />{READ_STAGE_LABEL[state.stage]}</p>
          )}
          {state.status === "failed" && <p role="alert" className="text-sm font-medium text-red-700">{READ_FAILURE_MESSAGE[state.failure]}</p>}
          <div className="flex justify-end">
            <button type="button" onClick={() => actions.openDocument(undefined)} className="h-10 rounded-xl px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100">Fill in myself</button>
          </div>
        </>
      )}
    </div>
  );
}

function ReadFile({ reading, onRemove, actions, busy, large }: { reading: FileReading; onRemove: () => void; actions: FileActions; busy: boolean; large: boolean }) {
  const [saveAs, setSaveAs] = useState<SaveAs>(reading.suggested);
  const [todo, setTodo] = useState<TodoSuggestion>(reading.todo ?? fallbackTodo(reading.document));
  const detail = useDocumentDetail()(reading.document);
  const name = reading.document.name ?? "Document";
  const showDocument = saveAs !== "TODO";
  const showTodo = saveAs !== "DOCUMENT";

  const primary = () => {
    if (saveAs === "TODO") actions.createTodo(todo);
    else actions.openDocument(reading.document, saveAs === "BOTH" ? todo : undefined);
  };
  const primaryLabel = saveAs === "TODO" ? (busy ? "Creating…" : "Create to-do") : saveAs === "BOTH" ? "Check & create both" : "Check & create";

  return (
    <>
      <SaveAsSwitch value={saveAs} suggested={reading.suggested} onChange={setSaveAs} large={large} />
      {showDocument && <DocumentCard name={name} detail={detail || undefined} large={large} />}
      {saveAs === "BOTH" && <LinkedNote />}
      {showTodo && <TodoCard title={todo.title} onTitle={(title) => setTodo({ ...todo, title })} dueDate={todo.dueDate ?? ""} onDueDate={(dueDate) => setTodo({ ...todo, dueDate: dueDate || undefined })} large={large} />}
      {saveAs === "TODO" && large && (
        <p className="rounded-xl bg-zinc-100 px-3 py-2.5 text-[13px] text-zinc-700">Just the to-do: the file itself isn&apos;t kept. Choose <strong>Both</strong> to keep it as a document too.</p>
      )}
      <div className={`flex items-center gap-2 ${large ? "flex-col-reverse items-stretch" : ""}`}>
        <span className={`flex flex-1 items-center gap-1.5 text-xs text-zinc-600 ${large ? "justify-center" : ""}`}><Lock className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />On this device</span>
        <div className={`flex gap-2 ${large ? "flex-col-reverse" : ""}`}>
          <button type="button" onClick={onRemove} className={`rounded-xl px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 ${large ? "h-11" : "h-10"}`}>Cancel</button>
          <button type="button" onClick={primary} disabled={busy || (showTodo && !todo.title.trim())} className={`rounded-xl bg-zinc-950 px-4 font-semibold text-white transition hover:bg-black disabled:opacity-50 ${large ? "h-14 rounded-2xl text-base" : "h-10 text-sm"}`}>{primaryLabel}</button>
        </div>
      </div>
    </>
  );
}

/**
 * The Documents create form, opened from anywhere. Its type list and link
 * options are fetched when it opens, since the capture box doesn't carry them.
 */
export function CaptureDocumentDialog({ suggestions, capture, alsoTodo, onClose }: {
  suggestions?: FieldSuggestions; capture?: { title: string }; alsoTodo?: TodoSuggestion; onClose: () => void;
}) {
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
  return <CreateDocumentDialog documentTypes={options.documentTypes} linkOptions={options.linkOptions} suggestions={suggestions} capture={capture} alsoTodo={alsoTodo} onClose={onClose} />;
}
