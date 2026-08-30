import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { sha256 } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// 嬰兒與母親 (mababy.com) — Pregnancy, parenting, baby care, and maternal health.
// Summary + thumbnail only (skipDetailFetch policy).
// ---------------------------------------------------------------------------

const FEED_CODE = "mababy_news" as const;
const SOURCE_NAME = "mababy";
const FEED_NAME = "嬰兒與母親";
const BASE_URL = "https://www.mababy.com";

export interface MababyFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchMababyNews = async (): Promise<MababyFetchResult> => {
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
        errorMessage: `嬰兒與母親 HTTP ${response.status}`,
      };
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seenIds = new Set<string>();

    const articleAnchors = $(
      "a[href*='/knowledge-detail?id='], a[href*='/knowledge-detail/']",
    ).toArray();

    for (const el of articleAnchors) {
      const anchor = $(el);
      const href = anchor.attr("href");
      if (!href) continue;

      const idMatch = href.match(/id=(\d+)/) || href.match(/\/knowledge-detail\/(\d+)/);
      const externalId = idMatch ? idMatch[1] : href.replace(/[^a-zA-Z0-9_-]/g, "");
      if (!externalId || seenIds.has(externalId)) continue;

      const title =
        anchor.find("h2, h3, .title, p").first().text().trim() ||
        anchor.text().trim();

      if (!title || title.length < 4) continue;
      seenIds.add(externalId);

      const canonicalUrl = `${BASE_URL}/knowledge-detail?id=${externalId}`;
      const imgSrc =
        anchor.find("img").attr("src") ||
        anchor.find("img").attr("data-src") ||
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
          canonicalUrl,
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
        title: title.replace(/\s+/g, " "),
        descriptionHtml: "",
        descriptionText: "",
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: "育兒保健",
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
      error instanceof Error ? error.message : "Unknown 嬰兒與母親 fetch error";
    return {
      ok: false,
      httpStatus: null,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};

