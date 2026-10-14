import "server-only";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { tdxGetJsonWithRetry } from "@/lib/server/tdx/getJsonWithRetry";
import { getTdxToken } from "@/lib/server/tdx/auth";
import { toCoordinate } from "@/lib/server/db/coords";
import { TDX_BUS_CITIES } from "@/lib/server/transit/tdxBusClient";

/**
 * TDX 基礎服務「停車資訊」資料來源 (issue #469, parent #438 §P T3) — 全台停車場
 * （路外）與路邊停車（路內）的「特殊車位」（孕婦及親子專用、身心障礙汽車、身心
 * 障礙機車、復康巴士）即時剩餘車位數，只保留這 4 種車位類型，不同步其他車位
 * 類型（例如一般車位、婦女車位、電動車充電車位等）。
 *
 * API 位置確認方式與 #467/#468 相同：先用
 * `https://tdx.transportdata.tw/webapi/serviceCategory/ForSwagger` 找到「停車
 * 資訊」群組（基礎服務 groupId `945f57da-f29d-4dfd-94ec-c35d9f62be7d`），再用
 * `https://tdx.transportdata.tw/webapi/File/Swagger/V3/{groupId}` 取得真實
 * swagger 確認路徑與欄位：base 同樣是 `https://tdx.transportdata.tw/api/basic`，
 * 路外停車場用 `/v1/Parking/OffStreet/CarPark/City/{City}`（靜態：名稱、地址、
 * 座標 `CarParkPosition.PositionLat/PositionLon`）配對
 * `/v1/Parking/OffStreet/ParkingAvailability/City/{City}`（即時：
 * `Availabilities[].{SpaceType,NumberOfSpaces,AvailableSpaces}`，用
 * `CarParkID` 對應）；路邊停車用
 * `/v1/Parking/OnStreet/ParkingSegment/City/{City}`（靜態：路段名稱、座標
 * `ParkingSegmentPosition.PositionLat/PositionLon`）配對
 * `/v1/Parking/OnStreet/ParkingSegmentAvailability/City/{City}`（即時：
 * `Availabilities[].{SpaceType,NumberOfSpaces,AvailableSpaces}`，用
 * `ParkingSegmentID` 對應）。4 個端點都是 v1。
 *
 * 兩種 Wrapper（`ParkingWrapper`/`ParkingLiveWrapper`）的陣列欄位都確認是
 * `Items`（swagger 的 `title` 是 "XxxList"，但實際屬性名稱是 `Items`，不是
 * `CarParkList`/`ParkingAvailabilityList` 之類——與 tdxAudibleSignals.ts 的
 * `Apses` 包裝不同，這裡沿用同一套「優先判斷是否已經是陣列，否則退回包裝屬性」
 * 的防禦寫法，差別只是包裝屬性名稱換成 `Items`）。
 *
 * `SpaceType` 數值對照表（swagger enum 描述）：7=孕婦及親子專用車位、
 * 8=婦女車位、9=身心障礙汽車車位、10=身心障礙機車車位、13=復康巴士。本票只
 * 保留 7/9/10/13（刻意不含 8 婦女車位——issue 明確只列 4 種）。
 *
 * City enum 同樣像 #467/#468 一樣「每個端點各自列出的 enum 不完整，但實際資料
 * 涵蓋全國」——沿用 `lib/server/transit/tdxBusClient.ts` 的 `TDX_BUS_CITIES`
 * （全 22 縣市），每個縣市、每種（路外／路邊）各自呼叫、各自隔離錯誤。
 *
 * `AvailableSpaces`/`NumberOfSpaces` 的 swagger 描述：`AvailableSpaces` 為
 * -1 時代表「未提供即時資料／僅現場顯示」，不是「剩餘 0」——這裡遇到 -1 時仍
 * 保留該筆資料（位置本身仍有參考價值），但 `serviceItem` 顯示文字會寫「剩餘數
 * 未提供」而不是「剩餘 -1」，`extra.availableSpaces` 也存 `null` 而非 -1，避免
 * 任何下游把 -1 當成數字計算。
 */

const TARGET_SPACE_TYPES: Record<number, string> = {
  7: "孕婦及親子專用車位",
  9: "身心障礙汽車車位",
  10: "身心障礙機車車位",
  13: "復康巴士",
};

interface TdxPointType {
  PositionLat?: number | string;
  PositionLon?: number | string;
}

interface TdxCarPark {
  CarParkID?: string;
  CarParkName?: string;
  Address?: string;
  City?: string;
  TownName?: string;
  CarParkPosition?: TdxPointType;
}

interface TdxParkingSegment {
  ParkingSegmentID?: string;
  ParkingSegmentName?: string;
  RoadSection?: string;
  City?: string;
  TownName?: string;
  ParkingSegmentPosition?: TdxPointType;
}

interface TdxAvailabilityByType {
  SpaceType?: number;
  NumberOfSpaces?: number;
  AvailableSpaces?: number;
}

interface TdxParkingAvailability {
  CarParkID?: string;
  Availabilities?: TdxAvailabilityByType[];
}

interface TdxCurbSegmentAvailability {
  ParkingSegmentID?: string;
  Availabilities?: TdxAvailabilityByType[];
}

interface TdxItemsWrapper<T> {
  Items?: T[];
}

const basicUrl = (path: string): string => `https://tdx.transportdata.tw/api/basic${path}?%24format=JSON`;

const offStreetCarParkUrl = (tdxCity: string): string =>
  basicUrl(`/v1/Parking/OffStreet/CarPark/City/${tdxCity}`);
const offStreetAvailabilityUrl = (tdxCity: string): string =>
  basicUrl(`/v1/Parking/OffStreet/ParkingAvailability/City/${tdxCity}`);
const onStreetSegmentUrl = (tdxCity: string): string =>
  basicUrl(`/v1/Parking/OnStreet/ParkingSegment/City/${tdxCity}`);
const onStreetAvailabilityUrl = (tdxCity: string): string =>
  basicUrl(`/v1/Parking/OnStreet/ParkingSegmentAvailability/City/${tdxCity}`);

/** Unwraps a TDX "Wrapper" response that may arrive as a bare array or as `{ Items: [...] }`. */
function unwrapItems<T>(data: T[] | TdxItemsWrapper<T> | undefined): T[] {
  if (Array.isArray(data)) return data;
  return data?.Items ?? [];
}

/** "剩餘 3／共 5 格" or, when TDX reports -1 (未提供即時資料), "剩餘數未提供（共 5 格）". */
function buildServiceItemText(label: string, available: number | undefined, total: number | undefined): string {
  const totalText = typeof total === "number" && total >= 0 ? `共 ${total} 格` : "總數未提供";
  if (typeof available !== "number" || available < 0) {
    return `${label}（剩餘數未提供・${totalText}）`;
  }
  return `${label}（剩餘 ${available}／${totalText}）`;
}

async function fetchJsonForCity<T>(url: string, token: string): Promise<T | null> {
  const res = await tdxGetJsonWithRetry<T>(url, token);
  if (res.status !== 200) {
    throw new Error(`TDX parking request ${url} returned status ${res.status}`);
  }
  return res.data;
}

/**
 * One city's off-street (路外停車場) special-space records: joins the static
 * `CarPark` list with the live `ParkingAvailability` list by `CarParkID`, then
 * emits one `FacilityRecord` per (car park, target SpaceType) pair found in
 * that car park's `Availabilities`. A car park with no target-type spaces (the
 * overwhelming majority — most car parks have none of these 4 types) simply
 * contributes zero records.
 */
export async function fetchCityOffStreetParking(cityCode: string): Promise<FacilityRecord[]> {
  const cityConfig = TDX_BUS_CITIES[cityCode];
  if (!cityConfig) return [];

  const token = await getTdxToken();
  if (!token) return [];

  const [carParksRaw, availabilityRaw] = await Promise.all([
    fetchJsonForCity<TdxCarPark[] | TdxItemsWrapper<TdxCarPark>>(offStreetCarParkUrl(cityConfig.tdxName), token),
    fetchJsonForCity<TdxParkingAvailability[] | TdxItemsWrapper<TdxParkingAvailability>>(
      offStreetAvailabilityUrl(cityConfig.tdxName),
      token,
    ),
  ]);

  const carParks = unwrapItems(carParksRaw ?? undefined);
  const availabilityById = new Map<string, TdxParkingAvailability>();
  for (const item of unwrapItems(availabilityRaw ?? undefined)) {
    if (item.CarParkID) availabilityById.set(item.CarParkID, item);
  }

  const records: FacilityRecord[] = [];
  for (const carPark of carParks) {
    if (!carPark.CarParkID) continue;
    const availability = availabilityById.get(carPark.CarParkID);
    if (!availability?.Availabilities) continue;

    const lat = toCoordinate(carPark.CarParkPosition?.PositionLat);
    const lng = toCoordinate(carPark.CarParkPosition?.PositionLon);
    const name = carPark.CarParkName || carPark.CarParkID;

    for (const slot of availability.Availabilities) {
      const label = typeof slot.SpaceType === "number" ? TARGET_SPACE_TYPES[slot.SpaceType] : undefined;
      if (!label) continue;

      records.push({
        facilityType: "accessible_parking",
        sourceKey: "tdx_parking_offstreet",
        sourceId: `${carPark.CarParkID}|${slot.SpaceType}`.slice(0, 100),
        name: `${name} ${label}`,
        address: carPark.Address || `${carPark.City || ""}${carPark.TownName || ""}` || null,
        phone: null,
        lat,
        lng,
        serviceItem: buildServiceItemText(label, slot.AvailableSpaces, slot.NumberOfSpaces),
        serviceTime: null,
        dataOrg: `${cityConfig.label}政府`,
        extra: {
          parkingKind: "offstreet",
          carParkId: carPark.CarParkID,
          spaceType: slot.SpaceType,
          spaceTypeLabel: label,
          totalSpaces: typeof slot.NumberOfSpaces === "number" ? slot.NumberOfSpaces : null,
          availableSpaces:
            typeof slot.AvailableSpaces === "number" && slot.AvailableSpaces >= 0 ? slot.AvailableSpaces : null,
        },
      });
    }
  }
  return records;
}

/** Same join/filter/emit shape as `fetchCityOffStreetParking`, for 路邊停車 (on-street curb) segments, keyed by `ParkingSegmentID`. */
export async function fetchCityOnStreetParking(cityCode: string): Promise<FacilityRecord[]> {
  const cityConfig = TDX_BUS_CITIES[cityCode];
  if (!cityConfig) return [];

  const token = await getTdxToken();
  if (!token) return [];

  const [segmentsRaw, availabilityRaw] = await Promise.all([
    fetchJsonForCity<TdxParkingSegment[] | TdxItemsWrapper<TdxParkingSegment>>(
      onStreetSegmentUrl(cityConfig.tdxName),
      token,
    ),
    fetchJsonForCity<TdxCurbSegmentAvailability[] | TdxItemsWrapper<TdxCurbSegmentAvailability>>(
      onStreetAvailabilityUrl(cityConfig.tdxName),
      token,
    ),
  ]);

  const segments = unwrapItems(segmentsRaw ?? undefined);
  const availabilityById = new Map<string, TdxCurbSegmentAvailability>();
  for (const item of unwrapItems(availabilityRaw ?? undefined)) {
    if (item.ParkingSegmentID) availabilityById.set(item.ParkingSegmentID, item);
  }

  const records: FacilityRecord[] = [];
  for (const segment of segments) {
    if (!segment.ParkingSegmentID) continue;
    const availability = availabilityById.get(segment.ParkingSegmentID);
    if (!availability?.Availabilities) continue;

    const lat = toCoordinate(segment.ParkingSegmentPosition?.PositionLat);
    const lng = toCoordinate(segment.ParkingSegmentPosition?.PositionLon);
    const name = segment.ParkingSegmentName || segment.RoadSection || segment.ParkingSegmentID;

    for (const slot of availability.Availabilities) {
      const label = typeof slot.SpaceType === "number" ? TARGET_SPACE_TYPES[slot.SpaceType] : undefined;
      if (!label) continue;

      records.push({
        facilityType: "accessible_parking",
        sourceKey: "tdx_parking_onstreet",
        sourceId: `${segment.ParkingSegmentID}|${slot.SpaceType}`.slice(0, 100),
        name: `${name} ${label}`,
        address: segment.RoadSection || `${segment.City || ""}${segment.TownName || ""}` || null,
        phone: null,
        lat,
        lng,
        serviceItem: buildServiceItemText(label, slot.AvailableSpaces, slot.NumberOfSpaces),
        serviceTime: null,
        dataOrg: `${cityConfig.label}政府`,
        extra: {
          parkingKind: "onstreet",
          parkingSegmentId: segment.ParkingSegmentID,
          spaceType: slot.SpaceType,
          spaceTypeLabel: label,
          totalSpaces: typeof slot.NumberOfSpaces === "number" ? slot.NumberOfSpaces : null,
          availableSpaces:
            typeof slot.AvailableSpaces === "number" && slot.AvailableSpaces >= 0 ? slot.AvailableSpaces : null,
        },
      });
    }
  }
  return records;
}

/**
 * Fetches every TDX_BUS_CITIES county's off-street + on-street special-space
 * records, isolating each (county, kind) pair's failure individually
 * (`Promise.allSettled`, batches of 3 — same rate-limit headroom as the other
 * TDX multi-county clients in this repo). One bad county or one bad kind
 * (off-street vs on-street) never zeroes out the rest of the national sync.
 */
export async function fetchTdxAccessibleParking(): Promise<FacilityRecord[]> {
  const token = await getTdxToken();
  if (!token) return [];

  type Task = { cityCode: string; kind: "offstreet" | "onstreet"; run: () => Promise<FacilityRecord[]> };
  const tasks: Task[] = [];
  for (const cityCode of Object.keys(TDX_BUS_CITIES)) {
    tasks.push({ cityCode, kind: "offstreet", run: () => fetchCityOffStreetParking(cityCode) });
    tasks.push({ cityCode, kind: "onstreet", run: () => fetchCityOnStreetParking(cityCode) });
  }

  const records: FacilityRecord[] = [];
  // Each task already fires 2 requests in parallel (static + availability),
  // so 3 tasks at once meant 6 concurrent calls — every county got a 429 on
  // the first live run. Run one county-kind at a time; 429s that still
  // happen are retried with back-off inside tdxGetJsonWithRetry.
  const batchSize = 1;
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((task) => task.run()));

    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        records.push(...result.value);
      } else {
        console.warn(
          `TDX parking sync: county "${batch[j].cityCode}" (${batch[j].kind}) failed:`,
          result.reason instanceof Error ? result.reason.message : String(result.reason),
        );
      }
    }
  }
  return records;
}
