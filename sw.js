/* =====================================================
   Contest Tracker — Service Worker
   Handles: Caching, Push Notifications, Background Sync
   ===================================================== */

const CACHE = "contest-tracker-v3";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "https://raw.githubusercontent.com/thisizsudip/contest-tracker/main/icon.png"
];

/* ---------- INSTALL ---------- */
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => {
      return Promise.allSettled(
        FILES_TO_CACHE.map(url => cache.add(url).catch(() => {
          console.warn("[SW] Could not cache:", url);
        }))
      );
    })
  );
  self.skipWaiting();
});

/* ---------- ACTIVATE ---------- */
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE)
            .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ---------- FETCH (Cache-first, network fallback) ---------- */
self.addEventListener("fetch", e => {
  // Skip non-GET and cross-origin API requests (let them go to network)
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.hostname === "clist.by" || url.hostname === "codeforces.com") return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cache fresh responses for app shell files
        if (response && response.status === 200 && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => caches.match("./index.html")); // offline fallback
    })
  );
});

/* ---------- PUSH NOTIFICATIONS ----------
   Receives push events from a server (or from the client via
   self.registration.showNotification called by the page).
   This fires even when the tab is closed on mobile PWA installs.
   ---------------------------------------------- */
self.addEventListener("push", e => {
  let payload = {
    title: "⚡ Contest Alert",
    body:  "A contest is starting soon!",
    url:   "./"
  };

  if (e.data) {
    try {
      payload = { ...payload, ...e.data.json() };
    } catch {
      payload.body = e.data.text();
    }
  }

  const options = {
    body:    payload.body,
    icon:    "https://raw.githubusercontent.com/thisizsudip/contest-tracker/main/icon.png",
    badge:   "https://raw.githubusercontent.com/thisizsudip/contest-tracker/main/icon.png",
    vibrate: [200, 100, 200, 100, 200],
    tag:     payload.title, // collapse duplicates
    renotify: true,
    data:    { url: payload.url },
    actions: [
      { action: "view",    title: "View Contest" },
      { action: "dismiss", title: "Dismiss" }
    ]
  };

  e.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

/* ---------- NOTIFICATION CLICK ---------- */
self.addEventListener("notificationclick", e => {
  e.notification.close();

  if (e.action === "dismiss") return;

  const targetUrl = (e.notification.data && e.notification.data.url) || "./";

  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(windowClients => {
      // Focus existing tab if open
      for (const client of windowClients) {
        if (client.url.includes("contest-tracker") && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

/* ---------- NOTIFICATION CLOSE ---------- */
self.addEventListener("notificationclose", e => {
  console.log("[SW] Notification closed:", e.notification.tag);
});

/* ---------- BACKGROUND SYNC ----------
   When the device comes back online, re-check for new CF contests.
   The page registers a sync tag "check-contests" when it goes offline.
   ---------------------------------------------- */
self.addEventListener("sync", e => {
  if (e.tag === "check-contests") {
    e.waitUntil(
      // Notify all open clients to re-fetch
      clients.matchAll({ type: "window" }).then(tabs => {
        tabs.forEach(tab => tab.postMessage({ type: "SYNC_REFETCH" }));
      })
    );
  }
});

/* ---------- MESSAGE HANDLER ----------
   Receives messages from the page to show notifications
   even when triggered by setTimeout in the client.
   ---------------------------------------------- */
self.addEventListener("message", e => {
  if (!e.data) return;

  // Page asks SW to show a notification (works on installed PWA even bg)
  if (e.data.type === "SHOW_NOTIFICATION") {
    const { title, body, url } = e.data;
    self.registration.showNotification(title, {
      body,
      icon:    "https://raw.githubusercontent.com/thisizsudip/contest-tracker/main/icon.png",
      badge:   "https://raw.githubusercontent.com/thisizsudip/contest-tracker/main/icon.png",
      vibrate: [200, 100, 200],
      tag:     title,
      renotify: true,
      data:    { url: url || "./" }
    });
  }
});
