import { FileText, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";

type UploadDocumentModalProps = {
  open: boolean;
  onClose: () => void;
};

export function UploadDocumentModal({
  open,
  onClose,
}: UploadDocumentModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
        {/* Header */}

        <div className="flex items-center justify-between border-b border-zinc-200 px-8 py-6">
          <div>
            <h2 className="text-2xl font-semibold">
              Add Document
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              Upload a document to begin tracking it.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-2 transition hover:bg-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}

        <div className="space-y-6 p-8">

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center rounded-3xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-8 py-14 transition hover:border-zinc-400 hover:bg-zinc-100"
          >
            <UploadCloud className="h-12 w-12 text-zinc-400" />

            <p className="mt-5 text-lg font-semibold">
              Drag & drop or click to upload
            </p>

            <p className="mt-2 text-sm text-zinc-500">
              PDF, PNG, JPG, JPEG
            </p>

            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              hidden
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) {
                  setFile(selected);
                }
              }}
            />
          </button>

          {file && (
            <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>

              <div className="flex-1">
                <p className="font-medium">{file.name}</p>

                <p className="text-sm text-zinc-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}

        <div className="flex justify-end gap-3 border-t border-zinc-200 px-8 py-5">
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-medium transition hover:bg-zinc-50"
          >
            Cancel
          </button>

          <button
            disabled={!file}
            onClick={onClose}
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}