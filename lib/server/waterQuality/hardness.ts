/**
 * data.gov.tw 36605「台灣自來水公司用戶水質資訊公開」— 各縣市鄉鎮區的自來水總硬度
 * (issue #673, Track B B-13).
 *
 * Live shape, verified 2026-10-15 from https://www.water.gov.tw/opendata/qual5.csv:
 * UTF-8 **with a BOM**, CRLF line endings, 16.8 KB, header
 * `檢驗項目,縣市別,鄉鎮市區別,檢驗數值,單位`, 340 data rows — all 總硬度, all in
 * 毫克/公升, 19 縣市 (no 臺北市／金門縣／連江縣: they are outside 台水's supply
 * area). There is **no date column** in the file, so the page can only show
 * this site's own last-sync time (spec §4 item 8 says to prefer an in-file
 * date; there isn't one to prefer).
 *
 * www.water.gov.tw is already used by the live 停水公告 pipeline, so it is
 * treated as reachable from the production host (spec §3).
 */
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseWraCsv } from "@/lib/server/water/wraCsvParser";
import { canonicalCountyName, type WaterHardnessRow } from "@/lib/server/waterQuality/hardnessLookup";

export const WATER_HARDNESS_SOURCE_URL = "https://www.water.gov.tw/opendata/qual5.csv";
export const WATER_HARDNESS_ITEM = "總硬度";
export const WATER_HARDNESS_FEED_CODE = "water-hardness-36605";

/** Strict on purpose: "ND", "<1", "-5" and blanks are dropped rather than coerced to a number. */
const NUMBER_PATTERN = /^\d+(?:\.\d+)?$/;

/**
 * Parses the CSV text into one row per (county, district). The BOM and CRLF are
 * handled by `parseWraCsv`. Only 總硬度 rows are kept, so a future second test
 * item in the same file cannot collapse into the same upsert key; a repeated
 * (county, district) keeps the last row. Returns `[]` for text that is not the
 * expected CSV at all (e.g. an HTML error page) — callers treat `[]` as a failed
 * fetch.
 */
export const parseWaterHardness = (text: string): WaterHardnessRow[] => {
  const byKey = new Map<string, WaterHardnessRow>();

  for (const record of parseWraCsv(text)) {
    if ((record["檢驗項目"] ?? "").trim() !== WATER_HARDNESS_ITEM) continue;

    const county = canonicalCountyName(record["縣市別"]);
    const district = (record["鄉鎮市區別"] ?? "").trim();
    const rawValue = (record["檢驗數值"] ?? "").trim();
    if (!county || !district || !NUMBER_PATTERN.test(rawValue)) continue;

    const unit = (record["單位"] ?? "").trim() || "毫克/公升";
    byKey.set(`${county}|${district}`, {
      county,
      district,
      hardnessMgPerL: Number(rawValue),
      unit,
    });
  }

  return [...byKey.values()];
};

/**
 * Downloads and parses the current snapshot. Throws (rather than returning an
 * empty list) on a non-2xx status or when nothing parseable came back, so the
 * sync records an ingest error and leaves the table untouched.
 */
export const fetchWaterHardness = async (): Promise<WaterHardnessRow[]> => {
  const { status, text } = await httpGetText(WATER_HARDNESS_SOURCE_URL, {
    timeoutMs: 25_000,
    // The real file is ~17 KB; anything near this cap is not the file we expect.
    maxResponseBytes: 2 * 1024 * 1024,
    headers: { Accept: "text/csv, text/plain, */*" },
  });

  if (status < 200 || status >= 300) {
    throw new Error(`Water hardness CSV (data.gov.tw 36605) download failed with status ${status}`);
  }

  const rows = parseWaterHardness(text);
  if (rows.length === 0) {
    throw new Error("Water hardness CSV (data.gov.tw 36605) contained no parseable 總硬度 rows");
  }
  return rows;
};
