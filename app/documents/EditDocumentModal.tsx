import { X } from "lucide-react";

type DocumentData = {
  name: string;
  owner: string;
  expiryDate: string;
};

type EditDocumentModalProps = {
  open: boolean;
  document: DocumentData;
  onClose: () => void;
};

export function EditDocumentModal({
  open,
  document,
  onClose,
}: EditDocumentModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Edit Document</h2>
            <p className="mt-2 text-sm text-zinc-500">
              Update the document details.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-8 space-y-5">
          <Field label="Name" defaultValue={document.name} />
          <Field label="Owner" defaultValue={document.owner} />
          <Field label="Expiry Date" defaultValue={document.expiryDate} />
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-200 px-5 py-2 text-sm font-medium hover:bg-zinc-50"
          >
            Cancel
          </button>

          <button
            onClick={onClose}
            className="rounded-xl bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-black"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  defaultValue,
}: {
  label: string;
  defaultValue: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-zinc-500">{label}</label>
      <input
        defaultValue={defaultValue}
        className="w-full rounded-xl border border-zinc-200 p-3 outline-none focus:border-zinc-400"
      />
    </div>
  );
}