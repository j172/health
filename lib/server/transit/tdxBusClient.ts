import "server-only";
import { getTdxToken } from "@/lib/server/tdx/auth";
import { tdxGetJsonWithRetry } from "@/lib/server/tdx/getJsonWithRetry";
import {
  buildRoutesFromTdxBusData,
  type BusScheduleTripInput,
  type BusVehicleLowFloorInput,
} from "./busLowFloorMath";
import type { AccessibleTransitRoute } from "./types";

/**
 * TDX's Basic Bus service (`/api/basic/v3/Bus/...`) city enumeration, covering
 * all 22 Taiwan counties/cities (bus service exists everywhere). Fifteen of
 * the entries use tdxName strings that were confirmed live by an earlier
 * (since removed) client; the remaining 7
 * (Keelung/Nantou/Yilan/Hualien/Penghu/Kinmen/Lienchiang) follow
 * TDX's standard county-naming convention but have not been hit by any
 * other client in this repo — fetchAllTdxBusRoutes() isolates each city's
 * failure individually (see below), so a wrong enum value for any one of
 * these shows up as that one county's error in the sync summary rather than
 * breaking the other 21.
 */
export const TDX_BUS_CITIES: Record<string, { tdxName: string; label: string }> = {
  TPE: { tdxName: "Taipei", label: "臺北市" },
  NTPC: { tdxName: "NewTaipei", label: "新北市" },
  KEE: { tdxName: "Keelung", label: "基隆市" },
  TYCG: { tdxName: "Taoyuan", label: "桃園市" },
  HSC: { tdxName: "Hsinchu", label: "新竹市" },
  HCH: { tdxName: "HsinchuCounty", label: "新竹縣" },
  MAL: { tdxName: "MiaoliCounty", label: "苗栗縣" },
  TXG: { tdxName: "Taichung", label: "臺中市" },
  CHA: { tdxName: "ChanghuaCounty", label: "彰化縣" },
  NTO: { tdxName: "NantouCounty", label: "南投縣" },
  YUN: { tdxName: "YunlinCounty", label: "雲林縣" },
  CYI: { tdxName: "Chiayi", label: "嘉義市" },
  CYQ: { tdxName: "ChiayiCounty", label: "嘉義縣" },
  TNN: { tdxName: "Tainan", label: "臺南市" },
  KHH: { tdxName: "Kaohsiung", label: "高雄市" },
  PTT: { tdxName: "PingtungCounty", label: "屏東縣" },
  ILN: { tdxName: "YilanCounty", label: "宜蘭縣" },
  HUA: { tdxName: "HualienCounty", label: "花蓮縣" },
  TTT: { tdxName: "TaitungCounty", label: "臺東縣" },
  PEN: { tdxName: "PenghuCounty", label: "澎湖縣" },
  KMN: { tdxName: "KinmenCounty", label: "金門縣" },
  LJK: { tdxName: "LienchiangCounty", label: "連江縣" },
};

interface TdxBusName {
  Zh_tw?: string;
  En?: string;
}

interface TdxBusVehicleItem {
  PlateNumb?: string;
  RouteUID?: string;
  RouteID?: string;
  RouteName?: TdxBusName;
  SubRouteUID?: string;
  SubRouteName?: TdxBusName;
  IsLowFloor?: boolean;
  HasLiftOrRamp?: boolean;
}

interface TdxBusScheduleTimetable {
  TripID?: string;
  IsLowFloor?: boolean;
  StopTimes?: Array<{ ArrivalTime?: string; DepartureTime?: string }>;
}

interface TdxBusScheduleItem {
  RouteUID?: string;
  RouteID?: string;
  RouteName?: TdxBusName;
  SubRouteUID?: string;
  SubRouteName?: TdxBusName;
  Timetables?: TdxBusScheduleTimetable[];
}

const busVehicleUrl = (tdxCity: string): string =>
  `https://tdx.transportdata.tw/api/basic/v3/Bus/Vehicle/City/${tdxCity}?%24format=JSON`;

const busScheduleUrl = (tdxCity: string): string =>
  `https://tdx.transportdata.tw/api/basic/v3/Bus/Schedule/City/${tdxCity}?%24format=JSON`;

async function fetchCityBusVehicles(
  tdxCity: string,
  token: string,
): Promise<TdxBusVehicleItem[]> {
  const res = await tdxGetJsonWithRetry<TdxBusVehicleItem[]>(busVehicleUrl(tdxCity), token, { timeoutMs: 12000 });
  if (res.status !== 200 || !Array.isArray(res.data)) {
    throw new Error(`TDX Bus/Vehicle/City/${tdxCity} returned status ${res.status}`);
  }
  return res.data;
}

async function fetchCityBusSchedule(
  tdxCity: string,
  token: string,
): Promise<TdxBusScheduleItem[]> {
  const res = await tdxGetJsonWithRetry<TdxBusScheduleItem[]>(busScheduleUrl(tdxCity), token, { timeoutMs: 12000 });
  if (res.status !== 200 || !Array.isArray(res.data)) {
    throw new Error(`TDX Bus/Schedule/City/${tdxCity} returned status ${res.status}`);
  }
  return res.data;
}

const routeKeyOf = (item: { RouteUID?: string; RouteID?: string }): string | null =>
  item.RouteUID || item.RouteID || null;

/**
 * Fetches one county's Vehicle + Schedule data from TDX and maps it into
 * AccessibleTransitRoute rows via busLowFloorMath.buildRoutesFromTdxBusData().
 * Returns an empty array (never throws past this point) on anything short of
 * both network calls succeeding, so a single county's failure can be isolated
 * by the caller (fetchAllTdxBusRoutes() isolates per-county failures).
 */
export async function fetchCityBusRoutes(cityCode: string): Promise<AccessibleTransitRoute[]> {
  const cityConfig = TDX_BUS_CITIES[cityCode];
  if (!cityConfig) return [];

  const token = await getTdxToken();
  if (!token) return [];

  const [vehicles, schedules] = await Promise.all([
    fetchCityBusVehicles(cityConfig.tdxName, token),
    // Schedule/City failing independently of Vehicle/City (e.g. a county with
    // live vehicles but no published timetable yet) should not sink the
    // whole county's low-floor ratio — only the trip-sample feature degrades.
    fetchCityBusSchedule(cityConfig.tdxName, token).catch(() => [] as TdxBusScheduleItem[]),
  ]);

  const vehiclesByRoute = new Map<string, BusVehicleLowFloorInput[]>();
  const routeNamesByRoute = new Map<string, string>();

  for (const v of vehicles) {
    const key = routeKeyOf(v);
    if (!key || !v.PlateNumb) continue;
    const list = vehiclesByRoute.get(key) || [];
    list.push({ plateNumb: v.PlateNumb, isLowFloor: !!v.IsLowFloor });
    vehiclesByRoute.set(key, list);
    if (!routeNamesByRoute.has(key)) {
      const name = v.RouteName?.Zh_tw || v.SubRouteName?.Zh_tw || key;
      routeNamesByRoute.set(key, name);
    }
  }

  const tripsByRoute = new Map<string, BusScheduleTripInput[]>();
  for (const s of schedules) {
    const key = routeKeyOf(s);
    if (!key) continue;
    if (!routeNamesByRoute.has(key)) {
      const name = s.RouteName?.Zh_tw || s.SubRouteName?.Zh_tw || key;
      routeNamesByRoute.set(key, name);
    }
    const list = tripsByRoute.get(key) || [];
    for (const t of s.Timetables || []) {
      list.push({
        tripId: t.TripID ?? null,
        isLowFloor: !!t.IsLowFloor,
        departureTime: t.StopTimes?.[0]?.DepartureTime ?? null,
      });
    }
    tripsByRoute.set(key, list);
  }

  return buildRoutesFromTdxBusData({
    county: cityConfig.label,
    vehiclesByRoute,
    routeNamesByRoute,
    tripsByRoute,
  });
}

/**
 * Batch-fetches every TDX_BUS_CITIES county's bus routes. Batches of 3
 * concurrent requests (TDX per-minute rate limit headroom) via
 * Promise.allSettled, so one county's failure (bad enum, timeout, TDX 5xx,
 * etc.) is recorded into `errors` and never aborts the other counties'
 * already-fetched data.
 */
export async function fetchAllTdxBusRoutes(): Promise<{
  routesByCounty: Map<string, AccessibleTransitRoute[]>;
  errors: Record<string, string>;
}> {
  const routesByCounty = new Map<string, AccessibleTransitRoute[]>();
  const errors: Record<string, string> = {};

  const token = await getTdxToken();
  if (!token) {
    return { routesByCounty, errors };
  }

  const cityKeys = Object.keys(TDX_BUS_CITIES);
  const batchSize = 3;
  for (let i = 0; i < cityKeys.length; i += batchSize) {
    const batch = cityKeys.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((c) => fetchCityBusRoutes(c)));

    for (let j = 0; j < batch.length; j++) {
      const cityCode = batch[j];
      const county = TDX_BUS_CITIES[cityCode].label;
      const result = results[j];
      if (result.status === "fulfilled") {
        routesByCounty.set(county, result.value);
      } else {
        routesByCounty.set(county, []);
        errors[county] =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
      }
    }
  }

  return { routesByCounty, errors };
}
