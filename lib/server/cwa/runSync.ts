import { fetchCwaForecasts } from "@/lib/server/cwa/sources/forecast";
import { fetchCwaEarthquakes } from "@/lib/server/cwa/sources/earthquake";
import { fetchCwaTsunamis } from "@/lib/server/cwa/sources/tsunami";
import { fetchCwaAlerts } from "@/lib/server/cwa/sources/alerts";
import { fetchCwaTownshipHazards } from "@/lib/server/cwa/sources/townshipHazards";
import { fetchCwaStationWeather } from "@/lib/server/cwa/sources/stationWeather";
import { fetchCwaRainfall } from "@/lib/server/cwa/sources/rainfall";
import { fetchCwaUvIndex } from "@/lib/server/cwa/sources/uvIndex";
import {
  upsertCwaForecasts,
  upsertCwaEarthquakes,
  upsertCwaTsunamis,
  upsertCwaAlerts,
  upsertCwaTownshipHazards,
  upsertCwaStationWeather,
  upsertCwaRainfall,
  upsertCwaUvIndex,
} from "@/lib/server/cwa/queries";

export interface CwaSyncResult {
  sourceKey: string;
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

// Each dataset has its own record shape and upsert target table, so (unlike
// facilities' runSync, where every source produces the same FacilityRecord)
// this can't be a generic array-of-tasks without losing type safety —
// written as one explicit try/catch per source instead.
const runOne = async (sourceKey: string, run: () => Promise<{ fetched: number; inserted: number; updated: number }>): Promise<CwaSyncResult> => {
  try {
    const { fetched, inserted, updated } = await run();
    return { sourceKey, fetched, inserted, updated, error: null };
  } catch (error) {
    return { sourceKey, fetched: 0, inserted: 0, updated: 0, error: error instanceof Error ? error.message : "Unknown CWA sync error" };
  }
};

export async function runCwaSync(): Promise<CwaSyncResult[]> {
  return [
    await runOne("cwa_forecasts", async () => {
      const records = await fetchCwaForecasts();
      const { inserted, updated } = await upsertCwaForecasts(records);
      return { fetched: records.length, inserted, updated };
    }),
    await runOne("cwa_earthquakes", async () => {
      const records = await fetchCwaEarthquakes();
      const { inserted, updated } = await upsertCwaEarthquakes(records);
      return { fetched: records.length, inserted, updated };
    }),
    await runOne("cwa_tsunamis", async () => {
      const records = await fetchCwaTsunamis();
      const { inserted, updated } = await upsertCwaTsunamis(records);
      return { fetched: records.length, inserted, updated };
    }),
    await runOne("cwa_alerts", async () => {
      const records = await fetchCwaAlerts();
      const { inserted, updated } = await upsertCwaAlerts(records);
      return { fetched: records.length, inserted, updated };
    }),
    await runOne("cwa_township_hazards", async () => {
      const records = await fetchCwaTownshipHazards();
      const { inserted, updated } = await upsertCwaTownshipHazards(records);
      return { fetched: records.length, inserted, updated };
    }),
    await runOne("cwa_station_weather", async () => {
      const records = await fetchCwaStationWeather();
      const { inserted, updated } = await upsertCwaStationWeather(records);
      return { fetched: records.length, inserted, updated };
    }),
    await runOne("cwa_rainfall", async () => {
      const records = await fetchCwaRainfall();
      const { inserted, updated } = await upsertCwaRainfall(records);
      return { fetched: records.length, inserted, updated };
    }),
    await runOne("cwa_uv_index", async () => {
      const records = await fetchCwaUvIndex();
      const { inserted, updated } = await upsertCwaUvIndex(records);
      return { fetched: records.length, inserted, updated };
    }),
  ];
}
