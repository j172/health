import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getMysqlPool, ensureSchema, utcNowSql } from "@/lib/server/db/mysql";
import { env } from "@/lib/server/config/env";
import { downloadPixabayImage, removeDownloadedImage, PixabayRateLimitError } from "@/lib/server/pixabay/download";
import { searchHealthImages, type PixabayImage, type PixabaySearchResponse } from "@/lib/server/pixabay/client";

const LOCK_NAME = "news_card_image_assignment_lock";
const CACHE_TTL_HOURS = 24;
const API_RESULTS_PER_PAGE = 100;
const MAX_API_PAGES = 5;
const MAX_CANDIDATE_ATTEMPTS_PER_NEWS = 5;

// Each term gets its own up-to-500-hit Pixabay pool (see searchHealthImages),
// so rotating through several keeps a much larger reservoir of still-unused
// candidates than a single fixed query can offer once the site has assigned
// a few hundred images.
const SEARCH_TERMS = ["health", "medical", "hospital", "doctor", "medicine", "wellness", "nutrition", "fitness", "pharmacy", "clinic"];

interface MissingNewsRow extends RowDataPacket {
  id: number;
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

const loadCandidates = async (conn: PoolConnection, usedIds: Set<number>, needed: number): Promise<PixabayImage[]> => {
  const candidates: PixabayImage[] = [];
  const targetCandidateCount = Math.max(20, needed * 3);
  for (const term of SEARCH_TERMS) {
    for (let page = 1; page <= MAX_API_PAGES; page += 1) {
      const result = await getCachedSearchPage(conn, term, page);
      candidates.push(...result.hits.filter((hit) => !usedIds.has(hit.id)));
      if (candidates.length >= targetCandidateCount || page * API_RESULTS_PER_PAGE >= Math.min(result.totalHits, 500)) break;
    }
    if (candidates.length >= targetCandidateCount) break;
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
      SELECT n.id
      FROM news_items n
      LEFT JOIN news_card_images c ON c.news_item_id = n.id
      WHERE c.news_item_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM news_assets a
          WHERE a.news_item_id = n.id AND a.asset_type = 'image'
        )
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
    const candidates = await loadCandidates(conn, usedIds, missingRows.length);
    let candidateIndex = 0;

    newsLoop: for (const news of missingRows) {
      let assigned = false;
      let attempts = 0;
      while (!assigned && candidateIndex < candidates.length && attempts < MAX_CANDIDATE_ATTEMPTS_PER_NEWS) {
        const candidate = candidates[candidateIndex];
        candidateIndex += 1;
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
              AND NOT EXISTS (
                SELECT 1 FROM news_assets a
                WHERE a.news_item_id = ? AND a.asset_type = 'image'
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
              news.id,
            ],
          );
          if (insertResult.affectedRows !== 1) {
            await removeDownloadedImage(downloaded.absolutePath);
            summary.skipped += 1;
            assigned = true;
            continue;
          }
          usedIds.add(candidate.id);
          summary.assigned += 1;
          assigned = true;
        } catch (error) {
          if (downloaded) await removeDownloadedImage(downloaded.absolutePath);
          // Pixabay's CDN rate-limits per-account, not per-image — retrying more
          // candidates (for this item or the next one) would just burn through
          // the rest of the batch hitting 429 immediately again. Stop the whole
          // batch here instead of misreporting every remaining item as "failed"
          // (they were never actually broken, just not attempted yet).
          if (error instanceof PixabayRateLimitError) {
            summary.rateLimited = true;
            summary.reason = "Pixabay rate-limited this batch (HTTP 429) — stopping early; the rest will be picked up on the next run.";
            break newsLoop;
          }
          const message = error instanceof Error ? error.message : "Unknown image assignment error";
          if (summary.errors.length < 10) summary.errors.push(`news ${news.id}: ${message}`);
        }
      }

      if (!assigned) {
        summary.failed += 1;
      }
    }

    if (summary.failed > 0 && candidates.length === 0) {
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