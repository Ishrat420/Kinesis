"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteDocumentTypeAction } from "./actions";

export type DocumentTypeOption = {
  name: string;
  isDefault: boolean;
  inUse: boolean;
};

export function DocumentTypeSelect({
  types,
  defaultValue = "",
}: {
  types: DocumentTypeOption[];
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState(types);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const matches = options.filter((option) =>
    option.name.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()),
  );

  return (
    <label className="block text-sm font-medium text-zinc-700">
      Document type
      <div ref={container} className="relative mt-2">
        <input
          name="type"
          value={value}
          required
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="document-type-options"
          placeholder="Select or create a type"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
            setError("");
          }}
          className="h-12 w-full rounded-xl border border-zinc-200 px-4 pr-11 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400"
        />
        <button type="button" aria-label="Show document types" onClick={() => setOpen((current) => !current)} className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700">
          <ChevronDown className="h-4 w-4" />
        </button>

        {open && (
          <div id="document-type-options" className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl">
            {matches.map((option) => (
              <div key={option.name} className="group flex items-center rounded-lg hover:bg-zinc-50">
                <button type="button" onClick={() => { setValue(option.name); setOpen(false); setError(""); }} className="flex-1 px-3 py-2 text-left text-sm text-zinc-700">
                  {option.name}
                </button>
                {!option.isDefault && !option.inUse && (
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`Delete ${option.name} type`}
                    title="Delete unused type"
                    onClick={() => startTransition(async () => {
                      const result = await deleteDocumentTypeAction(option.name);
                      if (result.error) setError(result.error);
                      else setOptions((current) => current.filter((item) => item.name !== option.name));
                    })}
                    className="mr-1 rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            {matches.length === 0 && value.trim() && (
              <p className="px-3 py-2 text-sm text-zinc-500">Create “{value.trim()}” when you save</p>
            )}
          </div>
        )}
      </div>
      {error && <span className="mt-1.5 block text-xs font-normal text-red-600">{error}</span>}
    </label>
  );
}
