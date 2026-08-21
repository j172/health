import { createHash } from "crypto";
import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";

// ---------------------------------------------------------------------------
// 良醫健康網 (health.businessweekly.com.tw) — the health-only subdomain of
// 商業周刊 (Business Weekly). Already scoped to health content by domain, so
// unlike fiftyplus this needs no site-wide-vs-health filtering. Has no RSS
// feed of its own (confirmed: no <link rel="alternate"> in <head>, no feed
// link in footer, only an email newsletter). robots.txt (confirmed live)
// disallows only /api, /fsearch.aspx, /FSearch.aspx, /hello — the /channel
// listing pages crawled here are unrestricted.
//
// Crawls the 9 top-nav category pages individually (confirmed live: each
// returns a fixed 15-card SSR'd listing, no shared "all categories" feed).
// A category label is attached per-page since the listing cards don't
// expose one themselves.
//
// Each /channel/NNNN page's HTML actually contains 15 <a href="/article/...">
// links, but only the first ~10 are real chronological listing cards (each
// with a small.text-font-sub publish date "YYYY-MM-DD"); the rest are a
// "熱門排行" (trending) sidebar widget with no date and no thumbnail, which
// is not scoped to health at all (confirmed live: it surfaces unrelated
// content like horoscope articles). Requiring a parseable YYYY-MM-DD date
// filters those out for free, so no separate off-topic/advertorial keyword
// filter is needed. Branded partnership microsites (e.g. 紐崔萊健康學堂) are
// hosted at a completely separate /event/... path, never /article/..., so
// they're naturally excluded by construction rather than needing detection.
//
// Full article bodies are never fetched/stored: businessweekly is a
// commercial media outlet (商業周刊), same copyright stance as fiftyplus/
// udn_health/ltn/top1health — title/summary/thumbnail/link only.
// ---------------------------------------------------------------------------

const FEED_CODE = "businessweekly_health" as const;
const SOURCE_NAME = "healthbw";
const FEED_NAME = "良醫健康網";
const BASE_URL = "https://health.businessweekly.com.tw";

const CATEGORY_PAGES: { path: string; label: string }[] = [
  { path: "/channel/0001", label: "防癌" },
  { path: "/channel/0002", label: "減肥" },
  { path: "/channel/0003", label: "養生" },
  { path: "/channel/0004", label: "心靈" },
  { path: "/channel/0005", label: "兩性" },
  { path: "/channel/0006", label: "美容" },
  { path: "/channel/0007", label: "飲食" },
  { path: "/channel/0008", label: "新知" },
  { path: "/channel/0009", label: "百大良醫" },
];

const ARTICLE_ID_RE = /^\/article\/(ARTL\d+)$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

export interface BusinessweeklyHealthFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchBusinessweeklyHealthNews = async (): Promise<BusinessweeklyHealthFetchResult> => {
  let httpStatus: number | null = null;
  const items: EnrichedRssItem[] = [];
  const seenExternalIds = new Set<string>();
  let anyOk = false;
  const errors: string[] = [];

  for (const { path, label } of CATEGORY_PAGES) {
    const listUrl = `${BASE_URL}${path}`;
    try {
       
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

      for (const el of $('a[href^="/article/"]').toArray()) {
        const anchor = $(el);
        const href = anchor.attr("href");
        if (!href) continue;

        const match = href.match(ARTICLE_ID_RE);
        if (!match) continue;
        const externalId = match[1];
        if (seenExternalIds.has(externalId)) continue;

        // Real listing cards carry a publish date; the trending-sidebar
        // widget (same page, unrelated/off-topic content) doesn't — see
        // module header comment.
        const dateText = anchor.find("small").first().text().trim();
        const dateMatch = dateText.match(DATE_RE);
        if (!dateMatch) continue;

        const title = anchor.find("h3").first().text().replace(/\s+/g, " ").trim();
        if (!title) continue;

        seenExternalIds.add(externalId);

        const canonicalUrl = `${BASE_URL}/article/${externalId}`;
        const publishedAtUtc = parseTaipeiDateToUtc(
          `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]} 00:00:00`,
        );

        const styleAttr = anchor.find('div[style*="background-image"]').first().attr("style") || "";
        const imgMatch = styleAttr.match(/background-image:url\(([^),]+)\)/);
        const imgSrc = imgMatch ? imgMatch[1].trim() : null;

        const assets: EnrichedRssItem["assets"] = [];
        if (imgSrc) {
           
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
      errorMessage: errors.join("; ") || "Unknown businessweekly health fetch error",
    };
  }

  return {
    ok: true,
    httpStatus,
    itemCount: items.length,
    items,
    // Partial failures (e.g. one of the 9 category pages down) don't fail
    // the whole fetch — surface them for visibility without blocking ingestion.
    errorMessage: errors.length > 0 ? `Partial failure: ${errors.join("; ")}` : null,
  };
};
