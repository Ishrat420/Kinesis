# KD-007 — Priority Field

**Status:** Planning Needed
**Priority:** High

## Summary

Introduce a reusable **Priority** field that can be added to Kinesis objects.

Initial priority levels:

```text
High
Medium
Low
```

Priority should be treated as meaningful system metadata rather than only a visual label.

## Behaviour

When an object has a priority set, Kinesis can use it when deciding how prominently that object or its reminders should be surfaced.

Examples:

* **Needs Attention**
* **Upcoming & Due**
* Reminder lists
* Notifications
* Future notification delivery rules

Example:

```text
Passport renewal

Priority
High
```

If several items are due within the same period, higher-priority items should be surfaced more prominently and can appear on top of lower priority items when being sorted as well. 

## Future Notification Use

Priority may later influence notification delivery preferences.

For example:

```text
High priority
→ In-app notification
→ Optional email notification

Medium priority
→ In-app notification

Low priority
→ In-app only / reduced prominence
```

The user should eventually be able to configure these behaviours. 

## Notes

* Priority should be reusable across modules and object types.
* Priority does not replace due dates, reminders, or urgency calculations.
* A high-priority item may not be due soon, and an overdue item may still require attention regardless of its configured priority.
* Future attention-ranking logic may use priority, due date, overdue state, reminder thresholds in various ways that makes sense. 
