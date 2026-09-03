// FlashCrush Service Worker v2 — Complete Offline PWA Caching for Desktop & Mobile
const CACHE_NAME = "flashcrush-cache-v2";

const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/site.webmanifest",
];

// Install: Precache shell assets and activate immediately
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

// Activate: Clean up old cache versions and claim all clients
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

// Fetch Strategy:
// 1. Navigation requests: Network-first with instant fallback to cached /index.html
// 2. Static assets (JS chunks, CSS, WASM, fonts): Cache-first with background revalidation
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-GET, Google Drive upload/API endpoints, and browser extensions
  if (
    req.method !== "GET" ||
    url.protocol.startsWith("chrome") ||
    url.protocol.startsWith("edge") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("accounts.google.com") ||
    url.hostname.includes("peerjs.com") ||
    url.hostname.includes("metered.ca")
  ) {
    return;
  }

  // 1. HTML Navigation Requests (Page reloads & direct URL navigation)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(async () => {
          // OFFLINE: Return cached index.html or root
          const cachedIndex = await caches.match("/index.html");
          if (cachedIndex) return cachedIndex;
          const cachedRoot = await caches.match("/");
          if (cachedRoot) return cachedRoot;
          const matched = await caches.match(req);
          if (matched) return matched;
          return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
        })
    );
    return;
  }

  // 2. Static Resources (Vite JS bundles, CSS, WASM, Fonts, SVGs)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Return cached asset immediately and update cache in background
        fetch(req)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, networkRes));
            }
          })
          .catch(() => {});
        return cached;
      }

      // Not in cache yet: Fetch from network and save to cache
      return fetch(req)
        .then((networkRes) => {
          if (networkRes && (networkRes.status === 200 || networkRes.type === "opaque")) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(() => {
          // Offline fallback for images
          if (req.headers.get("accept")?.includes("image")) {
            return new Response(
              '<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#0f172a"/></svg>',
              { headers: { "Content-Type": "image/svg+xml" } }
            );
          }
        });
    })
  );
});
