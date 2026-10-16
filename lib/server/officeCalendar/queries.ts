import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import type { IsoDate, OfficeCalendarDay } from "@/lib/tools/workSchoolStatus/calendar";
import { OFFICE_CALENDAR_UPSERT_SQL, toOfficeCalendarTuple } from "./upsertStatement";

/**
 * Upserts one year's rows, keyed by calendar date (the table's only UNIQUE
 * KEY). A re-run updates the same rows; a government correction overwrites the
 * changed days in place. Nothing is ever deleted: a calendar day cannot stop
 * existing, and a file that omits days is refused upstream (see syncCore.ts).
 */
export const upsertOfficeCalendarYear = async (
  year: number,
  days: OfficeCalendarDay[],
): Promise<{ inserted: number; updated: number }> => {
  if (days.length === 0) return { inserted: 0, updated: 0 };
  return chunkedUpsert(days, OFFICE_CALENDAR_UPSERT_SQL, (day, now) => toOfficeCalendarTuple(day, year, now));
};

/** Rows with `from <= calendar_date <= to`, oldest first. DATE is read as text so no time zone can shift a day. */
export const getOfficeCalendarRows = async (from: IsoDate, to: IsoDate): Promise<OfficeCalendarDay[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT DATE_FORMAT(calendar_date, '%Y-%m-%d') AS calendar_date, is_holiday, note
       FROM office_calendar_days
       WHERE calendar_date BETWEEN ? AND ?
       ORDER BY calendar_date`,
      [from, to],
    );
    return rows.map((row) => ({
      date: String(row.calendar_date),
      isHoliday: Number(row.is_holiday) === 1,
      note: String(row.note ?? ""),
    }));
  });

export interface OfficeCalendarTableMeta {
  rowCount: number;
  firstDate: IsoDate | null;
  lastDate: IsoDate | null;
  /** Newest `synced_at` (ISO 8601, UTC) — null while the table is empty. */
  syncedAt: string | null;
}

export const getOfficeCalendarTableMeta = async (): Promise<OfficeCalendarTableMeta> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt,
              DATE_FORMAT(MIN(calendar_date), '%Y-%m-%d') AS first_date,
              DATE_FORMAT(MAX(calendar_date), '%Y-%m-%d') AS last_date,
              MAX(synced_at) AS synced_at
       FROM office_calendar_days`,
    );
    const row = rows[0] ?? {};
    const syncedMs = row.synced_at ? new Date(row.synced_at).getTime() : NaN;
    return {
      rowCount: Number(row.cnt ?? 0),
      firstDate: row.first_date ? String(row.first_date) : null,
      lastDate: row.last_date ? String(row.last_date) : null,
      syncedAt: Number.isFinite(syncedMs) ? new Date(syncedMs).toISOString() : null,
    };
  });
