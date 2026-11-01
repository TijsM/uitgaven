// Service worker: keeps the app usable offline.
// - App shell (page, JS/CSS, icons): page network-first, hashed assets cache-first.
// - Options and expenses (GET /api/options, /api/expenses): network-first, cached copy when offline.
// - Everything else, including POSTs, goes straight to the network. Saves made offline are
//   queued by the page itself (not Background Sync, which iOS doesn't support).
const CACHE = "uitgaven-v2";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
const CACHED_API = ["/api/options", "/api/expenses"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      // Also cache the scripts and styles the page loads, so it can boot offline
      const html = await (await cache.match("/")).text();
      const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
      await Promise.all([...new Set(assets)].map((a) => cache.add(a).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));

async function networkFirst(request, cacheKey, ms) {
  const cache = await caches.open(CACHE);
  try {
    const response = await Promise.race([fetch(request), timeout(ms)]);
    if (response.ok) await cache.put(cacheKey, response.clone());
    return response;
  } catch {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    throw new Error("offline and not cached");
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/", 4000));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
  } else if (CACHED_API.includes(url.pathname)) {
    event.respondWith(networkFirst(request, url.pathname, 6000));
  }
});
