import { httpGetText } from "../net/httpClient";
import { withRetry } from "../net/withRetry";
import { parseFeedXml } from "../rss/parseRss";
import { fetchDetailPage } from "../rss/fetchDetailPage";
import { isFresh } from "../rss/freshness";
import { persistItems, type PersistStats } from "../rss/persistItems";
import {
  GOV_OPENDATA_SOURCES,
  type GovOpenDataSource,
} from "../config/gov-opendata-news-sources";
import type { EnrichedRssItem, FeedConfig, NormalizedRssItem } from "@/types/rss";

export interface SyncGovNewsOptions {
  sourceId?: string;
  limit?: number;
  backfill?: boolean;
  dryRun?: boolean;
}

export interface SyncGovNewsResult {
  ok: boolean;
  totalSources: number;
  totalFetched: number;
  totalFresh: number;
  totalEnriched: number;
  persistStats: PersistStats;
  errors: Array<{ sourceId: string; error: string }>;
}

/**
 * Normalizes a GovOpenDataSource into standard FeedConfig for RSS parsing.
 */
export function toFeedConfig(source: GovOpenDataSource): FeedConfig {
  return {
    code: source.feedCode,
    name: source.feedName,
    url: source.url,
    sourceName: source.sourceName,
  };
}

/**
 * Fetches and enriches news from government open data and official sources
 * using the dual-track strategy defined in docs/specs/gov-opendata-news-integration.md.
 */
export async function syncGovOpenDataNews(
  options: SyncGovNewsOptions = {},
): Promise<SyncGovNewsResult> {
  const { sourceId, limit, backfill = false, dryRun = false } = options;

  const sourcesToProcess = sourceId
    ? GOV_OPENDATA_SOURCES.filter((s) => s.id === sourceId)
    : GOV_OPENDATA_SOURCES;

  let totalFetched = 0;
  let totalFresh = 0;
  let totalEnriched = 0;
  const errors: Array<{ sourceId: string; error: string }> = [];
  const allEnrichedItems: EnrichedRssItem[] = [];

  for (const source of sourcesToProcess) {
    try {
      const feedConfig = toFeedConfig(source);
      
      const response = await withRetry(
        async () => {
          const res = await httpGetText(source.url, {
            headers: {
              "User-Agent": "health.j172.tw-gov-news-sync/1.0",
              Accept:
                "application/rss+xml, application/xml, text/xml;q=0.9, application/json;q=0.8, */*;q=0.5",
            },
            timeoutMs: 15_000,
          });
          if (res.status < 200 || res.status >= 300) {
            throw new Error(`HTTP ${res.status} from ${source.url}`);
          }
          return res;
        },
        { maxAttempts: 2, delayMs: 500, nonErrorMessage: `Failed to fetch source ${source.id}` },
      );

      let items: NormalizedRssItem[] = [];

      if (source.format === "rss") {
        items = parseFeedXml(feedConfig, response.text);
      }

      totalFetched += items.length;

      // Apply limit per source if requested
      const targetItems = limit && limit > 0 ? items.slice(0, limit) : items;

      for (const item of targetItems) {
        const fresh = isFresh(item);
        if (fresh) {
          totalFresh += 1;
        }

        // Dual-track decision:
        // Fresh items (<= 90 days): attempt deep crawl for complete HTML/assets
        // Older items (> 90 days): only process if backfill is enabled, using existing text
        if (!fresh && !backfill) {
          continue;
        }

        let detailHtml = item.descriptionHtml || null;
        let detailText = item.descriptionText || null;
        let assets: EnrichedRssItem["assets"] = [];

        if (fresh && item.canonicalUrl) {
          try {
            const scraped = await fetchDetailPage(item);
            if (scraped.detailHtml && scraped.detailHtml.trim().length > 0) {
              detailHtml = scraped.detailHtml;
            }
            if (scraped.detailText && scraped.detailText.trim().length > 0) {
              detailText = scraped.detailText;
            }
            if (scraped.assets && scraped.assets.length > 0) {
              assets = scraped.assets;
            }
          } catch (scrapeErr) {
            // Keep existing description as fallback on scrape error
            console.warn(`[Gov News Sync] Scrape error for ${item.canonicalUrl}:`, scrapeErr);
          }
        }

        const enriched: EnrichedRssItem = {
          ...item,
          deptName: item.deptName || source.agencyName || source.ministry,
          categoryRaw: item.categoryRaw || source.category,
          detailHtml,
          detailText,
          assets,
          metaTitle: item.title,
          metaDescription: item.descriptionText ? item.descriptionText.slice(0, 160) : item.title,
          keywords: "",
          geoSummary: "",
        };

        allEnrichedItems.push(enriched);
        totalEnriched += 1;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({ sourceId: source.id, error: errorMsg });
      console.error(`[Gov News Sync] Source ${source.id} failed:`, errorMsg);
    }
  }

  let persistStats: PersistStats = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    externalIdDrift: 0,
    insertedIds: [],
  };

  if (!dryRun && allEnrichedItems.length > 0) {
    persistStats = await persistItems(allEnrichedItems);
  }

  return {
    ok: errors.length === 0,
    totalSources: sourcesToProcess.length,
    totalFetched,
    totalFresh,
    totalEnriched,
    persistStats,
    errors,
  };
}
