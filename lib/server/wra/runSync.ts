import { fetchWaterLevelStations } from "@/lib/server/wra/fetchWaterLevelStations";
import { upsertWaterLevelReadings } from "@/lib/server/wra/waterLevelQueries";
import { fetchReservoirStatus } from "@/lib/server/wra/fetchReservoirStatus";
import { upsertReservoirStatus } from "@/lib/server/wra/reservoirQueries";
import { fetchDamStructureStations } from "@/lib/server/wra/fetchDamStructureStations";
import { upsertDamStructureStations } from "@/lib/server/wra/damStructureQueries";
import { fetchGroundwaterLevelStations } from "@/lib/server/wra/fetchGroundwaterLevelStations";
import { upsertGroundwaterStations } from "@/lib/server/wra/groundwaterQueries";
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

/**
 * Syncs iot.wra.gov.tw's real-time IoT sensor sources (issue #270) — 堤防結構
 * 安全監測站 and 地下水位監測站. Kept as its own runner (rather than folded
 * into runWraSync) so it can be cron'd more frequently — these are per-minute
 * telemetry, unlike the 30-minute-cadence opendata.wra.gov.tw sources above.
 */
export async function runWraIotSync(): Promise<WraSyncResult[]> {
  const results: WraSyncResult[] = [];

  results.push(
    await runSource("wra_dam_structure", ZERO_COUNTS, async () => {
      const records = await fetchDamStructureStations();
      const { inserted, updated } = await upsertDamStructureStations(records);
      return { fetched: records.length, inserted, updated };
    }),
  );

  results.push(
    await runSource("wra_groundwater", ZERO_COUNTS, async () => {
      const records = await fetchGroundwaterLevelStations();
      const { inserted, updated } = await upsertGroundwaterStations(records);
      return { fetched: records.length, inserted, updated };
    }),
  );

  return results;
}

/**
 * Syncs WRA reference catalogs — 水庫代碼表 (dataset/139336) and
 * 河川水位測站站況 (dataset/22227). Run daily or manually via admin endpoint.
 */
export async function runWraCatalogSync(): Promise<WraSyncResult[]> {
  const { fetchReservoirCatalog } = await import("@/lib/server/wra/fetchReservoirCatalog");
  const { fetchWaterLevelStationCatalog } = await import("@/lib/server/wra/fetchWaterLevelStationCatalog");
  const { upsertReservoirCatalog, upsertWaterLevelStationCatalog } = await import(
    "@/lib/server/wra/catalogQueries"
  );

  const results: WraSyncResult[] = [];

  results.push(
    await runSource("wra_reservoir_catalog", ZERO_COUNTS, async () => {
      const records = await fetchReservoirCatalog();
      const { inserted, updated } = await upsertReservoirCatalog(records);
      return { fetched: records.length, inserted, updated };
    }),
  );

  results.push(
    await runSource("wra_water_level_station_catalog", ZERO_COUNTS, async () => {
      const records = await fetchWaterLevelStationCatalog();
      const { inserted, updated } = await upsertWaterLevelStationCatalog(records);
      return { fetched: records.length, inserted, updated };
    }),
  );

  return results;
}
