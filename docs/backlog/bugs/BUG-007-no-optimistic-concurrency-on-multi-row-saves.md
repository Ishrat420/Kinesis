# BUG-007 — No optimistic concurrency on multi-row saves

**Status:** Open
**Priority:** Low

## Problem

Every multi-row save in Kinesis is whole-collection last-write-wins. The server never checks whether the data it's about to overwrite is still the data the form was opened against — it just reads the current owner-scoped rows, reconciles them against whatever the browser sent, and writes the result. Two saves against the same record, close together, and the second one wins outright: not merged, not flagged, not warned about. The first save's edits are gone as if they were never made.

Confirmed in:

* `saveRelationshipMap` (`app/(app)/relationships/actions.ts`) — reconciles the entire person/relationship graph (people, connections, practices, reflections, important dates, linked goals) from the payload in one transaction.
* `updateCustomItemAction` (`app/(app)/custom-modules/actions.ts`) — deletes and recreates an item's extra fields wholesale on every save.
* `updateDocument` (`lib/data/documents.ts`) — replaces a document's custom fields the same way.
* `updateTemplate` (`lib/data/templates.ts`) — reconciles a template's field list from the submitted set.

None of these read a version or `updatedAt` before writing, and none compare it against anything. The write always succeeds if the owner check passes, regardless of what changed underneath it since the form was loaded.

## Functional impact

* **Silent data loss.** Open the same goal, document, template, or relationship map in two tabs (or two devices), edit both, save the older one first and the newer one second — the second save wins completely, and whatever was only in the first save is gone. No error, no warning, no merge. The person has no way to know it happened short of noticing missing content later.
* **Already causing visible friction, not just a theoretical risk.** `EditCustomItemForm.tsx` carries a `key={item.templateFields.map(...).join(",")}` / `key={item.fields.map(...).join(",")}` remount hack specifically because "Add to template" (a separate action) mutates the item's field list out from under an already-open edit form. That hack forces React to throw the form away and remount it fresh rather than let it silently save over data it no longer has an accurate picture of — a symptom of this exact gap, worked around locally instead of fixed at the source.
* **Worst on the relationship map**, since a save there reconciles the entire graph at once: a save from a stale tab doesn't just lose one field's edit, it can resurrect a person or connection that was deleted in the other tab, or drop one that was added there.
* **Scope is narrower than a typical multi-tenant app.** Kinesis is a single-owner deployment (one Clerk user, enforced by the proxy), so this is never two different accounts racing each other — it's the same person losing their own edit across tabs or devices. Real, and already evidenced, but not a cross-account data-integrity issue.

## Likely fix (not yet designed in detail)

Standard optimistic concurrency: the edit form carries the record's current `updatedAt` (or a version counter) alongside the data it loaded; on save, the update is conditioned on that value still matching (`WHERE id = ? AND updatedAt = ?`); zero rows affected means someone else saved first, and that has to come back as a distinguishable outcome the UI actually surfaces, not the generic save-failed message.

`Document`, `Template`, and `CustomItem` already have an `updatedAt` column, so those three don't need a schema change, only threading the token through form → action → conditioned write → conflict UI. `saveRelationshipMap` is the hard case: it reconciles a whole graph across several tables with no single row whose `updatedAt` represents "the map's version," so it needs a real design decision (a version counter added somewhere, most likely) rather than a direct port of the other three.

## Why this is filed rather than fixed now

Four surfaces, four different collection shapes, and — unlike a data-layer-only fix — this one isn't done until the UI actually has a conflict state a person can see and act on, not just a query-level guard. That's meaningfully larger than a single-session change, and the relationship-map case needs its own design pass before implementation starts. Given the single-owner scope above, it's real but not urgent enough to justify that investment ahead of other work right now.
