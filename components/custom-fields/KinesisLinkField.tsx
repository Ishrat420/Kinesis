"use client";

import { ChevronDown, X } from "lucide-react";
import type { LinkableObject } from "@/lib/objects/locations";
import { KinesisLinkCard } from "./KinesisLinkCard";
import { FIELD_INPUT_CLASS } from "./field-styles";

/**
 * Choosing objects to point at.
 *
 * Every surface that links one record to another asks the same question, so it
 * asks it the same way: options grouped by the module they belong to while
 * choosing, and a card that names and opens the record once chosen.
 *
 * Two arities, one control. A Kinesis Link custom field holds a single value --
 * one label, one link, and another link means another field. A To-Do concerns
 * however many things it concerns (ADR-009: "Apply for replacement passport"
 * relates to the passport and depends on the police report), so quick capture
 * takes a set.
 */

type SharedProps = {
  /** The form field the chosen object ids are submitted under. */
  name: string;
  options: LinkableObject[];
  ariaLabel: string;
  placeholder?: string;
  /** True while the options are still being fetched. */
  loading?: boolean;
};

export function KinesisLinkField({
  name, options, value, onChange, ariaLabel,
  placeholder = "Select object ↗",
  required = false,
  loading = false,
  onClear,
}: SharedProps & {
  value: string;
  onChange: (objectId: string) => void;
  required?: boolean;
  /** Offered as "Choose something else" beside the card; omit to make a choice final. */
  onClear?: () => void;
}) {
  if (loading) return <LoadingSelect name={name} values={value ? [value] : []} ariaLabel={ariaLabel} />;

  const selected = options.find((option) => option.objectId === value);
  if (selected) {
    return (
      <div className="space-y-2">
        <input type="hidden" name={name} value={value} />
        <KinesisLinkCard option={selected} />
        {onClear && (
          <button type="button" onClick={onClear} className="text-xs font-semibold text-zinc-500 transition hover:text-zinc-900">
            Choose something else
          </button>
        )}
      </div>
    );
  }

  return (
    <LinkSelect
      name={name} options={options} value="" ariaLabel={ariaLabel} placeholder={placeholder} required={required}
      onChange={onChange}
    />
  );
}

/**
 * The same control holding as many links as the record has.
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
          <input type="hidden" name={name} value={option.objectId} />
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
          name="" options={remaining} value="" ariaLabel={ariaLabel}
          placeholder={chosen.length ? addPlaceholder : placeholder}
          onChange={(objectId) => objectId && onChange([...values, objectId])}
        />
      )}
    </div>
  );
}

/**
 * The picker itself. `name` is empty when the select only adds to a list: the
 * hidden inputs above carry the value, and a named select would submit its own
 * empty string alongside them.
 */
function LinkSelect({
  name, options, value, onChange, ariaLabel, placeholder, required = false,
}: {
  name: string;
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
        {...(name ? { name } : {})}
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
function LoadingSelect({ name, values, ariaLabel }: { name: string; values: string[]; ariaLabel: string }) {
  return (
    <Control>
      {values.map((objectId) => <input key={objectId} type="hidden" name={name} value={objectId} />)}
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
