"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, Command, FileText, Landmark, ListTodo, Paperclip, Search, Target, UsersRound, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { CUSTOM_MODULE_ICONS } from "@/lib/custom-modules/icons";
import type { SearchEntry } from "@/lib/search/types";
import { MIN_QUERY_LENGTH } from "@/lib/search/rank";
import { captureCreateHref } from "@/lib/capture/targets";
import { captureTodoAction } from "@/app/(app)/todos/actions";
import { CaptureDetailsDialog } from "./CaptureDetailsDialog";
import { CaptureConfirmation } from "./CaptureConfirmation";
import { searchAction } from "./search-actions";
import { CAPTURED_EVENT, type CapturedDetail } from "@/lib/capture/captured";
import { useDocumentRead } from "@/lib/documents/extraction/use-document-read";
import type { CustomFieldValue } from "@/lib/custom-fields/types";
import type { FieldSuggestions, SaveAs, TodoSuggestion } from "@/lib/documents/extraction/suggest";
import { CaptureDocumentDialog, DocumentCard, FilePanel, LinkedNote, SaveAsSwitch, TodoCard, useCaptureDraft } from "./CaptureDraft";

/** What the Documents form opens with: a file's fields, or the typed title, and the linked to-do for Both. */
type DocumentFormRequest = { suggestions?: FieldSuggestions; capture?: { title: string }; alsoTodo?: TodoSuggestion; customFields?: CustomFieldValue[] };
import { Z_INDEX } from "@/lib/layout/z-index";

/** How long to let someone keep typing before a search actually runs. */
const SEARCH_DEBOUNCE_MS = 200;

const kindIcons = { Document: FileText, Goal: Target, Finance: Landmark, Relationship: UsersRound, Custom: Boxes, Todo: ListTodo };
const kindTones = { Document: "bg-blue-50", Goal: "bg-violet-50", Finance: "bg-emerald-50", Relationship: "bg-rose-50", Custom: "bg-zinc-100", Todo: "bg-teal-50" };

/**
 * Search and create in one bar (KD-008A), and the capture box (KD-057, ADR-018).
 *
 * The bar answers both "do I already have this?" and "then record it" without
 * making the user choose between them first. What the typed text will create
 * comes first -- Save as (To-Do, Document, Both; Goal under ⋯), and a card
 * with the title and the due date read from the text -- then search matches,
 * then one button. Enter presses it: To-Do is the default because ADR-009's
 * whole argument is that capture has to cost nothing.
 *
 * A file attached with the paperclip, or dropped on the bar, is read on the
 * device (ADR-017) and gets the same Save as, with Kinesis's suggestion
 * marked; a document always opens in the Documents form to be checked.
 */
export function CommandBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [fetchedResults, setFetchedResults] = useState<SearchEntry[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [captured, setCaptured] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [capturing, startCapture] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const draft = useCaptureDraft(query);
  const [saveAs, setSaveAs] = useState<SaveAs>("TODO");
  const { state: fileRead, read: readFile, cancel: cancelFile } = useDocumentRead();
  const [attached, setAttached] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [documentForm, setDocumentForm] = useState<DocumentFormRequest | null>(null);

  const title = query.trim();
  const name = draft.title || title;
  const searchable = title.length >= MIN_QUERY_LENGTH;
  // Derived, not cleared via setState: an emptied or too-short query has no
  // results the instant it is too short, rather than waiting on an effect to
  // notice and catch up. Below MIN_QUERY_LENGTH nothing is fetched at all --
  // the card still works at any length, this only holds back search results.
  const results = searchable ? fetchedResults : [];
  const searchUnavailable = searchable && searchFailed;
  const isOpen = isFocused && title.length > 0 && attached === null;

  /**
   * Nothing runs until there's something long enough to search for, and a
   * slow response from an earlier keystroke can never overwrite what a newer
   * one already found -- `cancelled` guards that, since a debounce alone only
   * delays the request, it doesn't order the responses.
   *
   * A failure is surfaced rather than swallowed: an unhandled rejection here
   * renders as "nothing matches", which is indistinguishable from a genuinely
   * empty result and hides the actual cause -- an un-run migration, say --
   * behind what looks like an empty account.
   */
  useEffect(() => {
    if (!searchable) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchAction(title).then(
        (entries) => { if (!cancelled) { setFetchedResults(entries); setSearchFailed(false); } },
        (failure) => {
          console.error("Search failed", failure);
          if (!cancelled) { setFetchedResults([]); setSearchFailed(true); }
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [title, searchable]);

  /**
   * One list for the keyboard, in the order it reads: the card and its
   * button (0), then the search matches. Enter on 0 does what the button
   * says; ArrowDown walks into the matches.
   *
   * `highlighted` is null until the user actually moves, so the card stays
   * the default as they type. Typing clears any explicit choice, which is why
   * it is reset in the change handler and nowhere else.
   */
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const optionCount = 1 + results.length;
  const activeIndex = Math.min(highlighted ?? 0, optionCount - 1);
  const optionId = (index: number) => (index === 0 ? "command-capture" : `command-result-${index - 1}`);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape" && document.activeElement === inputRef.current) {
        setQuery("");
        setHighlighted(null);
        inputRef.current?.blur();
      }
    }
    // The phone's capture sheet (KD-057) creates its own to-dos; the
    // confirmation, Undo and Add details still show here, in one place.
    const showCaptured = (event: Event) => {
      const todo = (event as CustomEvent<CapturedDetail>).detail;
      setDetailsOpen(false);
      setCaptured(todo);
    };
    window.addEventListener("keydown", handleShortcut);
    window.addEventListener(CAPTURED_EVENT, showCaptured);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
      window.removeEventListener(CAPTURED_EVENT, showCaptured);
    };
  }, []);

  const clear = () => {
    setQuery("");
    setHighlighted(null);
    setSaveAs("TODO");
  };
  const attach = (file: File | undefined) => {
    if (!file) return;
    // A file takes over from anything typed: its own Save as replaces the text's.
    clear();
    setAttached(file.name);
    void readFile(file);
  };
  const detach = () => {
    cancelFile();
    setAttached(null);
  };
  const openDocumentForm = (request: DocumentFormRequest) => {
    detach();
    clear();
    setDocumentForm(request);
  };

  /**
   * A to-do is saved in place, and the bar clears so the next capture can
   * start straight away; the confirmation below offers Undo and Add details.
   */
  const createTodo = (todo: TodoSuggestion, afterwards?: () => void) => {
    if (!todo.title.trim()) return;
    startCapture(async () => {
      const result = await captureTodoAction(todo.title, todo.dueDate || undefined, todo.notes);
      if (result.error) return setError(result.error);
      setError(undefined);
      setCaptured(result.captured ?? null);
      setDetailsOpen(false);
      afterwards?.();
    });
  };

  /** The card's button, and Enter: what "Save as" says (ADR-018). */
  const createFromText = () => {
    if (!name) return;
    if (saveAs === "TODO") return createTodo({ title: name, dueDate: draft.dueDate || undefined }, clear);
    // A document is checked in its own form before it's saved; Both adds the to-do, linked.
    openDocumentForm({ capture: { title: name }, alsoTodo: saveAs === "BOTH" ? { title: name, dueDate: draft.dueDate || undefined } : undefined });
  };
  // A Goal's target date takes the due date; captureCreateHref drops it for a target without one.
  const createGoal = () => {
    const href = captureCreateHref("GOAL", name, { dueDate: draft.dueDate || undefined });
    if (href) router.push(href);
  };
  const buttonLabel = saveAs === "TODO" ? (capturing ? "Creating…" : "Create to-do") : saveAs === "BOTH" ? "Check & create both" : "Check & create";

  // The dropdown sits under the bar at the bar's width on a phone, and as a
  // narrower panel centred under it on the computer, per the agreed design.
  const panel = `absolute inset-x-0 top-[52px] ${Z_INDEX.banner} rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_20px_50px_rgb(0,0,0,0.14)] md:left-1/2 md:right-auto md:w-[480px] md:-translate-x-1/2`;

  return (
    <div
      className="relative w-full max-w-2xl"
      onFocus={() => setIsFocused(true)}
      // Closes only when focus leaves the whole box: the card's date and
      // buttons are inside it, and tabbing to them must not close it.
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) window.setTimeout(() => setIsFocused(false), 150); }}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(event) => { if (!event.dataTransfer.files.length) return; event.preventDefault(); setDragging(false); attach(event.dataTransfer.files[0]); }}
    >
      <div className={`flex h-11 items-center gap-3 rounded-xl border px-3.5 transition duration-200 ${dragging ? "border-blue-500 bg-blue-50" : "border-transparent bg-zinc-100/80 hover:bg-zinc-100 focus-within:border-zinc-200 focus-within:bg-white"}`}>
        <Search className="h-[18px] w-[18px] shrink-0 text-zinc-400" aria-hidden="true" />
        <input
          ref={inputRef} type="search" value={query} autoComplete="off" spellCheck={false}
          onChange={(event) => { setQuery(event.target.value); setHighlighted(null); setError(undefined); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && title) { event.preventDefault(); setHighlighted((activeIndex + 1) % optionCount); }
            if (event.key === "ArrowUp" && title) { event.preventDefault(); setHighlighted((activeIndex - 1 + optionCount) % optionCount); }
            if (event.key === "Enter") {
              event.preventDefault();
              if (!title) return;
              if (activeIndex === 0) createFromText();
              else document.getElementById(optionId(activeIndex))?.click();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 [&::-webkit-search-cancel-button]:hidden"
          placeholder={dragging ? "Drop to read it on this device" : "Search, or type something to capture..."} aria-label="Search everything, or capture a to-do" role="combobox"
          aria-expanded={isOpen} aria-controls="command-bar-options" aria-autocomplete="list"
          aria-activedescendant={isOpen ? optionId(activeIndex) : undefined}
        />
        {query ? <button type="button" onClick={() => { clear(); inputRef.current?.focus(); }} className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700" aria-label="Clear search"><X className="h-4 w-4" /></button>
          : <div className="hidden items-center gap-1 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 sm:flex"><Command className="h-3 w-3" aria-hidden="true" />K</div>}
        {/* Phones attach from the capture sheet (KD-057), which has room for camera and file buttons. */}
        <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach a document to read" title="Attach a PDF or photo to read it, on this device" className="hidden rounded-md p-1 text-zinc-500 transition hover:bg-zinc-200/60 hover:text-zinc-800 md:block"><Paperclip className="h-4 w-4" aria-hidden="true" /></button>
        <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" hidden onChange={(event) => { attach(event.target.files?.[0]); event.target.value = ""; }} />
      </div>

      {attached !== null && <div className={panel}>
        <FilePanel
          fileName={attached} state={fileRead} onRemove={detach} busy={capturing}
          actions={{
            createTodo: (todo) => createTodo(todo, detach),
            openDocument: (suggestions, alsoTodo, customFields) => openDocumentForm({ suggestions: suggestions ?? {}, alsoTodo, customFields }),
          }}
        />
      </div>}

      {isOpen && <div id="command-bar-options" className={`${panel} flex max-h-[calc(100dvh-140px)] flex-col gap-3 overflow-y-auto`}>
        <SaveAsSwitch value={saveAs} onChange={setSaveAs} onGoal={createGoal} />
        <div id="command-capture" role="option" aria-selected={activeIndex === 0} onMouseEnter={() => setHighlighted(0)} className="flex flex-col gap-3">
          {saveAs !== "TODO" && <DocumentCard name={name} />}
          {saveAs === "BOTH" && <LinkedNote />}
          {saveAs !== "DOCUMENT" && <TodoCard title={name} dueDate={draft.dueDate} onDueDate={draft.setDueDate} rolled={draft.rolledToNextYear} />}
        </div>

        {results.length ? <>
          <SectionLabel>Matches</SectionLabel>
          <ul aria-label="Search results" role="listbox">{results.map((result, index) => {
            const Icon = result.kind === "Custom" && result.icon && result.icon in CUSTOM_MODULE_ICONS ? CUSTOM_MODULE_ICONS[result.icon as keyof typeof CUSTOM_MODULE_ICONS] : kindIcons[result.kind];
            const option = 1 + index;
            return <li key={result.id} role="option" aria-selected={option === activeIndex}>
              {/* Unprefetched: up to ten of these render on every keystroke,
                  and scanning a dropdown isn't a signal to load all ten
                  destination pages in the background -- Next's default
                  prefetch-on-render turned every search into a burst of
                  requests competing with the search itself for bandwidth. */}
              <Link id={`command-result-${index}`} href={result.href} prefetch={false} onMouseEnter={() => setHighlighted(option)} className={`flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none ${option === activeIndex ? "bg-zinc-50" : ""}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-700 ${kindTones[result.kind]}`} style={result.color ? { color: result.color } : undefined}><Icon className="h-4 w-4" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-zinc-900">{result.title}</span><span className="block truncate text-xs text-zinc-500">{result.subtitle}</span></span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{result.kind}</span>
              </Link>
            </li>;
          })}</ul>
        </> : searchUnavailable
          ? <p role="alert" className="px-4 pb-2 pt-3 text-xs font-medium text-red-600">Search isn&rsquo;t responding right now. You can still capture above.</p>
          : null}


        <button type="button" disabled={capturing} onMouseDown={(event) => event.preventDefault()} onClick={createFromText} className={`flex h-[42px] items-center justify-center gap-2.5 rounded-xl bg-zinc-950 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60 ${activeIndex === 0 ? "ring-2 ring-zinc-950 ring-offset-2" : ""}`}>
          {buttonLabel}<span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">Enter</span>
        </button>
      </div>}

      {error && <p role="alert" className={`absolute inset-x-0 top-[52px] ${Z_INDEX.banner} rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-600 shadow-lg`}>{error}</p>}

      {/* Keyed on the capture, so a second one replaces the first outright
          rather than reusing the previous confirmation's dismissal timer.
          It gives way while the dropdown or a file panel is showing: all
          three sit in the same place under the bar. */}
      {captured && !detailsOpen && !isOpen && attached === null && <CaptureConfirmation key={captured.id} todo={captured} onAddDetails={() => setDetailsOpen(true)} onUndone={() => setCaptured(null)} />}
      {captured && detailsOpen && <CaptureDetailsDialog todo={captured} onClose={() => { setDetailsOpen(false); setCaptured(null); }} />}
      {documentForm && <CaptureDocumentDialog {...documentForm} onClose={() => setDocumentForm(null)} />}
    </div>
  );
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">{children}</p>
);
