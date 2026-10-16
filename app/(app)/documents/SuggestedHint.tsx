import { ScanText } from "lucide-react";

/** Under a field pre-filled from an uploaded file (KD-016): read by OCR, so worth a look before saving. */
export function SuggestedHint() {
  return (
    <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-blue-700">
      <ScanText className="h-3.5 w-3.5" aria-hidden="true" />
      From your document — check this
    </p>
  );
}
