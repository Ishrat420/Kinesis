# KD-026 — A "No reminder" option for a document

**Status:** Idea
**Priority:** Medium
**Tags:** UX / UI, Data Model, Technical Debt

## Summary

A document's reminder lead time is chosen from four fixed periods — 1 year, 6 months, 3 months, 30 days. There is no way to say *don't remind me about this one*.

Every document that carries an expiry date therefore reminds, whether or not the person wants it to. The only ways out today are both wrong for the case:

* **Clear the expiry date** — which stops the reminder by throwing away the fact you wanted recorded. The document no longer appears on the calendar, in Expiring soon, or in Needs Attention when it lapses.
* **Archive it** — which removes it from every surface at once. Archiving says "I am finished with this". A passport you want tracked, dated and visible but not nagged about is not the same thing.

The missing option is a third one: keep the date, keep every date-based surface, stop the advance warning.

```text
Reminder
6 months before expiry

Reminder
No reminder
```

## Why it is worth recording

The gap shows up as a small pile of related oddities rather than one obvious bug:

* `Document.prompt` is `Int @default(180)` and cannot be null, so the model has no way to express "none".
* The action validates the submitted value against the four options and **silently coerces anything else to 180 days**. A value the form could never produce is not rejected, it is quietly replaced.
* `getExpiryReminderDate` still keeps a generic `expiry − prompt × DAY` branch for values outside the four. Nothing in the UI can reach it; it is only reachable by seed data, an import, or a direct database write. So the data model already tolerates lead times the interface cannot produce, and the interface already discards values the model would accept.

None of that is harmful today. Taken together it says the field wants a wider range than it has, and "no reminder at all" is the end of that range people actually ask for first.

## Proposed shape

**Model.** Make `prompt` nullable and read `null` as "no reminder".

Prefer null over a sentinel. Zero is not free: `0` most naturally means *remind me on the expiry day itself*, which is a legitimate fifth option someone will want, and spending it on "never" would block that. Absence of a lead time is genuinely an absent value.

**Interface.** Offer "No reminder" in the reminder control, presented apart from the four periods rather than as another entry in the list — it is a different kind of answer.

**Behaviour when set.** Follow the rule the settings gates already use: silence predictions, keep statements of fact.

| Surface | With "No reminder" |
| --- | --- |
| Bell — `REMINDER_DUE` | never raised |
| Bell — `EXPIRED` | unchanged — still raised on the day after expiry |
| Upcoming & Due — reminder | never listed |
| Upcoming & Due — expired | unchanged |
| Calendar reminder pin | no pin |
| Calendar expiry pin | unchanged |
| Needs attention | unchanged — expired documents still appear |
| Expiring soon / stat tile | **needs a decision, see below** |

## Open questions

**Does the document still pass through "Expiring soon"?**

`getExpiryDetails` derives that status from the reminder window, so with no window a document would go straight from Active to Expired and never be counted in the Expiring soon tile or listed on its page.

The consistent answer is yes, that is correct: "Expiring soon" is a lookahead, and the person has said not to look ahead. But it means the status column loses a state for these documents, and someone will eventually report the tile "missing" a document that is expiring next week. Worth deciding deliberately rather than discovering.

**Should invalid values still coerce silently?**

Adding "none" is a good moment to decide whether an unrecognised `prompt` should be rejected with an error rather than quietly becoming 180 days. Related but separable.

**Should the generic day-count branch stay?**

`getExpiryReminderDate`'s fallback exists for values the UI cannot produce. Once the field is deliberately wider, either commit to it (arbitrary day counts are supported, and the UI offers presets) or remove it (only the four periods plus none are legal, and anything else is a data error).

**Does this belong on the other modules too?**

Milestones, relationship dates and custom items take their lead time from a single global setting rather than a per-record field, so "no reminder for this one" has no home there at all. That is a larger question about per-record overrides — see KD-006, which wants the reverse (richer per-record recurrence). Out of scope here; a document is the only object with its own lead time, which is why it is the only one that can grow this cheaply.

## Notes

* Every reader of `prompt` has to handle null, or a missing case produces an invalid date rather than no reminder: `getExpiryReminderDate`, `getExpiryDetails`, the engine's document candidate, Upcoming & Due, the calendar's `documentPrompt` lead, and the edit form's live "time until expiry" preview.
* `ReminderLead` in the calendar's reminder helpers carries a `documentPrompt` variant; it needs either a "none" case or an earlier decision not to build a pin at all.
* Migration is additive — make the column nullable, change nothing existing. Every current document keeps the lead time it has, and no backfill is needed.
* This is independent of the In-app notifications and Reminders switches. Those are account-wide; this is per document. A person with reminders on should still be able to exempt one document.

## Acceptance criteria

* A document can be saved with no reminder, and the choice survives a reload.
* Such a document raises no `REMINDER_DUE`, appears in no Upcoming & Due reminder entry, and has no calendar reminder pin.
* Its expiry date, calendar expiry pin, expired notification and Needs Attention row are all unchanged.
* Documents with a lead time behave exactly as they do today.
* The Expiring soon decision above is settled and covered by a test either way.
