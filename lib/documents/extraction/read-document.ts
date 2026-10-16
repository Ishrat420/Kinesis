import assets from "./assets.json";
import { imageDimensions, MAX_DOCUMENT_BYTES, MAX_IMAGE_PIXELS, sniffFileKind } from "./file-kind";
import { looksLikeMrz, readMrz } from "./mrz";
import { suggestFields, type FieldSuggestions } from "./suggest";

/**
 * Reads a picked file in the browser and returns field suggestions (KD-016,
 * ADR-017). Browser-only: it is imported on demand from the upload dialog,
 * never from the server, and nothing it reads leaves the device -- the file,
 * its text and the OCR engine's working data all stay in this tab, and the
 * engines themselves load from Kinesis, never a CDN.
 */

export type ExtractionFailure = "too-large" | "too-many-pixels" | "unsupported" | "unreadable";

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
/**
 * How far a small image may be enlarged towards LONG_EDGE. Tesseract reads
 * text about 20-30 px tall; a screenshot or web image of a card is often 300-600
 * px wide, which puts its print at 8-12 px -- below what it can read at all.
 */
const MAX_UPSCALE = 4;
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

/** A canvas LONG_EDGE on its long side: large images shrunk, small ones enlarged up to MAX_UPSCALE. */
function sizedCanvas(width: number, height: number, maxUpscale = MAX_UPSCALE) {
  const scale = Math.min(maxUpscale, LONG_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  return { canvas, scale };
}

/**
 * A greyscale copy with the contrast stretched so the darkest 1% is black and
 * the lightest 40% is white. ID cards print on pastel security patterns that
 * sit close to the text's own tone in colour but far from it in lightness;
 * this pushes the pattern to white before Tesseract picks its own threshold.
 *
 * A copy, because it suits the printed fields and not the MRZ: on real samples
 * it lifted a licence's "EXP" out of its background but broke a digit in a
 * passport MRZ that already sat on plain paper. Each pass gets the image that
 * suits it.
 */
function flattenedCopy(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d")!;
  context.drawImage(source, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixels.length; i += 4) {
    const grey = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
    pixels[i] = grey;
    histogram[grey]++;
  }
  const total = pixels.length / 4;
  const level = (fraction: number) => {
    let seen = 0;
    for (let value = 0; value < 256; value++) if ((seen += histogram[value]) >= total * fraction) return value;
    return 255;
  };
  const black = level(0.01);
  const white = Math.max(black + 1, level(0.6));
  for (let i = 0; i < pixels.length; i += 4) {
    const value = Math.max(0, Math.min(255, Math.round(((pixels[i] - black) * 255) / (white - black))));
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

async function imageCanvas(file: File): Promise<HTMLCanvasElement> {
  // "from-image" applies the EXIF rotation a phone camera records instead of rotating the pixels.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { canvas } = sizedCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
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
  // maxImageSize: the same pixel ceiling as for photos, for images embedded in a PDF (they're skipped, not decoded).
  const loading = pdfjs.getDocument({ data: bytes, wasmUrl: `${ASSETS}/pdf-wasm/`, enableXfa: false, maxImageSize: MAX_IMAGE_PIXELS });
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
      // The page is drawn fresh at the chosen size, so this one never needs enlarging.
      const { canvas, scale } = sizedCanvas(natural.width * 3, natural.height * 3, 1);
      await page.render({ canvas, viewport: page.getViewport({ scale: 3 * scale }) }).promise;
      canvases.push(canvas);
    }
    return { canvases };
  } finally {
    // Ends the PDF worker too: nothing of the document stays behind in it.
    await loading.destroy();
  }
}

type ReadText = { texts: string[]; mrzText?: string };

async function recognise(canvases: HTMLCanvasElement[], options: Options): Promise<ReadText> {
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
    // Two readings of each page: as it is, and with its background flattened.
    // On real cards each caught print the other lost, in both directions.
    const plain: string[] = [];
    for (const canvas of canvases) {
      checkAborted(options.signal);
      plain.push((await worker.recognize(canvas)).data.text);
    }
    // An MRZ that verified on the first reading already has everything the others could add.
    if (readMrz(plain.join("\n")).documentNumber) return { texts: [plain.join("\n")] };
    const flattened: string[] = [];
    for (const canvas of canvases) {
      checkAborted(options.signal);
      const flat = flattenedCopy(canvas);
      flattened.push((await worker.recognize(flat)).data.text);
      flat.width = flat.height = 0;
    }
    const texts = [plain.join("\n"), flattened.join("\n")];
    if (!texts.some(looksLikeMrz) || texts.some((text) => readMrz(text).documentNumber)) return { texts };

    // An MRZ the first pass couldn't verify: once more, on the unflattened image, seeing only MRZ characters.
    await worker.setParameters({ tessedit_char_whitelist: MRZ_CHARACTERS, tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
    const mrzTexts: string[] = [];
    for (const canvas of canvases) {
      checkAborted(options.signal);
      mrzTexts.push((await worker.recognize(canvas)).data.text);
    }
    return { texts, mrzText: mrzTexts.join("\n") };
  } finally {
    options.signal?.removeEventListener("abort", stop);
    stop();
    // Let the pixels go now rather than whenever the canvases are collected.
    for (const canvas of canvases) canvas.width = canvas.height = 0;
  }
}

/**
 * The text a file holds, as read: its own text layer, or OCR. Separate from
 * `readDocument` so the rules can be checked against exactly what the engine
 * saw on a real document.
 */
export async function readDocumentText(file: File, options: Options): Promise<ReadText> {
  if (file.size > MAX_DOCUMENT_BYTES) throw new ExtractionError("too-large");
  options.onStage?.("opening");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffFileKind(bytes);
  if (!kind) throw new ExtractionError("unsupported");
  if (kind !== "pdf") {
    const size = imageDimensions(bytes, kind);
    if (!size) throw new ExtractionError("unreadable");
    if (size.width * size.height > MAX_IMAGE_PIXELS) throw new ExtractionError("too-many-pixels");
  }
  checkAborted(options.signal);

  try {
    if (kind === "pdf") {
      const read = await readPdf(bytes, options);
      return "text" in read ? { texts: [read.text] } : await recognise(read.canvases, options);
    }
    return await recognise([await imageCanvas(file)], options);
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (options.signal?.aborted) throw new DOMException("Extraction cancelled", "AbortError");
    throw new ExtractionError("unreadable");
  }
}

export async function readDocument(file: File, options: Options): Promise<FieldSuggestions> {
  const { texts, mrzText } = await readDocumentText(file, options);
  return suggestFields(texts, options.locale, mrzText);
}
