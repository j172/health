import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { ProviderName } from "@/lib/server/news/imageProviders";
import { utcNowSql } from "@/lib/server/db/mysql";

/**
 * DB-backed escalating backoff per image provider — see
 * docs/specs/news-card-image-multi-provider-fallback.md section 2. Kept
 * separate from lib/server/news/imageProviders.ts (which only knows how to
 * talk to each provider's API) and lib/server/news/cardImages.ts (which
 * orchestrates the per-article assignment loop); this module owns just the
 * cooldown-table read/write and the escalation-schedule math.
 *
 * DB-backed rather than in-memory because the in-app cron process restarts
 * on every deploy — in-memory state would silently reset a still-cooling-
 * down provider back to zero right when it gets hit again.
 */

interface CooldownRow extends RowDataPacket {
  provider: string;
  consecutive_rate_limits: number;
  cooldown_until: Date | null;
}

export interface ProviderCooldownState {
  consecutiveRateLimits: number;
  cooldownUntil: Date | null;
}

/** 3rd consecutive 429 → 10min, 4th → 30min, 5th+ → 60min (cap, never grows further). */
const ESCALATION_MINUTES_BY_STAGE = [10, 30, 60];
const ESCALATION_STARTS_AT = 3;

const toSqlDatetime = (date: Date): string => date.toISOString().slice(0, 19).replace("T", " ");

/** Loads current cooldown state for every provider that has ever been used, as an in-memory snapshot for the duration of one assignMissingNewsCardImages() call. */
export const loadProviderCooldownState = async (conn: PoolConnection): Promise<Map<ProviderName, ProviderCooldownState>> => {
  const [rows] = await conn.query<CooldownRow[]>("SELECT provider, consecutive_rate_limits, cooldown_until FROM image_provider_cooldown");
  const state = new Map<ProviderName, ProviderCooldownState>();
  for (const row of rows) {
    state.set(row.provider as ProviderName, {
      consecutiveRateLimits: Number(row.consecutive_rate_limits),
      cooldownUntil: row.cooldown_until,
    });
  }
  return state;
};

/** Whether `provider` is currently in cooldown (should be skipped entirely, no request attempted) as of `now`. */
export const isProviderCoolingDown = (state: Map<ProviderName, ProviderCooldownState>, provider: ProviderName, now: Date): boolean => {
  const row = state.get(provider);
  return Boolean(row?.cooldownUntil && row.cooldownUntil.getTime() > now.getTime());
};

/**
 * Records a 429 for `provider`: increments its consecutive-rate-limit count
 * and, once that count reaches the 3rd hit, sets/escalates cooldown_until
 * per the schedule above. A 429 that arrives after an earlier cooldown has
 * already expired continues escalating from where it left off — only a
 * success (see recordProviderSuccess) resets the counter — which is what
 * makes this "escalating" rather than a flat retry-every-10-minutes loop.
 */
export const recordProviderRateLimit = async (
  conn: PoolConnection,
  state: Map<ProviderName, ProviderCooldownState>,
  provider: ProviderName,
): Promise<void> => {
  const prior = state.get(provider) ?? { consecutiveRateLimits: 0, cooldownUntil: null };
  const consecutiveRateLimits = prior.consecutiveRateLimits + 1;

  let cooldownUntil: Date | null = prior.cooldownUntil;
  if (consecutiveRateLimits >= ESCALATION_STARTS_AT) {
    const stageIndex = Math.min(consecutiveRateLimits - ESCALATION_STARTS_AT, ESCALATION_MINUTES_BY_STAGE.length - 1);
    const minutes = ESCALATION_MINUTES_BY_STAGE[stageIndex];
    cooldownUntil = new Date(Date.now() + minutes * 60_000);
  }

  state.set(provider, { consecutiveRateLimits, cooldownUntil });
  await conn.execute<ResultSetHeader>(
    `
    INSERT INTO image_provider_cooldown (provider, consecutive_rate_limits, cooldown_until, updated_at)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      consecutive_rate_limits = VALUES(consecutive_rate_limits),
      cooldown_until = VALUES(cooldown_until),
      updated_at = VALUES(updated_at)
    `,
    [provider, consecutiveRateLimits, cooldownUntil ? toSqlDatetime(cooldownUntil) : null, utcNowSql()],
  );
};

/** Records a successful download for `provider`: resets the escalation counter and clears any cooldown. */
export const recordProviderSuccess = async (
  conn: PoolConnection,
  state: Map<ProviderName, ProviderCooldownState>,
  provider: ProviderName,
): Promise<void> => {
  state.set(provider, { consecutiveRateLimits: 0, cooldownUntil: null });
  await conn.execute<ResultSetHeader>(
    `
    INSERT INTO image_provider_cooldown (provider, consecutive_rate_limits, cooldown_until, updated_at)
    VALUES (?, 0, NULL, ?)
    ON DUPLICATE KEY UPDATE
      consecutive_rate_limits = 0,
      cooldown_until = NULL,
      updated_at = VALUES(updated_at)
    `,
    [provider, utcNowSql()],
  );
};
