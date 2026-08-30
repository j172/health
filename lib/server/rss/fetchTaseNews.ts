import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { sha256, toAbsoluteUrl } from "@/lib/server/rss/scraperUtils";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";

// ---------------------------------------------------------------------------
// 台灣性教育學會 (tase.tw/news.php) — Sex education guidelines, symposiums,
// press releases, youth health events, and academic publications.
// ---------------------------------------------------------------------------

const FEED_CODE = "tase_news" as const;
const SOURCE_NAME = "tase";
const FEED_NAME = "台灣性教育學會";
const BASE_URL = "https://tase.tw";
const LIST_URL = `${BASE_URL}/news.php`;

export interface TaseFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchTaseNews = async (): Promise<TaseFetchResult> => {
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
        errorMessage: `台灣性教育學會 HTTP ${response.status}`,
      };
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seenIds = new Set<string>();

    const articleAnchors = $("a[href*='content.php']").toArray();

    for (const el of articleAnchors) {
      const anchor = $(el);
      const href = anchor.attr("href");
      if (!href) continue;

      // Extract PID and type
      const pidMatch = href.match(/pid=(\d+)/);
      const tyMatch = href.match(/ty=(\d+)/);
      // ty=3 is news/events/press statements
      if (!pidMatch) continue;
      const pid = pidMatch[1];
      const ty = tyMatch ? tyMatch[1] : "3";

      // Ignore standard static navigation pages (pid 57: contact, 1-3: about)
      if (["1", "2", "3", "57", "111", "138"].includes(pid) && ty === "1") continue;

      const title = anchor.text().trim().replace(/\s+/g, " ");
      if (!title || title.length < 4 || title === "閱讀全文" || title === "顯示地圖") continue;

      const externalId = `tase-${pid}`;
      if (seenIds.has(externalId)) continue;
      seenIds.add(externalId);

      const canonicalUrl = toAbsoluteUrl(href.replace(/&sn=\d+/, ""), BASE_URL);
      const parentRow = anchor.closest("tr, li, .post, div");
      const summaryText = parentRow
        .text()
        .replace(title, "")
        .replace("閱讀全文", "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 300);

      // Extract date if present in parent row or title
      const dateMatch = parentRow.text().match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
      let publishedAtUtc: Date | null = null;
      if (dateMatch) {
        publishedAtUtc = parseTaipeiDateToUtc(
          `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")} 09:00:00`,
        );
      }

      const rawImgSrc =
        anchor.find("img").attr("src") ||
        parentRow.find("img").attr("src") ||
        null;

      const imgSrc =
        rawImgSrc && !rawImgSrc.includes("logo") && !rawImgSrc.includes("social/")
          ? toAbsoluteUrl(rawImgSrc, BASE_URL)
          : null;

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
          summaryText,
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
        title,
        descriptionHtml: summaryText,
        descriptionText: summaryText,
        detailHtml: null,
        detailText: summaryText,
        deptName: null,
        categoryRaw: "性教育新知",
        displayType: null,
        publishedAtUtc,
        publicBeginAtTaipei: publishedAtUtc,
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
      error instanceof Error ? error.message : "Unknown 台灣性教育學會 fetch error";
    return {
      ok: false,
      httpStatus: null,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};

