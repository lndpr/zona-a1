/* ZONA A1 — service worker untuk Web Push (alert zona BR1/BR2).
   Push dari Worker tanpa payload: isi alert diambil dari /api/push/last. */
const API = "https://zona-a1-signal-api.landungprakoso14.workers.dev";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let title = "ALERT ZONA";
    let body = "Harga masuk area blok BR1/BR2. Buka ZONA A1 untuk detail.";
    let tag = "a1-zone";
    try {
      const r = await fetch(API + "/api/push/last", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (j && j.title) { title = j.title; body = j.body || body; tag = j.tag || tag; }
      }
    } catch (_) { /* tetap tampilkan notifikasi bawaan */ }
    await self.registration.showNotification(title, {
      body, tag, renotify: true,
      icon: "icon-192.png", badge: "icon-192.png",
      vibrate: [200, 100, 200, 100, 300],
      data: { url: "./#a1LiveZones" }
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if ("focus" in c) { await c.focus(); return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
