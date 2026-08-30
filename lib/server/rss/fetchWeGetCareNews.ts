import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { sha256 } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// 醫聯網 (We Get Care, wegetcare.tw) — Online health consultations, disease
// guides, urology/sexual wellness, and preventive medicine articles.
// Summary + thumbnail only (skipDetailFetch policy).
// ---------------------------------------------------------------------------

const FEED_CODE = "wegetcare_blog" as const;
const SOURCE_NAME = "wegetcare";
const FEED_NAME = "醫聯網";
const BASE_URL = "https://www.wegetcare.tw";

export interface WeGetCareFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchWeGetCareNews = async (): Promise<WeGetCareFetchResult> => {
  try {
    const listUrl = `${BASE_URL}/blogpost`;
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
        errorMessage: `醫聯網 HTTP ${response.status}`,
      };
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seenUrls = new Set<string>();

    const articleAnchors = $("a[href*='/post/']").toArray();

    for (const el of articleAnchors) {
      const anchor = $(el);
      let href = anchor.attr("href");
      if (!href) continue;

      if (!href.startsWith("http")) {
        href = `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
      }

      if (seenUrls.has(href)) continue;

      const title =
        anchor.find("h2, h3, .title, p").first().text().trim() ||
        anchor.text().trim();

      if (!title || title.length < 4) continue;
      seenUrls.add(href);

      const slugMatch = href.match(/\/post\/([^/?#]+)/);
      const externalId = slugMatch ? slugMatch[1] : sha256(href).slice(0, 16);

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
          canonicalUrl: href,
          imgSrc,
        }),
      );

      items.push({
        sourceName: SOURCE_NAME,
        feedCode: FEED_CODE,
        feedName: FEED_NAME,
        externalId,
        canonicalUrl: href,
        sourceUrl: href,
        title: title.replace(/\s+/g, " "),
        descriptionHtml: "",
        descriptionText: "",
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: "健康專題",
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
      error instanceof Error ? error.message : "Unknown 醫聯網 fetch error";
    return {
      ok: false,
      httpStatus: null,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};

