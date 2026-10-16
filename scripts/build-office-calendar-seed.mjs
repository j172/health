#!/usr/bin/env node
/**
 * Rebuilds data/office-calendar-seed.json (issue #691) from yearly CSV files of
 * data.gov.tw 14718 《中華民國政府行政機關辦公日曆表》 that you downloaded
 * yourself. The seed is only the fallback for a request that arrives before the
 * first sync, or while the production host cannot reach dgpa.gov.tw; the synced
 * table overrides it date by date (lib/server/officeCalendar/calendarSource.ts).
 *
 * Usage (year = Gregorian year of the file, path = the downloaded CSV):
 *   node scripts/build-office-calendar-seed.mjs 2026=./115.csv 2027=./116.csv
 *
 * Re-run it whenever the government publishes or corrects a year (the 2025
 * calendar, for one, was revised in October 2025), and bump the seed's
 * `retrievedAt` — that date is shown on the page while the seed is in use.
 * Each file goes through the same decoder, parser and full-year check as the
 * sync, so a truncated or wrong-year file is refused here too.
 */
import fs from "node:fs";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

// The sync modules are TypeScript with extensionless relative imports.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const extension of [".ts", ".mjs", ".js"]) {
        const candidate = new URL(specifier + extension, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) return nextResolve(specifier + extension, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const { assertFullCalendarYear, decodeCalendarBuffer, parseOfficeCalendarCsv } = await import(
  pathToFileURL(path.join(ROOT, "lib/server/officeCalendar/parseOfficeCalendarCsv.ts")).href
);

const args = process.argv.slice(2).filter((arg) => /^\d{4}=/.test(arg));
if (args.length === 0) {
  console.error("Usage: node scripts/build-office-calendar-seed.mjs 2026=./115.csv 2027=./116.csv");
  process.exit(1);
}

const days = {};
const years = [];
for (const arg of args) {
  const [yearText, file] = [arg.slice(0, 4), arg.slice(5)];
  const year = Number(yearText);
  const { text } = decodeCalendarBuffer(fs.readFileSync(file));
  const parsed = parseOfficeCalendarCsv(text);
  assertFullCalendarYear(parsed, year);
  for (const day of parsed) days[day.date] = [day.isHoliday ? 2 : 0, day.note];
  years.push(year);
}

const ordered = Object.fromEntries(Object.entries(days).sort(([a], [b]) => (a < b ? -1 : 1)));
const lines = Object.entries(ordered).map(([date, [flag, note]]) => `    ${JSON.stringify(date)}: [${flag}, ${JSON.stringify(note)}]`);
const { taipeiDateOf } = await import(pathToFileURL(path.join(ROOT, "lib/tools/workSchoolStatus/calendar.ts")).href);
const retrievedAt = taipeiDateOf(Date.now());

const output = `{
  "source": "行政院人事行政總處《中華民國政府行政機關辦公日曆表》（政府資料開放平臺 14718）",
  "datasetUrl": "https://data.gov.tw/dataset/14718",
  "retrievedAt": ${JSON.stringify(retrievedAt)},
  "years": ${JSON.stringify(years.sort())},
  "note": "每個日期為 [是否放假, 備註]：是否放假 0 = 上班日、2 = 放假；週末且為 0 即補班日（備註「補行上班」）。這是備援副本，線上資料表同步後逐日覆蓋。",
  "days": {
${lines.join(",\n")}
  }
}
`;

fs.writeFileSync(path.join(ROOT, "data", "office-calendar-seed.json"), output);
console.log(`Wrote data/office-calendar-seed.json: ${Object.keys(ordered).length} days for ${years.join(", ")}`);
