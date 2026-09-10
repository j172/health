import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { utcNowSql } from "@/lib/server/db/mysql";

/**
 * DB-backed, account-level daily budget + circuit breaker for the facility
 * geocode batch job (see docs/specs/phase9-opencage-geocode-batch.md). Both
 * OpenCage's and Nominatim's rate limits are per API-key/IP, not per facility
 * source — all 16 facility sources (lib/server/facilities/geocodeBatch.ts's
 * SOURCES_IN_PRIORITY) draw from one shared counter per provider per day,
 * mirroring lib/server/news/providerCooldown.ts's DB-backed-because-the-
 * process-restarts-on-deploy rationale.
 */

// "opencage2" is a second, independent OpenCage account/key (see
// geocodeProviders.ts's queryOpenCage2) tracked as its own provider — same
// shape as "opencage", own row in geocode_provider_budget, own circuit
// breaker — so key1 tripping (402/429) doesn't take key2 down with it.
// Added 2026-09-09 to raise the facility batch job's + news geo-extractor's
// combined daily OpenCage capacity; OPENCAGE_API_KEY2 unset just means this
// provider is always exhausted (see isBudgetExhausted below — no row ever
// gets written for it).
export type GeocodeProvider = "tgos" | "opencage" | "opencage2" | "nominatim";

// Deliberately below each provider's actual documented cap (TGOS standard cap
// is 10,000/day; OpenCage's free-tier quota is 2,500/day; Nominatim's
// public-instance usage policy is ~1 req/sec with no hard daily count) — the
// agreed policy caps requests well under those limits so a single day's batch
// run never risks tipping a shared-instance provider into blocking this app's
// IP/key outright.
export const DAILY_BUDGET: Record<GeocodeProvider, number> = {
  tgos: 5000,
  opencage: 1400,
  opencage2: 1400,
  nominatim: 1000,
};

interface BudgetRow extends RowDataPacket {
  provider: string;
  requests_used: number;
  circuit_broken: number;
}

export interface GeocodeBudgetState {
  requestsUsed: number;
  circuitBroken: boolean;
}

const todaySqlDate = (): string => new Date().toISOString().slice(0, 10);

/** Loads today's (UTC) budget state for both providers as an in-memory snapshot for one batch run. Providers with no row yet today are treated as fresh (0 used, not broken). */
export const loadGeocodeBudgetState = async (conn: PoolConnection): Promise<Map<GeocodeProvider, GeocodeBudgetState>> => {
  const [rows] = await conn.query<BudgetRow[]>("SELECT provider, requests_used, circuit_broken FROM geocode_provider_budget WHERE budget_date = ?", [
    todaySqlDate(),
  ]);
  const state = new Map<GeocodeProvider, GeocodeBudgetState>();
  for (const row of rows) {
    state.set(row.provider as GeocodeProvider, {
      requestsUsed: Number(row.requests_used),
      circuitBroken: Boolean(row.circuit_broken),
    });
  }
  return state;
};

/** Whether `provider` has no budget left for today — exhausted its request count or already tripped its circuit breaker (402/429). Callers must skip the provider entirely (no request attempted) once this is true. */
export const isBudgetExhausted = (state: Map<GeocodeProvider, GeocodeBudgetState>, provider: GeocodeProvider): boolean => {
  const row = state.get(provider);
  if (!row) return false;
  return row.circuitBroken || row.requestsUsed >= DAILY_BUDGET[provider];
};

/** Whether TGOS credentials (TGOS_APP_ID/TGOS_APPID and TGOS_API_KEY) are configured. */
export const isTgosConfigured = (): boolean => Boolean((process.env.TGOS_APP_ID || process.env.TGOS_APPID) && process.env.TGOS_API_KEY);

/** Whether OPENCAGE_API_KEY2 is set. Unconfigured means "opencage2" never gets a budget row written for it, so isBudgetExhausted alone would read it as perpetually "not exhausted" (no row = false) rather than "doesn't exist" — callers must gate every opencage2 attempt/check on this too. */
export const isOpenCage2Configured = (): boolean => Boolean(process.env.OPENCAGE_API_KEY2);

/** Whether OpenCage capacity — key1 and, if configured, key2 — is entirely spent for today. The single source of truth for "is there any more OpenCage budget at all", used both to gate individual attempts and to decide when the caller should give up on OpenCage and fall to Nominatim. */
export const isOpenCageCapacityExhausted = (state: Map<GeocodeProvider, GeocodeBudgetState>): boolean =>
  isBudgetExhausted(state, "opencage") && (!isOpenCage2Configured() || isBudgetExhausted(state, "opencage2"));

/** Whether all external geocoding providers (TGOS, OpenCage, Nominatim) are exhausted for today. */
export const isAllProvidersCapacityExhausted = (state: Map<GeocodeProvider, GeocodeBudgetState>): boolean =>
  (!isTgosConfigured() || isBudgetExhausted(state, "tgos")) &&
  isOpenCageCapacityExhausted(state) &&
  isBudgetExhausted(state, "nominatim");

/** Records one request against `provider`'s today counter (call once per actual network request, success or failure alike — only the circuit breaker below distinguishes a quota/rate error). */
export const recordGeocodeRequest = async (conn: PoolConnection, state: Map<GeocodeProvider, GeocodeBudgetState>, provider: GeocodeProvider): Promise<void> => {
  const prior = state.get(provider) ?? { requestsUsed: 0, circuitBroken: false };
  const next = { requestsUsed: prior.requestsUsed + 1, circuitBroken: prior.circuitBroken };
  state.set(provider, next);
  await upsertBudgetRow(conn, provider, next);
};

/** Trips the circuit breaker for `provider` for the rest of today (402 quota-exceeded or 429 rate-limited) — no further requests to this provider should be attempted until budget_date rolls over. */
export const tripCircuitBreaker = async (conn: PoolConnection, state: Map<GeocodeProvider, GeocodeBudgetState>, provider: GeocodeProvider): Promise<void> => {
  const prior = state.get(provider) ?? { requestsUsed: 0, circuitBroken: false };
  const next = { requestsUsed: prior.requestsUsed, circuitBroken: true };
  state.set(provider, next);
  await upsertBudgetRow(conn, provider, next);
};

const upsertBudgetRow = async (conn: PoolConnection, provider: GeocodeProvider, next: GeocodeBudgetState): Promise<void> => {
  await conn.execute<ResultSetHeader>(
    `
    INSERT INTO geocode_provider_budget (provider, budget_date, requests_used, circuit_broken, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      requests_used = VALUES(requests_used),
      circuit_broken = VALUES(circuit_broken),
      updated_at = VALUES(updated_at)
    `,
    [provider, todaySqlDate(), next.requestsUsed, next.circuitBroken ? 1 : 0, utcNowSql()],
  );
};
