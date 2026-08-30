import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";
import { sha256 } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// UNIQMAN (uniqman.com.tw) — Men's health, vitality, prostate care, and nutrition blogs.
// Summary + thumbnail only (skipDetailFetch policy).
// ---------------------------------------------------------------------------

const FEED_CODE = "uniqman_blog" as const;
const SOURCE_NAME = "uniqman";
const FEED_NAME = "UNIQMAN";
const BASE_URL = "https://www.uniqman.com.tw";

const MONTH_MAP: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

const parseUniqmanDate = (text: string): Date | null => {
  const match = text.match(/(\d{1,2})\s+([A-Za-z]{3}),\s+(\d{4})/);
  if (!match) return null;
  const day = match[1].padStart(2, "0");
  const month = MONTH_MAP[match[2]];
  const year = match[3];
  if (!month) return null;
  return parseTaipeiDateToUtc(`${year}-${month}-${day} 00:00:00`);
};

export interface UniqmanFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchUniqmanBlogs = async (): Promise<UniqmanFetchResult> => {
  try {
    const listUrl = `${BASE_URL}/blogs`;
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
        errorMessage: `UNIQMAN HTTP ${response.status}`,
      };
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seenIds = new Set<string>();

    const cards = $(".blog_article_main, .item_area").toArray();

    for (const el of cards) {
      const card = $(el);
      const link = card.find("a[href*='/blog/']").first();
      const href = link.attr("href");
      if (!href || href.includes("/category/")) continue;

      const idMatch = href.match(/\/blog\/(\d+)/);
      const externalId = idMatch ? idMatch[1] : href.replace(/[^a-zA-Z0-9_-]/g, "");
      if (!externalId || seenIds.has(externalId)) continue;

      const title =
        card.find(".blog_main_title, h2, h3, a").first().text().trim() ||
        link.text().trim();

      if (!title || title.length < 4) continue;
      seenIds.add(externalId);

      const canonicalUrl = href.startsWith("http") ? href : `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
      const dateText = card.find(".blog_tags").text().trim();
      const publishedAtUtc = parseUniqmanDate(dateText);

      const descText = card.find(".blog_article").text().trim().replace(/\s+/g, " ");

      const styleAttr = card.find("[style*='background-image']").first().attr("style") || "";
      const imgMatch = styleAttr.match(/background-image:url\(([^),]+)\)/);
      const imgSrc = imgMatch ? imgMatch[1].replace(/['"]/g, "").trim() : card.find("img").attr("src") || null;

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
        title: title.replace(/\s+/g, " "),
        descriptionHtml: descText ? `<p>${descText}</p>` : "",
        descriptionText: descText,
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: "男性保健",
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
      error instanceof Error ? error.message : "Unknown UNIQMAN fetch error";
    return {
      ok: false,
      httpStatus: null,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};

