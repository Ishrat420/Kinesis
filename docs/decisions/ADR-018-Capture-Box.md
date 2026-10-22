# ADR-018: The Capture Box — Rules-Read Dates, a Confirm Card, No AI (KD-057)

## Status

Accepted — implemented on `v1.5.0`. Still to be tried on the owner's own
devices.

## Context

Quick capture (ADR-009, KD-008) already turned a typed title into a To-Do
from the ⌘K bar, and the phone's **+** focused that same bar. It couldn't
tell that "by Sept 24th" was a date, and attaching a document meant going
to the Documents page. The owner wanted both in one place: tell it, or
upload it.

Options considered:

1. **A chatbot popup.** Rejected: a conversation adds typing, which is
   exactly what capture exists to remove. "Make a dr's appt by Sept 24th"
   needs one confirmation, not a dialogue.
2. **AI reading of the text.** Considered and deferred by the owner. Rules
   handle the everyday sentence; AI earns its place only on messy,
   multi-item input and on linking to existing records. It would also end
   "never leaves your device" for those requests. If it comes, it is an
   opt-in "Try with AI" on the same card.
3. **Grow the existing capture surfaces** — chosen.

## Decision

### One card, confirmed with Enter

The ⌘K dropdown, and the phone sheet, show what the text will create — the
title with filler removed ("need to", "remind me to") and the date phrase
taken out, plus the due date — before anything is saved. Enter (or Create)
saves it. The date can be changed or removed in the card, and the type
switched (Document, Goal). This keeps ADR-009's rule that capture costs
nothing: the card is information, not an extra step, and Undo stays the
safety net after saving.

On the computer the card comes first in the keyboard order (Enter takes
it), then search matches, then the other targets. The dropdown now closes
only when focus leaves the whole capture box, so the card's date and
buttons can be clicked and tabbed to.

### Dates read by rules, on the device

`lib/capture/parse.ts` uses `chrono-node` (MIT, pinned), reading relative
to the owner's own "today" and date order (en-AU reads 3/11 as 3 November).
It follows ADR-017's "blank, not wrong":

- A range, two dates, a bare time ("3pm") or a month without a day sets no
  date. The text stays the title.
- "dec 20" is 20 December, not December 2020, which `chrono` would
  otherwise read.
- **A day and month with no year that has already passed this year is set
  for next year**, and the card says so. It is the one guess made for the
  user, so it is said out loud. Weekdays and relative phrases ("Friday",
  "in 2 weeks") are never flagged.
- The reference day is noon on the owner's date in the device's own time
  zone. A UTC reference made a Los Angeles device read "by Friday", said on
  a Friday, as next Friday. Tests run under UTC+14 and UTC−11.

The server takes the date as an ordinary due date and validates it like
any other (`captureTodoAction`); the client's reading earns it no trust.

### Files go through the existing reader

A file attached in the capture box goes through the KD-016 reader
(ADR-017) unchanged: read on the device, then the Documents create form
opens pre-filled. The form's document types and link options are fetched
by a server action only when it opens, since the capture box lives in the
top bar on every page. The reading state is a shared hook, now also used by
the Documents page's Upload dialog.

### Phone: a sheet, not the top bar

The **+** opens a bottom sheet with room for the card and for **Take
photo** / **Choose file** buttons a thumb can hit. Two details make it
behave:

- **The keyboard comes up with the sheet.** iOS only raises it for a focus
  made within the tap itself, so the sheet opens synchronously and its
  text box is focused in the same handler. That exposed a bug in the shared
  `BottomSheet`: it transitioned `visibility` on the way in, and at the
  first instant of that transition the panel still counts as hidden, so
  nothing in it could take focus. Visibility now transitions only on the
  way out.
- **One confirmation.** A to-do saved from the sheet is announced to the
  top bar, which shows the existing "To-Do created · Add details · Undo"
  banner rather than a second one.

### Save as: Kinesis suggests, the user decides

Added after the first build, when bills and notices made the type of thing
genuinely ambiguous: the same file can be a record to keep, a thing to do,
or both.

**Tick the cards** (second version, the owner's pick). The first build put a
To-Do | Document | Both switch above the cards, which said everything twice.
Now each card has a round tick on its right: both ticked is Both, and the
button says what will happen ("Create to-do", "Check & create", "Check &
create both"). A card Kinesis suggested stays in view, faded, when unticked
("Not kept: the file isn't saved"); one it didn't is a single quiet line
until added ("+ Also save as a document", "+ Add a to-do to renew it"). Goal
moved to a ⋯ beside the button. Instead of a "Suggested" badge, one line
above the cards gives the reason: "Ticked for you: it's a bill with a due
date". Once the ticks change it reads "Changed from what was suggested ·
Undo". Typed text starts with the to-do ticked and nothing else, so Enter
still creates it at once.

| What was read | Suggested |
|---|---|
| Typed text | To-Do |
| A file with a date to act by ("Pay by", "Due date", "Renew by") | Both |
| Anything else, including passports and licences | Document — its expiry already drives reminders |

- **Both** saves the document and a to-do linked to it (ADR-009's "a To-Do
  concerns a Document"). It opens the Documents form, so the document's
  fields are still checked before saving; the form shows the to-do in an
  "Also create a to-do" section that can be edited or removed. The server
  checks the to-do before creating anything, so a bad one never leaves a
  document behind without it.
- **To-Do** from a file saves straight away, like a typed one. The phone
  says plainly that the file itself isn't kept.
- The to-do's title is generated and editable: "Pay electricity bill",
  "Renew car registration". A passport switched to To-Do or Both gets
  "Renew passport", due on its expiry.
- A bill's payment details are read too (below), and kept on whichever is
  saved: as custom fields on the document, as notes on the to-do.
- The computer's dropdown follows the phone's layout at 480 px: cards, one
  button. The owner found the first, wider version cluttered.
- A renewal to-do for a document that has already expired is due today, not
  on the expiry, and the card says "Expired".

Reading rules added for this (`labels.ts`, `suggest.ts`): due/pay-by/renew-by
labels, also in "Bill date / Due date" columns; bill, invoice and statement
dates; account, customer and invoice numbers. "Renewal date" moved from
expiry to the due date, which is what it means on a renewal notice. A
service is named only when exactly one is mentioned ("electricity and gas"
stays "Bill"), and a verified MRZ is never treated as a bill.

### Bill details, and deadlines in the wording

Added at the owner's request, for both Document and To-Do:

- **Labels:** "Amount due" (also total due, amount payable, balance owing),
  "Account name" (also account holder, customer name), "Biller code", and a
  reference ("Ref", "CRN", "Reference number"). Amounts must look like money
  ("$182.40", "AUD 96.10", or written to the cent), so "12.11.2026" and "3
  instalments" are not amounts. As with every field, two readings that
  disagree leave it blank.
- **BPAY:** with a biller code or the word BPAY on the page, the reference
  is the **BPAY reference**, a payment detail, never the document number.
  Without BPAY, a reference is the document number when nothing else
  numbers the document (a policy's "Reference number: POL-55821").
- **Where they go:** the document gets custom fields ("Amount due", "Account
  name", "Biller code", "BPAY reference"), editable in the form like any
  other. The to-do gets the same lines as its notes, so a to-do saved on its
  own, without the file, still says what to pay and how. The card shows the
  short version: "$182.40 · BPAY 23796 / 1234567890". Nothing is read from an
  identity document.

**Deadlines in the wording** (`lib/capture/deadline.ts`), for pasted text
and for files alike: emails and letters say "by 12 Nov", "by tomorrow",
"before 10/23/26" or "due by next week" somewhere among everything else.

- A deadline is a date introduced by a cue. Strong cues ("due", "deadline",
  "no later than", "pay by", "reply by", "renew by") beat weak ones ("by",
  "before", "until"). If the strongest ones disagree, nothing is suggested.
- Dates on header lines ("Sent:", "Date:", "On … wrote:") are never
  deadlines. They are when the message was written, which is what "by
  tomorrow" counts from: an email sent on 14 October saying "by tomorrow"
  means 15 October, whenever it is read.
- A date with no cue counts only in a short, one-line capture ("call dentist
  tomorrow"), where it can't mean anything else. In a long message, a date
  in passing ("great to see you on 3 October") is ignored.
- Pasted messages are titled from their **Subject:** line, else the sentence
  with the deadline in it ("The forms need to be submitted"), greetings and
  "just a reminder that" removed.
- In a file, which doesn't say when it was written unless it has a Sent
  line, relative phrases ("next week") are skipped and only actual dates
  count. A labelled due date always wins. A date in the wording is never
  taken from an identity document, and never when it is the expiry or falls
  before the issue date. A letter or email whose only action is such a date
  suggests **To-Do**; kept as a document, it takes the same name.
- Gmail print-outs (tried on the owner's own emails): the sent date is on
  the sender line ("Name <address>  Fri, Oct 16, 2026 at 10:23 AM"), not a
  "Sent:" line, and the browser's page header ("10/22/26, 12:24 PM  Gmail -
  <subject>") is when it was printed. The sender line anchors relative
  dates; the print header is ignored as a date and gives the subject. In a
  thread, the latest sent date anchors.
- Phrases chrono doesn't know: "mid next week" (Wednesday), "early next
  week" (Monday), "end of this week" (Friday). Office shorthand may sit
  between the cue and the date: "by COB Friday", "by EOD tomorrow".
- A deadline sentence that only points back ("If you can get them to me by
  mid next week") is titled from the ask before it ("Send me your
  feedback…"); politeness ("…, that would be great") is dropped.
- US order is read when the date itself shows it ("10/23/26": 23 can't be a
  month); otherwise the owner's locale decides, as before.

## Consequences

- Capture reads the date most people type, with no AI, no network call and
  no new privacy exposure.
- Unusual phrasing gets no date rather than a wrong one, and the card makes
  that visible before saving.
- The phone's + no longer focuses the top bar; that event and its helper
  were removed.
- New dependency: `chrono-node` 2.10.3.

## Related

KD-057 (ticket), ADR-009 (quick capture), ADR-017 (document reading),
KD-016, KD-054 (tab bar)
