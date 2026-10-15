/**
 * Pure, client-safe helpers for the 水質 tab's 鄉鎮總硬度 lookup (issue #673,
 * Track B B-13; data.gov.tw 36605「台灣自來水公司用戶水質資訊公開」).
 *
 * No server-only imports on purpose: the browser runs `resolveHardnessLookup`
 * against the rows the API returned, and the API route runs the very same
 * function for `?county=` so what a verifier curls is what a visitor sees.
 *
 * The one rule that shapes this file: a county the dataset has no rows for must
 * never render as a blank. 36605 only covers 台灣自來水公司 (台水)'s supply
 * area — 19 of the 22 縣市 — so 臺北市 (北水處), 金門縣 and 連江縣 get an
 * explicit "不在台水轄區" answer, and "no rows" is never allowed to read as
 * "the water is bad" (or good).
 */
import { TAIWAN_COUNTIES } from "@/lib/constants/taiwanDistricts";

export interface WaterHardnessRow {
  county: string;
  district: string;
  hardnessMgPerL: number;
  unit: string;
}

export type HardnessClassKey = "soft" | "moderate" | "hard" | "very-hard";

export interface HardnessClass {
  key: HardnessClassKey;
  label: string;
  description: string;
}

/**
 * Bands follow the widely quoted USGS scale for total hardness in mg/L:
 * soft ≤ 60, moderately hard 61–120, hard 121–180, very hard > 180. They only
 * help read the number — they are not a drinking-water standard, and the page
 * says so.
 */
export const classifyHardness = (mgPerL: number): HardnessClass => {
  if (mgPerL <= 60) return { key: "soft", label: "軟水", description: "水中鈣、鎂含量低，煮水較不易結水垢。" };
  if (mgPerL <= 120) return { key: "moderate", label: "中度硬水", description: "硬度中等，一般煮水、日常使用沒有特別差異。" };
  if (mgPerL <= 180) return { key: "hard", label: "硬水", description: "煮水壺、熱水器較容易累積水垢。" };
  return { key: "very-hard", label: "極硬水", description: "水垢明顯，煮水壺與熱水器建議定期除垢。" };
};

/** Same spelling the dataset uses: 台 → 臺, trimmed. Deliberately not fuzzy. */
export const canonicalCountyName = (raw: string | null | undefined): string =>
  (raw ?? "").trim().replace(/台/g, "臺");

export const NOT_IN_TAIWAN_WATER_HEADLINE = "不在台水轄區";

export interface UnservedCounty {
  county: string;
  /** Who actually supplies tap water there. */
  supplier: string;
}

/**
 * The three counties absent from the real 36605 file (verified 2026-10-15:
 * 340 rows, 19 counties). Kept in sync with the file by a test that fails if
 * a canonical county is neither in the fixture nor listed here.
 */
export const TAIWAN_WATER_UNSERVED_COUNTIES: readonly UnservedCounty[] = [
  { county: "臺北市", supplier: "臺北自來水事業處（北水處）" },
  { county: "金門縣", supplier: "金門縣自來水廠" },
  { county: "連江縣", supplier: "連江縣自來水廠" },
];

const findUnserved = (county: string): UnservedCounty | undefined =>
  TAIWAN_WATER_UNSERVED_COUNTIES.find((c) => c.county === county);

export interface CountyHardnessSummary {
  county: string;
  count: number;
  min: number;
  max: number;
}

/** One entry per county, in the order counties first appear in `rows`. */
export const summarizeHardnessByCounty = (rows: readonly WaterHardnessRow[]): CountyHardnessSummary[] => {
  const byCounty = new Map<string, CountyHardnessSummary>();
  for (const row of rows) {
    const existing = byCounty.get(row.county);
    if (existing) {
      existing.count += 1;
      existing.min = Math.min(existing.min, row.hardnessMgPerL);
      existing.max = Math.max(existing.max, row.hardnessMgPerL);
    } else {
      byCounty.set(row.county, {
        county: row.county,
        count: 1,
        min: row.hardnessMgPerL,
        max: row.hardnessMgPerL,
      });
    }
  }
  return [...byCounty.values()];
};

export type HardnessLookup =
  | { kind: "overview"; total: number; counties: CountyHardnessSummary[]; unserved: readonly UnservedCounty[] }
  | {
      kind: "not-in-taiwan-water-area";
      county: string;
      district: string;
      supplier: string;
      headline: string;
      message: string;
    }
  | { kind: "no-data"; county: string; headline: string; message: string }
  | { kind: "unknown-county"; county: string; headline: string; message: string }
  | { kind: "county-not-listed"; county: string; headline: string; message: string }
  | { kind: "county"; county: string; rows: WaterHardnessRow[]; min: number; max: number }
  | {
      kind: "district";
      county: string;
      row: WaterHardnessRow;
      hardnessClass: HardnessClass;
      countyMin: number;
      countyMax: number;
    }
  | { kind: "district-not-listed"; county: string; district: string; headline: string; message: string };

export const buildNotInTaiwanWaterMessage = (county: string, supplier: string): string =>
  `${county}${NOT_IN_TAIWAN_WATER_HEADLINE}（台灣自來水公司的供水範圍之外）：當地自來水由${supplier}供應，` +
  `所以台水公開的鄉鎮水質硬度資料裡沒有${county}。沒有數值不代表水質好或不好，只是這份資料沒有涵蓋；` +
  `請向${supplier}查詢當地水質資訊。`;

/**
 * Resolves what the 水質 tab should show for a (county, district) selection.
 *
 * Order matters: the "not in 台水 supply area" check comes first and does not
 * depend on `rows`, so 臺北市 is explained even before the first sync has
 * filled the table, and even when a visitor picks a 臺北市 district.
 */
export const resolveHardnessLookup = (
  rows: readonly WaterHardnessRow[],
  county: string | null | undefined,
  district?: string | null,
): HardnessLookup => {
  const canonicalCounty = canonicalCountyName(county);
  const canonicalDistrict = (district ?? "").trim();

  if (!canonicalCounty) {
    return {
      kind: "overview",
      total: rows.length,
      counties: summarizeHardnessByCounty(rows),
      unserved: TAIWAN_WATER_UNSERVED_COUNTIES,
    };
  }

  const unserved = findUnserved(canonicalCounty);
  if (unserved) {
    return {
      kind: "not-in-taiwan-water-area",
      county: canonicalCounty,
      district: canonicalDistrict,
      supplier: unserved.supplier,
      headline: NOT_IN_TAIWAN_WATER_HEADLINE,
      message: buildNotInTaiwanWaterMessage(canonicalCounty, unserved.supplier),
    };
  }

  if (!(TAIWAN_COUNTIES as readonly string[]).includes(canonicalCounty)) {
    return {
      kind: "unknown-county",
      county: canonicalCounty,
      headline: "無法辨識的縣市",
      message: `無法辨識「${canonicalCounty}」，請從清單中選擇縣市。`,
    };
  }

  if (rows.length === 0) {
    return {
      kind: "no-data",
      county: canonicalCounty,
      headline: "水質資料尚未同步",
      message: "水質硬度資料尚未同步到本站，請稍後再試。",
    };
  }

  const countyRows = rows.filter((r) => r.county === canonicalCounty);
  if (countyRows.length === 0) {
    return {
      kind: "county-not-listed",
      county: canonicalCounty,
      headline: "資料集沒有這個縣市",
      message: `台水公開資料目前沒有列出${canonicalCounty}的水質硬度。這不代表水質好或不好，請洽當地供水單位。`,
    };
  }

  const values = countyRows.map((r) => r.hardnessMgPerL);
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (!canonicalDistrict) {
    return { kind: "county", county: canonicalCounty, rows: countyRows, min, max };
  }

  const row = countyRows.find((r) => r.district === canonicalDistrict);
  if (!row) {
    return {
      kind: "district-not-listed",
      county: canonicalCounty,
      district: canonicalDistrict,
      headline: "資料集沒有這個行政區",
      message:
        `台水公開資料沒有列出${canonicalCounty}${canonicalDistrict}的水質硬度。這不代表水質好或不好：` +
        `該行政區可能不在台水供水轄區內（例如由臺北自來水事業處或其他單位供水），或資料集尚未收錄，請洽當地供水單位。`,
    };
  }

  return {
    kind: "district",
    county: canonicalCounty,
    row,
    hardnessClass: classifyHardness(row.hardnessMgPerL),
    countyMin: min,
    countyMax: max,
  };
};
