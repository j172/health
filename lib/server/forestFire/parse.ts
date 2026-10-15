import { resolveForestFireLevel } from "@/lib/tools/forestFire/levels";
import type { ForestFireRow, ParsedForestFire } from "./types";

/**
 * 農業部開放資料 API「林火風險評估資訊」 — docs/2.0/track-b-opendata-phase2-3-spec.md
 * section 2.4 D-2. Measured 2026-10-15: calling without a parameter returns the
 * whole 3,001-row / 381 KB history (61 sites x 50 dates), while
 * `?CreateDate=<date>` returns only that day's 61 rows (7.7 KB). We always ask
 * for the single day.
 */
export const FOREST_FIRE_API_URL = "https://data.moa.gov.tw/api/v1/ForestFireAlertWCF/";

export const buildForestFireUrl = (today: string): string =>
  `${FOREST_FIRE_API_URL}?CreateDate=${encodeURIComponent(today)}`;

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** The Asia/Taipei (UTC+8, no DST) calendar date of an instant, as YYYY-MM-DD. Host-timezone independent. */
export const taipeiDate = (now: Date = new Date()): string =>
  new Date(now.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalises an upstream `CreateDate` to YYYY-MM-DD. Accepts "2026-10-15",
 * "2026/10/15", "2026-1-5" and a trailing time part; anything that is not a
 * real calendar date (including the string "NULL") yields null.
 */
export const normalizeCreateDate = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const match = raw.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/** Upstream writes the literal string "NULL" in `error_msg` when there is no error. */
const readErrorMessage = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text === "" || text.toUpperCase() === "NULL") return null;
  return text;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Parses the ForestFireAlertWCF payload for `today` (an Asia/Taipei ISO date).
 *
 *  - Only rows whose CreateDate equals `today` are kept (the unfiltered feed is
 *    a 50-date history).
 *  - `error_msg: "NULL"` (a string) means no error; any other message makes the
 *    row untrusted and it is reported in `errored`, not displayed.
 *  - A level that is missing, outside 0-4 or self-contradictory is reported in
 *    `unknownLevel` and NOT displayed — it is never coerced to 安全.
 *  - A duplicated site code collapses to its most severe level.
 *
 * An empty array is a legitimate "nothing published for today yet" answer. Any
 * non-array payload (MOA's other endpoints answer errors as `{RS:"ERROR",...}`)
 * throws so the caller records a failed run instead of a silent "0 rows".
 */
export const parseForestFire = (payload: unknown, today: string): ParsedForestFire => {
  if (!ISO_DATE.test(today)) {
    throw new Error(`parseForestFire: today must be an ISO date (YYYY-MM-DD), got "${today}"`);
  }
  if (!Array.isArray(payload)) {
    throw new Error("ForestFireAlertWCF payload is not an array");
  }

  const result: ParsedForestFire = {
    rows: [],
    unknownLevel: [],
    errored: [],
    ignoredNotToday: 0,
    malformed: 0,
    duplicates: 0,
  };
  const byCode = new Map<string, ForestFireRow>();

  for (const item of payload) {
    if (!isRecord(item)) {
      result.malformed += 1;
      continue;
    }

    const createdDate = normalizeCreateDate(item.CreateDate);
    if (createdDate !== today) {
      result.ignoredNotToday += 1;
      continue;
    }

    const rawCode = item.Code;
    const siteCode =
      typeof rawCode === "number" || typeof rawCode === "string" ? String(rawCode).trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!siteCode || !name) {
      result.malformed += 1;
      continue;
    }

    const errorMsg = readErrorMessage(item.error_msg);
    if (errorMsg !== null) {
      result.errored.push({ siteCode, name, errorMsg });
      continue;
    }

    const level = resolveForestFireLevel(item.warn_level, item.warn_level_chinese);
    if (level === null) {
      result.unknownLevel.push({ siteCode, name });
      continue;
    }

    const existing = byCode.get(siteCode);
    if (existing) {
      result.duplicates += 1;
      if (level > existing.level) existing.level = level;
      continue;
    }
    const parsedRow: ForestFireRow = { siteCode, name, level, createdDate };
    byCode.set(siteCode, parsedRow);
    result.rows.push(parsedRow);
  }

  return result;
};
