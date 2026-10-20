"use client";

import { Camera, FileText, Paperclip, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type RefObject } from "react";
import { captureTodoAction } from "@/app/(app)/todos/actions";
import { BottomSheet } from "@/components/overlay/BottomSheet";
import { announceCaptured } from "@/lib/capture/captured";
import { captureCreateHref } from "@/lib/capture/targets";
import { useDocumentRead } from "@/lib/documents/extraction/use-document-read";
import type { CustomFieldValue } from "@/lib/custom-fields/types";
import type { FieldSuggestions, SaveAs, TodoSuggestion } from "@/lib/documents/extraction/suggest";
import { CaptureDocumentDialog, DocumentCard, FilePanel, LinkedNote, SaveAsSwitch, TodoCard, useCaptureDraft } from "./CaptureDraft";

/** Files the reader handles. Listing image types (not image/*) also makes iOS hand over a JPEG instead of a HEIC. */
const DOCUMENT_TYPES = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";
const PHOTO_TYPES = "image/jpeg,image/png";

type DocumentFormRequest = { suggestions?: FieldSuggestions; capture?: { title: string }; alsoTodo?: TodoSuggestion; customFields?: CustomFieldValue[] };

/**
 * The phone's capture box (KD-057, ADR-018): the tab bar's + opens this sheet
 * instead of focusing the top bar, so there is room for Save as, the card,
 * and camera and file buttons a thumb can hit.
 *
 * `inputRef` belongs to the caller, which focuses it in the same tap that
 * opens the sheet: iOS only raises the keyboard for a focus made inside the
 * user's own gesture.
 */
export function CaptureSheet({ open, onClose, inputRef }: { open: boolean; onClose: () => void; inputRef: RefObject<HTMLTextAreaElement | null> }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [saveAs, setSaveAs] = useState<SaveAs>("TODO");
  const [error, setError] = useState<string>();
  const [creating, startCreate] = useTransition();
  const draft = useCaptureDraft(text);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { state: fileRead, read: readFile, cancel: cancelFile } = useDocumentRead();
  const [attached, setAttached] = useState<string | null>(null);
  const [documentForm, setDocumentForm] = useState<DocumentFormRequest | null>(null);

  const title = draft.title || text.trim();

  const reset = () => {
    setText("");
    setSaveAs("TODO");
    setError(undefined);
    cancelFile();
    setAttached(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const attach = (file: File | undefined) => {
    if (!file) return;
    setAttached(file.name);
    void readFile(file);
  };
  const openDocumentForm = (request: DocumentFormRequest) => {
    close();
    setDocumentForm(request);
  };

  const createTodo = (todo: TodoSuggestion) => {
    if (!todo.title.trim()) return;
    startCreate(async () => {
      const result = await captureTodoAction(todo.title, todo.dueDate || undefined, todo.notes);
      if (result.error || !result.captured) return setError(result.error ?? "That didn't save. Try again.");
      // The top bar shows the confirmation, with Undo and Add details.
      announceCaptured(result.captured);
      close();
    });
  };

  /** What "Save as" says: a to-do saves here; a document opens its form to be checked, with the linked to-do for Both. */
  const createFromText = () => {
    if (!title) return;
    if (saveAs === "TODO") return createTodo({ title, dueDate: draft.dueDate || undefined });
    openDocumentForm({ capture: { title }, alsoTodo: saveAs === "BOTH" ? { title, dueDate: draft.dueDate || undefined } : undefined });
  };
  const createGoal = () => {
    const href = captureCreateHref("GOAL", title, { dueDate: draft.dueDate || undefined });
    close();
    if (href) router.push(href);
  };
  const buttonLabel = saveAs === "TODO" ? (creating ? "Creating…" : "Create to-do") : saveAs === "BOTH" ? "Check & create both" : "Check & create";

  return (
    <>
      <BottomSheet open={open} onClose={close} ariaLabel="Capture" initialFocusRef={attached ? undefined : inputRef}>
        <div className="flex flex-col gap-4 pt-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold tracking-tight text-zinc-950">{attached ? "From your file" : "What needs doing?"}</h2>
            <button type="button" onClick={close} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700"><X className="h-[18px] w-[18px]" aria-hidden="true" /></button>
          </div>

          {attached ? (
            <FilePanel
              large fileName={attached} state={fileRead} busy={creating}
              onRemove={() => { cancelFile(); setAttached(null); }}
              actions={{
                createTodo,
                openDocument: (suggestions, alsoTodo, customFields) => openDocumentForm({ suggestions: suggestions ?? {}, alsoTodo, customFields }),
              }}
            />
          ) : (
            <>
              <label htmlFor="capture-sheet-text" className="sr-only">What needs doing?</label>
              <textarea
                id="capture-sheet-text"
                ref={inputRef}
                rows={text ? 2 : 3}
                value={text}
                onChange={(event) => { setText(event.target.value); setError(undefined); }}
                enterKeyHint="done"
                className="w-full resize-none rounded-2xl border-[1.5px] border-zinc-900 px-4 py-3.5 text-[17px] leading-snug text-zinc-950 outline-none focus:ring-4 focus:ring-zinc-900/10"
              />

              {title ? (
                <>
                  <SaveAsSwitch large value={saveAs} onChange={setSaveAs} onGoal={createGoal} />
                  {saveAs !== "TODO" && <DocumentCard large name={title} />}
                  {saveAs === "BOTH" && <LinkedNote />}
                  {saveAs !== "DOCUMENT" && <TodoCard large title={title} dueDate={draft.dueDate} onDueDate={draft.setDueDate} rolled={draft.rolledToNextYear} />}

                  {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}

                  <div className="flex gap-2.5">
                    <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach a photo or file instead" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 text-zinc-900"><Paperclip className="h-5 w-5" aria-hidden="true" /></button>
                    <button type="button" onClick={createFromText} disabled={creating} className="h-14 flex-1 rounded-2xl bg-zinc-950 text-base font-semibold text-white disabled:opacity-60">{buttonLabel}</button>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  <button type="button" onClick={() => photoRef.current?.click()} className="flex h-[52px] items-center justify-center gap-2.5 rounded-2xl border border-zinc-200 bg-zinc-50 text-[15px] font-semibold text-zinc-950"><Camera className="h-5 w-5" aria-hidden="true" />Take photo</button>
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex h-[52px] items-center justify-center gap-2.5 rounded-2xl border border-zinc-200 bg-zinc-50 text-[15px] font-semibold text-zinc-950"><FileText className="h-5 w-5" aria-hidden="true" />Choose file</button>
                </div>
              )}
            </>
          )}

          {attached && error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
          <input ref={photoRef} type="file" accept={PHOTO_TYPES} capture="environment" hidden onChange={(event) => { attach(event.target.files?.[0]); event.target.value = ""; }} />
          <input ref={fileRef} type="file" accept={DOCUMENT_TYPES} hidden onChange={(event) => { attach(event.target.files?.[0]); event.target.value = ""; }} />
        </div>
      </BottomSheet>
      {documentForm && <CaptureDocumentDialog {...documentForm} onClose={() => setDocumentForm(null)} />}
    </>
  );
}
