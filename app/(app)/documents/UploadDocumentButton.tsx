"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { UploadDocumentModal } from "./UploadDocumentModal";

export function UploadDocumentButton() {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setUploadOpen(true)}
        className="flex h-12 items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white px-5 text-sm font-semibold text-zinc-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-200 hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-[0_12px_40px_rgb(0,0,0,0.07)]"
      >
        <Upload className="h-[18px] w-[18px]" />
        Upload document
      </button>

      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
      />
    </>
  );
}