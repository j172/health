import { fetchWaterLevelStations } from "@/lib/server/wra/fetchWaterLevelStations";
import { upsertWaterLevelReadings } from "@/lib/server/wra/waterLevelQueries";
import { fetchReservoirStatus } from "@/lib/server/wra/fetchReservoirStatus";
import { upsertReservoirStatus } from "@/lib/server/wra/reservoirQueries";
import { runSource } from "@/lib/server/sync/runSource";

export interface WraSyncResult {
  sourceKey: string;
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

const ZERO_COUNTS = { fetched: 0, inserted: 0, updated: 0 };

/**
 * Syncs both WRA (經濟部水利署) open-data sources from issue #135 in one pass —
 * 水位站監測 and 水庫即時營運狀況 — same "one runner, one cron tick, each source
 * wrapped individually in runSource" convention as runAqiSync, so one
 * source's transient failure doesn't block the other.
 */
export async function runWraSync(): Promise<WraSyncResult[]> {
  const results: WraSyncResult[] = [];

  results.push(
    await runSource("wra_water_level", ZERO_COUNTS, async () => {
      const records = await fetchWaterLevelStations();
      const { inserted, updated } = await upsertWaterLevelReadings(records);
      return { fetched: records.length, inserted, updated };
    }),
  );

  results.push(
    await runSource("wra_reservoir_status", ZERO_COUNTS, async () => {
      const records = await fetchReservoirStatus();
      const { inserted, updated } = await upsertReservoirStatus(records);
      return { fetched: records.length, inserted, updated };
    }),
  );

  return results;
}
