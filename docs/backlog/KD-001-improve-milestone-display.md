# KD-001 — Improve Milestone Display

**Status:** Accepted
**Priority:** High
**Tags:** UX / UI

## Summary

Improve milestone creation and display so milestones read naturally to the user while remaining structured underneath.

The milestone UI should behave like a human-readable sentence rather than a collection of disconnected database fields.

---

## Requirements

### Creation UI

Milestone creation supports maximum of four optional components:

[Milestone] [Target value] [UNIT] [DATE] 

This is if a Measurable target is set. Currently it just displays like this, and so it is hard to read and mentalize. 
It should be displayed as: 

```text
[Milestone] [Target value] [UNIT] BY [DATE]
```

And with the updated placeholders, it should look like: 

```text
[ What will you do next? ] [ 2 ] Books BY [ dd/mm/yyyy ]
```
Here in this example, Books is the UNIT 

The completed and resulting milestone reads:

> **Read at least 2 Books by 27 Dec 2026**

### Field behaviour

The milestone title is entered by the user.

The target value is optional, the new placeholder text should replace `Numeric value`.
And should show 2

Example:

```text
[ 2 ]
```

The parent Goal with already a measurable target with a Unit must be inherited by the milestone 

Example parent Goal:

```text
Goal: Read more
Target: 20
Unit: Ebooks
```

Milestone creation should therefore render:

```text
[ What will you do next? ] [ 2 ] Ebooks BY [ dd/mm/yyyy ]
```

The user should **not** select `Ebooks` again.

`BY` should be rendered as normal UI text between the target and date fields so the form reads naturally.

---

### Optional Structure remains same

All milestone components except the title should remain optional.

The UI must support:

```text
[ Pass driving test ]
```

Milestone only.

```text
[ Save ] [ $8,000 ]
```

Milestone + target.

```text
[ Submit application ] BY [ 15/10/2027 ]
```

Milestone + date.

```text
[ Read ] [ 10 ] Books BY [ 31/12/2027 ]
```

Milestone + target + inherited Unit + date.

The form should adapt cleanly when optional fields are absent.

---

### Milestone Display

Do not display target values as secondary metadata such as:

```text
Read at least
Reach 2 Ebooks
```

Remove the word **Reach** entirely.

Instead, compose the title, target value, and Unit into the main milestone line.

Example:

```text
○  Read at least 2 Ebooks
   📅 27 Dec 2026 · 4 months left
```

The main line should represent the actual milestone.

The secondary line should only communicate timing or completion state.

---

### Normal

```text
○  Read at least 2 Ebooks
   📅 27 Dec 2026 · 4 months left
```

```text
○  Read at least 2 Ebooks
   📅 27 Dec · 12 days left
```

### Overdue

```text
○  Read at least 2 Ebooks
   ⚠ 27 Dec · 5 days overdue
```

### Completed

```text
✓  Read at least 2 Ebooks
   Completed 20 Dec 2026
```

Use existing date utilities where practical so remaining-time calculations are consistent across Kinesis.

---

### Milestone Row Interaction

The entire milestone row should be clickable.

The completion circle/check control remains the primary action for marking the milestone complete.

Move edit/delete controls into an overflow menu:

```text
○  Read at least 2 Ebooks                         ⋯
   📅 27 Dec 2026 · 4 months left
```

The `⋯` menu should contain:

```text
Edit milestone
Duplicate
Delete
```

Remove the standalone trash icon currently displayed on the row.

---

### Data

Do not flatten the milestone into a single text field.

Keep structured fields underneath, for example:

```text
title       = "Read at least"
targetValue = 2
unit        = inherited from parent Goal
dueDate     = 2026-12-27
```

The UI should compose these values into natural language.

This preserves support for:

* progress calculations
* milestone numeric targets
* calendar integration
* reminder logic
* filtering
* future goal-health calculations

---

### Notes 

Update the existing milestone creation and milestone card components
Do not change unrelated Goal UI.

## Related

- ADR-004 — Goals Module