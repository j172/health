import { createHash } from "crypto";
import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FEED_CODE = "mirrormedia_healthnews" as const;
const SOURCE_NAME = "mirrormedia_healthnews";
const FEED_NAME = "鏡週刊健康醫療網";
const PARTNER_ID = "5b8e031b34cc3f100061b216";
const MAX_RESULTS = 30;

const API_URL =
  `https://api.mirrormedia.mg/externals` +
  `?where=%7B%22partner%22%3A%22${PARTNER_ID}%22%7D` +
  `&max_results=${MAX_RESULTS}` +
  `&sort=-publishedDate`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sha256 = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : "";

const htmlToText = (html: string): string => {
  if (!html) return "";
  const $ = load(html);
  return $.text().replace(/\s+/g, " ").trim();
};

/** Resolve a Mirror Media image URL that may be a relative path. */
const resolveImageUrl = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  if (s.startsWith("http")) return s;
  return `https://www.mirrormedia.mg${s}`;
};

/** Parse the Mirror Media ISO-8601 publishedDate (e.g. "2024-08-01T03:00:00.000Z"). */
const parsePublishedDate = (v: unknown): Date | null => {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

// ---------------------------------------------------------------------------
// Types for the raw Eve REST response
// ---------------------------------------------------------------------------

interface MirrorExternalItem {
  _id?: string;
  name?: string;          // e.g. "healthnews_12345" — used to build the slug
  slug?: string;          // alias of name in some responses
  title?: string;
  brief?: {
    html?: string;
    md?: string;
  };
  content?: string;       // full article HTML
  publishedDate?: string; // ISO-8601
  thumb?: string;         // thumbnail URL (may be relative)
  source?: string;        // original source URL (healthnews.com.tw)
  categories?: Array<{ name?: string }>;
  // heroImage exists in some responses as a fallback
  heroImage?: {
    image?: {
      resizedTargets?: {
        mobile?: { url?: string };
        tablet?: { url?: string };
      };
    };
  };
}

interface EveResponse {
  _items?: MirrorExternalItem[];
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

export interface MirrorMediaFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchMirrorMediaHealthnews = async (): Promise<MirrorMediaFetchResult> => {
  let httpStatus: number | null = null;

  try {
    const response = await httpGetText(API_URL, {
      headers: {
        "User-Agent": "health.j172.tw-rss-ingestor/1.0",
        Accept: "application/json",
      },
      timeoutMs: 15_000,
    });

    httpStatus = response.status;

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Mirror Media API HTTP ${response.status}`);
    }

    let parsed: EveResponse;
    try {
      parsed = JSON.parse(response.text) as EveResponse;
    } catch {
      throw new Error("Mirror Media API returned non-JSON response");
    }

    const rawItems = parsed._items ?? [];
    const enrichedItems: EnrichedRssItem[] = [];

    for (const raw of rawItems) {
      const externalId = str(raw._id);
      if (!externalId) continue;

      // Build canonical URL from `name` or `slug` field
      const nameSlug = str(raw.name) || str(raw.slug);
      const canonicalUrl = nameSlug
        ? `https://www.mirrormedia.mg/external/${nameSlug}`
        : `https://www.mirrormedia.mg/external/${externalId}`;

      const sourceUrl = str(raw.source) || canonicalUrl;
      const title = str(raw.title);
      if (!title) continue; // skip items with no title

      const descriptionHtml = raw.brief?.html ?? "";
      const descriptionText = descriptionHtml
        ? htmlToText(descriptionHtml)
        : htmlToText(str(raw.brief?.md));

      const detailHtml = str(raw.content) || null;
      const detailText = detailHtml ? htmlToText(detailHtml) : null;

      const publishedAtUtc = parsePublishedDate(raw.publishedDate);

      // Resolve thumbnail: prefer `thumb`, fall back to heroImage
      const thumbUrl =
        resolveImageUrl(raw.thumb) ??
        resolveImageUrl(raw.heroImage?.image?.resizedTargets?.tablet?.url) ??
        resolveImageUrl(raw.heroImage?.image?.resizedTargets?.mobile?.url);

      const assets: EnrichedRssItem["assets"] = thumbUrl
        ? [{ assetType: "image", title: null, url: thumbUrl, sortOrder: 0 }]
        : [];

      const categoryRaw =
        (raw.categories ?? [])
          .map((c) => str(c.name))
          .filter(Boolean)
          .join(",") || null;

      // Payload hash — covers all mutable fields so any edit triggers an update
      const payloadHash = sha256(
        JSON.stringify({
          title,
          canonicalUrl,
          sourceUrl,
          descriptionHtml,
          detailHtml,
          categoryRaw,
          publishedAtUtc: publishedAtUtc?.toISOString() ?? null,
          thumbUrl,
        }),
      );

      enrichedItems.push({
        sourceName: SOURCE_NAME,
        feedCode: FEED_CODE,
        feedName: FEED_NAME,
        externalId,
        canonicalUrl,
        sourceUrl,
        title,
        descriptionHtml,
        descriptionText,
        detailHtml,
        detailText,
        deptName: null,
        categoryRaw,
        displayType: null,
        publishedAtUtc,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets,
        // SEO metadata will be generated by generateSeoMetadataWithAi below if needed.
        // We pass empty strings so that the enrichItem path in runIngestion is bypassed
        // entirely — this fetcher returns EnrichedRssItem directly.
        metaTitle: "",
        metaDescription: "",
        keywords: "",
        geoSummary: "",
      });
    }

    return {
      ok: true,
      httpStatus,
      itemCount: enrichedItems.length,
      items: enrichedItems,
      errorMessage: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Mirror Media fetch error";
    return {
      ok: false,
      httpStatus,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};
