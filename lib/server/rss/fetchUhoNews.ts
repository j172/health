import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";
import { sha256 } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// 優活健康網 (uho.com.tw) — Everyday health, medical guides, and wellness tips.
// Summary + thumbnail only (skipDetailFetch policy for commercial media).
// ---------------------------------------------------------------------------

const FEED_CODE = "uho_health" as const;
const SOURCE_NAME = "uho";
const FEED_NAME = "優活健康網";
const BASE_URL = "https://www.uho.com.tw";

export interface UhoFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchUhoNews = async (): Promise<UhoFetchResult> => {
  try {
    const listUrl = `${BASE_URL}/index.asp`;
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
        errorMessage: `優活健康網 HTTP ${response.status}`,
      };
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seenIds = new Set<string>();

    const anchors = $("a[href*='article-']").toArray();

    for (const el of anchors) {
      const anchor = $(el);
      const rawHref = anchor.attr("href");
      if (!rawHref) continue;

      const idMatch = rawHref.match(/article-(\d+)/);
      const externalId = idMatch ? idMatch[1] : null;
      if (!externalId || seenIds.has(externalId)) continue;

      const rawText =
        anchor.find("h2, h3, p, span, .title").first().text().trim() ||
        anchor.text().trim();

      if (!rawText || rawText.length < 5) continue;
      seenIds.add(externalId);

      const canonicalUrl = `${BASE_URL}/article-${externalId}.html`;

      // Extract date if present: e.g. "2025/5/16"
      const dateMatch = rawText.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
      const publishedAtUtc = dateMatch
        ? parseTaipeiDateToUtc(
            `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")} 00:00:00`,
          )
        : null;

      const title = rawText
        .replace(/\d{4}[/-]\d{1,2}[/-]\d{1,2}\s*/, "")
        .replace(/\s+/g, " ")
        .trim();

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
          publishedAtUtc: publishedAtUtc?.toISOString() ?? null,
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
        descriptionHtml: "",
        descriptionText: "",
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: "健康生活",
        displayType: null,
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

    return {
      ok: true,
      httpStatus: response.status,
      itemCount: items.length,
      items,
      errorMessage: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown 優活健康網 fetch error";
    return {
      ok: false,
      httpStatus: null,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};
