# KD-057 — Capture Box: Type It or Snap It

**Status:** In Progress — built on `v1.5.0`; testing on the owner's own devices to come
**Priority:** High
**Tags:** UX / UI, Improvement

## Summary

One place to capture anything. Type "need to make a dr's appt by Sept 24th"
and it becomes the to-do **Make a dr's appt**, due **24 Sep**, with the date
already read from the sentence. Or attach a PDF or photo of a document and
the Documents form opens pre-filled (KD-016).

The design was agreed as mockups first (two computer frames, three phone
frames), and the decisions behind it are in
[ADR-018](../decisions/ADR-018-Capture-Box.md).

## Agreed scope

* **Computer:** the existing ⌘K bar grows into the capture box. Its
  dropdown leads with a **Will create** card (title, due date, Create /
  Enter), then search matches, then "Create as something else". There's a
  paperclip, and a file can be dropped on the bar.
* **Phone:** the tab bar's **+** opens a capture sheet: a large text box,
  **Take photo** / **Choose file**, the same card with a To-Do / Document /
  Goal switch, and a full-width Create button.
* **No AI.** Dates are read by rules on the device (`chrono-node`), the same
  "blank, not wrong" approach as KD-016.
* **A date with no year that has already passed this year** is set for next
  year, and the card says so in a yellow note.

## Left for later (owner's call)

* A "Make a to-do to renew it" button for expired or expiring documents.
* Example phrases in the phone sheet.
* AI, as an opt-in "Try with AI" on the same card, if rules prove not enough.

## Progress

* `lib/capture/parse.ts` reads the title and date; tested in
  `tests/unit/capture-parse.test.ts`, including with the device set to
  UTC+14 and UTC−11.
* `captureTodoAction` takes an optional due date, validated like every
  other due date; integration tests cover a valid and an invalid one.
* Computer: `CommandBar`. Phone: `CaptureSheet`, opened from `MobileTabBar`.
  Shared pieces: `components/capture/CaptureDraft.tsx`, and the file-reading
  hook `lib/documents/extraction/use-document-read.ts` (also now used by the
  Documents page's Upload dialog).
* **Save as** (owner's request after the first build): To-Do | Document |
  Both, with Kinesis's suggestion marked. Bills and notices are read for a
  date to act by and suggest Both; ID documents suggest Document. Both
  saves a document plus a linked to-do via the Documents form ("Also create
  a to-do"); the Documents page's own Upload gets the same section.
  Integration tests cover the linked to-do and a refused one.
* **Bill details and deadlines in the wording** (owner's request): "Amount
  due", "Account name", "Biller code" and the BPAY reference are read from
  bills and kept as the document's custom fields and the to-do's notes.
  Pasted emails and letters (and files of them) give up the date they ask
  for ("by 12 Nov", "by tomorrow" counted from the Sent line, "before
  10/23/26", "due by next week"), titled from the subject or the sentence
  with the deadline. Rules in `lib/capture/deadline.ts` and `labels.ts`;
  unit tests in `capture-parse.test.ts` and `document-extraction.test.ts`,
  integration tests for the saved notes and custom fields.
