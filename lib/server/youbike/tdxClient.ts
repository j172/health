import "server-only";
import { httpGetJson } from "@/lib/server/net/httpClient";
import { getTdxToken } from "@/lib/server/tdx/auth";
import type { YouBikeStation } from "./types";

interface TdxStationPosition {
  PositionLon: number;
  PositionLat: number;
}

interface TdxStationName {
  Zh_tw: string;
  En?: string;
}

interface TdxStationItem {
  StationUID: string;
  StationID: string;
  StationName: TdxStationName;
  StationPosition: TdxStationPosition;
  StationAddress?: TdxStationName;
  BikesCapacity?: number;
}

interface TdxAvailabilityItem {
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

// TDX 城市代碼對應表 (TDX City Name -> 內部 City Code)
//
// 原本只接了 11 個縣市；issue #453 / docs/2.0/tdx-basic-integration-research.md
// §T6 指出 TDX 的 Bike/Station、Bike/Availability 這組 City 列舉其實涵蓋全台 15
// 個縣市，故補上彰化、雲林、嘉義縣、臺東這 4 個，使 TDX_CITIES 達到完整的 15 個。
// tdxName 採用 TDX 平台其他 API（如 Tourism/Car_Park）共用的標準縣市代碼命名
// （XxxCounty 代表縣、純市名代表直轄市/市）。各縣市目前是否已有實際上線的公共自
// 行車站點資料由 TDX 回應內容決定——即使某縣市暫無資料，fetchTdxCityStations()
// 仍會正常回傳空陣列，不視為錯誤。
export const TDX_CITIES: Record<string, { tdxName: string; label: string }> = {
  TPE: { tdxName: "Taipei", label: "臺北市" },
  NTPC: { tdxName: "NewTaipei", label: "新北市" },
  TYCG: { tdxName: "Taoyuan", label: "桃園市" },
  HSC: { tdxName: "Hsinchu", label: "新竹市" },
  HCH: { tdxName: "HsinchuCounty", label: "新竹縣" },
  MAL: { tdxName: "MiaoliCounty", label: "苗栗縣" },
  TXG: { tdxName: "Taichung", label: "臺中市" },
  CHA: { tdxName: "ChanghuaCounty", label: "彰化縣" },
  YUN: { tdxName: "YunlinCounty", label: "雲林縣" },
  CYI: { tdxName: "Chiayi", label: "嘉義市" },
  CYQ: { tdxName: "ChiayiCounty", label: "嘉義縣" },
  TNN: { tdxName: "Tainan", label: "臺南市" },
  KHH: { tdxName: "Kaohsiung", label: "高雄市" },
  PTT: { tdxName: "PingtungCounty", label: "屏東縣" },
  TTT: { tdxName: "TaitungCounty", label: "臺東縣" },
};

function cleanName(raw?: string | null): string {
  return (raw || "").replace(/^YouBike2\.0_/i, "").trim();
}

function formatTime(str?: string | null): string {
  if (!str) return new Date().toISOString().slice(0, 19).replace("T", " ");
  const clean = str.replace(/[- :T]/g, "");
  if (clean.length >= 14) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)} ${clean.slice(8, 10)}:${clean.slice(10, 12)}:${clean.slice(12, 14)}`;
  }
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/**
 * 從 TDX 取得單一縣市的 YouBike 2.0 站點與即時車位資料
 */
export async function fetchTdxCityStations(cityCode: string): Promise<YouBikeStation[]> {
  const cityConfig = TDX_CITIES[cityCode];
  if (!cityConfig) return [];

  const token = await getTdxToken();
  if (!token) return [];

  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/json",
  };

  const tdxCity = cityConfig.tdxName;

  // 平行請求站點基本資料與即時車位狀態
  const [stationRes, availRes] = await Promise.all([
    httpGetJson<TdxStationItem[]>(
      `https://tdx.transportdata.tw/api/basic/v2/Bike/Station/City/${tdxCity}?%24format=JSON`,
      { headers, timeoutMs: 12000 }
    ),
    httpGetJson<TdxAvailabilityItem[]>(
      `https://tdx.transportdata.tw/api/basic/v2/Bike/Availability/City/${tdxCity}?%24format=JSON`,
      { headers, timeoutMs: 12000 }
    ),
  ]);

  if (stationRes.status !== 200 || !Array.isArray(stationRes.data)) {
    return [];
  }

  const availabilityMap = new Map<string, TdxAvailabilityItem>();
  if (availRes.status === 200 && Array.isArray(availRes.data)) {
    for (const item of availRes.data) {
      if (item.StationUID) availabilityMap.set(item.StationUID, item);
      if (item.StationID) availabilityMap.set(item.StationID, item);
    }
  }

  const stations: YouBikeStation[] = [];
  for (const st of stationRes.data) {
    const avail = availabilityMap.get(st.StationUID) || availabilityMap.get(st.StationID);
    const lat = st.StationPosition?.PositionLat || 0;
    const lng = st.StationPosition?.PositionLon || 0;
    if (!lat || !lng) continue;

    const availableBikes = avail?.AvailableRentBikes ?? 0;
    const availableEbikes = avail?.AvailableRentBikesDetail?.ElectricBikes ?? 0;
    const emptySpaces = avail?.AvailableReturnBikes ?? 0;
    const totalSpaces = st.BikesCapacity ?? availableBikes + emptySpaces;
    const isActive = avail?.ServiceStatus === 1 ? 1 : 0;
    const updateTime = formatTime(avail?.SrcUpdateTime || avail?.UpdateTime);

    stations.push({
      cityCode,
      stationNo: st.StationID || st.StationUID,
      nameTw: cleanName(st.StationName?.Zh_tw),
      districtTw: "",
      addressTw: st.StationAddress?.Zh_tw || "",
      lat,
      lng,
      totalSpaces,
      availableBikes,
      availableEbikes,
      emptySpaces,
      isActive,
      updatedAtSource: updateTime,
    });
  }

  return stations;
}

/**
 * 批次抓取 TDX 支援的所有全台縣市 YouBike 2.0 站點
 *
 * 每個縣市的請求以 Promise.allSettled 個別隔離錯誤（逾時、TDX 回應非 200、JSON
 * 解析失敗等）：單一縣市失敗只會記錄進 errors[cityCode]、該縣市當次回報 0 站，
 * 不會讓 Promise.all 整批 reject 而連帶吃掉同批次裡其他縣市、甚至全部 15 個縣
 * 市已抓到的資料（issue #453 acceptance criteria：新增縣市失敗不應影響其他縣
 * 市，失敗率應與既有縣市一致）。
 */
export async function fetchAllTdxStations(): Promise<{
  stations: YouBikeStation[];
  citiesCount: Record<string, number>;
  errors: Record<string, string>;
}> {
  const token = await getTdxToken();
  if (!token) {
    return { stations: [], citiesCount: {}, errors: {} };
  }

  const cityKeys = Object.keys(TDX_CITIES);
  const citiesCount: Record<string, number> = {};
  const errors: Record<string, string> = {};
  const allStations: YouBikeStation[] = [];

  // 為保護頻寬與 TDX 配額，分批併發 3 個縣市請求
  const batchSize = 3;
  for (let i = 0; i < cityKeys.length; i += batchSize) {
    const batch = cityKeys.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((c) => fetchTdxCityStations(c)));

    for (let j = 0; j < batch.length; j++) {
      const c = batch[j];
      const result = results[j];
      if (result.status === "fulfilled") {
        citiesCount[c] = result.value.length;
        allStations.push(...result.value);
      } else {
        citiesCount[c] = 0;
        errors[c] = result.reason instanceof Error ? result.reason.message : String(result.reason);
      }
    }
  }

  return { stations: allStations, citiesCount, errors };
}
