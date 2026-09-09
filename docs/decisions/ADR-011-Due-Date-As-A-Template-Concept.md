# ADR-011: Due Date as a First-Class, Singular Template Concept

## Status

Accepted

## Context

ADR-010 already settled this once: "Custom DATE fields land on the calendar
and nowhere else. A field typed DATE gets a calendar pin but produces no
notification, no Upcoming & Due row, and no Needs Attention row — even when
labelled something like 'Renewal date'. Only the record's single
`dueDate`/`expiryDate` drives reminders." The justification given there is
worth repeating in full, because it is the premise this ADR builds on
rather than revisits: "a Date as a custom field is intended to be a
property of an object. It's not automatically a reminder or due date even
if named that way. Most objects already have a reminder and Expiry/Due date
mechanism for its intended purpose."

KD-035 (Module Templates) then introduced a second way for a Custom Item to
carry structured fields: instead of being added ad hoc, per record, a
field can now come from a template, shared across every object that
follows it. That raised a question ADR-010 never had to answer, because it
didn't exist yet: a template field with `type: DATE` is still just an
ordinary date, per ADR-010 — but templates are also the first place in
Kinesis where a Custom Item's *shape* is defined ahead of time, and a Due
Date is exactly the kind of thing someone shaping a template (a bill's
renewal, an appointment, a permit) would reasonably want that shape to
include, functioning as a real due date, not a decorative one.

Two things make this harder than "let a template field write to
`CustomItem.dueDate`":

**Only one due date can exist on a record at all.** `CustomItem.dueDate` is
a single column. Whatever mechanism lets a template field populate it has
to make "more than one" structurally impossible, not just discouraged.

**A label must never be mistaken for the mechanism.** Someone naming an
ordinary date field "Due Date" must not accidentally get due-date
behaviour — that would directly contradict ADR-010's already-settled rule
that a field's label carries no special meaning. The only thing that may
grant due-date behaviour is a deliberate, distinct action, not a string
match.

**Every other Kinesis object already has its own version of this**, and
deliberately so — this is the part worth writing down before anyone reads
its absence as an oversight. Documents have expiry, which is the more
appropriate mechanism for something with a validity window, not a
due date. Milestones and Goals have their own date concepts. To-Dos have
their own due date, outside the template system entirely. Relationships
have important dates, and are deliberately excluded from anything
due-date-shaped — a relationship going "overdue" is not a concept Kinesis
wants to have. Custom Items are the one place among all of these where a
due date is sometimes wanted and sometimes not, which is exactly why it
needs to be configurable there and nowhere else — everywhere else already
has an answer, and this ADR is not reopening any of them.

## Decision

**Due Date becomes a distinct, singular field a Custom Item template may
define — never a property of an ordinary date field, and never available
outside a Custom Item template.**

Concretely:

1. **It is added through its own action**, not chosen from the ordinary
   field-type picker. There is no dropdown, at any point, that turns a
   `DATE` field into a due date or a due date back into a `DATE` field. The
   restriction is not enforced against an action that exists — the action
   does not exist.
2. **At most one per template**, enforced where it's created (the add
   action becomes unavailable once one exists) and enforced again where a
   template is saved (the real guarantee).
3. **Its value writes to `CustomItem.dueDate` directly.** Not a new value
   store, not a second source of truth living beside the one every
   awareness surface (Needs Attention, the bell, Upcoming & Due, the
   calendar) already reads — the same column, so every one of those
   surfaces already knows how to show it, without being taught anything
   new.
4. **It is never available to a system module.** Not as a rule this ADR
   asks someone to remember and enforce, but as a fact already true by
   construction: only a Custom Item can follow a template at all (KD-035
   Decision 3), so Documents, Goals, Relationships, and Finance Items have
   no path to this feature regardless of what the template editor offers.
   Reopening that boundary is out of scope here — this ADR assumes it,
   the same way ADR-010 assumed each module's existing date mechanism was
   already right for that module.
5. **This does not change what an ordinary `DATE` field does.** ADR-010's
   rule stands untouched: a template field typed `DATE` still lands on the
   calendar and nowhere else. This ADR adds a second, distinct kind of
   field precisely because that rule was correct and worth keeping, not
   because it needed an exception carved into it.
6. **Reminders and recurring reminders are explicitly out of scope.**
   A due date is a fact; a reminder is a notice about that fact, and
   Kinesis already treats those as separate concepts everywhere else
   (ADR-010's own second paragraph). Any future reminder or recurrence
   feature is layered on top of "there is a due date," whatever object it
   came from — this ADR only concerns itself with the fact existing.

## Why not simply mark an existing date field

A boolean flag on an ordinary `DATE`-type field ("this date field is also
the due date") was the first design considered and rejected. It fails the
second premise above: it makes the mechanism reachable through the same
control that sets a field's label and type, which is exactly the kind of
surface where "I named it Due Date" and "I made it the due date" could be
conflated — by the person building the template, and by whoever reads the
template after them. A distinct action, with no conversion path in either
direction, removes that ambiguity structurally rather than through
documentation someone has to already know to go and read.

## Related

* ADR-010 — Notification and Reminders Awareness Surfaces; states the rule
  this ADR extends without breaking (an ordinary `DATE` field never drives
  reminders) and the per-module reasoning (Documents' expiry, Milestones',
  Relationships' exclusion) this ADR leans on rather than re-derives.
* KD-035 — Module Templates; Decision 3 (only Custom Item can follow a
  template) is what makes point 4 above true by construction, and Decision
  7 (the single usage gate) is what governs removing a due-date field once
  a template is in use.
* KD-038 — Due Date as a Distinct Template Field; the backlog ticket this
  ADR's decision is implemented through.
