"use client";

import { CalendarDays, Check, FileText, LoaderCircle, Lock, MoreHorizontal, Plus, SquareCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CreateDocumentDialog } from "@/app/(app)/documents/CreateDocumentDialog";
import { documentFormOptionsAction } from "@/app/(app)/documents/actions";
import type { DocumentTypeOption } from "@/app/(app)/documents/DocumentTypeSelect";
import { parseCapture } from "@/lib/capture/parse";
import type { CustomFieldValue, KinesisLinkOption } from "@/lib/custom-fields/types";
import { formatDateInput, parseDateOnly } from "@/lib/dates";
import { renewalTodo } from "@/lib/documents/extraction/renewal";
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
    <div className={`flex min-w-0 shrink-0 items-center rounded-xl transition ${focused ? "bg-zinc-200" : "bg-white"} ${large ? "w-full" : ""}`}>
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

/**
 * What a capture saves (KD-057, ADR-018): each card has its own tick, and
 * Both is simply both ticked. Kinesis ticks what it suggests and says why in
 * one line above the cards; the user ticks and unticks from there.
 */
export type Picks = { document: boolean; todo: boolean };

export const picksFor = (saveAs: SaveAs): Picks => ({ document: saveAs !== "TODO", todo: saveAs !== "DOCUMENT" });

/** null when nothing is ticked: there is nothing to save. */
export const saveAsOf = (picks: Picks): SaveAs | null =>
  picks.document && picks.todo ? "BOTH" : picks.document ? "DOCUMENT" : picks.todo ? "TODO" : null;

export function createLabel(saveAs: SaveAs | null, busy: boolean) {
  if (!saveAs) return "Tick what to save";
  if (saveAs === "TODO") return busy ? "Creating…" : "Create to-do";
  return saveAs === "BOTH" ? "Check & create both" : "Check & create";
}

/** The round tick on a card's right edge. */
export function Tick({ on, onToggle, label, large = false }: { on: boolean; onToggle: () => void; label: string; large?: boolean }) {
  return (
    <button
      type="button" aria-pressed={on} aria-label={label} onClick={onToggle}
      // The visible circle stays small; the button around it is a full thumb's width.
      className={`-m-2 flex shrink-0 items-center justify-center rounded-full p-2 outline-none [&:focus-visible>span]:ring-4 [&:focus-visible>span]:ring-zinc-900/15`}
    >
      <span className={`flex items-center justify-center rounded-full transition ${large ? "h-7 w-7" : "h-[26px] w-[26px]"} ${on ? "bg-zinc-950 text-white" : "bg-white shadow-[inset_0_0_0_2px_#d4d4d8]"}`}>
        {on && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
      </span>
    </button>
  );
}

/** Why the cards are ticked as they are, or that the user changed them, with a way back. */
export function SuggestionNote({ reason, changed, onUndo, large = false }: { reason: string; changed: boolean; onUndo: () => void; large?: boolean }) {
  return (
    <p className={`flex items-center gap-2 text-zinc-700 ${large ? "text-[13px]" : "text-xs"}`}>
      {changed ? (
        <>
          <span className="h-4 w-4 shrink-0 rounded-full bg-zinc-100" aria-hidden="true" />
          <span>Changed from what was suggested ·</span>
          <button type="button" onClick={onUndo} className="font-semibold text-blue-700 hover:text-blue-900">Undo</button>
        </>
      ) : (
        <>
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700" aria-hidden="true"><Check className="h-2.5 w-2.5" strokeWidth={3.5} /></span>
          <span>Ticked for you: {reason}</span>
        </>
      )}
    </p>
  );
}

/** A card that wasn't suggested, offered as one quiet line: "+ Also save as a document". */
export function AddRow({ label, onClick, large = false }: { label: string; onClick: () => void; large?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-2.5 rounded-xl px-3 text-left font-medium text-zinc-700 outline-none transition hover:bg-zinc-100 focus-visible:bg-zinc-100 ${large ? "h-12 text-[15px]" : "h-9 text-[13px]"}`}>
      <Plus className={large ? "h-[18px] w-[18px]" : "h-[15px] w-[15px]"} aria-hidden="true" />{label}
    </button>
  );
}

/** ⋯: the rarer things a typed capture can be (Goal). */
export function MoreTypes({ onGoal, large = false }: { onGoal: () => void; large?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button type="button" aria-label="Other types" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={`flex items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 outline-none transition hover:bg-zinc-200 focus-visible:bg-zinc-300 ${large ? "h-14 w-14 rounded-2xl" : "h-[42px] w-[42px]"}`}>
        <MoreHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
      {open && (
        // Upwards, from ⋯'s left edge: it sits at the bottom left of a dropdown that scrolls, so opening down would be clipped.
        <div role="menu" className="absolute bottom-full left-0 z-10 mb-1 min-w-36 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onGoal(); }} className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-50">Goal</button>
        </div>
      )}
    </div>
  );
}

/** The to-do card. The title is an input when it was generated (a file's "Pay …"), plain text when it came from what was typed. */
export function TodoCard({ title, onTitle, detail, dueDate, onDueDate, rolled = false, ticked = true, onTick, large = false }: {
  title: string; onTitle?: (title: string) => void; detail?: string; dueDate: string; onDueDate: (value: string) => void; rolled?: boolean;
  ticked?: boolean; onTick?: () => void; large?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-2.5 rounded-2xl transition ${ticked ? "bg-zinc-100" : "bg-zinc-50"} ${large ? "p-3.5" : "p-3"}`}>
      <div className="flex items-center gap-3">
        <span className={`flex shrink-0 items-center justify-center rounded-[10px] ${ticked ? "bg-white text-zinc-950" : "bg-zinc-100 text-zinc-500"} ${large ? "h-9 w-9" : "h-[34px] w-[34px]"}`}><SquareCheck className="h-4 w-4" aria-hidden="true" /></span>
        {onTitle ? (
          <input value={title} onChange={(event) => onTitle(event.target.value)} aria-label="To-do" className={`min-w-0 flex-1 rounded-md bg-transparent font-semibold outline-none focus:bg-white ${ticked ? "text-zinc-950" : "text-zinc-600"} ${large ? "text-base" : "text-[15px]"}`} />
        ) : (
          <span className={`min-w-0 flex-1 truncate font-semibold ${ticked ? "text-zinc-950" : "text-zinc-600"} ${large ? "text-base" : "text-[15px]"}`}>{title}</span>
        )}
        {!large && ticked && <DueDateButton value={dueDate} onChange={onDueDate} />}
        {onTick && <Tick on={ticked} onToggle={onTick} label="Create the to-do" large={large} />}
      </div>
      {ticked && detail && <p className={`truncate text-zinc-600 ${large ? "pl-12 text-[13px]" : "pl-[46px] text-xs"}`}>{detail}</p>}
      {large && ticked && <DueDateButton large value={dueDate} onChange={onDueDate} />}
      {ticked && rolled && <RolledYearNote />}
    </div>
  );
}

/** The document card: its name and, in one line, what was read for it -- or, unticked, that it won't be kept. */
export function DocumentCard({ name, detail, warn = false, ticked = true, onTick, large = false }: {
  name: string; detail?: string; warn?: boolean; ticked?: boolean; onTick?: () => void; large?: boolean;
}) {
  const line = ticked ? detail : "Not kept: the file isn’t saved";
  return (
    <div className={`flex items-center gap-3 rounded-2xl transition ${ticked ? "bg-blue-50" : "bg-zinc-50"} ${large ? "p-3.5" : "p-3"}`}>
      <span className={`flex shrink-0 items-center justify-center rounded-[10px] ${ticked ? "bg-white text-blue-700" : "bg-zinc-100 text-zinc-500"} ${large ? "h-9 w-9" : "h-[34px] w-[34px]"}`}><FileText className="h-4 w-4" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-semibold ${ticked ? "text-zinc-950" : "text-zinc-600"} ${large ? "text-base" : "text-[15px]"}`}>{name}</span>
        {line && <span className={`block truncate ${large ? "text-[13px]" : "text-xs"} ${ticked && warn ? "font-medium text-amber-700" : ticked ? "text-zinc-600" : "text-zinc-500"}`}>{line}</span>}
      </span>
      {onTick && <Tick on={ticked} onToggle={onTick} label="Keep the document" large={large} />}
    </div>
  );
}

/** The document's fields in one line: amount · number · dates · country. */
function useDocumentDetail() {
  const label = useDateLabel(false);
  const today = formatDateInput(useToday());
  return (document: FieldSuggestions, details: CustomFieldValue[] = []) => [
    details.find((detail) => detail.label === "Amount due")?.value,
    document.documentNumber,
    document.issueDate && label(document.issueDate),
    document.expiryDate && `${document.expiryDate < today ? "Expired" : "Expires"} ${label(document.expiryDate)}`,
    document.country,
  ].filter(Boolean).join(" · ");
}


function payLine(details: CustomFieldValue[]) {
  const value = (label: string) => details.find((detail) => detail.label === label)?.value;
  const biller = value("Biller code");
  const reference = value("BPAY reference") ?? value("Reference");
  const pay = biller ? `BPAY ${biller}${reference ? ` / ${reference}` : ""}` : reference && `Ref ${reference}`;
  return [value("Amount due"), pay].filter(Boolean).join(" · ") || undefined;
}

export type FileActions = {
  /** Save the to-do on its own, straight away. */
  createTodo: (todo: TodoSuggestion) => void;
  /** Open the document form, pre-filled, with the linked to-do when there is one. */
  openDocument: (document: FieldSuggestions | undefined, alsoTodo?: TodoSuggestion, details?: CustomFieldValue[]) => void;
};

/**
 * A file being read, or what was read from it, with its cards ticked as suggested (KD-057). The
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
          <div className="flex items-center gap-3 rounded-2xl bg-zinc-100 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-blue-700"><FileText className="h-4 w-4" aria-hidden="true" /></span>
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
  const suggested = picksFor(reading.suggested);
  const [picks, setPicks] = useState<Picks>(suggested);
  const today = formatDateInput(useToday());
  const [todo, setTodo] = useState<TodoSuggestion>(() => reading.todo ?? renewalTodo(reading.document, today));
  const detail = useDocumentDetail()(reading.document, reading.details);
  const expired = Boolean(reading.document.expiryDate && reading.document.expiryDate < today);
  // What paying needs, short enough for one line: "$182.40 · BPAY 23796 / 1234567890". The notes hold the rest.
  const todoDetail = payLine(reading.details ?? []);
  const name = reading.document.name ?? "Document";
  const saveAs = saveAsOf(picks);
  const changed = picks.document !== suggested.document || picks.todo !== suggested.todo;
  const toggle = (key: keyof Picks) => setPicks((current) => ({ ...current, [key]: !current[key] }));

  const primary = () => {
    if (saveAs === "TODO") actions.createTodo(todo);
    else if (saveAs) actions.openDocument(reading.document, saveAs === "BOTH" ? todo : undefined, reading.details);
  };

  // A card Kinesis suggested stays in view when unticked, faded; one it didn't is a single "+" line until added.
  return (
    <>
      <SuggestionNote reason={reading.reason} changed={changed} onUndo={() => setPicks(suggested)} large={large} />
      {picks.document || suggested.document
        ? <DocumentCard name={name} detail={detail || undefined} warn={expired} ticked={picks.document} onTick={() => toggle("document")} large={large} />
        : <AddRow label="Also save as a document" onClick={() => toggle("document")} large={large} />}
      {picks.todo || suggested.todo
        ? <TodoCard title={todo.title} onTitle={(title) => setTodo({ ...todo, title })} detail={todo.notes ? todoDetail : undefined} dueDate={todo.dueDate ?? ""} onDueDate={(dueDate) => setTodo({ ...todo, dueDate: dueDate || undefined })} ticked={picks.todo} onTick={() => toggle("todo")} large={large} />
        : <AddRow label={reading.todo ? "Add a to-do" : "Add a to-do to renew it"} onClick={() => toggle("todo")} large={large} />}
      <div className={`flex items-center gap-2 ${large ? "flex-col-reverse items-stretch" : ""}`}>
        <span className={`flex flex-1 items-center gap-1.5 text-xs text-zinc-600 ${large ? "justify-center" : ""}`}><Lock className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />On this device</span>
        <div className={`flex gap-2 ${large ? "flex-col-reverse" : ""}`}>
          <button type="button" onClick={onRemove} className={`rounded-xl px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 ${large ? "h-11" : "h-10"}`}>Cancel</button>
          <button type="button" onClick={primary} disabled={busy || !saveAs || (picks.todo && !todo.title.trim())} className={`rounded-xl bg-zinc-950 px-4 font-semibold text-white transition hover:bg-black disabled:opacity-50 ${large ? "h-14 rounded-2xl text-base" : "h-10 text-sm"}`}>{createLabel(saveAs, busy)}</button>
        </div>
      </div>
    </>
  );
}

/**
 * The Documents create form, opened from anywhere. Its type list and link
 * options are fetched when it opens, since the capture box doesn't carry them.
 */
export function CaptureDocumentDialog({ suggestions, capture, alsoTodo, customFields, onClose }: {
  suggestions?: FieldSuggestions; capture?: { title: string }; alsoTodo?: TodoSuggestion; customFields?: CustomFieldValue[]; onClose: () => void;
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
  return <CreateDocumentDialog documentTypes={options.documentTypes} linkOptions={options.linkOptions} suggestions={suggestions} capture={capture} alsoTodo={alsoTodo} customFields={customFields} onClose={onClose} />;
}
