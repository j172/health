/**
 * 地震速報橫幅狀態 — 純函式，伺服器與瀏覽器共用，不含任何 I/O。
 *
 * 架構完全比照颱風警報橫幅（issue #744，見 lib/typhoon/typhoonStatus.ts），但觸發條件與
 * 顯示視窗是地震專屬的全新規則，不是颱風那一套：
 *
 * 1. 觸發條件（有感判定）：資料來源是既有的 cwa_earthquakes 表（CWA 地震報告，E-A0015-001，
 *    見 lib/server/cwa/sources/earthquake.ts）。這個資料集本身就是「顯著有感地震報告」，但表裡
 *    沒有獨立的「有感／無感」布林欄位可用，所以依既有同步程式碼的欄位語意：
 *    `area_intensity_json` 是 CWA 回傳的 `Intensity.ShakingArea`（各地測得的震度分布），一筆地震
 *    有沒有任何地方測到有感，就看這個欄位是否有內容 —— 有內容（非空陣列／物件）即視為有感，
 *    null／空值視為無感（例如海底地震只有儀器測得、沒有地方「有感」）。
 *
 * 2. 顯示視窗：颱風橫幅是「警報生效中才顯示」（查 cwa_alerts 的 effective/expires，見
 *    lib/server/officeCalendar/typhoonWarning.ts 的 TYPHOON_WARNING_IN_FORCE_SQL）；地震報告沒有
 *    「生效中」或「解除」這種狀態，所以這裡改成「事件發生後固定持續一段時間」：從 origin_time
 *    起算 72 小時內都顯示，滿 72 小時自動消失，與地震有沒有被「取消」無關。
 *
 * 3. 同時有多筆地震落在 72 小時視窗內時，只顯示最新（origin_time 最大）的一筆，不疊多個橫幅。
 */

export interface EarthquakeStatus {
  active: boolean;
  /** 地震規模（ML/MW 等，取 CWA EarthquakeMagnitude.MagnitudeValue）。 */
  magnitude?: number;
  /** 本次地震的最大震度（CWA 的 AreaIntensity 字串，如「4」「5弱」）。 */
  maxIntensity?: string;
  /** 震央地點描述（CWA 的 Epicenter.Location，已截短）。 */
  location?: string;
  /** 發生時間（origin_time，ISO 8601）。 */
  originTime?: string;
  /** 只有「持有正確金鑰的測試請求」會是 true。 */
  simulated?: true;
}

export const INACTIVE_EARTHQUAKE_STATUS: EarthquakeStatus = Object.freeze({ active: false });

/** 橫幅固定顯示視窗：從 origin_time 起算 72 小時。 */
export const EARTHQUAKE_BANNER_WINDOW_HOURS = 72;
export const EARTHQUAKE_BANNER_WINDOW_MS = EARTHQUAKE_BANNER_WINDOW_HOURS * 60 * 60 * 1000;

/** 判定「有感」所需的 cwa_earthquakes 欄位。 */
export interface EarthquakeRow {
  earthquake_no?: number | string | null;
  origin_time?: Date | string | null;
  location?: string | null;
  magnitude_value?: number | string | null;
  max_intensity?: string | null;
  area_intensity_json?: unknown;
}

const LOCATION_MAX_LENGTH = 80;

const normalizeText = (value: unknown): string => {
  if (typeof value !== "string") return "";
  try {
    return value.normalize("NFKC");
  } catch {
    return value;
  }
};

const clipText = (value: unknown, maxLength = LOCATION_MAX_LENGTH): string | undefined => {
  const text = normalizeText(value).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
};

const toTimestamp = (value: Date | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const toMagnitude = (value: number | string | null | undefined): number | undefined => {
  if (value === null || value === undefined) return undefined;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
};

/**
 * 是否「有感」：cwa_earthquakes 沒有獨立的有感／無感旗標，改用 area_intensity_json（CWA 的
 * Intensity.ShakingArea 震度分布）是否有內容來判定。mysql2 的 JSON 欄位通常會自動解析成
 * 陣列／物件，但也防一手仍是字串的情況（例如測試直接餵字串、或連線設定不同）。
 */
export const isFeltEarthquake = (row: Pick<EarthquakeRow, "area_intensity_json">): boolean => {
  const raw = row.area_intensity_json;
  if (raw === null || raw === undefined) return false;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "null" || trimmed === "[]" || trimmed === "{}") return false;
    try {
      return isFeltEarthquake({ area_intensity_json: JSON.parse(trimmed) });
    } catch {
      // 不是合法 JSON 的非空字串：寧可當作有內容（有感），不要因為格式問題漏掉真正的有感地震。
      return true;
    }
  }

  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === "object") return Object.keys(raw as Record<string, unknown>).length > 0;
  return false;
};

/** 是否仍在 72 小時顯示視窗內（事件發生後固定持續時間，不是「生效中」）。 */
export const isWithinEarthquakeBannerWindow = (
  originTime: Date | string | null | undefined,
  nowMs: number = Date.now(),
): boolean => {
  const originMs = toTimestamp(originTime);
  if (originMs === null) return false;
  return originMs + EARTHQUAKE_BANNER_WINDOW_MS > nowMs;
};

/**
 * 把 cwa_earthquakes 的列彙整成端點的回應。
 * - `rows === null`：資料庫讀不到 → inactive（呼叫端要另外決定用短 TTL，見 route）。
 * - 空陣列、或沒有任何一筆「有感且在 72 小時視窗內」→ inactive。
 * - 多筆都落在視窗內：取 origin_time 最新的一筆，不疊多個橫幅。
 */
export const buildEarthquakeStatus = (
  rows: readonly EarthquakeRow[] | null,
  nowMs: number = Date.now(),
): EarthquakeStatus => {
  if (!rows || rows.length === 0) return { active: false };

  const candidates = rows
    .filter((row) => isFeltEarthquake(row))
    .map((row) => ({ row, origin: toTimestamp(row.origin_time) }))
    .filter((c): c is { row: EarthquakeRow; origin: number } => c.origin !== null && c.origin + EARTHQUAKE_BANNER_WINDOW_MS > nowMs);

  if (candidates.length === 0) return { active: false };

  const chosen = candidates.reduce((best, cur) => (cur.origin > best.origin ? cur : best));

  const status: EarthquakeStatus = { active: true, originTime: new Date(chosen.origin).toISOString() };
  const magnitude = toMagnitude(chosen.row.magnitude_value);
  if (magnitude !== undefined) status.magnitude = magnitude;
  const maxIntensity = clipText(chosen.row.max_intensity, 20);
  if (maxIntensity) status.maxIntensity = maxIntensity;
  const location = clipText(chosen.row.location);
  if (location) status.location = location;
  return status;
};

/**
 * 瀏覽器端驗證端點回應。任何形狀不符（非物件、active 不是 true…）一律當作「沒有地震」，
 * 所以壞掉的回應不會跳出橫幅。
 */
export const parseEarthquakeStatus = (json: unknown): EarthquakeStatus => {
  if (!json || typeof json !== "object" || Array.isArray(json)) return { active: false };
  const raw = json as Record<string, unknown>;
  if (raw.active !== true) return { active: false };

  const status: EarthquakeStatus = { active: true };
  if (typeof raw.magnitude === "number" && Number.isFinite(raw.magnitude)) status.magnitude = raw.magnitude;
  if (typeof raw.maxIntensity === "string" && raw.maxIntensity.trim()) status.maxIntensity = clipText(raw.maxIntensity, 20);
  if (typeof raw.location === "string" && raw.location.trim()) status.location = clipText(raw.location);
  if (typeof raw.originTime === "string" && Number.isFinite(Date.parse(raw.originTime))) status.originTime = raw.originTime;
  if (raw.simulated === true) status.simulated = true;
  return status;
};

/** 橫幅的顯示決策：只有確定有一筆生效中才顯示，其餘（未載入、失敗、沒有地震）一律不顯示。 */
export const shouldShowEarthquakeBanner = (
  status: EarthquakeStatus | null | undefined,
): status is EarthquakeStatus & { active: true } => Boolean(status && status.active === true);

/** 路徑是否不該顯示橫幅（後台頁面）。 */
export const isEarthquakeBannerExcludedPath = (pathname: string | null | undefined): boolean =>
  typeof pathname === "string" && /^\/admin(\/|$)/.test(pathname);
