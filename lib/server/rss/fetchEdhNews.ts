import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";
import { sha256 } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// 早安健康 (edh.tw) — Taiwan's largest consumer health-content publisher.
// Has no RSS feed of its own (confirmed: /rss, /feed, /rss.xml all 404), and
// Google News `site:edh.tw` is unusable as a substitute (already noted in
// rss-feeds.ts: its indexed on-site search pages inject Simplified-Chinese
// SEO spam into the result titles). So this scrapes the listing pages.
//
// The request that started this arrived as a linetoday.edh.tw URL, which is
// robots-disallowed in full (`User-Agent: * / Disallow: /`). edh.tw's own
// robots.txt is permissive and /article-list is unrestricted — and it carries
// the same articles (measured: all 15 /article-list links were present in the
// LINE Today set), so this crawls the apex site through the allowed door.
// Always the apex host: www.edh.tw 302s to a malformed https://edh.tw:443/.
//
// **The rendered DOM is not the parse target.** It contains zero <time>
// elements and no publish date anywhere, and its <img> sources are
// /_ipx/q_80&s_172x90/... resize-proxy paths rather than the original art.
// The usual "require a parseable date on the card to exclude non-chronological
// widgets" trick (fetchBusinessweeklyHealthNews.ts) therefore cannot work here.
//
// Everything needed is in the Nuxt 3 payload instead: a
// <script type="application/json" id="__NUXT_DATA__"> devalue flat array,
// where object property values are integer indices into that same array. A
// ~15-line bounded deref helper reads it — deliberately no `devalue`
// dependency for one parse site. Only the scalar fields below are deref'd:
// a *deep* recursive deref would drag in the entire serialized Nuxt app state
// hanging off sibling keys like `thumbsUpCount`.
//
// Ad/advertorial defence is structural, not keyword-based: the paginated list
// interleaves popIn ad slots as `{ id, type: "ads", data: "<div …>" }`, so
// requiring `type === "article"` is sufficient and is the entire filter. The
// branded microsites and advertorials (Amino L40, 假牙保養1+1, insurance
// 【超值推薦】…) live in the page's separate 推薦文章/焦點專題 blocks, which are
// never in this list. That also settles recency: the list is paginated and
// reverse-chronological, so no date-cutoff filter is required.
//
// Two pages per run: 早安健康 publishes ~5-6 articles/day and rss-sync runs
// every 30 min, but this repo has no backfill path for articles missed during
// an outage (existingHashes dedupes, it does not re-discover). Page 1 alone
// covers ~36 h; page 1+2 covers ~3.5 days, which survives the multi-day
// outages already on record. Cost is one extra ~270 KB GET per run.
//
// Full article bodies are never fetched or stored: 早安健康 is a commercial
// publisher, same copyright stance as healthbw/fiftyplus/udn_health/ltn/
// top1health — title/summary/thumbnail/link only. The listing payload does not
// expose the body at all, so the data source enforces this as well.
// ---------------------------------------------------------------------------

const FEED_CODE = "edh_health" as const;
const SOURCE_NAME = "edh";
const FEED_NAME = "早安健康";
const BASE_URL = "https://edh.tw";

const LIST_URLS = [
  `${BASE_URL}/article-list`,
  `${BASE_URL}/article-list?page=2`,
];

const NUXT_DATA_RE =
  /<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

/** Deref chains longer than this mean a malformed/cyclic payload, not real data. */
const MAX_DEREF_DEPTH = 8;

/** Smallest plausible article list — anything shorter is some other `{ item }` holder. */
const MIN_LIST_LENGTH = 4;

export interface EdhFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

/**
 * Follows devalue's integer-index indirection to the value it ultimately names.
 * Stops at the first non-index value; never descends into objects or arrays
 * (see module header — a deep deref pulls in the whole Nuxt app state).
 */
const derefIndex = (
  payload: unknown[],
  value: unknown,
  depth = 0,
): unknown => {
  if (depth >= MAX_DEREF_DEPTH) return null;
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < payload.length
  ) {
    return derefIndex(payload, payload[value], depth + 1);
  }
  return value;
};

const derefString = (payload: unknown[], value: unknown): string | null => {
  const resolved = derefIndex(payload, value);
  if (typeof resolved !== "string") return null;
  const trimmed = resolved.trim();
  return trimmed || null;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Locates the paginated article list: the payload entry shaped `{ item: … }`
 * whose target is an array of more than MIN_LIST_LENGTH entries (12/page as of
 * 2026-08-23, articles and ad slots combined).
 */
const findArticleList = (payload: unknown[]): unknown[] | null => {
  for (const entry of payload) {
    if (!isPlainObject(entry) || !("item" in entry)) continue;
    const target = derefIndex(payload, entry.item);
    if (Array.isArray(target) && target.length > MIN_LIST_LENGTH) return target;
  }
  return null;
};

export const fetchEdhNews = async (): Promise<EdhFetchResult> => {
  let httpStatus: number | null = null;
  const items: EnrichedRssItem[] = [];
  const seenExternalIds = new Set<string>();
  const errors: string[] = [];
  let anyPageOk = false;

  for (const listUrl of LIST_URLS) {
    try {
      const response = await httpGetText(listUrl, {
        headers: {
          "User-Agent": "health.j172.tw-rss-ingestor/1.0",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeoutMs: 15_000,
      });

      httpStatus = response.status;
      if (response.status < 200 || response.status >= 300) {
        errors.push(`${listUrl} HTTP ${response.status}`);
        continue;
      }

      const scriptMatch = response.text.match(NUXT_DATA_RE);
      if (!scriptMatch) {
        errors.push(`${listUrl}: no __NUXT_DATA__ payload`);
        continue;
      }

      const payload: unknown = JSON.parse(scriptMatch[1]);
      if (!Array.isArray(payload)) {
        errors.push(`${listUrl}: __NUXT_DATA__ is not a devalue array`);
        continue;
      }

      const list = findArticleList(payload);
      if (!list) {
        errors.push(`${listUrl}: no article list in __NUXT_DATA__`);
        continue;
      }

      let pageArticleCount = 0;

      for (const listEntry of list) {
        const entry = derefIndex(payload, listEntry);
        if (!isPlainObject(entry)) continue;

        // The entire ad/advertorial filter — interleaved popIn slots are
        // `{ id, type: "ads", data }`. See module header.
        if (derefString(payload, entry.type) !== "article") continue;

        const externalId = derefString(payload, entry.routeCode);
        const title = derefString(payload, entry.title);
        const publishedAtUtc = parseTaipeiDateToUtc(
          derefString(payload, entry.startDate),
        );
        if (!externalId || !title || !publishedAtUtc) continue;

        pageArticleCount += 1;
        if (seenExternalIds.has(externalId)) continue;
        seenExternalIds.add(externalId);

        // No query string of any kind: a varying ?referral_origin= would
        // defeat the canonical_url half of getExistingPayloadHashes' dedup.
        const canonicalUrl = `${BASE_URL}/articles/${externalId}`;

        // `summary` is a complete 70-80 char editorial summary; `pureContent`
        // is hard-truncated to exactly 100 chars mid-sentence, so it is not
        // used. descriptionHtml mirrors the text (fetchUdnHealthNews.ts
        // convention).
        const descriptionText = derefString(payload, entry.summary) ?? "";
        const categoryRaw = derefString(payload, entry.categoryNameDisplay);
        const imgSrc = derefString(payload, entry.webSizeImageUrl);

        // Downloaded and re-hosted locally rather than hotlinking
        // media-edh-cdn.h2u.io — same treatment as setn/udn_health.
        const assets: EnrichedRssItem["assets"] = [];
        if (imgSrc) {
          const localPath = await downloadArticleImage(imgSrc);
          if (localPath) {
            assets.push({
              assetType: "image",
              title: derefString(payload, entry.imageTitle),
              url: localPath,
              sortOrder: 0,
            });
          }
        }

        const payloadHash = sha256(
          JSON.stringify({
            title,
            canonicalUrl,
            publishedAtUtc: publishedAtUtc.toISOString(),
            descriptionText,
            categoryRaw,
            imgSrc,
          }),
        );

        items.push({
          sourceName: SOURCE_NAME,
          feedCode: FEED_CODE,
          feedName: FEED_NAME,
          externalId,
          canonicalUrl,
          sourceUrl: listUrl,
          title,
          descriptionHtml: descriptionText,
          descriptionText,
          detailHtml: null,
          detailText: null,
          // Deliberately null even though the payload offers a per-article
          // authorName (黃軒醫師 etc.): resolveAuthorLabel is
          // dept_name || SOURCE_LABELS[source_name] || feed_name, and every
          // other media source prints its masthead. Cards read「早安健康」.
          deptName: null,
          categoryRaw,
          displayType: null,
          publishedAtUtc,
          publicBeginAtTaipei: null,
          publicEndAtTaipei: null,
          payloadHash,
          assets,
          // SEO metadata is filled in by runIngestion.ts (via
          // generateSeoMetadataWithAi) only for new/changed items, same as the
          // other special sources.
          metaTitle: "",
          metaDescription: "",
          keywords: "",
          geoSummary: "",
        });
      }

      // A page that parsed but yielded no articles means the payload shape
      // changed — a real failure, not "nothing new". Never silently empty.
      if (pageArticleCount === 0) {
        errors.push(`${listUrl}: 0 articles parsed`);
        continue;
      }

      anyPageOk = true;
    } catch (error) {
      errors.push(
        error instanceof Error
          ? `${listUrl}: ${error.message}`
          : `${listUrl}: unknown error`,
      );
    }
  }

  if (!anyPageOk) {
    return {
      ok: false,
      httpStatus,
      itemCount: 0,
      items: [],
      errorMessage: errors.join("; ") || "Unknown edh.tw fetch error",
    };
  }

  return {
    ok: true,
    httpStatus,
    itemCount: items.length,
    items,
    // A partial failure (one of the two listing pages down) doesn't fail the
    // whole fetch — surfaced for visibility without blocking ingestion, same
    // as fetchBusinessweeklyHealthNews.ts.
    errorMessage:
      errors.length > 0 ? `Partial failure: ${errors.join("; ")}` : null,
  };
};
