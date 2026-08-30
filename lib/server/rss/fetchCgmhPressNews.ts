import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";
import { sha256 } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// 長庚紀念醫院－記者會與研究新聞稿 (cgmh.org.tw/tw/News/PressNewsList)
// ---------------------------------------------------------------------------

const FEED_CODE = "cgmh_press" as const;
const SOURCE_NAME = "cgmh";
const FEED_NAME = "長庚紀念醫院－新聞稿";
const BASE_URL = "https://www.cgmh.org.tw";

export interface CgmhPressFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchCgmhPressNews = async (): Promise<CgmhPressFetchResult> => {
  try {
    const listUrl = `${BASE_URL}/tw/News/PressNewsList`;
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
        errorMessage: `長庚醫院記者會新聞 HTTP ${response.status}`,
      };
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seenIds = new Set<string>();

    const anchors = $(
      "a[href*='research-activity.php'], a[href*='Press'], a[href*='Detail'], a[href*='Info']",
    ).toArray();

    for (const el of anchors) {
      const anchor = $(el);
      let href = anchor.attr("href");
      if (!href) continue;

      if (!href.startsWith("http")) {
        href = `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
      }

      const rawText =
        anchor.find("h2, h3, p, span, .title").first().text().trim() ||
        anchor.text().trim();

      if (!rawText || rawText.length < 5) continue;

      const dateMatch = rawText.match(/(\d{4})[/-](\d{2})[/-](\d{2})/);
      const publishedAtUtc = dateMatch
        ? parseTaipeiDateToUtc(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]} 00:00:00`)
        : null;

      const title = rawText
        .replace(/\d{4}[/-]\d{2}[/-]\d{2}\s*/, "")
        .replace(/\s+/g, " ")
        .trim();

      const externalId = sha256(`${href}-${title}`).slice(0, 20);
      if (seenIds.has(externalId)) continue;
      seenIds.add(externalId);

      const payloadHash = sha256(
        JSON.stringify({
          title,
          canonicalUrl: href,
          publishedAtUtc: publishedAtUtc?.toISOString() ?? null,
        }),
      );

      items.push({
        sourceName: SOURCE_NAME,
        feedCode: FEED_CODE,
        feedName: FEED_NAME,
        externalId,
        canonicalUrl: href,
        sourceUrl: href,
        title,
        descriptionHtml: "",
        descriptionText: "",
        detailHtml: null,
        detailText: null,
        deptName: "長庚紀念醫院",
        categoryRaw: "醫療研究新聞",
        displayType: null,
        publishedAtUtc,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets: [],
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
      error instanceof Error ? error.message : "Unknown 長庚醫院記者會新聞 fetch error";
    return {
      ok: false,
      httpStatus: null,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};

