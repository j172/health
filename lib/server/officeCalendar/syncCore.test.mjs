// Issue #691 — the sync's decisions, with plain fakes for the network and the
// table: which years, which file, what is refused, and that a re-run or a
// government correction never adds rows.
//
// Complete years are synthetic here (Mon-Fri work, Sat-Sun off, 補班日 and a few
// holidays layered on) because the real fixtures are excerpts; the real file
// shapes are covered by parseOfficeCalendarCsv.test.mjs and the committed seed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "./testHooks.mjs";

const { syncOfficeCalendar, planCalendarYears } = await import("./syncCore.ts");
const { addDays, weekdayOf, WEEKDAY_LABELS_ZH } = await import("../../tools/workSchoolStatus/calendar.ts");

const metadata = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL("./__fixtures__/dataset-14718-metadata-sample.json", import.meta.url)), "utf8"),
);

/** Complete CSV text for `year`; `overrides` maps ISO date -> [flag, note]. */
const yearCsv = (year, overrides = {}) => {
  const lines = ["西元日期,星期,是否放假,備註"];
  for (let date = `${year}-01-01`; date <= `${year}-12-31`; date = addDays(date, 1)) {
    const weekday = weekdayOf(date);
    const [flag, note] = overrides[date] ?? [weekday === 0 || weekday === 6 ? 2 : 0, ""];
    lines.push(`${date.replaceAll("-", "")},${WEEKDAY_LABELS_ZH[weekday]},${flag},${note}`);
  }
  return Buffer.from(lines.join("\r\n") + "\r\n", "utf8");
};

/** Fake table: an upsert keyed by date, like office_calendar_days' UNIQUE KEY (calendar_date). */
const makeStore = () => {
  const rows = new Map();
  return {
    rows,
    upsertYear: async (year, days) => {
      let inserted = 0;
      let updated = 0;
      for (const day of days) {
        if (rows.has(day.date)) updated += 1;
        else inserted += 1;
        rows.set(day.date, { ...day, sourceYear: year });
      }
      return { inserted, updated };
    },
  };
};

const NOW_2026 = () => new Date("2026-10-16T05:00:00Z");

const makeDeps = (overrides = {}) => {
  const store = makeStore();
  const fetched = [];
  const deps = {
    fetchMetadata: async () => metadata,
    fetchCsv: async (url) => {
      fetched.push(url);
      if (url.includes("a52331bd")) return yearCsv(2026, { "2026-10-10": [2, "國慶日"] });
      if (url.includes("f538b1ff")) return yearCsv(2027, { "2027-01-01": [2, "開國紀念日"] });
      throw new Error(`unexpected URL ${url}`);
    },
    upsertYear: store.upsertYear,
    now: NOW_2026,
    ...overrides,
  };
  return { deps, store, fetched };
};

test("planCalendarYears: this year and next, by the Asia/Taipei calendar (not the UTC one)", () => {
  assert.deepEqual(planCalendarYears(new Date("2026-10-16T05:00:00Z")), [2026, 2027]);
  // 2026-12-31 17:00 UTC is already 2027-01-01 in Taipei.
  assert.deepEqual(planCalendarYears(new Date("2026-12-31T17:00:00Z")), [2027, 2028]);
  assert.deepEqual(planCalendarYears(new Date("2026-12-31T15:59:00Z")), [2026, 2027]);
});

test("a normal run fetches the 2026 and 2027 files, writes 365 rows each and reports both years ok", async () => {
  const { deps, store, fetched } = makeDeps();
  const result = await syncOfficeCalendar(deps);

  assert.equal(result.error, null);
  assert.deepEqual(result.years.map((y) => [y.year, y.status, y.rows, y.inserted, y.updated]), [
    [2026, "ok", 365, 365, 0],
    [2027, "ok", 365, 365, 0],
  ]);
  assert.equal(fetched.length, 2);
  assert.equal(store.rows.size, 730);
  assert.deepEqual(store.rows.get("2026-10-10"), { date: "2026-10-10", isHoliday: true, note: "國慶日", sourceYear: 2026 });
});

test("re-running the sync adds NO rows: the second run is all updates and the table size is unchanged", async () => {
  const { deps, store } = makeDeps();
  await syncOfficeCalendar(deps);
  const sizeAfterFirst = store.rows.size;

  const second = await syncOfficeCalendar(deps);
  assert.equal(store.rows.size, sizeAfterFirst, "no new rows");
  for (const year of second.years) {
    assert.equal(year.inserted, 0, `${year.year} inserted`);
    assert.equal(year.updated, 365, `${year.year} updated`);
  }
});

test("a government correction overwrites the changed days in place (the 114 revision pattern): same row count, new values", async () => {
  const { deps, store } = makeDeps();
  await syncOfficeCalendar(deps);
  assert.equal(store.rows.get("2026-12-24").isHoliday, false);

  const corrected = makeDeps({
    upsertYear: store.upsertYear,
    fetchCsv: async (url) =>
      url.includes("a52331bd")
        ? yearCsv(2026, { "2026-10-10": [2, "國慶日"], "2026-12-24": [2, "補假"] })
        : yearCsv(2027, { "2027-01-01": [2, "開國紀念日"] }),
  });
  const result = await syncOfficeCalendar(corrected.deps);

  assert.equal(store.rows.size, 730);
  assert.deepEqual(store.rows.get("2026-12-24"), { date: "2026-12-24", isHoliday: true, note: "補假", sourceYear: 2026 });
  assert.equal(result.years[0].inserted, 0);
});

test("a truncated file is refused before any write: that year's rows are untouched and the year is reported failed", async () => {
  const { deps, store } = makeDeps();
  await syncOfficeCalendar(deps);
  const rows2026 = () => JSON.stringify([...store.rows].filter(([date]) => date.startsWith("2026")));
  const before = rows2026();

  const truncated = makeDeps({
    upsertYear: store.upsertYear,
    // Cut after a whole line so the parser sees a clean but short file.
    fetchCsv: async (url) =>
      url.includes("a52331bd") ? Buffer.from(yearCsv(2026).toString("utf8").split("\r\n").slice(0, 201).join("\r\n")) : yearCsv(2027),
  });
  const result = await syncOfficeCalendar(truncated.deps);

  const y2026 = result.years.find((y) => y.year === 2026);
  assert.equal(y2026.status, "failed");
  assert.match(y2026.error, /expected 365/);
  assert.equal(y2026.inserted, 0);
  assert.equal(y2026.updated, 0);
  assert.equal(rows2026(), before, "2026 rows are exactly as they were");
});

test("the wrong year's file is refused (a 2027 file served for 2026 must not be written as 2026)", async () => {
  const { deps, store } = makeDeps({ fetchCsv: async () => yearCsv(2027) });
  const result = await syncOfficeCalendar(deps);
  const y2026 = result.years.find((y) => y.year === 2026);
  assert.equal(y2026.status, "failed");
  assert.match(y2026.error, /outside that year/);
  assert.ok(![...store.rows.keys()].some((d) => d.startsWith("2026")));
});

test("an HTML page served with HTTP 200 instead of the CSV is refused and writes nothing", async () => {
  const { deps, store } = makeDeps({ fetchCsv: async () => Buffer.from("<html><body>blocked</body></html>") });
  const result = await syncOfficeCalendar(deps);
  assert.ok(result.years.every((y) => y.status === "failed"));
  assert.equal(store.rows.size, 0);
});

test("years are independent: a failing 2027 download does not stop 2026 from being written", async () => {
  const { deps, store } = makeDeps({
    fetchCsv: async (url) => {
      if (url.includes("f538b1ff")) throw new Error("connect ETIMEDOUT");
      return yearCsv(2026);
    },
  });
  const result = await syncOfficeCalendar(deps);
  assert.equal(result.years.find((y) => y.year === 2026).status, "ok");
  const y2027 = result.years.find((y) => y.year === 2027);
  assert.equal(y2027.status, "failed");
  assert.match(y2027.error, /ETIMEDOUT/);
  assert.equal(store.rows.size, 365);
});

test("a failing database write is reported as that year failing, not thrown", async () => {
  const { deps } = makeDeps({
    upsertYear: async () => {
      throw new Error("ER_LOCK_WAIT_TIMEOUT");
    },
  });
  const result = await syncOfficeCalendar(deps);
  assert.equal(result.error, null);
  assert.ok(result.years.every((y) => y.status === "failed" && /ER_LOCK_WAIT_TIMEOUT/.test(y.error)));
});

test("metadata that cannot be read stops the run with one clear error and fetches no CSV", async () => {
  for (const fetchMetadata of [
    async () => {
      throw new Error("status 403");
    },
    async () => ({ result: {} }),
    async () => null,
  ]) {
    const { deps, store, fetched } = makeDeps({ fetchMetadata });
    const result = await syncOfficeCalendar(deps);
    assert.deepEqual(result.years, []);
    assert.match(result.error, /Could not read the data\.gov\.tw 14718 metadata/);
    assert.equal(fetched.length, 0);
    assert.equal(store.rows.size, 0);
  }
});

test("next year not published yet is NOT a failure (the 116 file only appeared in July); this year missing IS", async () => {
  const onlyThisYear = {
    result: {
      distribution: metadata.result.distribution.filter((d) => !d.resourceDescription.startsWith("116年")),
    },
  };
  const { deps } = makeDeps({ fetchMetadata: async () => onlyThisYear });
  const result = await syncOfficeCalendar(deps);
  assert.deepEqual(result.years.map((y) => [y.year, y.status]), [
    [2026, "ok"],
    [2027, "not-published"],
  ]);
  assert.equal(result.years[1].error, null);

  const onlyNextYear = {
    result: { distribution: metadata.result.distribution.filter((d) => !d.resourceDescription.startsWith("115年")) },
  };
  const missingCurrent = await syncOfficeCalendar(makeDeps({ fetchMetadata: async () => onlyNextYear }).deps);
  const y2026 = missingCurrent.years.find((y) => y.year === 2026);
  assert.equal(y2026.status, "failed");
  assert.match(y2026.error, /no calendar file for 2026/);
});

test("the Big5 correction is decoded and written like any other file", async () => {
  // 2025: the metadata's latest 114 file is the Big5 one. Serve a real Big5 slice for the right URL and a full UTF-8 year otherwise.
  const big5Slice = fs.readFileSync(fileURLToPath(new URL("./__fixtures__/office-calendar-114-autumn-revised-big5.csv", import.meta.url)));
  const fetched = [];
  const { deps } = makeDeps({
    now: () => new Date("2025-10-25T05:00:00Z"),
    fetchCsv: async (url) => {
      fetched.push(url);
      return url.includes("b84cb88a") ? big5Slice : yearCsv(2026);
    },
  });
  const result = await syncOfficeCalendar(deps);
  assert.ok(fetched.some((u) => u.includes("b84cb88a")), "the correction URL was fetched, not the original");
  // The slice is 7 days, not a full year, so it is refused by the whole-year guard — proving decode + parse worked (no Big5 garbage error) and the guard runs after.
  const y2025 = result.years.find((y) => y.year === 2025);
  assert.equal(y2025.status, "failed");
  assert.match(y2025.error, /expected 365/);
});
