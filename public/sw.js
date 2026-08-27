// FlashCrush Service Worker — 100% Offline PWA & Asset Caching
const CACHE_NAME = "flashcrush-cache-v1";

const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/site.webmanifest",
];

// Install: Precache shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Stale-while-revalidate for local assets & fonts; network-first for external APIs
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests and chrome-extension/drive upload endpoints
  if (req.method !== "GET" || url.protocol.startsWith("chrome") || url.hostname.includes("googleapis.com")) {
    return;
  }

  // Navigation requests (HTML pages)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => {
        return caches.match("/index.html") || caches.match("/");
      })
    );
    return;
  }

  // Static Assets (JS, CSS, Fonts, Images)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Return cached and fetch in background to update
        fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, networkRes));
          }
        }).catch(() => {});
        return cached;
      }

      // Not in cache: fetch from network and cache
      return fetch(req).then((networkRes) => {
        if (!networkRes || networkRes.status !== 200 || networkRes.type !== "basic") {
          return networkRes;
        }
        const resClone = networkRes.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return networkRes;
      }).catch(() => {
        // Offline fallback for images
        if (req.headers.get("accept")?.includes("image")) {
          return new Response(
            '<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#1e293b"/></svg>',
            { headers: { "Content-Type": "image/svg+xml" } }
          );
        }
      });
    })
  );
});
