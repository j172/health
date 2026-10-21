/**
 * 颱風警報狀態（issue #744）— 純函式，伺服器與瀏覽器共用，不含任何 I/O。
 *
 * 用途只有一個：告訴訪客「颱風警報生效中，明天是否停班停課請以官方公告為準」，
 * 並導向官方頁面。本站刻意不轉述任何縣市是否停班停課（見
 * lib/tools/workSchoolStatus/closureGuidance.ts），所以這裡沒有任何縣市欄位。
 *
 * 海上／陸上判斷依據（CWA 颱風警報 W-C0034-001 的 CAP `event`／`headline`）：
 *   中央氣象署颱風警報的種類是「海上警報」「海上陸上警報」「陸上警報」。
 *   - 文字含「陸上」（含「海上陸上警報」）→ 陸上（紅色）
 *   - 只含「海上」→ 海上（橙色）
 *   - 兩者都沒有、或是空值／亂碼 → 無法判斷 → 一律當陸上（紅色，寧可過度提醒）
 * 只看 event 與 headline，不看 description／instruction：後者是長篇內文，海上警報的
 * 內文可能提到「陸上」（例如「是否發布陸上警報將視情況」），會把海上誤判成陸上；
 * 這個方向雖然安全，但會讓橙色永遠出不來，所以只看標題類欄位。
 * 注意：目前沒有對臺警報，正式資料的實際字串格式尚未驗證，以上是依警報種類名稱的推測。
 */

export type TyphoonLevel = "land" | "sea";

export interface TyphoonStatus {
  active: boolean;
  level: TyphoonLevel | null;
  /** 生效中警報的名稱（來自 CAP event／headline，已截短），只作為備註資訊。 */
  name?: string;
  /**
   * 目前 CWA 追蹤中的颱風完整名稱（來自颱風動態 W-C0034-005，例如「輕度颱風 薔琵 (CHAMPI) 第29號」），
   * 最多 MAX_TYPHOON_NAMES 個。拿不到時省略，橫幅照常顯示、只是不帶名稱。
   */
  names?: string[];
  /** 發布時間（ISO 8601, UTC）。 */
  issuedAt?: string;
  /** 只有「持有正確金鑰的測試請求」會是 true（見 lib/server/typhoon/simulation.ts）。 */
  simulated?: true;
}

export const INACTIVE_TYPHOON_STATUS: TyphoonStatus = Object.freeze({ active: false, level: null });

/** 一筆生效中的 W-C0034-001 列（cwa_alerts）中判斷所需的欄位。 */
export interface TyphoonWarningRow {
  event?: string | null;
  headline?: string | null;
  effective?: Date | string | null;
  synced_at?: Date | string | null;
}

const LAND_PATTERN = /陸上|陆上|\bland\b/i;
const SEA_PATTERN = /海上|\bsea\b/i;

const NAME_MAX_LENGTH = 60;

/** 橫幅最多並列幾個颱風名稱。 */
export const MAX_TYPHOON_NAMES = 3;

const normalizeText = (value: unknown): string => {
  if (typeof value !== "string") return "";
  try {
    return value.normalize("NFKC");
  } catch {
    return value;
  }
};

/**
 * 單一警報的海陸判斷。傳入 event／headline 等標題類欄位。
 * 含「陸上」→ land；否則含「海上」→ sea；其餘（含空值、亂碼、非字串）→ land。
 */
export const classifyTyphoonLevel = (fields: readonly unknown[]): TyphoonLevel => {
  const text = fields.map(normalizeText).join(" ");
  if (LAND_PATTERN.test(text)) return "land";
  if (SEA_PATTERN.test(text)) return "sea";
  return "land";
};

const toTimestamp = (value: Date | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const clipName = (value: string | null | undefined): string | undefined => {
  const text = normalizeText(value).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > NAME_MAX_LENGTH ? `${text.slice(0, NAME_MAX_LENGTH - 1)}…` : text;
};

/**
 * 從颱風動態（W-C0034-005）的 event 字串挑出要顯示的颱風名稱：
 * 熱帶性低氣壓（只有編號、沒有名字，如「熱帶性低氣壓 TD22」）不列入；去重、截短、最多 MAX_TYPHOON_NAMES 個。
 */
export const pickTyphoonNames = (events: readonly unknown[] | null | undefined): string[] => {
  if (!events) return [];
  const names: string[] = [];
  for (const event of events) {
    const name = clipName(typeof event === "string" ? event : undefined);
    if (!name || /^熱帶性低氣壓/.test(name) || names.includes(name)) continue;
    names.push(name);
    if (names.length >= MAX_TYPHOON_NAMES) break;
  }
  return names;
};

/**
 * 把生效中的列彙整成端點的回應。
 * - `rows === null`：資料庫讀不到 → 回 inactive（呼叫端要另外決定用短 TTL，見 route）。
 * - 空陣列：沒有警報 → inactive。
 * - 多筆：只要有任何一筆是陸上就是陸上；name／issuedAt 取「陸上優先、其次最新發布」的那一筆。
 */
export const buildTyphoonStatus = (rows: readonly TyphoonWarningRow[] | null): TyphoonStatus => {
  if (!rows || rows.length === 0) return { active: false, level: null };

  const classified = rows.map((row) => ({
    row,
    level: classifyTyphoonLevel([row.event, row.headline]),
    issued: toTimestamp(row.effective) ?? toTimestamp(row.synced_at),
  }));

  const level: TyphoonLevel = classified.some((c) => c.level === "land") ? "land" : "sea";
  const pool = classified.filter((c) => c.level === level);
  const chosen = pool.reduce((best, cur) => ((cur.issued ?? -Infinity) > (best.issued ?? -Infinity) ? cur : best));

  const status: TyphoonStatus = { active: true, level };
  const name = clipName(chosen.row.event) ?? clipName(chosen.row.headline);
  if (name) status.name = name;
  if (chosen.issued !== null) status.issuedAt = new Date(chosen.issued).toISOString();
  return status;
};

/**
 * 瀏覽器端驗證端點回應。任何形狀不符（非物件、active 不是 true、level 不合法…）
 * 一律當作「沒有警報」，所以壞掉的回應不會跳出橫幅。
 * 例外：active===true 但 level 缺失／不合法時，仍視為生效並當陸上（與「無法判斷＝陸上」一致）。
 */
export const parseTyphoonStatus = (json: unknown): TyphoonStatus => {
  if (!json || typeof json !== "object" || Array.isArray(json)) return { active: false, level: null };
  const raw = json as Record<string, unknown>;
  if (raw.active !== true) return { active: false, level: null };

  const status: TyphoonStatus = { active: true, level: raw.level === "sea" ? "sea" : "land" };
  if (typeof raw.name === "string" && raw.name.trim()) status.name = clipName(raw.name);
  if (typeof raw.issuedAt === "string" && Number.isFinite(Date.parse(raw.issuedAt))) status.issuedAt = raw.issuedAt;
  if (Array.isArray(raw.names)) {
    const names = pickTyphoonNames(raw.names);
    if (names.length > 0) status.names = names;
  }
  if (raw.simulated === true) status.simulated = true;
  return status;
};

/** 橫幅／卡片的顯示決策：只有確定生效才顯示，其餘（未載入、失敗、無警報）一律不顯示。 */
export const shouldShowTyphoonBanner = (status: TyphoonStatus | null | undefined): status is TyphoonStatus & { level: TyphoonLevel } =>
  Boolean(status && status.active && (status.level === "land" || status.level === "sea"));

/** 路徑是否不該顯示橫幅（後台頁面）。 */
export const isTyphoonBannerExcludedPath = (pathname: string | null | undefined): boolean =>
  typeof pathname === "string" && /^\/admin(\/|$)/.test(pathname);
