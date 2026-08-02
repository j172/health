import type { EnrichedRssItem, FeedFetchResult, IngestionSummary, NormalizedRssItem } from "@/types/rss";
import { RSS_FEEDS } from "@/lib/server/config/rss-feeds";
import { createIngestionRun, finishIngestionRun, writeIngestionError } from "@/lib/server/logging/ingestionLogger";
import { releaseIngestionLock, tryAcquireIngestionLock } from "@/lib/server/db/mysql";
import { fetchFeedXml } from "@/lib/server/rss/fetchFeeds";
import { parseFeedXml } from "@/lib/server/rss/parseRss";
import { fetchDetailPage } from "@/lib/server/rss/fetchDetailPage";
import { fetchMirrorMediaHealthnews } from "@/lib/server/rss/fetchMirrorMediaExternals";
import { fetchUdnHealthNews } from "@/lib/server/rss/fetchUdnHealthNews";
import { persistItems } from "@/lib/server/rss/persistItems";
import { getExistingPayloadHashes, itemKey } from "@/lib/server/rss/existingHashes";
import { assignMissingNewsCardImages } from "@/lib/server/news/cardImages";
import { generateSeoMetadataWithAi } from "@/lib/server/news/generateSeoMetadata";

const LOCK_NAME = "rss_ingestion_lock";

const FEEDS_BY_CODE = new Map(RSS_FEEDS.map((feed) => [feed.code, feed]));

const enrichItem = async (item: NormalizedRssItem): Promise<EnrichedRssItem> => {
  const detail = FEEDS_BY_CODE.get(item.feedCode)?.skipDetailFetch
    ? { detailHtml: null, detailText: null, assets: [] }
    : await fetchDetailPage(item).catch(() => ({ detailHtml: null, detailText: null, assets: [] }));

  const seo = await generateSeoMetadataWithAi({
    title: item.title,
    descriptionText: item.descriptionText,
    detailText: detail.detailText,
    feedName: item.feedName,
    deptName: item.deptName,
    sourceName: item.sourceName,
    publishedAtUtc: item.publishedAtUtc,
  });

  return {
    ...item,
    detailHtml: detail.detailHtml,
    detailText: detail.detailText,
    assets: detail.assets,
    metaTitle: seo.metaTitle,
    metaDescription: seo.metaDescription,
    keywords: seo.keywords,
    geoSummary: seo.geoSummary,
  };
};

export const runRssIngestion = async (trigger: "internal-cron" | "admin-manual"): Promise<IngestionSummary> => {
  const started = new Date();
  const runId = await createIngestionRun(trigger);
  const gotLock = await tryAcquireIngestionLock(LOCK_NAME, 1);

  if (!gotLock) {
    const now = new Date();
    const blockedSummary: IngestionSummary = {
      trigger,
      runId,
      startedAt: started.toISOString(),
      endedAt: now.toISOString(),
      durationMs: now.getTime() - started.getTime(),
      fetched: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      failedFeeds: 1,
      feedResults: [],
    };

    await finishIngestionRun({
      runId,
      status: "failed",
      startedAt: started,
      fetchedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      failedFeedsCount: 1,
      summaryJson: JSON.stringify(blockedSummary),
      errorMessage: "Another ingestion is currently running.",
    });

    throw new Error("Another ingestion is currently running.");
  }

  const feedResults: FeedFetchResult[] = [];
  const normalizedItems: NormalizedRssItem[] = [];

  try {
    for (const feed of RSS_FEEDS) {
      try {
        const response = await fetchFeedXml(feed);
        const items = parseFeedXml(feed, response.xml);
        normalizedItems.push(...items);

        feedResults.push({
          feed,
          ok: true,
          httpStatus: response.status,
          itemCount: items.length,
          errorMessage: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown feed error";
        feedResults.push({
          feed,
          ok: false,
          httpStatus: null,
          itemCount: 0,
          errorMessage: message,
        });
        await writeIngestionError({
          runId,
          feedCode: feed.code,
          url: feed.url,
          message,
          detail: { error },
        });
      }
    }

    const existingHashes = await getExistingPayloadHashes(normalizedItems);
    let skippedUnchanged = 0;

    const enrichedItems: EnrichedRssItem[] = [];
    for (const item of normalizedItems) {
      if (existingHashes.get(itemKey(item)) === item.payloadHash) {
        // Already stored with an identical payload — skip the expensive detail-page
        // fetch/parse entirely instead of redoing it on every run just to no-op.
        skippedUnchanged += 1;
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const enriched = await enrichItem(item);
      enrichedItems.push(enriched);
    }

    // -----------------------------------------------------------------------
    // Mirror Media 健康醫療網 — JSON API (not RSS/XML; handled separately)
    // -----------------------------------------------------------------------
    const mirrorResult = await fetchMirrorMediaHealthnews();
    if (!mirrorResult.ok) {
      feedResults.push({
        feed: {
          code: "mirrormedia_healthnews",
          name: "鏡週刊健康醫療網",
          url: "https://api.mirrormedia.mg/externals",
          sourceName: "mirrormedia_healthnews",
        },
        ok: false,
        httpStatus: mirrorResult.httpStatus,
        itemCount: 0,
        errorMessage: mirrorResult.errorMessage,
      });
      await writeIngestionError({
        runId,
        feedCode: "mirrormedia_healthnews",
        url: "https://api.mirrormedia.mg/externals",
        message: mirrorResult.errorMessage ?? "Unknown Mirror Media fetch error",
        detail: {},
      });
    } else {
      feedResults.push({
        feed: {
          code: "mirrormedia_healthnews",
          name: "鏡週刊健康醫療網",
          url: "https://api.mirrormedia.mg/externals",
          sourceName: "mirrormedia_healthnews",
        },
        ok: true,
        httpStatus: mirrorResult.httpStatus,
        itemCount: mirrorResult.itemCount,
        errorMessage: null,
      });

      // Mirror Media API already returns full content — check hashes and skip
      // unchanged items, then enrich only the new/changed ones with AI SEO.
      const mirrorHashes = await getExistingPayloadHashes(mirrorResult.items);
      for (const item of mirrorResult.items) {
        if (mirrorHashes.get(itemKey(item)) === item.payloadHash) {
          skippedUnchanged += 1;
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const seo = await generateSeoMetadataWithAi({
          title: item.title,
          descriptionText: item.descriptionText,
          detailText: item.detailText,
          feedName: item.feedName,
          deptName: item.deptName,
          sourceName: item.sourceName,
          publishedAtUtc: item.publishedAtUtc,
        });
        enrichedItems.push({
          ...item,
          metaTitle: seo.metaTitle,
          metaDescription: seo.metaDescription,
          keywords: seo.keywords,
          geoSummary: seo.geoSummary,
        });
      }
    }

    // -----------------------------------------------------------------------
    // 元氣網（health.udn.com/health）— HTML ranking page (no RSS feed of its
    // own), handled separately just like Mirror Media above.
    // -----------------------------------------------------------------------
    const udnResult = await fetchUdnHealthNews();
    if (!udnResult.ok) {
      feedResults.push({
        feed: {
          code: "udn_health",
          name: "元氣網（聯合報健康）",
          url: "https://health.udn.com/health/rank/newest/1005",
          sourceName: "udn_health",
        },
        ok: false,
        httpStatus: udnResult.httpStatus,
        itemCount: 0,
        errorMessage: udnResult.errorMessage,
      });
      await writeIngestionError({
        runId,
        feedCode: "udn_health",
        url: "https://health.udn.com/health/rank/newest/1005",
        message: udnResult.errorMessage ?? "Unknown UDN health fetch error",
        detail: {},
      });
    } else {
      feedResults.push({
        feed: {
          code: "udn_health",
          name: "元氣網（聯合報健康）",
          url: "https://health.udn.com/health/rank/newest/1005",
          sourceName: "udn_health",
        },
        ok: true,
        httpStatus: udnResult.httpStatus,
        itemCount: udnResult.itemCount,
        errorMessage: null,
      });

      // The rank page already includes a real summary paragraph — check hashes
      // and skip unchanged items, then enrich only the new/changed ones with AI SEO.
      const udnHashes = await getExistingPayloadHashes(udnResult.items);
      for (const item of udnResult.items) {
        if (udnHashes.get(itemKey(item)) === item.payloadHash) {
          skippedUnchanged += 1;
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const seo = await generateSeoMetadataWithAi({
          title: item.title,
          descriptionText: item.descriptionText,
          detailText: item.detailText,
          feedName: item.feedName,
          deptName: item.deptName,
          sourceName: item.sourceName,
          publishedAtUtc: item.publishedAtUtc,
        });
        enrichedItems.push({
          ...item,
          metaTitle: seo.metaTitle,
          metaDescription: seo.metaDescription,
          keywords: seo.keywords,
          geoSummary: seo.geoSummary,
        });
      }
    }

    const persisted = await persistItems(enrichedItems);
    persisted.unchanged += skippedUnchanged;
    try {
      // Raised from 3: at 3/run (every 30 min via crontab) the ~2,244-article
      // backlog would take ~15 days to clear even before today's MAX_API_PAGES
      // and stuck-article fixes improved the per-attempt success rate. Pixabay
      // search+download is the only part of this that takes real time, so 10
      // still comfortably fits inside the cron's --max-time 280 budget.
      await assignMissingNewsCardImages(10);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown card image assignment error";
      await writeIngestionError({
        runId,
        message: `News persisted, but automatic card image assignment failed: ${message}`,
        detail: { stage: "pixabay-card-images" },
      });
    }
    const ended = new Date();
    const summary: IngestionSummary = {
      trigger,
      runId,
      startedAt: started.toISOString(),
      endedAt: ended.toISOString(),
      durationMs: ended.getTime() - started.getTime(),
      fetched: normalizedItems.length,
      inserted: persisted.inserted,
      updated: persisted.updated,
      unchanged: persisted.unchanged,
      failedFeeds: feedResults.filter((f) => !f.ok).length,
      feedResults,
    };

    await finishIngestionRun({
      runId,
      status: "success",
      startedAt: started,
      fetchedCount: summary.fetched,
      insertedCount: summary.inserted,
      updatedCount: summary.updated,
      unchangedCount: summary.unchanged,
      failedFeedsCount: summary.failedFeeds,
      summaryJson: JSON.stringify(summary),
    });

    return summary;
  } catch (error) {
    const ended = new Date();
    const message = error instanceof Error ? error.message : "Unknown ingestion error";
    await writeIngestionError({
      runId,
      message,
      detail: { error },
    });

    const summary: IngestionSummary = {
      trigger,
      runId,
      startedAt: started.toISOString(),
      endedAt: ended.toISOString(),
      durationMs: ended.getTime() - started.getTime(),
      fetched: normalizedItems.length,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      failedFeeds: Math.max(1, feedResults.filter((f) => !f.ok).length),
      feedResults,
    };

    await finishIngestionRun({
      runId,
      status: "failed",
      startedAt: started,
      fetchedCount: summary.fetched,
      insertedCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      failedFeedsCount: summary.failedFeeds,
      summaryJson: JSON.stringify(summary),
      errorMessage: message,
    });

    throw error;
  } finally {
    await releaseIngestionLock(LOCK_NAME);
  }
};