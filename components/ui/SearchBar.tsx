"use client";

import Link from "next/link";
import { Command, FileText, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type SearchableDocument = {
  id: string;
  name: string;
  type: string;
};

export function SearchBar({ documents }: { documents: SearchableDocument[] }) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return [];

    return documents
      .filter((document) => document.name.toLocaleLowerCase().includes(normalizedQuery))
      .slice(0, 6);
  }, [documents, query]);

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

  const showResults = isFocused && query.trim().length > 0;

  return (
    <div className="relative w-full max-w-2xl">
      <div className="flex h-[52px] items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-200 focus-within:border-zinc-300 focus-within:shadow-[0_12px_40px_rgb(0,0,0,0.07)]">
        <Search className="h-[18px] w-[18px] shrink-0 text-zinc-400" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => window.setTimeout(() => setIsFocused(false), 150)}
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 [&::-webkit-search-cancel-button]:hidden"
          placeholder="Search documents by name..."
          aria-label="Search documents by name"
          role="combobox"
          aria-expanded={showResults}
          aria-controls="global-search-results"
          aria-autocomplete="list"
        />

        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <div className="hidden items-center gap-1 rounded-lg bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500 sm:flex">
            <Command className="h-3 w-3" aria-hidden="true" />K
          </div>
        )}
      </div>

      {showResults && (
        <div
          id="global-search-results"
          className="absolute inset-x-0 top-[60px] overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_20px_50px_rgb(0,0,0,0.14)]"
        >
          {results.length > 0 ? (
            <ul aria-label="Matching documents">
              {results.map((document) => (
                <li key={document.id}>
                  <Link
                    href={`/documents/${document.id}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-zinc-700">
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-zinc-900">{document.name}</span>
                      <span className="block truncate text-xs text-zinc-500">{document.type}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-sm font-medium text-zinc-700">No documents found</p>
              <p className="mt-1 text-xs text-zinc-400">Try another document name.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
