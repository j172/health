# Feature Specification: News Card Image Freshness Scheduling

## Overview

News list/detail cards fall back to the site logo placeholder ([CardThumb.tsx](../../components/News/CardThumb.tsx))
whenever a news item has no `card_image_url`. That URL is filled in by two
separate backfill jobs, and both are currently under-scheduled relative to
RSS ingestion volume:

1. **Pixabay auto-assignment** (`assignMissingNewsCardImages`,
   [lib/server/news/cardImages.ts](../../lib/server/news/cardImages.ts)) —
   called inline from `runIngestion.ts` on every `rss-sync` tick (every 30
   min via the in-app cron scheduler, see
   [in-app-cron-scheduler.md](in-app-cron-scheduler.md)), capped at
   `limit=10` per call.
2. **Real-article OG image backfill** (for publishers that 403 the shared
   host's IP, e.g. ltn.com.tw) —
   [scripts/gha-og-external-backfill.mjs](../../scripts/gha-og-external-backfill.mjs),
   currently only invoked as a step inside `.github/workflows/deploy-ftps.yml`,
   i.e. **only runs at deploy time**, with no independent schedule.

Neither job's cadence is tied to how fast new articles actually need images,
so coverage gaps accumulate: the `limit=10` Pixabay cap was sized around a
now-stale `curl --max-time 280` budget from the pre-in-app-cron era (see
comment at `runIngestion.ts` around the `assignMissingNewsCardImages(10)`
call), and OG backfill silently stalls between deploys.

## Goal

A new news item should have a card image (real or Pixabay) assigned within
roughly **one hour** of ingestion, independent of deploy cadence.

## 1. Decouple Pixabay assignment into its own in-app cron job

- Remove the inline `assignMissingNewsCardImages(10)` call from
  `runIngestion.ts` (around line 363) — it no longer needs to piggyback on
  `rss-sync` now that the historical `--max-time 280` constraint doesn't
  apply (in-app cron has no external curl timeout), but coupling it to
  `rss-sync` still risks lengthening that job and tripping its overlap
  guard.
- Register a new job in `lib/server/cron/registerJobs.ts` (alongside the
  four existing jobs from [in-app-cron-scheduler.md](in-app-cron-scheduler.md)):
  - Schedule: every 10 minutes (`*/10 * * * *`).
  - Calls `assignMissingNewsCardImages(15)` directly (no HTTP hop, matching
    the pattern of the other in-app jobs).
  - Own overlap guard (in-memory running flag), own log file
    (`news-card-images-cron.log` under the existing
    `/home/tw123457/health_app/logs/` convention).
  - `assignMissingNewsCardImages` already takes out a MySQL `GET_LOCK`
    (`news_card_image_assignment_lock`), so this is safe to run alongside
    any other trigger of the same function (admin API, `run-batch-backfill.mjs`)
    without double-work — no new locking needed.

## 2. Schedule OG image backfill independently of deploy

- New GitHub Actions workflow file (e.g.
  `.github/workflows/news-og-backfill.yml`) with:
  - `schedule: cron: "*/30 * * * *"` (matches `rss-sync` cadence).
  - Same job body currently embedded in `deploy-ftps.yml`'s OG-backfill step
    (same env: `NEWS_IMAGES_TRANSPORT`, `RSS_SYNC_ADMIN_SECRET`,
    `OG_BACKFILL_LIMIT=20`, `OG_BACKFILL_ROUNDS=12`, SSH transport vars).
  - Repo is public, so scheduled-workflow minutes are not a budget concern.
- Remove (or keep as a redundant safety net — TBD by implementer, removing
  is preferred to avoid double-running) the OG-backfill step from
  `deploy-ftps.yml` now that it's independently scheduled.

## 3. One-time backlog catch-up

- On the day this ships, manually trigger a large-batch run to clear any
  existing backlog rather than waiting for steady-state cadence to catch up:
  - `node scripts/run-batch-backfill.mjs` (Pixabay stage), and/or
  - a direct `POST /api/admin/news-images` call with a larger `limit`.
- This is an operational step, not code — call it out in the PR description
  as a post-merge action item.

## Out of scope

- Changing `CardThumb.tsx`'s fallback rendering itself (the logo placeholder
  is the correct behavior while an image is genuinely unassigned — this spec
  only shrinks the window during which that's true).
- Raising `MAX_API_PAGES` / Pixabay search-pool tuning — unrelated to
  scheduling cadence.

## Verification & compliance

- `npx tsc --noEmit` — 0 errors.
- `npm run build` — 0 build errors.
- `npm run lint` — 0 errors.
- Manual: confirm the new in-app cron job's log file receives entries every
  ~10 minutes post-deploy.
- Manual: confirm the new GHA workflow appears in the Actions tab and fires
  on its schedule (or trigger via `workflow_dispatch` for an immediate
  smoke test).
