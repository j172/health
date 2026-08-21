import { createHash } from "crypto";
import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";

// ---------------------------------------------------------------------------
// 元氣網（health.udn.com）— has no RSS feed of its own, so this scrapes the
// "最新文章" (newest) ranking page directly. Unlike the homepage
// (health.udn.com/health/index, which only surfaces the latest 6 items mixed
// in with unrelated "trending"/topic sections), /health/rank/newest/1005
// server-renders ~30 items with a full timestamp, category, a real summary
// paragraph, and a thumbnail — everything needed without ever requesting an
// article's own detail page. Full article bodies are deliberately never
// fetched/stored: udn.com is a commercial newspaper, and republishing full
// text carries meaningfully more copyright risk than the summary UDN itself
// already publishes on this listing page.
// ---------------------------------------------------------------------------

const FEED_CODE = "udn_health" as const;
const SOURCE_NAME = "udn_health";
const FEED_NAME = "元氣網（聯合報健康）";
const BASE_URL = "https://health.udn.com";
const LIST_URL = `${BASE_URL}/health/rank/newest/1005`;

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

const toAbsoluteUrl = (url: string, base: string): string => {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
};

export interface UdnHealthFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchUdnHealthNews = async (): Promise<UdnHealthFetchResult> => {
  let httpStatus: number | null = null;

  try {
    const response = await httpGetText(LIST_URL, {
      headers: {
        "User-Agent": "health.j172.tw-rss-ingestor/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeoutMs: 15_000,
    });

    httpStatus = response.status;
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`UDN health rank page HTTP ${response.status}`);
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seenExternalIds = new Set<string>();

    for (const el of $("li.pic-8to5-item__wrapper").toArray()) {
      const card = $(el);
      const anchor = card.find("a.pic-8to5-item__substance").first();
      const href = anchor.attr("href");
      if (!href) continue;

      // Story links look like /health/story/{categoryId}/{articleId}[?from=...] —
      // the (categoryId, articleId) pair is udn's own stable identifier for the
      // article, reused as our externalId so re-runs upsert instead of duplicating.
      const match = href.match(/\/health\/story\/(\d+)\/(\d+)/);
      if (!match) continue;
      const [, categoryId, articleId] = match;
      const externalId = `${categoryId}/${articleId}`;
      if (seenExternalIds.has(externalId)) continue;
      seenExternalIds.add(externalId);

      const title = (anchor.attr("title") || card.find(".pic-8to5-item__title").text() || "").replace(/\s+/g, " ").trim();
      if (!title) continue;

      const canonicalUrl = `${BASE_URL}/health/story/${categoryId}/${articleId}`;

      // The "note" line is "YYYY-MM-DD HH:MM:SS <category>", e.g.
      // "2026-08-01 10:01:42 抗老養生" — split the timestamp from the
      // trailing category label.
      const noteText = card.find(".pic-8to5-item__note").text().replace(/\s+/g, " ").trim();
      const noteMatch = noteText.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*(.*)$/);
      const publishedAtUtc = noteMatch ? parseTaipeiDateToUtc(noteMatch[1]) : null;
      const categoryRaw = noteMatch && noteMatch[2] ? noteMatch[2].trim() : null;

      const descriptionText = card.find(".pic-8to5-item__description").text().replace(/\s+/g, " ").trim();

      const imgEl = card.find("img").first();
      const rawImgSrc = imgEl.attr("data-src") || imgEl.attr("src") || null;
      const imgSrc = rawImgSrc ? toAbsoluteUrl(rawImgSrc, canonicalUrl) : null;

      // Downloaded and re-hosted locally (same as fetchDetailPage.ts) rather
      // than storing udn's pgw.udn.com.tw URL directly, so the front-end never
      // hotlinks a third-party image host.
      const assets: EnrichedRssItem["assets"] = [];
      if (imgSrc) {
         
        const localPath = await downloadArticleImage(imgSrc);
        if (localPath) {
          assets.push({ assetType: "image", title: imgEl.attr("alt")?.trim() || null, url: localPath, sortOrder: 0 });
        }
      }

      const payloadHash = sha256(
        JSON.stringify({
          title,
          canonicalUrl,
          descriptionText,
          categoryRaw,
          publishedAtUtc: publishedAtUtc?.toISOString() ?? null,
          imgSrc,
        }),
      );

      items.push({
        sourceName: SOURCE_NAME,
        feedCode: FEED_CODE,
        feedName: FEED_NAME,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: descriptionText,
        descriptionText,
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw,
        displayType: null,
        publishedAtUtc,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets,
        // SEO metadata is filled in by runIngestion.ts (via generateSeoMetadataWithAi)
        // only for new/changed items, same as the mirrormedia_healthnews path.
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
    const message = error instanceof Error ? error.message : "Unknown UDN health fetch error";
    return {
      ok: false,
      httpStatus,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};
