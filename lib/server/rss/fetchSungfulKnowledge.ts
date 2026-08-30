import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { sha256, toAbsoluteUrl } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// 嵩馥性健康管理中心 (sungful.com/knowledge) — Sexual health, sexology education,
// and intimate wellness knowledge articles.
// ---------------------------------------------------------------------------

const FEED_CODE = "sungful_knowledge" as const;
const SOURCE_NAME = "sungful";
const FEED_NAME = "嵩馥性健康管理中心";
const BASE_URL = "https://www.sungful.com";

const CATEGORIES = [
  { path: "/knowledge", label: "性學新知" },
  { path: "/knowledge/l/15", label: "男性健康" },
  { path: "/knowledge/l/14", label: "女性健康" },
  { path: "/knowledge/l/24", label: "幸福園地" },
  { path: "/knowledge/l/34", label: "嵩馥秘語" },
  { path: "/knowledge/l/40", label: "幸福醫學" },
];

export interface SungfulFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchSungfulKnowledge = async (): Promise<SungfulFetchResult> => {
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
      const articleAnchors = $("a[href*='/knowledge/detail/']").toArray();

      for (const el of articleAnchors) {
        const anchor = $(el);
        const href = anchor.attr("href");
        if (!href) continue;

        const idMatch = href.match(/\/knowledge\/detail\/(\d+)/);
        const externalId = idMatch ? idMatch[1] : href.replace(/[^a-zA-Z0-9_-]/g, "");
        if (!externalId || seenIds.has(externalId)) continue;

        const title =
          anchor.find("img").attr("title") ||
          anchor.find("img").attr("alt") ||
          anchor.text().trim();

        if (!title || title.length < 4) continue;
        seenIds.add(externalId);

        const canonicalUrl = `${BASE_URL}/knowledge/detail/${externalId}`;
        const rawImgSrc =
          anchor.find("img").attr("src") ||
          anchor.find("img").attr("data-src") ||
          `${BASE_URL}/photo/product/${externalId}/${externalId}small.jpg`;

        const imgSrc = rawImgSrc ? toAbsoluteUrl(rawImgSrc, BASE_URL) : null;

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
          descriptionHtml: "",
          descriptionText: "",
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
      errorMessage: errors.join("; ") || "Unknown 嵩馥性健康管理中心 fetch error",
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

