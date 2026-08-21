import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";
import { sha256, toAbsoluteUrl } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// 祝你健康（health.setn.com, 三立新聞網）— has no RSS feed of its own
// (confirmed: /rss.aspx and /RssFeed.aspx both 302 to unrelated pages), so
// this scrapes the homepage's "conArea" list directly, same pattern as
// fetchUdnHealthNews.ts. That block is a reverse-chronological "最新" list
// with a real per-item timestamp — deliberately not the `newsCarousel`
// block near the top of the page, which is curated/not time-ordered and has
// no timestamp at all.
//
// "祝你健康" (not "健康2.0") is the confirmed branding — the page <title>
// and every video item's alt text end in "｜祝你健康".
//
// Full article bodies are never fetched/stored: SETN is a commercial news
// network, same copyright stance as udn_health/ltn/top1health.
// ---------------------------------------------------------------------------

const FEED_CODE = "setn_health" as const;
const SOURCE_NAME = "setn";
const FEED_NAME = "祝你健康";
const BASE_URL = "https://health.setn.com";
const LIST_URL = `${BASE_URL}/`;

export interface SetnHealthFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchSetnHealthNews = async (): Promise<SetnHealthFetchResult> => {
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
      throw new Error(`SETN health page HTTP ${response.status}`);
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seenExternalIds = new Set<string>();

    for (const el of $("div.conArea div.conBox.ShadowBox").toArray()) {
      const card = $(el);
      const anchor = card.find('a[href^="/news/"]').first();
      const href = anchor.attr("href");
      if (!href) continue;

      const match = href.match(/^\/news\/(\d+)/);
      if (!match) continue;
      const externalId = match[1];
      if (seenExternalIds.has(externalId)) continue;
      seenExternalIds.add(externalId);

      const title = anchor
        .find("h3")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      if (!title) continue;

      const canonicalUrl = `${BASE_URL}/news/${externalId}`;

      const timeText = anchor
        .find("span.newsTimer")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      const timeMatch = timeText.match(
        /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/,
      );
      const publishedAtUtc = timeMatch
        ? parseTaipeiDateToUtc(
            `${timeMatch[1]}-${timeMatch[2]}-${timeMatch[3]} ${timeMatch[4]}:${timeMatch[5]}:00`,
          )
        : null;

      const imgEl = anchor.find("img").first();
      const rawImgSrc =
        imgEl.attr("data-original") || imgEl.attr("src") || null;
      const imgSrc = rawImgSrc ? toAbsoluteUrl(rawImgSrc, canonicalUrl) : null;

      // Downloaded and re-hosted locally rather than hotlinking
      // attach.setn.com — same treatment as fetchUdnHealthNews.ts.
      const assets: EnrichedRssItem["assets"] = [];
      if (imgSrc) {
        const localPath = await downloadArticleImage(imgSrc);
        if (localPath) {
          assets.push({
            assetType: "image",
            title: imgEl.attr("alt")?.trim() || null,
            url: localPath,
            sortOrder: 0,
          });
        }
      }

      const payloadHash = sha256(
        JSON.stringify({
          title,
          canonicalUrl,
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
        descriptionHtml: "",
        descriptionText: "",
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: null,
        displayType: null,
        publishedAtUtc,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets,
        // SEO metadata is filled in by runIngestion.ts (via generateSeoMetadataWithAi)
        // only for new/changed items, same as the other special sources.
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
        : "Unknown SETN health fetch error";
    return {
      ok: false,
      httpStatus,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};
