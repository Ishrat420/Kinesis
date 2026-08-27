# BUG-001 — Expiry Status Colour Incorrect Near Reminder Threshold

**Status:** Fixed
**Priority:** Medium

## Problem

The colour used for the `Time until expiry` indicator does not always reflect the configured reminder threshold correctly.

Sometimes when Time until expiry < Reminder , it still shows up as green. The color does not work perfectly. There is a edge case when it's near the reminder period, it does not work. 

This appears to happen around the boundary between the normal and reminder periods.

## Expected Behaviour

The expiry status colour should be calculated consistently from the expiry date and configured reminder threshold.

For example:

* If `Time until expiry > Reminder threshold`, the status may remain green.
* If `Time until expiry <= Reminder threshold`, the status should change to the configured warning colour.
* If the item is expired, it should display the expired/error colour.


For example, if the reminder threshold is `30 days`, an item with exactly `30 days` remaining should be treated as being within the reminder period.

## Actual Behaviour

In some cases, an object remains green even when:

```text
Time until expiry <= Reminder threshold
```

## Reproduction

1. Create or open a Document object with an expiry date.
2. Configure an expiry reminder, for example `30 days before expiry`.
3. Set the expiry date so the remaining time is close to the reminder threshold, such as:

   * 31 days remaining
   * 30 days remaining
   * 29 days remaining
4. View the document status or expiry indicator.
5. Observe the colour assigned to `Time until expiry`.
6. In some boundary cases, the indicator remains green when it should display the warning colour.

## Notes

Potential areas to investigate:
* Comparison operator may be using `<` instead of `<=`.
* Date/time calculations may include the current time rather than comparing date-only values.

## Related

* ADR-002 — Document Module
