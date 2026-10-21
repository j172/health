import "server-only";
import { getTdxToken } from "@/lib/server/tdx/auth";
import { tdxGetJsonWithRetry } from "@/lib/server/tdx/getJsonWithRetry";
import { TDX_SENIORS_API_BASE } from "@/lib/server/tdx/seniors";

/**
 * TDX「Senior」(樂齡/敬老) SeniorCard API — 22 縣市敬老卡交通補助。
 *
 * issue #729：樂齡旅遊（景區無障礙設施／服務／套票／停用公告）已整個移除，
 * 敬老卡補助改為靜態資料（種子見 ./data/seniorCardSeed.ts），不再有排程呼叫這個 client；
 * 只剩管理員手動觸發 POST /api/admin/senior-card-sync（runSeniorCardSync）時才會使用，
 * 與 lib/server/transit/tdxSeniorClient.ts（無障礙交通的軌道無障礙）互不相干。
 */
const SENIOR_CARD_BASE = `${TDX_SENIORS_API_BASE}/SeniorCard`;

export interface SeniorCardSubsidy {
  Category?: string;
  Description?: string;
}

export interface TdxSeniorCardEntry {
  UpdateTime?: string;
  UpdateInterval?: number;
  AutorityName?: string;
  SeniorCardName?: string;
  URL?: string;
  Subsidies?: SeniorCardSubsidy[];
}

/**
 * TDX City (SeniorCard §2.2) → 本 repo 的正體中文縣市名稱（lib/constants/taiwanDistricts.ts
 * TAIWAN_COUNTIES）。22 個 key 與 TDX Senior OpenAPI 文件的 `City` 路徑參數列舉逐一對應。
 */
export const SENIOR_CITY_CODE_TO_COUNTY: Record<string, string> = {
  TPE: "臺北市",
  NWT: "新北市",
  TAO: "桃園市",
  TXG: "臺中市",
  TNN: "臺南市",
  KHH: "高雄市",
  KEE: "基隆市",
  HSZ: "新竹市",
  HSQ: "新竹縣",
  MIA: "苗栗縣",
  CHA: "彰化縣",
  NAN: "南投縣",
  YUN: "雲林縣",
  CYQ: "嘉義縣",
  CYI: "嘉義市",
  PIF: "屏東縣",
  ILA: "宜蘭縣",
  HUA: "花蓮縣",
  TTT: "臺東縣",
  KIN: "金門縣",
  PEN: "澎湖縣",
  LIE: "連江縣",
};

/** The 22 SeniorCard City path-parameter codes, in the exact order the spec lists them. */
export const SENIOR_CARD_CITIES = [
  "TPE", "NWT", "TAO", "TXG", "TNN", "KHH", "KEE", "HSZ", "HSQ", "MIA",
  "CHA", "NAN", "YUN", "CYQ", "CYI", "PIF", "ILA", "HUA", "TTT", "KIN",
  "PEN", "LIE",
] as const;

export type SeniorCardCity = (typeof SENIOR_CARD_CITIES)[number];

export const cityCodeToCounty = (code?: string | null): string | null => {
  if (!code) return null;
  return SENIOR_CITY_CODE_TO_COUNTY[code] || code;
};

export const fetchSeniorCard = async (city: SeniorCardCity): Promise<TdxSeniorCardEntry[]> => {
  const token = await getTdxToken();
  if (!token) return [];

  const url = `${SENIOR_CARD_BASE}/City/${city}?%24format=JSON`;
  const res = await tdxGetJsonWithRetry<TdxSeniorCardEntry[]>(url, token, { timeoutMs: 12000 });
  if (res.status !== 200 || !Array.isArray(res.data)) {
    throw new Error(`TDX Senior/SeniorCard City/${city} returned status ${res.status}`);
  }
  return res.data;
};
