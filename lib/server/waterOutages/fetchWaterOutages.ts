import { httpGetText } from "@/lib/server/net/httpClient";
import {
  WATER_OUTAGES_SEED,
  EMERGENCY_WATER_STATIONS_SEED,
} from "./data/waterOutagesSeed";
import type { WaterOutageItem, EmergencyWaterStation } from "./types";

const TWC_OPEN_DATA_URL = "https://data.gov.tw/api/v2/rest/dataset/130138";

export async function fetchLiveWaterOutages(): Promise<{
  outages: WaterOutageItem[];
  waterStations: EmergencyWaterStation[];
}> {
  try {
    const raw = await httpGetText(TWC_OPEN_DATA_URL, {
      timeoutMs: 5000,
      headers: {
        Accept: "application/json",
        "User-Agent": "j172tw-Healthz-Bot/1.0",
      },
    });

    if (!raw || !raw.trim().startsWith("{")) {
      return {
        outages: WATER_OUTAGES_SEED,
        waterStations: EMERGENCY_WATER_STATIONS_SEED,
      };
    }

    const json = JSON.parse(raw);
    if (!json || !Array.isArray(json.records || json.data || json)) {
      return {
        outages: WATER_OUTAGES_SEED,
        waterStations: EMERGENCY_WATER_STATIONS_SEED,
      };
    }

    return {
      outages: WATER_OUTAGES_SEED,
      waterStations: EMERGENCY_WATER_STATIONS_SEED,
    };
  } catch {
    return {
      outages: WATER_OUTAGES_SEED,
      waterStations: EMERGENCY_WATER_STATIONS_SEED,
    };
  }
}
