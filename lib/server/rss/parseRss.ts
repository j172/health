import { XMLParser } from "fast-xml-parser";
import type { FeedConfig, NormalizedRssItem } from "@/types/rss";
import { normalizeItem, readItemIdentity } from "@/lib/server/rss/normalizeItem";
import { evaluateFreshness } from "@/lib/server/rss/freshness";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  cdataPropName: "__cdata",
});

const rawItemsOf = (xml: string): unknown[] => {
  const parsed = parser.parse(xml);
  const channel = parsed?.rss?.channel;
  const rawItems = channel?.item ?? parsed?.feed?.entry;
  if (!rawItems) return [];
  return Array.isArray(rawItems) ? rawItems : [rawItems];
};

export const parseFeedXml = (
  feed: FeedConfig,
  xml: string,
): NormalizedRssItem[] => {
  const normalized: NormalizedRssItem[] = [];

  for (const raw of rawItemsOf(xml)) {
    if (!raw || typeof raw !== "object") continue;
    const item = normalizeItem(feed, raw as Record<string, unknown>);
    if (!item.title || !item.canonicalUrl) continue;
    normalized.push(item);
  }

  return normalized;
};

export interface GatedFeedItems {
  /** Entries that have a title and a link — what `parseFeedXml(...).length` reports. */
  total: number;
  /** The ones inside the freshness window, fully normalized. */
  fresh: NormalizedRssItem[];
  /** The rest (too old, or dated in the future); never normalized. */
  staleRejected: number;
}

/**
 * parseFeedXml + the freshness gate in one pass, normalizing only what survives.
 *
 * Gives exactly the split the two-step form gave (`total` = items kept by
 * parseFeedXml, `fresh`/`staleRejected` = partitionByFreshness of them): the
 * title/link test and the publish date are read the way normalizeItem reads
 * them, and the verdict comes from the same evaluateFreshness. What changes is
 * that a stale entry no longer costs a cheerio parse, a SHA-256 over its payload
 * and a Date round-trip — measured ~100 MB of short-lived garbage per run on the
 * Google `site:` feeds alone (#699).
 */
export const parseFeedXmlGated = (
  feed: FeedConfig,
  xml: string,
  now: Date,
): GatedFeedItems => {
  const fresh: NormalizedRssItem[] = [];
  let total = 0;
  let staleRejected = 0;

  for (const raw of rawItemsOf(xml)) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const identity = readItemIdentity(record);
    if (!identity.title || !identity.link) continue;
    total += 1;

    if (!evaluateFreshness({ publishedAtUtc: identity.publishedAtUtc }, now).fresh) {
      staleRejected += 1;
      continue;
    }
    fresh.push(normalizeItem(feed, record));
  }

  return { total, fresh, staleRejected };
};
