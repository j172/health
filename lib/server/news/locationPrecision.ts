import {
  TAIWAN_COUNTY_CENTROIDS,
  TAIWAN_DISTRICT_COORDINATES,
} from "./data/taiwanDistricts";

/**
 * How trustworthy a news item's stored coordinates are, derived from the values
 * `extractLocationFromText` already writes to `news_items`.
 *
 * - `facility` — a real building matched in the `facilities` table (metre-level).
 * - `district` — a 區/鄉/鎮/市 centroid (kilometre-level).
 * - `county` — a county/city hall centroid, which can sit ±30km from whatever the
 *   article is actually about.
 * - `geocoded` — a street address resolved by OpenCage/Nominatim (metre-level).
 */
export type LocationPrecision = "facility" | "district" | "county" | "geocoded";

// Built once at module load. Both tables are static data (see
// ./data/taiwanDistricts.ts) and this classifier runs once per rendered card, so
// a linear scan per call would be a pointless O(n) tax on every news list page.
const COUNTY_NAMES: ReadonlySet<string> = new Set(
  TAIWAN_COUNTY_CENTROIDS.map((county) => county.name),
);
const DISTRICT_FULL_NAMES: ReadonlySet<string> = new Set(
  TAIWAN_DISTRICT_COORDINATES.map((district) => district.fullName),
);

/**
 * Recovers which tier of `extractLocationFromText`'s waterfall produced a row's
 * location, using only columns that row already has.
 *
 * This is deliberately DERIVED rather than stored. The four tiers write mutually
 * exclusive values — tier 1 is the only one that sets `facility_id`, tier 2 writes
 * exactly a `TAIWAN_DISTRICT_COORDINATES.fullName`, tier 3 writes exactly a
 * `TAIWAN_COUNTY_CENTROIDS.name`, and tier 4's address regex forces a
 * 路|街|大道|巷|弄|號 suffix so it can never collide with either table. That makes
 * the classification exact for every historical row, with no new column, no
 * migration, and no backfill to run against the whole news table on a host that is
 * already short of process slots.
 *
 * Order matters: `facility_id` wins outright, then county before district. The two
 * tables cannot actually overlap — a district `fullName` is always county +
 * district (e.g. 新北市永和區) and so is never a bare three-character county name —
 * so the county-first order is for readability, not correctness.
 *
 * `geocoded` is the fallback bucket on purpose. An unrecognised `location_name` is
 * treated as high precision, which keeps today's rendering (badge + map +
 * coordinates) rather than silently downgrading rows we merely failed to
 * recognise. Guessing "precise" for a vague value is a no-op; guessing "vague" for
 * a precise one would be a visible regression.
 */
export function classifyLocationPrecision(
  locationName: string | null,
  facilityId: number | null,
): LocationPrecision | null {
  if (facilityId != null) return "facility";
  if (!locationName) return null;
  if (COUNTY_NAMES.has(locationName)) return "county";
  if (DISTRICT_FULL_NAMES.has(locationName)) return "district";
  return "geocoded";
}
