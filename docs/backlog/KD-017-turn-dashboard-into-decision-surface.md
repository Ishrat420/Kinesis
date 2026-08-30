# KD-017 — Turn the Dashboard Into a Decision Surface

**Status:** Accepted — Needs Planning  
**Priority:** High  
**Tags:** UX/UI

## Summary

Evolve the Kinesis dashboard from primarily a status/reporting surface into a **daily decision surface**.

The dashboard already answers:

> What needs my attention?

It should increasingly also answer:

> What can I do about it right now?

Where practical, attention and upcoming items should expose context-specific actions directly from the dashboard without requiring the user to navigate into the source module.

The dashboard should remain lightweight. It is not intended to reproduce every module's full editing interface.

---

## 1. Context-Specific Actions

### Documents

For an expiring or expired document, provide relevant actions such as:

- **Renew**
- **Edit date/details**
- **Dismiss**

Example:

> **Passport expires in 21 days**  
> `Renew` · `Edit` · `Dismiss`

### Milestones

Provide:

- **Mark complete**
- **Reschedule**
- **Dismiss**, where dismissal of the attention signal is appropriate

Rescheduling should allow the target date to be changed directly from the dashboard.

### Relationship Dates

For actionable relationship dates/reminders:

- **Acknowledge / Complete**
- **Dismiss**

Acknowledging the occurrence should remove it from Needs Attention without deleting the underlying important date.

Recurring dates such as birthdays and anniversaries must remain available for their next occurrence.

### Custom Items / Fields

Actions depend on the source field and its capabilities.

Examples:

- Reminder → **Done / Skip / Snooze**
- Date → **Edit date / Dismiss**
- Completable item → **Mark complete**
- Other attention-generating field → **Edit / Dismiss**

Do not create generic actions that have no meaningful effect on the underlying object.

---

## 2. Document Renewal Behaviour

Document renewal needs explicit lifecycle behaviour because an expiry reminder often represents:

> "This document needs replacing"

rather than:

> "Change this expiry date."

### Proposed Behaviour

A renewal should normally preserve the existing logical Document.

For example:

```text
Passport
Current:
  passport-2036.pdf
  Issued: 2036
  Expires: 2046

History:
  passport-2026.pdf
  Issued: 2026
  Expired: 2036