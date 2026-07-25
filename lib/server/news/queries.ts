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
      SELECT id, feed_code, feed_name, title, dept_name, published_at_utc, canonical_url, description_html
      FROM news_items
      ORDER BY COALESCE(published_at_utc, created_at) DESC
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
      SELECT id, feed_code, feed_name, title, dept_name, published_at_utc, canonical_url,
             description_html, detail_html, detail_text
      FROM news_items
      WHERE id = ?
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