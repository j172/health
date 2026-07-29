export type EarthquakeSource = "usgs" | "emsc" | "hko";

export interface IncomingEarthquake {
  source: EarthquakeSource;
  sourceEventId: string;
  /** MySQL DATETIME string (UTC). */
  eventTime: string;
  magnitude: number | null;
  magnitudeType: string | null;
  depthKm: number | null;
  lat: number;
  lng: number;
  place: string | null;
  placeZh: string | null;
  tsunamiWarning: boolean;
  url: string | null;
}

export const toMysqlDatetimeUtc = (date: Date): string => date.toISOString().slice(0, 19).replace("T", " ");
