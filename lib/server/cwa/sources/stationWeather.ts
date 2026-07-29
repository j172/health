import { fetchCwaDataset } from "@/lib/server/cwa/client";
import type { CwaStationWeatherRecord } from "@/lib/server/cwa/queries";

// Station weather observations — O-A0001-001 and O-A0003-001 share this
// shape (O-A0003 additionally reports visibility/sunshine), disambiguated
// by dataset_id in cwa_station_weather.
const RESOURCE_IDS = ["O-A0001-001", "O-A0003-001"];

interface RawCoordinate {
  CoordinateName?: string;
  StationLatitude?: string;
  StationLongitude?: string;
}

interface RawStation {
  StationName?: string;
  StationId?: string;
  ObsTime?: { DateTime?: string };
  GeoInfo?: {
    Coordinates?: RawCoordinate[];
    StationAltitude?: string;
    CountyName?: string;
    TownName?: string;
  };
  WeatherElement?: {
    Weather?: string;
    Now?: { Precipitation?: string };
    WindDirection?: string;
    WindSpeed?: string;
    AirTemperature?: string;
    RelativeHumidity?: string;
    AirPressure?: string;
    UVIndex?: string;
    GustInfo?: { PeakGustSpeed?: string };
    VisibilityDescription?: string;
    SunshineDuration?: string;
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

export async function fetchCwaStationWeather(): Promise<CwaStationWeatherRecord[]> {
  const rows: CwaStationWeatherRecord[] = [];

  for (const resourceId of RESOURCE_IDS) {
    const records = await fetchCwaDataset<RawRecords>(resourceId);

    for (const station of records.Station ?? []) {
      if (!station.StationId || !station.ObsTime?.DateTime) continue;
      const wgs84 = station.GeoInfo?.Coordinates?.find((c) => c.CoordinateName === "WGS84");
      const element = station.WeatherElement ?? {};

      rows.push({
        datasetId: resourceId,
        stationId: station.StationId,
        stationName: station.StationName ?? null,
        countyName: station.GeoInfo?.CountyName ?? null,
        townName: station.GeoInfo?.TownName ?? null,
        lat: toNumberOrNull(wgs84?.StationLatitude),
        lng: toNumberOrNull(wgs84?.StationLongitude),
        altitude: toNumberOrNull(station.GeoInfo?.StationAltitude),
        obsTime: station.ObsTime.DateTime,
        weather: element.Weather ?? null,
        precipitation: element.Now?.Precipitation ?? null,
        windDirection: element.WindDirection ?? null,
        windSpeed: element.WindSpeed ?? null,
        airTemperature: element.AirTemperature ?? null,
        relativeHumidity: element.RelativeHumidity ?? null,
        airPressure: element.AirPressure ?? null,
        uvIndex: element.UVIndex ?? null,
        peakGustSpeed: element.GustInfo?.PeakGustSpeed ?? null,
        visibilityDescription: element.VisibilityDescription ?? null,
        sunshineDuration: element.SunshineDuration ?? null,
      });
    }
  }

  return rows;
}
