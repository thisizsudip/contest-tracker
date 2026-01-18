const CACHE = "contest-tracker-v1";

// Files to cache
const FILES_TO_CACHE = [
    "./",
    "./index.html",
    "https://raw.githubusercontent.com/thisizsudip/contest-tracker/main/icon.png"
];

// Install event: cache files
self.addEventListener("install", e => {
    e.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(FILES_TO_CACHE))
    );
    self.skipWaiting();
});

// Activate event: clean old caches
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

// Fetch event: serve cached files first
self.addEventListener("fetch", e => {
    e.respondWith(
        caches.match(e.request).then(res => res || fetch(e.request))
    );
});
