export interface YouBikeStation {
  id?: number;
  cityCode: string;
  stationNo: string;
  nameTw: string;
  districtTw: string;
  addressTw: string;
  lat: number;
  lng: number;
  totalSpaces: number;
  availableBikes: number;
  availableEbikes: number;
  emptySpaces: number;
  isActive: number;
  updatedAtSource: string;
  distanceKm?: number;
}

/**
 * The part of a station that (almost) never changes — name, district, address, coordinates, dock
 * count. The TDX sync keeps these in `youbike_stations` and only re-reads them from TDX's Station
 * endpoint about once a day (see tdxSyncCore.ts), so every 15-minute round needs just Availability.
 */
export type YouBikeStaticStation = Pick<
  YouBikeStation,
  "stationNo" | "nameTw" | "districtTw" | "addressTw" | "lat" | "lng" | "totalSpaces"
>;

/** What one TDX round spent — logged with the summary so the daily request budget can be checked from the log alone. */
export interface YouBikeTdxRoundStats {
  /** Bike/Availability requests started (retries inside tdxGetJsonWithRetry are not counted). */
  availabilityCalls: number;
  /** Bike/Station requests started: scheduled 24 h refreshes, first loads, and unknown-StationID refreshes. */
  stationCalls: number;
  /** Cities whose static data was (re)loaded from TDX this round. */
  refreshedCities: string[];
  /** Cities with no stored stations that did not fit under the per-round Station cap; they load on a later round. */
  deferredCities: string[];
}

export interface YouBikeSyncSummary {
  ok: boolean;
  totalUpserted: number;
  cities: Record<string, number>;
  errors: string[];
  /** "direct" = the every-5-minute open-data job; "tdx" / "direct_fallback" = the 15-minute TDX job. */
  source?: "tdx" | "direct" | "direct_fallback";
  /** Present on the TDX job only. */
  tdx?: YouBikeTdxRoundStats;
}
