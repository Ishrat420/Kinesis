# KD-047 — Add Action Icons to Important Dates in Upcoming & Due

**Status:** Accepted
**Priority:** Medium
**Tags:** UX / UI

## Summary

In the dashboard's "Upcoming & Due" card, rows for Important Dates
(birthdays/anniversaries, sourced from `RelationshipImportantDate`) have no
action icons at all — unlike other row kinds in the same list, which already
get an icon-based action (e.g. document/custom rows get an Edit + Dismiss
icon, milestones/to-dos get Complete/Reschedule).

Important Dates rows should get two icon-only actions, right-aligned same as
the other rows:

```text
[ circle-plus icon ]   [ × ]
```

- **circle-plus** (left) → **Create To-Do**, prefilled from the Important
  Date:
  - **Title** — prefilled, editable (e.g. "Do something for Peach's
    birthday")
  - **Due date** — prefilled to the important date, editable
  - **Linked to** — prefilled to the person/relationship the date belongs
    to, editable
  - User can edit any of these before creating; nothing is submitted until
    they confirm.
- **`×`** (right) → **Dismiss**, same behaviour/icon as the existing
  dismiss action elsewhere in this list.

Icon-only, no text/border/background — same treatment as the other row
actions in this list. On hover, the create-to-do icon should use the same
color as the rest of the app's to-do theme, not a generic hover tint.

## What exists today

- `components/dashboard/ReminderList.tsx` — renders the "Upcoming & Due"
  card. Row actions are dispatched per-kind by `UpcomingActions` (lines
  27–49): milestone/todo rows get `<ResolveActions>`; document/custom rows
  get an Edit (`Pencil`) link plus `<DismissButton>`. For
  `kind === "relationship"` (Important Dates) it currently falls straight
  through to `return null` — no icons render at all.
- `components/dashboard/DismissButton.tsx` — existing dismiss button, uses
  the `X` icon from `lucide-react`, bound to `dismissAttentionItem` in
  `app/actions.ts`. This is the dismiss half of this ticket, and should be
  reused as-is once Important Date rows have a `dismissKey`.
- `components/dashboard/icon-action-styles.ts` — shared `ICON_ACTION_CLASS`
  used by all existing row-action icons; the new circle-plus action should
  use this too, for visual consistency (icon-only, no border/background).
- `lib/objects/locations.ts` — defines the to-do theme color used wherever
  objects resolve to a To-Do location: `color: "#0d9488"`. This is the
  color the circle-plus icon's hover state should match. No `CirclePlus`
  icon use exists anywhere yet — this would be new (from `lucide-react`).
- `lib/data/upcoming.ts` / `lib/data/attention-items.ts` — build the
  `UpcomingItem`/`AttentionRecord` for `kind: "relationship"` from
  `RelationshipImportantDate` (`prisma/schema.prisma`, fields include
  `relationshipId?`, `selfPersonId?`, `label`, `date`, `repeatsYearly`).
  Today this row only carries a derived `personName` string and a `date` —
  it does **not** carry a `dismissKey`, nor the underlying
  `relationshipId`/`selfPersonId` (or the Person's linkable object id).
  Both would need to be threaded through before the two new actions can
  work, mirroring how `documentUpcomingPhase`/`customItemUpcomingPhase`
  already compute a `dismissalKey(...)` for their rows.
- `app/(app)/todos/AddTodoButton.tsx` (`AddTodoForm`) — existing to-do
  creation dialog with exactly the three fields needed here: name
  ("What do you need to do?"), due date, and Kinesis Link ("Linked to",
  via `<KinesisLinkList>`). Submits through `createTodoAction` →
  `createTodo(name, { status, dueDate, notes, linkObjectIds })`
  (`app/(app)/todos/actions.ts`). The create-to-do action on this ticket
  should reuse this dialog, opened with initial values pre-populated
  instead of blank, rather than building a new form.

## Implementation notes

- Extend the `relationship`-kind shape in `lib/data/attention-items.ts` /
  `lib/data/upcoming.ts` to carry a `dismissKey` (via the existing
  `dismissalKey(...)` helper) and a linkable object id for the
  person/relationship, so both new actions have what they need.
- Dismiss: reuse `<DismissButton>` / `dismissAttentionItem` unchanged once
  the row has a `dismissKey`.
- Create To-Do: reuse `AddTodoForm`/`createTodoAction`, opened with
  `name`, `dueDate`, and `linkObjectIds` pre-filled from the Important Date
  row (title derived the same way the row's own text is today, e.g.
  "Do something for Peach's birthday"); still an ordinary editable form on
  open, submit is explicit.
- Icon: `CirclePlus` from `lucide-react`, styled with the shared
  `ICON_ACTION_CLASS`, hover color matching the to-do theme color used in
  `lib/objects/locations.ts` (`#0d9488`).

## Related

- KD-025 — To-Do Board (to-do theme/color conventions).
- `BUG-006-notification-panel-behind-relationship-inspector` — unrelated
  bug in the same general notification/attention surface area, no direct
  dependency.
