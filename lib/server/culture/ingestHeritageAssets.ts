import { httpGetText } from "@/lib/server/net/httpClient";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import type { ResultSetHeader } from "mysql2/promise";

// 文化部文化資產局 (BOCH) 開放資料平台 — 文化資產個案 (issue #170). Both
// datasets already carry usable decimal longitude/latitude, so no geocoding
// step is involved anywhere in this file (same as
// lib/server/disaster/ingestDisasterPoints.ts). Unlike that module, both
// datasets here carry a stable cross-run identifier (`caseId`), so this is a
// plain upsert against `case_id`, not a truncate-and-replace.
const BUILDING_CASE_URL =
  "https://data.boch.gov.tw/opendata/v2/assetsCase/1.2.json";
const ARCHAEOLOGICAL_SITE_URL =
  "https://data.boch.gov.tw/opendata/v2/assetsCase/2.1.json";

export type HeritageCategory =
  | "building"
  | "archaeological_site"
  | "memorial_building"
  | "settlement"
  | "historical_site"
  | "cultural_landscape";

export interface HeritageCategorySyncResult {
  category: HeritageCategory;
  totalFetched: number;
  validRecords: number;
  insertedOrUpdated: number;
}

export interface HeritageAssetsSyncResult {
  building: HeritageCategorySyncResult;
  archaeologicalSite: HeritageCategorySyncResult;
}

interface HeritageAssetRow {
  caseId: string;
  category: HeritageCategory;
  caseName: string;
  assetsTypeNames: string | null;
  classifyCode: string | null;
  classifyName: string | null;
  cityName: string | null;
  distName: string | null;
  address: string | null;
  pastHistory: string | null;
  registerReason: string | null;
  govInstitutionName: string | null;
  longitude: number | null;
  latitude: number | null;
  imageUrl: string | null;
  imageSource: string | null;
}

function toSafeString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(toSafeString).filter(Boolean).join("、");
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

function toNullableString(v: unknown): string | null {
  const s = toSafeString(v);
  return s.length > 0 ? s : null;
}

/** Source sends 0/0 for a handful of records with genuinely unknown
 * coordinates (confirmed live 2026-09-09, e.g. caseId 20220831000001) —
 * treated the same as a missing value, not a real point at (0,0). */
function toDecimalOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

function firstAddress(addresses: unknown): {
  cityName: string | null;
  distName: string | null;
  address: string | null;
} {
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return { cityName: null, distName: null, address: null };
  }
  const a = addresses[0] as Record<string, unknown>;
  return {
    cityName: toNullableString(a?.cityName),
    distName: toNullableString(a?.distName),
    address: toNullableString(a?.address),
  };
}

async function fetchJsonArray(url: string): Promise<any[]> {
  const { status, text } = await httpGetText(url, {
    timeoutMs: 60000,
    headers: { Accept: "application/json, text/plain, */*" },
  });
  if (status < 200 || status >= 300 || !text) {
    throw new Error(`Heritage assets JSON download failed with status ${status}: ${url}`);
  }
  const json = JSON.parse(text);
  if (!Array.isArray(json)) {
    throw new Error(`Unexpected non-array JSON payload from ${url}`);
  }
  return json;
}

function normalizeBuildingRecord(item: any): HeritageAssetRow | null {
  const caseId = toNullableString(item?.caseId);
  const caseName = toNullableString(item?.caseName);
  if (!caseId || !caseName) return null;

  const { cityName, distName, address } = firstAddress(item?.addresses);

  return {
    caseId,
    category: "building",
    caseName,
    assetsTypeNames: toNullableString(
      Array.isArray(item?.assetsTypes)
        ? item.assetsTypes.map((t: any) => t?.name).filter(Boolean)
        : null,
    ),
    classifyCode: null,
    classifyName: null,
    cityName,
    distName,
    address,
    pastHistory: toNullableString(item?.pastHistory),
    registerReason: toNullableString(item?.registerReason),
    govInstitutionName: toNullableString(item?.govInstitutionName),
    longitude: toDecimalOrNull(item?.longitude),
    latitude: toDecimalOrNull(item?.latitude),
    // Building dataset never sends representImageSource (confirmed live
    // 2026-09-09) — only representImage.original.
    imageUrl: toNullableString(item?.representImage?.original),
    imageSource: null,
  };
}

function normalizeArchaeologicalSiteRecord(item: any): HeritageAssetRow | null {
  const caseId = toNullableString(item?.caseId);
  const caseName = toNullableString(item?.caseName);
  if (!caseId || !caseName) return null;

  const { cityName, distName, address } = firstAddress(item?.addresses);

  return {
    caseId,
    category: "archaeological_site",
    caseName,
    assetsTypeNames: null,
    classifyCode: toNullableString(item?.assetsClassifyCode),
    classifyName: toNullableString(item?.assetsClassifyName),
    cityName,
    distName,
    address,
    pastHistory: toNullableString(item?.pastHistory),
    registerReason: toNullableString(item?.registerReason),
    govInstitutionName: toNullableString(item?.govInstitutionName),
    longitude: toDecimalOrNull(item?.longitude),
    latitude: toDecimalOrNull(item?.latitude),
    imageUrl: toNullableString(item?.representImage?.original),
    imageSource: toNullableString(item?.representImageSource),
  };
}

async function upsertRows(rows: HeritageAssetRow[], nowSql: string): Promise<number> {
  if (rows.length === 0) return 0;

  let countProcessed = 0;
  const BATCH_SIZE = 200;

  await withConnection(async (conn) => {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE);
      const values = chunk.map((r) => [
        r.caseId,
        r.category,
        r.caseName,
        r.assetsTypeNames,
        r.classifyCode,
        r.classifyName,
        r.cityName,
        r.distName,
        r.address,
        r.pastHistory,
        r.registerReason,
        r.govInstitutionName,
        r.longitude,
        r.latitude,
        r.imageUrl,
        r.imageSource,
        nowSql,
        nowSql,
        nowSql,
      ]);

      await conn.query<ResultSetHeader>(
        `INSERT INTO heritage_assets (
           case_id, category, case_name, assets_type_names, classify_code,
           classify_name, city_name, dist_name, address, past_history,
           register_reason, gov_institution_name, longitude, latitude,
           image_url, image_source, source_updated_at, created_at, updated_at
         ) VALUES ?
         ON DUPLICATE KEY UPDATE
           category = VALUES(category),
           case_name = VALUES(case_name),
           assets_type_names = VALUES(assets_type_names),
           classify_code = VALUES(classify_code),
           classify_name = VALUES(classify_name),
           city_name = VALUES(city_name),
           dist_name = VALUES(dist_name),
           address = VALUES(address),
           past_history = VALUES(past_history),
           register_reason = VALUES(register_reason),
           gov_institution_name = VALUES(gov_institution_name),
           longitude = VALUES(longitude),
           latitude = VALUES(latitude),
           image_url = VALUES(image_url),
           image_source = VALUES(image_source),
           source_updated_at = VALUES(source_updated_at),
           updated_at = VALUES(updated_at)`,
        [values],
      );
      countProcessed += chunk.length;
    }
  });

  return countProcessed;
}

async function syncCategory(
  category: HeritageCategory,
  url: string,
  normalize: (item: any) => HeritageAssetRow | null,
  nowSql: string,
): Promise<HeritageCategorySyncResult> {
  const raw = await fetchJsonArray(url);
  const rows = raw
    .map(normalize)
    .filter((r): r is HeritageAssetRow => r !== null);

  const insertedOrUpdated = await upsertRows(rows, nowSql);

  return {
    category,
    totalFetched: raw.length,
    validRecords: rows.length,
    insertedOrUpdated,
  };
}

export async function runHeritageAssetsSync(): Promise<HeritageAssetsSyncResult> {
  const nowSql = utcNowSql();

  const building = await syncCategory(
    "building",
    BUILDING_CASE_URL,
    normalizeBuildingRecord,
    nowSql,
  );
  const archaeologicalSite = await syncCategory(
    "archaeological_site",
    ARCHAEOLOGICAL_SITE_URL,
    normalizeArchaeologicalSiteRecord,
    nowSql,
  );

  return { building, archaeologicalSite };
}
