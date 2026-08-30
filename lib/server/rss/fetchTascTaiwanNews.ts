import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { sha256, toAbsoluteUrl } from "@/lib/server/rss/scraperUtils";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";
import { isFresh } from "@/lib/server/rss/freshness";

// ---------------------------------------------------------------------------
// 台灣性諮商學會 (tasctaiwan.weebly.com) — Professional sex counseling courses,
// workshops, educational reports, and symposium notices.
// ---------------------------------------------------------------------------

const FEED_CODE = "tasctaiwan_news" as const;
const SOURCE_NAME = "tasctaiwan";
const FEED_NAME = "台灣性諮商學會";
const BASE_URL = "https://tasctaiwan.weebly.com";

const PAGES = [
  {
    path: "/35506312432084421578.html",
    label: "課程公告",
  },
  {
    path: "/20170241802423035506312432257723566.html",
    label: "課程報導",
  },
];

export interface TascTaiwanFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

/**
 * Pull a date out of a title like 「2026.09.05(六)《當身體遇見社會…》」.
 *
 * These are course announcements, so the date in the title is the date the
 * course *runs*, not the date the announcement went up — and this site carries
 * no real publish date anywhere (no `<time>`, no date class, no ISO date), so
 * there is nothing better to fall back to. The title date is therefore only
 * usable when it is already in the past, where "the course happened on" and
 * "this was announced by" at least point the same way.
 *
 * A future date is discarded rather than stored (issue #92): with the list
 * sorted newest-first, an event date days or months ahead pins the card to the
 * top of /news until that day passes. Returning null hands the item to
 * `COALESCE(published_at_utc, first_seen_at_utc)`, which dates it by when we
 * first saw it — which is exactly what an announcement's publish date is.
 *
 * Exported for freshness.test.mjs; not part of the fetcher's public contract.
 */
export const parseDateFromTitle = (
  title: string,
  now: Date = new Date(),
): Date | null => {
  const match = title.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!match) return null;
  const year = match[1];
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");
  const parsed = parseTaipeiDateToUtc(`${year}-${month}-${day} 09:00:00`);
  if (!parsed) return null;
  return parsed.getTime() > now.getTime() ? null : parsed;
};

export const fetchTascTaiwanNews = async (): Promise<TascTaiwanFetchResult> => {
  let httpStatus: number | null = null;
  const items: EnrichedRssItem[] = [];
  const seenIds = new Set<string>();
  let anyOk = false;
  const errors: string[] = [];

  for (const { path, label } of PAGES) {
    const pageUrl = `${BASE_URL}${path}`;
    try {
      const response = await httpGetText(pageUrl, {
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
      const titleElements = $(
        "#wsite-content .wsite-content-title, #wsite-content h2.wsite-content-title, .wsite-content-title",
      ).toArray();

      for (const el of titleElements) {
        const titleEl = $(el);
        const title = titleEl.text().trim().replace(/\s+/g, " ");
        if (!title || title.length < 5 || title.includes("本年度課程公告")) continue;

        const section = titleEl.nextUntil(".wsite-content-title");
        const rawDesc = section.text().trim().replace(/\s+/g, " ");
        const descriptionText = rawDesc.startsWith("(function") ? "" : rawDesc.slice(0, 500);

        const regLink = section
          .find("a[href*='reurl.cc'], a[href*='beclass.com'], a[href*='forms.gle'], a[href*='google.com/forms']")
          .first()
          .attr("href");

        const externalId = sha256(`${path}:${title}`).slice(0, 16);
        if (seenIds.has(externalId)) continue;
        seenIds.add(externalId);

        const canonicalUrl = `${pageUrl}#${externalId}`;
        const sourceUrl = regLink || pageUrl;

        // Dated and gated before the image download, not after. This page lists
        // years of past 課程報導, and downloading a picture for an announcement
        // that will be discarded seconds later is exactly the per-item load the
        // gate exists to avoid.
        const publishedAtUtc = parseDateFromTitle(title);
        if (!isFresh({ publishedAtUtc })) continue;

        const rawImg =
          section.find("img[src*='/uploads/']").first().attr("src") ||
          section.find("img").first().attr("src") ||
          null;

        const imgSrc = rawImg ? toAbsoluteUrl(rawImg, BASE_URL) : null;

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

        // publishedAtUtc is part of the hash, as it is in normalizeItem. It was
        // left out here, which meant a stored item's date could never be
        // corrected: the row for a course announcement dated into the future
        // matched on hash every run and took the "unchanged" early-out, so it
        // kept its bogus date and stayed pinned to the top of /news. Including
        // it costs one re-persist of this source's rows, once.
        const payloadHash = sha256(
          JSON.stringify({
            title,
            canonicalUrl,
            descriptionText,
            imgSrc,
            publishedAtUtc: publishedAtUtc?.toISOString() ?? null,
          }),
        );

        items.push({
          sourceName: SOURCE_NAME,
          feedCode: FEED_CODE,
          feedName: FEED_NAME,
          externalId,
          canonicalUrl,
          sourceUrl,
          title,
          descriptionHtml: descriptionText,
          descriptionText,
          detailHtml: null,
          detailText: descriptionText,
          deptName: null,
          categoryRaw: label,
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
      errorMessage: errors.join("; ") || "Unknown 台灣性諮商學會 fetch error",
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

