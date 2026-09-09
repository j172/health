import { httpGetText } from "@/lib/server/net/httpClient";
import { parseCsv } from "@/lib/server/facilities/csv";
import { withTransaction, utcNowSql } from "@/lib/server/db/mysql";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

// 內政部 (MOI) 開放資料平台 — 防救災點位三個資料集 (issue #168). All three
// already carry usable decimal lon/lat, so no geocoding step is involved
// anywhere in this file.
const RESCUE_UNITS_URL =
  "https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/57F3DD1D-A40E-49A6-8410-57303B2FF87E/resource/C38B7AC2-E7F3-4DD5-A3F3-88E623B55924/download";
const EOC_CENTERS_URL =
  "https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/57F3DD1D-A40E-49A6-8410-57303B2FF87E/resource/A570EB3B-AF83-41F2-9E38-D114B0AB1F32/download";
const SHELTERS_URL =
  "https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/ED6CF735-6C03-4573-A882-72C1BEC799CB/resource/54550E2F-4567-4C8F-BD2E-E54E9D0386B8/download";

export type DisasterLayer = "shelter" | "rescue_unit" | "eoc_center";

export interface DisasterSyncResult {
  layer: DisasterLayer;
  /** Always a post-write COUNT(*) for this layer, never the size of the batch
   * that was inserted — see the schema.ts comment on disaster_response_points
   * for why (memory: ops_ingestion_counters_and_deploy_timing.md). */
  inserted: number;
  sourceUpdatedAt: string;
}

const toNullableString = (v: string | undefined): string | null => {
  const trimmed = (v ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toDecimal = (v: string | undefined): number | null => {
  const n = Number((v ?? "").trim());
  return Number.isFinite(n) ? n : null;
};

const toIntOrNull = (v: string | undefined): number | null => {
  const trimmed = (v ?? "").trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** Splits Taiwan's standard "縣市+鄉鎮市區" county/town label into its two parts, when both are present. */
const splitCountyDistrict = (
  combined: string | undefined,
): { county: string; district: string | null } => {
  const raw = (combined ?? "").trim();
  if (!raw) return { county: "", district: null };
  const match = raw.match(/^(.+?[縣市])(.+)$/);
  if (match) {
    return { county: match[1], district: match[2] || null };
  }
  return { county: raw, district: null };
};

async function fetchCsvRows(url: string): Promise<Record<string, string>[]> {
  const { status, text } = await httpGetText(url, {
    timeoutMs: 30000,
    headers: { Accept: "text/csv, text/plain, */*" },
  });
  if (status < 200 || status >= 300 || !text) {
    throw new Error(`Disaster point CSV download failed with status ${status}: ${url}`);
  }
  return parseCsv(text);
}

/**
 * Full truncate-and-replace of one layer inside a single transaction: the
 * DELETE and the batch INSERT either both land or neither does, so the map
 * never briefly serves an empty layer mid-sync. `inserted` is read back with
 * COUNT(*) in the same transaction rather than trusted from the insert call.
 */
async function replaceLayer(
  layer: DisasterLayer,
  rows: (string | number | null)[][],
  sourceUpdatedAtSql: string,
): Promise<number> {
  return withTransaction(async (conn: PoolConnection) => {
    await conn.query("DELETE FROM disaster_response_points WHERE layer = ?", [layer]);

    const nowSql = utcNowSql();
    if (rows.length > 0) {
      const BATCH_SIZE = 500;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE).map((r) => [
          layer,
          ...r,
          sourceUpdatedAtSql,
          nowSql,
          nowSql,
        ]);
        await conn.query(
          `INSERT INTO disaster_response_points (
             layer, name, county, district, village, address, phone,
             longitude, latitude, capacity, disaster_types, indoor, outdoor,
             weak_suitable, manager_name, manager_phone,
             source_updated_at, created_at, updated_at
           ) VALUES ?`,
          [chunk],
        );
      }
    }

    const [countRows] = await conn.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM disaster_response_points WHERE layer = ?",
      [layer],
    );
    return Number(countRows?.[0]?.c ?? 0);
  });
}

/** 消防救援單位點位 (770 rows) — 消防隊名稱,地址,聯絡電話,X座標_TWD97TM121,Y座標_TWD97TM121.
 * The last two header names are mislabeled by the source: the values are plain
 * decimal longitude/latitude (e.g. 121.75,24.75), not TWD97 TM121 projected
 * coordinates — confirmed live, no coordinate conversion is applied. */
export async function syncRescueUnits(): Promise<DisasterSyncResult> {
  const records = await fetchCsvRows(RESCUE_UNITS_URL);
  const nowSql = utcNowSql();

  const rows = records
    .map((r) => {
      const name = toNullableString(r["消防隊名稱"]);
      const lng = toDecimal(r["X座標_TWD97TM121"]);
      const lat = toDecimal(r["Y座標_TWD97TM121"]);
      if (!name || lng === null || lat === null) return null;

      const address = toNullableString(r["地址"]);
      const { county, district } = splitCountyDistrict(address ?? "");

      return [
        name,
        county || "",
        district,
        null, // village
        address,
        toNullableString(r["聯絡電話"]),
        lng,
        lat,
        null, // capacity
        null, // disaster_types
        null, // indoor
        null, // outdoor
        null, // weak_suitable
        null, // manager_name
        null, // manager_phone
      ] as (string | number | null)[];
    })
    .filter((r): r is (string | number | null)[] => r !== null);

  const inserted = await replaceLayer("rescue_unit", rows, nowSql);
  return { layer: "rescue_unit", inserted, sourceUpdatedAt: nowSql };
}

/** 應變中心點位 (25 rows, one per county) — 名稱,地址,電話,是否與消防局同位置,經度,緯度. */
export async function syncEocCenters(): Promise<DisasterSyncResult> {
  const records = await fetchCsvRows(EOC_CENTERS_URL);
  const nowSql = utcNowSql();

  const rows = records
    .map((r) => {
      const name = toNullableString(r["名稱"]);
      const lng = toDecimal(r["經度"]);
      const lat = toDecimal(r["緯度"]);
      if (!name || lng === null || lat === null) return null;

      const address = toNullableString(r["地址"]);
      const { county, district } = splitCountyDistrict(address ?? "");

      return [
        name,
        county || "",
        district,
        null, // village
        address,
        toNullableString(r["電話"]),
        lng,
        lat,
        null, // capacity
        null, // disaster_types
        null, // indoor
        null, // outdoor
        null, // weak_suitable
        null, // manager_name
        null, // manager_phone
      ] as (string | number | null)[];
    })
    .filter((r): r is (string | number | null)[] => r !== null);

  const inserted = await replaceLayer("eoc_center", rows, nowSql);
  return { layer: "eoc_center", inserted, sourceUpdatedAt: nowSql };
}

const toBooleanFlag = (v: string | undefined): number | null => {
  const trimmed = (v ?? "").trim();
  if (trimmed === "") return null;
  // Source uses 是/否 (yes/no); tolerate Y/N and 1/0 defensively.
  if (["是", "Y", "y", "1", "true"].includes(trimmed)) return 1;
  if (["否", "N", "n", "0", "false"].includes(trimmed)) return 0;
  return null;
};

/** 避難收容處所點位檔案 v9 (5,973 rows) — 序號,縣市及鄉鎮市區,村里,避難收容處所地址,
 * 經度,緯度,避難收容處所名稱,預計收容村里,預計收容人數,適用災害類別,管理人姓名,
 * 管理人電話,室內,室外,適合避難弱者安置. 適用災害類別 can be a quoted, comma-containing
 * field (e.g. "水災,震災,土石流") — parsed with the shared CSV parser, never split(','). */
export async function syncShelters(): Promise<DisasterSyncResult> {
  const records = await fetchCsvRows(SHELTERS_URL);
  const nowSql = utcNowSql();

  const rows = records
    .map((r) => {
      const name = toNullableString(r["避難收容處所名稱"]);
      const lng = toDecimal(r["經度"]);
      const lat = toDecimal(r["緯度"]);
      if (!name || lng === null || lat === null) return null;

      const { county, district } = splitCountyDistrict(r["縣市及鄉鎮市區"]);

      return [
        name,
        county || "",
        district,
        toNullableString(r["村里"]),
        toNullableString(r["避難收容處所地址"]),
        toNullableString(r["管理人電話"]),
        lng,
        lat,
        toIntOrNull(r["預計收容人數"]),
        toNullableString(r["適用災害類別"]),
        toBooleanFlag(r["室內"]),
        toBooleanFlag(r["室外"]),
        toBooleanFlag(r["適合避難弱者安置"]),
        toNullableString(r["管理人姓名"]),
        toNullableString(r["管理人電話"]),
      ] as (string | number | null)[];
    })
    .filter((r): r is (string | number | null)[] => r !== null);

  const inserted = await replaceLayer("shelter", rows, nowSql);
  return { layer: "shelter", inserted, sourceUpdatedAt: nowSql };
}
