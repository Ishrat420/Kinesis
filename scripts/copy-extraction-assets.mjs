// Copies the document-extraction engines (KD-016, ADR-017) out of node_modules
// into public/extraction/<versions>/, so the browser loads them from Kinesis
// itself. tesseract.js otherwise fetches its worker, WASM core and language
// data from a public CDN -- which would tell a third party every time someone
// scans a passport, and breaks `connect-src 'self'`.
//
// The folder name carries every version, so the files can be cached forever:
// an upgrade is a new URL. lib/documents/extraction/assets.json is that name's
// single source, read here and by the browser code; this fails the build when
// it disagrees with what is actually installed.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modules = join(root, "node_modules");
const expected = JSON.parse(readFileSync(join(root, "lib/documents/extraction/assets.json"), "utf8"));

const installed = (name) => JSON.parse(readFileSync(join(modules, name, "package.json"), "utf8")).version;
const mismatches = [
  ["tesseract.js", expected.tesseract],
  ["tesseract.js-core", expected.tesseractCore],
  ["pdfjs-dist", expected.pdfjs],
].filter(([name, version]) => installed(name) !== version);
if (mismatches.length > 0) {
  for (const [name, version] of mismatches) console.error(`${name}: assets.json says ${version}, installed is ${installed(name)}`);
  console.error("Update lib/documents/extraction/assets.json to the installed versions.");
  process.exit(1);
}

const base = join(root, "public", "extraction");
const target = join(base, `t${expected.tesseract}-c${expected.tesseractCore}-p${expected.pdfjs}`);
// Only ever one version on disk: old folders would otherwise ship forever.
rmSync(base, { recursive: true, force: true });

const files = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  // LSTM-only cores (the engine mode the browser code asks for), one per CPU feature level; tesseract.js picks.
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "core/tesseract-core-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "core/tesseract-core-simd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "core/tesseract-core-relaxedsimd-lstm.wasm.js"],
  [`@tesseract.js-data/eng/${expected.eng}/eng.traineddata.gz`, "lang/eng.traineddata.gz"],
  ["pdfjs-dist/legacy/build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
  // Image decoders for scanned PDFs (JBIG2, JPEG 2000, colour profiles). Not
  // quickjs-eval: that runs JavaScript embedded in a PDF, which nothing here should.
  ["pdfjs-dist/wasm/jbig2.wasm", "pdf-wasm/jbig2.wasm"],
  ["pdfjs-dist/wasm/openjpeg.wasm", "pdf-wasm/openjpeg.wasm"],
  ["pdfjs-dist/wasm/qcms_bg.wasm", "pdf-wasm/qcms_bg.wasm"],
];
for (const [from, to] of files) {
  const source = join(modules, from);
  if (!existsSync(source)) {
    console.error(`Missing ${from} -- run npm install.`);
    process.exit(1);
  }
  mkdirSync(dirname(join(target, to)), { recursive: true });
  copyFileSync(source, join(target, to));
}
console.log(`Document extraction assets copied to ${target.slice(root.length + 1)}`);
