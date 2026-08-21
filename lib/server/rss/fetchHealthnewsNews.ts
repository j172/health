import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { sha256, toAbsoluteUrl } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// 健康醫療網（healthnews.com.tw）— has no RSS feed of its own (confirmed:
// /rss redirects to a bare CodeIgniter welcome page, not a feed), so this
// scrapes the homepage's "編輯精選" block — `a[href^="/article/"] > img +
// div.a1`, chosen over the visually similar `.a1-title` sidebar-widget
// markup further down the same page, which repeats the same articles but
// truncates titles with "…".
//
// Unlike every other source in this pipeline, no per-article publish
// timestamp is exposed anywhere on this homepage (checked: no <span
// class="date">-style element near any article block; the page footer only
// has a page-render timestamp, not per-article). A `/channel/all` archive
// page was tried as a possible richer listing (same idea as UDN's
// /health/rank/newest page) but returned an empty response. So
// `publishedAtUtc` is deliberately left null here — `lib/server/news/
// queries.ts`'s `ORDER BY COALESCE(published_at_utc, created_at) DESC`
// already falls back to insertion time for every listing that matters
// (the main /news feed, source archives, etc.), so this shows up sorted by
// "when we first saw it" instead of "when it was actually published" — a
// known, accepted gap for this source only (see Phase 8 spec, open item).
// The one place this silently excludes an item rather than falling back is
// the Google News Sitemap query (WHERE published_at_utc >= cutoff), which
// is the correct behavior for an article with no confirmed publish date.
//
// Full article bodies are never fetched/stored: healthnews.com.tw is a
// commercial media outlet, same copyright stance as udn_health/ltn/
// top1health.
// ---------------------------------------------------------------------------

const FEED_CODE = "healthnews_tw" as const;
const SOURCE_NAME = "healthnews";
const FEED_NAME = "健康醫療網";
const BASE_URL = "https://www.healthnews.com.tw";
const LIST_URL = `${BASE_URL}/`;

export interface HealthnewsFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchHealthnewsNews = async (): Promise<HealthnewsFetchResult> => {
  let httpStatus: number | null = null;

  try {
    const response = await httpGetText(LIST_URL, {
      headers: {
        "User-Agent": "health.j172.tw-rss-ingestor/1.0",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeoutMs: 15_000,
    });

    httpStatus = response.status;
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`healthnews.com.tw page HTTP ${response.status}`);
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seenExternalIds = new Set<string>();

    for (const el of $('a[href^="/article/"]').toArray()) {
      const anchor = $(el);
      const href = anchor.attr("href");
      if (!href) continue;

      const match = href.match(/^\/article\/(\d+)$/);
      if (!match) continue;
      const externalId = match[1];
      if (seenExternalIds.has(externalId)) continue;

      const title = anchor
        .find("div.a1")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      if (!title) continue; // skips the truncated .a1-title sidebar-widget variants of these same articles

      seenExternalIds.add(externalId);

      const canonicalUrl = toAbsoluteUrl(href, BASE_URL);
      const imgEl = anchor.find("img").first();
      const rawImgSrc = imgEl.attr("src") || null;
      const imgSrc = rawImgSrc ? toAbsoluteUrl(rawImgSrc, canonicalUrl) : null;

      const assets: EnrichedRssItem["assets"] = [];
      if (imgSrc) {
        const localPath = await downloadArticleImage(imgSrc);
        if (localPath) {
          assets.push({
            assetType: "image",
            title: null,
            url: localPath,
            sortOrder: 0,
          });
        }
      }

      const payloadHash = sha256(
        JSON.stringify({ title, canonicalUrl, imgSrc }),
      );

      items.push({
        sourceName: SOURCE_NAME,
        feedCode: FEED_CODE,
        feedName: FEED_NAME,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: "",
        descriptionText: "",
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: null,
        displayType: null,
        publishedAtUtc: null, // see module comment — no publish timestamp available from this source
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets,
        metaTitle: "",
        metaDescription: "",
        keywords: "",
        geoSummary: "",
      });
    }

    return {
      ok: true,
      httpStatus,
      itemCount: items.length,
      items,
      errorMessage: null,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown healthnews.com.tw fetch error";
    return {
      ok: false,
      httpStatus,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};
