"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { DocumentFields, type CustomField } from "../DocumentFields";
import { updateDocumentAction, type DocumentActionState } from "../actions";

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
  expiryDateLabel: string;
  issueDateLabel: string;
  documentNumberLabel: string;
  countryLabel: string;
  notesLabel: string;
  customFields: CustomField[];
};

export function EditDocumentForm({ document }: { document: EditableDocument }) {
  const action = updateDocumentAction.bind(null, document.id);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Document name" name="name" value={document.name} required />
        <Field label="Document type" name="type" value={document.type} required />
      </div>
      <label className="block text-sm font-medium text-zinc-600">
        Status
        <select name="status" defaultValue={document.status} className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 outline-none focus:border-zinc-400">
          <option>Active</option><option>Expiring soon</option><option>Expired</option><option>Archived</option>
        </select>
      </label>

      <div className="border-t border-zinc-100 pt-5">
        <p className="mb-1 font-semibold text-zinc-800">Information</p>
        <p className="mb-4 text-xs text-zinc-500">Edit a field name in the left column and its value on the right.</p>
        <DocumentFields
          labels={{ expiryDate: document.expiryDateLabel, issueDate: document.issueDateLabel, documentNumber: document.documentNumberLabel, country: document.countryLabel, notes: document.notesLabel }}
          values={{ expiryDate: document.expiryDate, issueDate: document.issueDate, documentNumber: document.documentNumber, country: document.country, notes: document.notes }}
          initialCustomFields={document.customFields}
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
