import { httpGetText } from "@/lib/server/net/httpClient";
import { INUNDATION_SENSORS_SEED } from "@/lib/server/inundation/data/sensorSeed";
import type { InundationSensorItem } from "@/lib/server/inundation/types";

// 經濟部水利署水資源物聯網 (iot.wra.gov.tw) — 路面淹水感知器即時讀數
const USWG_STATIONS_URL = "https://iot.wra.gov.tw/uswg/stations";

export async function fetchLiveInundationSensors(): Promise<InundationSensorItem[]> {
  try {
    const res = await httpGetText(USWG_STATIONS_URL, {
      timeoutMs: 5000,
      headers: { Accept: "application/json" },
    });

    if (!res || res.status !== 200 || !res.text || !res.text.trim().startsWith("[")) {
      return INUNDATION_SENSORS_SEED;
    }

    const json = JSON.parse(res.text);
    if (!Array.isArray(json) || json.length === 0) {
      return INUNDATION_SENSORS_SEED;
    }

    const sensors: InundationSensorItem[] = json.map((item: any, idx: number) => {
      const depth = Number(item.WaterDepth ?? item.Value ?? 0);
      const warning = Number(item.WarningDepth ?? 10);
      let alertLevel: "normal" | "warning" | "critical" = "normal";
      if (depth >= warning * 1.5) {
        alertLevel = "critical";
      } else if (depth >= warning) {
        alertLevel = "warning";
      }

      return {
        sensorId: String(item.StationId || item.ID || `IOT-USWG-${idx + 1}`),
        sensorName: String(item.StationName || item.Name || `路面淹水測站 ${idx + 1}`),
        county: String(item.CountyName || item.County || "全國"),
        township: String(item.TownName || item.Town || ""),
        address: item.Address || null,
        waterDepthCm: Math.max(0, depth),
        warningDepthCm: warning,
        alertLevel,
        lat: Number(item.Latitude || item.Lat || 0),
        lng: Number(item.Longitude || item.Lon || 0),
        source: "水利署水資源物聯網 (WRA IoT)",
        recordedAt: item.TimeStamp || new Date().toISOString(),
      };
    });

    return sensors.length > 0 ? sensors : INUNDATION_SENSORS_SEED;
  } catch {
    return INUNDATION_SENSORS_SEED;
  }
}
