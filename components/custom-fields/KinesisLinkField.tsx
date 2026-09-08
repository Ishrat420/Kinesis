"use client";

import { ChevronDown, X } from "lucide-react";
import type { LinkableObject } from "@/lib/objects/locations";
import { KinesisLinkCard } from "./KinesisLinkCard";
import { FIELD_INPUT_CLASS } from "./field-styles";

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
        <div key={option.objectId} className="flex items-center gap-2">
          {name && <input type="hidden" name={name} value={option.objectId} />}
          <KinesisLinkCard option={option} className="flex-1" />
          <button
            type="button"
            aria-label={`Unlink ${option.name}`}
            onClick={() => onChange(values.filter((objectId) => objectId !== option.objectId))}
            className="shrink-0 rounded-xl p-2 text-zinc-400 transition hover:bg-red-50 hover:text-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      {remaining.length > 0 && (
        <LinkSelect
          options={remaining} value="" ariaLabel={ariaLabel}
          placeholder={chosen.length ? addPlaceholder : placeholder}
          onChange={(objectId) => objectId && onChange([...values, objectId])}
        />
      )}
    </div>
  );
}

/**
 * The picker itself. Never named: a `KinesisLinkList` submits through its own
 * per-token hidden inputs above, or not through `FormData` at all, so a named
 * select here would only ever contribute a stray empty value.
 */
function LinkSelect({
  options, value, onChange, ariaLabel, placeholder, required = false,
}: {
  options: LinkableObject[];
  value: string;
  onChange: (objectId: string) => void;
  ariaLabel: string;
  placeholder: string;
  required?: boolean;
}) {
  const modules = [...new Set(options.map((option) => option.module))];
  return (
    <Control>
      <select
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        className={selectClass}
      >
        <option value="">{placeholder}</option>
        {modules.map((module) => (
          <optgroup key={module} label={module}>
            {options.filter((option) => option.module === module).map((option) => (
              <option key={option.objectId} value={option.objectId}>{option.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </Control>
  );
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
