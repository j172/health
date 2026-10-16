// Issue #691 — "a re-run of the sync adds zero rows", proven against the real
// DDL and the real upsert statement. There is no MySQL in the test run, so this
// replays the statement with MySQL's INSERT ... ON DUPLICATE KEY UPDATE
// semantics over an in-memory table whose UNIQUE KEY is parsed out of
// lib/server/db/schema.ts. If anyone puts a timestamp column into that key, or
// reorders the VALUES tuple so a timestamp lands in the key's slot, the second
// run below stops being a no-growth update and these tests fail.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { readFixtureBytes } from "./testHooks.mjs";

const { OFFICE_CALENDAR_UPSERT_COLUMNS, OFFICE_CALENDAR_UPSERT_SQL, OFFICE_CALENDAR_TABLE, toOfficeCalendarTuple } = await import(
  "./upsertStatement.ts"
);
const { decodeCalendarBuffer, parseOfficeCalendarCsv } = await import("./parseOfficeCalendarCsv.ts");

const schemaSource = fs.readFileSync(fileURLToPath(new URL("../db/schema.ts", import.meta.url)), "utf8");
const ddl = schemaSource.match(/officeCalendarDays:\s*`([\s\S]*?)`,/)?.[1];

const parseFixture = (name) => parseOfficeCalendarCsv(decodeCalendarBuffer(readFixtureBytes(name)).text);
const fixtureDays = [
  ...parseFixture("office-calendar-114-winter-utf8bom.csv"),
  ...parseFixture("office-calendar-115-excerpt-utf8bom.csv"),
  ...parseFixture("office-calendar-116-excerpt-utf8bom.csv"),
];

const uniqueKeyColumns = (ddlText) =>
  ddlText
    .match(/UNIQUE KEY\s+\w+\s*\(([^)]*)\)/)[1]
    .split(",")
    .map((column) => column.trim());

/** Column names the statement overwrites when the key already exists. */
const updatedColumns = (sql) => [...sql.matchAll(/^\s*(\w+)\s*=\s*VALUES\(\w+\)/gm)].map((m) => m[1]);

/**
 * MySQL's INSERT ... VALUES ? ON DUPLICATE KEY UPDATE, replayed: a tuple whose
 * UNIQUE KEY values already exist updates the listed columns of that row;
 * otherwise it is inserted. Returns the same inserted/updated split
 * chunkedUpsert derives from affectedRows.
 */
const makeTable = ({ keyColumns, sql }) => {
  const rows = new Map();
  const insertColumns = sql.match(/INSERT INTO\s+\w+\s*\(([^)]*)\)/)[1].split(",").map((c) => c.trim());
  const onUpdate = updatedColumns(sql);
  return {
    rows,
    run(tuples) {
      let inserted = 0;
      let updated = 0;
      for (const tuple of tuples) {
        const record = Object.fromEntries(insertColumns.map((column, i) => [column, tuple[i]]));
        const key = keyColumns.map((column) => String(record[column])).join("|");
        const existing = rows.get(key);
        if (existing) {
          for (const column of onUpdate) existing[column] = record[column];
          updated += 1;
        } else {
          rows.set(key, record);
          inserted += 1;
        }
      }
      return { inserted, updated };
    },
  };
};

const tuplesFor = (days, year, now) => days.map((day) => toOfficeCalendarTuple(day, year, now));

test("the table's only UNIQUE KEY is calendar_date — a DATE entity key, no DATETIME/synced_at/updated_at in it", () => {
  assert.ok(ddl, "officeCalendarDays DDL not found in schema.ts");
  assert.match(ddl, /CREATE TABLE IF NOT EXISTS office_calendar_days/);
  assert.equal((ddl.match(/UNIQUE KEY/g) || []).length, 1, "exactly one unique key");
  assert.deepEqual(uniqueKeyColumns(ddl), ["calendar_date"]);
  assert.match(ddl, /calendar_date DATE NOT NULL/);
  for (const timestamp of ["synced_at", "created_at", "updated_at"]) {
    assert.match(ddl, new RegExp(`${timestamp} DATETIME NOT NULL`));
    assert.ok(!uniqueKeyColumns(ddl).includes(timestamp), `${timestamp} must not be in the UNIQUE KEY`);
  }
});

test("the statement targets the DDL's table and its tuple layout starts with the key column", () => {
  assert.equal(OFFICE_CALENDAR_TABLE, "office_calendar_days");
  assert.match(OFFICE_CALENDAR_UPSERT_SQL, /INSERT INTO office_calendar_days/);
  assert.match(OFFICE_CALENDAR_UPSERT_SQL, /ON DUPLICATE KEY UPDATE/);
  assert.equal(OFFICE_CALENDAR_UPSERT_COLUMNS[0], "calendar_date");
  assert.equal(toOfficeCalendarTuple({ date: "2026-10-10", isHoliday: true, note: "國慶日" }, 2026, "2026-10-16 00:00:00").length, OFFICE_CALENDAR_UPSERT_COLUMNS.length);
  for (const column of OFFICE_CALENDAR_UPSERT_COLUMNS) assert.match(ddl, new RegExp(`\\b${column}\\b`), `${column} must exist in the DDL`);
});

test("on a duplicate key the statement refreshes the value columns and synced_at but never rewrites the key or created_at", () => {
  const columns = updatedColumns(OFFICE_CALENDAR_UPSERT_SQL);
  assert.deepEqual(columns.sort(), ["is_holiday", "note", "source_year", "synced_at", "updated_at"].sort());
  assert.ok(!columns.includes("calendar_date"));
  assert.ok(!columns.includes("created_at"));
});

test("first run inserts every day; a second identical run inserts ZERO and leaves the row count unchanged", () => {
  const table = makeTable({ keyColumns: uniqueKeyColumns(ddl), sql: OFFICE_CALENDAR_UPSERT_SQL });

  const first = table.run(tuplesFor(fixtureDays, 2026, "2026-10-16 01:00:00"));
  assert.equal(first.inserted, fixtureDays.length);
  assert.equal(first.updated, 0);
  const sizeAfterFirst = table.rows.size;
  assert.equal(sizeAfterFirst, fixtureDays.length);

  // A later run has a different synced_at/updated_at (they change every run).
  const second = table.run(tuplesFor(fixtureDays, 2026, "2026-10-23 06:34:00"));
  assert.equal(second.inserted, 0, "a re-run must not insert");
  assert.equal(second.updated, fixtureDays.length);
  assert.equal(table.rows.size, sizeAfterFirst, "row count is unchanged");

  // Many more runs: still flat.
  for (let week = 0; week < 52; week += 1) table.run(tuplesFor(fixtureDays, 2026, `2027-01-${String((week % 28) + 1).padStart(2, "0")} 06:34:00`));
  assert.equal(table.rows.size, sizeAfterFirst, "a year of weekly runs adds nothing");
});

test("a correction (2025-09-29 working day -> 補假) updates the existing row, keeps one row per date and keeps created_at", () => {
  const original = parseFixture("office-calendar-114-autumn-original-utf8bom.csv");
  const revised = parseFixture("office-calendar-114-autumn-revised-big5.csv");
  const table = makeTable({ keyColumns: uniqueKeyColumns(ddl), sql: OFFICE_CALENDAR_UPSERT_SQL });

  table.run(tuplesFor(original, 2025, "2025-09-01 00:00:00"));
  assert.equal(table.rows.size, 7);
  assert.equal(table.rows.get("2025-09-29").is_holiday, 0);

  const result = table.run(tuplesFor(revised, 2025, "2025-10-22 06:34:00"));
  assert.equal(result.inserted, 0);
  assert.equal(table.rows.size, 7);
  const row = table.rows.get("2025-09-29");
  assert.equal(row.is_holiday, 1);
  assert.equal(row.note, "補假");
  assert.equal(row.synced_at, "2025-10-22 06:34:00");
  assert.equal(row.created_at, "2025-09-01 00:00:00", "created_at survives the correction");
});

test("the replay has teeth: with a timestamp in the UNIQUE KEY the same two runs DO double the table (the cwa_station_weather bug)", () => {
  const badKey = ["calendar_date", "synced_at"];
  const table = makeTable({ keyColumns: badKey, sql: OFFICE_CALENDAR_UPSERT_SQL });
  table.run(tuplesFor(fixtureDays, 2026, "2026-10-16 01:00:00"));
  table.run(tuplesFor(fixtureDays, 2026, "2026-10-23 06:34:00"));
  assert.equal(table.rows.size, fixtureDays.length * 2);
});
