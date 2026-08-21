"use client";

import { Clock3, Save } from "lucide-react";
import { useActionState, useState } from "react";
import { DocumentFields, type CustomField } from "../DocumentFields";
import { updateDocumentAction, type DocumentActionState } from "../actions";
import { getExpiryDetails, REMINDER_OPTIONS } from "@/lib/documents/expiry";
import { DocumentTypeSelect, type DocumentTypeOption } from "../DocumentTypeSelect";

const initialState: DocumentActionState = {};

type EditableDocument = {
  id: string;
  name: string;
  type: string;
  status: string;
  expiryDate: string;
  issueDate: string;
  documentNumber: string;
  country: string;
  notes: string;
  link: string;
  prompt: number;
  expiryDateLabel: string;
  issueDateLabel: string;
  documentNumberLabel: string;
  countryLabel: string;
  notesLabel: string;
  linkLabel: string;
  customFields: CustomField[];
};

export function EditDocumentForm({ document, documentTypes }: { document: EditableDocument; documentTypes: DocumentTypeOption[] }) {
  const action = updateDocumentAction.bind(null, document.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [expiryDate, setExpiryDate] = useState(document.expiryDate);
  const [prompt, setPrompt] = useState(document.prompt);
  const expiry = getExpiryDetails(expiryDate ? new Date(`${expiryDate}T00:00:00.000Z`) : null, prompt);
  const urgencyClass = { neutral: "bg-zinc-50 text-zinc-600", safe: "bg-emerald-50 text-emerald-700", soon: "bg-amber-50 text-amber-700", expired: "bg-red-50 text-red-700" }[expiry.urgency];

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Document name" name="name" value={document.name} required />
        <DocumentTypeSelect types={documentTypes} defaultValue={document.type} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-zinc-600">Reminder
          <select name="prompt" value={prompt} onChange={(event) => setPrompt(Number(event.target.value))} className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 outline-none focus:border-zinc-400">
            {REMINDER_OPTIONS.map((option) => <option key={option.days} value={option.days}>{option.label} before expiry</option>)}
          </select>
        </label>
        <div className="text-sm font-medium text-zinc-600">Time until expiry
          <div role="status" className={`mt-1.5 flex h-11 items-center gap-2 rounded-xl px-3 font-semibold ${urgencyClass}`}><Clock3 className="h-4 w-4" />{expiry.label}</div>
        </div>
      </div>
      <div className="border-t border-zinc-100 pt-5">
        <p className="mb-4 font-semibold text-zinc-800">Information</p>
        <DocumentFields
          labels={{ expiryDate: document.expiryDateLabel, issueDate: document.issueDateLabel, documentNumber: document.documentNumberLabel, country: document.countryLabel, notes: document.notesLabel, link: document.linkLabel }}
          values={{ expiryDate: document.expiryDate, issueDate: document.issueDate, documentNumber: document.documentNumber, country: document.country, notes: document.notes, link: document.link }}
          initialCustomFields={document.customFields}
          onExpiryDateChange={setExpiryDate}
        />
      </div>

      {state.error && <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>}
      <div className="flex items-center justify-between border-t border-zinc-100 pt-5">
        <p className="text-sm text-zinc-500">Owner: <span className="font-medium text-zinc-700">user</span></p>
        <button disabled={pending} className="flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50">
          <Save className="h-4 w-4" /> {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, name, value, required }: { label: string; name: string; value: string; required?: boolean }) {
  return <label className="block text-sm font-medium text-zinc-600">{label}<input name={name} defaultValue={value} required={required} className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 px-3 outline-none focus:border-zinc-400" /></label>;
}
