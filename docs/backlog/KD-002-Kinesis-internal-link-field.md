# KD-002 — Kinesis Link Field

**Status:** Accepted 
**Priority:** High

## Summary

Introduce an internal link field that allows one Kinesis object to reference another object.

When configuring the field, the user can select:

**Module → Object**

Example:

`Skincare → Tretinoin` links to `Documents → Script-A5-Tretinoin`.

The linked object should be displayed as a clickable reference. Clicking it navigates directly to that object's page.

We are calling this field type: Kinesis Link 

## Notes

This should use the existing object relationship system rather than duplicate data.
