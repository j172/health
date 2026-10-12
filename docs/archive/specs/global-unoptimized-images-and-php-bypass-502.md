# Specification: Global Image Optimization Bypass and PHP Proxy Offloading to Eliminate 502 Bad Gateway Crash Loops

## 1. Problem Statement & Background

Recent browser console telemetry on `https://health.j172.tw/` shows extensive, cascading HTTP 502 Bad Gateway errors:

```text
(index):23 GET https://health.j172.tw/_next/image?url=%2Fimages%2Fnews%2Farticles%2Farticle-263b6d6d86b86335a80f5c81.jpg&w=640&q=75 502 (Bad Gateway)
(index):23 GET https://health.j172.tw/_next/image?url=%2Fimages%2Ficon%2Ficon-moon.svg&w=48&q=75 502 (Bad Gateway)
(index):23 GET https://health.j172.tw/_next/image?url=%2Fimages%2Flogo%2Fj172tw-health-logo.png&w=96&q=75 502 (Bad Gateway)
34cfuqkl-82eg.js:1 GET https://health.j172.tw/?_rsc=fA_u5FizDPKOIdgy 502 (Bad Gateway)
weather-nearby?lat=25.0384&lng=121.5637:1 GET https://health.j172.tw/api/weather-nearby?lat=25.0384&lng=121.5637 502 (Bad Gateway)
03j7-j6-pah60.js:1 GET https://health.j172.tw/api/aqi/nearest?lat=25.0384&lng=121.5637 502 (Bad Gateway)
34cfuqkl-82eg.js:1 GET https://health.j172.tw/tools/weather-alerts?_rsc=7h4NYy5eoyMcNlUN 502 (Bad Gateway)
03j7-j6-pah60.js:1 GET https://health.j172.tw/api/uv/nearest?lat=25.0384&lng=121.5637 502 (Bad Gateway)
```

### Root Cause Analysis
1. **CloudLinux 768MB Virtual Memory Ceiling**:
   The production cPanel environment enforces strict resource caps (768MB total memory for the user account).
2. **Next.js Image Pipeline Resource Spikes**:
   When visitors browse the homepage or archive pages, 30+ images (article thumbnails, navigation icons, logos) trigger simultaneous requests to `/_next/image?url=...`.
3. **Process Crash & Cascading 502**:
   Next.js's image optimization pipeline attempts to resize and re-encode dozens of images simultaneously in Node.js worker memory. Under peak load, memory consumption breaches 768MB, causing CloudLinux / the kernel OOM killer to send `SIGKILL` to the `health-web` Node process.
4. **Front Controller Connection Failure**:
   While `health-web` is dead or restarting, `.remote-health-index.php` fails to connect to port 3000 (`Proxy error: Failed to connect to localhost port 3000`), immediately responding with **502 Bad Gateway** to all concurrent requests—including React Server Component (`_rsc`) prefetches and sidebar API calls (`/api/weather-nearby`, `/api/aqi/nearest`, `/api/uv/nearest`).
5. **Crash Loop Trigger**:
   Because client browsers automatically retry failed images or new visitors load the page, the newly-spawned Node process is immediately bombarded with image resize requests again, creating a continuous crash loop.

---

## 2. Technical Architecture & Decisions

### Decision 1: Global `unoptimized: true` in `next.config.js`
- Set `images.unoptimized = true` in `next.config.js`.
- **Impact**:
  - Next.js `<Image>` components emit native `<img>` tags pointing directly to the asset URL (`/images/news/articles/...`, `/images/logo/...`, `https://blog.j172.tw/...`).
  - Completely disables the Node.js dynamic image resizing pipeline (`/_next/image`).
  - Node.js heap memory usage for image processing drops to 0 MB.
  - No CPU spikes, no Sharp/WASM memory pressure, and no risk of OOM termination.

### Decision 2: PHP Front Controller (`.remote-health-index.php`) `/_next/image` Fast Bypass
- To handle legacy cached HTML, web crawlers, and existing browser caches that still request `/_next/image?url=...`, intercept `/_next/image` in `.remote-health-index.php` before any request is forwarded to Node.js.
- **Handling Local Images (`url` starts with `/images/`)**:
  - Decode `url`, sanitize against path traversal (`..` and `\0`), and resolve against `/home/tw123457/health_app/public/images/`.
  - If the static file exists on disk, stream it directly via `readfile()` in <1ms with immutable cache headers:
    ```php
    header('Content-Type: ' . $mimeType);
    header('Cache-Control: public, max-age=31536000, immutable');
    header('Access-Control-Allow-Origin: *');
    header('Content-Length: ' . filesize($fileReal));
    readfile($fileReal);
    exit;
    ```
- **Handling Remote Images (`url` starts with `http://` or `https://`)**:
  - Issue an immediate `302 Found` redirect to the upstream URL with `Cache-Control: public, max-age=86400`:
    ```php
    header('Location: ' . $imgUrl, true, 302);
    header('Cache-Control: public, max-age=86400');
    exit;
    ```
- **Fallback**:
  - Return HTTP 404 immediately for invalid or nonexistent image requests.
- **Guarantee**:
  - `/_next/image` will **NEVER** reach the Node.js server under any circumstance.

---

## 3. Verification & Guardrails

1. **PHP Syntax Validation**:
   - `php -l .remote-health-index.php` must exit 0.
2. **Automated Unit & Integration Tests**:
   - Create `tests/image-bypass-and-unoptimized.test.mjs` verifying:
     - `next.config.js` configures `images.unoptimized = true`.
     - `.remote-health-index.php` contains the `/_next/image` disk streaming and 302 redirect bypass logic.
     - Full test suite passes: `npm run test` (388+ tests).
     - TypeScript typecheck passes: `npm run typecheck` (exit 0).
3. **Live Production Validation**:
   - Deploy via GitHub Actions `deploy-ftps.yml`.
   - Verify `https://health.j172.tw/` renders all images directly via 200 OK.
   - Verify `https://health.j172.tw/_next/image?url=%2Fimages%2Flogo%2Fj172tw-health-logo.png&w=96&q=75` returns 200 OK directly from PHP disk bypass.
   - Verify all sidebar widgets and RSC prefetch requests return 200 OK with zero 502 errors.
