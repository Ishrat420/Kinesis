# ADR-017: Client-Side, Deterministic Document Field Extraction (KD-016)

## Status

Proposed — v1 is built on the `v1.5.0` branch (see "Implementation" below) so
the spike in "Phasing" runs on the real Upload flow instead of a separate test
page. It moves to Accepted once the spike's results are in.

## Context

KD-016 asks for field suggestions when a user adds a document, with the
user always confirming before anything is saved. Three constraints shape
how:

1. **No AI.** Extraction must be deterministic: OCR plus rules we can read
   and test. No LLM, no cloud document-AI service.
2. **No file storage (for now).** Kinesis has no file store. The Upload
   dialog (`UploadDocumentModal.tsx`) picks a file and then its Continue
   button just closes. Storage (ADR-003's "File upload and storage") is a
   separate, larger security piece of work and is out of scope here.
3. **The documents are sensitive.** Passports, licences, visas and
   contracts. The default document types (`lib/documents/types.ts`) are
   mostly identity documents.

What already exists and can be reused unchanged:

- `ManualDocumentButton` + `DocumentFields` already render the full create
  form, and `DocumentFields` already accepts initial `values`.
- `createDocumentAction` already validates and length-limits every field
  server-side (`documentData`, ADR-015). Pre-filled values get no special
  trust: they go through the same path as typed ones.
- `useFormatPreferences` already knows the user's date format, which is
  what is needed to read an ambiguous `03/04/2027`.

## Decision

### 1. Extraction runs entirely in the user's browser

The selected file is read in the browser, extracted in a Web Worker, and
dropped from memory afterwards. Neither the file nor its OCR text is sent
to the server. The only thing that reaches the server is what the user
confirms and submits, through the existing `createDocumentAction`.

Why not server-side:
- Even "transient" server processing sends the passport to our
  infrastructure (and our logs, error reporting and hosting provider).
  "Never leaves your device" is a stronger and simpler promise.
- Vercel functions cap request bodies (about 4.5 MB) and are a poor host
  for a WASM OCR engine (cold starts, memory).
- No server code changes are needed at all.

The cost of this choice: the first extraction downloads the OCR engine
(see §5), and speed depends on the device.

### 2. Off-the-shelf engines, custom field rules

We do not write OCR or PDF parsing. We only write the step that turns
text into field suggestions.

| Job | Library | Licence | Notes |
|---|---|---|---|
| Text from PDFs that already contain text | `pdfjs-dist` 6.x | Apache-2.0 | Mozilla's PDF engine, the same one Firefox uses. Exact, fast, no OCR. |
| Text from photos and scans | `tesseract.js` 7.x + `tesseract.js-core` 7.x + `@tesseract.js-data/eng` | Apache-2.0 / MIT | Tesseract (classic LSTM OCR, no LLM) compiled to WASM. |
| Parse and verify the passport/ID machine-readable zone (MRZ) | `mrz` 5.x | MIT | Validates check digits (verified locally on the ICAO specimen: a single misread character in the document number fails both its own check digit and the composite one). |
| Field rules | Our own code in `lib/documents/extraction/` | — | Pure functions over text, unit-tested in Vitest. |

Rejected:
- **Cloud OCR** (AWS Textract, Google Document AI, Azure Document
  Intelligence): ML-based, sends identity documents to a third party, and
  costs per page.
- **`scribe.js-ocr`**: better accuracy than plain Tesseract, but AGPL-3.0.
- **Python tools** (Docling, Unstructured, PaddleOCR): wrong runtime for
  this stack, and would force server-side processing.
- **`unpdf`**: a wrapper around pdf.js aimed at server/edge use. In the
  browser, `pdfjs-dist` directly is simpler.
- **Barcode readers** (`zxing-wasm`): not for v1. Australian licences
  don't carry a standard data barcode the way US AAMVA licences do. Worth
  revisiting only if a target document type needs it.

### 3. The pipeline

```text
File picked
  │  check: size ≤ 10 MB, real type from magic bytes (not the extension)
  ▼
PDF? ──yes──► pdf.js text layer (first 3 pages max)
  │               │ enough text? ──no──► render page to canvas ─┐
  │               ▼                                             │
  │           text                                              │
  no (image)                                                    │
  ▼                                                             │
createImageBitmap (honours EXIF rotation), downscale to         │
~2000 px long edge, greyscale ◄─────────────────────────────────┘
  ▼
Tesseract (Web Worker)
  ▼
text + per-word confidence
  ▼
Field rules (by detected or chosen document type)
  ▼
Suggestions { field, value, confidence, source }
  ▼
Existing manual form opens pre-filled; each suggested field is marked
"Check this"; the user edits and saves as normal
```

### 4. Field rules, in order of reliability

**a. MRZ (Passport, Visa, ID Card): high reliability.**
Find the 2–3 lines matching the ICAO 9303 layouts (TD3 for passports,
TD1/TD2 for ID cards, MRV-A/B for visas). Run a second OCR pass over that
area, restricted to `A–Z 0–9 <` (`tessedit_char_whitelist`). Parse with
`mrz`. If a check digit fails, try swapping the usual OCR confusions
(`O↔0`, `I↔1`, `B↔8`, `S↔5`, `Z↔2`) only in the failing field, and accept
the result only if every check digit then passes. MRZ dates are `YYMMDD`:
read the expiry year as 20YY. Read the birth year as 19YY when 20YY would
be in the future.

Gives: document number, expiry date, country (issuing state → `country`),
and holder name (for the document name suggestion, e.g. "Australian
passport"). Issue date is **not** in the MRZ, so it falls to rule (b).

**b. Labelled dates and numbers (everything else): moderate reliability.**
Find a label (`Expiry`, `Expires`, `Valid until`, `Date of expiry`,
`Issued`, `Date of issue`, `Licence No.`, `Policy number`, …), then take
the nearest date or ID-shaped token to its right or below it. Dates are
parsed in the user's format preference. A date that could be read two
ways (`03/04/2027`) is only suggested if the preference settles it,
otherwise it is left blank. Never guess.

**c. Document type: low-stakes hint.**
A matching MRZ prefix (`P<` = passport, `V` = visa, `I`/`A`/`C` = ID card)
or keywords pre-selects the type, which the user can change.

Every rule returns nothing rather than a weak guess. A blank field costs
the user a few seconds; a confidently wrong expiry date costs them a
missed renewal.

### 5. Security and privacy requirements

- **Self-host every asset.** By default `tesseract.js` downloads its
  worker, WASM core and language data from jsDelivr. That tells a third
  party when a user is scanning a document, and breaks our
  `connect-src 'self'`. Serve `worker.min.js`, the core `.wasm` builds,
  `eng.traineddata` (tessdata_fast) and the pdf.js worker from `/public`
  (or a build-copied path), pinned to exact versions.
- **CSP.** The policy in `next.config.ts` is report-only today, but plan
  for enforcement: add `'wasm-unsafe-eval'` to `script-src` (needed to
  compile WASM). Set `workerBlobURL: false` in tesseract.js so its worker
  loads from a same-origin URL and `worker-src 'self'` is enough, with no
  need for `blob:`.
- **pdf.js hardening.** Use 6.x (well past CVE-2024-4367, a code-execution
  bug fixed in 4.2.67). pdf.js 6 has removed the eval-based font path that
  `isEvalSupported: false` used to switch off, so there is no option left to
  set. Don't ship `quickjs-eval` (pdf.js's engine for JavaScript embedded in
  PDFs). Never render pdf.js output as HTML. The risk is contained anyway:
  it's the user's own file, in their own browser.
- **Data minimisation (KD-016).** Raw OCR text is never put in `notes`,
  never logged, and never sent anywhere. Only the specific suggested
  fields are surfaced. Terminate the worker, revoke object URLs and drop
  references once the form is open.
- **Limits.** 10 MB file, 3 pages, ~2000 px long edge. These protect the
  device from huge files as much as anything.
- **No new trust.** Suggestions go through the same server validation as
  typed values. Extraction adds no new server endpoint.

### 6. Performance

- Load nothing until the user actually picks a file (dynamic `import()`
  inside the upload flow, so the documents page bundle is unchanged).
- Download on first use (measured on the built files): OCR worker 0.1 MB,
  one WASM core 3.9 MB (the device gets one of three builds), English
  language data 2.9 MB, and for PDFs the pdf.js worker 1.3 MB plus a
  0.9 MB chunk. All of it is cached for a year after that, because the
  folder name changes with every version.
- Expect a few seconds per image on a modern phone. Show progress, and
  always let the user skip straight to the empty form.

### 7. UX

- The Upload dialog's Continue button becomes: extract → open the existing
  "Add document" form pre-filled.
- Each pre-filled field shows a small "From your document, check this"
  marker until the user touches it. Fields with no confident value stay
  empty.
- Copy states plainly: "Read on this device. Your file isn't uploaded or
  stored." That is true only because of §1 and §5, so it must stay true
  if the design changes.
- On mobile, `<input type="file" accept="image/*,.pdf">` already offers
  the camera. That opens the system camera app, which our
  `Permissions-Policy: camera=()` does not block. A live in-page camera
  view (`getUserMedia`) is out of scope.
- KD-016 asks that users can turn AI features off. There is no AI here,
  but the Upload vs "Add manually" split already gives that choice. No
  setting needed for v1.

### 8. Testing

- **Field rules:** pure functions, Vitest, fixtures as plain OCR-text
  strings: ICAO specimen MRZs, OCR-damaged variants, label/date layouts,
  ambiguous dates under each format preference. Most of the logic lives
  here, so this is where most of the tests go.
- **OCR quality:** not unit-tested. A small hand-run evaluation against
  specimen and real (never committed) documents, recorded as hit rate per
  field per document type.

## Phasing

1. **Spike (1–2 days), as a decision gate.** Run tesseract.js and pdf.js in
   the browser on 10–20 of the owner's own documents. Record per-field hit
   rate, time per page on a phone, and download size. If MRZ passports
   don't reach a very high hit rate, revisit before building the UI.
2. **v1.** PDF text layer + MRZ (Passport, Visa, ID Card) + labelled
   expiry/issue dates. Pre-fill the form with markers.
3. **Later.** More label sets per document type (licences, insurance,
   leases). Optional preprocessing such as deskew and contrast. Revisit
   barcodes only if needed.

## Implementation (v1, on `v1.5.0`)

- Rules: `lib/documents/extraction/` — `dates.ts`, `labels.ts`, `mrz.ts`,
  `suggest.ts`, `file-kind.ts`, tested in
  `tests/unit/document-extraction.test.ts`.
- Browser runner: `lib/documents/extraction/read-document.ts`, loaded with
  `import()` only once a file is being read.
- Assets: `scripts/copy-extraction-assets.mjs` copies the engines into
  `public/extraction/t<tesseract>-c<core>-p<pdfjs>/` on `npm run dev` and
  `npm run build`. The folder is gitignored, and the build fails if
  `assets.json` disagrees with what is installed. Dependencies are pinned
  exactly.
- Headers: `'wasm-unsafe-eval'` in `script-src`; `/extraction/*` cached
  immutable and excluded from the `no-store` rule; excluded from the Clerk
  proxy matcher (public library code, no user data).
- UI: "Upload document" reads the file, then opens the same create form
  as "Add manually" (now `CreateDocumentDialog`), pre-filled, with each
  filled field marked "From your document — check this". "Fill in myself"
  is available while it reads and after a failure.
- The second MRZ pass re-reads the whole image with only MRZ characters
  allowed, and only the MRZ is taken from it. It doesn't crop to the MRZ
  area. Cropping is the next step if the spike shows MRZ misses on real
  photos.
- Checked in headless Chromium with this policy *enforced* on generated
  documents: an MRZ passport image, a text PDF, a scanned PDF and a
  disguised HTML file. All fields were read correctly, the HTML file was
  refused, there were no CSP violations, and no requests left the origin.
  Those were clean synthetic images; real photos are what the spike is for.
- Not yet known: visas. `mrz` parses TD1, TD2 and TD3; machine-readable
  visas (MRV-A/B) may not parse, in which case they fall back to the label
  rules.

## Consequences

- Strong privacy story, no server changes, and no storage risk.
- First use costs a one-off download of a few MB, and speed depends on
  the device.
- Accuracy on arbitrary photos is honestly modest. The design depends on
  "blank, not wrong", and on the user confirming.
- When file storage arrives later, extraction stays client-side and
  independent of it. Storage must not quietly turn into "OCR on the
  server".

## Open questions

1. Which document types are in v1: just passport/visa/ID card + PDFs, or
   licences too?
2. Should the spike use real personal documents (never committed), or
   only public specimens?
3. Is 10 MB / 3 pages the right limit for the documents you actually have?

## Related

- KD-016 (the ticket), ADR-003 (Documents module), ADR-015 (field limits,
  which still apply to suggested values)
