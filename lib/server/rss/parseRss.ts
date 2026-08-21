import { XMLParser } from "fast-xml-parser";
import type { FeedConfig, NormalizedRssItem } from "@/types/rss";
import { normalizeItem } from "@/lib/server/rss/normalizeItem";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  cdataPropName: "__cdata",
});

export const parseFeedXml = (
  feed: FeedConfig,
  xml: string,
): NormalizedRssItem[] => {
  const parsed = parser.parse(xml);
  const channel = parsed?.rss?.channel;
  if (!channel) return [];

  const rawItems = channel.item;
  if (!rawItems) return [];

  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  const normalized: NormalizedRssItem[] = [];

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = normalizeItem(feed, raw as Record<string, unknown>);
    if (!item.title || !item.canonicalUrl) continue;
    normalized.push(item);
  }

  return normalized;
};
