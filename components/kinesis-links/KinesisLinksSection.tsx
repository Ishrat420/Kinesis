"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { KinesisLinks } from "./KinesisLinks";
import type { KinesisLinkSection } from "@/lib/data/object-relationships";

/**
 * An Object's Kinesis Links as their own collapsed-by-default card, for
 * records that are mostly linked *to* rather than linking out -- a savings
 * account can be named by a dozen goals, and listing every one of them in
 * full would bury the record's own details. Closed, it says how many links
 * there are and which modules they come from; opened, it slides out the same
 * cards (with change/remove) every other record page shows. Same shell and
 * grid-row transition as `ObjectHistory`, so the two read as a pair.
 */
export function KinesisLinksSection({ section, updateAction, removeAction }: {
  section: KinesisLinkSection;
  updateAction: (linkId: string, data: FormData) => Promise<void>;
  removeAction: (linkId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const { links, previews, recentEvents } = section;
  const modules = [...new Set(links.map((link) => link.target.module))];

  return (
    <section className="rounded-3xl border border-zinc-200/80 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={listId}
        className="flex w-full items-center gap-3 rounded-3xl p-5 text-left sm:p-6"
      >
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            Kinesis Links
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-500">{links.length}</span>
          </h2>
          {!open && (
            <p className="mt-1 line-clamp-1 break-words text-sm text-zinc-500">
              {modules.length ? `Connected to ${modules.join(" · ")}` : "Nothing is linked to this yet."}
            </p>
          )}
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      <div className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div id={listId} inert={!open} className="overflow-hidden">
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            {links.length
              ? <KinesisLinks links={links} previews={previews} recentEvents={recentEvents} updateAction={updateAction} removeAction={removeAction} />
              : <p className="text-sm text-zinc-400">Link this from a document, goal or other record with a Kinesis Link field, and it shows up here.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
