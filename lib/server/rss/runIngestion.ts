import type { EnrichedRssItem, FeedFetchResult, IngestionSummary, NormalizedRssItem } from "@/types/rss";
import { RSS_FEEDS } from "@/lib/server/config/rss-feeds";
import { createIngestionRun, finishIngestionRun, writeIngestionError } from "@/lib/server/logging/ingestionLogger";
import { releaseIngestionLock, tryAcquireIngestionLock } from "@/lib/server/db/mysql";
import { fetchFeedXml } from "@/lib/server/rss/fetchFeeds";
import { parseFeedXml } from "@/lib/server/rss/parseRss";
import { fetchDetailPage } from "@/lib/server/rss/fetchDetailPage";
import { persistItems } from "@/lib/server/rss/persistItems";
import { getExistingPayloadHashes, itemKey } from "@/lib/server/rss/existingHashes";
import { assignMissingNewsCardImages } from "@/lib/server/news/cardImages";

const LOCK_NAME = "rss_ingestion_lock";

const FEEDS_BY_CODE = new Map(RSS_FEEDS.map((feed) => [feed.code, feed]));

const enrichItem = async (item: NormalizedRssItem): Promise<EnrichedRssItem> => {
  if (FEEDS_BY_CODE.get(item.feedCode)?.skipDetailFetch) {
    return { ...item, detailHtml: null, detailText: null, assets: [] };
  }

  try {
    const detail = await fetchDetailPage(item);
    return {
      ...item,
      detailHtml: detail.detailHtml,
      detailText: detail.detailText,
      assets: detail.assets,
    };
  } catch {
    return {
      ...item,
      detailHtml: null,
      detailText: null,
      assets: [],
    };
  }
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

    const persisted = await persistItems(enrichedItems);
    persisted.unchanged += skippedUnchanged;
    try {
      await assignMissingNewsCardImages(3);
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