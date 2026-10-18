import { cleanName, formatTime } from "./format";
import type { YouBikeStaticStation, YouBikeStation } from "./types";

/**
 * Pure mapping from TDX's Bike endpoints to `YouBikeStation` rows — no network, no database.
 *
 * TDX splits a station across two endpoints:
 *   Bike/Station      name, address, coordinates, dock capacity — static, changes a few times a year
 *   Bike/Availability bikes / empty docks / service status — changes every minute
 * Pulling both for every city every round doubled the request count for no new information, so the
 * sync (tdxSyncCore.ts) fetches Availability alone and takes the static half from the database,
 * going back to Bike/Station only when it has to. Two builders:
 *   - buildStationsFromTdx: both lists in hand (first load, daily refresh, unknown StationID);
 *   - mergeAvailabilityWithStatic: Availability plus the stored static rows (every other round).
 */

export interface TdxStationItem {
  StationUID: string;
  StationID: string;
  StationName: { Zh_tw: string; En?: string };
  StationPosition: { PositionLon: number; PositionLat: number };
  StationAddress?: { Zh_tw: string; En?: string };
  BikesCapacity?: number;
}

export interface TdxAvailabilityItem {
  StationUID: string;
  StationID: string;
  ServiceStatus: number;
  AvailableRentBikes: number;
  AvailableReturnBikes: number;
  AvailableRentBikesDetail?: {
    GeneralBikes?: number;
    ElectricBikes?: number;
  };
  SrcUpdateTime?: string;
  UpdateTime?: string;
}

/** The live half of a station, derived the same way whichever builder runs. */
function liveFields(avail: TdxAvailabilityItem | undefined) {
  const availableBikes = avail?.AvailableRentBikes ?? 0;
  const availableEbikes = avail?.AvailableRentBikesDetail?.ElectricBikes ?? 0;
  const emptySpaces = avail?.AvailableReturnBikes ?? 0;
  return {
    availableBikes,
    availableEbikes,
    emptySpaces,
    isActive: avail?.ServiceStatus === 1 ? 1 : 0,
    updatedAtSource: formatTime(avail?.SrcUpdateTime || avail?.UpdateTime),
  };
}

/** The StationNo the database stores a TDX station under: the StationID, else the UID. */
export const tdxStationNo = (item: { StationID?: string; StationUID?: string }): string =>
  item.StationID || item.StationUID || "";

/**
 * Both lists in hand: one row per Bike/Station entry, live numbers joined from Availability by UID or
 * ID. A station TDX lists but has no Availability for is written as inactive with zero counts, and one
 * without coordinates is skipped — exactly what the sync always did with a full fetch.
 */
export function buildStationsFromTdx(
  cityCode: string,
  stationList: TdxStationItem[],
  availability: TdxAvailabilityItem[],
): YouBikeStation[] {
  const availabilityMap = new Map<string, TdxAvailabilityItem>();
  for (const item of availability) {
    if (item.StationUID) availabilityMap.set(item.StationUID, item);
    if (item.StationID) availabilityMap.set(item.StationID, item);
  }

  const stations: YouBikeStation[] = [];
  for (const st of stationList) {
    const avail = availabilityMap.get(st.StationUID) || availabilityMap.get(st.StationID);
    const lat = st.StationPosition?.PositionLat || 0;
    const lng = st.StationPosition?.PositionLon || 0;
    if (!lat || !lng) continue;

    const live = liveFields(avail);
    stations.push({
      cityCode,
      stationNo: st.StationID || st.StationUID,
      nameTw: cleanName(st.StationName?.Zh_tw),
      districtTw: "",
      addressTw: st.StationAddress?.Zh_tw || "",
      lat,
      lng,
      totalSpaces: st.BikesCapacity ?? live.availableBikes + live.emptySpaces,
      ...live,
    });
  }
  return stations;
}

/**
 * Availability only, static half from the stored rows. An Availability entry whose StationID is not
 * among the stored rows cannot be written (there is no name or coordinate to give it): it is
 * returned in `unknownStationNos` so the caller can go and fetch Bike/Station for this city.
 * Stored stations that Availability no longer mentions are left untouched.
 */
export function mergeAvailabilityWithStatic(
  cityCode: string,
  availability: TdxAvailabilityItem[],
  staticRows: YouBikeStaticStation[],
): { stations: YouBikeStation[]; unknownStationNos: string[] } {
  const byStationNo = new Map<string, YouBikeStaticStation>();
  for (const row of staticRows) byStationNo.set(row.stationNo, row);

  const stations: YouBikeStation[] = [];
  const unknownStationNos: string[] = [];
  for (const item of availability) {
    const stationNo = tdxStationNo(item);
    if (!stationNo) continue;
    const known = byStationNo.get(stationNo) ?? (item.StationUID ? byStationNo.get(item.StationUID) : undefined);
    if (!known) {
      unknownStationNos.push(stationNo);
      continue;
    }
    const live = liveFields(item);
    stations.push({
      cityCode,
      stationNo: known.stationNo,
      nameTw: known.nameTw,
      districtTw: known.districtTw,
      addressTw: known.addressTw,
      lat: known.lat,
      lng: known.lng,
      // A stored 0 means "capacity was never known"; the live numbers are the best estimate then.
      totalSpaces: known.totalSpaces > 0 ? known.totalSpaces : live.availableBikes + live.emptySpaces,
      ...live,
    });
  }
  return { stations, unknownStationNos };
}
