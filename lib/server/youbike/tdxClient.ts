import "server-only";
import { httpGetJson, httpPostForm } from "@/lib/server/net/httpClient";
import type { YouBikeStation } from "./types";

interface TdxTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

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
export const TDX_CITIES: Record<string, { tdxName: string; label: string }> = {
  TPE: { tdxName: "Taipei", label: "臺北市" },
  NTPC: { tdxName: "NewTaipei", label: "新北市" },
  TYCG: { tdxName: "Taoyuan", label: "桃園市" },
  HSC: { tdxName: "Hsinchu", label: "新竹市" },
  HCH: { tdxName: "HsinchuCounty", label: "新竹縣" },
  MAL: { tdxName: "MiaoliCounty", label: "苗栗縣" },
  TXG: { tdxName: "Taichung", label: "臺中市" },
  CYI: { tdxName: "Chiayi", label: "嘉義市" },
  TNN: { tdxName: "Tainan", label: "臺南市" },
  KHH: { tdxName: "Kaohsiung", label: "高雄市" },
  PTT: { tdxName: "PingtungCounty", label: "屏東縣" },
};

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

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
 * 取得 TDX 存取權杖 (OAuth2 Client Credentials)
 */
async function getTdxToken(): Promise<string | null> {
  const clientId = process.env.TDX_CLIENT_ID || process.env.TDX_APP_ID;
  const clientSecret = process.env.TDX_CLIENT_SECRET || process.env.TDX_APP_KEY;

  if (!clientId || !clientSecret) {
    return null;
  }

  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  try {
    const res = await httpPostForm<TdxTokenResponse>(
      "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token",
      {
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      },
      { timeoutMs: 8000 }
    );

    if (res.status === 200 && res.data?.access_token) {
      cachedToken = res.data.access_token;
      // 提早 60 秒到期，確保安全邊界
      tokenExpiresAt = now + Math.max(0, (res.data.expires_in - 60) * 1000);
      return cachedToken;
    }
    return null;
  } catch (err) {
    console.warn("TDX token fetch failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
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
 */
export async function fetchAllTdxStations(): Promise<{
  stations: YouBikeStation[];
  citiesCount: Record<string, number>;
}> {
  const token = await getTdxToken();
  if (!token) {
    return { stations: [], citiesCount: {} };
  }

  const cityKeys = Object.keys(TDX_CITIES);
  const citiesCount: Record<string, number> = {};
  const allStations: YouBikeStation[] = [];

  // 為保護頻寬與 TDX 配額，分批併發 3 個縣市請求
  const batchSize = 3;
  for (let i = 0; i < cityKeys.length; i += batchSize) {
    const batch = cityKeys.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((c) => fetchTdxCityStations(c)));

    for (let j = 0; j < batch.length; j++) {
      const c = batch[j];
      const list = results[j];
      citiesCount[c] = list.length;
      allStations.push(...list);
    }
  }

  return { stations: allStations, citiesCount };
}
