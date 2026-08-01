export type FeedCode =
  | "16"
  | "17"
  | "18"
  | "101"
  | "2622"
  | "gnews"
  | "ltn"
  | "nhi"
  | "cdc"
  | "tfda"
  | "hpa"
  | "hpa_announcement"
  | "hpa_activity"
  | "hpa_rumor"
  | "top1health"
  | "hpa_clarify"
  | "mamaclub"
  | "twstreetcorner"
  | "cna_lifehealth"
  | "cwa_warning"
  | "csr_cw"
  | "esg_gvm"
  | "esg_businesstoday"
  | "ubrand_udn"
  | "commonhealth"
  | "healthforall"
  | "ttvc"
  | "twhealth"
  | "heho"
  | "mirrormedia_healthnews"
  | "udn_health";

export interface FeedConfig {
  code: FeedCode;
  name: string;
  url: string;
  sourceName: string;
  /** Skip fetching/parsing the linked article page (e.g. aggregator links that redirect through an interstitial page instead of the real article). */
  skipDetailFetch?: boolean;
}

export interface NormalizedRssItem {
  sourceName: string;
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
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  geoSummary: string;
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