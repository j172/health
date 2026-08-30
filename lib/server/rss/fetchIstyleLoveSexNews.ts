import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { sha256 } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// iStyle 兩性情愛（自由時報 istyle.ltn.com.tw/love-sex）— Intimacy, relationships,
// marriage, and emotional health articles.
// Summary + thumbnail only (skipDetailFetch policy for commercial media).
// ---------------------------------------------------------------------------

const FEED_CODE = "istyle_lovesex" as const;
const SOURCE_NAME = "istyle_lovesex";
const FEED_NAME = "iStyle 兩性情愛";
const BASE_URL = "https://istyle.ltn.com.tw";

export interface IstyleLoveSexFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchIstyleLoveSexNews = async (): Promise<IstyleLoveSexFetchResult> => {
  try {
    const listUrl = `${BASE_URL}/love-sex`;
    const response = await httpGetText(listUrl, {
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
        errorMessage: `iStyle 兩性情愛 HTTP ${response.status}`,
      };
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seenIds = new Set<string>();

    const anchors = $("a[href*='article/']").toArray();

    for (const el of anchors) {
      const anchor = $(el);
      const rawHref = anchor.attr("href");
      if (!rawHref) continue;

      const idMatch = rawHref.match(/article\/(\d+)/);
      const externalId = idMatch ? idMatch[1] : null;
      if (!externalId || seenIds.has(externalId)) continue;

      const title =
        anchor.find("h2, h3, p, span").first().text().trim() ||
        anchor.text().trim();

      // Skip empty or navigation texts like "(Read more)"
      if (!title || title.length < 5 || title.includes("(Read more)")) continue;
      seenIds.add(externalId);

      const canonicalUrl = `${BASE_URL}/article/${externalId}`;

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
        categoryRaw: "兩性情愛",
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
      error instanceof Error ? error.message : "Unknown iStyle 兩性情愛 fetch error";
    return {
      ok: false,
      httpStatus: null,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};

