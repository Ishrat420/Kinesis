# KD-037 — Detach a Single Object from Its Template

**Status:** Idea
**Priority:** Low
**Tags:** UX / UI, Data Model, Foundation Dependent

## Summary

An object created under a template (KD-035) can only be freed from what's
locking that template — a field's type, a field's removal, the template's
own deletion — by deleting the object outright. This ticket is the nicer
version of that escape hatch: **detach one object from its template,
keeping the object and its data, but converting its template-derived
fields into fields it now owns outright.**

```text
Template: Decision (linked to 6 objects)
  Fields: Date / Why? / Kinesis Links / Notes

Object "Move to the new office" — created from Decision, 1 of the 6
  → owner wants to retype "Date" to a Kinesis Link, can't: 5 other
    objects (including this one) still use the template
  → "Detach from template" on this object: it keeps Date / Why? /
    Kinesis Links / Notes exactly as they are, now as its own fields —
    the template is down to 5 objects, still locked by the other 5
```

## What exists today

Per KD-035 Decision 7, an object's link to its template
(`Object.templateId`) is permanent once set — nothing unsets it, and there
is no path from "object following a template" back to "ordinary object
with its own ad-hoc fields." The only way to remove an object from a
template's usage count is to delete the object.

Every destructive template operation (delete the template, change a
field's type, remove a field) is gated on one fact: does any object have
`templateId` pointing at this template. A single object that happens to be
first through the door on a template still being iterated on can lock
every other object's owner out of a legitimate edit, with deletion as the
only way through.

## The idea

A "Detach from template" action on an object, available whenever it has a
`templateId`:

* Snapshot the template's *current* field list (label, type, position) onto
  the object as its own independent fields — each existing value carried
  over unchanged.
* Clear `Object.templateId`. The object becomes an ordinary object with
  ad-hoc fields, indistinguishable after the fact from one that was never
  templated.
* The template's usage count drops by one. If this was the last object
  using it, every gate (Decision 7) unlocks.

Unlike everything else in KD-035, this is the one place a "copy" actually
has to happen — deliberately, once, at the moment of detachment, not as a
standing behaviour. Before detaching, the object was reading the
template's fields live; after, it owns a frozen copy of whatever they were
at that moment, and stops hearing about future template edits entirely.

## Why this is separate from KD-035, not folded in

KD-035 already ships a complete, working escape hatch (delete the object)
and deliberately deferred this exact feature when it came up — see KD-035
Decision 7's closing note. Building it means a real, non-trivial operation
(the snapshot-and-repoint) for a case that "delete the object, recreate it
without a template" already covers, just less conveniently. Worth having
once real usage shows people hitting the "I have one object standing in
the way of a legitimate template edit" case often enough to justify it —
not worth guessing at now.

## Open questions

* Does detaching need its own confirmation ("this object will stop
  receiving future template changes"), or is it low-stakes enough to be a
  plain button?
* What happens to the object's position/grouping in its module's list
  view, if anything — presumably nothing, since which module an object
  lives in was never tied to its template.
* Should there be a symmetrical "attach to a template" for an object that
  was created without one, or is that a different enough operation (no
  existing fields to reconcile against a template's field list) to be its
  own idea if it ever comes up?

## Related

* KD-035 — Module Templates; this is the deferred escape-hatch mentioned in
  Decision 7, which also defines `Object.templateId`, the field-live-read
  model, and the single usage-count gate this ticket reduces.
