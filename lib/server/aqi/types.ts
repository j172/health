/** Shape returned by /api/aqi and /api/aqi/nearest — shared so the two API
 * routes and the client-side AqiContent component don't import a type across
 * route-file boundaries. */
export interface AqiSite {
  siteId: string;
  siteName: string;
  county: string;
  aqiValue: number | null;
  aqiStatus: string;
  aqiColor: string;
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  recordedAt: string | null;
}
