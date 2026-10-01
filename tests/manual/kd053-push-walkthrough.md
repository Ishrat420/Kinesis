# KD-053 -- Web Push Manual Walkthrough

Checks real delivery to real devices, which the automated tests can't reach.
They already cover which items are pushed and when
(`tests/integration/push/daily-push.test.ts`), the payload and key parsing
(`tests/unit/push-payload.test.ts`), the real web-push signing and encryption
(`tests/unit/push-sender.test.ts`) and the cron route's protection
(`tests/unit/push-cron-route.test.ts`).

## Before you start

- These variables are set in Vercel for the environment under test, and that
  environment has been redeployed since: `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `CRON_SECRET`.
- Phones can only be tested against a deployed URL (production, or a preview
  with its own keys); they can't reach your laptop's `localhost`.

## Triggering the daily run by hand

Don't wait for 20:00 UTC. Either:

- In Vercel, go to the project's **Settings → Cron Jobs** and press **Run**
  next to `/api/cron/push-notifications`, or
- ```
  curl -H "Authorization: Bearer <CRON_SECRET>" https://<your-domain>/api/cron/push-notifications
  ```
  It returns JSON such as `{"configured":true,"users":1,"pushed":1,"removedDevices":0}`.

## Cases

### 1. iPhone: install, then enable

1. In Safari, open Kinesis → **Settings**. The push row says to add Kinesis
   to the Home Screen first, and the toggle is disabled.
2. Share → **Add to Home Screen**. The icon is the Kinesis logo, not a
   screenshot.
3. Open Kinesis from the Home Screen and sign in. Check navigation, the
   status bar and the bell look right.
4. **Settings** → turn on **Push notifications on this device** → **Allow**.
   The toggle stays on after leaving and coming back to Settings.

### 2. Android (Chrome): enable

1. Open Kinesis in Chrome → **Settings**. If Chrome offers it, an **Install
   Kinesis on this device** button appears. Installing is optional on
   Android.
2. Turn on push → **Allow**.

### 3. The backlog isn't pushed

With items already on the bell, turn push on (case 1 or 2), then trigger the
run. **Expected:** `"pushed":0`, and nothing arrives.

### 4. A new item is pushed once, with the bell's text

1. Create a to-do due today.
2. Trigger the run. **Expected:** one notification per device. Its title and
   text match the bell row exactly.
3. Trigger the run again. **Expected:** nothing arrives.

### 5. Tapping marks it read

1. With Kinesis closed, tap the notification from case 4. **Expected:**
   Kinesis opens on the to-do's page, the address bar has no `kinesisPush=`,
   and that item shows as read on the bell.
2. Repeat with Kinesis already open in the background. **Expected:** the same
   window comes to the front and goes to the page.

### 6. In-app notifications off

Turn off **In-app notifications** and save, create another to-do due today,
and trigger the run. **Expected:** nothing arrives, and the push row says
nothing will be pushed until in-app notifications are back on. Turn them back
on.

### 7. Turning push off

Turn the toggle off on one device, create a new to-do due today, and trigger
the run. **Expected:** only the other device gets it.

### 8. Blocked permission

Block notifications for Kinesis in the device's settings, then open
**Settings**. **Expected:** the row says notifications are blocked, and the
toggle is disabled.
