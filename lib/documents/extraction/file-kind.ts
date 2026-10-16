/**
 * What a picked file really is, from its first bytes rather than its name or
 * the browser's guess at a MIME type (ADR-017 §5). Anything else is refused
 * before a parser ever sees it.
 */
export type FileKind = "pdf" | "png" | "jpeg";

/** Large enough for a phone photo of a document; far beyond any text-layer PDF. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export function sniffFileKind(bytes: Uint8Array): FileKind | null {
  const starts = (...signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "pdf"; // %PDF-
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (starts(0xff, 0xd8, 0xff)) return "jpeg";
  return null;
}
