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

const pickLink = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      const alt = value.find(
        (v) =>
          v &&
          typeof v === "object" &&
          (v.rel === "alternate" || !v.rel) &&
          typeof v.href === "string",
      );
      if (alt && typeof alt.href === "string") return alt.href.trim();
      for (const item of value) {
        const picked = pickLink(item);
        if (picked) return picked;
      }
    } else {
      const obj = value as Record<string, unknown>;
      if (typeof obj.href === "string") return obj.href.trim();
      if (typeof obj["#text"] === "string") return obj["#text"].trim();
      if (typeof obj["__cdata"] === "string") return obj["__cdata"].trim();
    }
  }
  return "";
};

const pickCategory = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const list = value.map(pickCategory).filter(Boolean);
    return list.length > 0 ? list.join(", ") : null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const label = pickText(
      obj.label || obj.term || obj.name || obj["#text"] || obj["__cdata"],
    );
    return label || null;
  }
  return null;
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
  const link = pickLink(rawItem.link);
  const sourceUrl = pickLink(rawItem.source) || link;
  const descriptionHtml = pickText(
    rawItem.description || rawItem.summary || rawItem.content,
  );
  const descriptionText = htmlToText(descriptionHtml);
  const externalId =
    pickText(rawItem.NewsID) ||
    pickText(rawItem.newsid) ||
    pickText(rawItem.id) ||
    link;
  const deptName = pickText(rawItem.DeptName) || null;
  const categoryRaw =
    pickCategory(rawItem.Category || rawItem.category) || null;
  const displayType = pickText(rawItem.DisplayType) || null;
  const publishedAtUtc = parseRfc822ToDate(
    rawItem.pubDate || rawItem.published || rawItem.updated,
  );
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
