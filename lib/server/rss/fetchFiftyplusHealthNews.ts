import { createHash } from "crypto";
import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";

// ---------------------------------------------------------------------------
// 50+（橘世代）— fiftyplus.com.tw is a general 50+ lifestyle media site, not
// health-only (also covers finance/travel/spiritual/etc.), so per Phase 8
// spec this only crawls the health category and its subcategories, not the
// whole site. Has no RSS feed of its own (confirmed: /feed 404s).
//
// /category/health does NOT aggregate its 8 subcategories — confirmed live
// by comparing article ids between /category/health and /category/dementia:
// zero overlap. So all 9 pages below must be crawled individually to get
// full health coverage; a category label is attached per-page since the
// listing cards themselves don't expose one.
//
// Full article bodies are never fetched/stored: fiftyplus is a commercial
// media outlet (天下雜誌集團), same copyright stance as udn_health/ltn/
// top1health.
// ---------------------------------------------------------------------------

const FEED_CODE = "fiftyplus_health" as const;
const SOURCE_NAME = "fiftyplus";
const FEED_NAME = "50+（橘世代）";
const BASE_URL = "https://www.fiftyplus.com.tw";

const CATEGORY_PAGES: { path: string; label: string }[] = [
  { path: "/category/health", label: "健康" },
  { path: "/category/sex", label: "性愛話題" },
  { path: "/category/menopause", label: "更年期" },
  { path: "/category/dementia", label: "失智症" },
  { path: "/category/medical", label: "醫療照護" },
  { path: "/category/diet", label: "飲食營養" },
  { path: "/category/sport", label: "運動保健" },
  { path: "/category/disease", label: "慢性疾病" },
  { path: "/category/cancer", label: "癌症" },
];

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

const toAbsoluteUrl = (url: string, base: string): string => {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
};

export interface FiftyplusHealthFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchFiftyplusHealthNews = async (): Promise<FiftyplusHealthFetchResult> => {
  let httpStatus: number | null = null;
  const items: EnrichedRssItem[] = [];
  const seenExternalIds = new Set<string>();
  let anyOk = false;
  const errors: string[] = [];

  for (const { path, label } of CATEGORY_PAGES) {
    const listUrl = `${BASE_URL}${path}`;
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await httpGetText(listUrl, {
        headers: {
          "User-Agent": "health.j172.tw-rss-ingestor/1.0",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

      for (const el of $("div.card--article").toArray()) {
        const card = $(el);
        const picAnchor = card.find("a.pic").first();
        const href = picAnchor.attr("href");
        if (!href) continue;

        const match = href.match(/\/articles\/(\d+)/);
        if (!match) continue;
        const externalId = match[1];
        if (seenExternalIds.has(externalId)) continue;

        const title = card.find("a.caption h3").first().text().replace(/\s+/g, " ").trim();
        if (!title) continue;

        seenExternalIds.add(externalId);

        const canonicalUrl = `${BASE_URL}/articles/${externalId}`;

        const dateText = card.find("div.info div.date").first().text().trim();
        const dateMatch = dateText.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
        const publishedAtUtc = dateMatch
          ? parseTaipeiDateToUtc(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]} 00:00:00`)
          : null;

        const imgEl = picAnchor.find("img").first();
        const rawImgSrc = imgEl.attr("data-src") || null; // src is a lazyload 1x1 placeholder, never the real image
        const imgSrc = rawImgSrc ? toAbsoluteUrl(rawImgSrc, canonicalUrl) : null;

        const assets: EnrichedRssItem["assets"] = [];
        if (imgSrc) {
          // eslint-disable-next-line no-await-in-loop
          const localPath = await downloadArticleImage(imgSrc);
          if (localPath) {
            assets.push({ assetType: "image", title: null, url: localPath, sortOrder: 0 });
          }
        }

        const payloadHash = sha256(
          JSON.stringify({ title, canonicalUrl, publishedAtUtc: publishedAtUtc?.toISOString() ?? null, imgSrc }),
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
          categoryRaw: label,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : `Unknown error fetching ${path}`;
      errors.push(message);
    }
  }

  if (!anyOk) {
    return {
      ok: false,
      httpStatus,
      itemCount: 0,
      items: [],
      errorMessage: errors.join("; ") || "Unknown fiftyplus health fetch error",
    };
  }

  return {
    ok: true,
    httpStatus,
    itemCount: items.length,
    items,
    // Partial failures (e.g. one of the 9 subcategory pages down) don't fail
    // the whole fetch — surface them for visibility without blocking ingestion.
    errorMessage: errors.length > 0 ? `Partial failure: ${errors.join("; ")}` : null,
  };
};
