// Source-text checks for the DB-adjacent / wiring parts of the forest-fire
// pipeline (B-12, issue #672): schema shape, advisory lock + ingest_errors,
// cron wiring (including "this job's minute must not share a tick with any
// other job"), the API route's explicit Cache-Control, and the page section's
// honesty rules. Same "read the file, assert on its text" approach as
// lib/server/antiFraud/dbConventions.test.mjs and lib/server/who/schema.test.mjs
// — nothing here connects to MySQL or the network.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf-8");

// --- schema -------------------------------------------------------------------

test("forest_fire_alerts's UNIQUE KEY is site_code only — no time/date column", () => {
  const schema = read("../db/schema.ts");
  const match = schema.match(/forestFireAlerts:\s*`([\s\S]*?)`,/);
  assert.ok(match, "forestFireAlerts DDL entry not found in schema.ts");
  const ddl = match[1];

  const uniqueKeyMatch = ddl.match(/UNIQUE KEY\s+uq_forest_fire_alerts_site\s*\(([^)]*)\)/);
  assert.ok(uniqueKeyMatch, "uq_forest_fire_alerts_site not found");

  const keyColumns = uniqueKeyMatch[1].split(",").map((c) => c.trim());
  assert.deepEqual(keyColumns, ["site_code"]);

  // The exact bug class behind cwa_station_weather / aqi_readings / fraud_domains:
  // a timestamp in the UNIQUE KEY turns every sync into an INSERT.
  const TIME_LIKE = /year|month|date|time|seen|at$/i;
  for (const column of keyColumns) {
    assert.ok(!TIME_LIKE.test(column), `UNIQUE KEY column "${column}" looks time-related`);
  }

  // created_date + the level must be plain columns (updated in place on every sync).
  assert.match(ddl, /created_date DATE NOT NULL/);
  assert.match(ddl, /warn_level TINYINT/);
  assert.match(ddl, /site_name VARCHAR/);
  // A single-statement latest-state table: no second UNIQUE KEY sneaking a date back in.
  assert.equal((ddl.match(/UNIQUE KEY/g) || []).length, 1);
  assert.ok(!/PRIMARY KEY\s*\([^)]*date/i.test(ddl), "PRIMARY KEY must not include created_date");
});

test("forest_fire_alerts is registered in runSchemaMigrations (new table gets created)", () => {
  const mysql = read("../db/mysql.ts");
  assert.match(mysql, /TABLE_DDL\.forestFireAlerts/);
});

// --- sync -----------------------------------------------------------------------

test("runForestFireSync takes a MySQL advisory lock and writes failures to ingest_errors", () => {
  const runSync = read("./runSync.ts");
  assert.match(runSync, /withAdvisoryLock\(/);
  assert.match(runSync, /forest_fire_alerts_sync_lock/);
  assert.match(runSync, /writeIngestionError\(/);
});

test("runForestFireSync never deletes rows: a failed or empty fetch leaves the table untouched", () => {
  for (const file of ["./runSync.ts", "./queries.ts"]) {
    // Comments are allowed to talk about DELETE/TRUNCATE; only code is checked.
    const text = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/\bDELETE\s+FROM\b/i.test(text), `${file} must not DELETE`);
    assert.ok(!/\bTRUNCATE\b/i.test(text), `${file} must not TRUNCATE`);
  }
});

test("runForestFireSync derives 'today' in Asia/Taipei and only asks the upstream for that day", () => {
  const runSync = read("./runSync.ts");
  assert.match(runSync, /taipeiDate\(/);
  assert.match(runSync, /fetchForestFireJson\(/);
  const fetcher = read("./fetchForestFire.ts");
  assert.match(fetcher, /buildForestFireUrl\(/);
  // Spec section 4 item 6: never the global fetch() (undici WASM OOMs on this host).
  assert.match(fetcher, /from "@\/lib\/server\/net\/httpClient"/);
  const code = fetcher.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/(^|[^.\w])fetch\(/.test(code), "must use httpClient, not global fetch()");
});

test("the upsert uses ON DUPLICATE KEY UPDATE keyed by site_code (idempotent re-runs)", () => {
  const queries = read("./queries.ts");
  assert.match(queries, /INSERT INTO forest_fire_alerts/);
  assert.match(queries, /ON DUPLICATE KEY UPDATE/);
});

test("POST /api/admin/forest-fire-sync is admin-secret gated and runs the same sync the cron runs", () => {
  const route = read("../../../app/api/admin/forest-fire-sync/route.ts");
  assert.match(route, /requireAdminSecret\(request\)/);
  assert.match(route, /runForestFireSync\(\)/);
  assert.match(route, /export async function POST/);
  assert.ok(!/export async function GET/.test(route), "a sync trigger must not be reachable by GET");
});

// --- cron -------------------------------------------------------------------------

const expandField = (field, min, max) => {
  const out = new Set();
  for (const part of field.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart ? Number(stepPart) : 1;
    let lo = min;
    let hi = max;
    if (rangePart !== "*") {
      const [a, b] = rangePart.split("-");
      lo = Number(a);
      hi = b === undefined ? (stepPart ? max : lo) : Number(b);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
};

const parseSchedules = (source) =>
  [...source.matchAll(/cron\.schedule\(\s*"([^"]+)"\s*,\s*runGuarded\("([^"]+)"/g)].map((m) => {
    const [minute, hour, dom, , dow] = m[1].split(/\s+/);
    return {
      expr: m[1],
      log: m[2],
      minutes: expandField(minute, 0, 59),
      hours: expandField(hour, 0, 23),
      dom,
      dow,
    };
  });

test("the forest-fire sync cron job is registered at 9 minutes past 06:00 and 12:00 (spec section 4 item 3)", () => {
  const registerJobs = read("../cron/registerJobs.ts");
  assert.match(registerJobs, /runForestFireSync/);
  assert.match(
    registerJobs,
    /cron\.schedule\(\s*"9 6,12 \* \* \*",\s*\n?\s*runGuarded\("forest-fire-sync-cron\.log"/,
  );
});

test("the forest-fire cron job shares no (minute, hour) tick with any other registered job", () => {
  const schedules = parseSchedules(read("../cron/registerJobs.ts"));
  const mine = schedules.find((s) => s.log === "forest-fire-sync-cron.log");
  assert.ok(mine, "forest-fire-sync-cron.log schedule not found");
  assert.ok(schedules.length > 30, "cron expression parser should find the existing jobs");

  for (const other of schedules) {
    if (other === mine) continue;
    const sharedMinutes = [...mine.minutes].filter((m) => other.minutes.has(m));
    const sharedHours = [...mine.hours].filter((h) => other.hours.has(h));
    assert.ok(
      !(sharedMinutes.length > 0 && sharedHours.length > 0),
      `forest-fire cron "${mine.expr}" collides with "${other.expr}" (${other.log})`,
    );
  }
});

// --- API route ----------------------------------------------------------------------

test("GET /api/outdoor-safety/forest-fire sets an explicit Cache-Control on every response (spec section 4 item 4)", () => {
  const routePath = "../../../app/api/outdoor-safety/forest-fire/route.ts";
  assert.ok(existsSync(fileURLToPath(new URL(routePath, import.meta.url))), "route.ts missing");
  const route = read(routePath);
  assert.match(route, /Cache-Control/);
  assert.match(route, /s-maxage=/);
  assert.match(route, /no-store/, "the error response must not be edge-cached");
  const responseCount = (route.match(/NextResponse\.json\(/g) || []).length;
  const headersUsage = (route.match(/headers:/g) || []).length;
  assert.ok(responseCount >= 2, "expected a success and an error response");
  assert.ok(headersUsage >= responseCount, "every NextResponse.json(...) call must pass explicit headers");
  assert.match(route, /export const dynamic = "force-dynamic"/);
});

// --- page section --------------------------------------------------------------------

test("the outdoor-safety page mounts the forest-fire section and the section is wired to the API through fetchWithTimeout", () => {
  const content = read("../../../components/Tools/OutdoorSafetyContent.tsx");
  assert.match(content, /ForestFireSection/);
  const section = read("../../../components/Tools/ForestFireSection.tsx");
  assert.match(section, /fetchWithTimeout/);
  assert.match(section, /\/api\/outdoor-safety\/forest-fire/);
});

test("the section is honest about provenance, data date, staleness and that 安全 still means 'use fire carefully'", () => {
  const section = read("../../../components/Tools/ForestFireSection.tsx");
  // 「依○○公開資料，非本站判定」 + the data date, per the issue's general rules.
  assert.match(section, /非本站判定/);
  assert.match(section, /資料日期/);
  assert.match(section, /林業及自然保育署/);
  assert.match(section, /農業部/);
  // A non-current feed must be called out, not silently shown as today's.
  assert.match(section, /尚未更新/);
  // Outbound links must carry UTM tracking (tests/outbound-link-coverage.test.mjs).
  assert.match(section, /appendOutboundUtm\(/);
  // Unknown levels are filtered out of the UI as well — never rendered as 安全.
  assert.match(section, /isKnownForestFireLevel|FOREST_FIRE_LEVELS\[/);
  // A city without any station must say so rather than render an empty "all good".
  assert.match(section, /沒有納入/);
});
