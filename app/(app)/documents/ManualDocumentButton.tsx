"use client";

import { Check, ChevronDown, FileText, Plus, X } from "lucide-react";
import { useActionState, useState } from "react";
import { createDocumentAction, type CreateDocumentState } from "./actions";
import { DocumentFields } from "./DocumentFields";
import { REMINDER_OPTIONS } from "@/lib/documents/expiry";
import { DocumentTypeSelect, type DocumentTypeOption } from "./DocumentTypeSelect";
import type { KinesisLinkOption } from "@/lib/custom-fields/types";
import { CAPTURE_SOURCE_PARAM } from "@/lib/capture/targets";
import { Modal } from "@/components/overlay/Modal";

const initialState: CreateDocumentState = {};

/**
 * A real border and real size (50px) at rest, the same treatment every
 * redesigned create/edit form in the app shares, in Documents' own blue
 * (matching the module's colour everywhere else it appears -- the sidebar
 * icon, the upload dialog).
 */
const FIELD_CLASS =
  "h-[50px] w-full rounded-xl border-[1.5px] border-zinc-200 bg-white px-3.5 text-base text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/15 sm:text-sm";
const FIELD_LABEL_CLASS = "mb-2 flex items-center gap-1.5 text-sm font-semibold text-zinc-900";

/**
 * `capture` arrives when quick capture sent the user here to turn something they
 * wrote into a real document (KD-008D). The dialog opens with the title already
 * in place; the source To-Do travels back with the form so the create action can
 * retire the To-Do once the document exists.
 */
export function ManualDocumentButton({ documentTypes, ownerName, linkOptions, capture }: { documentTypes: DocumentTypeOption[]; ownerName: string; linkOptions: KinesisLinkOption[]; capture?: { title: string; from?: string } }) {
  const [open, setOpen] = useState(Boolean(capture));
  const [state, formAction, pending] = useActionState(
    createDocumentAction,
    initialState,
  );
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
        <Modal labelledBy="manual-document-title" onClose={() => setOpen(false)} customHeader panelClassName="p-0 sm:max-w-2xl !rounded-t-2xl sm:!rounded-2xl">
            <div className="flex items-center gap-3 px-2.5 py-4 sm:px-5 sm:py-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 id="manual-document-title" className="flex-1 text-xl font-bold text-zinc-900 sm:text-2xl">
                Add document manually
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close add document dialog"
                className="shrink-0 rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form action={formAction}>
              {capture?.from && <input type="hidden" name={CAPTURE_SOURCE_PARAM} value={capture.from} />}
              <div className="space-y-4 px-2.5 py-5 sm:px-5">
                <Field label="Document name" name="name" placeholder="e.g. Australian passport" defaultValue={capture?.title} autoFocus />
                <DocumentTypeSelect types={documentTypes} />

                <div>
                  <label htmlFor="document-reminder" className={FIELD_LABEL_CLASS}>Reminder</label>
                  <div className="relative">
                    <select
                      id="document-reminder"
                      name="prompt"
                      defaultValue="180"
                      className={`appearance-none pr-9 ${FIELD_CLASS}`}
                    >
                      {REMINDER_OPTIONS.map((option) => <option key={option.days} value={option.days}>{option.label} before expiry</option>)}
                    </select>
                    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex items-end justify-between">
                    <h3 className="font-semibold text-zinc-900">Document information</h3>
                    <span className="text-xs font-medium text-zinc-400">Owner: {ownerName}</span>
                  </div>
                  <DocumentFields linkOptions={linkOptions} />
                </div>

                {state.error && (
                  <p role="alert" className="text-sm font-medium text-red-600">
                    {state.error}
                  </p>
                )}
              </div>

              <div className="flex flex-col-reverse gap-2 px-2.5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:gap-3 sm:px-5 sm:pt-5 sm:pb-5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-11 rounded-xl border-[1.5px] border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50 sm:h-10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 sm:h-10"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {pending ? "Creating…" : "Create document"}
                </button>
              </div>
            </form>
        </Modal>
      )}
    </>
  );
}

function Field({
  label,
  name,
  placeholder,
  defaultValue,
  autoFocus = false,
}: {
  label: string;
  name: string;
  placeholder: string;
  defaultValue?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor={`document-${name}`} className={FIELD_LABEL_CLASS}>{label}</label>
      <input
        id={`document-${name}`}
        name={name}
        required
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={FIELD_CLASS}
      />
    </div>
  );
}
