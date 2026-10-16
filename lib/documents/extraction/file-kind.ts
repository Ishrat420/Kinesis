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

/**
 * Most pixels an image may decode to. Phone photos are 12-48 MP; a 76 KB PNG
 * can claim 400 MP, and decoding that took 12 s on a desktop and would take a
 * phone's tab down. The file-size limit can't catch it, so this is read from
 * the header before anything is decoded.
 */
export const MAX_IMAGE_PIXELS = 60_000_000;

/** Width and height from a PNG's IHDR or a JPEG's frame header, without decoding; null if the header can't be found. */
export function imageDimensions(bytes: Uint8Array, kind: "png" | "jpeg"): { width: number; height: number } | null {
  const u16 = (at: number) => (bytes[at] << 8) | bytes[at + 1];
  const u32 = (at: number) => ((bytes[at] << 24) >>> 0) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3];
  if (kind === "png") {
    // IHDR is always the first chunk: 8-byte signature, 4-byte length, "IHDR", then width and height.
    return bytes.length >= 24 ? { width: u32(16), height: u32(20) } : null;
  }
  // Walk the JPEG markers to the first start-of-frame (SOF0-SOF15, but not DHT C4, JPG C8 or DAC CC).
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) { at++; continue; }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: u16(at + 5), width: u16(at + 7) };
    }
    at += 2 + u16(at + 2);
  }
  return null;
}
