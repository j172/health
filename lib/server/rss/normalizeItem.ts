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

/** Yahoo RSS (and a few others) put a bare image URL directly in <content:encoded>. */
const BARE_IMAGE_URL_RE = /^https?:\/\/\S+\.(?:jpe?g|png|webp|gif)(?:\?\S*)?$/i;

const isUsableImageUrl = (url: string): boolean => {
  if (!/^https?:\/\//i.test(url)) return false;
  return !/logo|favicon|icon|sprite|placeholder|\/aa\.(png|gif)|\/x\.png|1x1|pixel|tracking|default_logo/i.test(
    url,
  );
};

const extractImgSrcFromHtml = (html: string): string | null => {
  if (!html || !html.includes("<img")) return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (match && match[1]) {
    const src = match[1].trim();
    if (isUsableImageUrl(src)) return src;
  }
  return null;
};

const pickLeadImageUrl = (
  rawItem: Record<string, unknown>,
  descriptionHtml: string,
): string | null => {
  // 1. Check enclosure
  const enclosure = rawItem.enclosure;
  if (enclosure) {
    const encList = Array.isArray(enclosure) ? enclosure : [enclosure];
    for (const enc of encList) {
      if (enc && typeof enc === "object") {
        const obj = enc as Record<string, unknown>;
        const url = pickText(obj.url || obj["#text"] || obj["@_url"]);
        const type = pickText(obj.type || obj["@_type"]).toLowerCase();
        if (
          url &&
          (type.startsWith("image/") ||
            /\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(url))
        ) {
          if (isUsableImageUrl(url)) return url;
        }
      }
    }
  }

  // 2. Check media:content
  const mediaContent = rawItem["media:content"];
  if (mediaContent) {
    const list = Array.isArray(mediaContent) ? mediaContent : [mediaContent];
    for (const mc of list) {
      if (mc && typeof mc === "object") {
        const obj = mc as Record<string, unknown>;
        const url = pickText(obj.url || obj["@_url"] || obj["#text"]);
        if (url && isUsableImageUrl(url)) return url;
      }
    }
  }

  // 3. Check media:thumbnail
  const mediaThumb = rawItem["media:thumbnail"];
  if (mediaThumb) {
    const list = Array.isArray(mediaThumb) ? mediaThumb : [mediaThumb];
    for (const mt of list) {
      if (mt && typeof mt === "object") {
        const obj = mt as Record<string, unknown>;
        const url = pickText(obj.url || obj["@_url"] || obj["#text"]);
        if (url && isUsableImageUrl(url)) return url;
      }
    }
  }

  // 4. Check content:encoded (e.g. Yahoo RSS or WordPress full content)
  const contentEncoded = pickText(
    rawItem["content:encoded"] || rawItem.encoded,
  );
  if (contentEncoded) {
    // Yahoo often puts raw image URL directly inside <content:encoded>
    if (BARE_IMAGE_URL_RE.test(contentEncoded.trim())) {
      const url = contentEncoded.trim();
      if (isUsableImageUrl(url)) return url;
    }
    const htmlImg = extractImgSrcFromHtml(contentEncoded);
    if (htmlImg) return htmlImg;
  }

  // 5. Check description/summary HTML for <img>
  const descImg = extractImgSrcFromHtml(descriptionHtml);
  if (descImg) return descImg;

  return null;
};

export const normalizeItem = (
  feed: FeedConfig,
  rawItem: Record<string, unknown>,
): NormalizedRssItem => {
  const title = pickText(rawItem.title);
  const link = pickLink(rawItem.link);
  const sourceUrl = pickLink(rawItem.source) || link;
  // Prefer <content:encoded> when the feed populates it: many WordPress feeds
  // (mamaclub, ilady, lianhonghong, ...) truncate <description> to ~119 chars
  // plus an ellipsis while content:encoded carries the article's full HTML.
  // This is not a substitute for the detail-page fetch PR #329 turned off for
  // non-gov sources (issue #353) — it is only surfacing a full-text field the
  // source already broadcasts in the feed itself, same as pickLeadImageUrl
  // above already reads content:encoded for its lead image. Falls back to
  // today's description/summary/content order when a source doesn't send
  // content:encoded at all (or sends it empty) — and also when
  // content:encoded is just a bare image URL (Yahoo RSS's convention, tested
  // by rssLeadImageExtraction.test.mjs): that is real for leadImageUrl, but
  // it would make the card summary show a raw URL instead of a description.
  const contentEncodedRaw = pickText(
    rawItem["content:encoded"] || rawItem.encoded,
  );
  const contentEncoded = BARE_IMAGE_URL_RE.test(contentEncodedRaw)
    ? ""
    : contentEncodedRaw;
  const descriptionHtml =
    contentEncoded ||
    pickText(rawItem.description || rawItem.summary || rawItem.content);
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
  const leadImageUrl = pickLeadImageUrl(rawItem, descriptionHtml);

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
    leadImageUrl,
  };
};
