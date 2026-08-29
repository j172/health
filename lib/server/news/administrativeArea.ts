import {
  TAIWAN_COUNTY_CENTROIDS,
  TAIWAN_DISTRICT_COORDINATES,
  type CountyGeo,
  type DistrictGeo,
} from "./data/taiwanDistricts";

/**
 * The administrative-area tiers of the landmark waterfall (`extractLocationFromText`
 * tiers 2 and 3), as a pure function of the article text.
 *
 * Split out of `geoExtractor.ts` for the same reason `locationPrecision.ts` was:
 * that module imports "server-only", mysql2 and the geocode providers, so the
 * decision rules below could not otherwise be unit-tested. Everything here is a
 * lookup against two static tables — no I/O, no DB, no network.
 */

/**
 * Normalizes 臺/台. Both spellings occur in source text, in the district table's
 * `fullName`s, and — as separate rows — in `TAIWAN_COUNTY_CENTROIDS`.
 */
export function normalizeTai(text: string): string {
  return text.replace(/臺/g, "台");
}

export interface AreaMatch {
  lat: number;
  lng: number;
  locationName: string;
  matchType: "district" | "county";
}

/**
 * - `match` — the text names exactly one place at some tier; use it.
 * - `none` — the text names no county or district at all; the caller may keep
 *   walking its waterfall (the external geocoder), exactly as before.
 * - `ambiguous` — the text names several counties, so there is no single landmark
 *   to badge. The caller must produce no location rather than pick one.
 *
 * `none` and `ambiguous` are deliberately distinct. Collapsing them would let a
 * multi-county bulletin reach the geocoder, which resolves the FIRST address-like
 * fragment it finds — the same arbitrary-first-hit defect this module exists to
 * remove, just one tier further down. Under the old code a multi-county article
 * always stopped at the county tier, so the geocoder never saw one; that stays true.
 */
export type AreaOutcome =
  | { kind: "match"; match: AreaMatch }
  | { kind: "none" }
  | { kind: "ambiguous" };

const NONE: AreaOutcome = { kind: "none" };
const AMBIGUOUS: AreaOutcome = { kind: "ambiguous" };

/**
 * First centroid row for a county name, ignoring the 臺/台 spelling.
 *
 * `TAIWAN_COUNTY_CENTROIDS` stores 台北市 and 臺北市 (and 台中/臺中, 台南/臺南,
 * 台東/臺東) as separate rows with identical coordinates. They are one county and
 * must be counted once, or every Taipei article would look "ambiguous" and lose
 * its badge. Returning the first row keeps the `location_name` string identical to
 * what the previous first-hit loop wrote, so `classifyLocationPrecision` and any
 * stored row still agree.
 */
function findCountyCentroid(countyName: string): CountyGeo | null {
  const wanted = normalizeTai(countyName);
  return (
    TAIWAN_COUNTY_CENTROIDS.find(
      (county) => normalizeTai(county.name) === wanted,
    ) ?? null
  );
}

function districtMatch(district: DistrictGeo): AreaOutcome {
  return {
    kind: "match",
    match: {
      lat: district.lat,
      lng: district.lng,
      locationName: district.fullName,
      matchType: "district",
    },
  };
}

function countyMatch(county: CountyGeo): AreaOutcome {
  return {
    kind: "match",
    match: {
      lat: county.lat,
      lng: county.lng,
      locationName: county.name,
      matchType: "county",
    },
  };
}

/**
 * Districts whose full name (e.g. 台北市大安區) appears verbatim in the text.
 */
function matchDistrictsByFullName(normalized: string): DistrictGeo[] {
  return TAIWAN_DISTRICT_COORDINATES.filter((district) =>
    normalized.includes(normalizeTai(district.fullName)),
  );
}

/**
 * Districts inferred from a county name and a bare district name appearing
 * anywhere in the same text — 「台北市…（500 chars）…中正區」 counts.
 */
function matchDistrictsByContext(normalized: string): DistrictGeo[] {
  return TAIWAN_DISTRICT_COORDINATES.filter(
    (district) =>
      normalized.includes(normalizeTai(district.county)) &&
      normalized.includes(normalizeTai(district.district)),
  );
}

/**
 * Distinct counties among a set of districts, ignoring 臺/台.
 */
function distinctCounties(districts: DistrictGeo[]): string[] {
  return [...new Set(districts.map((d) => normalizeTai(d.county)))];
}

/**
 * Distinct counties named in the text, ignoring 臺/台 and the duplicate rows.
 */
function matchCounties(normalized: string): CountyGeo[] {
  const seen = new Set<string>();
  const result: CountyGeo[] = [];
  for (const county of TAIWAN_COUNTY_CENTROIDS) {
    const key = normalizeTai(county.name);
    if (seen.has(key)) continue;
    if (!normalized.includes(key)) continue;
    seen.add(key);
    result.push(county);
  }
  return result;
}

/**
 * Resolves article text to a single administrative area, or declines.
 *
 * The rule is not a tunable saturation threshold: a tier is used only when it
 * identifies ONE place.
 *
 * | distinct matches                          | result                     |
 * | ----------------------------------------- | -------------------------- |
 * | exactly 1 district                        | that district              |
 * | several districts, all in one county      | that county                |
 * | several districts across several counties | fall through to counties   |
 * | exactly 1 county                          | that county                |
 * | several counties                          | `ambiguous` — no landmark  |
 *
 * The predecessor returned the FIRST table row that matched, so an article
 * containing every township name in Taiwan (see fetchDetailPage.ts on the CWA
 * SVG map) was always badged `TAIWAN_DISTRICT_COORDINATES[0]` = 台北市中正區.
 * The failure was deterministic, not a tie-break gone wrong, which is why
 * longest-match / adjacency heuristics do not help.
 */
export function resolveAdministrativeArea(text: string): AreaOutcome {
  const normalized = normalizeTai(text);

  // The two district branches are evaluated in sequence rather than unioned.
  // A verbatim 台北市大安區 is an assertion; "台北市 appears, and so does 中正區"
  // is an inference, and a much looser one — 中正區 alone exists in four counties
  // and the bare district name may belong to a completely different sentence.
  // Feeding both into one distinct-set lets the loose branch manufacture extra
  // districts and demote a clean single verbatim hit to its county (or, across
  // counties, to nothing). So: contextual matches are consulted only when NO
  // full name matched, and are then held to exactly the same one-place test.
  const byFullName = matchDistrictsByFullName(normalized);
  const districts =
    byFullName.length > 0 ? byFullName : matchDistrictsByContext(normalized);

  if (districts.length === 1) {
    return districtMatch(districts[0]);
  }

  if (districts.length > 1) {
    const counties = distinctCounties(districts);
    if (counties.length === 1) {
      const centroid = findCountyCentroid(counties[0]);
      // Every county in TAIWAN_DISTRICT_COORDINATES has a centroid row; the
      // guard is for a future table edit, not a reachable state today.
      if (centroid) return countyMatch(centroid);
    }
    // Several districts across several counties: fall through to the county tier,
    // which will find those same several counties and decline.
  }

  const counties = matchCounties(normalized);
  if (counties.length === 1) return countyMatch(counties[0]);
  if (counties.length > 1) return AMBIGUOUS;
  return NONE;
}
