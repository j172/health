import type { RowDataPacket } from "mysql2/promise";
import { withConnection, withConnectionFallback } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import { memoizeQuery } from "@/lib/server/cache/memo";

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
    (r, now) => [
      r.countyName,
      r.elementName,
      r.startTime,
      r.endTime,
      r.parameterName,
      r.parameterValue,
      r.parameterUnit,
      now,
      now,
      now,
    ],
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
    (r, now) => [
      r.reportNo,
      r.reportType,
      r.reportColor,
      r.issueTime,
      r.endTime,
      r.reportContent,
      r.web,
      now,
      now,
      now,
    ],
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
    (r, now) => [
      r.locationName,
      r.geocode,
      r.phenomena,
      r.significance,
      r.startTime,
      r.endTime,
      now,
      now,
      now,
    ],
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

export interface NearestStationWeatherRecord {
  station_id: string;
  station_name: string | null;
  county_name: string | null;
  town_name: string | null;
  obs_time: string;
  weather: string | null;
  precipitation: string | null;
  wind_speed: string | null;
  air_temperature: string | null;
  relative_humidity: string | null;
  distance_km: number;
}

/**
 * Queries nearest CWA weather station (O-A0001-001) to given coordinates.
 */
export const getNearestStationWeather = async (
  lat: number,
  lng: number,
): Promise<NearestStationWeatherRecord | null> =>
  withConnectionFallback(null, async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT s.station_id, s.station_name, s.county_name, s.town_name, s.obs_time,
             s.weather, s.precipitation, s.wind_speed, s.air_temperature, s.relative_humidity,
             (6371 * acos(
               LEAST(1, cos(radians(?)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(?)) +
               sin(radians(?)) * sin(radians(s.lat)))
             )) AS distance_km
      FROM cwa_station_weather s
      WHERE s.lat IS NOT NULL AND s.lng IS NOT NULL
        AND s.obs_time >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 6 HOUR)
      ORDER BY distance_km ASC
      LIMIT 1
      `,
      [lat, lng, lat],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      station_id: String(row.station_id),
      station_name: row.station_name ?? null,
      county_name: row.county_name ?? null,
      town_name: row.town_name ?? null,
      obs_time: String(row.obs_time),
      weather: row.weather ?? null,
      precipitation: row.precipitation ?? null,
      wind_speed: row.wind_speed ?? null,
      air_temperature: row.air_temperature ?? null,
      relative_humidity: row.relative_humidity ?? null,
      distance_km: Number(row.distance_km),
    };
  });

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
export const getNearestUvReading = async (
  lat: number,
  lng: number,
): Promise<(LatestUvReading & { distance_km: number }) | null> =>
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
    const row = rows[0];
    if (!row) return null;
    return {
      station_id: String(row.station_id),
      station_name: row.station_name ?? null,
      county_name: row.county_name ?? null,
      uv_index: Number(row.uv_index),
      distance_km: Number(row.distance_km),
    };
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
    // §3.3 — rendered on every /tools/uv hit; CWA only publishes a new observation
    // date once per day, so a 60s memo removes nearly all of these round-trips.
    return await memoizeQuery("latest_uv_readings_all", async () =>
      withConnection(async (conn) => {
        const [rows] = await conn.query<RowDataPacket[]>(
          `
        SELECT DISTINCT u.station_id, s.station_name, s.county_name, u.uv_index, u.obs_date
        FROM cwa_uv_index u
        LEFT JOIN cwa_station_weather s ON s.station_id = u.station_id
        WHERE u.obs_date = (SELECT MAX(obs_date) FROM cwa_uv_index)
          AND u.uv_index IS NOT NULL
        ORDER BY u.uv_index DESC
        `,
        );
        return (rows as RowDataPacket[]).map((r) => {
          let obsDateStr = "";
          if (r.obs_date instanceof Date) {
            obsDateStr = r.obs_date.toISOString().split("T")[0];
          } else if (r.obs_date) {
            obsDateStr = String(r.obs_date).split("T")[0];
          }
          const numUv =
            typeof r.uv_index === "number"
              ? r.uv_index
              : parseFloat(String(r.uv_index ?? ""));
          return {
            station_id: String(r.station_id ?? ""),
            station_name: r.station_name ? String(r.station_name) : null,
            county_name: r.county_name ? String(r.county_name) : null,
            uv_index: isNaN(numUv) ? 0 : numUv,
            obs_date: obsDateStr,
          };
        });
      }),
    );
  } catch (err) {
    console.error("Failed to list UV readings:", err);
    return [];
  }
};

// ---------------------------------------------------------------------------
// Active weather alerts (cwa_alerts)
// ---------------------------------------------------------------------------

export interface CwaAlertItem {
  id: number;
  dataset_id: string;
  event: string | null;
  headline: string | null;
  description: string | null;
  instruction: string | null;
  severity: string | null;
  urgency: string | null;
  certainty: string | null;
  /** Every affected area for this event, joined — CWA issues one bulletin per county. */
  area_desc: string | null;
  /** How many distinct areas that covers, so the widget can say 共 N 個地區. */
  area_count: number | null;
  effective: Date | null;
  expires: Date | null;
  web: string | null;
}

/**
 * Alerts still in force, most severe first.
 *
 * `cwa_alerts` has been written on every sync since it was added and read by
 * nothing — the weather widget reads `news_items` filled from CWA's much thinner
 * RSS feed instead, which is why severity, urgency and affected areas never
 * appeared anywhere on the site.
 *
 * "Still in force" prefers the alert's own `expires`. Only when CWA omits it does
 * the seven-day fallback apply, so a bulletin with no stated end cannot sit on
 * the page indefinitely.
 *
 * One row per (event, area) — the newest. alert_key hashes `effective` into the
 * identity, so re-issuing the same 大雨特報 for the same area writes a NEW row
 * each time, and every one of them stays "in force" until its own expiry passes.
 * That is why the block filled with near-identical rainfall warnings: CWA was
 * publishing six alerts in total while the widget displayed ten. Deduplicating
 * here rather than dropping the noisy dataset keeps 降雨特報 — the most
 * frequently issued warning in Taiwan — without letting one event occupy five of
 * the ten slots.
 */
export const listActiveCwaAlerts = async (
  limit = 10,
): Promise<CwaAlertItem[]> =>
  memoizeQuery(`cwa_active_alerts_${limit}`, async () =>
    withConnectionFallback([], async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `
        WITH tsunamis AS (
          SELECT
            id,
            'E-A0014-001' AS dataset_id,
            CONCAT('海嘯警報', IF(report_type IS NOT NULL AND report_type != '', CONCAT(' (', report_type, ')'), '')) AS event,
            report_type AS headline,
            report_content AS description,
            NULL AS instruction,
            'Extreme' AS severity,
            'Immediate' AS urgency,
            'Observed' AS certainty,
            '台灣沿岸及鄰近海域' AS area_desc,
            1 AS area_count,
            issue_time AS effective,
            end_time AS expires,
            web,
            synced_at
          FROM cwa_tsunamis
          WHERE
            (end_time IS NOT NULL AND end_time > UTC_TIMESTAMP())
            OR (end_time IS NULL AND issue_time >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR))
        ),
        township_hazards AS (
          SELECT
            MIN(id) AS id,
            'W-C0033-001' AS dataset_id,
            phenomena AS event,
            significance AS headline,
            CONCAT(phenomena, IF(significance IS NOT NULL, CONCAT('（', significance, '）'), '')) AS description,
            NULL AS instruction,
            'Severe' AS severity,
            'Immediate' AS urgency,
            'Observed' AS certainty,
            GROUP_CONCAT(DISTINCT location_name ORDER BY location_name SEPARATOR '、') AS area_desc,
            COUNT(DISTINCT location_name) AS area_count,
            MIN(start_time) AS effective,
            MAX(end_time) AS expires,
            'https://www.cwa.gov.tw' AS web,
            MAX(synced_at) AS synced_at
          FROM cwa_township_hazards
          WHERE
            (end_time IS NOT NULL AND end_time > UTC_TIMESTAMP())
            OR (end_time IS NULL AND start_time >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR))
          GROUP BY phenomena, significance
        ),
        active_general AS (
          SELECT * FROM cwa_alerts
          WHERE
            CASE
              WHEN expires IS NOT NULL THEN expires > UTC_TIMESTAMP()
              ELSE COALESCE(effective, synced_at) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)
            END
        ),
        areas AS (
          SELECT event,
                 GROUP_CONCAT(DISTINCT NULLIF(area_desc, '') ORDER BY area_desc SEPARATOR '、') AS area_list,
                 COUNT(DISTINCT NULLIF(area_desc, '')) AS area_count
          FROM active_general
          GROUP BY event
        ),
        ranked_general AS (
          SELECT a.*,
                 ROW_NUMBER() OVER (
                   PARTITION BY a.event
                   ORDER BY
                     FIELD(a.severity, 'Extreme', 'Severe', 'Moderate', 'Minor') = 0,
                     FIELD(a.severity, 'Extreme', 'Severe', 'Moderate', 'Minor'),
                     COALESCE(a.effective, a.synced_at) DESC,
                     a.id DESC
                 ) AS rn
          FROM active_general a
        ),
        combined AS (
          SELECT id, dataset_id, event, headline, description, instruction, severity, urgency, certainty, area_desc, area_count, effective, expires, web, synced_at
          FROM tsunamis
          UNION ALL
          SELECT id, dataset_id, event, headline, description, instruction, severity, urgency, certainty, area_desc, area_count, effective, expires, web, synced_at
          FROM township_hazards
          UNION ALL
          SELECT r.id, r.dataset_id, r.event, r.headline, r.description, r.instruction,
                 r.severity, r.urgency, r.certainty,
                 COALESCE(areas.area_list, r.area_desc) AS area_desc,
                 areas.area_count,
                 r.effective, r.expires, r.web,
                 r.synced_at
          FROM ranked_general r
          INNER JOIN areas ON areas.event <=> r.event
          WHERE r.rn = 1
        )
        SELECT *
        FROM combined
        ORDER BY
          -- CAP severity, most urgent first; anything unrecognised sorts last.
          FIELD(severity, 'Extreme', 'Severe', 'Moderate', 'Minor') = 0,
          FIELD(severity, 'Extreme', 'Severe', 'Moderate', 'Minor'),
          COALESCE(effective, synced_at) DESC
        LIMIT ?
        `,
        [limit],
      );
      return rows as unknown as CwaAlertItem[];
    }),
  );

// ---------------------------------------------------------------------------
// Nearest rainfall station (cwa_rainfall)
// ---------------------------------------------------------------------------

export interface NearestRainfallReading {
  station_id: string;
  station_name: string | null;
  county_name: string | null;
  town_name: string | null;
  obs_time: Date;
  precip_now: string | null;
  precip_10min: string | null;
  precip_1hr: string | null;
  precip_3hr: string | null;
  precip_6hr: string | null;
  precip_12hr: string | null;
  precip_24hr: string | null;
  precip_2days: string | null;
  precip_3days: string | null;
  distance_km: number;
}

/**
 * The closest rainfall station's latest observation.
 *
 * cwa_rainfall holds 1,331 stations refreshed every 30 minutes, with the full
 * accumulation ladder from the last ten minutes out to three days — and it has
 * been read by nothing since it was added. The table even carries
 * idx_cwa_rainfall_geo (lat, lng), an index that exists for exactly this query,
 * which was never written.
 *
 * Scoped to observations from the last three hours so a station that stopped
 * reporting shows as absent rather than silently serving yesterday's rain as if
 * it were current.
 */
export const getNearestRainfallReading = async (
  lat: number,
  lng: number,
): Promise<NearestRainfallReading | null> =>
  withConnectionFallback(null, async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT r.station_id, r.station_name, r.county_name, r.town_name, r.obs_time,
             r.precip_now, r.precip_10min, r.precip_1hr, r.precip_3hr, r.precip_6hr,
             r.precip_12hr, r.precip_24hr, r.precip_2days, r.precip_3days,
        (6371 * acos(
          LEAST(1, cos(radians(?)) * cos(radians(r.lat)) * cos(radians(r.lng) - radians(?)) +
          sin(radians(?)) * sin(radians(r.lat)))
        )) AS distance_km
      FROM cwa_rainfall r
      INNER JOIN (
        SELECT station_id, MAX(obs_time) AS max_obs
        FROM cwa_rainfall
        WHERE obs_time >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 HOUR)
        GROUP BY station_id
      ) latest ON latest.station_id = r.station_id AND latest.max_obs = r.obs_time
      WHERE r.lat IS NOT NULL AND r.lng IS NOT NULL
      ORDER BY distance_km ASC
      LIMIT 1
      `,
      [lat, lng, lat],
    );
    return (rows[0] as unknown as NearestRainfallReading) ?? null;
  });

export interface TopRainfallStation {
  station_id: string;
  station_name: string | null;
  county_name: string | null;
  town_name: string | null;
  precip_now: string | null;
  precip_1hr: string | null;
  precip_24hr: string | null;
  obs_time: Date;
}

/**
 * Top stations in Taiwan with highest 24hr rainfall accumulation today.
 */
export const listTopRainfallStations = async (
  limit = 5,
): Promise<TopRainfallStation[]> =>
  memoizeQuery(`cwa_top_rainfall_${limit}`, async () =>
    withConnectionFallback([], async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `
        SELECT r.station_id, r.station_name, r.county_name, r.town_name,
               r.precip_now, r.precip_1hr, r.precip_24hr, r.obs_time
        FROM cwa_rainfall r
        INNER JOIN (
          SELECT station_id, MAX(obs_time) AS max_obs
          FROM cwa_rainfall
          WHERE obs_time >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 HOUR)
          GROUP BY station_id
        ) latest ON latest.station_id = r.station_id AND latest.max_obs = r.obs_time
        WHERE r.precip_24hr IS NOT NULL AND CAST(r.precip_24hr AS DECIMAL(10,2)) > 0
        ORDER BY CAST(r.precip_24hr AS DECIMAL(10,2)) DESC, CAST(r.precip_1hr AS DECIMAL(10,2)) DESC
        LIMIT ?
        `,
        [limit],
      );
      return rows as unknown as TopRainfallStation[];
    }),
  );

export interface NearestRainfallOverview {
  realtime: NearestRainfallReading | null;
  accumulation: RainfallAccumulation | null;
}

/**
 * Combined helper returning nearest real-time rain gauge observation
 * and nearest staffed station historical accumulation statistics (C-B0025-001).
 */
export const getNearestRainfallOverview = async (
  lat: number,
  lng: number,
): Promise<NearestRainfallOverview> => {
  const [realtime, accumulation] = await Promise.all([
    getNearestRainfallReading(lat, lng),
    getNearestRainfallAccumulation(lat, lng),
  ]);
  return { realtime, accumulation };
};

// ---------------------------------------------------------------------------
// Daily rainfall history (cwa_daily_rainfall)
// ---------------------------------------------------------------------------

export const upsertCwaDailyRainfall = (
  records: {
    stationId: string;
    stationName: string | null;
    obsDate: string;
    precipitation: number | null;
  }[],
) =>
  chunkedUpsert(
    records,
    `INSERT INTO cwa_daily_rainfall
       (station_id, station_name, obs_date, precipitation, synced_at, created_at, updated_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       station_name = VALUES(station_name),
       precipitation = VALUES(precipitation),
       synced_at = VALUES(synced_at),
       updated_at = VALUES(updated_at)`,
    (r, now) => [
      r.stationId,
      r.stationName,
      r.obsDate,
      r.precipitation,
      now,
      now,
      now,
    ],
  );

export interface RainfallAccumulation {
  station_id: string;
  station_name: string | null;
  month_mm: number | null;
  year_mm: number | null;
  wet_days_30: number | null;
  distance_km: number;
}

/**
 * Month-to-date and year-to-date rainfall at the station nearest a point.
 *
 * Pairs with getNearestRainfallReading: that one answers "is it raining right
 * now", this one answers "has this been a wet month". The two datasets come
 * from different CWA station networks — 1,331 automatic gauges versus 38 staffed
 * stations — so this deliberately resolves its own nearest station rather than
 * reusing the other's, and reports the distance so a reader can see when the
 * nearest staffed station is far away.
 *
 * Coordinates come from cwa_station_weather, which is the only table carrying
 * them for these station IDs.
 */
export const getNearestRainfallAccumulation = async (
  lat: number,
  lng: number,
): Promise<RainfallAccumulation | null> =>
  withConnectionFallback(null, async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT d.station_id,
             MAX(d.station_name) AS station_name,
             SUM(CASE WHEN d.obs_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN d.precipitation END) AS month_mm,
             SUM(CASE WHEN d.obs_date >= MAKEDATE(YEAR(CURDATE()), 1) THEN d.precipitation END) AS year_mm,
             SUM(CASE WHEN d.obs_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND d.precipitation > 0 THEN 1 END) AS wet_days_30,
             MIN(s.distance_km) AS distance_km
      FROM cwa_daily_rainfall d
      INNER JOIN (
        SELECT station_id,
               MIN(6371 * acos(
                 LEAST(1, cos(radians(?)) * cos(radians(lat)) * cos(radians(lng) - radians(?)) +
                 sin(radians(?)) * sin(radians(lat)))
               )) AS distance_km
        FROM cwa_station_weather
        WHERE lat IS NOT NULL AND lng IS NOT NULL
        GROUP BY station_id
      ) s ON s.station_id = d.station_id
      GROUP BY d.station_id
      ORDER BY distance_km ASC
      LIMIT 1
      `,
      [lat, lng, lat],
    );
    return (rows[0] as unknown as RainfallAccumulation) ?? null;
  });
