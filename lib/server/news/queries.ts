import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";

export interface NewsListItem {
  id: number;
  source_name: string;
  feed_code: string;
  feed_name: string;
  title: string;
  dept_name: string | null;
  published_at_utc: Date | null;
  canonical_url: string;
  description_html: string | null;
  card_image_url: string | null;
  card_image_source: "rss" | "pixabay" | null;
  card_image_source_page_url: string | null;
  card_image_contributor: string | null;
}

export interface NewsDetailItem extends NewsListItem {
  description_html: string | null;
  detail_html: string | null;
  detail_text: string | null;
  meta_title: string | null;
  meta_description: string | null;
  keywords: string | null;
  geo_summary: string | null;
}

export interface NewsAssetItem {
  id: number;
  asset_type: "attachment" | "image";
  title: string | null;
  url: string;
  sort_order: number;
}

export interface NewsGeoSummaryItem {
  id: number;
  title: string;
  source_name: string;
  feed_name: string;
  dept_name: string | null;
  published_at_utc: Date | null;
  geo_summary: string | null;
  meta_description: string | null;
}

/** Recent items with their AI-generated GEO summaries, for llms.txt — a
 * lighter projection than NewsDetailItem since it skips html/detail text. */
export const listRecentNewsForLlms = async (limit = 100): Promise<NewsGeoSummaryItem[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT id, title, source_name, feed_name, dept_name, published_at_utc, geo_summary, meta_description
      FROM news_items
      ORDER BY COALESCE(published_at_utc, created_at) DESC
      LIMIT ?
      `,
      [limit],
    );
    return rows as unknown as NewsGeoSummaryItem[];
  });

export interface WeatherWarningItem {
  id: number;
  title: string;
  published_at_utc: Date | null;
}

// CWA re-publishes an item while a warning stays in effect and stops once
// it's lifted, but the feed carries no explicit expiry — treat anything
// published in the last few hours as still current, everything older as
// stale/likely superseded.
const ACTIVE_WARNING_WINDOW_HOURS = 6;

/** Recent items from the CWA warnings/advisories feed, for a navbar alert
 * strip — deliberately not grouped into the source-archive nav dropdowns,
 * since these are transient alerts rather than browsable news coverage. */
export const listActiveWeatherWarnings = async (limit = 5): Promise<WeatherWarningItem[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT id, title, published_at_utc
      FROM news_items
      WHERE source_name = 'cwa'
        AND published_at_utc >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)
      ORDER BY published_at_utc DESC
      LIMIT ?
      `,
      [ACTIVE_WARNING_WINDOW_HOURS, limit],
    );
    return rows as unknown as WeatherWarningItem[];
  });

export interface NewsSitemapItem {
  id: number;
  title: string;
  published_at_utc: Date | null;
}

/** Articles published within the last `hours` — Google News Sitemap only
 * accepts articles published in the last 48 hours (older ones should be
 * dropped from the news sitemap entirely, not just deprioritized). */
export const listRecentNewsForNewsSitemap = async (hours = 48): Promise<NewsSitemapItem[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT id, title, published_at_utc
      FROM news_items
      WHERE published_at_utc >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)
      ORDER BY published_at_utc DESC
      `,
      [hours],
    );
    return rows as unknown as NewsSitemapItem[];
  });

// Matches a single comma-separated keyword tag exactly (via comma-bounded
// substring), so filtering by "健康" doesn't also match "健康新聞" or similar.
const KEYWORD_MATCH_SQL = "CONCAT(',', n.keywords, ',') LIKE CONCAT('%,', ?, ',%')";

const buildNewsFilter = (
  sourceName?: string,
  keyword?: string,
  sourceNames?: string[],
): { whereClause: string; params: unknown[] } => {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (sourceName) {
    // A single specific source (drill-down) always takes precedence over a group filter.
    conditions.push("n.source_name = ?");
    params.push(sourceName);
  } else if (sourceNames && sourceNames.length > 0) {
    conditions.push(`n.source_name IN (${sourceNames.map(() => "?").join(", ")})`);
    params.push(...sourceNames);
  }
  if (keyword) {
    conditions.push(KEYWORD_MATCH_SQL);
    params.push(keyword);
  }
  return { whereClause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
};

export const listLatestNews = async (
  limit = 50,
  offset = 0,
  sourceName?: string,
  keyword?: string,
  sourceNames?: string[],
): Promise<NewsListItem[]> =>
  withConnection(async (conn) => {
    const { whereClause, params } = buildNewsFilter(sourceName, keyword, sourceNames);
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT n.id, n.source_name, n.feed_code, n.feed_name, n.title, n.dept_name, n.published_at_utc,
             n.canonical_url, n.description_html,
             COALESCE(
               (SELECT a.url
                FROM news_assets a
                WHERE a.news_item_id = n.id AND a.asset_type = 'image'
                ORDER BY a.sort_order ASC, a.id ASC
                LIMIT 1),
               c.local_path
             ) AS card_image_url,
             CASE
               WHEN EXISTS (
                 SELECT 1 FROM news_assets a
                 WHERE a.news_item_id = n.id AND a.asset_type = 'image'
               ) THEN 'rss'
               WHEN c.local_path IS NOT NULL THEN 'pixabay'
               ELSE NULL
             END AS card_image_source,
             c.source_page_url AS card_image_source_page_url,
             c.contributor_name AS card_image_contributor
      FROM news_items n
      LEFT JOIN news_card_images c ON c.news_item_id = n.id
      ${whereClause}
      ORDER BY COALESCE(n.published_at_utc, n.created_at) DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    return rows as unknown as NewsListItem[];
  });

export const countNewsItems = async (sourceName?: string, keyword?: string, sourceNames?: string[]): Promise<number> =>
  withConnection(async (conn) => {
    const { whereClause, params } = buildNewsFilter(sourceName, keyword, sourceNames);
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM news_items n ${whereClause}`, params);
    return Number(rows[0]?.total ?? 0);
  });

export const getNewsById = async (id: number): Promise<NewsDetailItem | null> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT n.id, n.source_name, n.feed_code, n.feed_name, n.title, n.dept_name, n.published_at_utc,
             n.canonical_url, n.description_html, n.detail_html, n.detail_text,
             n.meta_title, n.meta_description, n.keywords, n.geo_summary,
             COALESCE(
               (SELECT a.url
                FROM news_assets a
                WHERE a.news_item_id = n.id AND a.asset_type = 'image'
                ORDER BY a.sort_order ASC, a.id ASC
                LIMIT 1),
               c.local_path
             ) AS card_image_url,
             CASE
               WHEN EXISTS (
                 SELECT 1 FROM news_assets a
                 WHERE a.news_item_id = n.id AND a.asset_type = 'image'
               ) THEN 'rss'
               WHEN c.local_path IS NOT NULL THEN 'pixabay'
               ELSE NULL
             END AS card_image_source,
             c.source_page_url AS card_image_source_page_url,
             c.contributor_name AS card_image_contributor
      FROM news_items n
      LEFT JOIN news_card_images c ON c.news_item_id = n.id
      WHERE n.id = ?
      LIMIT 1
      `,
      [id],
    );

    if (!rows[0]) return null;
    return rows[0] as unknown as NewsDetailItem;
  });

export const listNewsAssetsByNewsId = async (newsId: number): Promise<NewsAssetItem[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT id, asset_type, title, url, sort_order
      FROM news_assets
      WHERE news_item_id = ?
      ORDER BY sort_order ASC, id ASC
      `,
      [newsId],
    );

    return rows as unknown as NewsAssetItem[];
  });