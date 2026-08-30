import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";
import { sha256 } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// 長庚紀念醫院－活動與衛教最新消息 (cgmh.org.tw/tw/News/List/B)
// ---------------------------------------------------------------------------

const FEED_CODE = "cgmh_news" as const;
const SOURCE_NAME = "cgmh";
const FEED_NAME = "長庚紀念醫院－活動與衛教";
const BASE_URL = "https://www.cgmh.org.tw";

export interface CgmhNewsFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchCgmhNews = async (): Promise<CgmhNewsFetchResult> => {
  try {
    const listUrl = `${BASE_URL}/tw/News/List/B`;
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
        errorMessage: `長庚醫院活動消息 HTTP ${response.status}`,
      };
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seenIds = new Set<string>();

    const anchors = $(
      "a[href*='/tw/News/Info/'], a[href*='/tw/News/Detail/'], a[href*='/tw/News/Article/']",
    ).toArray();

    for (const el of anchors) {
      const anchor = $(el);
      let href = anchor.attr("href");
      if (!href) continue;

      if (!href.startsWith("http")) {
        href = `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
      }

      const idMatch = href.match(/\/(B|\w+)\/(\d+)/);
      const externalId = idMatch ? `cgmh-b-${idMatch[2]}` : sha256(href).slice(0, 16);
      if (seenIds.has(externalId)) continue;

      const rawText =
        anchor.find("h2, h3, p, span, .title").first().text().trim() ||
        anchor.text().trim();

      if (!rawText || rawText.length < 5) continue;
      seenIds.add(externalId);

      // Extract date if present: e.g. "2026-08-27"
      const dateMatch = rawText.match(/(\d{4})[/-](\d{2})[/-](\d{2})/);
      const publishedAtUtc = dateMatch
        ? parseTaipeiDateToUtc(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]} 00:00:00`)
        : null;

      const title = rawText
        .replace(/\d{4}[/-]\d{2}[/-]\d{2}\s*/, "")
        .replace(/\s+/g, " ")
        .trim();

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
        categoryRaw: "衛教活動",
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
      error instanceof Error ? error.message : "Unknown 長庚醫院活動消息 fetch error";
    return {
      ok: false,
      httpStatus: null,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};

