# KD-004 — Templates / Object Types

**Status:** Dropped
**Priority:** Medium

## Why dropped

Superseded by **KD-035 — Module Templates**, which is this idea worked through
in full: a Template as a reusable, named set of field definitions, linked to a
Module, inherited by every object created in it. KD-035 also settles what this
ticket left as "future enhancement" — templates are editable (not frozen),
shared across modules, and objects can still carry fields beyond the template.
Kept here for the record; new work should reference KD-035.

## Original summary

Allow modules to define reusable Object with predefined fields.

Example:

```text
Skincare

Type: Product

Default Fields:
- Brand
- Strength
- Started
- Status
```

Creating a new `Product` automatically creates an object with those fields.

## Notes

Future enhancement to the freestyle object system.

Objects should initially work without requiring a template or object type.
