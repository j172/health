import { httpGetText } from "@/lib/server/net/httpClient";
import { parseCsv } from "@/lib/server/facilities/csv";
import { withTransaction, utcNowSql } from "@/lib/server/db/mysql";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

// 衛生福利部疾病管制署 (CDC) 近12個月登革熱病媒蚊調查資料 (issue #269).
// data.gov.tw/dataset/24161 — 全國版，每日更新，政府資料開放授權條款-第1版.
// Only the national ("All") CSV is fetched: the Tainan/Kaohsiung/Pingtung
// county-specific downloads on the same dataset page are filtered subsets of
// this same file (same VillageID keys), not additional coverage.
const NATIONAL_CSV_URL = "https://od.cdc.gov.tw/eic/MosIndex_All_last12m.csv";

export interface DengueVectorSyncResult {
  /** Always a post-write COUNT(*), never the size of the batch that was
   * inserted — see the schema.ts comment on dengue_vector_surveys for why
   * (memory: ops_ingestion_counters_and_deploy_timing.md). */
  inserted: number;
  sourceUpdatedAt: string;
}

const toNullableString = (v: string | undefined): string | null => {
  const trimmed = (v ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toDecimalOrNull = (v: string | undefined): number | null => {
  const trimmed = (v ?? "").trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
};

const toLevelOrNull = (v: string | undefined): number | null => {
  const trimmed = (v ?? "").trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** Source dates look like "2026-09-14" or "2026/09/14" — normalized to YYYY-MM-DD for the DATE column and for chronological comparison. */
const normalizeDate = (v: string | undefined): string | null => {
  const trimmed = (v ?? "").trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
};

async function fetchCsvRows(url: string): Promise<Record<string, string>[]> {
  const { status, text } = await httpGetText(url, {
    timeoutMs: 60000,
    headers: { Accept: "text/csv, text/plain, */*" },
  });
  if (status < 200 || status >= 300 || !text) {
    throw new Error(`Dengue vector survey CSV download failed with status ${status}: ${url}`);
  }
  return parseCsv(text);
}

export interface VillageRow {
  villageId: string;
  county: string;
  town: string;
  village: string;
  lng: number;
  lat: number;
  surveyDate: string;
  bi: number | null;
  biLv: number | null;
  hi: number | null;
  hiLv: number | null;
  ci: number | null;
  ciLv: number | null;
  li: number | null;
  liLv: number | null;
  ai: number | null;
  con100hh: number | null;
}

/**
 * The source is a rolling 12-month *history* — one row per village per
 * survey date, so a frequently-surveyed village appears many times. This
 * reduces it to exactly one row per VillageID: whichever row has the most
 * recent Date. The map only ever needs each village's current reading, not
 * its full history (see the schema.ts comment on dengue_vector_surveys).
 */
export function dedupeLatestPerVillage(records: Record<string, string>[]): VillageRow[] {
  const latestByVillage = new Map<string, VillageRow>();

  for (const r of records) {
    const villageId = toNullableString(r["VillageID"]);
    const surveyDate = normalizeDate(r["Date"]);
    const lng = toDecimalOrNull(r["VillageLon"]);
    const lat = toDecimalOrNull(r["VillageLat"]);
    const county = toNullableString(r["County"]);
    const town = toNullableString(r["Town"]);
    const village = toNullableString(r["Village"]);
    if (!villageId || !surveyDate || lng === null || lat === null || !county || !town || !village) {
      continue;
    }

    const existing = latestByVillage.get(villageId);
    if (existing && existing.surveyDate >= surveyDate) continue;

    latestByVillage.set(villageId, {
      villageId,
      county,
      town,
      village,
      lng,
      lat,
      surveyDate,
      bi: toDecimalOrNull(r["BI"]),
      biLv: toLevelOrNull(r["BILv"]),
      hi: toDecimalOrNull(r["HI"]),
      hiLv: toLevelOrNull(r["HILv"]),
      ci: toDecimalOrNull(r["CI"]),
      ciLv: toLevelOrNull(r["CILv"]),
      li: toDecimalOrNull(r["LI"]),
      liLv: toLevelOrNull(r["LILv"]),
      ai: toDecimalOrNull(r["AI"]),
      con100hh: toDecimalOrNull(r["Con100HH"]),
    });
  }

  return Array.from(latestByVillage.values());
}

/**
 * Full truncate-and-replace inside a single transaction: the DELETE and the
 * batch INSERT either both land or neither does, so the map never briefly
 * serves an empty table mid-sync. `inserted` is read back with COUNT(*) in
 * the same transaction rather than trusted from the insert call (same
 * pattern as lib/server/disaster/ingestDisasterPoints.ts).
 */
async function replaceAll(rows: VillageRow[], sourceUpdatedAtSql: string): Promise<number> {
  return withTransaction(async (conn: PoolConnection) => {
    await conn.query("DELETE FROM dengue_vector_surveys");

    const nowSql = utcNowSql();
    if (rows.length > 0) {
      const BATCH_SIZE = 500;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE).map((r) => [
          r.villageId,
          r.county,
          r.town,
          r.village,
          r.lng,
          r.lat,
          r.surveyDate,
          r.bi,
          r.biLv,
          r.hi,
          r.hiLv,
          r.ci,
          r.ciLv,
          r.li,
          r.liLv,
          r.ai,
          r.con100hh,
          sourceUpdatedAtSql,
          nowSql,
          nowSql,
        ]);
        await conn.query(
          `INSERT INTO dengue_vector_surveys (
             village_id, county, town, village, longitude, latitude, survey_date,
             bi, bi_lv, hi, hi_lv, ci, ci_lv, li, li_lv, ai, con100hh,
             source_updated_at, created_at, updated_at
           ) VALUES ?`,
          [chunk],
        );
      }
    }

    const [countRows] = await conn.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM dengue_vector_surveys",
    );
    return Number(countRows?.[0]?.c ?? 0);
  });
}

/** 登革熱病媒蚊調查資料同步 (issue #269) — 全國村里級 BI/HI/CI/LI/AI 密度指數. */
export async function syncDengueVectorSurvey(): Promise<DengueVectorSyncResult> {
  const records = await fetchCsvRows(NATIONAL_CSV_URL);
  const rows = dedupeLatestPerVillage(records);
  const nowSql = utcNowSql();

  const inserted = await replaceAll(rows, nowSql);
  return { inserted, sourceUpdatedAt: nowSql };
}
