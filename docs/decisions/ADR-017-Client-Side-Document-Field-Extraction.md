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

## Spike round 1 — published specimen images

The owner's first test used four published specimen images: a US driver
licence, a Chilean ID card and two Australian passports, all 250–600 px
wide. At first only the document type came through. What was wrong, from
the raw OCR text, and what changed:

- **Too small to read.** Small images were never enlarged, so their print
  was 8–12 px tall, below what Tesseract reads at all. Images are now
  enlarged up to 4× toward a 2000 px long edge.
- **Security-pattern backgrounds.** The general pass now reads a copy that
  is greyscaled and contrast-stretched (darkest 1% to black, lightest 40%
  to white). On the US licence this turned "MR"/"exe" into "EXP". It broke
  a digit in a passport MRZ, which sits on plain paper, so the MRZ pass
  reads the unflattened image.
- **MRZ misses.** A first pass that read every `<` as `C` never triggered
  the MRZ-only pass; the trigger is now a run of filler *or* any long line
  of MRZ characters. A document number with one look-alike misread
  (`RA0123456` read as `RAD123456`) is repaired only when exactly one
  single-character swap makes both its own check digit and the composite
  check digit pass.
- **Labels in other languages.** Spanish, French and German expiry, issue
  and document-number labels, and the US licence codes `DL`, `EXP`, `ISS`.
  A line naming both issue and expiry over a single date ("Date of issue /
  Date d'expiration") is no longer read by either single-label rule: it
  had been about to fill the issue date in as the expiry.
- **Day/month order.** A numeric date with a part over 12 anywhere on the
  document now sets the order for the whole document; the locale only
  decides when the document doesn't.

Results after the changes:

| Sample | Before | After |
|---|---|---|
| Australian passport (Jane Citizen) | type | number, expiry, country, type (all check-digit verified) |
| Chilean ID | — | expiry, issue date |
| US licence | type | type, expiry (read day-first under en-AU; see below) |
| Australian passport (Marcus) | type | type: its MRZ is invalid (5-digit date of birth, failing check digits), so it is correctly refused, and its visual-zone labels don't survive OCR |

Still open:
- **US-format dates under an Australian locale.** "EXP 07/11/2025" with
  no unambiguous date elsewhere on the card is read as 7 Nov, where the US
  licence means 11 Jul. It is marked for checking like every suggestion.
  The owner decided to leave this as is: their documents are Australian.
- **Multi-column numbers** (the Chilean "NÚMERO DOCUMENTO" sits beside the
  date of birth) aren't read: telling columns apart needs word positions
  from OCR, not just its text.
- Specimen images are small, flat and clean. Phone photos of real
  documents are the remaining test.

## Spike round 2 — document number on a passport specimen

A 1994 Australian diplomatic passport specimen gave type only. From its OCR
text:

- The MRZ's first line came out 47 characters long (misread filler), and
  the length check discarded the whole MRZ with it. Lines may now run up
  to 6 characters long and are trimmed. Line 1 holds no check digit and
  only its issuing-state code is used.
- The MRZ's number read "SO000001" with its composite check digit lost.
  Four one-character fixes satisfy the number's own check digit, so the
  MRZ alone can't choose. It now returns those as candidates, and the
  number printed on the page decides: kept if it is one of them, dropped
  if it contradicts them all.
- The printed number was two lines under "DOCUMENT No." (the "Type / Code
  of issuing State" line sits between), after a stray "x" on the label's
  line, and read as "$0000001". The label rule now tolerates one or two
  stray non-digit characters, looks up to two lines down, and reads a
  leading "$" as "S".
- "94" had been read as 2094. A two-digit year more than 20 years ahead
  is now the 1900s, in both MRZ and printed dates.
- "Date of issue" (the full phrase) may now take its date from the line
  below; the bare word "issued" still may not ("Issued by …").

Result: number S0000001, expiry 1994-11-01 and country, with the number
confirmed by both the page and the MRZ.

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
