import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { sha256, toAbsoluteUrl } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// ETtoday健康雲（health.ettoday.net）— has no RSS feed of its own (confirmed:
// /rss.xml returns the homepage, not a feed), so this scrapes the homepage's
// "熱門新聞" (trending) list, the only block on the page with a per-item
// timestamp. Unlike SETN/UDN, that timestamp is *relative* ("N小時前" /
// "N分鐘前") rather than an absolute date — there is no absolute-timestamp
// listing anywhere on this page, so relative time is parsed against fetch
// time and is inherently approximate (±partial-hour precision).
//
// Full article bodies are never fetched/stored: ETtoday is a commercial news
// network, same copyright stance as udn_health/ltn/top1health.
// ---------------------------------------------------------------------------

const FEED_CODE = "ettoday_health" as const;
const SOURCE_NAME = "ettoday";
const FEED_NAME = "ETtoday健康雲";
const LIST_URL = "https://health.ettoday.net/";

/** "1小時前" / "23分鐘前" / "剛剛" relative to fetch time. Returns null for anything else (e.g. an already-absolute date format this site doesn't currently use, kept as a safety net). */
const parseRelativeTaipeiTime = (text: string, now: Date): Date | null => {
  const trimmed = text.trim();
  if (!trimmed || trimmed === "剛剛") return now;

  const hourMatch = trimmed.match(/^(\d+)\s*小時前$/);
  if (hourMatch)
    return new Date(now.getTime() - Number(hourMatch[1]) * 60 * 60 * 1000);

  const minuteMatch = trimmed.match(/^(\d+)\s*分鐘前$/);
  if (minuteMatch)
    return new Date(now.getTime() - Number(minuteMatch[1]) * 60 * 1000);

  const dayMatch = trimmed.match(/^(\d+)\s*天前$/);
  if (dayMatch)
    return new Date(now.getTime() - Number(dayMatch[1]) * 24 * 60 * 60 * 1000);

  return null;
};

export interface EttodayHealthFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchEttodayHealthNews =
  async (): Promise<EttodayHealthFetchResult> => {
    let httpStatus: number | null = null;

    try {
      const response = await httpGetText(LIST_URL, {
        headers: {
          "User-Agent": "health.j172.tw-rss-ingestor/1.0",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeoutMs: 15_000,
      });

      httpStatus = response.status;
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`ETtoday health page HTTP ${response.status}`);
      }

      const fetchedAt = new Date();
      const $ = load(response.text);
      const items: EnrichedRssItem[] = [];
      const seenExternalIds = new Set<string>();

      for (const el of $("div.piece[newskindf]").toArray()) {
        const card = $(el);
        const anchor = card.find('p > a[href*="/news/"]').first();
        const href = anchor.attr("href");
        if (!href) continue;

        const match = href.match(/\/news\/(\d+)/);
        if (!match) continue;
        const externalId = match[1];
        if (seenExternalIds.has(externalId)) continue;
        seenExternalIds.add(externalId);

        const title = (anchor.attr("title") || anchor.text() || "")
          .replace(/\s+/g, " ")
          .trim();
        if (!title) continue;

        const canonicalUrl = toAbsoluteUrl(href, LIST_URL);
        const categoryRaw = card.find("em.tag").first().text().trim() || null;
        const dateText = card.find("span.date").first().text().trim();
        const publishedAtUtc = parseRelativeTaipeiTime(dateText, fetchedAt);

        const imgEl = card.find("img").first();
        const rawImgSrc = imgEl.attr("src") || imgEl.attr("data-src") || null;
        const imgSrc = rawImgSrc
          ? toAbsoluteUrl(rawImgSrc, canonicalUrl)
          : null;

        const assets: EnrichedRssItem["assets"] = [];
        if (imgSrc) {
          const localPath = await downloadArticleImage(imgSrc);
          if (localPath) {
            assets.push({
              assetType: "image",
              title: imgEl.attr("alt")?.trim() || null,
              url: localPath,
              sortOrder: 0,
            });
          }
        }

        const payloadHash = sha256(
          JSON.stringify({
            title,
            canonicalUrl,
            categoryRaw,
            // Deliberately excluded from the hash: relative-time text changes
            // every fetch (e.g. "1小時前" -> "2小時前") for an otherwise
            // unchanged article, which would mark it "updated" on every single
            // ingestion run instead of "unchanged".
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
          title,
          descriptionHtml: "",
          descriptionText: "",
          detailHtml: null,
          detailText: null,
          deptName: null,
          categoryRaw,
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

      return {
        ok: true,
        httpStatus,
        itemCount: items.length,
        items,
        errorMessage: null,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown ETtoday health fetch error";
      return {
        ok: false,
        httpStatus,
        itemCount: 0,
        items: [],
        errorMessage: message,
      };
    }
  };
