import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";
import { sha256 } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// 世新大學 (shu.edu.tw) — 校園焦點專區、教育學術與公共事務新聞
// 爬取 https://www.shu.edu.tw/Spotlight-List.aspx 列表
// ---------------------------------------------------------------------------

const FEED_CODE = "shih_hsin" as const;
const SOURCE_NAME = "shih_hsin";
const FEED_NAME = "世新大學";
const BASE_URL = "https://www.shu.edu.tw";
const LIST_URL = `${BASE_URL}/Spotlight-List.aspx`;

export interface ShihHsinFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const parseShihHsinHtml = (
  html: string,
  nowUtc: Date = new Date(),
): Array<{
  sId: string;
  title: string;
  url: string;
  imageUrl: string | null;
  publishedAtUtc: Date;
}> => {
  const $ = load(html);
  const items: Array<{
    sId: string;
    title: string;
    url: string;
    imageUrl: string | null;
    publishedAtUtc: Date;
  }> = [];

  const seenIds = new Set<string>();

  // 列表項位於 .ctabox-aa-box 內
  $(".ctabox-aa-box").each((_, el) => {
    const box = $(el);
    const linkEl = box.find("a[href*='Spotlight.aspx']").first();
    const rawHref = linkEl.attr("href") || "";
    const sIdMatch = rawHref.match(/sID=(\d+)/i);
    const sId = sIdMatch ? sIdMatch[1] : "";

    if (!sId || seenIds.has(sId)) return;
    seenIds.add(sId);

    // 取得標題
    let title = box.find("p.qsty-b a").text().trim();
    if (!title) {
      title = box.find("img").attr("alt")?.trim() || "";
    }
    if (!title) return;

    // 取得圖片連結
    let imgSrc = box.find("img").attr("src")?.trim() || null;
    if (imgSrc && !imgSrc.startsWith("http")) {
      imgSrc = imgSrc.startsWith("/")
        ? `${BASE_URL}${imgSrc}`
        : `${BASE_URL}/${imgSrc}`;
    }

    // 從圖片路徑推估日期 (例如 202609151.jpg -> 2026-09-15)
    let publishedAtUtc = nowUtc;
    if (imgSrc) {
      const dateMatch = imgSrc.match(
        /(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/,
      );
      if (dateMatch) {
        const dateStr = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
        const parsed = parseTaipeiDateToUtc(dateStr);
        if (parsed) publishedAtUtc = parsed;
      }
    }

    const canonicalUrl = `${BASE_URL}/Spotlight.aspx?from=06&sID=${sId}`;

    items.push({
      sId,
      title,
      url: canonicalUrl,
      imageUrl: imgSrc,
      publishedAtUtc,
    });
  });

  return items;
};

export const fetchShihHsinNews = async (): Promise<ShihHsinFetchResult> => {
  try {
    const response = await httpGetText(LIST_URL, {
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
        errorMessage: `世新大學焦點新聞 HTTP ${response.status}`,
      };
    }

    const rawItems = parseShihHsinHtml(response.text);
    const items: EnrichedRssItem[] = [];

    for (const raw of rawItems.slice(0, 20)) {
      const assets: EnrichedRssItem["assets"] = [];
      if (raw.imageUrl && raw.imageUrl.startsWith("http")) {
        try {
          const localPath = await downloadArticleImage(raw.imageUrl);
          if (localPath) {
            assets.push({
              assetType: "image",
              title: null,
              url: localPath,
              sortOrder: 0,
            });
          }
        } catch {
          // ignore download error
        }
      }

      const payloadHash = sha256(
        JSON.stringify({
          title: raw.title,
          canonicalUrl: raw.url,
          publishedAtUtc: raw.publishedAtUtc.toISOString(),
          imageUrl: raw.imageUrl,
        }),
      );

      items.push({
        sourceName: SOURCE_NAME,
        feedCode: FEED_CODE,
        feedName: FEED_NAME,
        externalId: `shih_hsin_${raw.sId}`,
        canonicalUrl: raw.url,
        sourceUrl: raw.url,
        title: raw.title,
        descriptionHtml: `<p>世新大學聚光燈報導：${raw.title}</p>`,
        descriptionText: `世新大學聚光燈報導：${raw.title}`,
        detailHtml: null,
        detailText: null,
        deptName: "公共事務室",
        categoryRaw: "學術教育",
        displayType: null,
        publishedAtUtc: raw.publishedAtUtc,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets,
        metaTitle: "",
        metaDescription: "",
        keywords: "世新大學,校園新聞,公共事務",
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      httpStatus: null,
      itemCount: 0,
      items: [],
      errorMessage: `世新大學新聞抓取失敗: ${msg}`,
    };
  }
};
