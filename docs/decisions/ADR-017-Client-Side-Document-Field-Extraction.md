# ADR-017: Client-Side, Deterministic Document Field Extraction (KD-016)

## Status

Accepted — implemented on `v1.5.0`. Tested against seven published
specimen documents and given a security review. Testing with the owner's
own documents is still to come; its results may tune the rules below but
are not expected to change the design.

This record replaces the original proposal (commit `d26adf4`). It
describes what was built, the decisions behind it, and what testing
changed. The proposal and the notes from each round of testing remain in
git history.

## Context

KD-016 asks Kinesis to suggest field values when a user adds a document.
The user always checks and confirms them before anything is saved. Three
constraints shaped the design:

1. **No AI.** Extraction had to be deterministic: OCR plus rules that can
   be read and tested. No LLM and no cloud document-AI service.
2. **No file storage.** Kinesis has no file store, and the Upload dialog
   was a stub whose Continue button just closed it. Storage (ADR-003's
   "File upload and storage") is a separate and larger security piece of
   work, deliberately left out of this one.
3. **The documents are sensitive.** Most of the default document types are
   identity documents: passports, licences, visas, ID cards.

The guiding principle, from the ticket: *automation should remove typing,
not remove user control.* In practice that became **blank, not wrong**.
An empty field costs the user a few seconds; a confidently wrong expiry
date costs them a missed renewal.

## Decision

### 1. Everything runs in the user's browser

The picked file is read in the browser tab and dropped afterwards. Neither
the file nor any text read from it is sent to the server, logged or
stored. The server sees only what the user confirms and submits, through
the existing `createDocumentAction` and its validation (ADR-015 limits
included). That is the same path as typed values, and it has no new
endpoint.

**Rejected:** server-side OCR. Even "transient" processing would put
passports on our infrastructure, logs and hosting provider. It would also
hit Vercel's request-body limit (about 4.5 MB) and be a poor fit for a
WASM engine on serverless functions.

**Cost:** the first read downloads the OCR engine, and speed depends on the
device.

### 2. Existing engines; our own field rules

We didn't write OCR or PDF parsing. Our code only turns text into field
suggestions.

| Job | Package (pinned exactly) | Licence |
|---|---|---|
| Text from PDFs that already contain text | `pdfjs-dist` 6.4.299, legacy build for older mobile browsers | Apache-2.0 |
| Text from photos and scans | `tesseract.js` 7.0.0 + `tesseract.js-core` 7.0.0 (LSTM engine, no LLM) | Apache-2.0 |
| English language data | `@tesseract.js-data/eng` 1.0.0 (`4.0.0_best_int`) | MIT |
| Parsing and checking passport/ID machine-readable zones (MRZ) | `mrz` 5.0.2 | MIT |

**Rejected:**
- **Cloud OCR** (Textract, Document AI, Azure): machine learning, sends
  identity documents to a third party, and costs per page.
- **`scribe.js-ocr`**: AGPL-3.0.
- **Python tools** (Docling, Unstructured, PaddleOCR): wrong runtime, and
  they would force server-side processing.
- **Barcode readers**: Australian licences carry no standard data barcode.

### 3. The pipeline

```text
File picked (PDF, PNG, JPEG)
  │  size ≤ 10 MB; real type from the first bytes, not the name;
  │  images: dimensions from the header, ≤ 60 MP, before decoding
  ▼
PDF ──► pdf.js text layer, first 3 pages
  │        ≥ 40 characters? ──yes──► text ──────────────────────────┐
  │        no: draw pages (≤ 2000 px long edge) ──┐                 │
  ▼                                               ▼                 │
Image ──► EXIF-rotated, scaled to a 2000 px long edge               │
          (shrunk, or enlarged up to 4×)                            │
  ▼                                                                 │
Reading 1: plain image ── MRZ verified? ──yes──► done ──────────────┤
  ▼ no                                                              │
Reading 2: greyscale, contrast-stretched copy                       │
  ▼                                                                 │
MRZ-looking text but no verified number?                            │
  └─► Reading 3: plain image, MRZ characters only                   │
  ▼                                                                 ▼
Field rules over every reading ──► suggestions ──► create form, pre-filled
```

**Why several readings.** Every adjustment to the image helped some cards
and hurt others. Contrast-stretching lifted "EXP" off a US licence's
security pattern, and lost the name and number lines on a VicRoads
licence. It also turned a clean "21-03-2024" into "21703-2024", and broke
a digit in a passport MRZ that was already on plain paper. So each image
is read both plain and flattened, and the results are combined by
agreement (§4). The flattened reading is skipped when the plain one
already verified an MRZ document number, so a clean passport costs one
reading.

**Why enlarge.** Tesseract reads text about 20–30 px tall. Web and
screenshot images of cards are often 250–600 px wide, which puts their
print at 8–12 px: below what it reads at all. Before enlarging, the first
specimens produced almost no usable text.

### 4. Field rules (`lib/documents/extraction/`)

All pure functions over text, unit-tested in Vitest.

**MRZ (`mrz.ts`): the most reliable source.** It finds lines of
`A–Z 0–9 <` and tries the TD3 (passport), TD2 and TD1 (ID card) layouts.
It undoes common OCR slips (`«` → `<<`, `(`/`[`/`{` → `<`, spacing).

A line may be up to 2 characters short (padded) or 6 long (trimmed), since
OCR splits filler into junk. Line 1 carries no check digit and only its
issuing-state code is used.

Each field is accepted only when **its own check digit passes**:
- **Document number:** its own check digit.
- **Expiry:** its own check digit.
- **Country:** has no check digit, so it's used only alongside a verified
  field.

`mrz`'s autocorrect fixes look-alike characters in all-digit or
all-letter fields. A document number can hold both, so a separate repair
handles it.

**Document number repair:**
- Try single look-alike swaps (`0`↔`O`/`D`/`Q`, `1`↔`I`, `2`↔`Z`, `5`↔`S`,
  `6`↔`G`, `8`↔`B`).
- Accept a swap only if exactly one makes **both** the number's check
  digit and the composite check digit pass.
- If the composite digit itself was misread, the swaps that satisfy the
  number's own check digit are returned as candidates. These are never
  suggested on their own: on one specimen, four different swaps passed.
  A candidate is used only when the number printed on the page matches it
  (§4, `crossChecked`).

**Printed labels (`labels.ts`).**

*Labels recognised:*
- **Expiry:** English (Expiry, Date of expiry, Valid until, Exp…), Spanish,
  French, German, and the US licence code `EXP`.
- **Issue date:** English, Spanish, French, German, and the US code `ISS`.
- **Document number:** Document/Passport/Licence/Card/Policy… No./Number,
  the Spanish/French/German equivalents, and upper-case `DL`.
- Word edges are written out with `\p{L}` rather than `\b`, which is
  ASCII-only. There's no lookbehind or inline flags, which older iOS
  Safari can't parse.

*Where a value is taken from:*
- On the label's own line, within 80 characters after it.
- Or under a label that ends its line, up to two lines down. One or two
  stray non-digit characters after the label still count as ending it.
- Under a label, the number is taken only if exactly one number-shaped
  token is on that line, ignoring dates. A leading `$` is read as `S`.

*Column headers:* a line of headers with no dates of its own ("Date of
issue   Date of expiry", or "LICENCE EXPIRY   DATE OF BIRTH") is paired
with the same number of dates on the next line, in order. Date of birth is
recognised only to tell the columns apart; it is never suggested.

*Refusals:*
- A line naming both issue and expiry over one date ("Date of issue /
  Date d'expiration") is read by neither rule.
- Bare "issued" needs its date on its own line, so "Issued by …" isn't
  misread.
- Two different readings of a field leave it blank.
- An expiry on or before the issue date drops both.

**Dates (`dates.ts`).**
- Formats read: ISO; numeric with a consistent separator; day–month-name
  ("03 APR 2027", "03APR2027", bilingual "03 APR /AVR 27");
  month-name–day.
- Only real calendar dates count.
- **Day/month order:** a numeric date with a part over 12 anywhere on the
  document sets the order for the whole document. Otherwise the owner's
  locale decides.
- **Two-digit years:** this century, unless that is more than 20 years
  ahead, in which case the last one ("94" → 1994).

**Combining (`suggest.ts`).**
- The MRZ wins wherever it verified a field.
- Otherwise a field is taken from whichever reading has it. If two
  readings disagree, it's left blank.
- Document type comes from the MRZ document code, or from keywords when
  exactly one kind of document is named. A licence's own field labels
  count as licence evidence, because its white-on-blue header is lost to
  OCR.
- The suggested name is the type plus the MRZ country, e.g. "Passport
  (Australia)".

### 5. Serving the engines from Kinesis

By default, tesseract.js fetches its worker, WASM core and language data
from jsDelivr. That would tell a third party whenever someone scans a
document, and it breaks `connect-src 'self'`.

- `scripts/copy-extraction-assets.mjs` runs on `npm run dev` and
  `npm run build`. It copies the files from `node_modules` into
  `public/extraction/t<tesseract>-c<core>-p<pdfjs>/`, a gitignored folder:
  - the OCR worker
  - three LSTM core builds (the device loads one)
  - `eng.traineddata.gz`
  - the pdf.js worker
  - pdf.js's JBIG2, JPEG 2000 and colour-profile decoders, needed for
    scanned PDFs
- It does **not** copy `quickjs-eval`, pdf.js's engine for JavaScript
  embedded in PDFs.
- `lib/documents/extraction/assets.json` is the one source for the folder
  name. The build fails if it disagrees with what's installed.
- **Headers** (`next.config.ts`):
  - `/extraction/*` is cached `immutable` for a year (the folder name
    changes with every version) and excluded from the `no-store` rule.
  - `'wasm-unsafe-eval'` is added to `script-src`. It allows compiling
    WASM only, not `eval()`.
- **Auth proxy** (`proxy.ts`): `/extraction/` is excluded from the matcher.
  These are public library files with no user data. A unit test fails if
  an app route is ever created under that path.
- **Worker settings:**
  - tesseract.js runs with `workerBlobURL: false`, so its worker loads from
    a same-origin URL and `worker-src 'self'` covers it.
  - `cacheMethod: "none"`, so it keeps no IndexedDB copy.
- **Lint:** the copied minified files are excluded from ESLint.

**Download on first use:**
- OCR worker: 0.1 MB
- One WASM core: 3.9 MB
- English data: 2.9 MB
- For PDFs, the pdf.js worker: 1.3 MB, plus a 0.9 MB code chunk

After that, it's all cached. The extraction code is loaded with `import()`
only once a file is actually being read, so the Documents page is no
heavier.

### 6. User interface (`app/(app)/documents/`)

- **`CreateDocumentDialog`**: the create form, moved out of
  `ManualDocumentButton`. "Add manually" opens it empty; the upload path
  opens it pre-filled.
  - Each pre-filled field shows "From your document — check this"
    (`SuggestedHint`; `DocumentFields` takes a `suggested` set).
  - A banner states that the file was read on the device and not uploaded
    or stored, or that nothing certain was found.
- **`UploadDocumentModal`**:
  - Picks or drag-and-drops a file and shows each stage as it reads.
  - Offers **Fill in myself** while reading and after a failure; that
    cancels the OCR worker and opens the empty form.
  - Failure messages: over 10 MB, over 60 megapixels, not a PDF/PNG/JPEG,
    or unreadable.
  - Closing the dialog mid-read aborts it.
- **`UploadDocumentButton`**: steps through closed → upload → review.
- The Documents page passes document types and link options to the upload
  path as well.

### 7. Security and privacy

Reviewed against the code and in headless Chromium, with the app's CSP
enforced:

- **No request leaves the origin** during a full read, and there are no
  CSP violations.
- **No browser storage is left behind:** IndexedDB, Cache Storage,
  localStorage and sessionStorage are all empty after a read.
- **The extraction code and upload UI** contain no network, logging or
  storage calls.
- **Hostile files** (both found in review, both fixed):
  - *Decompression bomb.* A 76 KB PNG claiming 20000×20000 px took 12 s to
    decode, and would likely crash a phone's tab. The 10 MB file limit
    can't see it. Image dimensions are now read from the PNG/JPEG header
    and anything over 60 MP is refused before decoding. PDFs get the same
    ceiling through pdf.js `maxImageSize`.
  - *Quadratic rules.* A line of nothing but "Expiry" labels (200 KB) took
    the rules 30 s. Values are now looked for within 80 characters of a
    label, and each reading is capped at 50,000 characters: 0.6 s.
- **Resource release:** the PDF loading task is destroyed (ending its
  worker), the OCR worker is terminated, and canvases are released after
  each read.
- **Dependencies:** pinned exactly. `npm audit` shows only the existing
  deepmerge-ts item (OPS-002).

## Results on specimen documents

Seven published specimen images, read in Chromium through the same code
the app runs:

| Specimen | Type | Number | Expiry | Other |
|---|---|---|---|---|
| Australian passport (Jane Citizen, 250 px wide) | ✅ | ✅ RA0123456, repaired from "RAD123456" | ✅ 2032-08-01 | ✅ country |
| Australian diplomatic passport (1994) | ✅ | ✅ S0000001, page and MRZ agree | ✅ 1994-11-01 | ✅ country |
| VicRoads licence (Zhang) | ✅ | ✅ 051395622 | ✅ 2024-03-21 | |
| VicRoads licence (Jane Citizen) | ✅ | ⬜ only reading misread it, unlabelled | ✅ 2019-05-20 | |
| Chilean ID card | ⬜ | ⬜ in a column beside date of birth | ✅ 2027-09-15 | ✅ issue date |
| US driver licence | ✅ | ⬜ "DL" misread as "pL" | ❌ read day-first, see below | |
| Australian passport (Marcus) | ✅ | ⬜ | ⬜ | Its MRZ is invalid (5-digit birth date, failing check digits), so it is correctly refused |

Generated documents (an MRZ passport image, a text PDF, a scanned PDF and
an HTML file renamed `.pdf`) all read correctly or were refused. Times on
a desktop were 0.2 s for a text PDF and 1.3–6 s for images. The slowest
are passports whose MRZ needs all three readings.

**How it was tested:**
- `tests/unit/document-extraction.test.ts` (61 tests) covers every rule.
  Its fixtures include the text tesseract.js actually produced from these
  specimens, so a rule change that breaks a real case fails the suite.
- OCR itself was exercised by bundling `readDocument` into a throwaway
  page served with the app's CSP and driving it with Playwright. That
  harness was not committed, and no specimen image is in the repository.

## Known limits

- **US-format dates under an Australian locale.** "EXP 07/11/2025", with
  no unambiguous date elsewhere on the card, is read as 7 November, where
  a US licence means 11 July. It is marked for checking like every
  suggestion. The owner decided to leave this as is: their documents are
  Australian.
- **Multi-column numbers** aren't read. Telling columns apart needs word
  positions from OCR, not just its text.
- **Visas** are untested. `mrz` parses TD1–TD3; machine-readable visas
  (MRV-A/B) may not parse, and then fall back to the label rules.
- **The CSP is still report-only** (a pre-existing decision in
  `next.config.ts`). "Nothing leaves the device" rests on the code,
  reviewed and verified with the policy enforced, rather than on the
  browser blocking it. Enforcing the CSP would make it a guarantee, even
  against a compromised OCR or PDF package.
- `pdfjs-dist` installs `@napi-rs/canvas` as an optional native dependency
  on the build machine. It is never shipped to the browser or used.

## Consequences

- **Privacy:** documents never leave the device. There's no server change
  and no stored-file risk; confirmed values are saved like typed ones.
- **Accuracy:** good on passports and ID cards with a valid MRZ, and on
  PDFs that contain text. Moderate on photographed cards. The design
  depends on "blank, not wrong" and on the user confirming.
- **Cost:** first use downloads about 7 MB (about 9 MB with a PDF), and
  each image takes one to three OCR readings.
- **Future storage:** when file storage arrives, extraction stays
  client-side and independent of it. Storage must not quietly become "OCR
  on the server".

## Related

- KD-016 (the ticket)
- ADR-003 (Documents module)
- ADR-015 (field limits, which apply to suggested values)
- OPS-002 (the existing audit item)
- Commits on `v1.5.0`: `2a4e3ff`, `8f5029e`, `bf3e684`, `fecf95f`, `5723a79`
