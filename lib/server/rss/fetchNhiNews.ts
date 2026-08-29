import { createHash } from "crypto";
import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";

const NHI_LIST_URL = "https://www.nhi.gov.tw/ch/lp-3255-1.html";
const NHI_BASE_URL = "https://www.nhi.gov.tw";
const FEED_CODE = "nhi_web" as const;
const SOURCE_NAME = "nhi";
const FEED_NAME = "中央健康保險署－新聞發布";

const sha256 = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

export interface NhiNewsFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchNhiNewsHtml = async (): Promise<NhiNewsFetchResult> => {
  let httpStatus: number | null = null;
  try {
    const response = await httpGetText(NHI_LIST_URL, {
      timeoutMs: 15_000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    httpStatus = response.status;
    if (response.status < 200 || response.status >= 300 || !response.text) {
      throw new Error(`NHI web HTTP ${response.status}`);
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];

    // Table rows or list items in lp-3255-1.html
    $("table tbody tr, .list ul li, .lp table tr").each((_, el) => {
      const linkEl = $(el).find("a");
      const title = linkEl.text().trim();
      const href = linkEl.attr("href");

      if (!title || !href) return;

      const dateText = $(el).find("td:nth-child(2), .date, td.date").text().trim() ||
        $(el).text().match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/)?.[0] || "";

      const canonicalUrl = new URL(href, NHI_BASE_URL).toString();
      const externalId = sha256(canonicalUrl).slice(0, 16);
      const publishedAtUtc = dateText ? parseTaipeiDateToUtc(dateText) : new Date();

      const payloadHash = sha256(
        JSON.stringify({
          title,
          canonicalUrl,
          publishedAtUtc: publishedAtUtc?.toISOString() || "",
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
        descriptionHtml: title,
        descriptionText: title,
        detailHtml: null,
        detailText: null,
        deptName: "中央健康保險署",
        categoryRaw: "新聞稿",
        displayType: null,
        publishedAtUtc: publishedAtUtc || new Date(),
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets: [],
        metaTitle: "",
        metaDescription: "",
        keywords: "",
        geoSummary: "",
      });
    });

    return {
      ok: true,
      httpStatus,
      itemCount: items.length,
      items,
      errorMessage: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "NHI scrape error";
    return {
      ok: false,
      httpStatus,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};

