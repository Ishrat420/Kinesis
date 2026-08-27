"use client";

import Link from "next/link";
import { Boxes, Command, FileText, Landmark, Search, Target, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CUSTOM_MODULE_ICONS } from "@/lib/custom-modules/icons";
import { rankSearchEntries } from "@/lib/search/rank";
import type { SearchEntry } from "@/lib/search/types";

const kindIcons = { Document: FileText, Goal: Target, Finance: Landmark, Relationship: UsersRound, Custom: Boxes };
const kindTones = { Document: "bg-blue-50", Goal: "bg-violet-50", Finance: "bg-emerald-50", Relationship: "bg-rose-50", Custom: "bg-zinc-100" };

export function SearchBar({ entries }: { entries: SearchEntry[] }) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => rankSearchEntries(entries, query), [entries, query]);
  const showResults = isFocused && query.trim().length > 0;

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape" && document.activeElement === inputRef.current) {
        setQuery("");
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <div className="relative w-full max-w-2xl">
      <div className="flex h-[52px] items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-200 focus-within:border-zinc-300 focus-within:shadow-[0_12px_40px_rgb(0,0,0,0.07)]">
        <Search className="h-[18px] w-[18px] shrink-0 text-zinc-400" aria-hidden="true" />
        <input
          ref={inputRef} type="search" value={query}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onFocus={() => setIsFocused(true)}
          onBlur={() => window.setTimeout(() => setIsFocused(false), 150)}
          onKeyDown={(event) => {
            if (!results.length) return;
            if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => (index + 1) % results.length); }
            if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => (index - 1 + results.length) % results.length); }
            if (event.key === "Enter") { event.preventDefault(); document.getElementById(`search-result-${activeIndex}`)?.click(); }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 [&::-webkit-search-cancel-button]:hidden"
          placeholder="Search everything..." aria-label="Search everything" role="combobox"
          aria-expanded={showResults} aria-controls="global-search-results" aria-autocomplete="list" aria-activedescendant={results.length ? `search-result-${activeIndex}` : undefined}
        />
        {query ? <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700" aria-label="Clear search"><X className="h-4 w-4" /></button>
          : <div className="hidden items-center gap-1 rounded-lg bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500 sm:flex"><Command className="h-3 w-3" aria-hidden="true" />K</div>}
      </div>

      {showResults && <div id="global-search-results" className="absolute inset-x-0 top-[60px] overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_20px_50px_rgb(0,0,0,0.14)]">
        {results.length ? <ul aria-label="Search results" role="listbox">{results.map((result, index) => {
          const Icon = result.kind === "Custom" && result.icon && result.icon in CUSTOM_MODULE_ICONS ? CUSTOM_MODULE_ICONS[result.icon as keyof typeof CUSTOM_MODULE_ICONS] : kindIcons[result.kind];
          return <li key={result.id} role="option" aria-selected={index === activeIndex}>
            <Link id={`search-result-${index}`} href={result.href} onMouseEnter={() => setActiveIndex(index)} className={`flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none ${index === activeIndex ? "bg-zinc-50" : ""}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-700 ${kindTones[result.kind]}`} style={result.color ? { color: result.color } : undefined}><Icon className="h-4 w-4" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-zinc-900">{result.title}</span><span className="block truncate text-xs text-zinc-500">{result.subtitle}</span></span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{result.kind}</span>
            </Link>
          </li>;
        })}</ul> : <div className="px-4 py-6 text-center"><p className="text-sm font-medium text-zinc-700">No results found</p><p className="mt-1 text-xs text-zinc-400">Try another name, field, note, category or status.</p></div>}
      </div>}
    </div>
  );
}
