import "server-only";
import { load } from "cheerio";
import type { EnrichedRssItem, NewsAsset } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { sha256 } from "@/lib/server/rss/scraperUtils";
import type { ExpandedSourceFetchResult } from "@/lib/server/rss/fetchExpandedSources";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export interface RawMocNewsItem {
  ArticleType?: string;
  FileName?: string;
  Link?: string;
  Source?: string;
  title?: string;
  內容?: string;
  開始日期?: string;
  上版日期?: string;
  相關檔案?: string;
  相關連結?: string;
  相關圖片?: string;
  點擊數?: string;
}

/**
 * Parses Taiwan MOC date format: "YYYY/M/D [上午|下午] hh:mm:ss" or ISO strings.
 * MOC timestamps are Taipei time (UTC+8).
 */
export const parseMocDateToUtc = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const m = trimmed.match(
    /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s+(上午|下午)\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    const day = Number(m[3]);
    let hour = m[5] ? Number(m[5]) : 0;
    const minute = m[6] ? Number(m[6]) : 0;
    const second = m[7] ? Number(m[7]) : 0;

    if (m[4] === "下午" && hour < 12) hour += 12;
    if (m[4] === "上午" && hour === 12) hour = 0;

    // Convert Taipei time (UTC+8) to UTC
    const utcMillis = Date.UTC(year, month, day, hour - 8, minute, second);
    const date = new Date(utcMillis);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const iso = new Date(trimmed);
  return Number.isNaN(iso.getTime()) ? null : iso;
};

/**
 * Parses the semicolon-separated "相關圖片" field from MOC OpenData:
 * Format: "Caption (https://url);Caption2 (https://url2);"
 */
export const parseMocAssets = (rawImages: string | null | undefined): NewsAsset[] => {
  if (!rawImages) return [];
  const assets: NewsAsset[] = [];
  const matches = rawImages.matchAll(/(.*?)\((https?:\/\/[^\s)]+)\);?/g);
  let sortOrder = 0;

  for (const match of matches) {
    const title = match[1].trim() || null;
    const url = match[2].trim();
    if (url) {
      assets.push({
        assetType: "image",
        title,
        url,
        sortOrder: sortOrder++,
      });
    }
  }

  return assets;
};

export interface ParseMocOptions {
  maxItems?: number;
  maxAgeDays?: number;
  now?: Date;
}

/**
 * Parses MOC OpenData JSON array into EnrichedRssItem list.
 * Limits to the latest maxItems within maxAgeDays (default: 50 items, past 30 days).
 */
export const parseMocOpenDataJson = (
  jsonText: string,
  options: ParseMocOptions = {}
): EnrichedRssItem[] => {
  const { maxItems = 50, maxAgeDays = 30, now = new Date() } = options;
  const cutoffTime = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;

  let rawList: RawMocNewsItem[];
  try {
    const cleaned = jsonText.trim().replace(/^\uFEFF/, "");
    rawList = JSON.parse(cleaned);
  } catch (err) {
    console.error("[parseMocOpenDataJson] JSON parse error:", err);
    return [];
  }

  if (!Array.isArray(rawList)) return [];

  const candidates: Array<{ raw: RawMocNewsItem; publishedAtUtc: Date }> = [];
  const seenUrls = new Set<string>();

  for (const raw of rawList) {
    const title = (raw.title || "").trim().replace(/\s+/g, " ");
    if (!title || title.length < 4) continue;

    const canonicalUrl = (raw.Source || raw.Link || "").trim();
    if (!canonicalUrl || seenUrls.has(canonicalUrl)) continue;
    seenUrls.add(canonicalUrl);

    const publishedAtUtc = parseMocDateToUtc(raw.上版日期 || raw.開始日期);
    if (!publishedAtUtc) continue;

    // Filter by freshness cutoff
    if (publishedAtUtc.getTime() < cutoffTime) continue;

    candidates.push({ raw, publishedAtUtc });
  }

  // Sort descending by publication date
  candidates.sort((a, b) => b.publishedAtUtc.getTime() - a.publishedAtUtc.getTime());

  // Cap to maxItems (latest 50)
  const topCandidates = candidates.slice(0, maxItems);
  const items: EnrichedRssItem[] = [];

  for (const { raw, publishedAtUtc } of topCandidates) {
    const title = (raw.title || "").trim().replace(/\s+/g, " ");
    const canonicalUrl = (raw.Source || raw.Link || "").trim();
    const detailHtml = (raw.內容 || "").trim() || null;

    let descriptionText = "";
    if (detailHtml) {
      try {
        const $ = load(detailHtml);
        descriptionText = $("p, div, span").first().text().trim().replace(/\s+/g, " ") || $.text().trim().replace(/\s+/g, " ");
      } catch {
        descriptionText = detailHtml.replace(/<[^>]*>/g, " ").trim().replace(/\s+/g, " ");
      }
    }
    if (descriptionText.length > 200) {
      descriptionText = `${descriptionText.slice(0, 197)}...`;
    }

    const assets = parseMocAssets(raw.相關圖片);
    const externalId =
      canonicalUrl.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "") ||
      sha256(canonicalUrl).slice(0, 16);
    const payloadHash = sha256(JSON.stringify({ title, canonicalUrl, publishedAtUtc }));

    items.push({
      sourceName: "moc",
      feedCode: "moc_news",
      feedName: "文化部",
      externalId,
      canonicalUrl,
      sourceUrl: canonicalUrl,
      title,
      descriptionHtml: descriptionText,
      descriptionText,
      detailHtml,
      detailText: descriptionText,
      deptName: "文化部",
      categoryRaw: "官方政令",
      displayType: "article",
      publishedAtUtc,
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

  return items;
};

/**
 * Fetches and parses latest press releases from the Ministry of Culture OpenData API.
 */
export async function fetchMocNews(): Promise<ExpandedSourceFetchResult> {
  const url = "https://www.moc.gov.tw/OpenData.aspx?SN=154A1DF113F52308";
  try {
    const res = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 30_000 });
    if (res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        httpStatus: res.status,
        itemCount: 0,
        items: [],
        errorMessage: `HTTP ${res.status}`,
      };
    }
    const items = parseMocOpenDataJson(res.text);
    return {
      ok: true,
      httpStatus: res.status,
      itemCount: items.length,
      items,
      errorMessage: null,
    };
  } catch (error: any) {
    return {
      ok: false,
      httpStatus: null,
      itemCount: 0,
      items: [],
      errorMessage: error.message || "Unknown error",
    };
  }
}
