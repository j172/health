/**
 * Data-provenance notices for facility tools whose source can only be
 * refreshed by hand (issue #678, Track B B-8).
 *
 * data.gov.tw 115950 (全國開業護理機構清冊, nhplatform.mohw.gov.tw) times out
 * from both the production host and GitHub runners, and the owner ruled out a
 * relay (spec §7.1 D7) — so the rows exist only after somebody runs
 * scripts/import-nhplatform-nursing-institutions.mjs from a residential
 * network. A tool backed by such a source has to be honest about two states:
 *
 *   - rows present  -> show the 資料日期 (when this site last imported them);
 *   - zero rows     -> say 「資料暫缺」, never the generic "附近查無收錄…"
 *                      empty-state, which reads like "none exist near you".
 *
 * Pure and dependency-free on purpose: the client component renders whatever
 * these functions decide, and the unit tests cover both states without a DOM.
 */

/** What `/api/facilities?dataStatusSource=<key>` returns for that source. */
export interface FacilityDataStatus {
  /** Rows currently stored under the source key (not filtered by search). */
  sourceTotal: number;
  /** Taiwan-local YYYY-MM-DD of the newest import of those rows; null when there are none. */
  dataDate: string | null;
}

/** Per-tool config for the notice (see FacilitySearchConfig.dataStatus). */
export interface FacilityDataStatusConfig {
  /** `facilities.source_key` of the manually imported source whose row count and date are reported. */
  sourceKey: string;
  /** Noun used in the "資料暫缺" sentence, e.g. "產後護理之家". */
  subject: string;
  /** Human-readable source name shown in both states. */
  sourceLabel: string;
  /** Link to the official dataset page. */
  sourceUrl?: string;
  /**
   * When set, the notice only applies while the category dropdown holds one of
   * these values (/tools/long-term-care: the two nursing-institution
   * categories). Omitted = the whole tool is backed by the source.
   */
  onlyForCategories?: readonly string[];
  /** Appended to the "資料暫缺" message when other sources still fill part of the list. */
  partialNote?: string;
}

export type FacilityDataNotice =
  | { state: "missing"; heading: string; message: string; sourceUrl?: string }
  | { state: "available"; dataDateLabel: string; message: string; sourceUrl?: string };

export const DATA_STATUS_MISSING_HEADING = "資料暫缺";

/** `facilities.source_key` is VARCHAR(40); keys are lower-case snake_case. */
const SOURCE_KEY_PATTERN = /^[a-z0-9_]{1,40}$/;

const TAIWAN_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * A Date (or ISO string, or already-formatted YYYY-MM-DD) -> Taiwan-local
 * YYYY-MM-DD. `synced_at` is stored as a UTC wall-clock, so 17:30Z on the 15th
 * is already the 16th in Taiwan — the date the person running the import saw.
 */
export function formatDataDate(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return TAIWAN_DATE_FORMAT.format(date);
}

/** Raw `SELECT COUNT(*), MAX(synced_at)` values -> the wire shape. A zero-row source never carries a date. */
export function toFacilityDataStatus(total: unknown, lastSyncedAt: unknown): FacilityDataStatus {
  const n = Number(total);
  const sourceTotal = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
  if (sourceTotal === 0) return { sourceTotal: 0, dataDate: null };
  const dataDate = formatDataDate(lastSyncedAt instanceof Date || typeof lastSyncedAt === "string" ? lastSyncedAt : null);
  return { sourceTotal, dataDate };
}

/** Validates the `dataStatusSource` query value before it reaches SQL (it is still bound as a parameter). */
export function parseDataStatusSourceParam(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  return value && SOURCE_KEY_PATTERN.test(value) ? value : null;
}

/** Whether the notice applies right now (always, unless the config is gated to certain categories). */
export function isDataStatusActive(config: FacilityDataStatusConfig | undefined, category: string): boolean {
  if (!config) return false;
  return !config.onlyForCategories || config.onlyForCategories.includes(category);
}

/** True only when the API positively reported zero rows; an unknown status is never "missing". */
export function isFacilityDataMissing(
  config: FacilityDataStatusConfig | undefined,
  status: FacilityDataStatus | null | undefined,
  category: string,
): boolean {
  return isDataStatusActive(config, category) && status?.sourceTotal === 0;
}

/** null = unknown status (API failed or predates the feature): render nothing rather than guess. */
export function buildDataStatusNotice(
  config: FacilityDataStatusConfig,
  status: FacilityDataStatus | null | undefined,
): FacilityDataNotice | null {
  if (!status) return null;

  if (status.sourceTotal === 0) {
    return {
      state: "missing",
      heading: DATA_STATUS_MISSING_HEADING,
      message:
        `目前本站尚未收錄${config.subject}的名冊資料。來源「${config.sourceLabel}」的伺服器無法從本站主機連線，` +
        `無法自動更新，需由管理者從住宅網路人工匯入，這一批尚未完成。` +
        `這不代表附近沒有${config.subject}；請改向各縣市衛生局查詢，或直接查閱原始資料集。` +
        (config.partialNote ?? ""),
      sourceUrl: config.sourceUrl,
    };
  }

  return {
    state: "available",
    dataDateLabel: `資料日期：${status.dataDate ?? "不明"}`,
    message:
      `（本站最近一次匯入此名冊的日期）。資料來源：${config.sourceLabel}，依公開資料整理、非本站判定；` +
      `名冊約每年更新一次、由人工匯入，實際開業狀況請以各縣市衛生局公告為準。`,
    sourceUrl: config.sourceUrl,
  };
}
