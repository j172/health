import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import {
  INUNDATION_SENSORS_SEED,
  INUNDATION_SHELTERS_SEED,
} from "./data/sensorSeed";
import type {
  InundationSensorItem,
  InundationShelterPoint,
  RiverWaterLevelAlert,
  InundationMapOverview,
  InundationAlertLevel,
} from "./types";

interface DbSensorRow extends RowDataPacket {
  sensor_id: string;
  sensor_name: string;
  county: string;
  township: string;
  address: string | null;
  water_depth_cm: number | string;
  warning_depth_cm: number | string;
  alert_level: string;
  lat: number | string;
  lng: number | string;
  source: string;
  recorded_at: Date | string;
}

export async function ensureInundationSeeded(): Promise<void> {
  await withConnection(async (conn) => {
    const [sensorCount] = await conn.query<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM wra_inundation_sensors"
    );
    if ((sensorCount[0]?.cnt || 0) === 0) {
      for (const s of INUNDATION_SENSORS_SEED) {
        await conn.execute(
          `INSERT INTO wra_inundation_sensors 
           (sensor_id, sensor_name, county, township, address, water_depth_cm, warning_depth_cm, alert_level, lat, lng, source, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
             water_depth_cm = VALUES(water_depth_cm),
             alert_level = VALUES(alert_level),
             recorded_at = VALUES(recorded_at)`,
          [
            s.sensorId,
            s.sensorName,
            s.county,
            s.township,
            s.address || null,
            s.waterDepthCm,
            s.warningDepthCm,
            s.alertLevel,
            s.lat,
            s.lng,
            s.source,
            s.recordedAt,
          ]
        );
      }
    }
  });
}

export async function getInundationOverview(filter?: {
  county?: string;
  onlyAlert?: boolean;
}): Promise<InundationMapOverview> {
  await ensureInundationSeeded();

  return await withConnection(async (conn) => {
    let sensorSql = "SELECT * FROM wra_inundation_sensors WHERE 1=1";
    const sensorParams: any[] = [];

    if (filter?.county && filter.county !== "all") {
      sensorSql += " AND county = ?";
      sensorParams.push(filter.county);
    }
    if (filter?.onlyAlert) {
      sensorSql += " AND alert_level IN ('warning', 'critical')";
    }
    sensorSql += " ORDER BY water_depth_cm DESC, sensor_id ASC";

    const [sensorRows] = await conn.query<DbSensorRow[]>(sensorSql, sensorParams);

    const sensors: InundationSensorItem[] = sensorRows.map((r) => ({
      sensorId: r.sensor_id,
      sensorName: r.sensor_name,
      county: r.county,
      township: r.township,
      address: r.address,
      waterDepthCm: Number(r.water_depth_cm) || 0,
      warningDepthCm: Number(r.warning_depth_cm) || 10,
      alertLevel: (r.alert_level as InundationAlertLevel) || "normal",
      lat: Number(r.lat) || 0,
      lng: Number(r.lng) || 0,
      source: r.source,
      recordedAt:
        r.recorded_at instanceof Date
          ? r.recorded_at.toISOString()
          : String(r.recorded_at || new Date().toISOString()),
    }));

    // 跨表抓取水利署水位警戒達到警戒線的站點
    const riverAlerts: RiverWaterLevelAlert[] = [];
    try {
      const [stationRows] = await conn.query<RowDataPacket[]>(
        `SELECT 
          s.station_id,
          s.station_name,
          s.river_name,
          s.location_address,
          s.alert_level_1,
          s.alert_level_2,
          s.alert_level_3,
          r.water_level,
          r.recorded_at
         FROM wra_water_level_stations s
         JOIN wra_water_level_readings r ON s.station_id = r.station_id
         WHERE r.recorded_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
           AND r.water_level IS NOT NULL
         ORDER BY r.recorded_at DESC
         LIMIT 60`
      );

      const seen = new Set<string>();
      for (const row of stationRows) {
        if (seen.has(row.station_id)) continue;
        seen.add(row.station_id);

        const currentLvl = parseFloat(row.water_level);
        const l1 = row.alert_level_1 ? parseFloat(row.alert_level_1) : null;
        const l2 = row.alert_level_2 ? parseFloat(row.alert_level_2) : null;
        const l3 = row.alert_level_3 ? parseFloat(row.alert_level_3) : null;

        let alertLevel: InundationAlertLevel = "normal";
        let statusText = "水情平穩";

        if (l1 && currentLvl >= l1) {
          alertLevel = "critical";
          statusText = "一級警戒 (已達暴雨溢堤警戒)";
        } else if (l2 && currentLvl >= l2) {
          alertLevel = "warning";
          statusText = "二級警戒 (注意路面低窪積水)";
        } else if (l3 && currentLvl >= l3) {
          alertLevel = "warning";
          statusText = "三級警戒 (高水位戒備)";
        }

        const addr = row.location_address || "";
        let county = "全國";
        const countyList = [
          "臺北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
          "臺中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "臺南市",
          "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣"
        ];
        for (const c of countyList) {
          if (addr.includes(c) || (row.station_name && row.station_name.includes(c))) {
            county = c;
            break;
          }
        }

        if (filter?.county && filter.county !== "all" && county !== filter.county) {
          continue;
        }

        riverAlerts.push({
          stationId: row.station_id,
          stationName: row.station_name || `測站 ${row.station_id}`,
          riverName: row.river_name || "主要流域",
          county,
          currentWaterLevel: currentLvl,
          alertLevel,
          statusText,
          recordedAt:
            row.recorded_at instanceof Date
              ? row.recorded_at.toISOString()
              : String(row.recorded_at || new Date().toISOString()),
        });
      }
    } catch (err) {
      console.warn("Failed to query river alerts:", err instanceof Error ? err.message : String(err));
    }

    let shelters: InundationShelterPoint[] = INUNDATION_SHELTERS_SEED;
    if (filter?.county && filter.county !== "all") {
      shelters = shelters.filter((sh) => sh.county === filter.county);
    }

    const totalSensors = sensors.length;
    const normalCount = sensors.filter((s) => s.alertLevel === "normal").length;
    const warningCount = sensors.filter((s) => s.alertLevel === "warning").length;
    const criticalCount = sensors.filter((s) => s.alertLevel === "critical").length;
    const riverAlertCount = riverAlerts.filter((r) => r.alertLevel !== "normal").length;

    const counties = Array.from(new Set(INUNDATION_SENSORS_SEED.map((s) => s.county)));

    return {
      sensors,
      riverAlerts,
      shelters,
      summary: {
        totalSensors,
        normalCount,
        warningCount,
        criticalCount,
        riverAlertCount,
      },
      counties,
    };
  });
}
