"use client";

import { ChevronDown, Search, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { LinkableObject } from "@/lib/objects/locations";
import { KinesisLinkCard } from "./KinesisLinkCard";
import { FIELD_INPUT_CLASS } from "./field-styles";
import type { KinesisLinkPreviewStat } from "@/lib/data/kinesis-links";
import { Z_INDEX } from "@/lib/layout/z-index";

/**
 * Choosing objects to point at -- the one control every surface that links a
 * record to others uses, whether it holds a single value or a set: options
 * grouped by the module they belong to while choosing, and a card that names
 * and opens the record once chosen.
 *
 * `name` is optional (KD-034). A caller submitting through the browser's own
 * `FormData` -- To-Do linking, still on `ObjectRelationship` -- passes one, so
 * each chosen object's hidden input carries it under that name. A caller that
 * serialises its own state at submit time -- a Kinesis Link custom field,
 * whose whole field set now travels as one JSON payload -- omits it, and no
 * hidden input is rendered at all rather than one with an empty name that
 * would submit into nothing.
 */

type SharedProps = {
  /** The form field the chosen object ids are submitted under, when submission goes through native FormData. */
  name?: string;
  options: LinkableObject[];
  ariaLabel: string;
  placeholder?: string;
  /** True while the options are still being fetched. */
  loading?: boolean;
  /**
   * Rich preview data (KD-042) for objects already chosen, keyed by objectId
   * -- the same data a saved record's read view renders, so an already-linked
   * card looks identical whether you're viewing or editing. A brand-new
   * selection made during this editing session has no entry here yet (it
   * wasn't part of the page's own batched fetch) and stays a compact card
   * until the next save and reload, the same constraint the Template
   * settings preview picker already accepts for a just-added field.
   */
  previews?: Record<string, KinesisLinkPreviewStat[]>;
};

/**
 * Holds as many links as the record has.
 *
 * Each chosen object keeps its own hidden input under one field name, so the
 * whole set arrives as `formData.getAll(name)` and the server replaces what it
 * had. Options already chosen leave the picker, which is what stops the same
 * object being linked twice.
 */
export function KinesisLinkList({
  name, options, values, onChange, ariaLabel,
  placeholder = "Link something",
  addPlaceholder = "Link something else",
  loading = false,
  previews = {},
}: SharedProps & {
  values: string[];
  onChange: (objectIds: string[]) => void;
  /** Shown while nothing is linked yet; `addPlaceholder` replaces it afterwards. */
  addPlaceholder?: string;
}) {
  if (loading) return <LoadingSelect name={name} values={values} ariaLabel={ariaLabel} />;

  const chosen = values.flatMap((objectId) => options.find((option) => option.objectId === objectId) ?? []);
  const remaining = options.filter((option) => !values.includes(option.objectId));

  return (
    <div className="space-y-2">
      {chosen.map((option) => (
        <div key={option.objectId} className="flex min-w-0 items-center gap-2">
          {name && <input type="hidden" name={name} value={option.objectId} />}
          <KinesisLinkCard option={option} className="flex-1" stats={previews[option.objectId] ?? []} />
          <button
            type="button"
            aria-label={`Unlink ${option.name}`}
            onClick={() => onChange(values.filter((objectId) => objectId !== option.objectId))}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-400 outline-none transition hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      {remaining.length > 0 && (
        <LinkCombobox
          options={remaining} ariaLabel={ariaLabel}
          placeholder={chosen.length ? addPlaceholder : placeholder}
          onChange={(objectId) => onChange([...values, objectId])}
        />
      )}
    </div>
  );
}

/**
 * The picker itself. Never named: a `KinesisLinkList` submits through its own
 * per-token hidden inputs above, or not through `FormData` at all, so a named
 * input here would only ever contribute a stray empty value.
 *
 * A record set can run into the hundreds, past the point where scrolling an
 * `<optgroup>`-grouped `<select>` and reading every label is a realistic way
 * to find one. This searches by name instead -- case-insensitively, matching
 * anywhere in the name rather than only its start -- while keeping the same
 * grouped-by-module shape the old list had. Focusing with nothing typed
 * browses the full list rather than showing nothing: useful the moment
 * someone can't remember the exact name, and the list a small account has is
 * short enough that requiring a search first would only get in the way.
 * Filtering an in-memory array on each keystroke is cheap enough, even at a
 * few hundred rows, that no debounce or server round trip is needed.
 */
/**
 * Exported so a single-target picker (`TargetPicker`, KD-050) can reuse the
 * same search rather than a second, plain `<select>` -- the multi-select
 * (`KinesisLinkList` above) and a single typed Kinesis Link's target are the
 * same question about the same objects, and losing search on one just
 * because it only ever picks one is not a reason to rebuild it.
 */
export function LinkCombobox({
  options, onChange, ariaLabel, placeholder,
}: {
  options: LinkableObject[];
  onChange: (objectId: string) => void;
  ariaLabel: string;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // Group order follows each module's first appearance in `options`, not
  // alphabetical -- the same convention the old <optgroup> list used, so
  // groups don't reshuffle as `options` itself shrinks (an object leaves it
  // the moment it's chosen).
  const modules = [...new Set(options.map((option) => option.module))];
  const term = query.trim().toLowerCase();

  // One pass builds both what's rendered (grouped, with a header per module)
  // and `orderedOptions` (the same objects flattened in that same on-screen
  // order) -- keyboard navigation indexes into the latter, so ArrowDown
  // always means "the next thing visually below," never a jump to wherever
  // an unrelated, ungrouped filter order would have put it.
  const orderedOptions: LinkableObject[] = [];
  const groups = modules
    .map((module) => ({
      module,
      items: options.filter((option) => option.module === module && (!term || option.name.toLowerCase().includes(term))),
    }))
    .filter((group) => group.items.length > 0);
  groups.forEach((group) => orderedOptions.push(...group.items));

  const activeIndex = Math.min(highlighted ?? -1, orderedOptions.length - 1);
  const optionId = (index: number) => `${listId}-option-${index}`;

  return (
    <div className="relative">
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setHighlighted(null); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && orderedOptions.length) {
              event.preventDefault();
              setOpen(true);
              setHighlighted((activeIndex + 1) % orderedOptions.length);
            } else if (event.key === "ArrowUp" && orderedOptions.length) {
              event.preventDefault();
              setOpen(true);
              setHighlighted((activeIndex - 1 + orderedOptions.length) % orderedOptions.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              const chosen = orderedOptions[activeIndex] ?? orderedOptions[0];
              if (chosen) {
                onChange(chosen.objectId);
                setQuery("");
                setHighlighted(null);
                inputRef.current?.focus();
              }
            } else if (event.key === "Escape") {
              setQuery("");
              setHighlighted(null);
              inputRef.current?.blur();
            }
          }}
          placeholder={placeholder}
          aria-label={ariaLabel}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          className={`${FIELD_INPUT_CLASS} pl-10 pr-9`}
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); setHighlighted(null); inputRef.current?.focus(); }}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div id={listId} className={`absolute inset-x-0 top-[calc(100%+6px)] ${Z_INDEX.chrome} max-h-72 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_20px_50px_rgb(0,0,0,0.14)]`}>
          {orderedOptions.length ? groups.map((group) => (
            <div key={group.module}>
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">{group.module}</p>
              <ul role="listbox" aria-label={group.module}>
                {group.items.map((option) => {
                  const index = orderedOptions.indexOf(option);
                  return (
                    <li key={option.objectId} role="option" id={optionId(index)} aria-selected={index === activeIndex}>
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setHighlighted(index)}
                        onClick={() => { onChange(option.objectId); setQuery(""); setHighlighted(null); inputRef.current?.focus(); }}
                        className={`block w-full truncate rounded-xl px-3 py-2.5 text-left text-sm text-zinc-700 transition hover:bg-zinc-50 ${index === activeIndex ? "bg-zinc-50" : ""}`}
                      >
                        {highlightMatch(option.name, term)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )) : (
            <p className="px-3 py-6 text-center text-sm text-zinc-400">
              {term ? `No matches for “${query.trim()}”` : "Nothing left to link"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Bolds the matched substring, wherever in the name it falls, so a mid-word match like "House" in "Shared House Goal" is obvious at a glance. */
function highlightMatch(name: string, term: string) {
  if (!term) return name;
  const index = name.toLowerCase().indexOf(term);
  if (index === -1) return name;
  return <>{name.slice(0, index)}<mark className="bg-transparent font-bold text-zinc-900">{name.slice(index, index + term.length)}</mark>{name.slice(index + term.length)}</>;
}

/**
 * What is already linked is known before the options that describe it are, and
 * a disabled control submits nothing. Carrying the values in hidden inputs stops
 * saving mid-load from silently clearing existing links.
 */
function LoadingSelect({ name, values, ariaLabel }: { name?: string; values: string[]; ariaLabel: string }) {
  return (
    <Control>
      {name && values.map((objectId) => <input key={objectId} type="hidden" name={name} value={objectId} />)}
      <select disabled aria-label={ariaLabel} className={selectClass}>
        <option>Loading…</option>
      </select>
    </Control>
  );
}

const selectClass = `${FIELD_INPUT_CLASS} appearance-none pr-11 disabled:text-zinc-400`;

/** The select and the chevron that replaces the browser's own arrow. */
const Control = ({ children }: { children: React.ReactNode }) => (
  <div className="relative">
    {children}
    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
  </div>
);
