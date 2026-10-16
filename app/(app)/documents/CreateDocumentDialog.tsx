"use client";

import { Bell, Check, ChevronDown, FileText, ScanText, X } from "lucide-react";
import { useActionState, useState } from "react";
import { createDocumentAction, type CreateDocumentState } from "./actions";
import { DocumentFields } from "./DocumentFields";
import { NO_REMINDER_LABEL, NO_REMINDER_VALUE, parseReminderPrompt, REMINDER_OPTIONS, reminderLabel } from "@/lib/documents/expiry";
import { DocumentTypeSelect, type DocumentTypeOption } from "./DocumentTypeSelect";
import type { KinesisLinkOption } from "@/lib/custom-fields/types";
import type { FieldSuggestions } from "@/lib/documents/extraction/suggest";
import { CAPTURE_SOURCE_PARAM } from "@/lib/capture/targets";
import { Modal } from "@/components/overlay/Modal";
import { SuggestedHint } from "./SuggestedHint";

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
 * The create-document form, opened empty from "Add manually" or pre-filled
 * from "Upload document" (KD-016, ADR-017).
 *
 * `capture` arrives when quick capture sent the user here to turn something they
 * wrote into a real document (KD-008D). The dialog opens with the title already
 * in place; the source To-Do travels back with the form so the create action can
 * retire the To-Do once the document exists.
 *
 * `suggestions` are values read from an uploaded file. They are only ever
 * starting values: each is marked for checking, and they save through the same
 * action and validation as anything typed.
 */
export function CreateDocumentDialog({
  documentTypes,
  linkOptions,
  capture,
  suggestions,
  onClose,
}: {
  documentTypes: DocumentTypeOption[];
  linkOptions: KinesisLinkOption[];
  capture?: { title: string; from?: string };
  suggestions?: FieldSuggestions;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(createDocumentAction, initialState);
  const fromUpload = suggestions !== undefined;
  const suggested = new Set(Object.keys(suggestions ?? {}));

  return (
    <Modal labelledBy="create-document-title" onClose={onClose} customHeader panelClassName="p-0 sm:max-w-2xl !rounded-t-2xl sm:!rounded-2xl">
      <div className="flex items-center gap-3 px-2.5 py-4 sm:px-5 sm:py-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <FileText className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 id="create-document-title" className="flex-1 text-xl font-bold text-zinc-900 sm:text-2xl">
          {fromUpload ? "Check the details" : "Add document manually"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close add document dialog"
          className="shrink-0 rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form autoComplete="off" spellCheck={false} action={formAction}>
        {capture?.from && <input type="hidden" name={CAPTURE_SOURCE_PARAM} value={capture.from} />}
        <div className="space-y-5 px-2.5 py-5 sm:px-5">
          {fromUpload && (
            <div className="flex gap-3 rounded-xl bg-blue-50 px-3.5 py-3 text-sm text-blue-900">
              <ScanText className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
              <p>
                {suggested.size > 0
                  ? "Read on this device. Your file wasn't uploaded or stored. Check each field marked “From your document” before saving."
                  : "We couldn't find any details we were sure of in this file, so nothing has been filled in. Your file wasn't uploaded or stored."}
              </p>
            </div>
          )}

          <Field label="Document name" name="name" placeholder="e.g. Australian passport" defaultValue={capture?.title ?? suggestions?.name} suggested={suggested.has("name")} autoFocus={!fromUpload} />
          <div>
            <DocumentTypeSelect types={documentTypes} defaultValue={suggestions?.type} />
            {suggested.has("type") && <SuggestedHint />}
          </div>

          <div className="border-t border-zinc-100 pt-5">
            <DocumentFields
              linkOptions={linkOptions}
              afterDates={<ReminderField />}
              values={{ expiryDate: suggestions?.expiryDate, issueDate: suggestions?.issueDate, documentNumber: suggestions?.documentNumber, country: suggestions?.country }}
              suggested={suggested}
            />
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
            onClick={onClose}
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
  );
}

/**
 * Same layered pattern as DocumentFields' DateRowField: a styled visual row
 * with the real `<select>` stretched transparently on top of it, so the
 * control stays keyboard- and screen-reader-operable while reading as a row
 * with an answer on it, in place of a native select box.
 */
function ReminderField() {
  const [label, setLabel] = useState(() => reminderLabel(180));
  return (
    <div>
      <label htmlFor="document-reminder" className={FIELD_LABEL_CLASS}>Reminder</label>
      <div className="relative flex h-[50px] items-center gap-2.5 rounded-xl border-[1.5px] border-zinc-200 bg-white px-3.5 transition focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-600/15">
        <Bell aria-hidden="true" className="h-4 w-4 shrink-0 text-blue-600" />
        <span className="flex-1 truncate text-base font-medium text-zinc-900 sm:text-sm">{label}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
        <select
          id="document-reminder"
          name="prompt"
          defaultValue="180"
          onChange={(event) => setLabel(reminderLabel(parseReminderPrompt(event.target.value)))}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
        >
          {REMINDER_OPTIONS.map((option) => <option key={option.days} value={option.days}>{option.label} before expiry</option>)}
          <option value={NO_REMINDER_VALUE}>{NO_REMINDER_LABEL}</option>
        </select>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  placeholder,
  defaultValue,
  suggested = false,
  autoFocus = false,
}: {
  label: string;
  name: string;
  placeholder: string;
  defaultValue?: string;
  suggested?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor={`document-${name}`} className={FIELD_LABEL_CLASS}>
        {label} <span className="font-bold text-red-500">*</span>
      </label>
      <input
        id={`document-${name}`}
        name={name}
        required
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={FIELD_CLASS}
      />
      {suggested && <SuggestedHint />}
    </div>
  );
}
