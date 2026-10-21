// Source-text checks for the DB-adjacent parts of the anti-fraud feature
// (issue #564) that the repo's testing conventions say not to exercise
// against a live DB: schema shape, cron/advisory-lock wiring, and the API
// route's logging behavior. Same "read the file, assert on its text"
// approach the #562 spec calls for rather than connecting to MySQL.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf-8");

test("fraud_domains's UNIQUE KEY is (domain, source) only — no time/date column", () => {
  const schema = read("../db/schema.ts");
  const match = schema.match(/fraudDomains:\s*`([\s\S]*?)`,/);
  assert.ok(match, "fraudDomains DDL entry not found in schema.ts");
  const ddl = match[1];

  const uniqueKeyMatch = ddl.match(/UNIQUE KEY\s+uq_fraud_domain_source\s*\(([^)]*)\)/);
  assert.ok(uniqueKeyMatch, "uq_fraud_domain_source not found");

  const keyColumns = uniqueKeyMatch[1].split(",").map((c) => c.trim());
  assert.deepEqual(keyColumns, ["domain", "source"]);

  // Guard against any time-ish column sneaking into the key, however it's named.
  const TIME_LIKE = /year|month|date|time|seen|at$/i;
  for (const column of keyColumns) {
    assert.ok(!TIME_LIKE.test(column), `UNIQUE KEY column "${column}" looks time-related — this is exactly the cwa_station_weather bug class`);
  }

  // report_year_month/first_seen/last_seen must exist as plain columns (not part of any key).
  assert.match(ddl, /report_year_month VARCHAR/);
  assert.match(ddl, /first_seen DATETIME/);
  assert.match(ddl, /last_seen DATETIME/);
  // issue #567: fraud_description (165027/160055's free-text description,
  // for sources with no 網站性質-style classification) must also be a plain
  // column, never part of the unique key.
  assert.match(ddl, /fraud_description VARCHAR/);
});

test("fraud_domains gets an ALTER TABLE ADD COLUMN IF NOT EXISTS for fraud_description (issue #567 column added to an already-deployed #564 table)", () => {
  const mysql = read("../db/mysql.ts");
  assert.match(mysql, /ALTER TABLE fraud_domains[\s\S]*?ADD COLUMN IF NOT EXISTS fraud_description/);
});

test("fraud-domains sync is registered in runSchemaMigrations (new table gets created)", () => {
  const mysql = read("../db/mysql.ts");
  assert.match(mysql, /TABLE_DDL\.fraudDomains/);
});

test("runFraudDomainsSync acquires a MySQL advisory lock before writing", () => {
  const runSync = read("./runSync.ts");
  assert.match(runSync, /withAdvisoryLock\(/);
  assert.match(runSync, /fraud_domains_sync_lock/);
});

test("runFraudDomainsSync writes failures to the existing ingest_errors mechanism", () => {
  const runSync = read("./runSync.ts");
  assert.match(runSync, /writeIngestionError\(/);
});

test("the fraud-domains sync cron job runs monthly, not on every tick", () => {
  const registerJobs = read("../cron/registerJobs.ts");
  assert.match(registerJobs, /runFraudDomainsSync/);
  // A cron expression with a day-of-month field other than "*" (here: the
  // 1st) — distinguishes "runs once a month" from every other job in this
  // file, which all run on "*" (every day).
  assert.match(registerJobs, /cron\.schedule\(\s*"[^"]*\s+1\s+\*\s+\*",\s*\n?\s*runGuarded\("fraud-domains-sync-cron\.log"/);
});

test("issue #567: the moda-165027 sync cron job runs daily (day-of-month '*'), not monthly", () => {
  const registerJobs = read("../cron/registerJobs.ts");
  assert.match(registerJobs, /runModa165027Sync/);
  assert.match(registerJobs, /cron\.schedule\(\s*"\d+\s+\d+\s+\*\s+\*\s+\*",\s*\n?\s*runGuarded\("moda-165027-sync-cron\.log"/);
});

test("runModa165027Sync uses its own advisory lock name, distinct from the 176455 job's lock", () => {
  const runSync = read("./runSync.ts");
  assert.match(runSync, /MODA_LOCK_NAME\s*=\s*"moda_165027_sync_lock"/);
  assert.match(runSync, /withAdvisoryLock\(MODA_LOCK_NAME/);
});

test("issue #567: 160055 (one-time historical import) is NOT registered as a cron job — only the daily 165027 and monthly 176455 jobs are", () => {
  const registerJobs = read("../cron/registerJobs.ts");
  // registerJobs.ts may mention "160055" in a comment explaining why it's
  // deliberately absent (as it does) — what must never appear is an actual
  // import of, or cron.schedule call for, its runner/log file.
  assert.ok(!/from\s+"@\/lib\/server\/antiFraud\/sources\/police160055"/.test(registerJobs));
  assert.ok(!/runPolice160055/.test(registerJobs));
  assert.ok(!/police-160055-.*-cron\.log/.test(registerJobs));
});

test("the 160055 one-time import is the admin route (script removed 2026-10-21), not wired into registerJobs.ts", () => {
  assert.ok(existsSync(fileURLToPath(new URL("../../../app/api/admin/police-160055-import/route.ts", import.meta.url))));
  assert.ok(!existsSync(fileURLToPath(new URL("../../../scripts/import-police-160055.mjs", import.meta.url))));
});

test("GET /api/anti-fraud/check never passes the url query param to console.*", () => {
  const route = read("../../../app/api/anti-fraud/check/route.ts");

  // Collect every console.* call's argument list and make sure none of
  // them references the `url` variable (the raw query param) or
  // `normalizedHost`/`result` (which are derived from it).
  const consoleCalls = [...route.matchAll(/console\.(log|warn|error|info|debug)\(([^;]*?)\);/gs)];
  assert.ok(consoleCalls.length > 0, "expected at least one console.* call to check (the catch-block error log)");

  for (const [, , args] of consoleCalls) {
    assert.ok(!/\burl\b/.test(args), `console.* call embeds the raw query param: ${args}`);
    assert.ok(!/normalizedHost/.test(args), `console.* call embeds normalizedHost: ${args}`);
    assert.ok(!/\bresult\b/.test(args), `console.* call embeds the check result: ${args}`);
  }
});

// --- issue #570: trend-stats tables are a legitimate time-series pattern
// (deliberately the OPPOSITE check from fraud_domains above) -----------------

test("police_fraud_interdiction_stats's UNIQUE KEY DOES include its time columns (roc_year, roc_month) — a real monthly time series, not a latest-state table", () => {
  const schema = read("../db/schema.ts");
  const match = schema.match(/policeFraudInterdictionStats:\s*`([\s\S]*?)`,/);
  assert.ok(match, "policeFraudInterdictionStats DDL entry not found in schema.ts");
  const ddl = match[1];

  const uniqueKeyMatch = ddl.match(/UNIQUE KEY\s+uq_police_fraud_interdiction_period\s*\(([^)]*)\)/);
  assert.ok(uniqueKeyMatch, "uq_police_fraud_interdiction_period not found");
  const keyColumns = uniqueKeyMatch[1].split(",").map((c) => c.trim());
  assert.deepEqual(keyColumns, ["roc_year", "roc_month"]);
});

test("fsc_fraud_ad_stats's UNIQUE KEY DOES include report_date — a real weekly time series, not a latest-state table", () => {
  const schema = read("../db/schema.ts");
  const match = schema.match(/fscFraudAdStats:\s*`([\s\S]*?)`,/);
  assert.ok(match, "fscFraudAdStats DDL entry not found in schema.ts");
  const ddl = match[1];

  const uniqueKeyMatch = ddl.match(/UNIQUE KEY\s+uq_fsc_fraud_ad_report_date\s*\(([^)]*)\)/);
  assert.ok(uniqueKeyMatch, "uq_fsc_fraud_ad_report_date not found");
  const keyColumns = uniqueKeyMatch[1].split(",").map((c) => c.trim());
  assert.deepEqual(keyColumns, ["report_date"]);
});

test("police_fraud_interdiction_stats and fsc_fraud_ad_stats are registered in runSchemaMigrations (new tables get created)", () => {
  const mysql = read("../db/mysql.ts");
  assert.match(mysql, /TABLE_DDL\.policeFraudInterdictionStats/);
  assert.match(mysql, /TABLE_DDL\.fscFraudAdStats/);
});

test("runPoliceFraudInterdictionStatsSync and runFscFraudAdStatsSync each take out their own MySQL advisory lock before writing", () => {
  const runTrendSync = read("./runTrendSync.ts");
  assert.match(runTrendSync, /withAdvisoryLock\(/);
  assert.match(runTrendSync, /police_fraud_interdiction_stats_sync_lock/);
  assert.match(runTrendSync, /fsc_fraud_ad_stats_sync_lock/);
});

test("the trend-stats syncs write failures to the existing ingest_errors mechanism", () => {
  const runTrendSync = read("./runTrendSync.ts");
  assert.match(runTrendSync, /writeIngestionError\(/);
});

test("the 172159 sync cron job runs monthly (day-of-month 1), the 11198 sync cron job runs weekly (day-of-week 6/Saturday)", () => {
  const registerJobs = read("../cron/registerJobs.ts");
  assert.match(registerJobs, /runPoliceFraudInterdictionStatsSync/);
  assert.match(registerJobs, /runFscFraudAdStatsSync/);
  // Monthly: day-of-month field is "1", not "*".
  assert.match(
    registerJobs,
    /cron\.schedule\(\s*"[^"]*\s+1\s+\*\s+\*",\s*\n?\s*runGuarded\("police-172159-stats-sync-cron\.log"/,
  );
  // Weekly: day-of-week field is "6" (Saturday), day-of-month stays "*".
  assert.match(
    registerJobs,
    /cron\.schedule\(\s*"[^"]*\s+\*\s+\*\s+6",\s*\n?\s*runGuarded\("fsc-11198-stats-sync-cron\.log"/,
  );
});

test("GET /api/anti-fraud/check sets Cache-Control: no-store on every response", () => {
  const route = read("../../../app/api/anti-fraud/check/route.ts");
  const occurrences = route.match(/no-store/g) || [];
  // Declared once as a shared constant and reused — at minimum it must be
  // present and actually used on each NextResponse.json(...) call.
  assert.ok(occurrences.length >= 1);
  const responseCount = (route.match(/NextResponse\.json\(/g) || []).length;
  const headerUsageCount = (route.match(/noStoreHeaders/g) || []).length - 1; // minus the declaration
  assert.ok(headerUsageCount >= responseCount, "every NextResponse.json(...) call must attach the no-store header");
});

// issue #575: the homepage sidebar widget's "本月新增涉詐網域數" summary —
// a different query from the two above, so it gets its own source-text
// checks rather than connecting to MySQL (same repo convention).
test("getFraudDomainsAddedThisMonth counts first_seen within the current calendar month, not last_seen", () => {
  const queries = read("./queries.ts");
  assert.match(queries, /export const getFraudDomainsAddedThisMonth/);

  const match = queries.match(/getFraudDomainsAddedThisMonth[\s\S]*?\{([\s\S]*?)\n  \}\);/);
  assert.ok(match, "getFraudDomainsAddedThisMonth body not found");
  const body = match[1];

  // Must bucket by first_seen (a domain's initial-discovery date), never by
  // last_seen (which moves on every monthly re-sync of the ~93,840-row
  // 176455 batch — using it here would make almost the whole table count
  // as "new" every month).
  assert.match(body, /first_seen\s*>=\s*DATE_FORMAT\(CURDATE\(\),\s*'%Y-%m-01'\)/);
  assert.ok(!/last_seen\s*>=/.test(body), "must not bucket by last_seen");
});

test("getFraudDomainsAddedThisMonth distinguishes 'never synced' from 'synced but zero this month'", () => {
  const queries = read("./queries.ts");
  const match = queries.match(/return\s*\{\s*count:\s*[^,}]+,\s*hasEverSynced:\s*([^,}]+)\s*\}/);
  assert.ok(match, "hasEverSynced derivation not found in the returned object");
  // Must be derived from the whole-table total, not from the this-month count
  // (so a real zero-this-month doesn't get misreported as "never synced").
  assert.match(match[1], /total/);
});

test("the anti-fraud summary API route (/api/home/anti-fraud-summary) is a public GET with no user input", () => {
  const route = read("../../../app/api/home/anti-fraud-summary/route.ts");
  assert.match(route, /export async function GET\(\)/, "must take no request/params — nothing user-supplied to leak or cache-key on");
  assert.match(route, /getFraudDomainsAddedThisMonth/);
});
