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

/** Pulls candidate image URLs out of one parsed JSON-LD value (an object, or an array of them). */
const collectLdJsonImages = (data: unknown, into: string[]): void => {
  const items = Array.isArray(data) ? data : [data];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as { image?: unknown; thumbnailUrl?: unknown };
    const img = record.image || record.thumbnailUrl;
    if (typeof img === "string") {
      into.push(img);
    } else if (Array.isArray(img)) {
      for (const sub of img) {
        if (typeof sub === "string") into.push(sub);
        else if (
          sub &&
          typeof sub === "object" &&
          typeof (sub as { url?: unknown }).url === "string"
        )
          into.push((sub as { url: string }).url);
      }
    } else if (
      img &&
      typeof img === "object" &&
      typeof (img as { url?: unknown }).url === "string"
    ) {
      into.push((img as { url: string }).url);
    }
  }
};

/** A JSON-LD block bigger than this is a data dump, not a description of the page's image. */
const MAX_LD_JSON_CHARS = 200_000;

const LD_JSON_SCRIPT =
  /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;

const HTML_COMMENT = /<!--[\s\S]*?-->/g;

const extractLdJsonImages = (html: string): string[] => {
  const urls: string[] = [];
  // A parser ignores a commented-out <script>, so the pattern scan must too.
  for (const match of html.replace(HTML_COMMENT, "").matchAll(LD_JSON_SCRIPT)) {
    const text = match[1];
    if (!text || text.length > MAX_LD_JSON_CHARS) continue;
    if (!text.includes("image") && !text.includes("thumbnailUrl")) continue;
    try {
      collectLdJsonImages(JSON.parse(text), urls);
    } catch {
      // ignore invalid json-ld
    }
  }
  return urls;
};

/**
 * How much of an article page is read to find its card image. <head> comes first
 * and is a few KB to a few tens of KB; 256 KB is roomy and caps the cost of a
 * page that is mostly inline scripts. Reading the whole page (up to 24 MB) and
 * building a DOM of it cost ~21 MB of garbage per 500 KB page and ~50x the page
 * size live — the single largest per-item allocation in an ingestion run (#699).
 */
export const OG_PAGE_READ_BYTES = 256 * 1024;

export interface OpenGraphCandidates {
  /** Image URLs in preference order: og:image, secure_url, url, twitter:image, image_src, then JSON-LD. */
  urls: string[];
  alt: string | null;
}

/**
 * Finds the image URLs an article page advertises, parsing only what is needed:
 * a DOM of the <head> (the meta/link tags) plus a pattern scan for JSON-LD blocks
 * anywhere in the text it was given. The body is never turned into a DOM.
 *
 * Pure and exported so a fixture test can pin the candidate order; the page it is
 * given is the first OG_PAGE_READ_BYTES of the document, so a candidate that only
 * appears after that point is not seen.
 */
export const extractOpenGraphCandidates = (html: string): OpenGraphCandidates => {
  // `</head>` only — not `<body`, which also appears in comments (the CDC fixture mentions it in one above its
  // own <head>). A page with no `</head>` at all is read whole; it is already capped at OG_PAGE_READ_BYTES.
  const headEnd = html.search(/<\/head\s*>/i);
  const head = headEnd === -1 ? html : html.slice(0, headEnd);
  const $ = load(head);
  const urls = [
    $('meta[property="og:image"]').attr("content"),
    $('meta[property="og:image:secure_url"]').attr("content"),
    $('meta[property="og:image:url"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[name="twitter:image:src"]').attr("content"),
    $('link[rel="image_src"]').attr("href"),
    ...extractLdJsonImages(html),
  ].filter((value): value is string => typeof value === "string");
  return {
    urls,
    alt: $('meta[property="og:image:alt"]').attr("content")?.trim() || null,
  };
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
    // Only the start of the page is needed (see OG_PAGE_READ_BYTES).
    truncateAtBytes: OG_PAGE_READ_BYTES,
  });

  if (response.status < 200 || response.status >= 300) return null;

  const { urls: rawCandidates, alt } = extractOpenGraphCandidates(response.text);

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
      title: alt,
      url: localPath,
      sortOrder: 0,
    };
  }

  return null;
};
