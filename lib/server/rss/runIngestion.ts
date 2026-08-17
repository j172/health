import type { EnrichedRssItem, FeedCode, FeedFetchResult, IngestionSummary, NormalizedRssItem } from "@/types/rss";
import { RSS_FEEDS } from "@/lib/server/config/rss-feeds";
import { createIngestionRun, finishIngestionRun, writeIngestionError } from "@/lib/server/logging/ingestionLogger";
import { releaseIngestionLock, tryAcquireIngestionLock } from "@/lib/server/db/mysql";
import { fetchFeedXml } from "@/lib/server/rss/fetchFeeds";
import { parseFeedXml } from "@/lib/server/rss/parseRss";
import { fetchDetailPage } from "@/lib/server/rss/fetchDetailPage";
import { fetchMirrorMediaHealthnews } from "@/lib/server/rss/fetchMirrorMediaExternals";
import { fetchUdnHealthNews } from "@/lib/server/rss/fetchUdnHealthNews";
import { fetchMoenvNews } from "@/lib/server/rss/fetchMoenvNews";
import { fetchSetnHealthNews } from "@/lib/server/rss/fetchSetnHealthNews";
import { fetchEttodayHealthNews } from "@/lib/server/rss/fetchEttodayHealthNews";
import { fetchHealthnewsNews } from "@/lib/server/rss/fetchHealthnewsNews";
import { fetchFiftyplusHealthNews } from "@/lib/server/rss/fetchFiftyplusHealthNews";
import { persistItems } from "@/lib/server/rss/persistItems";
import { getExistingPayloadHashes, itemKey } from "@/lib/server/rss/existingHashes";
import { generateSeoMetadataWithAi } from "@/lib/server/news/generateSeoMetadata";
import { fetchOpenGraphImageAsset } from "@/lib/server/images/fetchOpenGraphImage";
import type { NewsAsset } from "@/types/rss";

const LOCK_NAME = "rss_ingestion_lock";

const FEEDS_BY_CODE = new Map(RSS_FEEDS.map((feed) => [feed.code, feed]));

const enrichItem = async (item: NormalizedRssItem): Promise<EnrichedRssItem> => {
  let detail: { detailHtml: string | null; detailText: string | null; assets: NewsAsset[] } =
    FEEDS_BY_CODE.get(item.feedCode)?.skipDetailFetch
      ? { detailHtml: null, detailText: null, assets: [] }
      : await fetchDetailPage(item).catch(() => ({ detailHtml: null, detailText: null, assets: [] }));

  // skipDetailFetch (ltn etc.) never stores body HTML, but cards still need a
  // thumbnail. Pull og:image only — no article body scrape / republish.
  // Also covers full detail fetches that found zero content images.
  if (!detail.assets.some((asset) => asset.assetType === "image")) {
    const ogAsset = await fetchOpenGraphImageAsset(item.canonicalUrl).catch(() => null);
    if (ogAsset) {
      detail = { ...detail, assets: [ogAsset, ...detail.assets] };
    }
  }

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

// ---------------------------------------------------------------------------
// "Special sources" — non-RSS/XML sources (a JSON API, a scraped HTML
// listing page, ...) that can't go through the RSS_FEEDS loop above, so they
// get fetched directly and normalized into EnrichedRssItem[] by their own
// fetcher module instead. Originally 3 near-identical ~60-line blocks
// (Mirror Media / UDN / MOENV) copy-pasted inline here; extracted into this
// shared helper as part of Phase 8 when 4 more (SETN/ETtoday/healthnews.com.tw/
// fiftyplus) were added, to stop that duplication from growing further.
// Behavior-preserving extraction — no logic changes from the original 3
// inline blocks.
// ---------------------------------------------------------------------------

interface SpecialSourceMeta {
  code: FeedCode;
  name: string;
  url: string;
  sourceName: string;
}

interface SpecialSourceFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

interface SpecialSourceContext {
  runId: number;
  feedResults: FeedFetchResult[];
  enrichedItems: EnrichedRssItem[];
}

const processSpecialSource = async (
  meta: SpecialSourceMeta,
  fetchFn: () => Promise<SpecialSourceFetchResult>,
  ctx: SpecialSourceContext,
): Promise<{ skippedUnchanged: number }> => {
  const result = await fetchFn();
  const feedConfig = { code: meta.code, name: meta.name, url: meta.url, sourceName: meta.sourceName };

  if (!result.ok) {
    ctx.feedResults.push({
      feed: feedConfig,
      ok: false,
      httpStatus: result.httpStatus,
      itemCount: 0,
      errorMessage: result.errorMessage,
    });
    await writeIngestionError({
      runId: ctx.runId,
      feedCode: meta.code,
      url: meta.url,
      message: result.errorMessage ?? `Unknown ${meta.name} fetch error`,
      detail: {},
    });
    return { skippedUnchanged: 0 };
  }

  ctx.feedResults.push({
    feed: feedConfig,
    ok: true,
    httpStatus: result.httpStatus,
    itemCount: result.itemCount,
    errorMessage: null,
  });

  // These fetchers already return full/complete content (or a deliberate
  // summary-only payload, per source) — check hashes and skip unchanged
  // items, then enrich only the new/changed ones with AI SEO, same as every
  // RSS feed item above.
  const hashes = await getExistingPayloadHashes(result.items);
  let skippedUnchanged = 0;
  for (const item of result.items) {
    if (hashes.get(itemKey(item)) === item.payloadHash) {
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
    ctx.enrichedItems.push({
      ...item,
      metaTitle: seo.metaTitle,
      metaDescription: seo.metaDescription,
      keywords: seo.keywords,
      geoSummary: seo.geoSummary,
    });
  }

  return { skippedUnchanged };
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

    const specialSourceCtx: SpecialSourceContext = { runId, feedResults, enrichedItems };

    // -----------------------------------------------------------------------
    // Mirror Media 健康醫療網 — JSON API (not RSS/XML; handled separately)
    // -----------------------------------------------------------------------
    const mirrorResult = await processSpecialSource(
      {
        code: "mirrormedia_healthnews",
        name: "鏡週刊健康醫療網",
        url: "https://api.mirrormedia.mg/externals",
        sourceName: "mirrormedia_healthnews",
      },
      fetchMirrorMediaHealthnews,
      specialSourceCtx,
    );
    skippedUnchanged += mirrorResult.skippedUnchanged;

    // -----------------------------------------------------------------------
    // 元氣網（health.udn.com/health）— HTML ranking page (no RSS feed of its
    // own), handled separately just like Mirror Media above.
    // -----------------------------------------------------------------------
    const udnResult = await processSpecialSource(
      {
        code: "udn_health",
        name: "元氣網（聯合報健康）",
        url: "https://health.udn.com/health/rank/newest/1005",
        sourceName: "udn_health",
      },
      fetchUdnHealthNews,
      specialSourceCtx,
    );
    skippedUnchanged += udnResult.skippedUnchanged;

    // -----------------------------------------------------------------------
    // 環境部（MOENV）新聞專區 — JSON open-data API (not RSS/XML; handled
    // separately just like Mirror Media and UDN above).
    // -----------------------------------------------------------------------
    const moenvResult = await processSpecialSource(
      {
        code: "moenv_mnews",
        name: "環境部",
        url: "https://data.moenv.gov.tw/api/v2/mnews_p_01",
        sourceName: "moenv",
      },
      fetchMoenvNews,
      specialSourceCtx,
    );
    skippedUnchanged += moenvResult.skippedUnchanged;

    // -----------------------------------------------------------------------
    // 祝你健康（SETN）/ ETtoday健康雲 / 健康醫療網 / 50+（橘世代）— Phase 8:
    // 4 more HTML-scrape special sources, none of which have an RSS feed of
    // their own. Same treatment as Mirror Media/UDN/MOENV above.
    // -----------------------------------------------------------------------
    const setnResult = await processSpecialSource(
      {
        code: "setn_health",
        name: "祝你健康",
        url: "https://health.setn.com/",
        sourceName: "setn",
      },
      fetchSetnHealthNews,
      specialSourceCtx,
    );
    skippedUnchanged += setnResult.skippedUnchanged;

    const ettodayResult = await processSpecialSource(
      {
        code: "ettoday_health",
        name: "ETtoday健康雲",
        url: "https://health.ettoday.net/",
        sourceName: "ettoday",
      },
      fetchEttodayHealthNews,
      specialSourceCtx,
    );
    skippedUnchanged += ettodayResult.skippedUnchanged;

    const healthnewsResult = await processSpecialSource(
      {
        code: "healthnews_tw",
        name: "健康醫療網",
        url: "https://www.healthnews.com.tw/",
        sourceName: "healthnews",
      },
      fetchHealthnewsNews,
      specialSourceCtx,
    );
    skippedUnchanged += healthnewsResult.skippedUnchanged;

    const fiftyplusResult = await processSpecialSource(
      {
        code: "fiftyplus_health",
        name: "50+（橘世代）",
        url: "https://www.fiftyplus.com.tw/category/health",
        sourceName: "fiftyplus",
      },
      fetchFiftyplusHealthNews,
      specialSourceCtx,
    );
    skippedUnchanged += fiftyplusResult.skippedUnchanged;

    const persisted = await persistItems(enrichedItems);
    persisted.unchanged += skippedUnchanged;
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
