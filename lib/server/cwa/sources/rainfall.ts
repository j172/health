import { fetchCwaDataset } from "@/lib/server/cwa/client";
import type { CwaRainfallRecord } from "@/lib/server/cwa/queries";

// 雨量站觀測資料 (rain-gauge station observations, multiple accumulation windows)
const RESOURCE_ID = "O-A0002-001";

interface RawCoordinate {
  CoordinateName?: string;
  StationLatitude?: string;
  StationLongitude?: string;
}

interface RawPrecip {
  Precipitation?: string;
}

interface RawStation {
  StationName?: string;
  StationId?: string;
  ObsTime?: { DateTime?: string };
  GeoInfo?: { Coordinates?: RawCoordinate[]; CountyName?: string; TownName?: string };
  RainfallElement?: {
    Now?: RawPrecip;
    Past10Min?: RawPrecip;
    Past1hr?: RawPrecip;
    Past3hr?: RawPrecip;
    Past6Hr?: RawPrecip;
    Past12hr?: RawPrecip;
    Past24hr?: RawPrecip;
    Past2days?: RawPrecip;
    Past3days?: RawPrecip;
  };
}

interface RawRecords {
  Station: RawStation[];
}

const toNumberOrNull = (value: string | undefined): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export async function fetchCwaRainfall(): Promise<CwaRainfallRecord[]> {
  const records = await fetchCwaDataset<RawRecords>(RESOURCE_ID);

  return (records.Station ?? [])
    .filter((s) => s.StationId && s.ObsTime?.DateTime)
    .map((station) => {
      const wgs84 = station.GeoInfo?.Coordinates?.find((c) => c.CoordinateName === "WGS84");
      const el = station.RainfallElement ?? {};

      return {
        stationId: station.StationId as string,
        stationName: station.StationName ?? null,
        countyName: station.GeoInfo?.CountyName ?? null,
        townName: station.GeoInfo?.TownName ?? null,
        lat: toNumberOrNull(wgs84?.StationLatitude),
        lng: toNumberOrNull(wgs84?.StationLongitude),
        obsTime: station.ObsTime?.DateTime as string,
        precipNow: el.Now?.Precipitation ?? null,
        precip10min: el.Past10Min?.Precipitation ?? null,
        precip1hr: el.Past1hr?.Precipitation ?? null,
        precip3hr: el.Past3hr?.Precipitation ?? null,
        precip6hr: el.Past6Hr?.Precipitation ?? null,
        precip12hr: el.Past12hr?.Precipitation ?? null,
        precip24hr: el.Past24hr?.Precipitation ?? null,
        precip2days: el.Past2days?.Precipitation ?? null,
        precip3days: el.Past3days?.Precipitation ?? null,
      };
    });
}
