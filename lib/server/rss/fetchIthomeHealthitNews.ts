import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";
import { sha256, toAbsoluteUrl } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// iThome「醫療IT」主題中心 (www.ithome.com.tw/healthit) — iThome's site-wide RSS
// (/rss) is "最新新聞" only, not scoped to any category; confirmed live that
// /healthit has no category-specific feed of its own (/healthit/rss and
// /rss/healthit both either 404 or just return the site-wide feed). /healthit
// itself, however, is a real server-rendered category listing (Drupal
// "featured_channel" view) with its own pagination (?page=1, ?page=2, ...),
// so this scrapes that HTML listing page directly — same treatment as
// udn_health/businessweekly_health/cgmh_press, all of which scrape a listing
// page for the same reason (no per-category RSS upstream).
//
// Only page 1 (~15 items, confirmed live 2026-10-22 spanning roughly the
// last 6 weeks) is fetched, not every paginated page: the listing is sorted
// newest-first and a 30-minute ingestion cadence (shared rss-sync-cron, see
// registerJobs.ts) revisits it often enough that page 1 alone always covers
// everything new since the last run, with FRESHNESS_WINDOW_DAYS (90 days)
// comfortably covering any single missed run. Unlike antidrug_news (which
// deliberately paginates through a decade-spanning curated index to find
// items inside its freshness window from a cold start), there is no
// cold-start gap to backfill here.
//
// Each card is `.view-featured-channel .view-content > .channel-item`,
// scoped under the page's main `view-featured-channel` view so the
// structurally-identical `.channel-item` divs in the "iThome 研討會" sidebar
// widget (a different view, `view-views-seminar`) are never picked up.
// Thumbnail, title and a short excerpt are all the listing page itself
// exposes (confirmed live: no article body text); iThome is a commercial
// media outlet (電週文化事業, "版權所有、轉載必究" per its own footer), so this
// never fetches/stores a detail-page body — title/summary/thumbnail/link
// only, same copyright stance as udn_health/businessweekly_health/fiftyplus.
// ---------------------------------------------------------------------------

const FEED_CODE = "ithome_healthit" as const;
const SOURCE_NAME = "ithome";
const FEED_NAME = "iThome－醫療IT";
const BASE_URL = "https://www.ithome.com.tw";
const LIST_URL = `${BASE_URL}/healthit`;

export interface IthomeHealthitRawItem {
  externalId: string;
  title: string;
  canonicalUrl: string;
  /** Tag labels shown above the card ("資安週報 | 資安一周"), joined the same way the page itself joins them. Not a single fixed category like the gov scrapers' categoryRaw. */
  categoryRaw: string | null;
  summary: string;
  imgSrc: string | null;
  publishedAtUtc: Date | null;
}

/** Pure parser for one listing page's HTML — no network, so tests are deterministic. */
export const parseIthomeHealthitListHtml = (
  html: string,
  baseUrl: string = LIST_URL,
): IthomeHealthitRawItem[] => {
  const $ = load(html);
  const items: IthomeHealthitRawItem[] = [];

  $(".view-featured-channel .view-content > .channel-item").each((_, el) => {
    const card = $(el);

    const titleAnchor = card.find("p.title a").first();
    const href = titleAnchor.attr("href")?.trim();
    const title = titleAnchor.text().replace(/\s+/g, " ").trim();
    if (!href || !title) return;

    const idMatch = href.match(/\/news\/(\d+)/);
    if (!idMatch) return; // not a real article card (e.g. a stray promo link)
    const externalId = idMatch[1];
    const canonicalUrl = toAbsoluteUrl(href, baseUrl);

    const categoryRaw =
      card
        .find("p.category a")
        .map((__, a) => $(a).text().trim())
        .get()
        .filter(Boolean)
        .join(" | ") || null;

    const summary = card.find("div.summary").text().replace(/\s+/g, " ").trim();

    const rawImgSrc = card.find("p.photo img").first().attr("src")?.trim();
    const imgSrc = rawImgSrc ? toAbsoluteUrl(rawImgSrc, baseUrl) : null;

    const postAtText = card.find("p.post-at").first().text().trim();
    const dateMatch = postAtText.match(/(\d{4})-(\d{2})-(\d{2})/);
    const publishedAtUtc = dateMatch
      ? parseTaipeiDateToUtc(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]} 00:00:00`)
      : null;

    items.push({
      externalId,
      title,
      canonicalUrl,
      categoryRaw,
      summary,
      imgSrc,
      publishedAtUtc,
    });
  });

  return items;
};

export interface IthomeHealthitFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchIthomeHealthitNews = async (): Promise<IthomeHealthitFetchResult> => {
  try {
    const response = await httpGetText(LIST_URL, {
      headers: {
        "User-Agent": "health.j172.tw-rss-ingestor/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeoutMs: 15_000,
    });

    if (response.status < 200 || response.status >= 300) {
      return {
        ok: false,
        httpStatus: response.status,
        itemCount: 0,
        items: [],
        errorMessage: `iThome 醫療IT HTTP ${response.status}`,
      };
    }

    const rawItems = parseIthomeHealthitListHtml(response.text, LIST_URL);
    const items: EnrichedRssItem[] = [];
    const seenExternalIds = new Set<string>();

    for (const raw of rawItems) {
      if (seenExternalIds.has(raw.externalId)) continue;
      seenExternalIds.add(raw.externalId);

      // Re-hosted locally rather than hotlinking ithome.com.tw's own image
      // host, same as every other HTML-scrape special source (udn_health,
      // businessweekly_health, ...).
      const assets: EnrichedRssItem["assets"] = [];
      if (raw.imgSrc) {
        const localPath = await downloadArticleImage(raw.imgSrc, raw.canonicalUrl);
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
          title: raw.title,
          canonicalUrl: raw.canonicalUrl,
          summary: raw.summary,
          categoryRaw: raw.categoryRaw,
          publishedAtUtc: raw.publishedAtUtc?.toISOString() ?? null,
          imgSrc: raw.imgSrc,
        }),
      );

      items.push({
        sourceName: SOURCE_NAME,
        feedCode: FEED_CODE,
        feedName: FEED_NAME,
        externalId: raw.externalId,
        canonicalUrl: raw.canonicalUrl,
        sourceUrl: raw.canonicalUrl,
        title: raw.title,
        descriptionHtml: raw.summary ? `<p>${raw.summary}</p>` : "",
        descriptionText: raw.summary,
        // No article body of its own stored — see module comment (commercial
        // media, title/summary/thumbnail/link only).
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: raw.categoryRaw,
        displayType: null,
        publishedAtUtc: raw.publishedAtUtc,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets,
        // SEO metadata is filled in by generateSeoMetadataWithAi in
        // runIngestion.ts, same as every other special source.
        metaTitle: "",
        metaDescription: "",
        keywords: raw.categoryRaw || "",
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
      error instanceof Error ? error.message : "Unknown iThome 醫療IT fetch error";
    return {
      ok: false,
      httpStatus: null,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};
