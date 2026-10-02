"use client";

import Link from "next/link";
import { useState } from "react";
import { FileText, Search } from "lucide-react";
import { formatDate } from "@/lib/dates";
import type { getDocuments } from "@/lib/data/documents";

type Document = Awaited<ReturnType<typeof getDocuments>>[number];

/** Filters the (already fully loaded) document list live, by name or type -- there's no pagination to page through server-side. */
export function DocumentsList({ documents, locale }: { documents: Document[]; locale: string }) {
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim().toLowerCase();
  const visible = trimmedQuery
    ? documents.filter((document) => document.name.toLowerCase().includes(trimmedQuery) || document.type.toLowerCase().includes(trimmedQuery))
    : documents;

  return (
    <section className="mt-6 rounded-3xl border border-zinc-200/80 bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">All documents</h2>

        <div className="flex h-11 w-full items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 text-zinc-400 sm:w-80">
          <Search className="h-[18px] w-[18px]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search documents"
            className="w-full bg-transparent text-sm text-zinc-950 outline-none placeholder:text-zinc-400"
            placeholder="Search documents..."
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {visible.length ? (
        <div className="space-y-3">
          {visible.map((document) => (
            <Link
              key={document.id}
              href={`/documents/${document.id}`}
              /* The four columns need 432px of track and gap before the name
                 gets a single pixel -- more than the content column has beside
                 the sidebar at md -- so until lg the row is the compact shape
                 custom module items use: icon beside the name, then the date
                 and status together on one line beneath. */
              className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 rounded-2xl border border-zinc-200/80 bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-md lg:grid-cols-[44px_1fr_180px_160px] lg:gap-y-4"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50">
                <FileText className="h-[18px] w-[18px] text-zinc-700" />
              </div>

              <div className="min-w-0">
                <p className="break-words font-semibold">{document.name}</p>
                <p className="text-sm text-zinc-500">{document.type}</p>
              </div>

              {/* One line until lg; from lg, `contents` puts both straight
                  into their own columns of the row's grid. */}
              <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 lg:contents">
                <p className="text-sm text-zinc-500">
                  {document.expiryDate ? formatDate(document.expiryDate, locale) : "No expiry"}
                </p>

                <span className="w-fit rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium">
                  {document.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-200 py-14 text-center">
          <p className="font-semibold text-zinc-700">{trimmedQuery ? `No documents match “${query.trim()}”` : "No documents yet"}</p>
          <p className="mt-1 text-sm text-zinc-400">{trimmedQuery ? "Try a different search." : "Upload or add one manually to get started."}</p>
        </div>
      )}
    </section>
  );
}
