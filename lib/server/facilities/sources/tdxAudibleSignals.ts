import "server-only";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { tdxGetJsonWithRetry } from "@/lib/server/tdx/getJsonWithRetry";
import { getTdxToken } from "@/lib/server/tdx/auth";
import { toCoordinate } from "@/lib/server/db/coords";
import { TDX_CITIES } from "@/lib/server/tdx/cities";

/**
 * TDX 基礎服務「有聲號誌」資料來源 (issue #468, parent #438 §P T2) — 全台盲人
 * 有聲號誌（行人穿越道語音號誌）點位，含座標、路名與是否支援 App 觸發。
 *
 * API 位置以 PR #440 找出 TDX 高齡友善 API base path 的同一套方法確認
 * （`https://tdx.transportdata.tw/webapi/serviceCategory/ForSwagger` 找到群組
 * 「有聲號誌」屬於 `basic`（基礎服務）分類，再用
 * `https://tdx.transportdata.tw/webapi/File/Swagger/V3/{groupId}` 取得真實
 * swagger）：base `https://tdx.transportdata.tw/api/basic`，路徑
 * `/v1/Traffic/Road/APS/City/{City}`（注意是 v1，不是 Bus 用的 v3 — TDX 每個
 * service category 的版本是各自獨立的，不能假設一致）。
 *
 * swagger 正式的 `City` path 參數 `enum` 只列出 8 個縣市（Taoyuan/Taichung/
 * Tainan/Kaohsiung/Keelung/HsinchuCounty/ChanghuaCounty/NantouCounty），但
 * `x-enum` 顯示名稱對照表仍完整列出全部 22 縣市 — 與 #467 的 Bus API 同樣
 * 「enum 不完整但資料實際涵蓋全國」的落差，所以沿用
 * `lib/server/tdx/cities.ts` 的 `TDX_CITIES`（同一組 22 縣市
 * 代碼→tdxName/label 對照，Bus client 已確認可用），不重新宣告一份；並對
 * 每個縣市各自呼叫、各自隔離錯誤——enum 未列出的 14 個縣市若真的回
 * 400/404，只讓該縣市的資料是空的，不會把其他 21 縣市的真實資料也清空。
 */

interface TdxApsItem {
  ID?: string;
  City?: string;
  Town?: string;
  RoadName1?: string;
  RoadName2?: string;
  PositionLon?: number | string;
  PositionLat?: number | string;
  StartTypes?: number[];
  AppActivatedSignal?: boolean;
}

interface TdxApsWrapper {
  Apses?: TdxApsItem[];
}

const apsUrl = (tdxCity: string): string =>
  `https://tdx.transportdata.tw/api/basic/v1/Traffic/Road/APS/City/${tdxCity}?%24format=JSON`;

/** "路名1×路名2 有聲號誌"，只有一條路名時省略「×」，兩者都缺時退回縣市+鄉鎮。 */
function buildName(item: TdxApsItem): string {
  const roads = [item.RoadName1, item.RoadName2].filter(
    (r): r is string => !!r && r.trim().length > 0,
  );
  if (roads.length === 2 && roads[0] !== roads[1]) return `${roads[0]}×${roads[1]} 有聲號誌`;
  if (roads.length >= 1) return `${roads[0]} 有聲號誌`;
  const area = `${item.City || ""}${item.Town || ""}`.trim();
  return area ? `${area} 有聲號誌` : "有聲號誌";
}

function buildAddress(item: TdxApsItem): string | null {
  const parts = [item.City, item.Town].filter((p): p is string => !!p && p.trim().length > 0);
  return parts.length > 0 ? parts.join("") : null;
}

/** Returns null for a row with no usable identity (no ID and no city/town/road to derive one from) so the caller can skip it rather than upsert a garbage row. */
function mapAps(item: TdxApsItem, countyLabel: string): FacilityRecord | null {
  const lat = toCoordinate(item.PositionLat);
  const lng = toCoordinate(item.PositionLon);
  const derivedId = `${item.City || ""}|${item.Town || ""}|${item.RoadName1 || ""}|${item.RoadName2 || ""}|${lat ?? ""}|${lng ?? ""}`;
  const sourceId = (item.ID && item.ID.trim()) || derivedId;
  if (!sourceId.replace(/\|/g, "").trim()) return null;

  const appActivatedSignal = typeof item.AppActivatedSignal === "boolean" ? item.AppActivatedSignal : null;

  return {
    facilityType: "audible_signal",
    sourceKey: "tdx_aps",
    sourceId: sourceId.slice(0, 100),
    name: buildName(item),
    address: buildAddress(item),
    phone: null,
    lat,
    lng,
    // Rendered as a badge on /tools/audible-signals (FacilitySearchContent's
    // `serviceItem: "badge"`) — the one acceptance-criterion fact ("是否能用
    // App 觸發") every row must surface, not just a general description.
    serviceItem:
      appActivatedSignal === null ? null : appActivatedSignal ? "可用App觸發" : "不可App觸發",
    serviceTime: null,
    dataOrg: `${countyLabel}政府`,
    extra: {
      appActivatedSignal,
      startTypes: Array.isArray(item.StartTypes) ? item.StartTypes : [],
      roadName1: item.RoadName1 || null,
      roadName2: item.RoadName2 || null,
    },
  };
}

/**
 * Fetches one county's audible-signal points. Returns `[]` (never throws) for
 * an unknown city code or a missing token, but DOES throw on a non-200 HTTP
 * response or bad token — letting the caller's Promise.allSettled isolate
 * that one county's failure from the others, same as the Bus client.
 */
export async function fetchCityAudibleSignals(cityCode: string): Promise<FacilityRecord[]> {
  const cityConfig = TDX_CITIES[cityCode];
  if (!cityConfig) return [];

  const token = await getTdxToken();
  if (!token) return [];

  const res = await tdxGetJsonWithRetry<TdxApsWrapper | TdxApsItem[]>(apsUrl(cityConfig.tdxName), token);
  if (res.status !== 200) {
    throw new Error(`TDX Traffic/Road/APS/City/${cityConfig.tdxName} returned status ${res.status}`);
  }

  const items: TdxApsItem[] = Array.isArray(res.data) ? res.data : res.data?.Apses || [];
  const records: FacilityRecord[] = [];
  for (const item of items) {
    const record = mapAps(item, cityConfig.label);
    if (record) records.push(record);
  }
  return records;
}

/**
 * Fetches every TDX_CITIES county's audible-signal points, isolating
 * each county's failure individually (Promise.allSettled, batches of 3 —
 * same rate-limit-headroom batching as the other TDX
 * per-county fetchers) so one bad county (an enum mismatch, a timeout, a TDX
 * 5xx) never zeroes out the whole national sync. Never throws past this
 * point: a county that fails is logged and simply contributes zero rows,
 * which is this repo's established facilities-source convention (the
 * sync-level isolation this ticket's acceptance criterion cares about —
 * "同步失敗不影響「我附近」其他類型正常顯示" — is handled a layer up by
 * runFacilitySync()/runSource() per-source, and further up again by
 * aggregateNearbyTypes() per nearby-type; this function isolating per
 * *county* on top of that is extra robustness, not strictly required by
 * that acceptance criterion, but matches the precedent of every other
 * TDX multi-county client in this repo).
 */
export async function fetchTdxAudibleSignals(): Promise<FacilityRecord[]> {
  const token = await getTdxToken();
  if (!token) return [];

  const records: FacilityRecord[] = [];
  const cityKeys = Object.keys(TDX_CITIES);
  const batchSize = 3;
  for (let i = 0; i < cityKeys.length; i += batchSize) {
    const batch = cityKeys.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((cityCode) => fetchCityAudibleSignals(cityCode)));

    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        records.push(...result.value);
      } else {
        console.warn(
          `TDX audible-signal sync: county "${batch[j]}" failed:`,
          result.reason instanceof Error ? result.reason.message : String(result.reason),
        );
      }
    }
  }
  return records;
}
