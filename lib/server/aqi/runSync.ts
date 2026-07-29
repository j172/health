import { fetchAqiSites } from "@/lib/server/aqi/fetchAqi";
import { upsertAqiReadings } from "@/lib/server/aqi/queries";
import { fetchPm25Sites } from "@/lib/server/aqi/fetchPm25";
import { upsertPm25Readings } from "@/lib/server/aqi/pm25Queries";
import { fetchAqiForecasts } from "@/lib/server/aqi/fetchAqiForecast";
import { upsertAqiForecasts } from "@/lib/server/aqi/forecastQueries";

export interface AqiSyncResult {
  sourceKey: string;
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

// PM2.5's coordinates are resolved from aqi_readings (see pm25Queries.ts),
// so aqi must run first within this same sync pass.
export async function runAqiSync(): Promise<AqiSyncResult[]> {
  const results: AqiSyncResult[] = [];

  try {
    const sites = await fetchAqiSites();
    const { inserted, updated } = await upsertAqiReadings(sites);
    results.push({ sourceKey: "aqi", fetched: sites.length, inserted, updated, error: null });
  } catch (error) {
    results.push({ sourceKey: "aqi", fetched: 0, inserted: 0, updated: 0, error: error instanceof Error ? error.message : "Unknown sync error" });
  }

  try {
    const sites = await fetchPm25Sites();
    const { inserted, updated } = await upsertPm25Readings(sites);
    results.push({ sourceKey: "pm25", fetched: sites.length, inserted, updated, error: null });
  } catch (error) {
    results.push({ sourceKey: "pm25", fetched: 0, inserted: 0, updated: 0, error: error instanceof Error ? error.message : "Unknown sync error" });
  }

  try {
    const forecasts = await fetchAqiForecasts();
    const { inserted, updated } = await upsertAqiForecasts(forecasts);
    results.push({ sourceKey: "aqi_forecast", fetched: forecasts.length, inserted, updated, error: null });
  } catch (error) {
    results.push({ sourceKey: "aqi_forecast", fetched: 0, inserted: 0, updated: 0, error: error instanceof Error ? error.message : "Unknown sync error" });
  }

  return results;
}
