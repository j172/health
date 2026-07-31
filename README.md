# j172tw Health

A Next.js 16 news site (health.j172.tw) that aggregates public-health RSS feeds from Taiwanese government agencies and news outlets into a searchable, SEO-friendly news archive. Built on top of the [Solid Next.js template](https://nextjstemplates.com/templates/solid); the original template's marketing pages remain, with the news pipeline as the actual product.

## What it does

- Fetches RSS feeds from 15 sources (see `lib/server/config/rss-feeds.ts`) on a 30-minute cron and on-demand
- Parses each feed, fetches the full article page for new/changed items, and extracts body text, images, and attachments
- Persists everything to MySQL (`news_items`, `news_assets`, `news_card_images`, `ingest_runs`, `ingest_errors`)
- Auto-assigns a royalty-free card image (via the Pixabay API) to articles that don't ship their own image, downloading and hosting it locally rather than hotlinking
- Serves `/news` (archive) and `/news/[id]` (article) with OpenGraph/JSON-LD metadata, plus `/sitemap.xml` and `/robots.txt`
- Multi-language switching support (`zh-TW`, `zh-CN`, `en`) via `LanguageContext` and Header `LanguageToggler` dropdown, with OpenCC (`opencc-js`) dynamic Traditional-to-Simplified Chinese translation for live API content (news titles, earthquake locations, AQI stations)
- Automatic collation by first character (`localeCompare('zh-Hant')`) for `TOOL_CATALOG` entries and `SiteFooter` category columns
- Also syncs a 30-minute snapshot of MOENV's national AQI stations into `aqi_readings` and 12 CWA (中央氣象署) datasets into `cwa_*` tables, and (every 6 months) the NHI/MOL/TFDA facility and drug registries into `facilities`/`drugs` — see "Data source sync schedule" below

### RSS sources

MOHW (焦點新聞/即時新聞澄清/公告訊息/活動訊息/最新消息), CDC, TFDA, HPA (5 channels), NHI, LTN, and a Google News Taiwan-health search feed. New sources go in `lib/server/config/rss-feeds.ts` — add the `FeedCode` to `types/rss.ts` and a display label to `lib/server/news/sourceLabels.ts` if it's a new agency.

## Local development

```bash
npm install --legacy-peer-deps
npm run dev
```

Copy `.env.example` to `.env` and fill in MySQL credentials, `RSS_SYNC_SECRET`/`RSS_SYNC_ADMIN_SECRET`, `PIXABAY_API_KEY`, and `APP_BASE_URL`. React 19 currently needs `--legacy-peer-deps` for some template dependencies.

## Architecture notes

- **`lib/server/net/httpClient.ts`** — a small `node:http`/`node:https`-based client used for *all* outbound RSS/Pixabay requests instead of the global `fetch()`. The production host's `ulimit -v` (virtual memory) is capped below what undici's lazy WASM llhttp parser needs, so `fetch()` fails outright there with `WebAssembly.instantiate(): Out of memory`; Node's core http client uses the native (non-WASM) parser and isn't affected. It also bundles the TWCA intermediate CA certificate, since `hpa.gov.tw` serves its chain without it and Node (unlike curl) won't fetch missing intermediates on its own.
- **`lib/server/rss/existingHashes.ts`** — before enriching (fetching the full article page for) a feed item, ingestion compares its payload hash against what's already stored and skips the fetch entirely for unchanged items. Without this, every hourly run re-fetched and re-parsed every article in every feed's current listing, which stopped scaling once the feed count grew.
- Ingestion is serialized via a MySQL `GET_LOCK` (`lib/server/db/mysql.ts`) so overlapping triggers (cron + manual) don't race.

## API endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/internal/rss-sync` | `x-rss-sync-secret` header | Scheduled sync trigger (every 30 min) |
| `POST /api/admin/rss-sync` | `x-rss-sync-admin-secret` header | Manual re-run of ingestion |
| `GET /api/admin/ingestion-runs` | `x-rss-sync-admin-secret` header | Last 20 ingestion run records |
| `POST /api/admin/news-images` | `x-rss-sync-admin-secret` header, JSON body `{ "limit": 10 }` (max 50) | Backfill Pixabay card images for existing image-less articles; call repeatedly until `assigned` is 0 |
| `GET /api/internal/aqi-sync` | `x-rss-sync-secret` header | Scheduled AQI snapshot sync (every 30 min, writes to `aqi_readings`) |
| `POST /api/admin/aqi-sync` | `x-rss-sync-admin-secret` header | Manual re-run / backfill of the AQI sync |
| `GET /api/aqi` | none (public) | Reads the latest per-site row from `aqi_readings`; optional `?county=` filter |
| `POST /api/admin/cwa-sync` | `x-rss-sync-admin-secret` header | Fire-and-forget refresh of all 12 CWA (中央氣象署) datasets — forecasts, earthquakes, tsunamis, hazard alerts, station/rainfall/UV observations (background job, responds `202`, every 30 min) |
| `POST /api/admin/facilities-sync` | `x-rss-sync-admin-secret` header | Fire-and-forget refresh of NHI/MOL/TFDA facility sources (background job, responds `202`) |
| `POST /api/admin/facilities-hours-sync` | `x-rss-sync-admin-secret` header | Fire-and-forget refresh of NHI weekly service hours (background job, responds `202`) |
| `POST /api/admin/drugs-sync` | `x-rss-sync-admin-secret` header | Refresh of the TFDA drug appearance database |
| `POST /api/admin/facilities-geocode` | `x-rss-sync-admin-secret` header, JSON body `{ "facilityType", "sourceKey", "limit" }` | Geocodes one batch of address-only facilities; call repeatedly until `attempted` is 0 (rate-limited to ~1 req/sec via Nominatim fallback) |

### Data source sync schedule

RSS (`/api/internal/rss-sync`), AQI (`/api/internal/aqi-sync`), and CWA (`/api/admin/cwa-sync`) all run **every 30 minutes** — the sources with automated freshness requirements. All three are triggered by the production host's **crontab** (configured directly via SSH/cPanel Cron Jobs, not in this repo):

```
5,35 * * * * curl -fsS -H "x-rss-sync-secret: <RSS_SYNC_SECRET>" https://health.j172.tw/api/internal/rss-sync >/dev/null 2>&1
20,50 * * * * curl -fsS -H "x-rss-sync-secret: <RSS_SYNC_SECRET>" https://health.j172.tw/api/internal/aqi-sync >/dev/null 2>&1
15,45 * * * * curl -fsS -X POST -H "x-rss-sync-admin-secret: <RSS_SYNC_ADMIN_SECRET>" https://health.j172.tw/api/admin/cwa-sync >/dev/null 2>&1
```

Everything else (NHI/MOL/TFDA facility datasets, TFDA drugs, geocoding) changes slowly and is refreshed every 6 months by `scripts/run-six-monthly-sync.sh`, run via the **GitHub Actions** workflow `.github/workflows/six-monthly-sync.yml` (`schedule: cron`, ~03:00 Taipei time on Jan 2 and Jul 2; also triggerable manually from the Actions tab via `workflow_dispatch`). It runs under the `FTP_SERVER` environment, reusing the `RSS_SYNC_ADMIN_SECRET` secret already stored there for the deploy workflow. Unlike the 30-minute RSS/AQI/CWA syncs, this one lives in the repo instead of cPanel because a twice-a-year job benefits more from GitHub's run history and failure emails than from being colocated with the other cron jobs.

One source can't be part of any cron: the MOHW long-term-care/health-check CSVs (`ltcpap.mohw.gov.tw`) are IP-blocked from both the production host and GitHub Actions runners, so `scripts/import-mohw-facilities.mjs` has to be run by hand from a regular residential/office network (see that script's header comment).

## Deployment

Production runs on cPanel shared hosting (`health.j172.tw`), not a plain VPS. Node (via nvm) runs under **pm2** as `health-web`, fronted by a PHP reverse-proxy script that also serves static assets and handles the ops endpoints below.

**Deploy**: GitHub Actions workflow `.github/workflows/deploy-ftps.yml` (`workflow_dispatch`, run from the Actions tab) builds the app, packages `.next3` as a tarball, uploads it plus the PHP handler over FTPS, triggers a remote apply, and verifies the live site before finishing.

- **`.remote-health-index.php`** is the source of truth for the PHP handler — it's what gets uploaded as `index.php` on the server (both the domain root and the account root). It reverse-proxies to the Next.js process on `127.0.0.1:3000`, serves `/_next/static` and Pixabay card images directly (bypassing Node for static assets), and exposes the `/__ops/*` endpoints below (all gated by a `?key=` query param).
- **`ecosystem.config.cjs`** is the pm2 process definition for `health-web`; it's uploaded alongside the app on every deploy.

### `/__ops/*` endpoints (require `?key=<ops key>`, set in `.remote-health-index.php`)

| Path | Purpose |
|---|---|
| `/__ops/apply-prebuilt-force` | Unpack the uploaded prebuilt build, swap it in, restart pm2, health-probe `/news`; rolls back automatically on failure |
| `/__ops/apply-prebuilt-status` | Tail the apply log / check if one is running |
| `/__ops/rebuild` | Fallback: build from source on the server itself (slower, used if a prebuilt bundle isn't available) |
| `/__ops/pm2-status` | pm2 process list/describe, a local curl probe of the Next.js process, and listening ports |
| `/__ops/pm2-logs` | Tail pm2's stdout/stderr logs for `health-web` |
| `/__ops/db-fix` | Diagnose/repair MySQL credential drift between `.env` and the actual DB user (`&setpass=1` forces the DB password to match `.env`; `&restorepass=1` recovers a `.env` password accidentally stripped by a bad deploy) |
| `/__ops/net-test` | Diagnose outbound connectivity from the server (PHP curl vs raw Node `fetch()` vs the ulimit ceiling) |

Since the FTPS workflow can be blocked by automated safety checks in some environments, the fallback path is: edit `.remote-health-index.php` locally, then FTP-upload it directly to `index.php` at both `ftp://<host>/index.php` and `ftp://<host>/health.j172.tw/index.php` using the credentials in `.env` (`FTP_SERVER`/`FTP_USERNAME`/`FTP_PASSWORD`), then hit `/__ops/apply-prebuilt-force` (or the relevant ops endpoint) directly.

## What's *not* used

`health_index.php` and the `deploy/` folder (a VPS + Nginx + plain PM2 setup) described an earlier deployment plan that was superseded by the cPanel/FTPS approach above and have been removed — `.remote-health-index.php` and `ecosystem.config.cjs` are the current, actually-deployed versions.
