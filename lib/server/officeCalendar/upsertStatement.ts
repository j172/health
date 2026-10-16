/**
 * The SQL and the row layout of the office_calendar_days upsert (issue #691),
 * kept apart from the connection code so a test can read the statement and
 * replay it against an in-memory table with MySQL's ON DUPLICATE KEY semantics
 * (upsertStatement.test.mjs proves a re-run adds no rows).
 *
 * `calendar_date` is the table's only UNIQUE KEY: one row per calendar day,
 * and a day is the entity, not an observation time. `synced_at` / `updated_at`
 * are plain columns, so a sync updates the existing row in place instead of
 * inserting a new one — the cwa_station_weather row-bloat bug this repo has hit
 * before (UNIQUE KEY containing a timestamp) cannot happen here.
 */
import type { OfficeCalendarDay } from "../../tools/workSchoolStatus/calendar";

export const OFFICE_CALENDAR_TABLE = "office_calendar_days";

/** Column order of one VALUES tuple — must match `toOfficeCalendarTuple`. */
export const OFFICE_CALENDAR_UPSERT_COLUMNS = [
  "calendar_date",
  "is_holiday",
  "note",
  "source_year",
  "synced_at",
  "created_at",
  "updated_at",
] as const;

export const OFFICE_CALENDAR_UPSERT_SQL = `
    INSERT INTO ${OFFICE_CALENDAR_TABLE}
      (${OFFICE_CALENDAR_UPSERT_COLUMNS.join(", ")})
    VALUES ?
    ON DUPLICATE KEY UPDATE
      is_holiday = VALUES(is_holiday),
      note = VALUES(note),
      source_year = VALUES(source_year),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `;

/** One VALUES tuple. `now` is the shared UTC timestamp string of the run. */
export const toOfficeCalendarTuple = (day: OfficeCalendarDay, sourceYear: number, now: string): unknown[] => [
  day.date,
  day.isHoliday ? 1 : 0,
  day.note,
  sourceYear,
  now,
  now,
  now,
];
