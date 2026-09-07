import { createHash } from "crypto";
import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";
import { env } from "@/lib/server/config/env";

// ---------------------------------------------------------------------------
// 環境部（MOENV）新聞專區 — data.moenv.gov.tw open data API (dataset MNEWS_P_01),
// not RSS/XML, so handled the same way as fetchMirrorMediaExternals.ts /
// fetchUdnHealthNews.ts: fetch, normalize into EnrichedRssItem[], then get
// called directly from runIngestion.ts alongside the RSS feed loop.
//
// Unlike UDN (a commercial newspaper, where full body republishing is
// deliberately avoided for copyright reasons), MOENV is a government source
// publishing its own official announcements — same category as the other
// `gov` RSS sources, which do store full/detail content. `newscontent` is
// already the complete article body, so it's stored as-is in detailHtml
// (no detail-page fetch needed/possible — this fetcher is the only source
// of content for these items).
//
// The API always returns up to `limit` rows sorted by ImportDate regardless
// of the article's own age (no server-side date filtering), so "recent" is
// enforced client-side after fetch — see RECENCY_WINDOW_MS below.
//
// MNEWS_P_10 (issue #134) is "環境直達車 Podcast" — a different dataset from
// the same account, fetched with the same api_key but with an unrelated
// record shape (podcastid/podcasttitle/podcastcontent/podcasturl/
// publishdate/image, no deletemark/newssource, and podcasturl is already an
// absolute URL rather than a relativeurl that needs resolving against
// DETAIL_BASE_URL). It's normalized into the same EnrichedRssItem[] shape
// but tagged with its own feedCode (PODCAST_FEED_CODE) so it's visually
// distinguishable from the plain-text news items; sourceName stays "moenv"
// so it inherits the existing 官方機構/gov categorization automatically.
// ---------------------------------------------------------------------------

const FEED_CODE = "moenv_mnews" as const;
const PODCAST_FEED_CODE = "moenv_podcast" as const;
const SOURCE_NAME = "moenv";
const FEED_NAME = "環境部";
const PODCAST_FEED_NAME = "環境部－環境直達車 Podcast";
const API_URL_MNEWS = "https://data.moenv.gov.tw/api/v2/mnews_p_01";
const API_URL_INEWS = "https://data.moenv.gov.tw/api/v2/inews_s_01";
const API_URL_PODCAST = "https://data.moenv.gov.tw/api/v2/mnews_p_10";

// relativeurl values observed in this dataset are paths like
// "/Page/3B3C62C78849F32F/<uuid>" on the 環境部新聞專區 site — resolve
// against that origin. Not verified against a live API response (requires
// the account owner's key); double-check once ingestion runs against real
// data and adjust if the paths turn out to need a different base.
const DETAIL_BASE_URL = "https://enews.moenv.gov.tw";

// Rows with relativeurl === "-" (common on older records, per spec research)
// have no known per-article detail page. Fall back to the news portal's
// homepage rather than leaving canonicalUrl empty — the full body is already
// stored in detailHtml regardless, so this is only ever used for the
// "前往官方原始網頁" outbound link on the article page.
const FALLBACK_URL = `${DETAIL_BASE_URL}/`;

const RECENCY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000; // ~90 days, see spec section 3

const sha256 = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const htmlToText = (html: string): string => {
  if (!html) return "";
  const $ = load(html);
  return $.text().replace(/\s+/g, " ").trim();
};

const truncate = (text: string, maxLength: number): string =>
  text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text;

// publishdate on MNEWS_P_10 has been observed as either a full
// "YYYY-MM-DD HH:MM:SS" timestamp (same as newsdate on the other two
// datasets) or a bare "YYYY-MM-DD" date; normalize the latter to midnight
// Taipei time before handing off to parseTaipeiDateToUtc, which only
// accepts the full form.
const parseMoenvDateToUtc = (value: unknown): Date | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return parseTaipeiDateToUtc(`${trimmed} 00:00:00`);
  }
  return parseTaipeiDateToUtc(trimmed);
};

interface MoenvNewsRecord {
  // mnews_p_01 / inews_s_01 shared shape
  newsno?: string;
  newstitle?: string;
  newscontent?: string;
  newssource?: string;
  newsdate?: string;
  relativeurl?: string;
  attachurl?: string;
  deletemark?: string;
  // inews specific fields
  titleno?: string;
  title?: string;
  content?: string;
  pubdate?: string;
  // mnews_p_10 (環境直達車 Podcast) fields — see the module comment above for
  // why this dataset needs separate handling from the other two.
  podcastid?: string;
  podcasttitle?: string;
  podcastcontent?: string;
  podcasturl?: string;
  publishdate?: string;
  updatedate?: string;
  image?: string;
}

type MoenvEndpointType = "mnews" | "inews" | "podcast";

export interface MoenvNewsFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchMoenvNews = async (): Promise<MoenvNewsFetchResult> => {
  let httpStatus: number | null = null;

  try {
    const apiKey = env.moenvNewsApiKey;
    if (!apiKey) {
      throw new Error("MOENV_NEWS_API_KEY is not configured");
    }

    const endpoints: { url: string; type: MoenvEndpointType }[] = [
      { url: `${API_URL_MNEWS}?api_key=${encodeURIComponent(apiKey)}&limit=1000&sort=ImportDate%20desc&format=JSON`, type: "mnews" },
      { url: `${API_URL_INEWS}?api_key=${encodeURIComponent(apiKey)}&limit=1000&sort=ImportDate%20desc&format=JSON`, type: "inews" },
      { url: `${API_URL_PODCAST}?api_key=${encodeURIComponent(apiKey)}&limit=1000&sort=ImportDate%20desc&format=JSON`, type: "podcast" },
    ];

    const rawItems: { type: MoenvEndpointType; record: MoenvNewsRecord }[] = [];

    for (const ep of endpoints) {
      try {
        const response = await httpGetText(ep.url, {
          headers: {
            "User-Agent": "health.j172.tw-rss-ingestor/1.0",
            Accept: "application/json",
          },
          timeoutMs: 15_000,
        });
        httpStatus = response.status;
        if (response.status >= 200 && response.status < 300 && response.text) {
          const parsed = JSON.parse(response.text);
          const records = Array.isArray(parsed)
            ? (parsed as MoenvNewsRecord[])
            : Array.isArray((parsed as { records?: unknown } | null)?.records)
              ? (parsed as { records: MoenvNewsRecord[] }).records
              : [];
          rawItems.push(...records.map((record) => ({ type: ep.type, record })));
        }
      } catch (err) {
        console.warn(`[fetchMoenvNews] Endpoint ${ep.type} fetch warning:`, err);
      }
    }

    const cutoffMs = Date.now() - RECENCY_WINDOW_MS;
    const items: EnrichedRssItem[] = [];
    const seenExternalIds = new Set<string>();

    for (const { type, record: raw } of rawItems) {
      if (type === "podcast") {
        const externalId = str(raw.podcastid) ? `podcast_${str(raw.podcastid)}` : "";
        if (!externalId || seenExternalIds.has(externalId)) continue;

        const title = str(raw.podcasttitle);
        if (!title) continue;

        const publishedAtUtc = parseMoenvDateToUtc(raw.publishdate);
        if (!publishedAtUtc || publishedAtUtc.getTime() < cutoffMs) continue; // outside the ~90 day recency window

        seenExternalIds.add(externalId);

        const detailHtml = str(raw.podcastcontent) || null;
        const detailText = detailHtml ? htmlToText(detailHtml) : null;
        const descriptionText = detailText ? truncate(detailText, 200) : "";

        // Unlike relativeurl on the news datasets, podcasturl is already a
        // fully-qualified source URL — no base-URL resolution needed.
        const canonicalUrl = str(raw.podcasturl) || FALLBACK_URL;

        const imageUrl = str(raw.image);
        const assets: EnrichedRssItem["assets"] = imageUrl
          ? [{ assetType: "image", title: null, url: imageUrl, sortOrder: 0 }]
          : [];

        const payloadHash = sha256(
          JSON.stringify({
            title,
            canonicalUrl,
            descriptionText,
            detailHtml,
            imageUrl,
            publishedAtUtc: publishedAtUtc.toISOString(),
          }),
        );

        items.push({
          sourceName: SOURCE_NAME,
          feedCode: PODCAST_FEED_CODE,
          feedName: PODCAST_FEED_NAME,
          externalId,
          canonicalUrl,
          sourceUrl: canonicalUrl,
          title,
          descriptionHtml: descriptionText,
          descriptionText,
          detailHtml,
          detailText,
          deptName: null,
          categoryRaw: null,
          displayType: null,
          publishedAtUtc,
          publicBeginAtTaipei: null,
          publicEndAtTaipei: null,
          payloadHash,
          assets,
          // SEO metadata is filled in by runIngestion.ts (via generateSeoMetadataWithAi)
          // only for new/changed items, same as the mirrormedia_healthnews/udn_health path.
          metaTitle: "",
          metaDescription: "",
          keywords: "",
          geoSummary: "",
        });
        continue;
      }

      if (str(raw.deletemark) !== "0") continue; // soft-deleted upstream

      const externalId = str(raw.newsno);
      if (!externalId || seenExternalIds.has(externalId)) continue;

      const title = str(raw.newstitle);
      if (!title) continue;

      const publishedAtUtc = parseTaipeiDateToUtc(raw.newsdate);
      if (!publishedAtUtc || publishedAtUtc.getTime() < cutoffMs) continue; // outside the ~90 day recency window

      seenExternalIds.add(externalId);

      const detailHtml = str(raw.newscontent) || null;
      const detailText = detailHtml ? htmlToText(detailHtml) : null;
      const descriptionText = detailText ? truncate(detailText, 200) : "";

      const relativeUrl = str(raw.relativeurl);
      const canonicalUrl =
        relativeUrl && relativeUrl !== "-"
          ? new URL(relativeUrl, DETAIL_BASE_URL).toString()
          : FALLBACK_URL;

      const deptName = str(raw.newssource) || null;

      const payloadHash = sha256(
        JSON.stringify({
          title,
          canonicalUrl,
          descriptionText,
          detailHtml,
          deptName,
          publishedAtUtc: publishedAtUtc.toISOString(),
        }),
      );

      items.push({
        sourceName: SOURCE_NAME,
        feedCode: FEED_CODE,
        feedName: FEED_NAME,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: descriptionText,
        descriptionText,
        detailHtml,
        detailText,
        deptName,
        categoryRaw: null,
        displayType: null,
        publishedAtUtc,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets: [],
        // SEO metadata is filled in by runIngestion.ts (via generateSeoMetadataWithAi)
        // only for new/changed items, same as the mirrormedia_healthnews/udn_health path.
        metaTitle: "",
        metaDescription: "",
        keywords: "",
        geoSummary: "",
      });
    }

    return {
      ok: true,
      httpStatus,
      itemCount: items.length,
      items,
      errorMessage: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown MOENV news fetch error";
    return {
      ok: false,
      httpStatus,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};
