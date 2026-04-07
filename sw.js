/* =====================================================
   Contest Tracker — Service Worker v4
   Android-safe notification delivery
   ===================================================== */

const CACHE = "contest-tracker-v4";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "https://raw.githubusercontent.com/thisizsudip/contest-tracker/main/icon.png"
];

const ICON = "https://raw.githubusercontent.com/thisizsudip/contest-tracker/main/icon.png";

/* ---------- INSTALL ---------- */
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(FILES_TO_CACHE.map(url => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

/* ---------- ACTIVATE ---------- */
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ---------- FETCH (cache-first, network fallback) ---------- */
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Never cache API calls — always hit network
  if (url.hostname === "clist.by" || url.hostname === "codeforces.com") return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === "basic") {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});

/* ---------- SHOW A NOTIFICATION (called internally) ---------- */
function showNotif(title, body, url) {
  return self.registration.showNotification(title, {
    body,
    icon:     ICON,
    badge:    ICON,
    vibrate:  [200, 100, 200, 100, 200],
    tag:      title,      // collapses duplicates with same title
    renotify: true,       // re-alert even if same tag
    data:     { url: url || "./" },
    actions: [
      { action: "view",    title: "View Contest" },
      { action: "dismiss", title: "Dismiss" }
    ]
  });
}

/* ---------- MESSAGE HANDLER ----------
   The page sends three message types:

   1. SHOW_NOTIFICATION — fire a notification right now.
      Used by page-side setTimeout when timer fires.

   2. UPDATE_SCHEDULE — page just updated the schedule,
      store it in SW memory.

   3. CHECK_SCHEDULE — heartbeat every 5 min from page.
      SW checks the provided schedule for overdue entries
      and fires them. This is the Android fallback that
      catches any timers the OS killed.
   ------------------------------------------ */

// In-memory copy of the schedule (survives SW stay-alive window)
let swSchedule = {};

self.addEventListener("message", e => {
  if (!e.data) return;

  switch (e.data.type) {

    case "SHOW_NOTIFICATION":
      // Page timer fired and routed here — deliver immediately
      showNotif(e.data.title, e.data.body, e.data.url);
      break;

    case "UPDATE_SCHEDULE":
      // Page updated schedule (new contest added / removed / lead time changed)
      swSchedule = e.data.schedule || {};
      break;

    case "CHECK_SCHEDULE": {
      // Heartbeat: check for any overdue notifications
      const schedule = e.data.schedule || swSchedule;
      const now      = e.data.now || Date.now();
      swSchedule = schedule;

      Object.entries(schedule).forEach(([id, entry]) => {
        // Fire if we're within 2 minutes past the scheduled fire time
        // (the 2min window catches timers that fired slightly late)
        const overdue = now >= entry.fireAtMs && now <= entry.fireAtMs + 2 * 60 * 1000;
        if (overdue) {
          showNotif(entry.title, entry.body, "./");
        }
      });
      break;
    }

    case "SYNC_REFETCH":
      // Tell all open tabs to re-fetch contests
      self.clients.matchAll({ type: "window" }).then(tabs => {
        tabs.forEach(tab => tab.postMessage({ type: "SYNC_REFETCH" }));
      });
      break;
  }
});

/* ---------- PUSH (server-sent, future use) ---------- */
self.addEventListener("push", e => {
  let payload = { title: "⚡ Contest Alert", body: "A contest is starting soon!", url: "./" };
  if (e.data) {
    try { payload = { ...payload, ...e.data.json() }; }
    catch { payload.body = e.data.text(); }
  }
  e.waitUntil(showNotif(payload.title, payload.body, payload.url));
});

/* ---------- NOTIFICATION CLICK ---------- */
self.addEventListener("notificationclick", e => {
  e.notification.close();
  if (e.action === "dismiss") return;

  const target = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(tabs => {
      for (const tab of tabs) {
        if (tab.url.includes("contest-tracker") && "focus" in tab) return tab.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

/* ---------- NOTIFICATION CLOSE ---------- */
self.addEventListener("notificationclose", () => {});

/* ---------- BACKGROUND SYNC ---------- */
self.addEventListener("sync", e => {
  if (e.tag === "check-contests") {
    e.waitUntil(
      self.clients.matchAll({ type: "window" }).then(tabs => {
        tabs.forEach(tab => tab.postMessage({ type: "SYNC_REFETCH" }));
      })
    );
  }
});
