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

export type GeocodeProvider = "opencage" | "nominatim";

// Deliberately below each provider's actual documented cap (OpenCage's own
// free-tier quota is 2,500/day; Nominatim's public-instance usage policy is
// ~1 req/sec with no hard daily count) — the agreed policy caps requests
// well under those limits so a single day's batch run never risks tipping a
// shared-instance provider into blocking this app's IP/key outright.
export const DAILY_BUDGET: Record<GeocodeProvider, number> = {
  opencage: 1400,
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
