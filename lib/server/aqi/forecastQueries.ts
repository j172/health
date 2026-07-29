import type { RowDataPacket } from "mysql2/promise";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import type { AqiForecastSnapshot } from "@/lib/server/aqi/fetchAqiForecast";

export interface AqiForecastRow {
  zone: string;
  forecast_date: string;
  publish_time: Date;
  aqi_value: number | null;
  major_pollutant: string | null;
}

/** Upserts one forecast per (zone, forecast_date) — newer publish batches overwrite the prior forecast for that date. */
export const upsertAqiForecasts = async (forecasts: AqiForecastSnapshot[]): Promise<{ inserted: number; updated: number }> =>
  withConnection(async (conn) => {
    if (forecasts.length === 0) return { inserted: 0, updated: 0 };
    const now = utcNowSql();

    const values = forecasts.map((f) => [
      f.zone,
      f.forecastDate,
      f.publishTime,
      f.aqiValue,
      f.majorPollutant,
      f.minorPollutant,
      f.minorPollutantAqi,
      f.content,
      now,
      now,
      now,
    ]);

    const [result] = await conn.query(
      `
      INSERT INTO aqi_forecasts
        (zone, forecast_date, publish_time, aqi_value, major_pollutant, minor_pollutant, minor_pollutant_aqi, content, synced_at, created_at, updated_at)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        publish_time = VALUES(publish_time),
        aqi_value = VALUES(aqi_value),
        major_pollutant = VALUES(major_pollutant),
        minor_pollutant = VALUES(minor_pollutant),
        minor_pollutant_aqi = VALUES(minor_pollutant_aqi),
        content = VALUES(content),
        synced_at = VALUES(synced_at),
        updated_at = VALUES(updated_at)
      `,
      [values],
    );

    // MySQL's upsert convention: affectedRows = 1 per new row + 2 per updated row.
    const affected = (result as { affectedRows: number }).affectedRows;
    const updated = affected - forecasts.length;
    return { inserted: forecasts.length - updated, updated };
  });

// MOENV's 10 空品區 (air quality zones) — a station's county maps to exactly
// one of these; used to resolve "which zone is this user in" from the same
// nearest-AQI-station lookup already used for the AQI/PM2.5/UV bar, rather
// than a separate reverse-geocode.
const COUNTY_TO_ZONE: Record<string, string> = {
  臺北市: "北部",
  台北市: "北部",
  新北市: "北部",
  基隆市: "北部",
  桃園市: "北部",
  新竹市: "竹苗",
  新竹縣: "竹苗",
  苗栗縣: "竹苗",
  臺中市: "中部",
  台中市: "中部",
  彰化縣: "中部",
  南投縣: "中部",
  雲林縣: "雲嘉南",
  嘉義市: "雲嘉南",
  嘉義縣: "雲嘉南",
  臺南市: "雲嘉南",
  台南市: "雲嘉南",
  高雄市: "高屏",
  屏東縣: "高屏",
  宜蘭縣: "宜蘭",
  花蓮縣: "花東",
  臺東縣: "花東",
  台東縣: "花東",
  澎湖縣: "澎湖",
  金門縣: "金門",
  連江縣: "馬祖",
};

export const zoneForCounty = (county: string): string | null => COUNTY_TO_ZONE[county] ?? null;

/** Today's (or the most recently published) forecast for a given zone. */
export const getForecastForZone = async (zone: string): Promise<AqiForecastRow | null> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT zone, forecast_date, publish_time, aqi_value, major_pollutant
       FROM aqi_forecasts
       WHERE zone = ? AND forecast_date >= CURDATE()
       ORDER BY forecast_date ASC
       LIMIT 1`,
      [zone],
    );
    return (rows[0] as unknown as AqiForecastRow) ?? null;
  });
