"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { CreateDocumentDialog } from "./CreateDocumentDialog";
import type { DocumentTypeOption } from "./DocumentTypeSelect";
import type { KinesisLinkOption } from "@/lib/custom-fields/types";

/**
 * `capture` arrives when quick capture sent the user here (KD-008D): the
 * dialog opens straight away, with the title already in place.
 */
export function ManualDocumentButton({ documentTypes, linkOptions, capture }: { documentTypes: DocumentTypeOption[]; linkOptions: KinesisLinkOption[]; capture?: { title: string; from?: string } }) {
  const [open, setOpen] = useState(Boolean(capture));
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

      {open && <CreateDocumentDialog documentTypes={documentTypes} linkOptions={linkOptions} capture={capture} onClose={() => setOpen(false)} />}
    </>
  );
}
