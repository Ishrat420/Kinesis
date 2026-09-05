"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, Command, FileText, Landmark, ListTodo, Plus, Search, Target, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CUSTOM_MODULE_ICONS } from "@/lib/custom-modules/icons";
import { rankSearchEntries } from "@/lib/search/rank";
import type { SearchEntry } from "@/lib/search/types";
import { captureCreateHref, captureTargets, DEFAULT_CAPTURE_TARGET, type CaptureTargetType } from "@/lib/capture/targets";
import { captureTodoAction } from "@/app/(app)/todos/actions";
import { CaptureDetailsDialog } from "./CaptureDetailsDialog";
import { CaptureConfirmation } from "./CaptureConfirmation";

const kindIcons = { Document: FileText, Goal: Target, Finance: Landmark, Relationship: UsersRound, Custom: Boxes, Todo: ListTodo };
const kindTones = { Document: "bg-blue-50", Goal: "bg-violet-50", Finance: "bg-emerald-50", Relationship: "bg-rose-50", Custom: "bg-zinc-100", Todo: "bg-teal-50" };

/**
 * Search and create in one bar (KD-008A).
 *
 * The bar answers both "do I already have this?" and "then record it" without
 * making the user choose between them first: results appear above, and the ways
 * to create what they just typed appear below. Enter takes the default --
 * create a To-Do -- because ADR-009's whole argument is that capture has to cost
 * nothing, and picking a destination is a cost.
 */
export function CommandBar({ entries }: { entries: SearchEntry[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [captured, setCaptured] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [capturing, startCapture] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const title = query.trim();
  const results = useMemo(() => rankSearchEntries(entries, query), [entries, query]);
  const createOptions = useMemo(() => captureTargets.filter((target) => target.promoted), []);
  const isOpen = isFocused && title.length > 0;

  /**
   * One list for the keyboard, results first and create options after, so
   * ArrowUp from the default lands on the closest search result.
   *
   * `highlighted` is null until the user actually moves: the default then
   * follows the result count as they type, rather than an effect chasing it
   * after each render. Typing clears any explicit choice, which is why it is
   * reset in the change handler and nowhere else.
   */
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const optionCount = results.length + createOptions.length;
  const activeIndex = Math.min(highlighted ?? results.length, Math.max(optionCount - 1, 0));

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
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  /**
   * Creating as a To-Do happens here, and clears the bar so the next capture can
   * start straight away. Every other target hands the title to the module that
   * owns it, prefilled, so the user completes the fields that module genuinely
   * requires instead of a generic form guessing at them.
   */
  const create = (target: CaptureTargetType) => {
    if (!title) return;
    if (target !== DEFAULT_CAPTURE_TARGET) {
      const href = captureCreateHref(target, title);
      if (href) router.push(href);
      return;
    }
    startCapture(async () => {
      const result = await captureTodoAction(title);
      if (result.error) return setError(result.error);
      setError(undefined);
      setCaptured(result.captured ?? null);
      setDetailsOpen(false);
      setQuery("");
      setHighlighted(null);
    });
  };

  return (
    <div className="relative w-full max-w-2xl">
      <div className="flex h-[52px] items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-200 focus-within:border-zinc-300 focus-within:shadow-[0_12px_40px_rgb(0,0,0,0.07)]">
        <Search className="h-[18px] w-[18px] shrink-0 text-zinc-400" aria-hidden="true" />
        <input
          ref={inputRef} type="search" value={query} autoComplete="off"
          onChange={(event) => { setQuery(event.target.value); setHighlighted(null); setError(undefined); }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => window.setTimeout(() => setIsFocused(false), 150)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && optionCount) { event.preventDefault(); setHighlighted((activeIndex + 1) % optionCount); }
            if (event.key === "ArrowUp" && optionCount) { event.preventDefault(); setHighlighted((activeIndex - 1 + optionCount) % optionCount); }
            if (event.key === "Enter") {
              event.preventDefault();
              if (!title) return;
              if (activeIndex < results.length) { document.getElementById(`command-result-${activeIndex}`)?.click(); return; }
              const target = createOptions[activeIndex - results.length];
              if (target) create(target.type);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 [&::-webkit-search-cancel-button]:hidden"
          placeholder="Search, or type something to capture..." aria-label="Search everything, or capture a to-do" role="combobox"
          aria-expanded={isOpen} aria-controls="command-bar-options" aria-autocomplete="list"
          aria-activedescendant={isOpen ? (activeIndex < results.length ? `command-result-${activeIndex}` : `command-create-${activeIndex - results.length}`) : undefined}
        />
        {query ? <button type="button" onClick={() => { setQuery(""); setHighlighted(null); inputRef.current?.focus(); }} className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700" aria-label="Clear search"><X className="h-4 w-4" /></button>
          : <div className="hidden items-center gap-1 rounded-lg bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500 sm:flex"><Command className="h-3 w-3" aria-hidden="true" />K</div>}
      </div>

      {isOpen && <div id="command-bar-options" className="absolute inset-x-0 top-[60px] z-40 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_20px_50px_rgb(0,0,0,0.14)]">
        {results.length ? <>
          <SectionLabel>Search results</SectionLabel>
          <ul aria-label="Search results" role="listbox">{results.map((result, index) => {
            const Icon = result.kind === "Custom" && result.icon && result.icon in CUSTOM_MODULE_ICONS ? CUSTOM_MODULE_ICONS[result.icon as keyof typeof CUSTOM_MODULE_ICONS] : kindIcons[result.kind];
            return <li key={result.id} role="option" aria-selected={index === activeIndex}>
              <Link id={`command-result-${index}`} href={result.href} onMouseEnter={() => setHighlighted(index)} className={`flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none ${index === activeIndex ? "bg-zinc-50" : ""}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-700 ${kindTones[result.kind]}`} style={result.color ? { color: result.color } : undefined}><Icon className="h-4 w-4" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-zinc-900">{result.title}</span><span className="block truncate text-xs text-zinc-500">{result.subtitle}</span></span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{result.kind}</span>
              </Link>
            </li>;
          })}</ul>
        </> : <p className="px-4 pb-2 pt-3 text-xs text-zinc-400">Nothing matches that yet — capture it instead.</p>}

        <SectionLabel>Create</SectionLabel>
        <ul aria-label="Create" role="listbox">{createOptions.map((target, index) => {
          const optionIndex = results.length + index;
          return <li key={target.type} role="option" aria-selected={optionIndex === activeIndex}>
            <button
              id={`command-create-${index}`} type="button" disabled={capturing}
              onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setHighlighted(optionIndex)}
              onClick={() => create(target.type)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-zinc-50 disabled:opacity-60 ${optionIndex === activeIndex ? "bg-zinc-50" : ""}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white"><Plus className="h-4 w-4" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1 text-sm text-zinc-700">Create <span className="font-semibold text-zinc-900">“{title}”</span> as {target.label}</span>
              {target.type === DEFAULT_CAPTURE_TARGET && <span className="hidden shrink-0 rounded-lg bg-zinc-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 sm:block">Enter</span>}
            </button>
          </li>;
        })}</ul>
      </div>}

      {error && <p role="alert" className="absolute inset-x-0 top-[60px] z-40 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-600 shadow-lg">{error}</p>}

      {/* Keyed on the capture, so a second one replaces the first outright
          rather than reusing the previous confirmation's dismissal timer. */}
      {captured && !detailsOpen && <CaptureConfirmation key={captured.id} todo={captured} onAddDetails={() => setDetailsOpen(true)} onUndone={() => setCaptured(null)} />}
      {captured && detailsOpen && <CaptureDetailsDialog todo={captured} onClose={() => { setDetailsOpen(false); setCaptured(null); }} />}
    </div>
  );
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">{children}</p>
);
