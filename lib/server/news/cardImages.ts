import "server-only";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { getMysqlPool, ensureSchema, utcNowSql } from "@/lib/server/db/mysql";
import {
  deriveJiebaSearchTerm,
  deriveDictionaryTerm,
  deriveFallbackTerm,
  FALLBACK_TERMS,
} from "@/lib/server/news/imageSearchTerms";
import {
  IMAGE_PROVIDERS,
  ProviderRateLimitError,
  SEARCH_RESULTS_PER_PAGE,
  type ImageProvider,
  type ProviderImage,
  type DownloadedProviderImage,
} from "@/lib/server/news/imageProviders";
import {
  loadProviderCooldownState,
  isProviderCoolingDown,
  recordProviderRateLimit,
  recordProviderSuccess,
} from "@/lib/server/news/providerCooldown";

import { assignStaticMapImage } from "@/lib/server/news/staticMap";
import {
  classifyLocationPrecision,
  extractLocationFromText,
} from "@/lib/server/news/geoExtractor";

const LOCK_NAME = "news_card_image_assignment_lock";
const MAX_API_PAGES = 16;
const MAX_CANDIDATE_ATTEMPTS_PER_NEWS = 5;
/** How many recent card-image assignments to consider when de-duplicating provider images. */
const USED_IMAGE_LOOKBACK = 20_000;

interface MissingNewsRow extends RowDataPacket {
  id: number;
  title: string;
  lat: number | null;
  lng: number | null;
  location_name: string | null;
  facility_id: number | null;
  description_text: string | null;
  detail_text: string | null;
}

interface UsedProviderImageRow extends RowDataPacket {
  provider: string;
  provider_image_id: string;
}

/**
 * Deletes cached provider search results (Pixabay's own pixabay_api_cache
 * plus the shared provider_api_cache used by Pexels/Unsplash — see
 * lib/server/news/imageProviders.ts). Cached candidate image URLs are
 * signed/temporary and can expire well within the 24h cache TTL, at which
 * point every download attempt fails "content failed validation" (the
 * response is an expired-link page, not image bytes) even though the
 * provider itself and our download code are both fine — evidenced by the
 * same request succeeding immediately when re-fetched fresh.
 */
export const clearImageProviderApiCaches = async (): Promise<number> => {
  const pool = getMysqlPool();
  const [pixabayResult] = await pool.query<ResultSetHeader>(
    "DELETE FROM pixabay_api_cache",
  );
  const [providerResult] = await pool.query<ResultSetHeader>(
    "DELETE FROM provider_api_cache",
  );
  return pixabayResult.affectedRows + providerResult.affectedRows;
};

/** Clears existing news card images so articles can be re-matched with expanded Jieba title terms. */
export const clearAllNewsCardImages = async (): Promise<number> => {
  const pool = getMysqlPool();
  const [result] = await pool.query<ResultSetHeader>(
    "DELETE FROM news_card_images",
  );
  return result.affectedRows;
};

export interface CardImageAssignmentSummary {
  assigned: number;
  skipped: number;
  failed: number;
  locked: boolean;
  rateLimited: boolean;
  reason: string | null;
  errors: string[];
  /** Recency boundary actually applied, echoed back for auditability. */
  newerThanHours?: number | null;
}

const shuffled = <T>(values: T[]): T[] => {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

/** Unused candidates for a single (provider, term) pair, paginating until enough are found or the pool is exhausted. */
const loadCandidatesForProviderTerm = async (
  conn: PoolConnection,
  provider: ImageProvider,
  term: string,
  usedIds: Set<string>,
  needed: number,
): Promise<ProviderImage[]> => {
  const candidates: ProviderImage[] = [];
  const targetCandidateCount = Math.max(10, needed * 3);
  for (let page = 1; page <= MAX_API_PAGES; page += 1) {
    const result = await provider.search(conn, term, page);
    candidates.push(...result.candidates.filter((hit) => !usedIds.has(hit.id)));
    if (
      candidates.length >= targetCandidateCount ||
      page * SEARCH_RESULTS_PER_PAGE >= Math.min(result.totalHits, 500)
    )
      break;
  }
  return shuffled(candidates);
};

/**
 * Narrows assignment to articles created within the last N hours.
 *
 * docs/specs/recent-news-image-backfill.md: an operator tool for improving
 * images on newly-ingested articles "without touching the historical backlog".
 * Accepts only finite whole numbers in the inclusive range 1-168; anything else
 * is treated as absent.
 */
export const normalizeNewerThanHours = (value: unknown): number | null => {
  const hours = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(hours) || !Number.isInteger(hours)) return null;
  if (hours < 1 || hours > 168) return null;
  return hours;
};

export const assignMissingNewsCardImages = async (
  requestedLimit = 10,
  requestedNewerThanHours: number | null = null,
): Promise<CardImageAssignmentSummary> => {
  const limit = Math.min(50, Math.max(1, Math.trunc(requestedLimit)));
  const newerThanHours = normalizeNewerThanHours(requestedNewerThanHours);
  const summary: CardImageAssignmentSummary = {
    assigned: 0,
    skipped: 0,
    failed: 0,
    locked: false,
    rateLimited: false,
    reason: null,
    errors: [],
    newerThanHours,
  };

  await ensureSchema();
  const conn = await getMysqlPool().getConnection();
  let gotLock = false;

  try {
    const [lockRows] = await conn.query<RowDataPacket[]>(
      "SELECT GET_LOCK(?, 1) AS ok",
      [LOCK_NAME],
    );
    gotLock = lockRows[0]?.ok === 1;
    if (!gotLock) {
      summary.locked = true;
      summary.reason = "Another card image assignment is running.";
      return summary;
    }

    // The recency restriction is part of the WHERE clause, so it applies before
    // ORDER BY and LIMIT — the endpoint can never fall through to backlog rows.
    const [missingRows] = await conn.execute<MissingNewsRow[]>(
      `
      SELECT n.id, n.title, n.lat, n.lng, n.location_name, n.facility_id, n.description_text, n.detail_text
      FROM news_items n
      LEFT JOIN news_card_images c ON c.news_item_id = n.id
      WHERE c.news_item_id IS NULL
        ${newerThanHours === null ? "" : "AND n.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)"}
      ORDER BY n.image_backfill_attempts ASC, COALESCE(n.published_at_utc, n.created_at) DESC, n.id DESC
      LIMIT ?
      `,
      newerThanHours === null ? [limit] : [newerThanHours, limit],
    );

    if (missingRows.length === 0) {
      summary.reason =
        newerThanHours === null
          ? "No news items are missing card images."
          : `No news items created in the last ${newerThanHours}h are missing card images.`;
      return summary;
    }

    const configuredProviders = IMAGE_PROVIDERS.filter((provider) =>
      provider.isConfigured(),
    );
    if (configuredProviders.length === 0) {
      summary.skipped = missingRows.length;
      summary.reason =
        "No image provider API keys are configured (PIXABAY_API_KEY / PEXELS_API_KEY / UNSPLASH_ACCESS_KEY).";
      return summary;
    }

    // Bounded on purpose. This set exists to stop the same provider image being
    // assigned to two articles, and that only matters against images a reader could
    // still see side by side — but an unbounded SELECT grows with the table forever
    // and every id lands in a resident Set under a ~768MB heap cap. The most recent
    // USED_IMAGE_LOOKBACK rows cover the visible window; reusing an image older than
    // that is not a defect worth paying unbounded memory for.
    const [usedRows] = await conn.query<UsedProviderImageRow[]>(
      `SELECT provider, provider_image_id
       FROM news_card_images
       WHERE provider_image_id IS NOT NULL
       ORDER BY id DESC
       LIMIT ?`,
      [USED_IMAGE_LOOKBACK],
    );
    const usedIdsByProvider = new Map<string, Set<string>>();
    for (const row of usedRows) {
      const set = usedIdsByProvider.get(row.provider) ?? new Set<string>();
      set.add(String(row.provider_image_id));
      usedIdsByProvider.set(row.provider, set);
    }

    // Snapshot of each provider's escalating-backoff state for the duration
    // of this call — see lib/server/news/providerCooldown.ts. Updated live
    // as 429s/successes happen below, so a provider that starts cooling
    // down partway through this batch is correctly skipped for the rest of
    // it (no need to re-query the DB per item).
    const cooldownState = await loadProviderCooldownState(conn);
    const rateLimitedProviders = new Set<string>();
    let anyCandidatesSeen = false;

    // Tries to assign one candidate from `provider`'s pool for `term` to
    // `news`. Returns "assigned" (incl. an insert-race loss — another
    // process already filled it), "rate_limited" (this provider just hit a
    // 429 and has now been recorded into cooldownState), "cooling_down"
    // (skipped entirely — no request attempted, still cooling down from an
    // earlier hit), or "exhausted" (no usable candidate from this provider
    // for this term). Unlike the single-provider version this replaces, a
    // "rate_limited" outcome no longer aborts the whole batch — the caller
    // just moves on to the next provider in the fallback chain, which is
    // the entire point of having one.
    const tryAssignWithProviderTerm = async (
      news: MissingNewsRow,
      term: string,
      provider: ImageProvider,
    ): Promise<"assigned" | "rate_limited" | "cooling_down" | "exhausted"> => {
      if (isProviderCoolingDown(cooldownState, provider.name, new Date()))
        return "cooling_down";

      const usedIds = usedIdsByProvider.get(provider.name) ?? new Set<string>();
      usedIdsByProvider.set(provider.name, usedIds);

      let candidates: ProviderImage[];
      try {
        candidates = await loadCandidatesForProviderTerm(
          conn,
          provider,
          term,
          usedIds,
          1,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown image search error";
        if (summary.errors.length < 10)
          summary.errors.push(
            `news ${news.id} [${provider.name} search]: ${message}`,
          );
        return "exhausted";
      }
      if (candidates.length > 0) anyCandidatesSeen = true;

      let attempts = 0;
      for (const candidate of candidates) {
        if (attempts >= MAX_CANDIDATE_ATTEMPTS_PER_NEWS) break;
        if (usedIds.has(candidate.id)) continue;
        attempts += 1;

        let downloaded: DownloadedProviderImage | null = null;
        try {
          downloaded = await provider.download(candidate);
          const now = utcNowSql();
          const [insertResult] = await conn.execute<ResultSetHeader>(
            `
            INSERT IGNORE INTO news_card_images (
              news_item_id, provider, provider_image_id, pixabay_id, local_path, source_page_url,
              contributor_name, content_sha256, width, height, created_at, updated_at
            )
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE NOT EXISTS (
              SELECT 1 FROM news_card_images c WHERE c.news_item_id = ?
            )
            `,
            [
              news.id,
              candidate.provider,
              candidate.id,
              // Legacy pixabay_id column stays populated for Pixabay rows
              // only (see docs/specs/news-card-image-multi-provider-fallback.md
              // section 4) — it's now nullable so Pexels/Unsplash rows can
              // simply omit it rather than needing a sentinel value.
              candidate.provider === "pixabay" ? Number(candidate.id) : null,
              downloaded.localPath,
              candidate.pageURL,
              candidate.contributorName,
              downloaded.contentSha256,
              downloaded.width,
              downloaded.height,
              now,
              now,
              news.id,
            ],
          );
          if (insertResult.affectedRows !== 1) {
            await provider.remove(downloaded.absolutePath);
            summary.skipped += 1;
            return "assigned";
          }
          usedIds.add(candidate.id);
          await recordProviderSuccess(conn, cooldownState, provider.name);
          summary.assigned += 1;
          return "assigned";
        } catch (error) {
          if (downloaded) await provider.remove(downloaded.absolutePath);
          if (error instanceof ProviderRateLimitError) {
            rateLimitedProviders.add(provider.name);
            await recordProviderRateLimit(conn, cooldownState, provider.name);
            return "rate_limited";
          }
          const message =
            error instanceof Error
              ? error.message
              : "Unknown image assignment error";
          if (summary.errors.length < 10)
            summary.errors.push(
              `news ${news.id} [${provider.name}]: ${message}`,
            );
        }
      }
      return "exhausted";
    };

    for (const news of missingRows) {
      const jiebaTerm = deriveJiebaSearchTerm(news.title);
      // Only worth a dictionary lookup when the curated KEYWORD_TERMS table
      // didn't already match — see deriveDictionaryTerm's doc comment.
      const dictionaryTerm = jiebaTerm
        ? null
        : await deriveDictionaryTerm(news.title);
      const fallbackTerm = deriveFallbackTerm(news.id);

      const termsToTry: string[] = [];
      if (jiebaTerm) {
        termsToTry.push(jiebaTerm);
      }
      if (dictionaryTerm && !termsToTry.includes(dictionaryTerm)) {
        termsToTry.push(dictionaryTerm);
      }
      termsToTry.push(fallbackTerm);
      for (const term of FALLBACK_TERMS) {
        if (!termsToTry.includes(term)) {
          termsToTry.push(term);
        }
      }

      let assignedThisNews = false;
      termLoop: for (const term of termsToTry) {
        // Pixabay → Pexels → Unsplash, skipping any provider currently in
        // cooldown (see docs/specs/news-card-image-multi-provider-fallback.md
        // section 1) — one provider being rate-limited or unconfigured no
        // longer stalls articles the other two can still serve.
        for (const provider of configuredProviders) {
          const outcome = await tryAssignWithProviderTerm(news, term, provider);
          if (outcome === "assigned") {
            assignedThisNews = true;
            break termLoop;
          }
        }
      }

      if (!assignedThisNews) {
        let lat = news.lat != null ? Number(news.lat) : null;
        let lng = news.lng != null ? Number(news.lng) : null;
        let locName = news.location_name;
        let facilityId = news.facility_id != null ? Number(news.facility_id) : null;

        if (
          (lat == null || lng == null) &&
          (news.title || news.detail_text || news.description_text)
        ) {
          const extracted = await extractLocationFromText(
            news.title,
            news.detail_text || news.description_text,
          );
          if (extracted) {
            lat = extracted.lat;
            lng = extracted.lng;
            locName = extracted.locationName;
            facilityId = extracted.facilityId;
            await conn.execute(
              "UPDATE news_items SET lat = ?, lng = ?, location_name = ?, facility_id = ? WHERE id = ?",
              [lat, lng, locName, extracted.facilityId, news.id],
            );
          }
        }

        // A county-tier location is a city-hall centroid, so a static map drawn
        // from it pins the article somewhere it never happened. That is the same
        // falsehood the article-page map card now refuses to draw — putting it in
        // the cover image instead would just relocate it somewhere more prominent.
        // Better to leave the article imageless: it falls through to the
        // image_backfill_attempts bump below and can still pick up a real photo on
        // a later run, once a provider's cooldown clears or new candidates appear.
        const mapPrecision = classifyLocationPrecision(locName, facilityId);
        if (lat != null && lng != null && locName && mapPrecision !== "county") {
          try {
            const mapAssigned = await assignStaticMapImage(
              conn,
              news.id,
              lat,
              lng,
              locName,
            );
            if (mapAssigned) {
              assignedThisNews = true;
              summary.assigned += 1;
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            if (summary.errors.length < 10)
              summary.errors.push(`news ${news.id} [static_map]: ${msg}`);
          }
        }
      }

      if (!assignedThisNews) {
        summary.failed += 1;
        // Deprioritizes this article in future batches' ORDER BY (see
        // missingRows above) instead of excluding it outright — it can still
        // succeed later (e.g. once a provider adds new photos, cooldowns
        // clear, or MAX_API_PAGES reaches further), just after every
        // less-tried article gets a turn.
        await conn.execute(
          "UPDATE news_items SET image_backfill_attempts = image_backfill_attempts + 1 WHERE id = ?",
          [news.id],
        );
      }
    }

    if (rateLimitedProviders.size > 0) {
      summary.rateLimited = true;
      summary.reason = `Rate-limited this run (now cooling down per its backoff schedule): ${[...rateLimitedProviders].join(", ")}.`;
    } else if (summary.failed > 0 && !anyCandidatesSeen) {
      summary.reason =
        "No unused candidates are available from any configured provider.";
    }

    return summary;
  } finally {
    if (gotLock) {
      await conn.query("DO RELEASE_LOCK(?)", [LOCK_NAME]);
    }
    conn.release();
  }
};
