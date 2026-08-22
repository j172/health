import "server-only";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getMysqlPool, ensureSchema, utcNowSql } from "@/lib/server/db/mysql";
import { MAX_GEOCODE_ATTEMPTS } from "@/lib/server/facilities/queries";
import { buildQueryCandidates } from "@/lib/server/facilities/addressNormalize";
import { resolveRoadLevelFallback } from "@/lib/server/facilities/autoGeocode";
import { queryOpenCage, queryNominatim, type LatLng } from "@/lib/server/facilities/geocodeProviders";
import { loadGeocodeBudgetState, isBudgetExhausted, recordGeocodeRequest, tripCircuitBreaker, type GeocodeBudgetState, type GeocodeProvider } from "@/lib/server/facilities/geocodeBudget";

/**
 * Unified, budget-aware geocode batch runner for all 16 facility sources
 * (see docs/specs/phase9-opencage-geocode-batch.md — originally scoped to
 * green shops only, widened to cover every source with one shared daily
 * budget since OpenCage/Nominatim's rate limits are account-level, not
 * per-source). Replaces ad-hoc per-source calls to
 * /api/admin/facilities-geocode as the production path; that endpoint is
 * left in place for manual single-source use.
 */

const LOCK_NAME = "geocode_batch_lock";
const RESET_FLAG_KEY = "geocode_attempts_reset_v1";
// One HTTP invocation (Next.js route, maxDuration=60s) budgets at most this
// many address groups. Each one can now cost up to 3 progressively-stripped
// candidates (buildQueryCandidates) times a throttled OpenCage attempt
// (~1s) plus a throttled Nominatim fallback (~1.1s) before either responds
// — worst case ~6.3s per group. 8 * ~6.3s ≈ 50s stays under the ceiling
// even if every single group needs the full cascade against both
// providers. Mirrors the lesson already learned the hard way by the
// single-source /api/admin/facilities-geocode route (see its own comment:
// cut from 20/30 to 10/10 on 2026-08-17 after batches blew past 60s) —
// this job's cascade is deeper (3 candidates vs. that route's None-until-now),
// so it needs an even smaller cap.
const MAX_FACILITIES_PER_INVOCATION = 8;
const PER_SOURCE_FETCH_LIMIT = 8;

export interface FacilitySourceSpec {
  facilityType: string;
  sourceKey: string;
  label: string;
}

// Mirrors scripts/geocode-all-facilities.mjs's SOURCES_IN_PRIORITY — kept as
// a second copy rather than a shared import because that script runs
// standalone via plain `node` (no path aliases/TS), while this one is
// consumed by the Next.js server bundle. Confirmed against production's
// actual (facility_type, source_key) pairs 2026-08-20.
export const SOURCES_IN_PRIORITY: FacilitySourceSpec[] = [
  { facilityType: "child_welfare_nursery", sourceKey: "mohw_child_welfare_nursery", label: "全國親子館" },
  { facilityType: "child_welfare_center", sourceKey: "mohw_child_welfare_center", label: "兒少福利中心" },
  { facilityType: "elder_welfare", sourceKey: "mohw_elder_welfare", label: "老人福利機構" },
  { facilityType: "disability_welfare", sourceKey: "mohw_disability_welfare", label: "身障福利機構" },
  { facilityType: "ltc_contracted", sourceKey: "mohw_ltc_contracted", label: "長照特約機構" },
  { facilityType: "long_term_care", sourceKey: "mohw_ltc_full", label: "長照機構" },
  { facilityType: "disability_atm", sourceKey: "nfcc_accessible_atm", label: "無障礙ATM" },
  { facilityType: "hakka_community", sourceKey: "hakka_dtst20230600002", label: "客庄社區發展協會" },
  { facilityType: "pharmacy", sourceKey: "nhi_pharmacy", label: "健保特約藥局" },
  { facilityType: "pharmacy", sourceKey: "tfda_pharmacy", label: "一般藥局" },
  { facilityType: "health_check", sourceKey: "mol_labor_checkup", label: "勞工健檢機構" },
  { facilityType: "health_check", sourceKey: "mol_occupational_injury", label: "職業傷病網絡醫院" },
  { facilityType: "health_check", sourceKey: "mohw_hpa_facility", label: "國健署促進機構" },
  { facilityType: "home_healthcare", sourceKey: "nhi_home_healthcare", label: "居家醫療機構" },
  { facilityType: "clinic", sourceKey: "nhi_hospital", label: "醫療院所與診所" },
  { facilityType: "green_shop", sourceKey: "moenv_green_shop", label: "綠色商店" },
];

export interface GeocodeBatchSourceSummary {
  sourceKey: string;
  facilityType: string;
  attempted: number;
  geocoded: number;
  failed: number;
}

export interface GeocodeBatchSummary {
  locked: boolean;
  resetPerformed: boolean;
  totalAttempted: number;
  totalGeocoded: number;
  totalFailed: number;
  budgetExhausted: { opencage: boolean; nominatim: boolean };
  bySource: GeocodeBatchSourceSummary[];
  reason: string | null;
}

interface FacilityRow extends RowDataPacket {
  id: number;
  address: string;
}

/** One-time, idempotent reset of geocode_attempts for every facility still missing coordinates — guarded by geocode_backfill_flags so it only ever fires once, not on every scheduled run (see the spec's "never reset on every scheduled run"). */
const performOneTimeResetIfNeeded = async (conn: PoolConnection): Promise<boolean> => {
  const [flagRows] = await conn.query<RowDataPacket[]>("SELECT flag_value FROM geocode_backfill_flags WHERE flag_key = ?", [RESET_FLAG_KEY]);
  if (flagRows[0]?.flag_value === 1) return false;

  await conn.execute("UPDATE facilities SET geocode_attempts = 0 WHERE lat IS NULL AND address IS NOT NULL AND address != ''");
  await conn.execute(
    `
    INSERT INTO geocode_backfill_flags (flag_key, flag_value, updated_at) VALUES (?, 1, ?)
    ON DUPLICATE KEY UPDATE flag_value = 1, updated_at = VALUES(updated_at)
    `,
    [RESET_FLAG_KEY, utcNowSql()],
  );
  return true;
};

const findMissingCoordsForSource = async (conn: PoolConnection, facilityType: string, sourceKey: string, limit: number): Promise<FacilityRow[]> => {
  const [rows] = await conn.query<FacilityRow[]>(
    `SELECT id, address FROM facilities
     WHERE facility_type = ? AND source_key = ? AND lat IS NULL AND address IS NOT NULL AND address != ''
       AND geocode_attempts < ?
     ORDER BY id ASC
     LIMIT ?`,
    [facilityType, sourceKey, MAX_GEOCODE_ATTEMPTS, limit],
  );
  return rows;
};

/**
 * Tries OpenCage then Nominatim across progressively-simplified address
 * candidates (see buildQueryCandidates — a full address with house number
 * routinely returns zero results even though the street itself geocodes
 * fine), respecting each provider's remaining daily budget and recording
 * usage/circuit-breaker state as it goes. Returns null once every candidate
 * has been tried against every provider with budget left, or budget runs
 * out entirely.
 */
const geocodeOneAddress = async (
  conn: PoolConnection,
  budgetState: Map<GeocodeProvider, GeocodeBudgetState>,
  candidates: string[],
): Promise<LatLng | null> => {
  for (const candidate of candidates) {
    if (isBudgetExhausted(budgetState, "opencage") && isBudgetExhausted(budgetState, "nominatim")) return null;

    if (!isBudgetExhausted(budgetState, "opencage")) {
      await recordGeocodeRequest(conn, budgetState, "opencage");
      const outcome = await queryOpenCage(candidate);
      if (outcome.kind === "ok") return outcome.coords;
      if (outcome.kind === "quota_exceeded") await tripCircuitBreaker(conn, budgetState, "opencage");
      // no_result / rejected / error fall through to Nominatim / the next candidate.
    }

    if (!isBudgetExhausted(budgetState, "nominatim")) {
      await recordGeocodeRequest(conn, budgetState, "nominatim");
      const outcome = await queryNominatim(candidate);
      if (outcome.kind === "ok") return outcome.coords;
      if (outcome.kind === "quota_exceeded") await tripCircuitBreaker(conn, budgetState, "nominatim");
    }
  }

  return null;
};

export const runGeocodeBatch = async (): Promise<GeocodeBatchSummary> => {
  await ensureSchema();
  const conn = await getMysqlPool().getConnection();
  let gotLock = false;

  const summary: GeocodeBatchSummary = {
    locked: false,
    resetPerformed: false,
    totalAttempted: 0,
    totalGeocoded: 0,
    totalFailed: 0,
    budgetExhausted: { opencage: false, nominatim: false },
    bySource: [],
    reason: null,
  };

  try {
    const [lockRows] = await conn.query<RowDataPacket[]>("SELECT GET_LOCK(?, 1) AS ok", [LOCK_NAME]);
    gotLock = lockRows[0]?.ok === 1;
    if (!gotLock) {
      summary.locked = true;
      summary.reason = "Another geocode batch is running.";
      return summary;
    }

    summary.resetPerformed = await performOneTimeResetIfNeeded(conn);

    const budgetState = await loadGeocodeBudgetState(conn);

    for (const source of SOURCES_IN_PRIORITY) {
      if (summary.totalAttempted >= MAX_FACILITIES_PER_INVOCATION) break;
      if (isBudgetExhausted(budgetState, "opencage") && isBudgetExhausted(budgetState, "nominatim")) break;

      const remaining = MAX_FACILITIES_PER_INVOCATION - summary.totalAttempted;
      const rows = await findMissingCoordsForSource(conn, source.facilityType, source.sourceKey, Math.min(PER_SOURCE_FETCH_LIMIT, remaining));
      if (rows.length === 0) continue;

      // Dedup exact normalized addresses within this fetched batch — one
      // successful lookup applies to every facility sharing that address
      // (see the spec's "Deduplicate exact normalized addresses"). Keyed by
      // the fully-normalized address (buildQueryCandidates' first/most
      // specific candidate) so two facilities at the same address are
      // grouped together regardless of which progressively-stripped
      // candidate eventually succeeds for them.
      const groupsByAddress = new Map<string, { ids: number[]; candidates: string[] }>();
      for (const row of rows) {
        const candidates = buildQueryCandidates(row.address);
        if (candidates.length === 0) continue;
        const dedupKey = candidates[0];
        const group = groupsByAddress.get(dedupKey) ?? { ids: [], candidates };
        group.ids.push(row.id);
        groupsByAddress.set(dedupKey, group);
      }

      const sourceSummary: GeocodeBatchSourceSummary = { sourceKey: source.sourceKey, facilityType: source.facilityType, attempted: 0, geocoded: 0, failed: 0 };
      summary.bySource.push(sourceSummary);

      for (const { ids, candidates } of groupsByAddress.values()) {
        if (isBudgetExhausted(budgetState, "opencage") && isBudgetExhausted(budgetState, "nominatim")) break;

        let coords = await geocodeOneAddress(conn, budgetState, candidates);
        if (!coords && candidates.length > 0) {
          coords = await resolveRoadLevelFallback(conn, candidates[0]);
        }

        if (coords) {
          await conn.query("UPDATE facilities SET lat = ?, lng = ?, updated_at = ? WHERE id IN (?)", [coords.lat, coords.lng, utcNowSql(), ids]);
          sourceSummary.geocoded += ids.length;
          summary.totalGeocoded += ids.length;
        } else {
          await conn.query("UPDATE facilities SET geocode_attempts = geocode_attempts + 1, updated_at = ? WHERE id IN (?)", [utcNowSql(), ids]);
          sourceSummary.failed += ids.length;
          summary.totalFailed += ids.length;
        }
        sourceSummary.attempted += ids.length;
        summary.totalAttempted += ids.length;
        if (summary.totalAttempted >= MAX_FACILITIES_PER_INVOCATION) break;
      }
    }

    summary.budgetExhausted = {
      opencage: isBudgetExhausted(budgetState, "opencage"),
      nominatim: isBudgetExhausted(budgetState, "nominatim"),
    };
    if (summary.budgetExhausted.opencage && summary.budgetExhausted.nominatim) {
      summary.reason = "Both providers' daily budget is exhausted for today.";
    } else if (summary.totalAttempted === 0) {
      summary.reason = "No facilities are missing coordinates.";
    }

    return summary;
  } finally {
    if (gotLock) {
      await conn.query("DO RELEASE_LOCK(?)", [LOCK_NAME]);
    }
    conn.release();
  }
};
