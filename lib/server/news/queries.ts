import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";

export interface NewsListItem {
  id: number;
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
}

export interface NewsAssetItem {
  id: number;
  asset_type: "attachment" | "image";
  title: string | null;
  url: string;
  sort_order: number;
}

export const listLatestNews = async (limit = 50): Promise<NewsListItem[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT n.id, n.feed_code, n.feed_name, n.title, n.dept_name, n.published_at_utc,
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
      ORDER BY COALESCE(n.published_at_utc, n.created_at) DESC
      LIMIT ?
      `,
      [limit],
    );

    return rows as unknown as NewsListItem[];
  });

export const getNewsById = async (id: number): Promise<NewsDetailItem | null> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT n.id, n.feed_code, n.feed_name, n.title, n.dept_name, n.published_at_utc,
             n.canonical_url, n.description_html, n.detail_html, n.detail_text,
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