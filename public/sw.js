// Hand-written PWA Service Worker v2 (Network-First for navigations, Cache-First for static assets)
const CACHE_VERSION = "v2";
const STATIC_CACHE = `j172-health-static-${CACHE_VERSION}`;
const CORE_ROUTES = ["/", "/news", "/privacy"];

const OFFLINE_HTML = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>離線閱讀模式 | j172tw Healthz</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;color:#181c31;background:#fbfbfb;text-align:center;padding:2rem}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:1rem;padding:2rem;max-width:400px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1)}
h1{font-size:1.25rem;margin-bottom:0.5rem;color:#4f46e5}p{font-size:0.875rem;color:#6b7280;line-height:1.5}</style>
</head><body><div class="card"><h1>🌐 目前處於離線狀態</h1><p>已為您提供離線閱讀模式。您仍可瀏覽已快取的健康新聞與算盤工具。</p></div></body></html>`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(CORE_ROUTES).catch(() => {}))
  );
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
  // Never cache API sync triggers or admin endpoints
  if (url.pathname.startsWith("/api/admin/") || url.pathname.startsWith("/api/internal/")) return;

  // Navigations: Network-First with cache fallback and offline page
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then(
              (cached) =>
                cached ||
                new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })
            )
        )
    );
    return;
  }

  // Static assets: Cache-First (hashed assets / static images)
  const isStaticAsset =
    /\.(png|jpg|jpeg|svg|webp|ico|woff2?|css|js)$/.test(url.pathname) || url.pathname.startsWith("/_next/static/");

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        });
      })
    );
  }
});
