import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { sha256 } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// HARU 含春 (letsharu.com) — Sexual health, intimacy education, relationship guides.
// Summary + thumbnail only (skipDetailFetch policy).
// ---------------------------------------------------------------------------

const FEED_CODE = "letsharu_article" as const;
const SOURCE_NAME = "letsharu";
const FEED_NAME = "HARU";
const BASE_URL = "https://letsharu.com";

const CATEGORIES = [
  { path: "/category/edu/", label: "性知識教育" },
  { path: "/category/tips/", label: "親密技巧" },
  { path: "/category/art/", label: "兩性生活" },
];

export interface HaruFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchHaruArticles = async (): Promise<HaruFetchResult> => {
  let httpStatus: number | null = null;
  const items: EnrichedRssItem[] = [];
  const seenUrls = new Set<string>();
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

      const articleElements = $(
        "article, .post, .entry-title, .blog-post",
      ).toArray();

      for (const el of articleElements) {
        const elem = $(el);
        const anchor = elem.find("a[href*='/edu/'], a[href*='/tips/'], a[href*='/art/'], h2 a, h3 a").first();
        let href = anchor.attr("href");
        if (!href) continue;

        if (seenUrls.has(href)) continue;

        const title =
          elem.find("h2, h3, .entry-title").first().text().trim() ||
          anchor.text().trim();

        if (!title || title.length < 4) continue;
        seenUrls.add(href);

        const slugMatch = href.match(/letsharu\.com\/([^/]+)\/([^/?#]+)/);
        const externalId = slugMatch ? `${slugMatch[1]}-${slugMatch[2]}` : sha256(href).slice(0, 16);

        const imgSrc =
          elem.find("img").attr("src") ||
          elem.find("img").attr("data-src") ||
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
      errorMessage: errors.join("; ") || "Unknown HARU fetch error",
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

