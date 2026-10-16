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
