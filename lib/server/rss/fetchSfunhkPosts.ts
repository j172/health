import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";
import { sha256 } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// 潮性辦公室 (sfunhk.com) — Sexual health, relationship wellness, adult culture.
// Summary + thumbnail only (skipDetailFetch policy).
// ---------------------------------------------------------------------------

const FEED_CODE = "sfunhk_blog" as const;
const SOURCE_NAME = "sfunhk";
const FEED_NAME = "潮性辦公室";
const BASE_URL = "https://www.sfunhk.com";

export interface SfunhkFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchSfunhkPosts = async (): Promise<SfunhkFetchResult> => {
  try {
    const listUrl = `${BASE_URL}/blog/posts`;
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
        errorMessage: `潮性辦公室 HTTP ${response.status}`,
      };
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seenUrls = new Set<string>();

    const articleAnchors = $("a[href*='/blog/posts/']").toArray();

    for (const el of articleAnchors) {
      const anchor = $(el);
      let href = anchor.attr("href");
      if (!href) continue;

      if (!href.startsWith("http")) {
        href = `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
      }

      if (seenUrls.has(href)) continue;

      let rawText =
        anchor.find("h2, h3, .title, p, div").first().text().trim() ||
        anchor.text().trim();

      if (!rawText || rawText.length < 4) continue;
      seenUrls.add(href);

      // Extract date if present (e.g. YYYY-MM-DD)
      const dateMatch = rawText.match(/(\d{4}-\d{2}-\d{2})/);
      const publishedAtUtc = dateMatch
        ? parseTaipeiDateToUtc(`${dateMatch[1]} 00:00:00`)
        : null;

      // Clean title: remove trailing date or excessive description text
      let title = rawText.replace(/\d{4}-\d{2}-\d{2}.*$/, "").trim();
      if (title.length > 80) {
        // If title and description are packed together, take the first sentence or 80 chars
        const firstSentence = title.split(/[。！？\n]/)[0];
        title = firstSentence.length > 5 ? firstSentence : title.slice(0, 80);
      }

      const slug = href.split("/blog/posts/")[1] || sha256(href).slice(0, 16);
      const externalId = decodeURIComponent(slug).replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, "");

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
          publishedAtUtc: publishedAtUtc?.toISOString() ?? null,
          imgSrc,
        }),
      );

      items.push({
        sourceName: SOURCE_NAME,
        feedCode: FEED_CODE,
        feedName: FEED_NAME,
        externalId: externalId || sha256(href).slice(0, 16),
        canonicalUrl: href,
        sourceUrl: href,
        title: title.replace(/\s+/g, " "),
        descriptionHtml: `<p>${rawText.replace(/\s+/g, " ").slice(0, 200)}...</p>`,
        descriptionText: rawText.replace(/\s+/g, " ").slice(0, 200),
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: "兩性生活",
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
      error instanceof Error ? error.message : "Unknown 潮性辦公室 fetch error";
    return {
      ok: false,
      httpStatus: null,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};

