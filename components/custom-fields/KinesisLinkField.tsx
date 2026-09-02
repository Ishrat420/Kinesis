"use client";

import { ChevronDown } from "lucide-react";
import type { LinkableObject } from "@/lib/objects/locations";
import { KinesisLinkCard } from "./KinesisLinkCard";
import { FIELD_INPUT_CLASS } from "./field-styles";

/**
 * Choosing an object to point at.
 *
 * Every surface that links one record to another asks the same question, so it
 * asks it the same way: options grouped by the module they belong to while
 * choosing, and a card that names and opens the record once chosen. Kinesis
 * Link custom fields and quick capture's "Link to" both render this rather than
 * each growing their own picker.
 */
export function KinesisLinkField({
  name,
  options,
  value,
  onChange,
  ariaLabel,
  placeholder = "Select object ↗",
  required = false,
  loading = false,
  onClear,
}: {
  /** The form field the chosen object id is submitted under. */
  name: string;
  options: LinkableObject[];
  value: string;
  onChange: (objectId: string) => void;
  ariaLabel: string;
  placeholder?: string;
  required?: boolean;
  /** True while the options are still being fetched. */
  loading?: boolean;
  /** Offered as "Choose something else" beside the card; omit to make a choice final. */
  onClear?: () => void;
}) {
  if (loading) {
    return (
      <Control>
        {/*
          The chosen object is known before the options that describe it are, and
          a disabled control submits nothing. Carrying the value in a hidden
          input stops saving mid-load from silently clearing an existing link.
        */}
        <input type="hidden" name={name} value={value} />
        <select disabled aria-label={ariaLabel} className={selectClass}>
          <option>Loading…</option>
        </select>
      </Control>
    );
  }

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

  const modules = [...new Set(options.map(({ module }) => module))];
  return (
    <Control>
      <select
        required={required}
        name={name}
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

const selectClass = `${FIELD_INPUT_CLASS} appearance-none pr-11 disabled:text-zinc-400`;

/** The select and the chevron that replaces the browser's own arrow. */
const Control = ({ children }: { children: React.ReactNode }) => (
  <div className="relative">
    {children}
    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
  </div>
);
