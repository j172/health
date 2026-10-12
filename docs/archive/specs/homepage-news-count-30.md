# Reduce homepage news count from 54 to 30

## Context

User-requested content/layout trim, confirmed via `/grill` (2026-09-23) as purely cosmetic — explicitly **not** a stability fix. The homepage's news list is served by `listDiverseHomeNews(limit, maxPerSource, candidatePoolSize)`, a pure MySQL query (candidate pool fetched via `listLatestNews`, diversity filter applied in memory) — it makes no outbound HTTP/scraping calls, so this change has no effect on ingestion memory pressure or the WASM OOM crash family being tracked separately (issues #394/#399/#401).

## Change

`app/(site)/page.tsx`: `listDiverseHomeNews(54, 3)` → `listDiverseHomeNews(30, 3)`. Only the `limit` argument changes; `maxPerSource` (3) stays as-is — confirmed via `/grill` that 30/3 (≥10 distinct sources minimum) still gives reasonable source diversity.

`candidatePoolSize` (default 120, not passed explicitly) is untouched.

## Verification
- `npx tsc --noEmit` — clean.
- `npx eslint app/(site)/page.tsx` — clean.
- `npm test` — 375/375 passed.
