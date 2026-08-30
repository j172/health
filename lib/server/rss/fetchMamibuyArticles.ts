import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { sha256, toAbsoluteUrl } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// 媽咪拜 MamiBuy (mamibuy.com.tw/talk/article/) — Maternal, infant, pregnancy,
// parenting, and women's health community articles.
// ---------------------------------------------------------------------------

const FEED_CODE = "mamibuy_talk" as const;
const SOURCE_NAME = "mamibuy";
const FEED_NAME = "媽咪拜";
const BASE_URL = "https://mamibuy.com.tw";

const CATEGORIES = [
  { path: "/talk/article/", label: "話題文章" },
  { path: "/talk/article/?cid=7", label: "女人心事" },
  { path: "/talk/article/?cid=12", label: "懷孕生產" },
  { path: "/talk/article/?cid=2", label: "育兒教養" },
];

export interface MamibuyFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchMamibuyArticles = async (): Promise<MamibuyFetchResult> => {
  let httpStatus: number | null = null;
  const items: EnrichedRssItem[] = [];
  const seenIds = new Set<string>();
  let anyOk = false;
  const errors: string[] = [];

  for (const { path, label } of CATEGORIES) {
    const listUrl = `${BASE_URL}${path}`;
    try {
      const response = await httpGetText(listUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeoutMs: 15_000,
      });

      httpStatus = response.status;
      if (response.status < 200 || response.status >= 300) {
        errors.push(`${path} HTTP ${response.status}`);
        continue;
      }
      anyOk = true;

      const $ = load(response.text);
      const articleAnchors = $("a[href*='/talk/article/']").toArray();

      for (const el of articleAnchors) {
        const anchor = $(el);
        const href = anchor.attr("href");
        if (!href) continue;

        const idMatch = href.match(/\/talk\/article\/(\d+)/);
        const externalId = idMatch ? idMatch[1] : null;
        if (!externalId || seenIds.has(externalId)) continue;

        const container = anchor.closest(".well, .col-sm-6, .col-xs-12, li, div");
        const title =
          container.find(".content-title").first().text().trim() ||
          anchor.attr("title")?.trim() ||
          anchor.find(".content-title, h2, h3, .title").first().text().trim() ||
          anchor.text().trim();

        if (!title || title.length < 4 || title === "看全文 〉") continue;
        seenIds.add(externalId);

        const subtitle =
          container.find(".content-subtitle").first().text().trim() ||
          anchor.find(".content-subtitle").first().text().trim() ||
          "";

        const canonicalUrl = `${BASE_URL}/talk/article/${externalId}`;
        const rawImgSrc =
          anchor.find("img").attr("data-original") ||
          container.find("img").attr("data-original") ||
          anchor.find("img").attr("src") ||
          null;

        const imgSrc =
          rawImgSrc && !rawImgSrc.includes("default.gif") && !rawImgSrc.includes("icon/")
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
            subtitle,
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
          descriptionHtml: subtitle,
          descriptionText: subtitle,
          detailHtml: null,
          detailText: null,
          deptName: null,
          categoryRaw: label,
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Unknown error fetching ${path}`;
      errors.push(message);
    }
  }

  if (!anyOk) {
    return {
      ok: false,
      httpStatus,
      itemCount: 0,
      items: [],
      errorMessage: errors.join("; ") || "Unknown 媽咪拜 fetch error",
    };
  }

  return {
    ok: true,
    httpStatus,
    itemCount: items.length,
    items,
    errorMessage: errors.length > 0 ? `Partial failure: ${errors.join("; ")}` : null,
  };
};

