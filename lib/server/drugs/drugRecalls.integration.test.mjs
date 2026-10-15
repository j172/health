// Source-text checks for the DB-, cron-, route- and page-adjacent parts of the
// recalled-drug feature (issue #675, spec docs/2.0/track-b-opendata-phase2-3-spec.md
// A-2 / B-5) that the repo's testing conventions say not to exercise against a
// live MySQL or a live upstream: schema shape, snapshot reconciliation wiring,
// advisory-lock/ingest_errors wiring, cron cadence + tick collisions, API cache
// headers, and the attribution text the page must carry. Same "read the file,
// assert on its text" approach as drugShortages.integration.test.mjs (B-4) and
// lib/server/antiFraud/dbConventions.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { collisionKey, extractCronSchedules, findCronCollisions } from "../cron/cronCollisions.mjs";

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

const ddlOf = (entry) => {
  const schema = read("lib/server/db/schema.ts");
  const match = schema.match(new RegExp(`${entry}:\\s*\`([\\s\\S]*?)\`,`));
  assert.ok(match, `${entry} DDL entry not found in schema.ts`);
  return match[1];
};

const TIME_LIKE = /year|month|date|time|seen|at$/i;

const uniqueKeyColumns = (ddl, keyName) => {
  const match = ddl.match(new RegExp(`UNIQUE KEY\\s+${keyName}\\s*\\(([^)]*)\\)`));
  assert.ok(match, `${keyName} not found`);
  return match[1].split(",").map((c) => c.trim());
};

test("drug_recalls: UNIQUE KEY is row_key only — no time/date column (the cwa_station_weather bug class)", () => {
  const ddl = ddlOf("drugRecalls");
  assert.match(ddl, /CREATE TABLE IF NOT EXISTS drug_recalls/);

  const keyColumns = uniqueKeyColumns(ddl, "uq_drug_recall_row");
  assert.deepEqual(keyColumns, ["row_key"]);
  for (const column of keyColumns) {
    assert.ok(!TIME_LIKE.test(column), `UNIQUE KEY column "${column}" looks time-related`);
  }

  // The time-ish fields exist, but only as plain columns.
  assert.match(ddl, /recalled_on DATE/);
  assert.match(ddl, /synced_at DATETIME/);
  assert.equal((ddl.match(/UNIQUE KEY/g) || []).length, 1);
  // The recall level is stored already normalized, as one of the four allowed strings.
  assert.match(ddl, /recall_level VARCHAR\(\d+\) NOT NULL/);
});

test("drug_recall_licenses (one row per license number a recall names): UNIQUE KEY has no time column, license_no is indexed for the drugs join", () => {
  const ddl = ddlOf("drugRecallLicenses");
  assert.match(ddl, /CREATE TABLE IF NOT EXISTS drug_recall_licenses/);
  const keyColumns = uniqueKeyColumns(ddl, "uq_drug_recall_license");
  assert.deepEqual(keyColumns, ["recall_row_key", "license_no"]);
  for (const column of keyColumns) {
    assert.ok(!TIME_LIKE.test(column), `UNIQUE KEY column "${column}" looks time-related`);
  }
  assert.equal((ddl.match(/UNIQUE KEY/g) || []).length, 1);
  assert.match(ddl, /KEY idx_drug_recall_license_no \(license_no\)/);
});

test("both recall tables are registered in runSchemaMigrations (new tables get created)", () => {
  const mysql = read("lib/server/db/mysql.ts");
  assert.match(mysql, /TABLE_DDL\.drugRecalls\b/);
  assert.match(mysql, /TABLE_DDL\.drugRecallLicenses\b/);
});

// --- snapshot reconciliation + queries --------------------------------------

test("replaceDrugRecallsSnapshot upserts by row_key, then deletes only rows this run did not refresh — behind the shared snapshot guard — and cleans orphaned license rows", () => {
  const queries = read("lib/server/drugs/recallQueries.ts");
  assert.match(queries, /export const replaceDrugRecallsSnapshot/);
  assert.match(queries, /ON DUPLICATE KEY UPDATE/);
  assert.match(queries, /INSERT IGNORE INTO drug_recall_licenses/);
  // Reuses B-4's guard rather than re-implementing it.
  assert.match(queries, /from "@\/lib\/server\/drugs\/shortageSnapshot"/);
  assert.match(queries, /decideSnapshotReconcile\(/);
  // "Did not refresh" is keyed on synced_at; never a blanket delete/truncate.
  assert.match(queries, /DELETE FROM drug_recalls\s+WHERE synced_at < \?/);
  assert.ok(!/TRUNCATE/i.test(queries));
  // The guard decision is evaluated before the DELETE statement is reached.
  assert.ok(queries.indexOf("decideSnapshotReconcile(") < queries.indexOf("DELETE FROM drug_recalls"));
  // License rows whose recall row is gone are removed, so the child table cannot accumulate either.
  assert.match(queries, /DELETE l FROM drug_recall_licenses l\s+LEFT JOIN drug_recalls r ON r\.row_key = l\.recall_row_key\s+WHERE r\.id IS NULL/);
});

test("the recall badge lookups never throw (a recall-table problem must not break the drug search or the ingredient lookup)", () => {
  const queries = read("lib/server/drugs/recallQueries.ts");
  for (const name of ["getRecallStatusByLicense", "getRecallsByLicenseNo"]) {
    const match = queries.match(new RegExp(`export const ${name}[\\s\\S]*?\\n\\};`));
    assert.ok(match, `${name} not found`);
    assert.match(match[0], /try\s*\{/, `${name} must wrap its query in try`);
    assert.match(match[0], /catch/, `${name} must catch`);
  }
});

test("the recall list LEFT JOINs drugs, so a license missing from drugs (or a recall with no license) still lists", () => {
  const queries = read("lib/server/drugs/recallQueries.ts");
  assert.match(queries, /LEFT JOIN drugs d ON d\.license_no = /);
});

test("the keyword search covers the product, license text, holder and the batch number printed on the box", () => {
  const queries = read("lib/server/drugs/recallQueries.ts");
  assert.match(queries, /product_name LIKE \?/);
  assert.match(queries, /license_text LIKE \?/);
  assert.match(queries, /holder_name LIKE \?/);
  assert.match(queries, /batch_no LIKE \?/);
  // The user's % and _ are matched literally.
  assert.match(queries, /replace\(\/\[\\\\%_\]\/g/);
});

// --- sync runner ------------------------------------------------------------

test("runDrugRecallsSync takes its own advisory lock, logs to ingest_errors, and uses a feed code that fits ingest_errors.feed_code VARCHAR(10)", () => {
  const runSync = read("lib/server/drugs/runRecallsSync.ts");
  assert.match(runSync, /withAdvisoryLock\(/);
  assert.match(runSync, /drug_recalls_sync_lock/);
  assert.match(runSync, /writeIngestionError\(/);
  assert.match(runSync, /runSource(<[\s\S]*?>)?\(/);
  assert.match(runSync, /fetchDrugRecalls\(/);

  const feedCode = runSync.match(/DRUG_RECALL_FEED_CODE\s*=\s*"([^"]+)"/);
  assert.ok(feedCode, "DRUG_RECALL_FEED_CODE constant not found");
  assert.ok(feedCode[1].length <= 10, `feed code "${feedCode[1]}" is longer than ingest_errors.feed_code VARCHAR(10)`);
  // Must not collide with B-4's feed code (the two syncs report separately).
  assert.notEqual(feedCode[1], "drug_short");
});

test("an empty 6947 response is reported as an error, not a quiet success (the register has ~1,700 historical rows)", () => {
  const runSync = read("lib/server/drugs/runRecallsSync.ts");
  assert.match(runSync, /records\.length === 0/);
});

test("the recall sync uses its own lock name, distinct from the shortage sync's, so the two weekly jobs never block each other", () => {
  const recalls = read("lib/server/drugs/runRecallsSync.ts").match(/LOCK_NAME\s*=\s*"([^"]+)"/);
  const shortages = read("lib/server/drugs/runShortagesSync.ts").match(/LOCK_NAME\s*=\s*"([^"]+)"/);
  assert.ok(recalls && shortages);
  assert.notEqual(recalls[1], shortages[1]);
});

test("admin route POST /api/admin/drug-recalls-sync requires the admin secret and returns the counts", () => {
  const route = read("app/api/admin/drug-recalls-sync/route.ts");
  assert.match(route, /requireAdminSecret\(request\)/);
  assert.match(route, /runDrugRecallsSync\(\)/);
});

test("the manual workflow runs the sync twice via SSH loopback (never the public hostname) and checks the second run inserts nothing", () => {
  const workflow = read(".github/workflows/drug-recalls-sync-manual.yml");
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /127\.0\.0\.1:3000\/api\/admin\/drug-recalls-sync/);
  assert.match(workflow, /\.result\.inserted == 0/);
  assert.ok(!/ssh[^\n]* -L /.test(workflow), "this host disables AllowTcpForwarding; no -L tunnels");
});

// --- cron -------------------------------------------------------------------

const cronJob = () => {
  const jobs = extractCronSchedules(read("lib/server/cron/registerJobs.ts"));
  return { jobs, mine: jobs.find((j) => j.name === "drug-recalls-sync-cron.log") };
};

test("the recall sync is a weekly cron job (day-of-week set, day-of-month and month '*'), not a per-minute or daily one", () => {
  assert.match(read("lib/server/cron/registerJobs.ts"), /runDrugRecallsSync/);
  const { mine } = cronJob();
  assert.ok(mine, "drug-recalls-sync-cron.log job not registered");
  const [, , dom, month, dow] = mine.expression.split(/\s+/);
  assert.equal(dom, "*");
  assert.equal(month, "*");
  assert.match(dow, /^[0-6]$/);
});

test("the recall cron avoids the :00/:15/:30/:45 pile-up minutes and the every-5-minutes grid, and shares no tick with any other registered job", () => {
  const { jobs, mine } = cronJob();
  assert.ok(mine);
  const minute = mine.expression.split(/\s+/)[0];
  assert.match(minute, /^\d+$/, "a single fixed minute");
  assert.ok(Number(minute) % 5 !== 0, `minute ${minute} sits on the every-5-minutes grid`);

  const mine_collisions = findCronCollisions(jobs)
    .filter((c) => c.a.name === mine.name || c.b.name === mine.name)
    .map(collisionKey);
  assert.deepEqual(mine_collisions, [], `drug-recalls cron "${mine.expression}" shares a tick with another job`);
});

test("the recall cron does not fire at the same time as the shortage cron (both are weekly FDA pulls; keep them apart)", () => {
  const { jobs, mine } = cronJob();
  const shortages = jobs.find((j) => j.name === "drug-shortages-sync-cron.log");
  assert.ok(mine && shortages);
  assert.notEqual(mine.expression, shortages.expression);
});

// --- API route --------------------------------------------------------------

test("GET /api/drugs?view=recalls: explicit Cache-Control on success (s-maxage, never the upstream's 30-minute default), no-store when empty or failing", () => {
  const route = read("app/api/drugs/route.ts");
  assert.match(route, /"recalls"/);
  const branch = route.match(/const handleRecalls[\s\S]*?\n\};/);
  assert.ok(branch, "handleRecalls function not found");
  const responses = branch[0].match(/NextResponse\.json\(/g) || [];
  const withHeaders = branch[0].match(/headers:/g) || [];
  assert.ok(responses.length >= 2);
  assert.ok(withHeaders.length >= responses.length, "every response in the recalls branch must set headers explicitly");
  assert.match(route, /RECALLS_CACHE_HEADERS\s*=\s*\{[^}]*s-maxage=\d+/);
  // An empty table must not be cached at the edge (the 2026-10 "0 筆" false alarm was an edge-cached empty answer).
  assert.match(branch[0], /total\s*>\s*0/);
});

test("the recalls view validates the level filter against the four allowed values", () => {
  const route = read("app/api/drugs/route.ts");
  const resolver = route.match(/const resolveRecallLevel[\s\S]*?;\r?\n/);
  assert.ok(resolver, "resolveRecallLevel not found");
  assert.match(resolver[0], /RECALL_LEVELS/);
  const branch = route.match(/const handleRecalls[\s\S]*?\n\};/);
  assert.ok(branch);
  assert.match(branch[0], /resolveRecallLevel\(searchParams\.get\("level"\)\)/);
});

test("the plain drug search and the per-license lookup gain a recall marker without being able to fail on it, and keep no-store", () => {
  const route = read("app/api/drugs/route.ts");
  assert.match(route, /NO_CACHE_HEADERS/);
  assert.match(route, /getRecallStatusByLicense/);
  assert.match(route, /getRecallsByLicenseNo/);
  // B-4's shortage markers are still there.
  assert.match(route, /getShortageStatusByLicense/);
  assert.match(route, /getShortagesByLicenseNo/);
});

// --- page -------------------------------------------------------------------

test("the recalls tab carries the mandatory attribution: source agency, dataset id, license, 'not judged by this site', data date", () => {
  const panel = read("app/(zh)/tools/drugs/DrugRecallsPanel.tsx");
  assert.match(panel, /食品藥物管理署/);
  assert.match(panel, /6947/);
  assert.match(panel, /政府資料開放授權條款/);
  assert.match(panel, /非本站判定/);
  // Data date comes from the file's own 日期 column, not data.gov.tw's metadata (spec §4.8).
  assert.match(panel, /資料日期/);
  // Honest wording about what a recall means for a given box of medicine.
  assert.match(panel, /批號/);
  assert.match(panel, /藥師/);
  // The four normalized levels are what the filter offers.
  assert.match(panel, /未載明/);
});

test("DrugsContent exposes the recalls view as a tab (?tab=recalls) next to search and shortages, keeping search the default", () => {
  const content = read("app/(zh)/tools/drugs/DrugsContent.tsx");
  assert.match(content, /DRUGS_TAB_KEYS = \["search", "shortages", "recalls"\]/);
  assert.match(content, /DrugRecallsPanel/);
  assert.match(content, /key: "recalls"/);
  assert.match(content, /searchParams\.get\("tab"\)/);
});

test("drug cards show a 曾被回收 badge driven by the API's recall marker, and the expanded card lists the recall notices", () => {
  const panel = read("app/(zh)/tools/drugs/DrugSearchPanel.tsx");
  assert.match(panel, /曾被回收/);
  assert.match(panel, /recall/);
  assert.match(panel, /非本站判定/);
});

// --- catalog ----------------------------------------------------------------

test("the drugs catalog entry advertises the recall list (so 藥品回收 searches find the tool) and keeps its slug/group", async () => {
  const { TOOL_CATALOG, searchTools } = await import("../tools/catalog.ts");
  const drugs = TOOL_CATALOG.filter((t) => t.slug === "drugs");
  assert.equal(drugs.length, 1);
  assert.equal(drugs[0].group, "medical-care");
  assert.ok(drugs[0].keywords.some((k) => /回收/.test(k)));
  assert.ok(searchTools("藥品回收").some((t) => t.slug === "drugs"));
  assert.match(drugs[0].directAnswer, /回收/);
  // B-4's shortage wording is still there.
  assert.match(drugs[0].directAnswer, /短缺/);
  assert.ok(drugs[0].scientificBasis.some((s) => /6947/.test(s.url)));
});
