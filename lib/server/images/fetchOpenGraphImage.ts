import "server-only";
import { load } from "cheerio";
import type { NewsAsset } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import {
  isGoogleNewsUrl,
  resolveGoogleNewsRedirect,
} from "@/lib/server/net/resolveGoogleNewsRedirect.mjs";

const FETCH_TIMEOUT_MS = 12_000;

const toAbsoluteUrl = (url: string, base: string): string | null => {
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
};

/** Skip hosts/paths that are never usable card photos. */
const isUnusableImageUrl = (url: string): boolean =>
  /logo|favicon|icon|sprite|placeholder|\/aa\.(png|gif)|\/x\.png|1x1|pixel|tracking/i.test(
    url,
  );

const extractLdJsonImages = ($: ReturnType<typeof load>): string[] => {
  const urls: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const text = $(el).text();
      if (!text || (!text.includes("image") && !text.includes("thumbnailUrl")))
        return;
      const data = JSON.parse(text);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const img = item.image || item.thumbnailUrl;
        if (typeof img === "string") {
          urls.push(img);
        } else if (Array.isArray(img)) {
          for (const sub of img) {
            if (typeof sub === "string") urls.push(sub);
            else if (
              sub &&
              typeof sub === "object" &&
              typeof sub.url === "string"
            )
              urls.push(sub.url);
          }
        } else if (
          img &&
          typeof img === "object" &&
          typeof img.url === "string"
        ) {
          urls.push(img.url);
        }
      }
    } catch {
      // ignore invalid json-ld
    }
  });
  return urls;
};

/**
 * Lightweight card-image path for feeds that skip full detail scrape
 * (e.g. ltn.com.tw): pull og:image / twitter:image / json-ld only, re-host locally.
 * Does not parse or store article body HTML.
 */
export const fetchOpenGraphImageAsset = async (
  canonicalUrl: string,
): Promise<NewsAsset | null> => {
  if (!canonicalUrl) return null;

  // news.google.com "article shell" links (the <link> Google News RSS feeds
  // hand back) have no og:image of their own — Google's own logo, at best.
  // Try to resolve the real publisher URL first (bounded hops, short
  // timeout, fails safe to null on any problem — see
  // resolveGoogleNewsRedirect.mjs); only bail out for good if that fails,
  // same as before this existed.
  let targetUrl = canonicalUrl;
  if (isGoogleNewsUrl(canonicalUrl)) {
    const resolved = await resolveGoogleNewsRedirect(canonicalUrl).catch(
      () => null,
    );
    if (!resolved) return null;
    targetUrl = resolved;
  }

  const response = await httpGetText(targetUrl, {
    headers: {
      // Browser-like UA: some publishers (and WAFs) 403 the bare bot string.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
    },
    timeoutMs: FETCH_TIMEOUT_MS,
  });

  if (response.status < 200 || response.status >= 300) return null;

  const $ = load(response.text);
  const rawCandidates = [
    $('meta[property="og:image"]').attr("content"),
    $('meta[property="og:image:secure_url"]').attr("content"),
    $('meta[property="og:image:url"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[name="twitter:image:src"]').attr("content"),
    $('link[rel="image_src"]').attr("href"),
    ...extractLdJsonImages($),
  ];

  for (const raw of rawCandidates) {
    if (!raw?.trim()) continue;
    const absolute = toAbsoluteUrl(raw.trim(), targetUrl);
    if (
      !absolute ||
      !/^https?:\/\//i.test(absolute) ||
      isUnusableImageUrl(absolute)
    )
      continue;

    const localPath = await downloadArticleImage(absolute, targetUrl);
    if (!localPath) continue;

    return {
      assetType: "image",
      title: $('meta[property="og:image:alt"]').attr("content")?.trim() || null,
      url: localPath,
      sortOrder: 0,
    };
  }

  return null;
};
