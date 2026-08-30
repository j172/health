import "server-only";
import type { PoolConnection } from "mysql2/promise";
import { withConnection, withConnectionFallback } from "@/lib/server/db/mysql";
import type { RowDataPacket } from "mysql2/promise";
import { resolveAdministrativeArea } from "./administrativeArea";
import {
  queryOpenCage,
  queryNominatim,
} from "@/lib/server/facilities/geocodeProviders";
import {
  loadGeocodeBudgetState,
  isBudgetExhausted,
  recordGeocodeRequest,
  tripCircuitBreaker,
  type GeocodeProvider,
} from "@/lib/server/facilities/geocodeBudget";
import { normalizeAddressForQuery } from "@/lib/server/facilities/addressNormalize";
import {
  COMMON_HOSPITAL_PATTERNS,
  selectFacilityMatch,
  selectUniqueInstitution,
} from "./facilityMatch";

// The classifier lives in its own module so it can be unit-tested without
// dragging in "server-only", mysql2 and the geocode providers that the rest of
// this file needs. It is re-exported here because callers reason about it as
// "the inverse of the extraction waterfall below", and that is the file they
// look in.
export {
  classifyLocationPrecision,
  type LocationPrecision,
} from "./locationPrecision";

export interface ExtractedLocation {
  lat: number;
  lng: number;
  locationName: string;
  facilityId: number | null;
  matchType: "facility" | "district" | "county" | "geocoded";
}

/**
 * Upper bound on candidate rows pulled back for ranking. The widest searchName
 * in the table (`臺北市立聯合醫院`) matches 13 clinic rows, so this is roomy;
 * it exists only so a future over-broad searchName can't drag the whole table
 * into memory. Hitting it would mean the searchName names a family rather than
 * an institution, which selectFacilityMatch declines anyway.
 */
const FACILITY_CANDIDATE_LIMIT = 50;

/**
 * Searches the facilities table for the one hospital a searchName identifies.
 *
 * Restricted to `facility_type = 'clinic'` — the hospital/clinic registry. The
 * other five types that contain hospital names (ltc_contracted, home_healthcare,
 * long_term_care, health_check, disability_welfare) are contract and service
 * listings that happen to carry a hospital's name; they are not the hospital an
 * article is about, and before #84 they outnumbered the real rows ten to one.
 *
 * Ranking is deliberately NOT done in SQL: `ORDER BY … LIMIT 1` can only ever
 * produce a winner, and the thing this lookup most needs to be able to do is
 * decline. See selectFacilityMatch.
 */
async function findFacilityInDb(
  searchName: string,
  existingConn?: PoolConnection,
): Promise<{
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
} | null> {
  // When the caller already holds a connection (e.g. persistItems, mid-transaction)
  // we must reuse it. Acquiring a second connection from an 8-slot pool while the
  // first is still checked out inside an open transaction deadlocks under load.
  const run = async (conn: PoolConnection) => {
    const pattern = `%${searchName}%`;
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT id, name, lat, lng, address
      FROM facilities
      WHERE facility_type = 'clinic'
        AND name LIKE ?
        AND lat IS NOT NULL AND lng IS NOT NULL
      ORDER BY id ASC
      LIMIT ${FACILITY_CANDIDATE_LIMIT}
      `,
      [pattern],
    );

    const candidates = rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      lat: row.lat != null ? Number(row.lat) : null,
      lng: row.lng != null ? Number(row.lng) : null,
      address: row.address ? String(row.address) : null,
    }));

    return selectFacilityMatch(candidates, searchName);
  };

  if (existingConn) return run(existingConn);
  return withConnectionFallback(null, run);
}

type FacilityRow = NonNullable<Awaited<ReturnType<typeof findFacilityInDb>>>;

/**
 * Tier 1: the one hospital this text names, or null when it names none or
 * several.
 *
 * Every alias whose regex matches is resolved, not just the first (issue #87).
 * The loop this replaced returned on the first hit, so an article naming three
 * hospitals was landmarked by whichever of them sat highest in a hand-written
 * table. Collecting them all lets selectUniqueInstitution apply the same
 * uniqueness rule #65 gave the district tier: identify one place or decline.
 *
 * Cost: one query per DISTINCT matching alias instead of one query total. In
 * the 89-article live sample 57 articles match exactly one alias and pay
 * nothing extra; the 10 that match several pay at most two more queries, and
 * they are the articles this whole function exists to stop guessing about.
 */
async function resolveFacilityMatch(
  combinedText: string,
  existingConn?: PoolConnection,
): Promise<FacilityRow | null> {
  const searchNames = new Set<string>();
  for (const { regex, searchName } of COMMON_HOSPITAL_PATTERNS) {
    if (regex.test(combinedText)) searchNames.add(searchName);
  }
  if (searchNames.size === 0) return null;

  const resolved: FacilityRow[] = [];
  for (const searchName of searchNames) {
    const facility = await findFacilityInDb(searchName, existingConn);
    // A row without coordinates cannot be a landmark, so it is not evidence of
    // a second institution either — same as the old loop, which walked past it.
    if (facility && facility.lat && facility.lng) resolved.push(facility);
  }

  return selectUniqueInstitution(resolved);
}

/**
 * Extracts coordinates and location metadata from news title and body text.
 */
export async function extractLocationFromText(
  title: string,
  content?: string | null,
  allowExternalGeocode = false,
  existingConn?: PoolConnection,
): Promise<ExtractedLocation | null> {
  const combinedText = `${title} ${content || ""}`.trim();
  if (!combinedText) return null;

  // 1. Facility Database Match (Zero API Cost)
  //
  // Declines rather than picking a favourite when the text names several
  // different hospitals; the waterfall then falls through to the district and
  // county tiers below, which is the right altitude for a story about three
  // hospitals in three cities. See resolveFacilityMatch.
  const facility = await resolveFacilityMatch(combinedText, existingConn);
  if (facility && facility.lat && facility.lng) {
    return {
      lat: facility.lat,
      lng: facility.lng,
      locationName: facility.name,
      facilityId: facility.id,
      matchType: "facility",
    };
  }

  // 2 + 3. Administrative Area Match (district, else county)
  //
  // The rules live in ./administrativeArea.ts so they can be unit-tested without
  // this module's "server-only"/mysql2/geocode-provider graph. Both tiers now
  // require an UNAMBIGUOUS match: the old code returned the first table row that
  // matched, so an article carrying the CWA's inline SVG map of Taiwan (every
  // township name present, see fetchDetailPage.ts) was always badged
  // TAIWAN_DISTRICT_COORDINATES[0] = 台北市中正區 — 5 of 7 district badges in a
  // 51-badge live sample. See docs/specs/news-landmark-saturation-guard.md.
  const area = resolveAdministrativeArea(combinedText);
  if (area.kind === "match") {
    return {
      lat: area.match.lat,
      lng: area.match.lng,
      locationName: area.match.locationName,
      facilityId: null,
      matchType: area.match.matchType,
    };
  }
  // Several counties named and no single district: a 豪雨特報 covering 臺南市,
  // 屏東縣 and 嘉義縣 has no one landmark. Stop here rather than let tier 4
  // resolve whichever street address happens to appear first — that would just
  // move the arbitrary-first-hit defect down a tier. Under the old code such an
  // article always stopped at the county tier too, so tier 4 loses no input it
  // used to receive.
  if (area.kind === "ambiguous") return null;

  // 4. External Geocoding API Fallback (Controlled rate & daily budget)
  if (allowExternalGeocode) {
    // Look for address-like fragments: [縣市][區鄉鎮市][路街道巷弄號]
    const addressMatch = combinedText.match(
      /([台臺][北中南東]|新北|桃園|新竹|苗栗|彰化|南投|雲林|嘉義|屏東|宜蘭|花蓮|臺東|台東|澎湖|金門|連江)[縣市][^，,。\n\r ]{2,20}(?:路|街|大道|巷|弄|號)/,
    );
    if (addressMatch) {
      const rawAddress = addressMatch[0];
      const normalizedQuery = normalizeAddressForQuery(rawAddress);

      if (normalizedQuery) {
        return withConnection(async (conn) => {
          const budgetState = await loadGeocodeBudgetState(conn);

          // Try OpenCage first if budget allows
          if (!isBudgetExhausted(budgetState, "opencage")) {
            await recordGeocodeRequest(conn, budgetState, "opencage");
            const outcome = await queryOpenCage(normalizedQuery);
            if (outcome.kind === "quota_exceeded") {
              await tripCircuitBreaker(conn, budgetState, "opencage");
            } else if (outcome.kind === "ok") {
              return {
                lat: outcome.coords.lat,
                lng: outcome.coords.lng,
                locationName: rawAddress,
                facilityId: null,
                matchType: "geocoded",
              };
            }
          }

          // Fallback to Nominatim
          if (!isBudgetExhausted(budgetState, "nominatim")) {
            await recordGeocodeRequest(conn, budgetState, "nominatim");
            const outcome = await queryNominatim(normalizedQuery);
            if (outcome.kind === "quota_exceeded") {
              await tripCircuitBreaker(conn, budgetState, "nominatim");
            } else if (outcome.kind === "ok") {
              return {
                lat: outcome.coords.lat,
                lng: outcome.coords.lng,
                locationName: rawAddress,
                facilityId: null,
                matchType: "geocoded",
              };
            }
          }

          return null;
        });
      }
    }
  }

  return null;
}

/**
 * Enriches a specific news item with geographic coordinates and location metadata.
 */
export async function enrichNewsItemLocation(
  newsItemId: number,
  title: string,
  content?: string | null,
  allowExternalGeocode = false,
): Promise<ExtractedLocation | null> {
  const location = await extractLocationFromText(
    title,
    content,
    allowExternalGeocode,
  );

  await withConnection(async (conn) => {
    if (location) {
      await conn.query(
        `
        UPDATE news_items
        SET lat = ?, lng = ?, location_name = ?, facility_id = ?
        WHERE id = ?
        `,
        [
          location.lat,
          location.lng,
          location.locationName,
          location.facilityId,
          newsItemId,
        ],
      );
    } else {
      await conn.query(
        `
        UPDATE news_items
        SET geocode_attempts = geocode_attempts + 1
        WHERE id = ?
        `,
        [newsItemId],
      );
    }
  });

  return location;
}
