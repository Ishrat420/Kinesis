import assets from "./assets.json";
import { MAX_DOCUMENT_BYTES, sniffFileKind } from "./file-kind";
import { looksLikeMrz, readMrz } from "./mrz";
import { suggestFields, type FieldSuggestions } from "./suggest";

/**
 * Reads a picked file in the browser and returns field suggestions (KD-016,
 * ADR-017). Browser-only: it is imported on demand from the upload dialog,
 * never from the server, and nothing it reads leaves the device -- the file,
 * its text and the OCR engine's working data all stay in this tab, and the
 * engines themselves load from Kinesis, never a CDN.
 */

export type ExtractionFailure = "too-large" | "unsupported" | "unreadable";

export class ExtractionError extends Error {
  constructor(readonly reason: ExtractionFailure) {
    super(reason);
  }
}

export type ExtractionStage = "opening" | "reading-text" | "loading-ocr" | "recognising";

/** Same folder name scripts/copy-extraction-assets.mjs writes. */
const ASSETS = `/extraction/t${assets.tesseract}-c${assets.tesseractCore}-p${assets.pdfjs}`;

/** Only the first pages: the fields a document is tracked by are on its first page, almost always. */
const MAX_PAGES = 3;
/** Long edge for OCR: enough for small print, small enough for a phone to recognise in seconds. */
const LONG_EDGE = 2000;
/** Below this, a PDF's text layer is empty or a stray header: treat it as a scan. */
const MIN_TEXT_CHARACTERS = 40;

const MRZ_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";

type Options = {
  locale: string;
  signal?: AbortSignal;
  onStage?: (stage: ExtractionStage) => void;
};

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Extraction cancelled", "AbortError");
}

/** A canvas at most LONG_EDGE on its long side, never upscaled. */
function sizedCanvas(width: number, height: number) {
  const scale = Math.min(1, LONG_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  return { canvas, scale };
}

async function imageCanvas(file: File): Promise<HTMLCanvasElement> {
  // "from-image" applies the EXIF rotation a phone camera records instead of rotating the pixels.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { canvas } = sizedCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

/** A PDF's own text when it has one; otherwise its first pages drawn for OCR. */
async function readPdf(bytes: Uint8Array, options: Options): Promise<{ text: string } | { canvases: HTMLCanvasElement[] }> {
  options.onStage?.("reading-text");
  // The legacy build: the same engine, compiled for the older mobile browsers people actually have.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = `${ASSETS}/pdf.worker.min.mjs`;
  const loading = pdfjs.getDocument({ data: bytes, wasmUrl: `${ASSETS}/pdf-wasm/`, enableXfa: false });
  try {
    const pdf = await loading.promise;
    const pages = Math.min(pdf.numPages, MAX_PAGES);
    const texts: string[] = [];
    for (let number = 1; number <= pages; number++) {
      checkAborted(options.signal);
      const content = await (await pdf.getPage(number)).getTextContent();
      texts.push(content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "")).join(""));
    }
    const text = texts.join("\n");
    if (text.replace(/\s/g, "").length >= MIN_TEXT_CHARACTERS) return { text };

    const canvases: HTMLCanvasElement[] = [];
    for (let number = 1; number <= pages; number++) {
      checkAborted(options.signal);
      const page = await pdf.getPage(number);
      const natural = page.getViewport({ scale: 1 });
      // Draw at up to 3x: scans are often stored small, and OCR wants pixels.
      const { canvas, scale } = sizedCanvas(natural.width * 3, natural.height * 3);
      await page.render({ canvas, viewport: page.getViewport({ scale: 3 * scale }) }).promise;
      canvases.push(canvas);
    }
    return { canvases };
  } finally {
    // Ends the PDF worker too: nothing of the document stays behind in it.
    await loading.destroy();
  }
}

async function recognise(canvases: HTMLCanvasElement[], options: Options): Promise<{ text: string; mrzText?: string }> {
  options.onStage?.("loading-ocr");
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: `${ASSETS}/worker.min.js`,
    corePath: `${ASSETS}/core/`,
    langPath: `${ASSETS}/lang`,
    // A same-origin worker URL, not a blob: one, so `worker-src 'self'` covers it.
    workerBlobURL: false,
    // The HTTP cache already keeps the language data (immutable URL); no IndexedDB copy as well.
    cacheMethod: "none",
  });
  const stop = () => void worker.terminate();
  options.signal?.addEventListener("abort", stop, { once: true });
  try {
    checkAborted(options.signal);
    options.onStage?.("recognising");
    const texts: string[] = [];
    for (const canvas of canvases) {
      checkAborted(options.signal);
      texts.push((await worker.recognize(canvas)).data.text);
    }
    const text = texts.join("\n");
    if (!looksLikeMrz(text) || readMrz(text).documentNumber) return { text };

    // An MRZ the first pass couldn't verify: once more, seeing only MRZ characters.
    await worker.setParameters({ tessedit_char_whitelist: MRZ_CHARACTERS, tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
    const mrzTexts: string[] = [];
    for (const canvas of canvases) {
      checkAborted(options.signal);
      mrzTexts.push((await worker.recognize(canvas)).data.text);
    }
    return { text, mrzText: mrzTexts.join("\n") };
  } finally {
    options.signal?.removeEventListener("abort", stop);
    stop();
    // Let the pixels go now rather than whenever the canvases are collected.
    for (const canvas of canvases) canvas.width = canvas.height = 0;
  }
}

export async function readDocument(file: File, options: Options): Promise<FieldSuggestions> {
  if (file.size > MAX_DOCUMENT_BYTES) throw new ExtractionError("too-large");
  options.onStage?.("opening");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffFileKind(bytes);
  if (!kind) throw new ExtractionError("unsupported");
  checkAborted(options.signal);

  try {
    if (kind === "pdf") {
      const read = await readPdf(bytes, options);
      if ("text" in read) return suggestFields(read.text, options.locale);
      const { text, mrzText } = await recognise(read.canvases, options);
      return suggestFields(text, options.locale, mrzText);
    }
    const { text, mrzText } = await recognise([await imageCanvas(file)], options);
    return suggestFields(text, options.locale, mrzText);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (options.signal?.aborted) throw new DOMException("Extraction cancelled", "AbortError");
    throw new ExtractionError("unreadable");
  }
}
