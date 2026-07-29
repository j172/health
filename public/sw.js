// Minimal hand-written service worker (deliberately not next-pwa/workbox —
// that's a build-time webpack plugin and this project builds with Turbopack;
// a small hand-rolled worker avoids that toolchain risk entirely, and this
// site's needs are simple: offline resilience for a mostly-static reading
// experience, not a complex precache manifest).
const CACHE_VERSION = "v1";
const STATIC_CACHE = `j172-health-static-${CACHE_VERSION}`;

const OFFLINE_HTML = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>離線中 | j172tw Health</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;color:#262626;text-align:center;padding:2rem}</style>
</head><body><div><h1>目前離線</h1><p>請檢查網路連線後重新整理頁面。</p></div></body></html>`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API responses (news/tool data changes constantly) or admin/internal routes.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations (page loads): network-first so content stays fresh, falling
  // back to a cached copy or the offline page when the network is unreachable.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }))),
    );
    return;
  }

  // Static assets (images, icons, fonts, _next/static chunks): cache-first,
  // since these are content-hashed or rarely change.
  const isStaticAsset = /\.(png|jpg|jpeg|svg|webp|ico|woff2?|css)$/.test(url.pathname) || url.pathname.startsWith("/_next/static/");
  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});
