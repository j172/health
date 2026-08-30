import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { sha256 } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// TVBS 健康2.0 (health.tvbs.com.tw) — Medical news, health trends, nutrition,
// and disease prevention.
// Summary + thumbnail only (skipDetailFetch policy for commercial media).
// ---------------------------------------------------------------------------

const FEED_CODE = "tvbs_health" as const;
const SOURCE_NAME = "tvbs_health";
const FEED_NAME = "TVBS 健康2.0";
const BASE_URL = "https://health.tvbs.com.tw";

export interface TvbsHealthFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchTvbsHealthNews = async (): Promise<TvbsHealthFetchResult> => {
  try {
    const response = await httpGetText(BASE_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeoutMs: 15_000,
    });

    if (response.status < 200 || response.status >= 300) {
      return {
        ok: false,
        httpStatus: response.status,
        itemCount: 0,
        items: [],
        errorMessage: `TVBS 健康2.0 HTTP ${response.status}`,
      };
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seenIds = new Set<string>();

    const anchors = $(
      "a[href*='/medical/'], a[href*='/nutrition/'], a[href*='/regimen/'], a[href*='/article/']",
    ).toArray();

    for (const el of anchors) {
      const anchor = $(el);
      let href = anchor.attr("href");
      if (!href) continue;

      if (!href.startsWith("http")) {
        href = `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
      }

      const idMatch = href.match(/\/(medical|nutrition|regimen|article)\/(\d+)/);
      if (!idMatch) continue;
      const externalId = `${idMatch[1]}-${idMatch[2]}`;
      if (seenIds.has(externalId)) continue;

      const title =
        anchor.find("h2, h3, p, span, .title").first().text().trim() ||
        anchor.text().trim();

      if (!title || title.length < 6) continue;
      seenIds.add(externalId);

      const category =
        idMatch[1] === "medical"
          ? "醫療新知"
          : idMatch[1] === "nutrition"
            ? "營養飲食"
            : "養生保健";

      const imgSrc =
        anchor.find("img").attr("src") ||
        anchor.find("img").attr("data-src") ||
        anchor.find("img").attr("data-original") ||
        null;

      const assets: EnrichedRssItem["assets"] = [];
      if (imgSrc && imgSrc.startsWith("http")) {
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
        JSON.stringify({
          title,
          canonicalUrl: href,
          imgSrc,
        }),
      );

      items.push({
        sourceName: SOURCE_NAME,
        feedCode: FEED_CODE,
        feedName: FEED_NAME,
        externalId,
        canonicalUrl: href,
        sourceUrl: href,
        title: title.replace(/\s+/g, " "),
        descriptionHtml: "",
        descriptionText: "",
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: category,
        displayType: null,
        publishedAtUtc: null,
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
      httpStatus: response.status,
      itemCount: items.length,
      items,
      errorMessage: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown TVBS 健康2.0 fetch error";
    return {
      ok: false,
      httpStatus: null,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};
