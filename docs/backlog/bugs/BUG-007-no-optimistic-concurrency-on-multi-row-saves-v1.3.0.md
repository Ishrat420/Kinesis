# BUG-007 — No optimistic concurrency on multi-row saves

**Status:** Partially fixed — Document, Template, and CustomItem are done; `saveRelationshipMap` is still open (see "Why this is filed rather than fixed now", below, which still applies to that surface alone)
**Priority:** Low
**Planned Release:** v1.3.0

## Problem

Every multi-row save in Kinesis is whole-collection last-write-wins. The server never checks whether the data it's about to overwrite is still the data the form was opened against — it just reads the current owner-scoped rows, reconciles them against whatever the browser sent, and writes the result. Two saves against the same record, close together, and the second one wins outright: not merged, not flagged, not warned about. The first save's edits are gone as if they were never made.

Confirmed in:

* `saveRelationshipMap` (`app/(app)/relationships/actions.ts`) — reconciles the entire person/relationship graph (people, connections, practices, reflections, important dates, linked goals) from the payload in one transaction. **Still open** — see below.
* `updateCustomItemAction` (`app/(app)/custom-modules/actions.ts`) — deletes and recreates an item's extra fields wholesale on every save. **Fixed.**
* `updateDocument` (`lib/data/documents.ts`) — replaces a document's custom fields the same way. **Fixed.**
* `updateTemplate` (`lib/data/templates.ts`) — reconciles a template's field list from the submitted set. **Fixed.**

None of these read a version or `updatedAt` before writing, and none compare it against anything. The write always succeeds if the owner check passes, regardless of what changed underneath it since the form was loaded. (This description is of the original, pre-fix behavior — see "Fix" below for the three surfaces that no longer work this way.)

## Functional impact

* **Silent data loss.** Open the same goal, document, template, or relationship map in two tabs (or two devices), edit both, save the older one first and the newer one second — the second save wins completely, and whatever was only in the first save is gone. No error, no warning, no merge. The person has no way to know it happened short of noticing missing content later. **No longer true for Document, Template, or CustomItem** — a save from a stale tab is now refused with a distinguishable conflict, rather than silently overwriting. Still true for the relationship map.
* **Already causing visible friction, not just a theoretical risk.** `EditCustomItemForm.tsx` carries a `key={item.templateFields.map(...).join(",")}` / `key={item.fields.map(...).join(",")}` remount hack specifically because "Add to template" (a separate action) mutates the item's field list out from under an already-open edit form. That hack forces React to throw the form away and remount it fresh rather than let it silently save over data it no longer has an accurate picture of — a symptom of this exact gap, worked around locally instead of fixed at the source. (The remount hack itself is unchanged by this fix — it's still the right way to handle a field-list change out from under an open form — but a save that races it is now refused rather than silently wrong.)
* **Worst on the relationship map**, since a save there reconciles the entire graph at once: a save from a stale tab doesn't just lose one field's edit, it can resurrect a person or connection that was deleted in the other tab, or drop one that was added there. **This surface is still open** — see below.
* **Scope is narrower than a typical multi-tenant app.** Kinesis is a single-owner deployment (one Clerk user, enforced by the proxy), so this is never two different accounts racing each other — it's the same person losing their own edit across tabs or devices. Real, and already evidenced, but not a cross-account data-integrity issue.

## Fix (Document, Template, CustomItem)

Standard optimistic concurrency, reusing each row's existing `updatedAt` rather than adding a dedicated version column: the edit form carries the record's `updatedAt` as it was last read, resubmitted as a hidden field alongside the rest of the data; the write is conditioned on that value still matching, via a version-scoped `updateMany({ where: { id, updatedAt: expectedUpdatedAt }, data })` rather than a plain `update()` — the condition has to live in the write's own atomic statement, not a separate read-then-compare step, or it reintroduces the exact TOCTOU race already fixed once this session in `ensureStarterTemplate` and `resolveDocumentType`. A zero-row result means either the record was deleted or someone (possibly the same owner, in another tab) saved over it since; a fresh existence check right after distinguishes the two, since a stale ownership snapshot from earlier in the transaction can't be trusted to still be accurate. `updateMany` can't carry Prisma's nested relational writes, so `updateDocument`'s object-fields write is split into the version-conditioned scalar update followed by a separate, now-safe nested write against the child relation.

The conflict signal reuses the existing `ActionRefusal`/`refusalOf` mechanism (`lib/actions/refusal.ts`) rather than a parallel one: `ActionRefusal` now carries an optional `conflict` flag, set via a new `refuseConflict(message)` (alongside plain `refuse`), and read back with `isConflictRefusal(error)`. Each action's state type (`DocumentActionState`, `TemplateActionState`, `CustomItemState`) grew a `conflict?: boolean` and an `updatedAt?: string` the server now returns on every successful save, so the client always has the freshest stamp to resubmit next time — without it, a second save from the same still-open tab would falsely conflict with its own prior write.

Client-side, the form needs the *freshest known* `updatedAt`, not just the one the page loaded with, because `router.refresh()`'s post-action prop refresh is not synchronous with the save completing. Two different patterns cover this, chosen per component's own mount lifecycle rather than uniformly:
* **Template's form stays mounted across a save** (no edit/read-view toggle), so a plain derived comparison is enough — `state.updatedAt && state.updatedAt > propUpdatedAt ? state.updatedAt : propUpdatedAt` — relying on ISO-8601 strings sorting lexically in chronological order. No extra state or effect needed.
* **Document's and CustomItem's forms fully close back to a read view on save** (an `editing` boolean toggle, the save's `onSaved` callback firing synchronously before `router.refresh()` lands), so the freshest stamp has to live in the persistent parent component instead — `onSaved`'s signature changed from `() => void` to `(updatedAt: string) => void`, and the parent holds it in `useState`, computed the same derived-max way. Without this, a quick reopen of Edit in the gap before the refresh lands would hand the form a stale `updatedAt`, and its very next save would refuse itself as a conflict against its own prior write.

`expectedUpdatedAt` is a required parameter on every data-layer function (`updateDocument`, `updateTemplate`) — not optional — so no caller, present or future, can skip the check by omission; at the Server Action boundary, where `FormData` carries no compile-time guarantee, a missing or unparseable stamp is validated and refused the same way a missing required field already is.

Every existing test that exercises these functions' other validation rules now goes through a small `save`/`asOwner`-style helper that fetches the row's real, current `updatedAt` immediately before saving (the same way a freshly-loaded form would), so none of them incidentally became a conflict test. Each surface also has its own dedicated conflict-path integration test (data layer and, where relevant, the action's conflict-to-state mapping), red/green verified.

## Likely fix, relationship map (not yet designed in detail)

`saveRelationshipMap` is the hard case: it reconciles a whole graph across several tables with no single row whose `updatedAt` represents "the map's version," so it needs a real design decision — most likely a small dedicated per-user version-counter table, rather than repurposing `UserSettings` or computing `MAX(updatedAt)` across the graph on the fly (wrong on deletes) — rather than a direct port of the other three surfaces' fix.

## Why this is filed rather than fixed now (relationship map only)

The relationship-map case needs its own design pass — a version-counter scheme, plus its own conflict UI — before implementation starts, and is meaningfully larger than the other three surfaces' fix (which reused each row's existing `updatedAt` and the app's existing refusal mechanism end to end). Given the single-owner scope above, it's real but not urgent enough to justify that investment ahead of other work right now.
