# Feature Specification: Footer Social Icons + Social-Post Draft Queue (Phase 1)

## Overview

Two independent, bundled changes:

1. Add Instagram / Facebook / Threads icon links to the site footer.
2. Add an in-app scheduled job that assembles daily social-media post *drafts*
   (caption + image, per platform) from government RSS news already in the
   database, and a simple admin page to view them. This spec is **Phase 1
   only**: it does not call any Meta/Threads API and does not publish
   anything. Actual publishing is deferred to a follow-up spec, once the
   account owner has completed Meta Business verification, App Review, and
   has a long-lived access token to hand.

## 1. Footer social icon links

- Add three icon links to [`components/News/SiteFooter.tsx`](../../components/News/SiteFooter.tsx),
  placed in the brand row next to the existing "主站 j172.tw" button
  (around line 76-85). Footer only — the Header stays as-is (just
  language/theme togglers).
- Links:
  - Instagram: `https://www.instagram.com/j172twhealths/`
  - Facebook: `https://www.facebook.com/profile.php?id=61592584239566`
  - Threads: `https://www.threads.com/@j172twhealths`
- Each link: `target="_blank" rel="noreferrer noopener"`, an `aria-label`
  naming the platform, monochrome minimal icon that adapts to dark mode.
- Icon assets: follow the existing convention in `public/images/icon/`
  (see `icon-moon.svg` / `icon-sun.svg` rendered via `next/image` in
  [`components/Header/ThemeToggler.tsx`](../../components/Header/ThemeToggler.tsx)) —
  add `icon-instagram.svg`, `icon-facebook.svg`, `icon-threads.svg` as
  single-color line-art SVGs using `currentColor` (or light/dark variant
  pairs, matching whichever existing pattern is simpler to keep consistent),
  styled with the same `text-slate-500 hover:text-indigo-600
  dark:text-slate-400 dark:hover:text-indigo-400` treatment used by
  `FooterLink`.

## 2. Social-post draft queue

### 2.1 Selection scope

Only government RSS sources, excluding administrative-announcement feeds.
From [`lib/server/config/rss-feeds.ts`](../../lib/server/config/rss-feeds.ts):

**Include** (`source_name` / `feed_code`):
- `mohw` feed code `16` (焦點新聞) only
- `cdc` (all)
- `tfda` (all)
- `hpa` (all: `hpa`, `hpa_clarify`, `hpa_rumor`, `hpa_activity`, `hpa_announcement`)
- `nhi` (all)

**Exclude**: `mohw` feed codes `17`, `18`, `101`, `2622` (administrative
announcements/clarifications/event listings — not social-friendly content).
All non-government feeds (media outlets, Google News fallbacks, etc.) are
out of scope entirely.

### 2.2 Eligibility & image requirement

A news item is eligible only if it has a corresponding row in
`news_card_images` (i.e. it already has a Pixabay-backed card image —
see [`lib/server/db/schema.ts`](../../lib/server/db/schema.ts) lines 56-78).
If the day's newest qualifying government item has no card image yet, skip
it and move to the next-newest qualifying item that does. Never wait for an
image to become available — always pick from what's already imaged today.

Additionally, skip any news item that already has an entry in
`social_post_queue` (any platform) — never re-queue the same item.

### 2.3 Daily job

- New module `lib/server/social/buildDailyDraftQueue.ts` (or similar),
  registered from `lib/server/cron/registerJobs.ts` following the existing
  pattern in that file (in-memory overlap guard, try/catch/log-append,
  matching the style already used for the rss-sync/aqi-sync/cwa-sync/
  earthquakes-sync jobs registered there).
- Runs once per day (pick a fixed time, e.g. `0 8 * * *` server-local time —
  no specific business requirement on exact hour).
- Each run: selects up to 3 eligible, not-yet-queued government news items
  (newest `published_at_utc` first). For each selected item, insert **three**
  rows into `social_post_queue` — one per platform (`facebook`, `instagram`,
  `threads`) — sharing the same `news_item_id` and card image, each with its
  own rendered caption.
- Log a JSON summary line to a new `social-post-queue-cron.log` file, same
  convention as the other cron jobs' log files under
  `/home/tw123457/health_app/logs/`.

### 2.4 Caption template

Per platform, render from: title, a short summary (from `description_text`
or `meta_description`), a source attribution (`dept_name` or the feed's
government agency name), a link back to the site's own news detail page
(`https://health.j172.tw/news/{id}`, **not** the original government URL),
and 2-3 hashtags derived from the topic/department (e.g. `#健康新聞
#{department}`).

Truncate the rendered caption to each platform's limit, preserving the link
and hashtags (trim the summary first, not the link):
- Facebook: no enforced limit
- Instagram: 2200 characters
- Threads: 500 characters

Instagram captions cannot contain a clickable link — include the URL as
plain text anyway (matches common practice; it's still useful as a visible
reference even though it won't be tappable).

### 2.5 Database

New table in [`lib/server/db/schema.ts`](../../lib/server/db/schema.ts)
`TABLE_DDL`, wired into `ensureSchema()` in
[`lib/server/db/mysql.ts`](../../lib/server/db/mysql.ts) like every other
table there:

```
CREATE TABLE IF NOT EXISTS social_post_queue (
  id BIGINT NOT NULL AUTO_INCREMENT,
  news_item_id BIGINT NOT NULL,
  platform VARCHAR(20) NOT NULL,       -- 'facebook' | 'instagram' | 'threads'
  caption TEXT NOT NULL,
  image_path VARCHAR(500) NOT NULL,    -- copied from news_card_images.local_path
  status VARCHAR(20) NOT NULL DEFAULT 'draft', -- 'draft' | 'posted' | 'failed'
  scheduled_at DATETIME NULL,
  posted_at DATETIME NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_social_queue_item_platform (news_item_id, platform),
  KEY idx_social_queue_status (status, created_at),
  CONSTRAINT fk_social_queue_news_item FOREIGN KEY (news_item_id)
    REFERENCES news_items(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

No new environment variables or secrets are required for Phase 1 (no
external API calls beyond what already exists).

### 2.6 Admin review page

- New route, e.g. `app/admin/social-queue/page.tsx`, gated the same way as
  the existing `?key=` query-param ops endpoints (reuse
  `env.rssSyncAdminSecret`, matching the convention of `/__ops/*` and the
  `x-rss-sync-admin-secret` header used by `requireAdminSecret` in
  [`lib/server/config/adminAuth.ts`](../../lib/server/config/adminAuth.ts) —
  adapt to a query-param check server-side since this is a page a human
  opens directly in a browser, not an API route called by curl/fetch).
- Lists queued rows (most recent first): news item title, platform, caption
  text, thumbnail of the image, status, created_at. Read-only — no
  publish/approve actions in this phase (there is nothing to publish to
  yet).

## 3. Out of scope (Phase 2, follow-up spec)

- Actual Meta Graph API / Threads API calls to publish `draft` rows and flip
  their `status` to `posted`/`failed`. Blocked on the account owner
  completing Meta Business verification, App Review for
  `pages_manage_posts` / `instagram_content_publish` /
  `threads_content_publish`, and producing a long-lived access token.

## 4. Verification & compliance

- `npx tsc --noEmit` — 0 errors.
- `npm run build` — 0 build errors.
- `npm run lint` — 0 errors.
- Manual: confirm the three footer icons render, link out correctly, and
  adapt to dark mode.
- Manual: confirm `ensureSchema()` creates `social_post_queue` without
  affecting existing tables.
- Manual: run the new cron job function directly (not on the real schedule)
  against local/dev data and confirm it queues at most 3 items, respects the
  exclusion list, skips items without a card image, and never re-queues an
  already-queued item.
- Manual: open `/admin/social-queue?key=...` and confirm drafts render.
