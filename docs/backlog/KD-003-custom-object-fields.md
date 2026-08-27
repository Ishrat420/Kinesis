# KD-003 — Custom Object Fields

**Status:** Accepted 
**Priority:** High

## Summary

Allow users to add custom fields to objects.

The user provides:

```text
Field name
[ Strength ]

Field type
[ Text ▾ ]
```

Initial supported field types:

* Text
* Number
* Date (dd/mm/yyyy)
* Checkbox
* Link (same as the one present in Document)
* Kinesis Link


Anywhere you can add a field (Such as in document and in custom module objects), you have these options for the field. 

## Notes

This forms a core capability of configurable modules and freestyle objects.

## Related

- ADR-002 — Kinesis Link Field