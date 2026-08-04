import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { utcNowSql, withConnection, withTransaction } from "@/lib/server/db/mysql";
import { buildSocialCaption, SOCIAL_PLATFORMS, type CaptionSourceNews } from "@/lib/server/social/captions";

const DEFAULT_MAX_ITEMS = 3;

interface EligibleNewsRow extends RowDataPacket, CaptionSourceNews {
  image_path: string;
}

// Selection scope per spec section 2.1 — government RSS only, excluding
// administrative-announcement feeds. Copied verbatim from the spec, do not
// paraphrase:
//   Include: mohw feed code 16 (焦點新聞) only; cdc (all); tfda (all);
//   hpa (all: hpa, hpa_clarify, hpa_rumor, hpa_activity, hpa_announcement);
//   nhi (all).
//   Exclude: mohw feed codes 17, 18, 101, 2622 (administrative announcements/
//   clarifications/event listings — not social-friendly content). All
//   non-government feeds (media outlets, Google News fallbacks, etc.) are
//   out of scope entirely.
// The WHERE clause below only ever opts feeds *in*, so the excluded mohw
// codes and every non-government feed are already out of scope by
// construction — there is nothing further to subtract.
const ELIGIBLE_NEWS_SQL = `
  SELECT
    n.id, n.title, n.description_text, n.meta_description, n.dept_name,
    n.source_name, n.feed_name, c.local_path AS image_path
  FROM news_items n
  INNER JOIN news_card_images c ON c.news_item_id = n.id
  WHERE (
    (n.source_name = 'mohw' AND n.feed_code = '16')
    OR n.source_name IN ('cdc', 'tfda', 'hpa', 'nhi')
  )
  AND NOT EXISTS (
    SELECT 1 FROM social_post_queue q WHERE q.news_item_id = n.id
  )
  ORDER BY COALESCE(n.published_at_utc, n.created_at) DESC
  LIMIT ?
`;

export interface DailyDraftQueueSummary {
  selectedNewsItemIds: number[];
  queuedRows: number;
  failedNewsItemIds: number[];
}

/**
 * Selects up to `maxItems` eligible, not-yet-queued government news items
 * (newest first) and inserts one social_post_queue draft row per platform
 * for each — see docs/specs/social-icons-and-post-drafts.md section 2.
 * The INNER JOIN onto news_card_images means items without a card image yet
 * are invisible to this query entirely, so the newest *imaged* qualifying
 * item is always picked next rather than ever waiting on one to gain an
 * image (spec section 2.2). The NOT EXISTS guard means an item already
 * queued on a previous run (any platform) is never re-selected.
 *
 * Each item's 3 platform rows are inserted inside their own transaction and
 * isolated in their own try/catch: a failure partway through one item rolls
 * that item's rows back (leaving zero rows, so the NOT EXISTS guard above
 * picks it up again next run for a clean retry) instead of stranding it
 * half-queued forever, and doesn't abort the rest of the day's batch —
 * matching the per-source isolation lib/server/sync/runSource.ts already
 * gives the other jobs registered in registerJobs.ts.
 */
export const buildDailyDraftQueue = async (maxItems = DEFAULT_MAX_ITEMS): Promise<DailyDraftQueueSummary> => {
  const rows = await withConnection((conn) =>
    conn.query<EligibleNewsRow[]>(ELIGIBLE_NEWS_SQL, [maxItems]).then(([result]) => result),
  );

  let queuedRows = 0;
  const failedNewsItemIds: number[] = [];

  for (const news of rows) {
    try {
      queuedRows += await withTransaction(async (conn) => {
        const now = utcNowSql();
        let insertedForItem = 0;

        for (const platform of SOCIAL_PLATFORMS) {
          const caption = buildSocialCaption(news, platform);
          // INSERT IGNORE + the uq_social_queue_item_platform unique key is a
          // belt-and-suspenders guard against a rare race (e.g. an overlapping
          // manual admin trigger) re-inserting a row the SELECT above already
          // considered available.
          const [result] = await conn.execute<ResultSetHeader>(
            `
            INSERT IGNORE INTO social_post_queue
              (news_item_id, platform, caption, image_path, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'draft', ?, ?)
            `,
            [news.id, platform, caption, news.image_path, now, now],
          );
          insertedForItem += result.affectedRows;
        }

        return insertedForItem;
      });
    } catch (error) {
      failedNewsItemIds.push(news.id);
      console.error(`[social-post-queue] Failed to queue drafts for news_item_id=${news.id}:`, error);
    }
  }

  return { selectedNewsItemIds: rows.map((news) => news.id), queuedRows, failedNewsItemIds };
};
