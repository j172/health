import "server-only";
import { tdxGetJsonWithRetry } from "@/lib/server/tdx/getJsonWithRetry";
import type { TdxAvailabilityItem, TdxStationItem } from "./tdxStations";

// TDX 城市代碼對應表 (TDX City Name -> 內部 City Code)
//
// 原本只接了 11 個縣市；issue #453 / docs/2.0/tdx-basic-integration-research.md
// §T6 指出 TDX 的 Bike/Station、Bike/Availability 這組 City 列舉其實涵蓋全台 15
// 個縣市，故補上彰化、雲林、嘉義縣、臺東這 4 個，使 TDX_CITIES 達到完整的 15 個。
// tdxName 採用 TDX 平台其他 API（如 Tourism/Car_Park）共用的標準縣市代碼命名
// （XxxCounty 代表縣、純市名代表直轄市/市）。各縣市目前是否已有實際上線的公共自
// 行車站點資料由 TDX 回應內容決定——即使某縣市暫無資料，Station／Availability 仍會
// 正常回傳空陣列，不視為錯誤。
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

/**
 * 臺北市、新北市永遠走各自的免費開放資料直連（lib/server/youbike/directSources.ts），不經 TDX：
 * 資料免費、不占 TDX 每分鐘 5 次的共用限流，也不耗點數。
 */
export const DIRECT_OPENDATA_CITY_CODES: readonly string[] = ["TPE", "NTPC"];

/** TDX 負責的其餘 13 個縣市（依 TDX_CITIES 的順序，新竹市排在前段，讓它的後備嘗試能與其餘縣市重疊）。 */
export const TDX_SYNCED_CITY_CODES: readonly string[] = Object.keys(TDX_CITIES).filter(
  (code) => !DIRECT_OPENDATA_CITY_CODES.includes(code),
);

const BIKE_API_BASE = "https://tdx.transportdata.tw/api/basic/v2/Bike";

const requireList = <T>(res: { status: number; data: T[] | null; circuitOpen?: boolean }, label: string): T[] => {
  if (res.status !== 200 || !Array.isArray(res.data)) {
    const suffix = res.circuitOpen ? " (circuit breaker open, nothing was sent)" : "";
    throw new Error(`TDX ${label} returned status ${res.status}${suffix}`);
  }
  return res.data;
};

const tdxNameOf = (cityCode: string): string => {
  const cityConfig = TDX_CITIES[cityCode];
  if (!cityConfig) throw new Error(`Unknown YouBike city code: ${cityCode}`);
  return cityConfig.tdxName;
};

/**
 * Bike/Station：站名、地址、座標、車柱數——幾乎不變的靜態資料。同步只在「該縣市資料庫沒有站點」
 * 「距上次載入超過 24 小時」「Availability 出現資料庫沒有的 StationID」時才呼叫（見 tdxSyncCore.ts）。
 * 非 200 一律丟錯，由呼叫端以 Promise.allSettled 隔離單一縣市的失敗。
 */
export async function fetchTdxStationList(cityCode: string, token: string): Promise<TdxStationItem[]> {
  const tdxCity = tdxNameOf(cityCode);
  const res = await tdxGetJsonWithRetry<TdxStationItem[]>(
    `${BIKE_API_BASE}/Station/City/${tdxCity}?%24format=JSON`,
    token,
    { timeoutMs: 12000 },
  );
  return requireList(res, `Bike/Station/City/${tdxCity}`);
}

/**
 * Bike/Availability：即時可借／可還車位。這是每一輪、每個縣市唯一必打的一個請求
 * （共用的 TDX 限流器：基本方案整組憑證每分鐘僅 5 次，見 lib/server/tdx/rateLimiter.ts）。
 */
export async function fetchTdxAvailability(cityCode: string, token: string): Promise<TdxAvailabilityItem[]> {
  const tdxCity = tdxNameOf(cityCode);
  const res = await tdxGetJsonWithRetry<TdxAvailabilityItem[]>(
    `${BIKE_API_BASE}/Availability/City/${tdxCity}?%24format=JSON`,
    token,
    { timeoutMs: 12000 },
  );
  return requireList(res, `Bike/Availability/City/${tdxCity}`);
}
