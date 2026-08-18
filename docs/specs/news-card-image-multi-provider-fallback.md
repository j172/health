# Feature Specification: Multi-Provider Image Fallback Chain with Escalating Backoff

## Overview

Follow-up to [news-card-image-freshness-scheduling.md](news-card-image-freshness-scheduling.md)
(issue #29 / PR #31). That work correctly decoupled Pixabay assignment into
its own 10-minute in-app cron job — but in production it surfaced a problem
the original spec didn't anticipate: **Pixabay's CDN actively rate-limits
(HTTP 429) sustained automated download traffic**, and once triggered, the
429s persist well beyond a single 60-second window — confirmed live
2026-08-18 via `logs/news-card-images-cron.log`, where the large majority of
10-minute ticks return `rateLimited: true` and even same-day articles
(`image_backfill_attempts = 0`, top of the priority queue) stay imageless
for hours.

**Likely trigger:** a one-time manual bulk catch-up run on 2026-08-17 (~60
rounds × 50 items ≈ 3,000 rapid requests) almost certainly crossed Pixabay's
documented policy line — "Systematic mass downloads are not allowed" (see
[Pixabay API docs](https://pixabay.com/api/docs/)) — and triggered an
extended account-level throttle well beyond their documented 100
requests/60s API rate limit. **Lesson: never run a rapid bulk/burst backfill
against any of these providers again** — rely only on the backoff-aware
steady-state cadence below, even for backlog catch-up.

## Goal

Make card-image backfill resilient to any single provider being rate-limited
(temporarily or for an extended period) by falling through to alternate free
stock-photo providers, with a persistent, escalating backoff so a throttled
provider isn't hammered every cron tick.

## 1. Provider chain: Pixabay → Pexels → Unsplash

For each missing-image article, try providers in this fixed order, **skipping
any provider currently in cooldown** (see §2):

1. **Pixabay** (existing, `lib/server/pixabay/`) — unchanged search/download
   logic.
2. **Pexels** (new) — API key already present in `.env` as `PEXELS_API_KEY`.
   Docs: https://www.pexels.com/api/documentation/. Rate limit: 200
   req/hour, 20,000/month (default tier — comfortably above what this
   feature needs).
3. **Unsplash** (new) — keys already present in `.env`
   (`UNSPLASH_ACCESS_KEY`, `UNSPLASH_SECRET_KEY`, `UNSPLASH_APPLICATION_ID`).
   Docs: https://unsplash.com/documentation. Rate limit: demo tier 50
   req/hour (no need to apply for the 5,000/hour production tier — this
   fallback tier will rarely be reached). **Unsplash's API Guidelines
   require visible attribution whenever a photo is displayed** (photographer
   name + link, per §3) — this is a hard ToS requirement, not optional like
   the other two providers.

Structure this as a small provider-abstraction so `cardImages.ts`'s
orchestration loop doesn't need per-provider branching logic:

```ts
interface ImageProvider {
  name: "pixabay" | "pexels" | "unsplash";
  search(term: string, page: number): Promise<{ candidates: ProviderImage[]; totalHits: number }>;
  download(candidate: ProviderImage): Promise<DownloadedImage>; // throws RateLimitError on HTTP 429
}
```

- New modules: `lib/server/pexels/client.ts`, `lib/server/pexels/download.ts`,
  `lib/server/unsplash/client.ts`, `lib/server/unsplash/download.ts` —
  mirror the existing `lib/server/pixabay/{client,download}.ts` shape
  (search caching via a per-provider cache table or a shared
  `provider_api_cache` table generalized from today's `pixabay_api_cache`;
  same download/validate/save-to-`public/images/news/{provider}/` pattern;
  same `RateLimitError` class per provider, thrown on HTTP 429).
- `assignMissingNewsCardImages` in `lib/server/news/cardImages.ts` becomes
  provider-agnostic: for each candidate term, try each non-cooling-down
  provider in order until one succeeds or all are exhausted/cooling down for
  this run.
- Unsplash's API Guidelines also expect a `GET` ping to the photo's
  `download_location` endpoint when a photo is used (not just fetching
  `urls.regular`) — do this once per successful Unsplash download, matching
  their documented "trigger download" step.

## 2. DB-backed escalating backoff per provider

New table (add to `TABLE_DDL` in `lib/server/db/schema.ts`):

```sql
CREATE TABLE IF NOT EXISTS image_provider_cooldown (
  provider VARCHAR(20) NOT NULL,
  consecutive_rate_limits INT UNSIGNED NOT NULL DEFAULT 0,
  cooldown_until DATETIME NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Rows are seeded/upserted lazily (`INSERT ... ON DUPLICATE KEY UPDATE`) the
first time each provider is used — no need to pre-seed all three.

**Escalation schedule** (exact values, confirmed):

| Consecutive 429s (this escalation cycle) | Cooldown duration |
|---|---|
| 3rd | 10 minutes |
| next (4th within the same still-escalating run) | 30 minutes |
| next (5th+) | 60 minutes (**cap** — never grows further) |

- A provider is "in cooldown" (skipped entirely, no request attempted) while
  `cooldown_until > NOW()`.
- Any **successful** download resets `consecutive_rate_limits` to 0 and
  clears `cooldown_until` for that provider.
- A 429 that occurs *after* a cooldown has expired continues the escalation
  from where it left off (i.e. `consecutive_rate_limits` only resets on
  success, not on cooldown expiry) — this is what makes it "escalating"
  rather than a flat retry-every-10-minutes loop.
- Rationale for DB-backed (not in-memory): this in-app cron process gets
  restarted on every deploy (several times during this same investigation
  session) — in-memory state would silently reset on each redeploy, risking
  a fresh burst right when a still-cooling-down provider gets hit again.

## 3. Attribution UI (all three providers, for consistency)

Currently **no attribution is rendered anywhere** — `contributor_name` /
`source_page_url` are stored (`news_card_images` table,
`CARD_IMAGE_SELECT_SQL` in `lib/server/news/queries.ts`) but never surfaced
in any component. This is optional for Pixabay/Pexels but a **hard
requirement for Unsplash's API Guidelines**, so all three get it for
consistency (per decision — no special-casing).

- Scope: the article detail page's hero image only
  ([app/news/[id]/page.tsx](../../app/news/[id]/page.tsx) →
  [components/News/HeroImage.tsx](../../components/News/HeroImage.tsx)),
  **not** the list/search card thumbnails (`CardThumb.tsx`) — those are too
  small for a readable credit line and attribution requirements are
  satisfied by the detail page being the canonical display of the photo.
- `HeroImage.tsx` already has an unused `<figcaption>` slot rendering a
  plain-text `caption` prop — extend this (or add a sibling prop) to render
  a real link: "Photo by {contributor_name} on {Pixabay|Pexels|Unsplash}"
  linking to `source_page_url`, opened `target="_blank" rel="noopener"`.
- `resolveHeroImage` in `lib/server/news/heroImage.ts` currently hardcodes
  `caption: null` for the Pixabay branch — wire through
  `card_image_contributor` / `card_image_source_page_url` /
  `card_image_source` (already selected by `CARD_IMAGE_SELECT_SQL`, just
  not passed through this function) so the caption can be built for
  whichever provider actually supplied the image.

## 4. Schema migration for `news_card_images` (non-destructive)

Current schema is Pixabay-specific (`pixabay_id BIGINT NOT NULL UNIQUE`).
Extend via the existing `ADD COLUMN IF NOT EXISTS` migration pattern in
`lib/server/db/mysql.ts` (see the `news_items`/`facilities` migrations
already there):

```sql
ALTER TABLE news_card_images
  ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'pixabay' AFTER news_item_id,
  ADD COLUMN IF NOT EXISTS provider_image_id VARCHAR(64) NULL AFTER provider;
-- one-time backfill for existing rows:
UPDATE news_card_images SET provider_image_id = pixabay_id WHERE provider_image_id IS NULL;
ALTER TABLE news_card_images
  ADD UNIQUE KEY IF NOT EXISTS uq_card_image_provider_image (provider, provider_image_id);
```

- Keep the legacy `pixabay_id` column as-is (do not drop/rename) — avoids
  touching a `NOT NULL UNIQUE` column with existing production data during
  this change. New rows from any provider populate both `provider` +
  `provider_image_id`; only Pixabay rows also populate legacy `pixabay_id`
  (new Pexels/Unsplash rows can leave it at a sentinel or make it nullable —
  implementer's call, check whether `NOT NULL` blocks non-Pixabay inserts
  and fix that column's nullability too if so).
- `CARD_IMAGE_SELECT_SQL` in `lib/server/news/queries.ts` (the `CASE WHEN...
  THEN 'rss' WHEN c.local_path IS NOT NULL THEN 'pixabay'` logic) should be
  updated to surface the real `provider` value instead of hardcoding
  `'pixabay'`.

## Out of scope

- **Mixkit.co / video card images**: investigated — Mixkit has **no public
  API** for programmatic search/download (confirmed via their docs and
  license pages, 2026-08-18). Scraping their site is not a good path
  (fragile, likely against their ToS). File a separate follow-up issue
  noting that a workable approach would instead be manual curation (a small
  fixed pool of pre-selected, pre-downloaded generic health-themed video
  clips, picked at random per article) rather than dynamic search — a
  product-design question deserving its own `/grilling` session, not
  bundled into this fix.
- Re-running a bulk/burst catch-up against any provider — explicitly
  rejected as the likely cause of the current incident (see Overview). Let
  the backoff-aware steady-state cron catch up gradually instead, however
  long that takes.

## Verification & compliance

- `npx tsc --noEmit` — 0 errors.
- `npm run build` — 0 build errors.
- `npm run lint` — 0 errors.
- Manual: confirm `image_provider_cooldown` rows populate correctly when a
  provider is deliberately rate-limited (or simulate by checking behavior
  against current live Pixabay 429s post-deploy).
- Manual: confirm a Pexels- or Unsplash-sourced image round-trips
  end-to-end (search → download → DB row → renders on a news card and, for
  the detail page, with correct attribution link).
