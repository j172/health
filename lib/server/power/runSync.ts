import { runSource } from "@/lib/server/sync/runSource";
import { fetchGenerationUnits } from "./fetchGenerationUnits";
import { fetchGenerationMix } from "./fetchGenerationMix";
import { fetchRadiationStations } from "./fetchRadiationStations";
import { upsertGenerationUnits, upsertGenerationMix, upsertRadiationStations } from "./queries";

export interface PowerSyncResult {
  sourceKey: string;
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

const ZERO_COUNTS = { fetched: 0, inserted: 0, updated: 0 };

/**
 * Syncs the two ~10-minute-cadence 全台電力概況儀表板 sources (issue #177) in
 * one pass — 台電 d006001 各機組即時發電量 and d525001 核電廠周邊輻射偵測站 —
 * same "one runner, one cron tick, each source wrapped individually in
 * runSource" convention as runWraSync, so one source's transient failure
 * doesn't block the other.
 */
export async function runPowerRealtimeSync(): Promise<PowerSyncResult[]> {
  const results: PowerSyncResult[] = [];

  results.push(
    await runSource("power_generation_units", ZERO_COUNTS, async () => {
      const records = await fetchGenerationUnits();
      const { inserted, updated } = await upsertGenerationUnits(records);
      return { fetched: records.length, inserted, updated };
    }),
  );

  results.push(
    await runSource("power_radiation_stations", ZERO_COUNTS, async () => {
      const records = await fetchRadiationStations();
      const { inserted, updated } = await upsertRadiationStations(records);
      return { fetched: records.length, inserted, updated };
    }),
  );

  return results;
}

/**
 * Syncs 經濟部能源署 set_id=55 全國發電來源配比 — barely ever changes (~4
 * rows), so it runs on its own daily interval rather than every 10 minutes.
 */
export async function runPowerMixSync(): Promise<PowerSyncResult[]> {
  const results: PowerSyncResult[] = [];

  results.push(
    await runSource("power_generation_mix", ZERO_COUNTS, async () => {
      const records = await fetchGenerationMix();
      const { inserted, updated } = await upsertGenerationMix(records);
      return { fetched: records.length, inserted, updated };
    }),
  );

  return results;
}
