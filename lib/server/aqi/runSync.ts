import { fetchAqiSites } from "@/lib/server/aqi/fetchAqi";
import { upsertAqiReadings } from "@/lib/server/aqi/queries";
import { fetchPm25Sites } from "@/lib/server/aqi/fetchPm25";
import { upsertPm25Readings } from "@/lib/server/aqi/pm25Queries";
import { fetchAqiForecasts } from "@/lib/server/aqi/fetchAqiForecast";
import { upsertAqiForecasts } from "@/lib/server/aqi/forecastQueries";
import { runSource } from "@/lib/server/sync/runSource";

export interface AqiSyncResult {
  sourceKey: string;
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

const ZERO_COUNTS = { fetched: 0, inserted: 0, updated: 0 };

// PM2.5's coordinates are resolved from aqi_readings (see pm25Queries.ts),
// so aqi must run first within this same sync pass.
export async function runAqiSync(): Promise<AqiSyncResult[]> {
  const results: AqiSyncResult[] = [];

  results.push(
    await runSource("aqi", ZERO_COUNTS, async () => {
      const sites = await fetchAqiSites();
      const { inserted, updated } = await upsertAqiReadings(sites);
      return { fetched: sites.length, inserted, updated };
    }),
  );

  results.push(
    await runSource("pm25", ZERO_COUNTS, async () => {
      const sites = await fetchPm25Sites();
      const { inserted, updated } = await upsertPm25Readings(sites);
      return { fetched: sites.length, inserted, updated };
    }),
  );

  results.push(
    await runSource("aqi_forecast", ZERO_COUNTS, async () => {
      const forecasts = await fetchAqiForecasts();
      const { inserted, updated } = await upsertAqiForecasts(forecasts);
      return { fetched: forecasts.length, inserted, updated };
    }),
  );

  return results;
}
