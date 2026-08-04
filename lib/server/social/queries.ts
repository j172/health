import type { RowDataPacket } from "mysql2/promise";
import { withConnectionFallback } from "@/lib/server/db/mysql";
import type { SocialPlatform } from "@/lib/server/social/captions";

export interface SocialPostQueueRow {
  id: number;
  news_item_id: number;
  news_title: string;
  platform: SocialPlatform;
  caption: string;
  image_path: string;
  status: string;
  created_at: Date;
}

interface SocialPostQueueRowPacket extends RowDataPacket, SocialPostQueueRow {}

/** Lists queued social-post drafts, most recent first, for the read-only admin review page (spec section 2.6). */
export const listSocialPostQueue = async (limit = 100): Promise<SocialPostQueueRow[]> =>
  withConnectionFallback([], async (conn) => {
    const [rows] = await conn.query<SocialPostQueueRowPacket[]>(
      `
      SELECT
        q.id, q.news_item_id, n.title AS news_title, q.platform, q.caption,
        q.image_path, q.status, q.created_at
      FROM social_post_queue q
      JOIN news_items n ON n.id = q.news_item_id
      ORDER BY q.created_at DESC, q.id DESC
      LIMIT ?
      `,
      [limit],
    );

    return rows;
  });
