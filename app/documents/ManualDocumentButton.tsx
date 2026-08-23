"use client";

import { Plus, X } from "lucide-react";
import { useActionState, useEffect, useId, useState } from "react";
import { createDocumentAction, type CreateDocumentState } from "./actions";
import { DocumentFields } from "./DocumentFields";
import { REMINDER_OPTIONS } from "@/lib/documents/expiry";
import { DocumentTypeSelect, type DocumentTypeOption } from "./DocumentTypeSelect";

const initialState: CreateDocumentState = {};

export function ManualDocumentButton({ documentTypes, ownerName, defaultReminderDays }: { documentTypes: DocumentTypeOption[]; ownerName: string; defaultReminderDays: number }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createDocumentAction,
    initialState,
  );
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 items-center gap-3 rounded-2xl bg-zinc-950 px-5 text-sm font-semibold text-white shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition duration-200 hover:-translate-y-0.5 hover:bg-black"
      >
        <Plus className="h-[18px] w-[18px]" />
        Add manually
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-8 py-6">
              <div>
                <h2 id={titleId} className="text-2xl font-semibold">
                  Add document manually
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Enter the document details now. You can attach a file later.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close add document dialog"
                className="rounded-full p-2 transition hover:bg-zinc-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form action={formAction}>
              <div className="space-y-5 p-8">
                <Field label="Document name" name="name" placeholder="e.g. Australian passport" autoFocus />
                <DocumentTypeSelect types={documentTypes} />

                <label className="block text-sm font-medium text-zinc-700">
                  Reminder
                  <select
                    name="prompt"
                    defaultValue={String(defaultReminderDays)}
                    className="mt-2 h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 outline-none transition focus:border-zinc-400"
                  >
                    {!REMINDER_OPTIONS.some((option) => option.days === defaultReminderDays) && <option value={defaultReminderDays}>{defaultReminderDays} {defaultReminderDays === 1 ? "day" : "days"} before expiry (your default)</option>}
                    {REMINDER_OPTIONS.map((option) => <option key={option.days} value={option.days}>{option.label} before expiry{option.days === defaultReminderDays ? " (your default)" : ""}</option>)}
                  </select>
                </label>

                <div>
                  <div className="mb-3 flex items-end justify-between">
                    <h3 className="font-semibold text-zinc-800">Document information</h3>
                    <span className="text-xs font-medium text-zinc-400">Owner: {ownerName}</span>
                  </div>
                  <DocumentFields />
                </div>

                {state.error && (
                  <p role="alert" className="text-sm font-medium text-red-600">
                    {state.error}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-zinc-200 px-8 py-5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-medium transition hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? "Creating…" : "Create document"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  name,
  placeholder,
  autoFocus = false,
}: {
  label: string;
  name: string;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-zinc-700">
      {label}
      <input
        name={name}
        required
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-4 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400"
      />
    </label>
  );
}
