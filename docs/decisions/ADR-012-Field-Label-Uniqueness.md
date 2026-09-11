# ADR-012: Field Labels Are Not Required to Be Unique

## Status

Accepted

## Context

Neither editor that lets a person name a field checks the new label against
the labels already in the same list. `CustomFieldsEditor.tsx` allows two
ad-hoc fields on the same object to share a label; `TemplateFieldsEditor.tsx`
(KD-035) allows the same on a template's own field list, and neither
`parseCustomFields` (`lib/custom-fields/parse.ts`) nor `updateTemplate`
(`lib/data/templates.ts`) refuses a save over it either.

Concretely, for a template: two fields both named "Date" save without
complaint, and every object under that template then shows two
identically-labelled inputs, distinguishable only by their position in the
list.

This was raised as a possible bug. It is not one — this ADR records why, so
it does not get re-flagged as an oversight later.

## Decision

**A duplicate label is allowed, deliberately, at both the object level and
the template level.** No uniqueness check is added.

1. **A duplicate requires a deliberate act, not a slip.** A new field's
   label starts empty — neither editor pre-fills or suggests one. Ending up
   with two fields sharing a label means someone typed an existing label a
   second time on purpose, not that the UI nudged them into a mistake the
   way, say, a pre-filled default value might.
2. **Nothing breaks.** No data is lost, no save is blocked, nothing
   crashes. The entire cost is presentational — telling two identically
   labelled inputs apart — never structural.
3. **It's cheapest to fix exactly when it's easiest to notice.** The
   confusion only matters once objects exist under a template carrying the
   duplicate; before the first object is created, renaming one of the two
   fields in Settings costs nothing and the mistake was never load-bearing.
4. **This is already the standing rule for ad-hoc fields**, per
   `CustomFieldsEditor.tsx` predating templates entirely — this ADR is
   making that existing allowance explicit for `TemplateFieldsEditor.tsx`
   too, not introducing a new inconsistency between the two.

## Future consideration

If duplicate labels turn out to be a real, recurring mistake once Kinesis
sees actual use — rather than a theoretical one — the fix under
consideration is a soft warning at the point of naming a field, along the
lines of *"You already have a field called 'Date' — add it anyway?"*,
rather than an outright block. A hard uniqueness constraint is not being
reached for even then: a legitimate reason to want two fields that both
read as "Date" to the person building the template cannot be ruled out,
and the fix belongs at the point a mistake is made, not as a rule that
forecloses an intentional choice. Not implemented now because it has not
been observed as an actual problem, only a theoretical one.

## Related

* KD-035 — Module Templates; Decision 1 covers what may and may not be
  edited once a template is in use, but does not address label uniqueness,
  which is what this ADR fills in.
* `components/custom-fields/CustomFieldsEditor.tsx` and
  `app/(app)/settings/templates/TemplateFieldsEditor.tsx` — the two editors
  this decision governs.
* `lib/custom-fields/parse.ts` (`parseCustomFields`) and
  `lib/data/templates.ts` (`updateTemplate`) — where a uniqueness check
  would be added if the future consideration above is ever taken up.
