import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText, httpRequest } from "@/lib/server/net/httpClient";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";
import { sha256 } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// 數位發展部－新聞發布 (https://moda.gov.tw/press/press-releases/372)
// ---------------------------------------------------------------------------

export const FEED_CODE = "moda_press" as const;
export const SOURCE_NAME = "moda";
export const FEED_NAME = "數位發展部－新聞發布";
export const BASE_URL = "https://moda.gov.tw";
export const API_URL = "https://www-api.moda.gov.tw/WebsiteList/NewsList";

export interface ModaNewsFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export interface FetchModaNewsOptions {
  /**
   * Number of pages to fetch (default: 1).
   * Page 1 is retrieved via GET on the public SSR page.
   * If > 1, subsequent pages are fetched via the internal WebsiteList/NewsList API.
   */
  pages?: number;
}

/**
 * Pure parser for moda.gov.tw press release HTML snippet or full document.
 */
export const parseModaHtml = (html: string): EnrichedRssItem[] => {
  const $ = load(html);
  const items: EnrichedRssItem[] = [];
  const seenUrls = new Set<string>();

  $("li.list-group-item").each((_, el) => {
    const anchor = $(el).find("a.listCon");
    if (!anchor.length) return;

    let href = anchor.attr("href")?.trim();
    if (!href) return;

    if (!href.startsWith("http")) {
      href = `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
    }

    if (seenUrls.has(href)) return;
    seenUrls.add(href);

    const titleEl = anchor.find(".title5, b, .titleTxt").first();
    let title = (titleEl.length ? titleEl.text() : anchor.text()).trim();
    if (!title) {
      const fallbackTitle = anchor.attr("title")?.replace(/^移至/, "")?.trim();
      if (fallbackTitle) title = fallbackTitle;
    }
    title = title.replace(/\s+/g, " ").trim();
    if (!title || title.length < 2) return;

    const rawDate = $(el).find(".listDate").text().trim();
    const dateMatch = rawDate.match(/(\d{4})[/-](\d{2})[/-](\d{2})/);
    const publishedAtUtc = dateMatch
      ? parseTaipeiDateToUtc(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]} 00:00:00`)
      : null;

    const deptName = $(el).find(".listUnit").text().trim() || null;
    const tags = $(el)
      .find(".listTag2 a")
      .map((_, tagEl) => $(tagEl).text().trim())
      .get()
      .filter(Boolean)
      .join(", ") || null;

    const urlIdMatch = href.match(/\/(\d+)(?:[/?#]|$)/);
    const externalId = urlIdMatch ? urlIdMatch[1] : sha256(href).slice(0, 20);

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
      descriptionText: tags ? `【${deptName ?? "數位發展部"}】${tags}` : (deptName ? `【${deptName}】` : ""),
      detailHtml: null,
      detailText: null,
      deptName: deptName || "數位發展部",
      categoryRaw: tags || "新聞發布",
      displayType: null,
      publishedAtUtc,
      publicBeginAtTaipei: null,
      publicEndAtTaipei: null,
      payloadHash,
      assets: [],
      metaTitle: "",
      metaDescription: "",
      keywords: tags || "",
      geoSummary: "",
    });
  });

  return items;
};

export const DEFAULT_DEPARTMENTS = [
  "M",
  "M7000",
  "M5000",
  "M6000",
  "M4000",
  "M2000",
  "M3000",
  "S",
  "I",
];

export const fetchModaNews = async (
  options: FetchModaNewsOptions = {},
): Promise<ModaNewsFetchResult> => {
  const pages = Math.max(1, options.pages ?? 1);
  const allItems: EnrichedRssItem[] = [];
  const seenIds = new Set<string>();
  let lastStatus = 200;

  try {
    for (let page = 1; page <= pages; page++) {
      let html = "";
      if (page === 1) {
        const response = await httpGetText(`${BASE_URL}/press/press-releases/372`, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          timeoutMs: 15_000,
        });
        lastStatus = response.status;
        if (response.status < 200 || response.status >= 300) {
          if (allItems.length === 0) {
            return {
              ok: false,
              httpStatus: response.status,
              itemCount: 0,
              items: [],
              errorMessage: `數位發展部新聞發布首頁 HTTP ${response.status}`,
            };
          }
          break;
        }
        html = response.text;
      } else {
        const body = JSON.stringify({
          Lang: "zh-tw",
          MainSN: 372,
          P: page,
          DisplayCount: 15,
          Dep: DEFAULT_DEPARTMENTS,
        });
        const response = await httpRequest(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(Buffer.byteLength(body)),
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
          body,
          timeoutMs: 15_000,
        });
        lastStatus = response.status;
        if (response.status < 200 || response.status >= 300) {
          break;
        }
        html = response.buffer.toString("utf-8");
      }

      const pageItems = parseModaHtml(html);
      if (pageItems.length === 0) break;

      for (const item of pageItems) {
        if (!seenIds.has(item.externalId)) {
          seenIds.add(item.externalId);
          allItems.push(item);
        }
      }
    }

    return {
      ok: true,
      httpStatus: lastStatus,
      itemCount: allItems.length,
      items: allItems,
      errorMessage: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown 數位發展部新聞 fetch error";
    return {
      ok: allItems.length > 0,
      httpStatus: allItems.length > 0 ? 200 : null,
      itemCount: allItems.length,
      items: allItems,
      errorMessage: allItems.length > 0 ? null : message,
    };
  }
};
