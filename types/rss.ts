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
  | "udn_health"
  | "moenv_mnews"
  | "yahoo_health"
  | "setn_health"
  | "ettoday_health"
  | "healthnews_tw"
  | "fiftyplus_health"
  | "businessweekly_health"
  | "edh_health"
  | "gnews_topic"
  | "worldpeace"
  | "greenpeace"
  | "ibt"
  | "love_newlife"
  | "nhi_web"
  | "blog_j172"
  | "cdc_outbreak"
  | "cdc_letters"
  | "womenshealth_tw"
  | "ntuh_news"
  | "ntuh_ifc_news"
  | "durex_article"
  | "helloyishi_news"
  | "mababy_news"
  | "wegetcare_blog"
  | "uniqman_blog"
  | "sfunhk_blog"
  | "letsharu_article"
  | "femh_research"
  | "ankemedia_rss"
  | "commonhealth_club"
  | "gvm_health_rss"
  | "istyle_lovesex"
  | "tvbs_health"
  | "uho_health";

export interface FeedConfig {
  code: FeedCode;
  name: string;
  url: string;
  sourceName: string;
  /** Skip fetching/parsing the linked article page (e.g. aggregator links that redirect through an interstitial page instead of the real article). */
  skipDetailFetch?: boolean;
  /**
   * Treat an outright refusal (401/403) as "nothing new today" rather than a
   * failed feed.
   *
   * For a publisher that blocks this host's entire IP range there is nothing to
   * fix and nothing to alert on — counting it in failed_feeds every 30 minutes
   * only teaches the reader to ignore that number. Anything already ingested
   * stays, and the feed resumes on its own if the block is ever lifted.
   */
  tolerateForbidden?: boolean;
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
  /**
   * Items that missed the external_id lookup but still did not create a row —
   * they collided on the canonical_url unique key instead. Non-zero means a feed
   * is reissuing unstable external_ids, which is what made `inserted` read as
   * ~1374 per run while almost no new articles appeared.
   */
  externalIdDrift: number;
  failedFeeds: number;
  feedResults: FeedFetchResult[];
}
