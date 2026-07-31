import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getMysqlPool, ensureSchema, utcNowSql } from "@/lib/server/db/mysql";
import { env } from "@/lib/server/config/env";
import { downloadPixabayImage, removeDownloadedImage, PixabayRateLimitError } from "@/lib/server/pixabay/download";
import { searchHealthImages, type PixabayImage, type PixabaySearchResponse } from "@/lib/server/pixabay/client";
import { deriveJiebaSearchTerm, deriveFallbackTerm, FALLBACK_TERMS } from "@/lib/server/news/imageSearchTerms";

const LOCK_NAME = "news_card_image_assignment_lock";
const CACHE_TTL_HOURS = 24;
const API_RESULTS_PER_PAGE = 30;
const MAX_API_PAGES = 3;
const MAX_CANDIDATE_ATTEMPTS_PER_NEWS = 5;

interface MissingNewsRow extends RowDataPacket {
  id: number;
  title: string;
}

interface UsedPixabayRow extends RowDataPacket {
  pixabay_id: number;
}

interface CacheRow extends RowDataPacket {
  response_json: string;
}

/**
 * Deletes cached Pixabay search results. Cached candidate image URLs are
 * signed/temporary and can expire well within the 24h cache TTL, at which
 * point every download attempt fails "content failed validation" (the
 * response is an expired-link page, not image bytes) even though Pixabay
 * itself and our download code are both fine — evidenced by the same
 * request succeeding immediately when re-fetched fresh.
 */
export const clearPixabayApiCache = async (): Promise<number> => {
  const pool = getMysqlPool();
  const [result] = await pool.query<ResultSetHeader>("DELETE FROM pixabay_api_cache");
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
}

const shuffled = <T>(values: T[]): T[] => {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const getCachedSearchPage = async (conn: PoolConnection, term: string, page: number): Promise<PixabaySearchResponse> => {
  const cacheKey = `health-horizontal-photo-safe-v2-${term}-per-${API_RESULTS_PER_PAGE}-page-${page}`;
  const [cachedRows] = await conn.execute<CacheRow[]>(
    `
    SELECT response_json
    FROM pixabay_api_cache
    WHERE cache_key = ?
      AND fetched_at_utc >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)
    LIMIT 1
    `,
    [cacheKey, CACHE_TTL_HOURS],
  );

  if (cachedRows[0]) {
    try {
      return JSON.parse(cachedRows[0].response_json) as PixabaySearchResponse;
    } catch {
      await conn.execute("DELETE FROM pixabay_api_cache WHERE cache_key = ?", [cacheKey]);
    }
  }

  const response = await searchHealthImages(term, page, API_RESULTS_PER_PAGE);
  await conn.execute(
    `
    INSERT INTO pixabay_api_cache (cache_key, response_json, fetched_at_utc)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at_utc = VALUES(fetched_at_utc)
    `,
    [cacheKey, JSON.stringify(response), utcNowSql()],
  );
  return response;
};

/** Unused candidates for a single search term, paginating until enough are found or the term's ~500-hit pool is exhausted. */
const loadCandidatesForTerm = async (conn: PoolConnection, term: string, usedIds: Set<number>, needed: number): Promise<PixabayImage[]> => {
  const candidates: PixabayImage[] = [];
  const targetCandidateCount = Math.max(10, needed * 3);
  for (let page = 1; page <= MAX_API_PAGES; page += 1) {
    const result = await getCachedSearchPage(conn, term, page);
    candidates.push(...result.hits.filter((hit) => !usedIds.has(hit.id)));
    if (candidates.length >= targetCandidateCount || page * API_RESULTS_PER_PAGE >= Math.min(result.totalHits, 500)) break;
  }
  return shuffled(candidates);
};

export const assignMissingNewsCardImages = async (requestedLimit = 10): Promise<CardImageAssignmentSummary> => {
  const limit = Math.min(50, Math.max(1, Math.trunc(requestedLimit)));
  const summary: CardImageAssignmentSummary = {
    assigned: 0,
    skipped: 0,
    failed: 0,
    locked: false,
    rateLimited: false,
    reason: null,
    errors: [],
  };

  await ensureSchema();
  const conn = await getMysqlPool().getConnection();
  let gotLock = false;

  try {
    const [lockRows] = await conn.query<RowDataPacket[]>("SELECT GET_LOCK(?, 1) AS ok", [LOCK_NAME]);
    gotLock = lockRows[0]?.ok === 1;
    if (!gotLock) {
      summary.locked = true;
      summary.reason = "Another card image assignment is running.";
      return summary;
    }

    const [missingRows] = await conn.execute<MissingNewsRow[]>(
      `
      SELECT n.id, n.title
      FROM news_items n
      LEFT JOIN news_card_images c ON c.news_item_id = n.id
      WHERE c.news_item_id IS NULL
      ORDER BY COALESCE(n.published_at_utc, n.created_at) DESC, n.id DESC
      LIMIT ?
      `,
      [limit],
    );

    if (missingRows.length === 0) {
      summary.reason = "No news items are missing card images.";
      return summary;
    }

    if (!env.pixabayApiKey) {
      summary.skipped = missingRows.length;
      summary.reason = "PIXABAY_API_KEY is not configured.";
      return summary;
    }

    const [usedRows] = await conn.query<UsedPixabayRow[]>("SELECT pixabay_id FROM news_card_images");
    const usedIds = new Set(usedRows.map((row) => Number(row.pixabay_id)));
    let fallbackIndex = 0;
    let anyCandidatesSeen = false;

    // Tries to assign one candidate from `term`'s pool to `news`. Returns
    // "assigned" (incl. "skipped" — another process already filled it),
    // "rate_limited" (caller should stop the whole batch), or "exhausted"
    // (no usable candidate for this term — caller may try a fallback term).
    const tryAssignWithTerm = async (news: MissingNewsRow, term: string): Promise<"assigned" | "rate_limited" | "exhausted"> => {
      const candidates = await loadCandidatesForTerm(conn, term, usedIds, 1);
      if (candidates.length > 0) anyCandidatesSeen = true;

      let attempts = 0;
      for (const candidate of candidates) {
        if (attempts >= MAX_CANDIDATE_ATTEMPTS_PER_NEWS) break;
        if (usedIds.has(candidate.id)) continue;
        attempts += 1;

        let downloaded: Awaited<ReturnType<typeof downloadPixabayImage>> | null = null;
        try {
          downloaded = await downloadPixabayImage(candidate);
          const now = utcNowSql();
          const [insertResult] = await conn.execute<ResultSetHeader>(
            `
            INSERT IGNORE INTO news_card_images (
              news_item_id, pixabay_id, local_path, source_page_url, contributor_name,
              content_sha256, width, height, created_at, updated_at
            )
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE NOT EXISTS (
              SELECT 1 FROM news_card_images c WHERE c.news_item_id = ?
            )
            `,
            [
              news.id,
              candidate.id,
              downloaded.localPath,
              candidate.pageURL,
              candidate.user || null,
              downloaded.contentSha256,
              downloaded.width,
              downloaded.height,
              now,
              now,
              news.id,
            ],
          );
          if (insertResult.affectedRows !== 1) {
            await removeDownloadedImage(downloaded.absolutePath);
            summary.skipped += 1;
            return "assigned";
          }
          usedIds.add(candidate.id);
          summary.assigned += 1;
          return "assigned";
        } catch (error) {
          if (downloaded) await removeDownloadedImage(downloaded.absolutePath);
          // Pixabay's CDN rate-limits per-account, not per-image — retrying more
          // candidates (for this item or the next one) would just burn through
          // the rest of the batch hitting 429 immediately again. Stop the whole
          // batch here instead of misreporting every remaining item as "failed"
          // (they were never actually broken, just not attempted yet).
          if (error instanceof PixabayRateLimitError) return "rate_limited";
          const message = error instanceof Error ? error.message : "Unknown image assignment error";
          if (summary.errors.length < 10) summary.errors.push(`news ${news.id}: ${message}`);
        }
      }
      return "exhausted";
    };

    newsLoop: for (const news of missingRows) {
      const jiebaTerm = deriveJiebaSearchTerm(news.title);
      const fallbackTerm = deriveFallbackTerm(news.id);

      const termsToTry: string[] = [];
      if (jiebaTerm) {
        termsToTry.push(jiebaTerm);
      }
      termsToTry.push(fallbackTerm);
      for (const term of FALLBACK_TERMS) {
        if (!termsToTry.includes(term)) {
          termsToTry.push(term);
        }
      }

      let outcome: "assigned" | "rate_limited" | "exhausted" = "exhausted";
      for (const term of termsToTry) {
        outcome = await tryAssignWithTerm(news, term);
        if (outcome !== "exhausted") break;
      }

      if (outcome === "rate_limited") {
        summary.rateLimited = true;
        summary.reason = "Pixabay rate-limited this batch (HTTP 429) — stopping early; the rest will be picked up on the next run.";
        break newsLoop;
      }
      if (outcome === "exhausted") {
        summary.failed += 1;
      }
    }

    if (summary.failed > 0 && !anyCandidatesSeen) {
      summary.reason = "No unused Pixabay candidates are available.";
    }
    return summary;
  } finally {
    if (gotLock) {
      await conn.query("DO RELEASE_LOCK(?)", [LOCK_NAME]);
    }
    conn.release();
  }
};