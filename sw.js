const CACHE_NAME = "ct-cache-v1";
const urlsToCache = [
    "/",
    "/index.html",
    "/manifest.json",
    "/sw.js",
    "https://cdn.tailwindcss.com"
];

// Install
self.addEventListener("install", e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => cache.addAll(urlsToCache))
        .then(() => self.skipWaiting())
    );
});

// Activate
self.addEventListener("activate", e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            )
        )
    );
});

// Fetch
self.addEventListener("fetch", e => {
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});
