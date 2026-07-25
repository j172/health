export type FeedCode = "16" | "17" | "18" | "101";

export interface FeedConfig {
  code: FeedCode;
  name: string;
  url: string;
}

export interface NormalizedRssItem {
  sourceName: "mohw";
  feedCode: FeedCode;
  feedName: string;
  externalId: string;
  canonicalUrl: string;
  sourceUrl: string;
  title: string;
  descriptionHtml: string;
  descriptionText: string;
  deptName: string | null;
  categoryRaw: string | null;
  displayType: string | null;
  publishedAtUtc: Date | null;
  publicBeginAtTaipei: Date | null;
  publicEndAtTaipei: Date | null;
  payloadHash: string;
}

export interface NewsAsset {
  assetType: "attachment" | "image";
  title: string | null;
  url: string;
  sortOrder: number;
}

export interface EnrichedRssItem extends NormalizedRssItem {
  detailHtml: string | null;
  detailText: string | null;
  assets: NewsAsset[];
}

export interface FeedFetchResult {
  feed: FeedConfig;
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  errorMessage: string | null;
}

export interface IngestionSummary {
  trigger: "internal-cron" | "admin-manual";
  runId: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  failedFeeds: number;
  feedResults: FeedFetchResult[];
}