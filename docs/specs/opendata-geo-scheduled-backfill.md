# Spec & Ticket: Commit and Schedule the Open Data Geo Backfill

- **Ticket ID**: `SPEC-HEALTH-20260907-OPENDATA-GEO-SCHEDULE`
- **Priority**: MEDIUM (P2)
- **Affects**: `scripts/backfill-facilities-from-opendata-geo.mjs`,
  `scripts/backfill-nfcc-accessible-atm.mjs`,
  `scripts/backfill-child-safety-spots-geo.mjs`, `agent/skills/tw-opendata-geo/`,
  `package.json`, a new `.github/workflows/opendata-geo-backfill.yml`

---

## 1. Background — already run once, never committed

A prior session ran three coordinate-backfill scripts directly against
production (`POST /api/admin/facilities-import`) using pre-geocoded Taiwan
open-data GeoJSON datasets (MOE kindergarten roster, NHI hospital/pharmacy
registries, g0v/Kiang community GIS mirrors) as the coordinate source,
matched by NHI institution code or normalized name+address. The scripts
themselves were never committed — they sat as untracked files.

**Verified independently against production before writing this spec** (not
taken on the prior session's word):

```
child_safety_spot   claimed 52.7% (98/186)     measured 52.7% (98/186)
clinic              claimed total 25,149        API total field: 25,149
kindergarten        claimed 100% coverage       sampled 200/200 geocoded
```

The migration genuinely happened. What's missing is making it a durable,
repeatable capability instead of a one-off untracked action.

## 2. Decision: standalone scheduled scripts, not inline-import integration

Two shapes were considered:

- **(chosen) Standalone periodic scripts**, matching this repo's existing
  convention (`scripts/import-*.mjs`, `scripts/geocode-all-facilities.mjs`):
  full re-download of the source dataset + full re-submit through the
  existing idempotent `ON DUPLICATE KEY UPDATE lat = COALESCE(VALUES(lat), lat)`
  upsert. Re-running after a new facility has been ingested by its own
  source-specific importer picks it up automatically, because a fresh
  dataset download always contains it.
- **(rejected, this round) Inline integration** into each source's own
  import script (`import-moe-kindergartens.mjs` etc.), so a newly-scraped
  facility gets its coordinate on the very same ingestion run. Larger,
  riskier change touching three already-live importers; deferred.

The standalone shape is lower-risk and sufficient: government directories
(MOE, NHI) do not publish daily, so "immediately" in practice means "within
one scheduled run," not "within the same request."

## 3. What ships

### 3.1 Commit the three scripts and the skill, as-is

No behavior change to the scripts themselves. They already:
- read `ADMIN_SECRET`/`RSS_SYNC_ADMIN_SECRET` from the environment, never
  hardcoded or printed
- reuse the existing shared `scripts/lib/mohw-csv.mjs` helper (`parseCsv`,
  `submitFacilities`), already tracked
- submit through the same authenticated admin endpoint every other importer
  in this repo uses

`agent/skills/tw-opendata-geo/SKILL.md` is a reference document (which open
datasets exist, how to query them via the Twinkle Hub MCP tool), not
executable code — committed for the same reason any other skill doc in this
repo is: so the next person doesn't have to rediscover the dataset sources
from scratch.

### 3.2 `package.json` — keep the existing entry, add two more

`"backfill:opendata-geo"` is already staged (uncommitted) pointing at the
facilities script. Add matching entries for the other two scripts, mirroring
the naming of every other `backfill:*`/`import:*` script.

### 3.3 A new scheduled workflow, offset from the existing geocode batch

`facilities-geocode-batch.yml` already runs every 10 minutes over an SSH
loopback into the shared host — that budget is not available for more load,
and this work doesn't need it anyway: all three backfill scripts talk to
`health.j172.tw`'s public HTTPS admin API directly, never touching the host
over SSH. Running them from a GitHub Actions runner costs the shared host
nothing beyond normal HTTP request handling.

**Monthly**, not more often — the source datasets (MOE/NHI directories)
update at most monthly, so a tighter schedule would spend budget re-fetching
unchanged data. Mirrors the existing `six-monthly-sync.yml` precedent for
"this open dataset doesn't change often."

**Explicitly offset from other schedules**, for one reason that must be
stated rather than assumed away: `backfill-child-safety-spots-geo.mjs` calls
OpenStreetMap's public Nominatim endpoint directly (1.1s between calls, ~186
rows worst case), which is a **separate, uncoordinated consumer** of the same
public service the app's own facilities-geocode-batch draws from via
`lib/server/facilities/geocodeProviders.ts` / `geocodeBudget.ts`. This script
does not share that budget file. Running both at the same wall-clock time
would not break anything technically (different processes, different
targets) but does add to Nominatim's total request rate from this
infrastructure's IPs at once. Schedule this workflow at a time distinct from
the geocode batch's active windows.

## 4. Explicit Non-Goals

- Do not integrate coordinate matching into the three source importers
  (`import-moe-kindergartens.mjs` et al.) — deferred, per §2.
- Do not change `lib/server/facilities/geocodeBudget.ts` or any shared
  geocoding budget/circuit-breaker logic.
- Do not re-run the scripts against production as part of this ticket — the
  migration already happened once; committing and scheduling is the scope.
- Do not modify the admin API (`/api/admin/facilities-import`) or its
  `ON DUPLICATE KEY UPDATE` semantics.

## 5. Verification

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass
  (these are plain Node scripts outside the Next.js build graph — confirm
  they don't break typecheck/lint/build by their mere presence, and are not
  silently expected to be exercised by the test suite).
- The new GHA workflow's YAML is valid and mirrors the secret-handling
  pattern of `facilities-geocode-batch.yml` (`RSS_SYNC_ADMIN_SECRET` from
  repository secrets, never printed).
- State the chosen cron schedule and the reasoning for its offset from
  `facilities-geocode-batch.yml`'s `*/10 * * * *`.
- Do not trigger the new workflow as part of this PR's verification — the
  data is already correct in production from the prior manual run; the
  first real scheduled run will be the first automated verification of the
  workflow itself.
