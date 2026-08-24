"use client";

import Link from "next/link";
import { Blocks, Command, FileText, Landmark, LoaderCircle, Search, Target, UsersRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RankedSearchResult } from "@/lib/search/types";

const icons = { document: FileText, goal: Target, finance: Landmark, relationship: UsersRound, custom: Blocks };
const tones = { document: "bg-blue-50", goal: "bg-violet-50", finance: "bg-emerald-50", relationship: "bg-rose-50", custom: "bg-amber-50" };

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RankedSearchResult[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const cleanQuery = query.trim();
    if (!cleanQuery) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsLoading(true); setFailed(false);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(cleanQuery)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search failed");
        const payload = await response.json() as { results: RankedSearchResult[] };
        setResults(payload.results);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) { setResults([]); setFailed(true); }
      } finally { if (!controller.signal.aborted) setIsLoading(false); }
    }, 180);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [query]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") { event.preventDefault(); inputRef.current?.focus(); }
      if (event.key === "Escape" && document.activeElement === inputRef.current) { setQuery(""); inputRef.current?.blur(); }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const showResults = isFocused && query.trim().length > 0;
  return <div className="relative w-full max-w-2xl">
    <div className="flex h-[52px] items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-200 focus-within:border-zinc-300 focus-within:shadow-[0_12px_40px_rgb(0,0,0,0.07)]">
      <Search className="h-[18px] w-[18px] shrink-0 text-zinc-400" aria-hidden="true" />
      <input ref={inputRef} type="search" value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setResults([]); setFailed(false); }} onFocus={() => setIsFocused(true)} onBlur={() => window.setTimeout(() => setIsFocused(false), 150)} onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, results.length - 1)); }
        if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
        if (event.key === "Enter" && results[activeIndex]) { event.preventDefault(); router.push(results[activeIndex].href); setQuery(""); }
      }} className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 [&::-webkit-search-cancel-button]:hidden" placeholder="Search everything..." aria-label="Search all Kinesis modules" role="combobox" aria-expanded={showResults} aria-controls="global-search-results" aria-autocomplete="list" aria-activedescendant={results[activeIndex] ? `search-result-${activeIndex}` : undefined} />
      {isLoading && <LoaderCircle className="h-4 w-4 animate-spin text-zinc-400" aria-label="Searching" />}
      {query ? <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700" aria-label="Clear search"><X className="h-4 w-4" /></button> : <div className="hidden items-center gap-1 rounded-lg bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500 sm:flex"><Command className="h-3 w-3" aria-hidden="true" />K</div>}
    </div>
    {showResults && <div id="global-search-results" role="listbox" className="absolute inset-x-0 top-[60px] overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_20px_50px_rgb(0,0,0,0.14)]">
      {results.length > 0 ? <ul aria-label="Search results">{results.map((result, index) => { const Icon = icons[result.icon]; return <li key={result.id} id={`search-result-${index}`} role="option" aria-selected={index === activeIndex}><Link href={result.href} onMouseEnter={() => setActiveIndex(index)} className={`flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none ${index === activeIndex ? "bg-zinc-50" : ""}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-700 ${tones[result.icon]}`}><Icon className="h-4 w-4" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-zinc-900">{result.title}</span><span className="block truncate text-xs text-zinc-500">{result.subtitle}</span></span><span className="max-w-28 truncate text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{result.kind}</span></Link></li>; })}</ul> : !isLoading && <div className="px-4 py-6 text-center"><p className="text-sm font-medium text-zinc-700">{failed ? "Search is temporarily unavailable" : "No results found"}</p><p className="mt-1 text-xs text-zinc-400">{failed ? "Please try again." : "Try a name, note, field, category or status."}</p></div>}
    </div>}
  </div>;
}
