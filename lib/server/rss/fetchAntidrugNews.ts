import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";
import { sha256 } from "@/lib/server/rss/scraperUtils";
import { FRESHNESS_WINDOW_DAYS } from "@/lib/server/rss/freshness";

// ---------------------------------------------------------------------------
// 法務部反毒大本營「毒家新聞」(antidrug.moj.gov.tw) — issue #568 / spec #562.
//
// Entry point `np-3-1.html` 302-redirects to `lp-3-1.html`; subsequent pages
// are `lp-3-1-{page}-20.html` (20 items/page, confirmed live 2026-10-14:
// "共2345筆資料，第1/118頁"). This fetcher always requests the paginated form
// (`lp-3-1-1-20.html` for page 1 too — it's what the page's own "第一頁" link
// uses) so every page follows the same URL shape.
//
// IMPORTANT, confirmed by actually opening a sampled article link (per issue
// #568's explicit instruction not to guess this): every `<li>` on this list
// page is a title + ROC date + plain-text media-outlet label that links
// *directly to the original outlet's own article* (news.ltn.com.tw,
// udn.com, tw.news.yahoo.com, www.cna.com.tw, ...). antidrug.moj.gov.tw does
// not host a detail page of its own for any of these entries — it is purely
// a curated index of other outlets' anti-drug coverage, not a publisher of
// its own article bodies. There is therefore no "full text" of 反毒大本營's
// own to store: `detailHtml`/`detailText` are deliberately left null, and
// `descriptionText` only carries a short "轉載自：<outlet>" attribution line.
// Clicking through on this site's own /news/[id] page still reaches the real
// article via the "前往官方原始網頁"/"查看官方公報" buttons, which link
// `canonical_url` — here set to the real external article URL antidrug.moj.gov.tw
// itself links to, not a self-link back into this site.
//
// This source is intentionally still filed under the `gov` source category
// (per #568's acceptance criteria) because 反毒大本營/法務部 is the publisher
// of *this curated list*, even though it isn't the publisher of each linked
// article's body text.
// ---------------------------------------------------------------------------

const FEED_CODE = "antidrug_news" as const;
const SOURCE_NAME = "antidrug";
const FEED_NAME = "反毒大本營－毒家新聞";
const BASE_URL = "https://antidrug.moj.gov.tw";
const PAGE_SIZE = 20;
const pageUrl = (page: number): string => `${BASE_URL}/lp-3-1-${page}-${PAGE_SIZE}.html`;

/** Hard ceiling on pages requested per run, independent of the freshness window — a safety net against an infinite loop if the site ever stops reporting a shrinking item count per page. */
const MAX_PAGES = 12;

export interface AntidrugRawItem {
  title: string;
  canonicalUrl: string;
  /** Plain-text media-outlet attribution following the title/date in the same <li> (e.g. "自由時報", "聯合新聞", "Yahoo"). */
  sourceLabel: string | null;
  publishedAtUtc: Date | null;
}

/**
 * Converts a ROC-calendar date string ("115-10-12") to a UTC Date at
 * Taipei midnight. Returns null for anything that doesn't match — this
 * list has no other date format in practice, but a format change upstream
 * should degrade to "no date" (freshness gate then falls back to
 * first_seen_at_utc) rather than throw.
 */
export const parseRocDateToUtc = (value: string): Date | null => {
  const m = value.trim().match(/^(\d{2,3})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const adYear = Number(m[1]) + 1911;
  return parseTaipeiDateToUtc(`${adYear}-${m[2]}-${m[3]} 00:00:00`);
};

/** Pure parser for one list page's HTML — no network, no Date.now() default so tests are deterministic. */
export const parseAntidrugListHtml = (html: string): AntidrugRawItem[] => {
  const $ = load(html);
  const items: AntidrugRawItem[] = [];

  $(".lp .list ol > li").each((_, el) => {
    const li = $(el);
    const anchor = li.find("h3 a").first();
    const href = anchor.attr("href")?.trim();
    const title = anchor.text().replace(/\s+/g, " ").trim();
    if (!href || !title) return;

    const rocDate = li.find(".meta-time").text().trim();
    const publishedAtUtc = rocDate ? parseRocDateToUtc(rocDate) : null;

    // The media-outlet label is a bare text node inside the <li>, right
    // after the </h3> close tag — not wrapped in its own element. Removing
    // the <h3> from a clone leaves just that text behind.
    const clone = li.clone();
    clone.find("h3").remove();
    const sourceLabel = clone.text().replace(/\s+/g, " ").trim() || null;

    items.push({ title, canonicalUrl: href, sourceLabel, publishedAtUtc });
  });

  return items;
};

export interface AntidrugNewsFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchAntidrugNews = async (): Promise<AntidrugNewsFetchResult> => {
  let httpStatus: number | null = null;
  const seenUrls = new Set<string>();
  const enriched: EnrichedRssItem[] = [];
  const cutoffMs = Date.now() - FRESHNESS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await httpGetText(pageUrl(page), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeoutMs: 15_000,
      });
      httpStatus = response.status;

      if (response.status < 200 || response.status >= 300) {
        if (enriched.length === 0 && page === 1) {
          return {
            ok: false,
            httpStatus: response.status,
            itemCount: 0,
            items: [],
            errorMessage: `反毒大本營毒家新聞 HTTP ${response.status}`,
          };
        }
        break; // Later page failed; keep what we already have.
      }

      const rawItems = parseAntidrugListHtml(response.text);
      if (rawItems.length === 0) break; // ran off the end of the list

      let oldestOnPageMs = Infinity;

      for (const raw of rawItems) {
        if (seenUrls.has(raw.canonicalUrl)) continue;
        seenUrls.add(raw.canonicalUrl);

        if (raw.publishedAtUtc) {
          oldestOnPageMs = Math.min(oldestOnPageMs, raw.publishedAtUtc.getTime());
        }

        // Network-efficiency pre-filter only — the real freshness gate is
        // the central one in runIngestion.ts's processSpecialSource
        // (partitionByFreshness), which this still passes through.
        // Skipping clearly-stale rows here just avoids paying for a
        // sha256/object-build on items we already know will be discarded.
        if (raw.publishedAtUtc && raw.publishedAtUtc.getTime() < cutoffMs) continue;

        const externalId = `antidrug_${sha256(raw.canonicalUrl).slice(0, 20)}`;
        const descriptionText = raw.sourceLabel ? `（轉載自：${raw.sourceLabel}）` : "";
        const descriptionHtml = descriptionText ? `<p>${descriptionText}</p>` : "";

        const payloadHash = sha256(
          JSON.stringify({
            title: raw.title,
            canonicalUrl: raw.canonicalUrl,
            sourceLabel: raw.sourceLabel,
            publishedAtUtc: raw.publishedAtUtc?.toISOString() ?? null,
          }),
        );

        enriched.push({
          sourceName: SOURCE_NAME,
          feedCode: FEED_CODE,
          feedName: FEED_NAME,
          externalId,
          canonicalUrl: raw.canonicalUrl,
          sourceUrl: raw.canonicalUrl,
          title: raw.title,
          descriptionHtml,
          descriptionText,
          // No body of its own to store — see the module comment above.
          detailHtml: null,
          detailText: null,
          deptName: null,
          categoryRaw: raw.sourceLabel,
          displayType: null,
          publishedAtUtc: raw.publishedAtUtc,
          publicBeginAtTaipei: null,
          publicEndAtTaipei: null,
          payloadHash,
          assets: [],
          // SEO metadata is filled in by generateSeoMetadataWithAi in
          // runIngestion.ts, same as every other special source.
          metaTitle: "",
          metaDescription: "",
          keywords: raw.sourceLabel || "",
          geoSummary: "",
        });
      }

      // Every item fetched on this page was already older than the
      // freshness window — list is sorted newest-first, so every
      // subsequent page would be even older. Stop paginating.
      if (oldestOnPageMs !== Infinity && oldestOnPageMs < cutoffMs) break;
    }

    return {
      ok: true,
      httpStatus,
      itemCount: enriched.length,
      items: enriched,
      errorMessage: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown 反毒大本營新聞 fetch error";
    return {
      ok: enriched.length > 0,
      httpStatus: enriched.length > 0 ? httpStatus : null,
      itemCount: enriched.length,
      items: enriched,
      errorMessage: enriched.length > 0 ? null : message,
    };
  }
};
