# Recent News Image Backfill

## Problem

The card-image pipeline now supports Pixabay → Pexels → Unsplash with
provider-specific, database-backed 429 cooldowns. A previous manual bulk
backfill nevertheless showed that unbounded loops can exhaust provider pools
and trigger extended throttling. We need a deliberately constrained operator
tool for improving the images visitors see on newly-ingested articles, without
touching the historical backlog.

## Goal

Provide a safe, auditable manual backfill mode that can only target missing
card images created in the last N hours. The first approved use is
`newerThanHours: 24`.

## API contract

Extend `POST /api/admin/news-images` with an optional
`newerThanHours: number`.

- Accept only finite, whole numbers in the inclusive range 1–168.
- When supplied, the selection query must include:

  ```sql
  n.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)
  ```

- The restriction applies before ordering and limiting, so the endpoint can
  never fall through to historical backlog rows.
- Existing callers that omit the field retain current behaviour.
- Return the applied value in the JSON response for auditability.

The underlying card-image assignment function receives the optional boundary
instead of duplicating provider/cooldown logic in the route.

## Controlled batch runner

Add a script or documented operator command that invokes the admin endpoint
with:

- `newerThanHours: 24`
- `limit: 5`
- six rounds maximum
- ten minutes between successful or lock-skipped rounds

It must never call `clearCache`, `clearCardImages`, or `--reassign`.

## Stop conditions

- Provider HTTP 429 is non-fatal: existing DB-backed provider cooldown and
  Pixabay → Pexels → Unsplash fallback remain in control.
- If a round reports that another assignment owns the DB lock, wait for the
  normal ten-minute interval and continue within the six-round cap.
- Stop immediately after two consecutive transport failures, HTTP 5xx
  responses, invalid JSON responses, or otherwise unexpected API responses.
- Stop after the sixth round even when eligible missing items remain. Do not
  silently begin another hour.

The final output must report total assigned, failed, skipped/locked rounds,
provider-rate-limit reasons, and whether the hourly cap or a stop condition
ended the run.

## Deployment gate

Do not run the controlled batch until the current image-provider deployment is
verified on the production host through SSH:

1. Check `.apply-prebuilt.log`, current BUILD_ID and PM2 health because the
   GitHub Actions public status poll can be intercepted by Cloudflare.
2. Make one bounded `limit: 1, newerThanHours: 24` test request.
3. Confirm a Pexels or Unsplash image is successfully written and represented
   in the API summary before starting the six-round batch.

The workflow's status verification should be made SSH-based in a separate
operational follow-up, rather than retrying Cloudflare-challenged public polls.

## Non-goals

- Clearing or reassigning existing card images.
- Processing historical backlog.
- Any unlimited, rapid, or provider-burst backfill.
- Changing normal cron cadence or provider cooldown policy.
