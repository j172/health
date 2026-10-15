// Source-text checks for the DB-, cron-, route- and page-adjacent parts of the
// drug-shortage feature (issue #670, spec docs/2.0/track-b-opendata-phase2-3-spec.md
// A-2 / B-4) that the repo's testing conventions say not to exercise against a
// live MySQL or a live upstream: schema shape, snapshot reconciliation wiring,
// advisory-lock/ingest_errors wiring, cron cadence + tick collisions, API cache
// headers, and the attribution text the page must carry. Same "read the file,
// assert on its text" approach as lib/server/antiFraud/dbConventions.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const read = (relativeToRepoRoot) => readFileSync(fileURLToPath(new URL(relativeToRepoRoot, REPO_ROOT)), "utf-8");

// --- schema -----------------------------------------------------------------

const drugShortagesDdl = () => {
  const schema = read("lib/server/db/schema.ts");
  const match = schema.match(/drugShortages:\s*`([\s\S]*?)`,/);
  assert.ok(match, "drugShortages DDL entry not found in schema.ts");
  return match[1];
};

test("drug_shortages: UNIQUE KEY is row_key only — no time/date column (the cwa_station_weather bug class)", () => {
  const ddl = drugShortagesDdl();
  assert.match(ddl, /CREATE TABLE IF NOT EXISTS drug_shortages/);

  const uniqueKeyMatch = ddl.match(/UNIQUE KEY\s+uq_drug_shortage_row\s*\(([^)]*)\)/);
  assert.ok(uniqueKeyMatch, "uq_drug_shortage_row not found");
  const keyColumns = uniqueKeyMatch[1].split(",").map((c) => c.trim());
  assert.deepEqual(keyColumns, ["row_key"]);

  const TIME_LIKE = /year|month|date|time|seen|at$/i;
  for (const column of keyColumns) {
    assert.ok(!TIME_LIKE.test(column), `UNIQUE KEY column "${column}" looks time-related`);
  }

  // The time-ish fields exist, but only as plain columns.
  assert.match(ddl, /announced_on DATE/);
  assert.match(ddl, /synced_at DATETIME/);
  // Exactly one UNIQUE KEY in the whole table definition.
  assert.equal((ddl.match(/UNIQUE KEY/g) || []).length, 1);
  // license_no is indexed for the drugs join, but is NOT unique (236 distinct of 238 rows).
  assert.match(ddl, /KEY idx_drug_shortage_license \(license_no\)/);
  assert.ok(!/UNIQUE KEY[^\n]*license_no/.test(ddl), "license_no must not be (part of) a unique key — it repeats in the upstream data");
});

test("drug_shortages is registered in runSchemaMigrations (new table gets created)", () => {
  assert.match(read("lib/server/db/mysql.ts"), /TABLE_DDL\.drugShortages/);
});

// --- snapshot reconciliation + queries --------------------------------------

test("replaceDrugShortagesSnapshot upserts by row_key, then deletes only this source's rows that this run did not see — behind the snapshot guard", () => {
  const queries = read("lib/server/drugs/shortageQueries.ts");
  assert.match(queries, /export const replaceDrugShortagesSnapshot/);
  assert.match(queries, /ON DUPLICATE KEY UPDATE/);
  assert.match(queries, /decideSnapshotReconcile\(/);
  // Scoped to one dataset and keyed on "not refreshed by this run" — never a blanket delete/truncate.
  assert.match(queries, /DELETE FROM drug_shortages\s+WHERE source_key = \? AND synced_at < \?/);
  assert.ok(!/TRUNCATE/i.test(queries));
  // The guard decision is evaluated before the DELETE statement is reached.
  assert.ok(queries.indexOf("decideSnapshotReconcile(") < queries.indexOf("DELETE FROM drug_shortages"));
});

test("shortage badge lookup for the drug search never throws (a shortage-table problem must not break the drug search)", () => {
  const queries = read("lib/server/drugs/shortageQueries.ts");
  const match = queries.match(/export const getShortageStatusByLicense[\s\S]*?\n\};/);
  assert.ok(match, "getShortageStatusByLicense not found");
  assert.match(match[0], /try\s*\{/);
  assert.match(match[0], /catch/);
});

test("the shortage list joins drugs on license_no with a LEFT JOIN, so a license missing from drugs still lists (no error, no dropped row)", () => {
  const queries = read("lib/server/drugs/shortageQueries.ts");
  assert.match(queries, /LEFT JOIN drugs d ON d\.license_no = s\.license_no/);
});

// --- sync runner ------------------------------------------------------------

test("runDrugShortagesSync takes an advisory lock, logs failures to ingest_errors, and uses a feed code that fits ingest_errors.feed_code VARCHAR(10)", () => {
  const runSync = read("lib/server/drugs/runShortagesSync.ts");
  assert.match(runSync, /withAdvisoryLock\(/);
  assert.match(runSync, /drug_shortages_sync_lock/);
  assert.match(runSync, /writeIngestionError\(/);
  assert.match(runSync, /DRUG_SHORTAGE_SOURCES/);

  const feedCode = runSync.match(/DRUG_SHORTAGE_FEED_CODE\s*=\s*"([^"]+)"/);
  assert.ok(feedCode, "DRUG_SHORTAGE_FEED_CODE constant not found");
  assert.ok(feedCode[1].length <= 10, `feed code "${feedCode[1]}" is longer than ingest_errors.feed_code VARCHAR(10)`);
});

test("one dataset failing does not stop the other: each source goes through runSource", () => {
  const runSync = read("lib/server/drugs/runShortagesSync.ts");
  assert.match(runSync, /runSource(<[\s\S]*?>)?\(/);
});

test("admin route POST /api/admin/drug-shortages-sync requires the admin secret and returns the per-source counts", () => {
  const route = read("app/api/admin/drug-shortages-sync/route.ts");
  assert.match(route, /requireAdminSecret\(request\)/);
  assert.match(route, /runDrugShortagesSync\(\)/);
});

// --- cron -------------------------------------------------------------------

const expandCronField = (field, min, max) => {
  const values = new Set();
  for (const part of field.split(",")) {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    let lo = min;
    let hi = max;
    if (range !== "*") {
      const [a, b] = range.split("-");
      lo = Number(a);
      hi = b === undefined ? (stepRaw ? max : Number(a)) : Number(b);
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return values;
};

const parseCron = (expression) => {
  const [minute, hour, dom, , dow] = expression.trim().split(/\s+/);
  return {
    minute: expandCronField(minute, 0, 59),
    hour: expandCronField(hour, 0, 23),
    dom: expandCronField(dom, 1, 31),
    dow: expandCronField(dow, 0, 6),
  };
};

const intersects = (a, b) => [...a].some((v) => b.has(v));

const sameTick = (a, b) =>
  intersects(a.minute, b.minute) && intersects(a.hour, b.hour) && intersects(a.dom, b.dom) && intersects(a.dow, b.dow);

const cronJobs = () => {
  const registerJobs = read("lib/server/cron/registerJobs.ts");
  return [...registerJobs.matchAll(/cron\.schedule\(\s*"([^"]+)",\s*\n?\s*runGuarded\("([^"]+)"/g)].map((m) => ({
    expression: m[1],
    logFile: m[2],
  }));
};

test("the drug-shortages sync is a weekly cron job (day-of-week set, day-of-month '*'), not a per-minute or daily one", () => {
  const registerJobs = read("lib/server/cron/registerJobs.ts");
  assert.match(registerJobs, /runDrugShortagesSync/);
  const job = cronJobs().find((j) => j.logFile === "drug-shortages-sync-cron.log");
  assert.ok(job, "drug-shortages-sync-cron.log job not registered");
  const [, , dom, month, dow] = job.expression.split(/\s+/);
  assert.equal(dom, "*");
  assert.equal(month, "*");
  assert.match(dow, /^[0-6]$/);
});

test("tick-collision detector is not vacuous: it parses the registered jobs and flags the known pre-existing '30 4 * * *' pair (green-products + wra-catalog)", () => {
  const jobs = cronJobs();
  assert.ok(jobs.length >= 30, `expected the detector to parse 30+ cron jobs, parsed ${jobs.length}`);
  const greenProducts = jobs.find((j) => j.logFile === "green-products-cron.log");
  const wraCatalog = jobs.find((j) => j.logFile === "wra-catalog-sync-cron.log");
  assert.ok(greenProducts && wraCatalog);
  assert.ok(sameTick(parseCron(greenProducts.expression), parseCron(wraCatalog.expression)));
  // ...and the "*/5" YouBike grid is expanded, so an on-grid minute would be caught.
  const youbike = jobs.find((j) => j.logFile === "youbike-sync-cron.log");
  assert.ok(youbike && sameTick(parseCron(youbike.expression), parseCron("35 9 * * *")));
});

test("the drug-shortages cron tick collides with no other registered job, and avoids the :00/:15/:30/:45 pile-up minutes", () => {
  const jobs = cronJobs();
  const mine = jobs.find((j) => j.logFile === "drug-shortages-sync-cron.log");
  assert.ok(mine);
  const mineParsed = parseCron(mine.expression);

  for (const minute of mineParsed.minute) {
    assert.ok(![0, 15, 30, 45].includes(minute), `minute ${minute} is one of the :00/:15/:30/:45 pile-up minutes`);
    assert.ok(minute % 5 !== 0, `minute ${minute} sits on YouBike's every-5-minutes grid`);
  }

  for (const other of jobs) {
    if (other.logFile === mine.logFile) continue;
    assert.ok(
      !sameTick(mineParsed, parseCron(other.expression)),
      `drug-shortages cron "${mine.expression}" fires on the same tick as ${other.logFile} ("${other.expression}")`,
    );
  }
});

// --- API route --------------------------------------------------------------

test("GET /api/drugs?view=shortages: explicit Cache-Control on success (s-maxage, never the upstream's 30-minute default), no-store when empty or failing", () => {
  const route = read("app/api/drugs/route.ts");
  assert.match(route, /view/);
  assert.match(route, /"shortages"/);
  assert.match(route, /s-maxage=\d+/);
  // Every NextResponse.json in the shortages branch carries a headers object.
  const shortagesBranch = route.match(/const handleShortages[\s\S]*?\n\};/);
  assert.ok(shortagesBranch, "handleShortages function not found");
  const responses = shortagesBranch[0].match(/NextResponse\.json\(/g) || [];
  const withHeaders = shortagesBranch[0].match(/headers:/g) || [];
  assert.ok(responses.length >= 2);
  assert.ok(withHeaders.length >= responses.length, "every response in the shortages branch must set headers explicitly");
  // An empty table must not be cached at the edge (the 2026-10 "0 筆" false alarm was an edge-cached empty answer).
  assert.match(shortagesBranch[0], /total\s*>\s*0/);
});

test("the plain drug search and the per-license ingredient lookup keep their no-store headers and gain a shortage marker without being able to fail on it", () => {
  const route = read("app/api/drugs/route.ts");
  assert.match(route, /NO_CACHE_HEADERS/);
  assert.match(route, /getShortageStatusByLicense/);
  assert.match(route, /getShortagesByLicenseNo/);
});

// --- page -------------------------------------------------------------------

test("the shortages tab carries the mandatory attribution: source agency, dataset ids, license, and 'not judged by this site'", () => {
  const panel = read("app/(zh)/tools/drugs/DrugShortagesPanel.tsx");
  assert.match(panel, /食品藥物管理署/);
  assert.match(panel, /54504/);
  assert.match(panel, /54505/);
  assert.match(panel, /政府資料開放授權條款/);
  assert.match(panel, /非本站判定/);
  // Data date comes from the file's own 公告更新時間, not data.gov.tw's metadata (spec §4.8).
  assert.match(panel, /資料日期/);
  // Honest wording for the empty no-alternative list.
  assert.match(panel, /無替代藥品/);
});

test("DrugsContent exposes the shortages view as a tab (?tab=shortages), keeping the drug search as the default tab", () => {
  const content = read("app/(zh)/tools/drugs/DrugsContent.tsx");
  assert.match(content, /ToolTypeTabs/);
  assert.match(content, /"shortages"/);
  assert.match(content, /searchParams\.get\("tab"\)/);
  assert.match(content, /DrugSearchPanel/);
  assert.match(content, /DrugShortagesPanel/);
});

test("drug cards show a 目前短缺 badge driven by the API's shortage marker", () => {
  const panel = read("app/(zh)/tools/drugs/DrugSearchPanel.tsx");
  assert.match(panel, /目前短缺/);
  assert.match(panel, /shortage/);
});

// --- catalog ----------------------------------------------------------------

test("the drugs catalog entry advertises the shortage list (so 缺藥 searches find the tool) and keeps its slug/group", async () => {
  const { TOOL_CATALOG, searchTools } = await import("../tools/catalog.ts");
  const drugs = TOOL_CATALOG.filter((t) => t.slug === "drugs");
  assert.equal(drugs.length, 1);
  assert.equal(drugs[0].group, "medical-care");
  assert.ok(drugs[0].keywords.some((k) => /缺藥|短缺/.test(k)));
  assert.ok(searchTools("缺藥").some((t) => t.slug === "drugs"));
  assert.match(drugs[0].directAnswer, /短缺/);
});
