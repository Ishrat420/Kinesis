"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { UploadDocumentModal } from "./UploadDocumentModal";
import { CreateDocumentDialog } from "./CreateDocumentDialog";
import type { DocumentTypeOption } from "./DocumentTypeSelect";
import type { KinesisLinkOption } from "@/lib/custom-fields/types";
import type { FieldSuggestions } from "@/lib/documents/extraction/suggest";

/** Upload → read on the device → the create form, pre-filled for checking (KD-016). */
type Step = { kind: "closed" } | { kind: "upload" } | { kind: "review"; suggestions: FieldSuggestions };

export function UploadDocumentButton({ documentTypes, linkOptions }: { documentTypes: DocumentTypeOption[]; linkOptions: KinesisLinkOption[] }) {
  const [step, setStep] = useState<Step>({ kind: "closed" });
  const close = () => setStep({ kind: "closed" });

  return (
    <>
      <button
        type="button"
        onClick={() => setStep({ kind: "upload" })}
        className="flex h-12 items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white px-5 text-sm font-semibold text-zinc-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-200 hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-[0_12px_40px_rgb(0,0,0,0.07)]"
      >
        <Upload className="h-[18px] w-[18px]" />
        Upload document
      </button>

      {step.kind === "upload" && <UploadDocumentModal onClose={close} onRead={(suggestions) => setStep({ kind: "review", suggestions })} />}
      {step.kind === "review" && <CreateDocumentDialog documentTypes={documentTypes} linkOptions={linkOptions} suggestions={step.suggestions} onClose={close} />}
    </>
  );
}
