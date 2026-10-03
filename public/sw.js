// Kinesis service worker (KD-053). It exists for Web Push only: no fetch
// handler, no caching, no offline mode.
//
// Registered by components/pwa/PwaClient.tsx. Payloads come from
// lib/push/payload.ts: { title, body, url, tag, badge }.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take over already-open pages straight away, so a tap can navigate them.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title || "Kinesis", {
        body: payload.body,
        tag: payload.tag,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: payload.url || "/" },
      }),
      setBadge(payload.badge),
    ]),
  );
});

// The number on the installed app's icon: the bell's unread count, so it's
// right even while the app is closed. Where the Badging API is missing, or
// the badge isn't allowed, it simply doesn't show -- never a failed push.
async function setBadge(count) {
  if (typeof count !== "number" || !("setAppBadge" in self.navigator)) return;
  try {
    if (count > 0) await self.navigator.setAppBadge(count);
    else await self.navigator.clearAppBadge();
  } catch {
    // Not permitted on this device.
  }
}

// Opens the page the notification is about. The URL carries the
// notification's key, which the app uses to mark it read on the bell.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        try {
          await open.focus();
          await open.navigate(url);
          return;
        } catch {
          // Fall through: a page this worker doesn't control can't be navigated.
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
