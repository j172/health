import type { RowDataPacket } from "mysql2/promise";
import type { NormalizedRssItem } from "@/types/rss";
import { withConnection } from "@/lib/server/db/mysql";

export const itemKey = (
  item: Pick<NormalizedRssItem, "sourceName" | "feedCode" | "externalId">,
): string => `${item.sourceName}::${item.feedCode}::${item.externalId}`;

/** Secondary identity: the URL, which stays stable when external_id does not. */
const urlKey = (
  item: Pick<NormalizedRssItem, "sourceName" | "canonicalUrl">,
): string => `${item.sourceName}::url::${item.canonicalUrl}`;

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

    // Second pass, keyed on canonical_url, for everything the first one missed.
    //
    // news_items has two unique keys and the feeds reissue external_ids, so an
    // article we already hold can be invisible to an external_id lookup while its
    // URL has not changed at all. Measured in production: 1,565 items a run.
    //
    // Every one of those misses costs a full detail-page fetch and parse in
    // enrichItem(), which is what made a run spend eight minutes rediscovering
    // articles it already had.
    const unresolved = items.filter(
      (item) => !result.has(itemKey(item)) && item.canonicalUrl,
    );

    const byUrlSource = new Map<string, string[]>();
    for (const item of unresolved) {
      const urls = byUrlSource.get(item.sourceName) ?? [];
      urls.push(item.canonicalUrl);
      byUrlSource.set(item.sourceName, urls);
    }

    for (const [sourceName, urls] of byUrlSource) {
      // Chunked: these lists run to four figures, and a single IN () that long
      // is a packet-size and planner problem rather than a query.
      const CHUNK = 300;
      for (let offset = 0; offset < urls.length; offset += CHUNK) {
        const slice = urls.slice(offset, offset + CHUNK);
        const placeholders = slice.map(() => "?").join(",");
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT canonical_url, payload_hash FROM news_items WHERE source_name = ? AND canonical_url IN (${placeholders})`,
          [sourceName, ...slice],
        );
        for (const row of rows) {
          result.set(
            `${sourceName}::url::${row.canonical_url}`,
            row.payload_hash,
          );
        }
      }
    }

    return result;
  });
};

/**
 * True when we already hold this exact payload, under either identity.
 * Callers use it to skip enrichItem()'s detail-page fetch entirely.
 */
export const isUnchanged = (
  hashes: Map<string, string>,
  item: NormalizedRssItem,
): boolean =>
  hashes.get(itemKey(item)) === item.payloadHash ||
  hashes.get(urlKey(item)) === item.payloadHash;
