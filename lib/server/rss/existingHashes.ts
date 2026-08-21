import type { RowDataPacket } from "mysql2/promise";
import type { NormalizedRssItem } from "@/types/rss";
import { withConnection } from "@/lib/server/db/mysql";

export const itemKey = (
  item: Pick<NormalizedRssItem, "sourceName" | "feedCode" | "externalId">,
): string => `${item.sourceName}::${item.feedCode}::${item.externalId}`;

/** Looks up the currently-stored payload_hash for each item, grouped per (sourceName, feedCode) to keep queries small. */
export const getExistingPayloadHashes = async (
  items: NormalizedRssItem[],
): Promise<Map<string, string>> => {
  if (items.length === 0) return new Map();

  return withConnection(async (conn) => {
    const result = new Map<string, string>();
    const bySource = new Map<
      string,
      { sourceName: string; feedCode: string; externalIds: string[] }
    >();

    for (const item of items) {
      const groupKey = `${item.sourceName}::${item.feedCode}`;
      const group = bySource.get(groupKey) ?? {
        sourceName: item.sourceName,
        feedCode: item.feedCode,
        externalIds: [],
      };
      group.externalIds.push(item.externalId);
      bySource.set(groupKey, group);
    }

    for (const { sourceName, feedCode, externalIds } of bySource.values()) {
      const placeholders = externalIds.map(() => "?").join(",");
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT external_id, payload_hash FROM news_items WHERE source_name = ? AND feed_code = ? AND external_id IN (${placeholders})`,
        [sourceName, feedCode, ...externalIds],
      );
      for (const row of rows) {
        result.set(
          `${sourceName}::${feedCode}::${row.external_id}`,
          row.payload_hash,
        );
      }
    }

    return result;
  });
};
