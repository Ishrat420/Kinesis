"use client";

import { FileText, LoaderCircle, UploadCloud, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/overlay/Modal";
import { useFormatPreferences } from "@/lib/format/context";
import type { FieldSuggestions } from "@/lib/documents/extraction/suggest";
import type { ExtractionFailure, ExtractionStage } from "@/lib/documents/extraction/read-document";

type UploadDocumentModalProps = {
  onClose: () => void;
  /** The file has been read (or skipped): open the create form with whatever was found. */
  onRead: (suggestions: FieldSuggestions) => void;
};

const STAGE_LABEL: Record<ExtractionStage, string> = {
  opening: "Opening your file…",
  "reading-text": "Reading the document…",
  "loading-ocr": "Getting the text reader ready… (first time only, can take a moment)",
  recognising: "Reading the text… this can take a few seconds",
};

const FAILURE_MESSAGE: Record<ExtractionFailure, string> = {
  "too-large": "That file is over 10 MB. Try a smaller photo or scan, or fill the details in yourself.",
  unsupported: "That isn't a PDF, PNG or JPEG file.",
  unreadable: "We couldn't read that file.",
};

/**
 * Picks a document and reads it in the browser (KD-016, ADR-017). Nothing is
 * uploaded: the file is read here, in this tab, and only the details the user
 * then checks and saves are sent anywhere. The extraction code is loaded only
 * once a file is actually being read, so the Documents page carries none of it.
 */
export function UploadDocumentModal({ onClose, onRead }: UploadDocumentModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { locale } = useFormatPreferences();
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<ExtractionStage | null>(null);
  const [failure, setFailure] = useState<ExtractionFailure | null>(null);
  const [dragging, setDragging] = useState(false);

  // Closing mid-read stops the OCR worker rather than leaving it running.
  useEffect(() => () => abortRef.current?.abort(), []);

  const choose = (selected: File | undefined) => {
    if (!selected) return;
    setFile(selected);
    setFailure(null);
  };

  const read = async () => {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setFailure(null);
    setStage("opening");
    try {
      const { readDocument } = await import("@/lib/documents/extraction/read-document");
      const suggestions = await readDocument(file, { locale, signal: controller.signal, onStage: setStage });
      if (!controller.signal.aborted) onRead(suggestions);
    } catch (error) {
      if (controller.signal.aborted) return;
      const { ExtractionError } = await import("@/lib/documents/extraction/read-document");
      setFailure(error instanceof ExtractionError ? error.reason : "unreadable");
      setStage(null);
    }
  };

  const skip = () => {
    abortRef.current?.abort();
    onRead({});
  };

  const reading = stage !== null && failure === null;

  return (
    <Modal labelledBy="upload-document-title" onClose={onClose} customHeader panelClassName="p-0 sm:max-w-2xl">
        {/* Header */}

        <div className="flex items-center justify-between border-b border-zinc-200 px-8 py-6">
          <div>
            <h2 id="upload-document-title" className="text-2xl font-semibold">
              Add Document
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              We&apos;ll read the details on this device. Your file isn&apos;t uploaded or stored.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close upload document dialog"
            className="rounded-full p-2 transition hover:bg-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}

        <div className="space-y-6 p-8">

          <button
            type="button"
            disabled={reading}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); if (!reading) choose(event.dataTransfer.files[0]); }}
            className={`flex w-full flex-col items-center rounded-3xl border-2 border-dashed px-8 py-14 transition disabled:cursor-not-allowed disabled:opacity-60 ${dragging ? "border-blue-500 bg-blue-50" : "border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100"}`}
          >
            <UploadCloud className="h-12 w-12 text-zinc-400" />

            <p className="mt-5 text-lg font-semibold">
              Drag & drop or click to choose
            </p>

            <p className="mt-2 text-sm text-zinc-500">
              PDF, PNG, JPG, JPEG · up to 10 MB
            </p>

            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              hidden
              onChange={(event) => {
                choose(event.target.files?.[0]);
                // Choosing the same file again after an error should still fire onChange.
                event.target.value = "";
              }}
            />
          </button>

          {file && (
            <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{file.name}</p>

                <p className="text-sm text-zinc-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
          )}

          {reading && (
            <p role="status" className="flex items-center gap-2 text-sm font-medium text-zinc-700">
              <LoaderCircle className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
              {STAGE_LABEL[stage]}
            </p>
          )}

          {failure && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {FAILURE_MESSAGE[failure]} You can still add it by filling in the details yourself.
            </p>
          )}
        </div>

        {/* Footer */}

        <div className="flex flex-col-reverse gap-3 border-t border-zinc-200 px-8 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={reading || failure ? skip : onClose}
            className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-medium transition hover:bg-zinc-50"
          >
            {reading || failure ? "Fill in myself" : "Cancel"}
          </button>

          <button
            type="button"
            disabled={!file || reading}
            onClick={read}
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {reading ? "Reading…" : "Continue"}
          </button>
        </div>
    </Modal>
  );
}
