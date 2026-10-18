// Cache public assets only. API data and pages may become personalized later.
const CACHE = "kb-public-v2";
const OFFLINE = "/offline.html";
const MAX_ENTRIES = 64;
const MAX_ASSET_BYTES = 2 * 1024 * 1024;
let writes = Promise.resolve();

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith("kb-") && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () =>
      (await caches.open(CACHE)).match(OFFLINE).then((offline) => offline || Response.error())));
    return;
  }
  if (url.search || !(url.pathname.startsWith("/_next/static/") || /^\/icon-(192|512)\.png$/.test(url.pathname))) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    const length = Number(response.headers.get("content-length"));
    if (response.ok && !response.redirected && length > 0 && length <= MAX_ASSET_BYTES
        && !/no-store|private/i.test(response.headers.get("cache-control") || "")) {
      const copy = response.clone();
      writes = writes.catch(() => {}).then(async () => {
        await cache.put(request, copy);
        const keys = (await cache.keys()).filter((key) => new URL(key.url).pathname !== OFFLINE);
        for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await cache.delete(key);
      });
      event.waitUntil(writes.catch(() => {}));
    }
    return response;
  }));
});
