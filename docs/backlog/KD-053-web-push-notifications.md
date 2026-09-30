# KD-053 — Web Push Notifications for Bell Items

**Status:** Accepted
**Priority:** High
**Tags:** Architecture / Data Model / Integration

## Summary

Deliver bell notifications to the user's phone as Web Push notifications,
using Kinesis as an installed PWA. There is no native app, and email is not
used.

## Requirements

- **Mirror the bell.** A push is sent only for an item the bell would show at
  that moment, using the same `message` text. Tapping it opens the item's
  `actionUrl`. The bell (`lib/notifications/engine.ts`) stays the single
  source of truth, with no separate notification logic.
- **Push each item once.** Record what has been pushed, keyed by the
  notification `key` (`lib/notifications/identity.ts`):
  - a reminder is pushed once;
  - when it goes overdue it has a new key, so it is pushed once more;
  - a moved deadline gives a new key, so it is pushed again.

  Skip items already read in the app, and never re-push an item just because
  it is still unread.
- **Respect settings.** If `remindersEnabled` is off, nothing is pushed.
- **Per-device toggle.** Settings gets a push on/off toggle for each device.
  A user can have several subscribed devices.
- **Schedule.** Vercel Cron calls a protected route once a day (Hobby plan)
  at 20:00 UTC, which is 6am in Sydney's winter and 7am during daylight
  saving. Notifications are date-sensitive, not time-sensitive, so once a day
  is enough.

## Considerations

- **iOS:** push works only after Kinesis is added to the Home Screen from
  Safari (iOS 16.4+). The permission request must come from a user tap. If
  Kinesis isn't installed, the toggle should say "Add Kinesis to your Home
  Screen first" rather than fail silently.
- **Timezone:** there is one fixed UTC send time, so users outside Sydney get
  an odd hour. That's accepted for now. The engine already works out each
  user's local day (`User.timeZone`), so the dates themselves are correct.
- **Cron drift:** on Hobby the job can run any time within the scheduled
  hour.
- **Dead subscriptions:** delete a subscription when the push service returns
  404 or 410.
- **Implementation:** add a service worker (`public/sw.js`) and the
  `web-push` package, with VAPID keys stored as environment variables. Add
  `worker-src 'self'` to the Content Security Policy in `next.config.ts`.
  Protect the cron route with a secret (`CRON_SECRET`). See the bundled Next.js
  guide at `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`.
- **Data model:** add a push subscription table (per user, per device) and a
  pushed-key record per user, which is deleted when its source record is
  deleted, the same way the `NotificationRead` markers are.
