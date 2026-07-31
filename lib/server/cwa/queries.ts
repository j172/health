import type { RowDataPacket } from "mysql2/promise";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";

const BATCH_SIZE = 500;

const chunkedUpsert = async <T>(
  records: T[],
  tableSql: string,
  toRow: (record: T, now: string) => unknown[],
): Promise<{ inserted: number; updated: number }> =>
  withConnection(async (conn) => {
    let inserted = 0;
    let updated = 0;
    const now = utcNowSql();

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const chunk = records.slice(i, i + BATCH_SIZE);
      if (chunk.length === 0) continue;
      const values = chunk.map((record) => toRow(record, now));
      const [result] = await conn.query(tableSql, [values]);
      const affected = (result as { affectedRows: number }).affectedRows;
      const chunkUpdated = affected - chunk.length;
      updated += chunkUpdated;
      inserted += chunk.length - chunkUpdated;
    }

    return { inserted, updated };
  });

export interface CwaForecastRecord {
  countyName: string;
  elementName: string;
  startTime: string;
  endTime: string;
  parameterName: string | null;
  parameterValue: string | null;
  parameterUnit: string | null;
}

export const upsertCwaForecasts = (records: CwaForecastRecord[]) =>
  chunkedUpsert(
    records,
    `INSERT INTO cwa_forecasts
       (county_name, element_name, start_time, end_time, parameter_name, parameter_value, parameter_unit, synced_at, created_at, updated_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       end_time = VALUES(end_time),
       parameter_name = VALUES(parameter_name),
       parameter_value = VALUES(parameter_value),
       parameter_unit = VALUES(parameter_unit),
       synced_at = VALUES(synced_at),
       updated_at = VALUES(updated_at)`,
    (r, now) => [r.countyName, r.elementName, r.startTime, r.endTime, r.parameterName, r.parameterValue, r.parameterUnit, now, now, now],
  );

export interface CwaEarthquakeRecord {
  earthquakeNo: number;
  reportType: string | null;
  reportColor: string | null;
  originTime: string | null;
  location: string | null;
  epicenterLat: number | null;
  epicenterLng: number | null;
  focalDepth: number | null;
  magnitudeValue: number | null;
  magnitudeType: string | null;
  maxIntensity: string | null;
  reportContent: string | null;
  reportImageUri: string | null;
  web: string | null;
  areaIntensityJson: unknown;
}

export const upsertCwaEarthquakes = (records: CwaEarthquakeRecord[]) =>
  chunkedUpsert(
    records,
    `INSERT INTO cwa_earthquakes
       (earthquake_no, report_type, report_color, origin_time, location, epicenter_lat, epicenter_lng, focal_depth,
        magnitude_value, magnitude_type, max_intensity, report_content, report_image_uri, web, area_intensity_json,
        synced_at, created_at, updated_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       report_type = VALUES(report_type),
       report_color = VALUES(report_color),
       origin_time = VALUES(origin_time),
       location = VALUES(location),
       epicenter_lat = VALUES(epicenter_lat),
       epicenter_lng = VALUES(epicenter_lng),
       focal_depth = VALUES(focal_depth),
       magnitude_value = VALUES(magnitude_value),
       magnitude_type = VALUES(magnitude_type),
       max_intensity = VALUES(max_intensity),
       report_content = VALUES(report_content),
       report_image_uri = VALUES(report_image_uri),
       web = VALUES(web),
       area_intensity_json = VALUES(area_intensity_json),
       synced_at = VALUES(synced_at),
       updated_at = VALUES(updated_at)`,
    (r, now) => [
      r.earthquakeNo,
      r.reportType,
      r.reportColor,
      r.originTime,
      r.location,
      r.epicenterLat,
      r.epicenterLng,
      r.focalDepth,
      r.magnitudeValue,
      r.magnitudeType,
      r.maxIntensity,
      r.reportContent,
      r.reportImageUri,
      r.web,
      r.areaIntensityJson ? JSON.stringify(r.areaIntensityJson) : null,
      now,
      now,
      now,
    ],
  );

export interface CwaTsunamiRecord {
  reportNo: string;
  reportType: string | null;
  reportColor: string | null;
  issueTime: string | null;
  endTime: string | null;
  reportContent: string | null;
  web: string | null;
}

export const upsertCwaTsunamis = (records: CwaTsunamiRecord[]) =>
  chunkedUpsert(
    records,
    `INSERT INTO cwa_tsunamis
       (report_no, report_type, report_color, issue_time, end_time, report_content, web, synced_at, created_at, updated_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       report_type = VALUES(report_type),
       report_color = VALUES(report_color),
       issue_time = VALUES(issue_time),
       end_time = VALUES(end_time),
       report_content = VALUES(report_content),
       web = VALUES(web),
       synced_at = VALUES(synced_at),
       updated_at = VALUES(updated_at)`,
    (r, now) => [r.reportNo, r.reportType, r.reportColor, r.issueTime, r.endTime, r.reportContent, r.web, now, now, now],
  );

export interface CwaAlertRecord {
  alertKey: string;
  datasetId: string;
  event: string | null;
  headline: string | null;
  description: string | null;
  instruction: string | null;
  severity: string | null;
  urgency: string | null;
  certainty: string | null;
  areaDesc: string | null;
  effective: string | null;
  onset: string | null;
  expires: string | null;
  web: string | null;
}

export const upsertCwaAlerts = (records: CwaAlertRecord[]) =>
  chunkedUpsert(
    records,
    `INSERT INTO cwa_alerts
       (alert_key, dataset_id, event, headline, description, instruction, severity, urgency, certainty, area_desc,
        effective, onset, expires, web, synced_at, created_at, updated_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       headline = VALUES(headline),
       description = VALUES(description),
       instruction = VALUES(instruction),
       severity = VALUES(severity),
       urgency = VALUES(urgency),
       certainty = VALUES(certainty),
       area_desc = VALUES(area_desc),
       onset = VALUES(onset),
       expires = VALUES(expires),
       web = VALUES(web),
       synced_at = VALUES(synced_at),
       updated_at = VALUES(updated_at)`,
    (r, now) => [
      r.alertKey,
      r.datasetId,
      r.event,
      r.headline,
      r.description,
      r.instruction,
      r.severity,
      r.urgency,
      r.certainty,
      r.areaDesc,
      r.effective,
      r.onset,
      r.expires,
      r.web,
      now,
      now,
      now,
    ],
  );

export interface CwaTownshipHazardRecord {
  locationName: string;
  geocode: string | null;
  phenomena: string;
  significance: string | null;
  startTime: string;
  endTime: string | null;
}

export const upsertCwaTownshipHazards = (records: CwaTownshipHazardRecord[]) =>
  chunkedUpsert(
    records,
    `INSERT INTO cwa_township_hazards
       (location_name, geocode, phenomena, significance, start_time, end_time, synced_at, created_at, updated_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       geocode = VALUES(geocode),
       significance = VALUES(significance),
       end_time = VALUES(end_time),
       synced_at = VALUES(synced_at),
       updated_at = VALUES(updated_at)`,
    (r, now) => [r.locationName, r.geocode, r.phenomena, r.significance, r.startTime, r.endTime, now, now, now],
  );

export interface CwaStationWeatherRecord {
  datasetId: string;
  stationId: string;
  stationName: string | null;
  countyName: string | null;
  townName: string | null;
  lat: number | null;
  lng: number | null;
  altitude: number | null;
  obsTime: string;
  weather: string | null;
  precipitation: string | null;
  windDirection: string | null;
  windSpeed: string | null;
  airTemperature: string | null;
  relativeHumidity: string | null;
  airPressure: string | null;
  uvIndex: string | null;
  peakGustSpeed: string | null;
  visibilityDescription: string | null;
  sunshineDuration: string | null;
}

export const upsertCwaStationWeather = (records: CwaStationWeatherRecord[]) =>
  chunkedUpsert(
    records,
    `INSERT INTO cwa_station_weather
       (dataset_id, station_id, station_name, county_name, town_name, lat, lng, altitude, obs_time, weather,
        precipitation, wind_direction, wind_speed, air_temperature, relative_humidity, air_pressure, uv_index,
        peak_gust_speed, visibility_description, sunshine_duration, synced_at, created_at, updated_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       station_name = VALUES(station_name),
       county_name = VALUES(county_name),
       town_name = VALUES(town_name),
       lat = VALUES(lat),
       lng = VALUES(lng),
       altitude = VALUES(altitude),
       weather = VALUES(weather),
       precipitation = VALUES(precipitation),
       wind_direction = VALUES(wind_direction),
       wind_speed = VALUES(wind_speed),
       air_temperature = VALUES(air_temperature),
       relative_humidity = VALUES(relative_humidity),
       air_pressure = VALUES(air_pressure),
       uv_index = VALUES(uv_index),
       peak_gust_speed = VALUES(peak_gust_speed),
       visibility_description = VALUES(visibility_description),
       sunshine_duration = VALUES(sunshine_duration),
       synced_at = VALUES(synced_at),
       updated_at = VALUES(updated_at)`,
    (r, now) => [
      r.datasetId,
      r.stationId,
      r.stationName,
      r.countyName,
      r.townName,
      r.lat,
      r.lng,
      r.altitude,
      r.obsTime,
      r.weather,
      r.precipitation,
      r.windDirection,
      r.windSpeed,
      r.airTemperature,
      r.relativeHumidity,
      r.airPressure,
      r.uvIndex,
      r.peakGustSpeed,
      r.visibilityDescription,
      r.sunshineDuration,
      now,
      now,
      now,
    ],
  );

export interface CwaRainfallRecord {
  stationId: string;
  stationName: string | null;
  countyName: string | null;
  townName: string | null;
  lat: number | null;
  lng: number | null;
  obsTime: string;
  precipNow: string | null;
  precip10min: string | null;
  precip1hr: string | null;
  precip3hr: string | null;
  precip6hr: string | null;
  precip12hr: string | null;
  precip24hr: string | null;
  precip2days: string | null;
  precip3days: string | null;
}

export const upsertCwaRainfall = (records: CwaRainfallRecord[]) =>
  chunkedUpsert(
    records,
    `INSERT INTO cwa_rainfall
       (station_id, station_name, county_name, town_name, lat, lng, obs_time, precip_now, precip_10min, precip_1hr,
        precip_3hr, precip_6hr, precip_12hr, precip_24hr, precip_2days, precip_3days, synced_at, created_at, updated_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       station_name = VALUES(station_name),
       county_name = VALUES(county_name),
       town_name = VALUES(town_name),
       lat = VALUES(lat),
       lng = VALUES(lng),
       precip_now = VALUES(precip_now),
       precip_10min = VALUES(precip_10min),
       precip_1hr = VALUES(precip_1hr),
       precip_3hr = VALUES(precip_3hr),
       precip_6hr = VALUES(precip_6hr),
       precip_12hr = VALUES(precip_12hr),
       precip_24hr = VALUES(precip_24hr),
       precip_2days = VALUES(precip_2days),
       precip_3days = VALUES(precip_3days),
       synced_at = VALUES(synced_at),
       updated_at = VALUES(updated_at)`,
    (r, now) => [
      r.stationId,
      r.stationName,
      r.countyName,
      r.townName,
      r.lat,
      r.lng,
      r.obsTime,
      r.precipNow,
      r.precip10min,
      r.precip1hr,
      r.precip3hr,
      r.precip6hr,
      r.precip12hr,
      r.precip24hr,
      r.precip2days,
      r.precip3days,
      now,
      now,
      now,
    ],
  );

export interface CwaUvIndexRecord {
  stationId: string;
  obsDate: string;
  uvIndex: number | null;
}

export const upsertCwaUvIndex = (records: CwaUvIndexRecord[]) =>
  chunkedUpsert(
    records,
    `INSERT INTO cwa_uv_index
       (station_id, obs_date, uv_index, synced_at, created_at, updated_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       uv_index = VALUES(uv_index),
       synced_at = VALUES(synced_at),
       updated_at = VALUES(updated_at)`,
    (r, now) => [r.stationId, r.obsDate, r.uvIndex, now, now, now],
  );

export interface LatestUvReading {
  station_id: string;
  station_name: string | null;
  county_name: string | null;
  uv_index: number;
}

/** Nearest station's UV reading (most recent obs_date) to a given point (Haversine, km). Joined against cwa_station_weather for coordinates and name. */
export const getNearestUvReading = async (lat: number, lng: number): Promise<(LatestUvReading & { distance_km: number }) | null> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT u.station_id, s.station_name, s.county_name, u.uv_index,
        (6371 * acos(
          cos(radians(?)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(?)) +
          sin(radians(?)) * sin(radians(s.lat))
        )) AS distance_km
      FROM cwa_uv_index u
      INNER JOIN cwa_station_weather s ON s.station_id = u.station_id
      WHERE u.obs_date = (SELECT MAX(obs_date) FROM cwa_uv_index)
        AND u.uv_index IS NOT NULL
        AND s.lat IS NOT NULL AND s.lng IS NOT NULL
      GROUP BY u.station_id, s.station_name, s.county_name, u.uv_index, s.lat, s.lng
      ORDER BY distance_km ASC
      LIMIT 1
      `,
      [lat, lng, lat],
    );
    return (rows[0] as unknown as (LatestUvReading & { distance_km: number })) ?? null;
  });

export interface UvStationItem {
  station_id: string;
  station_name: string | null;
  county_name: string | null;
  uv_index: number;
  obs_date: string;
}

export const listAllLatestUvReadings = async (): Promise<UvStationItem[]> => {
  try {
    return await withConnection(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `
        SELECT DISTINCT u.station_id, s.station_name, s.county_name, u.uv_index, u.obs_date
        FROM cwa_uv_index u
        INNER JOIN cwa_station_weather s ON s.station_id = u.station_id
        WHERE u.obs_date = (SELECT MAX(obs_date) FROM cwa_uv_index)
          AND u.uv_index IS NOT NULL
        ORDER BY u.uv_index DESC
        `,
      );
      return (rows as unknown as UvStationItem[]) ?? [];
    });
  } catch (err) {
    console.error("Failed to list UV readings:", err);
    return [];
  }
};
