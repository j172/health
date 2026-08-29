import {
  classifyLocationPrecision,
  type LocationPrecision,
} from "./locationPrecision";

/**
 * The decision half of the landmark backfill (`./landmarkBackfill.ts`): given what
 * a `news_items` row currently stores and what `extractLocationFromText` produces
 * for that same row *today*, decide whether the row must be rewritten, cleared, or
 * left alone — and name the transition for the operator's dry-run report.
 *
 * Split out of `landmarkBackfill.ts` for the same reason `administrativeArea.ts`
 * and `locationPrecision.ts` were split out of `geoExtractor.ts`: that module
 * imports "server-only", mysql2 and the geocode providers, so the rules below
 * could not otherwise be unit-tested. Everything here is pure — no I/O, no DB,
 * no network, and (see `./landmarkBackfill.ts`) nothing reachable from here can
 * touch an external geocoder.
 */

/** The four landmark columns as they currently sit in a `news_items` row. */
export interface StoredLandmark {
  lat: number | null;
  lng: number | null;
  locationName: string | null;
  facilityId: number | null;
}

/**
 * A fresh `extractLocationFromText` result. Structurally the same shape as
 * `ExtractedLocation` in `./geoExtractor.ts`, restated here so this module stays
 * free of that file's "server-only" import graph.
 */
export interface ExtractedLandmark {
  lat: number;
  lng: number;
  locationName: string;
  facilityId: number | null;
  matchType: LocationPrecision;
}

/**
 * - `unchanged` — today's rules reproduce exactly what is stored. Write nothing.
 * - `changed`   — today's rules produce a different landmark. Rewrite all four columns.
 * - `cleared`   — today's rules produce no landmark at all. NULL all four columns.
 *
 * `cleared` is deliberately its own outcome rather than a flavour of `changed`:
 * it is the one that makes a badge and a map card disappear from a live page, so
 * an operator reading a dry run must be able to see its size on its own.
 */
export type TransitionOutcome = "unchanged" | "changed" | "cleared";

export interface LandmarkTransition {
  outcome: TransitionOutcome;
  /** Which waterfall tier produced the STORED value, per `classifyLocationPrecision`. */
  from: LocationPrecision | null;
  /** Which tier produces the value today; `null` when today's rules decline. */
  to: LocationPrecision | null;
  /** `"county->null"`, `"district->county"`, … — the dry-run report's grouping key. */
  transition: string;
  /** What to write. `null` means "NULL all four columns". Ignored when `unchanged`. */
  next: ExtractedLandmark | null;
}

/**
 * `lat`/`lng` are `DECIMAL(10,7)`, so a stored value can never carry more than
 * seven decimals while the static centroid tables sometimes do. Comparing with
 * `===` would therefore mark every row "changed" purely because of rounding, and
 * a backfill that rewrites every row it touches tells the operator nothing.
 * Half a unit in the last stored place is the exact tolerance that rounding needs.
 */
const COORDINATE_EPSILON = 5e-8;

function sameCoordinate(a: number | null, b: number): boolean {
  return a != null && Number.isFinite(a) && Math.abs(a - b) < COORDINATE_EPSILON;
}

/**
 * True when today's extraction reproduces the stored row exactly.
 *
 * All four columns participate. `location_name` alone is not enough: the 122 → 368
 * district-table expansion (#78) moved some centroids, and `facility_id` alone is
 * not enough either, because tier 1 can now match a facility whose name happens to
 * equal a previously stored string.
 */
function isUnchanged(
  stored: StoredLandmark,
  extracted: ExtractedLandmark,
): boolean {
  return (
    stored.locationName === extracted.locationName &&
    (stored.facilityId ?? null) === (extracted.facilityId ?? null) &&
    sameCoordinate(stored.lat, extracted.lat) &&
    sameCoordinate(stored.lng, extracted.lng)
  );
}

/** `null` is spelled out so the report reads `county->null`, not `county->`. */
function tierLabel(precision: LocationPrecision | null): string {
  return precision ?? "null";
}

/**
 * Classifies one row's before/after landmark.
 *
 * Pass `extracted = null` for "today's rules produce nothing", which is the whole
 * point of the backfill: a text saturated with district names (the CWA inline SVG
 * map, see `fetchDetailPage.ts`) used to yield an arbitrary first-array-hit and
 * now yields nothing at all.
 */
export function planLandmarkTransition(
  stored: StoredLandmark,
  extracted: ExtractedLandmark | null,
): LandmarkTransition {
  const from = classifyLocationPrecision(
    stored.locationName,
    stored.facilityId,
  );
  const to = extracted ? extracted.matchType : null;
  const transition = `${tierLabel(from)}->${tierLabel(to)}`;

  if (!extracted) {
    // A row that already stores nothing is not "cleared" — there is nothing to
    // clear, and counting it would inflate the one number an operator uses to
    // judge how many badges a live run would remove.
    const alreadyEmpty =
      stored.lat == null &&
      stored.lng == null &&
      stored.locationName == null &&
      stored.facilityId == null;
    return {
      outcome: alreadyEmpty ? "unchanged" : "cleared",
      from,
      to,
      transition,
      next: null,
    };
  }

  if (isUnchanged(stored, extracted)) {
    return { outcome: "unchanged", from, to, transition, next: null };
  }

  return { outcome: "changed", from, to, transition, next: extracted };
}

/** True for a transition the operator must read as "tier 1 grew", not "rules changed". */
export function isNewFacilityMatch(transition: LandmarkTransition): boolean {
  return transition.outcome === "changed" && transition.to === "facility";
}
