# Spec & Ticket: NCDR 全類別即時災害告警整合 (研究與設計，本輪不實作)

- **Ticket ID**: `SPEC-HEALTH-20260907-NCDR-DISASTER-ALERTS-B`
- **Status**: RESEARCH (design only — implementation deferred to a follow-up session, per interview)
- **Priority**: MEDIUM (P2)
- **Affects (future)**: `/tools/weather-alerts`, `lib/server/db/schema.ts`, new `lib/server/ncdr/**`
- **Depends on lesson from**: `docs/specs/drop-wra-drought-source.md`
- **Companion ticket**: `SPEC-HEALTH-20260907-TWINKLE-TOOLS-A` (ships first, independently)

---

## 1. Problem Statement

Twinkle Hub's `rt_ncdr_active_alerts` aggregates CAP alerts from 氣象署／水利署／公路局／農業部
(雷雨/大雨/豪雨/颱風/淹水/河川水位/土石流/地震/海嘯/空品/公路 etc.). Per interview, the user wants
**full** category coverage (not just the non-duplicate subset), added as a new tab on
`/tools/weather-alerts`. This site already has dedicated pages/tables for 地震
(`cwa_earthquakes`), 海嘯 (`cwa_tsunamis`), 空品 (`aqi_readings`/`pm25_readings`), and CWA-issued
特報 (`cwa_alerts`, `cwa_township_hazards`) — so the net-new categories are: **淹水示警、河川水位、
土石流警戒、公路路況**, each from a different agency with its own API shape and reliability
profile.

I do not have Twinkle Hub MCP access in this environment, so I cannot read `rt_ncdr_active_alerts`'s
actual upstream call. This ticket documents the best candidate official sources per category and
what must be verified live before any code is written — following this repo's own standing
practice (`docs/specs/phase8-*`, `phase10-*`, `phase11-*` all state "confirmed live on
YYYY-MM-DD before writing this spec").

## 2. The governing lesson (why this is its own table, never `news_items`)

`docs/specs/drop-wra-drought-source.md` shipped a hard-won rule: **state/status data (a
reservoir's current restriction level, a river's current gauge reading, a road's current closure)
is not a news article and must not be routed through `persistItems`/`news_items`.** WRA drought
bulletins were dropped entirely because they were flattened into the news pipeline and failed the
90-day freshness gate by design — the data was current *state*, but stamped with an old
*announcement date*. The precedent the WRA postmortem names explicitly is `cwa_alerts`: a source
with severity, area and expiry gets its own table.

**Applying that here**: every NCDR category below gets its own table (or one shared
`ncdr_alerts`-style table with a `category` discriminator column, keyed by
`(agency, category, area_code, alert_key)`), read on its own path (like
`WeatherAlertSidebarWidget` reads `cwa_alerts` directly) — never inserted into `news_items`.

## 3. Candidate Sources Per Category (UNVERIFIED — confirm live before implementation)

| Category | Candidate agency/API | Notes / what to verify |
|---|---|---|
| 淹水示警 (flood warning) | 經濟部水利署防災資訊網 (fhy.wra.gov.tw) real-time flood/inundation endpoints | Confirm actual public JSON/CAP endpoint, auth requirements, update cadence, and county/township coverage. Same agency (WRA) as the dropped drought source — check whether *this* endpoint is genuinely real-time state (not a historical log) before building on it, i.e. re-run the same freshness/staleness check that killed the drought source. |
| 河川水位 (river gauge level) | 水利署 河川水位站 open data (data.gov.tw, likely under WRA's hydrological telemetry category) | Verify station coverage, reading frequency (minutes vs hours), and whether historical vs current-only. |
| 土石流警戒 (debris flow warning) | 農業部農村及水土保持署 土石流防災資訊網 (existing public "土石流警戒" open data or their public API) | Verify whether there's a stable machine-readable feed (vs. HTML-only warning list), and whether it's CAP-formatted or a proprietary JSON shape. |
| 公路路況 (road conditions/closures) | 交通部公路局 or TDX (運輸資料流通服務, tdx.transportdata.tw) road incident/closure API | TDX requires an OAuth2 client credential (free tier exists) — confirm token acquisition process fits this repo's existing "no secrets beyond `.env`" pattern before committing to it; may need a new `TDX_CLIENT_ID`/`TDX_CLIENT_SECRET` env pair. |

None of the above endpoint paths are asserted as correct — they are the starting points for the
live survey every existing `scripts/import-*.mjs`/source-onboarding spec in this repo performs
before code is written (see `docs/specs/phase10-businessweekly-health-source.md` §"robots.txt was
checked live before writing this spec" as the house style to match).

## 4. Proposed Schema Shape (draft, pending live field survey)

```sql
CREATE TABLE IF NOT EXISTS ncdr_alerts (
  id BIGINT NOT NULL AUTO_INCREMENT,
  alert_key CHAR(64) NOT NULL,        -- sha256 of raw fields, same reasoning as cwa_alerts.alert_key
  agency VARCHAR(50) NOT NULL,        -- 'wra_flood' | 'wra_river_level' | 'swcb_debris_flow' | 'thb_road'
  category VARCHAR(50) NOT NULL,
  county_code VARCHAR(10) NULL,
  county_name VARCHAR(50) NULL,
  township_name VARCHAR(50) NULL,
  severity VARCHAR(30) NULL,
  headline VARCHAR(255) NULL,
  description TEXT NULL,
  effective_at DATETIME NULL,
  expires_at DATETIME NULL,
  raw_payload JSON NULL,
  synced_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ncdr_alert (alert_key),
  KEY idx_ncdr_agency_category (agency, category),
  KEY idx_ncdr_county (county_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

A single shared table with an `agency`/`category` discriminator is proposed over 4 separate
tables because the read path (a single "災害告警 (NCDR)" tab, filterable by county) wants one
query surface — same reasoning `cwa_alerts` already applies across CWA's own multiple alert
types. Split into per-agency tables only if a category's fields diverge too much to fit
`raw_payload` + the common columns above (river-level numeric readings, for instance, may
warrant their own `ncdr_river_levels` time-series table instead of an "alert" row per reading).

## 5. Per-Agency Rollout Plan (once endpoints are confirmed)

Each agency becomes its own `lib/server/ncdr/<agency>/client.ts` + `runSync.ts` +
`scripts/gha-ncdr-<agency>-sync.mjs` + admin import route, following the `wra/` → now-removed
precedent structurally but writing to `ncdr_alerts` (or its own table), never to `news_items`.
Suggested order, easiest/most-standard-looking API first: 河川水位 (telemetry, likely simplest
JSON) → 淹水示警 → 土石流警戒 → 公路路況 (TDX OAuth adds setup friction, do last).

Each agency's sync should be independently toggle-able (env flag or per-source cron entry) so a
single flaky upstream doesn't block the others — a lesson also implicit in the WRA postmortem
(the second-writer problem happened because one source's special-case pipeline had no isolation
from the rest of ingestion).

## 6. Explicitly Deferred to Implementation Time

- Exact endpoint URLs, field names, and auth requirements for all 4 agencies (§3).
- Whether `ncdr_alerts` is one shared table or split (§4).
- UI: new tab on `/tools/weather-alerts` (「災害告警 (NCDR)」), county filter, and how it visually
  differs from the existing CWA alert list so users don't see two unrelated-looking flood
  sub-panels.
- Cron frequency per agency (NCDR upstream itself enforces a 3-second access interval per the
  Twinkle Hub tool page; a 5-minute cache/sync cadence, matching their own stated cache window, is
  the working assumption until each agency's own rate limits are confirmed).

## 7. Decision Log

- 2026-09-07 interview: user wants **all** NCDR categories eventually (not just the
  non-CWA-duplicate subset), confirmed after being offered a narrower first pass.
- 2026-09-07 interview: research for this ticket is included in this planning round; code
  implementation is explicitly deferred to a follow-up session to avoid blocking
  `SPEC-HEALTH-20260907-TWINKLE-TOOLS-A` on 4-5 unverified external agency APIs.
