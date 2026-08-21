import { createHash } from "crypto";
import { load } from "cheerio";
import type { FeedConfig, NormalizedRssItem } from "@/types/rss";
import { parseRfc822ToDate, parseTaipeiDateToUtc } from "@/lib/server/rss/time";

const pickText = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj["#text"] === "string") return obj["#text"].trim();
    if (typeof obj["__cdata"] === "string") return obj["__cdata"].trim();
    if (typeof obj["$text"] === "string") return obj["$text"].trim();
  }
  return "";
};

const htmlToText = (html: string): string => {
  if (!html) return "";
  const $ = load(html);
  return $.text().replace(/\s+/g, " ").trim();
};

const sha256 = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

export const normalizeItem = (
  feed: FeedConfig,
  rawItem: Record<string, unknown>,
): NormalizedRssItem => {
  const title = pickText(rawItem.title);
  const link = pickText(rawItem.link);
  const sourceUrl = pickText(rawItem.source) || link;
  const descriptionHtml = pickText(rawItem.description);
  const descriptionText = htmlToText(descriptionHtml);
  const externalId =
    pickText(rawItem.NewsID) || pickText(rawItem.newsid) || link;
  const deptName = pickText(rawItem.DeptName) || null;
  const categoryRaw = pickText(rawItem.Category) || null;
  const displayType = pickText(rawItem.DisplayType) || null;
  const publishedAtUtc = parseRfc822ToDate(rawItem.pubDate);
  const publicBeginAtTaipei = parseTaipeiDateToUtc(rawItem.PublicBeginDate);
  const publicEndAtTaipei = parseTaipeiDateToUtc(rawItem.PublicEndDate);

  const payloadHash = sha256(
    JSON.stringify({
      title,
      link,
      sourceUrl,
      descriptionHtml,
      deptName,
      categoryRaw,
      displayType,
      publishedAtUtc: publishedAtUtc?.toISOString() ?? null,
      publicBeginAtTaipei: publicBeginAtTaipei?.toISOString() ?? null,
      publicEndAtTaipei: publicEndAtTaipei?.toISOString() ?? null,
    }),
  );

  return {
    sourceName: feed.sourceName,
    feedCode: feed.code,
    feedName: feed.name,
    externalId,
    canonicalUrl: link,
    sourceUrl,
    title,
    descriptionHtml,
    descriptionText,
    deptName,
    categoryRaw,
    displayType,
    publishedAtUtc,
    publicBeginAtTaipei,
    publicEndAtTaipei,
    payloadHash,
  };
};
