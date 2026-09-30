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

## PWA (in scope)

Web Push requires Kinesis to be a proper installable PWA, which is part of
this ticket. Already in place: `app/manifest.ts` and `appleWebApp` metadata in
`app/layout.tsx`. Still needed:

- **Service worker:** add `public/sw.js`, registered from the client app. It
  handles `push` (shows the notification) and `notificationclick` (focuses an
  open Kinesis window or opens `actionUrl`). It must be served uncached and
  must not go through Clerk in `proxy.ts`; the current matcher already skips
  `.js`, so keep it that way.
- **iOS icon:** add `app/apple-icon.png` (180×180), resized from the current
  favicon `app/icon.png`. Without it, the Home Screen icon falls back to a
  screenshot.
- **Install guidance:**
  - iOS has no install prompt, so show "Share → Add to Home Screen"
    instructions where push is enabled.
  - Android and Chrome can use `beforeinstallprompt`.
  - Detect installed mode with `display-mode: standalone`.
- **Installed-app check:** verify on iOS and Android that sign-in (Clerk),
  navigation and the status bar work when opened from the Home Screen.
- **No offline support:** caching or offline mode is out of scope. The
  service worker exists for push only.

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
- **Implementation:** add the `web-push` package, with VAPID keys stored as environment variables. Add
  `worker-src 'self'` to the Content Security Policy in `next.config.ts`.
  Protect the cron route with a secret (`CRON_SECRET`). See the bundled Next.js
  guide at `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`.
- **Data model:** add a push subscription table (per user, per device) and a
  pushed-key record per user, which is deleted when its source record is
  deleted, the same way the `NotificationRead` markers are.
