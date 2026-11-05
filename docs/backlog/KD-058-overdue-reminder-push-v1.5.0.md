# KD-058 — Overdue Reminder Push

**Status:** In Progress — built on `v1.5.0`; testing on the owner's own devices to come
**Priority:** High
**Tags:** Notifications / Integration

## Summary

KD-053 pushes each bell item once. An item that goes overdue is pushed on
the day it does, and is never mentioned again unless its deadline moves. So
once a few things are overdue, Kinesis goes quiet about them.

This adds one more push: **"X things need your attention"**, sent every few
days for as long as anything is overdue. It names nothing. Tapping it opens
the dashboard with the Needs Attention popup already showing, which lists
everything overdue with its actions.

## Requirements

- **One push, not per item.** The title is "3 things need your attention"
  ("1 thing needs your attention" for one). The body is "Tap to see what's
  overdue." There is no list of names: with 10 or 20 overdue there is no
  useful way to summarise them.
- **Counts exactly what Needs Attention shows.** The count comes from the
  same derivation as the dashboard tile (`getNeedsAttentionFor`), so the two
  always agree:
  - something due **today** is not counted until tomorrow (ADR-010, Needs
    Attention uses `< today`);
  - dismissed items are not counted;
  - relationship dates are never counted, since they are never overdue.
- **On top of the item pushes.** Every KD-053 push carries on unchanged. On
  the day something goes overdue you get its own push and, if the cycle is
  due, the overdue reminder too. It is sent last in the run, so it sits on
  top of that morning's pushes.
- **Replaces itself.** Every overdue reminder uses one fixed tag
  (`OVERDUE_REMINDER_TAG`), so a device swaps the last one for the new one
  instead of stacking them.
- **Tap opens the popup.** The push opens `/?attention=open`. The dashboard
  opens Needs Attention, then takes the parameter out of the address bar so
  going back or refreshing does not open it again. Nothing is marked read,
  since the items are still overdue.
- **Badge unchanged.** The app icon's number stays the bell's unread count.

## Setting

**Overdue reminders**, in Settings → Notifications & reminders, under the
push toggle:

- **On/off** (`overdueRemindersEnabled`), on by default.
- **Every N days** (`overdueReminderIntervalDays`), 3 by default, a whole
  number from 1 to 30. Checked in `updateSettingsAction`, with a database
  check constraint as the backstop.
- **All or nothing.** It covers every kind of overdue item. There is no
  per-module choice.

## The cycle

There is **one cycle per account**, never one per item. Each daily run asks
two questions:

1. Is anything overdue right now?
2. Have at least N days passed since the last overdue reminder?

If both are yes, it sends, counting everything overdue at that moment, and
records the owner's local day in `overdueReminderLastSentOn`.

Example, every 4 days: Y is overdue and a reminder goes out on 2 Nov. Z goes
overdue on 4 Nov and only gets its own item push. The next reminder is on
6 Nov and says "2 things need your attention".

- **Nothing overdue:** nothing is sent, and the last-sent day stays put. The
  next time something is overdue, the reminder goes out on the next run if N
  days have already passed.
- **Changing N** counts from the last-sent day. 4 → 6 after a 6 Nov reminder
  makes the next one 12 Nov.
- **First ever:** with no last-sent day, it goes out on the first run where
  anything is overdue. That includes the morning after this ships, for
  everyone with push on and something overdue.
- **Turning it off and on** keeps the last-sent day.
- **Delivery:** the day is recorded only once at least one device accepted
  the push, the same rule as an item. If every device failed, the next run
  tries again.

## Gates

- In-app notifications off → nothing is pushed at all (KD-053), including
  this.
- Reminders off → still sent. That switch covers advance notice only, and
  overdue is a fact (ADR-010).
- No push device → nothing to send.

## Implementation

- `lib/push/overdue-reminder.ts`: the rules (`isOverdueReminderDue`), the
  payload, the tag, the URL and the 1–30 bounds. Pure, unit-tested in
  `tests/unit/overdue-reminder.test.ts`.
- `lib/data/attention.ts`: `getNeedsAttentionFor(userId, today)`, the
  Needs Attention list without a session, for the cron. `getNeedsAttention`
  now calls it.
- `lib/data/push.ts`: `runDailyPush` sends the reminder after the item
  pushes. Its summary gains `overdueReminders`.
- `UserSettings`: `overdueRemindersEnabled`, `overdueReminderIntervalDays`,
  `overdueReminderLastSentOn` (migration `20261105000000_overdue_reminders`).
- `app/(app)/page.tsx` and `NeedsAttentionCard`: `?attention=open` opens the
  popup.
- Integration coverage in `tests/integration/push/daily-push.test.ts`
  ("the overdue reminder").

## Out of scope

- A phone-specific layout for the Needs Attention popup. It already opens
  as a bottom sheet; tighter rows for narrow screens can come later.
- A send time per user. It rides the existing daily cron (20:00 UTC).
