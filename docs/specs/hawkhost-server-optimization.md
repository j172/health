# Feature Specification: HawkHost Production Server Optimizations & Governance

## Overview

This specification details the comprehensive server optimization, resource governance, and performance tuning applied to the HawkHost production shared hosting environment (Singapore node: CloudLinux 8 + LiteSpeed Web Server + MariaDB 10.11 + cPanel) running `health.j172.tw` (Next.js / PM2 `health-web`), `bid.j172.tw` (Next.js / PM2 `bid-web`), and supporting PHP/static services.

---

## 1. Context & Identified Bottlenecks

1. **Shared Memory Pool & CloudLinux LVE Ceiling**:
   - `health.j172.tw` and `bid.j172.tw` share a single cPanel account's physical memory and CPU quota.
   - Default V8 heap allocation sizes off the host's total visible memory (54GB), causing processes under load (e.g. Sharp image resizing) to balloon until CloudLinux triggers a silent external `SIGKILL` instead of a catchable V8 garbage collection.
2. **PM2 Log File Growth**:
   - Without automatic log rotation, PM2 output/error logs grew unbounded (`health-web-error-0.log` reached 265MB; total logs exceeded 317MB).
3. **Crontab Accumulation & Concurrent Spikes**:
   - Successive deployment scripts previously left orphaned comments outside `BEGIN/END` markers in the system crontab.
   - Both `health.j172.tw` and `bid.j172.tw` watchdogs were scheduled at `*/5 * * * *` (minute 0, 5, 10...), causing concurrent HTTP/PHP invocations at the exact same second.
4. **Proxy & Static Asset Latency**:
   - Static chunks (`_next/static/`), WebP images, and fonts traversed LiteSpeed → PHP (`index.php`) → loopback cURL → Next.js (port 3000) without long-term browser cache headers or TCP Keep-Alive connection reuse.
5. **Disk Waste**:
   - Stale build directories (`.next_failed`, `.next3_permblock`), unneeded global `.npm` caches (2.2GB), and historical tarballs occupied unnecessary storage and Inodes.
6. **Database Cardinality**:
   - High-volume tables (`tfda_food_operators` 767k rows, `cwa_station_weather` 620k rows, `cwa_rainfall` 575k rows, `facilities` 100k rows) had drifted query planner index statistics.

---

## 2. Implemented Architecture & Configurations

### 2.1 PM2 Process Governance & Memory Capping

- **`health-web` (`/home/tw123457/health_app/ecosystem.config.cjs`)**:
  - Node interpreter: Node v20.20.2
  - `node_args: '--max-old-space-size=768'`
  - `max_memory_restart: '1024M'`
  - `min_uptime: '10s'`, `max_restarts: 10`
- **`bid-web` (`/home/tw123457/bid_app/ecosystem.config.cjs`)**:
  - Node interpreter: Node v24.19.0
  - `node_args: '--max-old-space-size=512'`
  - `max_memory_restart: '1024M'`
  - `min_uptime: '10s'`, `max_restarts: 10`
- **Automatic Log Rotation (`pm2-logrotate`)**:
  - `max_size: 10M`
  - `retain: 3`
  - `compress: true`
  - `workerInterval: 30`

### 2.2 Crontab Staggering & Cleanup

- All managed entries are strictly encapsulated between `# BEGIN health-app managed cron` and `# END health-app managed cron` in `scripts/health-app.crontab`.
- **Staggered execution**:
  - `health.j172.tw` watchdog: `*/5 * * * *` (minutes 0, 5, 10, 15...)
  - `bid.j172.tw` watchdog: `2-59/5 * * * *` (minutes 2, 7, 12, 17...)
  - Independent dead-man's-switch ping (`healthchecks.io`): runs on genuine `/news` HTTP 200.

### 2.3 LiteSpeed Caching & PHP Reverse Proxy Tuning

- **`.htaccess` (`/home/tw123457/health.j172.tw/.htaccess`)**:
  - Immutable long-term caching for static assets:
    `Header set Cache-Control "public, max-age=31536000, immutable"` on `.(ico|pdf|jpg|jpeg|png|gif|webp|js|css|svg|woff|woff2|ttf)`
  - Deflate/Brotli compression rules for text, HTML, CSS, JS, SVG, and JSON.
  - Security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`.
- **PHP Proxy (`.remote-health-index.php` / `health.j172.tw/index.php`)**:
  - Enabled cURL TCP Keep-Alive (`CURLOPT_TCP_KEEPALIVE => 1`, `CURLOPT_TCP_KEEPIDLE => 30`, `CURLOPT_TCP_KEEPINTVL => 15`).
  - Added connection timeout `CURLOPT_CONNECTTIMEOUT => 5`.

### 2.4 Database Optimization & Maintenance

- Executed `ANALYZE TABLE` across all production tables in `tw123457_health` to update optimizer cardinalities:
  - `tfda_food_operators`, `news_items`, `news_assets`, `news_card_images`
  - `cwa_station_weather`, `cwa_rainfall`, `facilities`
  - `tfda_food_nutrition`, `tfda_drug_ingredients`
  - `aqi_readings`, `pm25_readings`, `global_earthquakes`, `drugs`
  - `provider_api_cache`, `pixabay_api_cache`, `ingest_runs`, `ingest_errors`
- Purged stale cache entries older than 30 days.

### 2.5 Disk Cleanup & Security

- Reclaimed **3.0 GB+** of storage (home directory usage dropped from 15GB to 12GB):
  - Purged `~/.npm/_cacache` (2.2GB).
  - Purged `~/.nvm/.cache` (100MB).
  - Truncated dead PM2 logs and deleted legacy `.prebuilt-*.tgz` and `.next_failed` folders.
- Hardened all `.env` and `.env.*` credentials to `chmod 600`.

---

## 3. Verification & Live Status

- `health.j172.tw` HTTP 200 response time: ~0.21s - 0.24s.
- `bid.j172.tw` HTTP 200 response time: ~0.82s.
- PM2 processes (`health-web`, `bid-web`, `pm2-logrotate`) healthy and steady-state CPU at 0%.
- Verified zero duplicate comments on system `crontab -l`.
