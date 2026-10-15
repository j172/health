/**
 * One merged row of the FDA 邊境查驗不合格食品 list (data.gov.tw 6133).
 *
 * Deliberately has NO importer-address and NO attached-image field (issue
 * #671 hard requirement: the page must not show either) — they are dropped
 * at the parser, never stored, so no later code path can leak them.
 */
export interface BorderFoodRejectionRecord {
  /** SHA-256 over the displayed fields (fixed order); the table's only identity key. */
  rowHash: string;
  originCountry: string;
  subject: string;
  reason: string;
  importerName: string | null;
  hsCode: string | null;
  inspectionMethod: string | null;
  detail: string | null;
  legalLimit: string | null;
  manufacturerName: string | null;
  brandName: string | null;
  weight: string | null;
  disposition: string | null;
  /** "YYYY-MM-DD", or null when the upstream value is missing/implausible. */
  publishedOn: string | null;
  inspectionAcceptedOn: string | null;
  /** How many upstream rows were identical in every displayed field and got merged into this one (>= 1). */
  duplicateCount: number;
}

export interface ParsedBorderRejections {
  records: BorderFoodRejectionRecord[];
  rawRowCount: number;
  /** Rows dropped for lacking 產地 / 主旨 / 原因. */
  skippedRowCount: number;
  /** rawRowCount - skippedRowCount - records.length */
  mergedDuplicateRows: number;
}

/** A row as served by GET /api/food-safety/border-rejections. */
export interface BorderFoodRejectionItem {
  id: number;
  publishedOn: string | null;
  inspectionAcceptedOn: string | null;
  originCountry: string;
  subject: string;
  reason: string;
  reasons: string[];
  importerName: string | null;
  hsCode: string | null;
  inspectionMethod: string | null;
  detail: string | null;
  legalLimit: string | null;
  manufacturerName: string | null;
  brandName: string | null;
  weight: string | null;
  disposition: string | null;
  duplicateCount: number;
}

export interface BorderFoodFacetCount {
  name: string;
  count: number;
}

export interface BorderFoodFacets {
  total: number;
  origins: BorderFoodFacetCount[];
  reasons: BorderFoodFacetCount[];
  earliestPublishedOn: string | null;
  latestPublishedOn: string | null;
  /** ISO timestamp of the last successful sync, or null when the table is empty. */
  lastSyncedAt: string | null;
}

export interface BorderFoodRejectionFilters {
  origin?: string;
  reason?: string;
  /** "YYYY-MM-DD", inclusive. */
  from?: string;
  /** "YYYY-MM-DD", inclusive. */
  to?: string;
  q?: string;
}

export interface BorderFoodRejectionsPage {
  items: BorderFoodRejectionItem[];
  /** Rows matching the current filters. */
  total: number;
  page: number;
  pageSize: number;
  facets: BorderFoodFacets;
}
