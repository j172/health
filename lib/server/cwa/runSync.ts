import { fetchCwaForecasts } from "@/lib/server/cwa/sources/forecast";
import { fetchCwaEarthquakes } from "@/lib/server/cwa/sources/earthquake";
import { fetchCwaTsunamis } from "@/lib/server/cwa/sources/tsunami";
import { fetchCwaAlerts } from "@/lib/server/cwa/sources/alerts";
import { fetchCwaTyphoons } from "@/lib/server/cwa/sources/typhoon";
import { fetchMoenvDustStorms } from "@/lib/server/moenv/dustStorm";
import { fetchCwaTownshipHazards } from "@/lib/server/cwa/sources/townshipHazards";
import { fetchCwaStationWeather } from "@/lib/server/cwa/sources/stationWeather";
import { fetchCwaRainfall } from "@/lib/server/cwa/sources/rainfall";
import { fetchCwaUvIndex } from "@/lib/server/cwa/sources/uvIndex";
import { fetchCwaDailyRainfall } from "@/lib/server/cwa/sources/dailyRainfall";
import {
  upsertCwaForecasts,
  upsertCwaEarthquakes,
  upsertCwaTsunamis,
  upsertCwaAlerts,
  upsertCwaTownshipHazards,
  upsertCwaStationWeather,
  upsertCwaRainfall,
  upsertCwaUvIndex,
  upsertCwaDailyRainfall,
} from "@/lib/server/cwa/queries";
import { runSource } from "@/lib/server/sync/runSource";

export interface CwaSyncResult {
  sourceKey: string;
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

const ZERO_COUNTS = { fetched: 0, inserted: 0, updated: 0 };
const CWA_ERROR_FALLBACK = "Unknown CWA sync error";

export async function runCwaSync(): Promise<CwaSyncResult[]> {
  return [
    await runSource(
      "cwa_forecasts",
      ZERO_COUNTS,
      async () => {
        const records = await fetchCwaForecasts();
        const { inserted, updated } = await upsertCwaForecasts(records);
        return { fetched: records.length, inserted, updated };
      },
      CWA_ERROR_FALLBACK,
    ),
    await runSource(
      "cwa_earthquakes",
      ZERO_COUNTS,
      async () => {
        const records = await fetchCwaEarthquakes();
        const { inserted, updated } = await upsertCwaEarthquakes(records);
        return { fetched: records.length, inserted, updated };
      },
      CWA_ERROR_FALLBACK,
    ),
    await runSource(
      "cwa_tsunamis",
      ZERO_COUNTS,
      async () => {
        const records = await fetchCwaTsunamis();
        const { inserted, updated } = await upsertCwaTsunamis(records);
        return { fetched: records.length, inserted, updated };
      },
      CWA_ERROR_FALLBACK,
    ),
    await runSource(
      "cwa_alerts",
      ZERO_COUNTS,
      async () => {
        const records = await fetchCwaAlerts();
        const { inserted, updated } = await upsertCwaAlerts(records);
        return { fetched: records.length, inserted, updated };
      },
      CWA_ERROR_FALLBACK,
    ),
    // Typhoons and dust storms land in cwa_alerts too, so the 即時氣象警報 block
    // stays one query and one render path. They are registered as separate
    // sources because one is CWA track data and the other a MOENV bulletin —
    // runSource's per-source isolation means a failure in either cannot take
    // the CAP alerts down with it.
    await runSource(
      "cwa_typhoons",
      ZERO_COUNTS,
      async () => {
        const records = await fetchCwaTyphoons();
        const { inserted, updated } = await upsertCwaAlerts(records);
        return { fetched: records.length, inserted, updated };
      },
      CWA_ERROR_FALLBACK,
    ),
    await runSource(
      "moenv_dust_storms",
      ZERO_COUNTS,
      async () => {
        const records = await fetchMoenvDustStorms();
        const { inserted, updated } = await upsertCwaAlerts(records);
        return { fetched: records.length, inserted, updated };
      },
      CWA_ERROR_FALLBACK,
    ),
    await runSource(
      "cwa_township_hazards",
      ZERO_COUNTS,
      async () => {
        const records = await fetchCwaTownshipHazards();
        const { inserted, updated } = await upsertCwaTownshipHazards(records);
        return { fetched: records.length, inserted, updated };
      },
      CWA_ERROR_FALLBACK,
    ),
    await runSource(
      "cwa_station_weather",
      ZERO_COUNTS,
      async () => {
        const records = await fetchCwaStationWeather();
        const { inserted, updated } = await upsertCwaStationWeather(records);
        return { fetched: records.length, inserted, updated };
      },
      CWA_ERROR_FALLBACK,
    ),
    await runSource(
      "cwa_rainfall",
      ZERO_COUNTS,
      async () => {
        const records = await fetchCwaRainfall();
        const { inserted, updated } = await upsertCwaRainfall(records);
        return { fetched: records.length, inserted, updated };
      },
      CWA_ERROR_FALLBACK,
    ),
    // The accumulation history behind cwa_rainfall's live gauge readings. A
    // separate station network — 38 staffed stations against 1,331 automatic
    // gauges — so it resolves its own nearest station rather than borrowing.
    await runSource(
      "cwa_daily_rainfall",
      ZERO_COUNTS,
      async () => {
        const records = await fetchCwaDailyRainfall();
        const { inserted, updated } = await upsertCwaDailyRainfall(records);
        return { fetched: records.length, inserted, updated };
      },
      CWA_ERROR_FALLBACK,
    ),
    await runSource(
      "cwa_uv_index",
      ZERO_COUNTS,
      async () => {
        const records = await fetchCwaUvIndex();
        const { inserted, updated } = await upsertCwaUvIndex(records);
        return { fetched: records.length, inserted, updated };
      },
      CWA_ERROR_FALLBACK,
    ),
  ];
}
