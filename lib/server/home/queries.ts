/**
 * Section fetchers for the homepage status bar's single aggregation API
 * (issue #472). Each function here adapts one of this repo's existing,
 * already-DB-backed query functions into the small JSON shape the status bar
 * actually renders — the same "thin adapter over a shared query function"
 * convention `app/api/aqi/nearest/route.ts` / `app/api/uv/nearest/route.ts` /
 * `app/api/weather-nearby/route.ts` already use, just centralized here so
 * `app/api/home-status/route.ts` can wire all 5 sections into one
 * `aggregateHomeStatusSections` call instead of each living in its own route.
 *
 * None of these functions are location-dependent except weather/aqi/uv —
 * earthquakes and alerts are nationwide and intentionally take no lat/lng.
 */

import { getNearestStationWeather, getNearestUvReading, listActiveCwaAlerts, type CwaAlertItem } from "@/lib/server/cwa/queries";
import { getNearestAqiReading } from "@/lib/server/aqi/queries";
import { getAqiStatusAndColor } from "@/lib/server/aqi/status";
import { getUvCategory } from "@/lib/server/cwa/uvStatus";
import { getTieredEarthquakes, type SignificantEarthquake } from "@/lib/server/earthquakes/queries";

const round1 = (value: number): number => Math.round(value * 10) / 10;

export interface HomeStatusWeather {
  stationName: string | null;
  countyName: string | null;
  townName: string | null;
  obsTime: string;
  weather: string | null;
  precipitation: string | null;
  airTemperature: string | null;
  distanceKm: number;
}

/** Nearest CWA station's current observation — same source as LocalWeatherSvgWidget's `/api/weather-nearby`. */
export async function fetchHomeStatusWeather(lat: number, lng: number): Promise<HomeStatusWeather | null> {
  const r = await getNearestStationWeather(lat, lng);
  if (!r) return null;
  return {
    stationName: r.station_name,
    countyName: r.county_name,
    townName: r.town_name,
    obsTime: r.obs_time,
    weather: r.weather,
    precipitation: r.precipitation,
    airTemperature: r.air_temperature,
    distanceKm: round1(r.distance_km),
  };
}

export interface HomeStatusAqi {
  siteName: string;
  county: string;
  aqiValue: number | null;
  aqiStatus: string;
  aqiColor: string;
  pm25: number | null;
  distanceKm: number;
}

/** Nearest AQI monitoring site — same source as AqiSidebarWidget's `/api/aqi/nearest`. */
export async function fetchHomeStatusAqi(lat: number, lng: number): Promise<HomeStatusAqi | null> {
  const r = await getNearestAqiReading(lat, lng);
  if (!r) return null;
  const { status, color } = getAqiStatusAndColor(r.aqi_value);
  return {
    siteName: r.site_name,
    county: r.county,
    aqiValue: r.aqi_value,
    aqiStatus: r.aqi_status || status,
    aqiColor: color,
    pm25: r.pm25,
    distanceKm: round1(r.distance_km),
  };
}

export interface HomeStatusUv {
  stationName: string | null;
  county: string | null;
  uvIndex: number;
  uvLabel: string;
  uvColor: string;
  distanceKm: number;
}

/** Nearest UV station's latest reading — same source as UvSidebarWidget's `/api/uv/nearest`. */
export async function fetchHomeStatusUv(lat: number, lng: number): Promise<HomeStatusUv | null> {
  const r = await getNearestUvReading(lat, lng);
  if (!r) return null;
  const { label, color } = getUvCategory(r.uv_index);
  return {
    stationName: r.station_name,
    county: r.county_name,
    uvIndex: r.uv_index,
    uvLabel: label,
    uvColor: color,
    distanceKm: round1(r.distance_km),
  };
}

/** Most recent significant earthquakes (CWA M4.0+ / worldwide M6.0+ tiering), nationwide — not location-dependent. */
export async function fetchHomeStatusEarthquakes(limit = 3): Promise<SignificantEarthquake[]> {
  return getTieredEarthquakes(168, limit);
}

/** Alerts currently in force (CAP severity order), nationwide — not location-dependent. */
export async function fetchHomeStatusAlerts(limit = 5): Promise<CwaAlertItem[]> {
  return listActiveCwaAlerts(limit);
}
