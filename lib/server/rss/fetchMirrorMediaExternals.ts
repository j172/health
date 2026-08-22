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
/**
 * Mirror Media's own health category page.
 *
 * Replaces `api.mirrormedia.mg/externals?where={"partner":...}`, which had been
 * failing on every ingestion run (HTTP 400 from the host). That endpoint is
 * unreliable rather than merely moved: probing it directly, the plain
 * `?max_results=2` form answers 200 while any request carrying the `where=`
 * partner filter hangs until it times out.
 *
 * The category page is a Next.js app, so the post list is available as
 * structured JSON in its __NEXT_DATA__ payload — parsed instead of scraping the
 * DOM, because a rendered-markup scraper breaks on any visual redesign.
 */
const CATEGORY_URL = "https://www.mirrormedia.mg/category/health";

const STORY_BASE = "https://www.mirrormedia.mg/story/";

/** Shape of the slice of __NEXT_DATA__ this fetcher reads. */
interface MirrorNextDataPost {
  id?: unknown;
  slug?: unknown;
  title?: unknown;
  publishedDate?: unknown;
  brief?: { blocks?: { text?: unknown }[] };
  heroImage?: { resized?: { original?: unknown } };
  categories?: { name?: unknown }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sha256 = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

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
// Fetcher
// ---------------------------------------------------------------------------

export interface MirrorMediaFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchMirrorMediaHealthnews =
  async (): Promise<MirrorMediaFetchResult> => {
    let httpStatus: number | null = null;

    try {
      const response = await httpGetText(CATEGORY_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        },
        timeoutMs: 20_000,
      });

      httpStatus = response.status;

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Mirror Media category page HTTP ${response.status}`);
      }

      const nextData =
        /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(
          response.text,
        );
      if (!nextData) {
        throw new Error(
          "Mirror Media category page has no __NEXT_DATA__ payload (page structure changed)",
        );
      }

      let rawItems: MirrorNextDataPost[];
      try {
        const parsed = JSON.parse(nextData[1]) as {
          props?: { pageProps?: { posts?: MirrorNextDataPost[] } };
        };
        rawItems = parsed.props?.pageProps?.posts ?? [];
      } catch {
        throw new Error("Mirror Media __NEXT_DATA__ was not valid JSON");
      }
      const enrichedItems: EnrichedRssItem[] = [];

      for (const raw of rawItems) {
        // The slug is the article's stable identity and its URL; ids in this
        // payload are per-post but the slug is what /story/ resolves.
        const slug = str(raw.slug);
        const externalId = slug || str(raw.id);
        if (!externalId) continue;

        const canonicalUrl = slug
          ? `${STORY_BASE}${slug}`
          : `${STORY_BASE}${externalId}`;

        const sourceUrl = canonicalUrl;
        const title = str(raw.title);
        if (!title) continue; // skip items with no title

        // `brief` is a Draft.js-style block document, not HTML.
        const descriptionText = (raw.brief?.blocks ?? [])
          .map((block) => str(block?.text))
          .filter(Boolean)
          .join("\n")
          .trim();
        const descriptionHtml = descriptionText
          ? descriptionText
              .split("\n")
              .map((line) => `<p>${line}</p>`)
              .join("")
          : "";

        // The category listing carries no article body; the detail-page pass in
        // the ingestion pipeline fills it in from canonicalUrl.
        const detailHtml = null;
        const detailText = null;

        const publishedAtUtc = parsePublishedDate(raw.publishedDate);

        const thumbUrl = resolveImageUrl(raw.heroImage?.resized?.original);

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
        error instanceof Error
          ? error.message
          : "Unknown Mirror Media fetch error";
      return {
        ok: false,
        httpStatus,
        itemCount: 0,
        items: [],
        errorMessage: message,
      };
    }
  };
