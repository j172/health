import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import type { AqxWideRecord } from "@/lib/server/aqx/fetchAqxWide";
import type { AqxNarrowRecord } from "@/lib/server/aqx/fetchAqxNarrow";

export interface AqxWideListItem {
  id: number;
  dataset_code: string;
  siteid: string;
  sitename: string;
  itemid: string;
  itemname: string;
  itemengname: string | null;
  itemunit: string | null;
  monitordate: string;
  hourly_values: (number | null)[];
}

export interface AqxNarrowListItem {
  id: number;
  dataset_code: string;
  siteid: string;
  sitename: string;
  county: string | null;
  itemid: string;
  itemname: string;
  itemengname: string | null;
  itemunit: string | null;
  monitordate: string;
  concentration: number | null;
}

/** Upserts a batch of "wide" hourly rows, keyed by (dataset_code, siteid, itemid, monitordate). */
export const upsertAqxWideRecords = async (
  records: AqxWideRecord[],
): Promise<{ inserted: number; updated: number }> =>
  chunkedUpsert(
    records,
    `
    INSERT INTO aqx_hourly_wide
      (dataset_code, siteid, sitename, itemid, itemname, itemengname, itemunit, monitordate, hourly_values, synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      sitename = VALUES(sitename),
      itemname = VALUES(itemname),
      itemengname = VALUES(itemengname),
      itemunit = VALUES(itemunit),
      hourly_values = VALUES(hourly_values),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [
      r.datasetCode,
      r.siteId,
      r.siteName,
      r.itemId,
      r.itemName,
      r.itemEngName,
      r.itemUnit,
      r.monitorDate,
      JSON.stringify(r.hourlyValues),
      now,
      now,
      now,
    ],
  );

/** Upserts a batch of "narrow" single-reading rows, keyed by (dataset_code, siteid, itemid, monitordate). */
export const upsertAqxNarrowRecords = async (
  records: AqxNarrowRecord[],
): Promise<{ inserted: number; updated: number }> =>
  chunkedUpsert(
    records,
    `
    INSERT INTO aqx_hourly_narrow
      (dataset_code, siteid, sitename, county, itemid, itemname, itemengname, itemunit, monitordate, concentration, synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      sitename = VALUES(sitename),
      county = VALUES(county),
      itemname = VALUES(itemname),
      itemengname = VALUES(itemengname),
      itemunit = VALUES(itemunit),
      concentration = VALUES(concentration),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [
      r.datasetCode,
      r.siteId,
      r.siteName,
      r.county,
      r.itemId,
      r.itemName,
      r.itemEngName,
      r.itemUnit,
      r.monitorDate,
      r.concentration,
      now,
      now,
      now,
    ],
  );

export interface AqxPageParams {
  datasetCode: string;
  keyword?: string;
  limit: number;
  offset: number;
}

/** Newest-first page of "wide" rows for one dataset, optionally filtered by site-name keyword. */
export const getAqxWidePage = async ({
  datasetCode,
  keyword,
  limit,
  offset,
}: AqxPageParams): Promise<{ rows: AqxWideListItem[]; total: number }> =>
  withConnection(async (conn) => {
    const conditions = ["dataset_code = ?"];
    const params: unknown[] = [datasetCode];
    if (keyword) {
      conditions.push("(sitename LIKE ? OR itemname LIKE ?)");
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const [countRows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM aqx_hourly_wide ${whereClause}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT id, dataset_code, siteid, sitename, itemid, itemname, itemengname, itemunit, monitordate, hourly_values
      FROM aqx_hourly_wide
      ${whereClause}
      ORDER BY monitordate DESC, sitename ASC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    return {
      total,
      rows: rows.map((r) => ({
        ...r,
        monitordate: String(r.monitordate),
        hourly_values: Array.isArray(r.hourly_values)
          ? r.hourly_values
          : JSON.parse(String(r.hourly_values ?? "[]")),
      })) as unknown as AqxWideListItem[],
    };
  });

/** Newest-first page of "narrow" rows for one dataset, optionally filtered by site-name keyword. */
export const getAqxNarrowPage = async ({
  datasetCode,
  keyword,
  limit,
  offset,
}: AqxPageParams): Promise<{ rows: AqxNarrowListItem[]; total: number }> =>
  withConnection(async (conn) => {
    const conditions = ["dataset_code = ?"];
    const params: unknown[] = [datasetCode];
    if (keyword) {
      conditions.push("(sitename LIKE ? OR itemname LIKE ?)");
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const [countRows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM aqx_hourly_narrow ${whereClause}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT id, dataset_code, siteid, sitename, county, itemid, itemname, itemengname, itemunit, monitordate, concentration
      FROM aqx_hourly_narrow
      ${whereClause}
      ORDER BY monitordate DESC, sitename ASC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    return {
      total,
      rows: rows.map((r) => ({ ...r, monitordate: String(r.monitordate) })) as unknown as AqxNarrowListItem[],
    };
  });
