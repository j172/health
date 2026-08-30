/**
 * Ingestion freshness gate (issue #92 / SPEC-HEALTH-20260831-FRESHNESS-GATE).
 *
 * The pipeline had no notion of how old an item is, and no source was required
 * to supply one. 18 of the 48 feeds are Google `site:` search — a site index,
 * not a news feed — so `site:ntuh.gov.tw` returns the hospital homepage, a
 * 掛號服務 page and an equipment booking system with pubDates spanning 2007 to
 * 2026. Those are well-formed pages that simply are not news, so no
 * title/length heuristic can catch them; their age is the only signal that
 * separates them from the real articles on the same feed.
 *
 * The rule is deliberately blunt: an item older than the window is not
 * ingested. It is enforced at ingestion rather than at read time because the
 * cost being avoided is not a bad card, it is the work: every item that
 * survives triggers a detail-page fetch, an og:image download and an AI SEO
 * call. That per-item load is what this host cannot afford (see the 2026-08-29
 * outage), so the gate has to sit upstream of it, not in the SQL that renders
 * a page.
 *
 * Pure module by design — no `server-only`, no db, no network — so
 * `freshness.test.mjs` can exercise it without stubbing the app graph.
 */

/** Items older than this many days are not ingested. */
export const FRESHNESS_WINDOW_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How far ahead of "now" a publish date may sit before it is treated as
 * fabricated rather than merely fresh.
 *
 * Not zero: feeds routinely hand out timestamps a few hours ahead of UTC,
 * either because the publisher stamps local time without an offset or because
 * their clock drifts. Rejecting those would drop genuinely brand-new articles,
 * which is the opposite of the point. Six hours clears Taiwan's +08:00 offset
 * being mistakenly read as UTC, and is nowhere near the days-to-months by which
 * a real event date leaking out of a title overshoots.
 */
export const FUTURE_TOLERANCE_MS = 6 * 60 * 60 * 1000;

export type FreshnessReason = "fresh" | "too-old" | "future-dated";

export interface FreshnessInput {
  publishedAtUtc?: Date | null;
  /**
   * `news_items.first_seen_at_utc`. Omit (or pass null) for an item that is not
   * in the table yet — the column is NOT NULL and `persistItems` writes `now`
   * on insert, so "not stored yet" and "first seen now" are the same thing.
   */
  firstSeenAtUtc?: Date | null;
}

export interface FreshnessVerdict {
  fresh: boolean;
  reason: FreshnessReason;
  /** Age in days of `effectiveDate`. Negative for a future-dated item. */
  ageDays: number;
  /** The date the verdict was judged on: COALESCE(published, first-seen, now). */
  effectiveDate: Date;
}

const usableDate = (value: Date | null | undefined): Date | null =>
  value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;

/**
 * Judge an item's age on `COALESCE(publishedAtUtc, firstSeenAtUtc)`, the same
 * expression the read path sorts and displays on.
 *
 * The coalesce is what lets the gate work for the eight fetchers that hardcode
 * `publishedAtUtc: null` without fixing them first: a newly ingested item's
 * first-seen is `now`, so it passes, while a row that has been sitting in the
 * table for a year reads as a year old.
 *
 * A future date is rejected *as a future date* rather than sailing through as
 * "very fresh". A naive `now - published > window` test scores a date a year
 * ahead as -365 days old and lets it straight in — which is exactly how
 * /news/876055, a course announcement whose title carried its event date, ended
 * up pinned to the top of a newest-first list.
 */
export const evaluateFreshness = (
  item: FreshnessInput,
  now: Date = new Date(),
  windowDays: number = FRESHNESS_WINDOW_DAYS,
): FreshnessVerdict => {
  const effectiveDate =
    usableDate(item.publishedAtUtc) ?? usableDate(item.firstSeenAtUtc) ?? now;
  const ageMs = now.getTime() - effectiveDate.getTime();
  const ageDays = ageMs / DAY_MS;

  if (ageMs < -FUTURE_TOLERANCE_MS) {
    return { fresh: false, reason: "future-dated", ageDays, effectiveDate };
  }
  if (ageMs > windowDays * DAY_MS) {
    return { fresh: false, reason: "too-old", ageDays, effectiveDate };
  }
  return { fresh: true, reason: "fresh", ageDays, effectiveDate };
};

export const isFresh = (item: FreshnessInput, now?: Date): boolean =>
  evaluateFreshness(item, now).fresh;

export interface FreshnessPartition<T> {
  fresh: T[];
  rejected: Array<{ item: T; verdict: FreshnessVerdict }>;
}

/**
 * Split a feed's items into the ones worth the enrichment work and the ones
 * that are not. Both halves are returned so the caller can report the cost of a
 * feed rather than silently swallowing the discards — the reason the dead
 * `site:` feeds went unnoticed for so long is that nothing counted them.
 */
export const partitionByFreshness = <T extends FreshnessInput>(
  items: T[],
  now: Date = new Date(),
): FreshnessPartition<T> => {
  const fresh: T[] = [];
  const rejected: Array<{ item: T; verdict: FreshnessVerdict }> = [];
  for (const item of items) {
    const verdict = evaluateFreshness(item, now);
    if (verdict.fresh) fresh.push(item);
    else rejected.push({ item, verdict });
  }
  return { fresh, rejected };
};
