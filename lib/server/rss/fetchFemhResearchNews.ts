import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";
import { sha256 } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// 亞東紀念醫院 (femh.org.tw) — Far Eastern Memorial Hospital medical news,
// clinical research breakthroughs, and patient education announcements.
// ---------------------------------------------------------------------------

const FEED_CODE = "femh_research" as const;
const SOURCE_NAME = "femh";
const FEED_NAME = "亞東紀念醫院";
const BASE_URL = "https://www.femh.org.tw";

export interface FemhFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchFemhResearchNews = async (): Promise<FemhFetchResult> => {
  try {
    const listUrl = `${BASE_URL}/research/news?class=1`;
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
        errorMessage: `亞東紀念醫院 HTTP ${response.status}`,
      };
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seenIds = new Set<string>();

    const anchors = $("a[href*='news_detail']").toArray();

    for (const el of anchors) {
      const anchor = $(el);
      const rawHref = anchor.attr("href");
      if (!rawHref) continue;

      const newsNoMatch = rawHref.match(/NewsNo=(\d+)/i);
      const externalId = newsNoMatch ? newsNoMatch[1] : null;
      if (!externalId || seenIds.has(externalId)) continue;

      let fullUrl = rawHref;
      if (fullUrl.startsWith("..")) {
        fullUrl = `${BASE_URL}${fullUrl.replace(/^\.\./, "")}`;
      } else if (!fullUrl.startsWith("http")) {
        fullUrl = `${BASE_URL}${fullUrl.startsWith("/") ? "" : "/"}${fullUrl}`;
      }

      let text = anchor.text().trim();
      if (!text || text.length < 4) continue;
      seenIds.add(externalId);

      // Parse date if present: e.g. "2026/08/25"
      const dateMatch = text.match(/(\d{4})[/-](\d{2})[/-](\d{2})/);
      const publishedAtUtc = dateMatch
        ? parseTaipeiDateToUtc(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]} 00:00:00`)
        : null;

      // Clean title
      let title = text
        .replace(/^醫療新聞\s*/, "")
        .replace(/\d{4}[/-]\d{2}[/-]\d{2}\s*/, "")
        .replace(/\s*\.\.\.閱讀更多$/, "")
        .trim();

      const payloadHash = sha256(
        JSON.stringify({
          title,
          canonicalUrl: fullUrl,
          publishedAtUtc: publishedAtUtc?.toISOString() ?? null,
        }),
      );

      items.push({
        sourceName: SOURCE_NAME,
        feedCode: FEED_CODE,
        feedName: FEED_NAME,
        externalId,
        canonicalUrl: fullUrl,
        sourceUrl: fullUrl,
        title: title.replace(/\s+/g, " "),
        descriptionHtml: "",
        descriptionText: "",
        detailHtml: null,
        detailText: null,
        deptName: "醫療研究部",
        categoryRaw: "醫療新知",
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
      error instanceof Error ? error.message : "Unknown 亞東紀念醫院 fetch error";
    return {
      ok: false,
      httpStatus: null,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};

