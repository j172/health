import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// issue #678 (Track B B-8): data.gov.tw 115950 (nhplatform.mohw.gov.tw) times
// out from BOTH the production host and GitHub runners (egress-probe
// 2026-10-15), and the owner ruled out a relay (spec §7.1 D7). The supported
// refresh path is therefore this script, run by hand from a residential
// network, exactly like the other import-mohw-*.mjs scripts. The script's
// download/POST/retry logic is exercised here against a small real-shaped
// fixture and an injected fake fetch — no live network, no real secret.

const ROOT_DIR = fileURLToPath(new URL("../", import.meta.url));
const SCRIPT_PATH = path.join(ROOT_DIR, "scripts", "import-nhplatform-nursing-institutions.mjs");
const FIXTURE_PATH = path.join(ROOT_DIR, "scripts", "__fixtures__", "nhplatform-115950-sample.csv");
const SAMPLE_CSV = fs.readFileSync(FIXTURE_PATH, "utf-8");

const {
  BATCH_SIZE,
  MIN_EXPECTED_RECORDS,
  parseArgs,
  buildRecordsFromCsv,
  chunk,
  parseContentDispositionFilename,
  submitBatchWithRetry,
  runImport,
} = await import("./import-nhplatform-nursing-institutions.mjs");

const SECRET = "test-secret-value-never-print-me";
const BASE_URL = "https://health.example.test";
const noSleep = async () => {};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function recordingConsole() {
  const lines = [];
  return { lines, log: (...a) => lines.push(a.join(" ")), warn: (...a) => lines.push(a.join(" ")) };
}

// --- parseArgs --------------------------------------------------------------

test("parseArgs: defaults are a real import with verification and the standard minimum", () => {
  assert.deepEqual(parseArgs([]), { dryRun: false, file: null, minRecords: MIN_EXPECTED_RECORDS, verify: true });
});

test("parseArgs: --dry-run, --file (both spellings), --min-records and --no-verify", () => {
  assert.equal(parseArgs(["--dry-run"]).dryRun, true);
  assert.equal(parseArgs(["--file", "a.csv"]).file, "a.csv");
  assert.equal(parseArgs(["--file=b.csv"]).file, "b.csv");
  assert.equal(parseArgs(["--min-records", "5"]).minRecords, 5);
  assert.equal(parseArgs(["--min-records=7"]).minRecords, 7);
  assert.equal(parseArgs(["--no-verify"]).verify, false);
});

test("parseArgs: rejects an unknown flag and a non-numeric --min-records instead of silently ignoring them", () => {
  assert.throws(() => parseArgs(["--frobnicate"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--min-records", "lots"]), /--min-records/);
  assert.throws(() => parseArgs(["--file"]), /--file/);
});

// --- buildRecordsFromCsv ----------------------------------------------------

test("buildRecordsFromCsv: maps the sample through the shared parser and summarises per destination", () => {
  const { records, summary } = buildRecordsFromCsv(SAMPLE_CSV, { minRecords: 1 });
  assert.equal(records.length, 14);
  assert.deepEqual(summary, {
    totalRows: 14,
    records: 14,
    postpartumCare: 7,
    longTermCare: 7,
    skippedRows: 0,
    duplicateKeys: 0,
  });
});

test("buildRecordsFromCsv: refuses a result smaller than the minimum (a truncated or blocked download must not be imported)", () => {
  assert.throws(
    () => buildRecordsFromCsv(SAMPLE_CSV, { minRecords: MIN_EXPECTED_RECORDS }),
    /only 14 usable records.*at least 1000/s,
  );
});

test("buildRecordsFromCsv: a single-line HTML body parses to zero records and is refused, not imported as nothing", () => {
  assert.throws(() => buildRecordsFromCsv("<html>Access Denied</html>", { minRecords: 1 }), /0 usable records/);
});

test("buildRecordsFromCsv: de-duplicates a repeated (sourceKey, sourceId) so one batch never upserts the same row twice", () => {
  const dataLine = SAMPLE_CSV.split(/\r?\n/)[1];
  const { records, summary } = buildRecordsFromCsv(SAMPLE_CSV.trimEnd() + "\n" + dataLine + "\n", { minRecords: 1 });
  assert.equal(records.length, 14);
  assert.equal(summary.duplicateKeys, 1);
});

test("buildRecordsFromCsv: counts rows skipped for an unrecognised 機構類別", () => {
  const extra =
    "999,7400000000,臺北市,測試精神護理之家,10,0,0,02-0000000,精神護理之家,臺北市中正區測試路1號,合格,118年12月31日,臺北市中正區測試路1號,121.5,25.0\n";
  const { summary } = buildRecordsFromCsv(SAMPLE_CSV.trimEnd() + "\n" + extra, { minRecords: 1 });
  assert.equal(summary.totalRows, 15);
  assert.equal(summary.records, 14);
  assert.equal(summary.skippedRows, 1);
});

// --- chunk / filename --------------------------------------------------------

test("chunk: splits into batches of at most `size`, preserving order and the remainder", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 3), []);
  assert.ok(BATCH_SIZE > 0 && BATCH_SIZE <= 1000, "a batch must fit comfortably inside the admin route's 60s maxDuration");
});

test("parseContentDispositionFilename: decodes the percent-encoded Chinese file name the real download sends", () => {
  assert.equal(
    parseContentDispositionFilename(
      "attachment; filename=114%e5%b9%b412%e6%9c%88%e5%85%a8%e5%9c%8b%e9%96%8b%e6%a5%ad%e8%ad%b7%e7%90%86%e6%a9%9f%e6%a7%8b%e6%b8%85%e5%86%8a.csv",
    ),
    "114年12月全國開業護理機構清冊.csv",
  );
  assert.equal(parseContentDispositionFilename(null), null);
  assert.equal(parseContentDispositionFilename("inline"), null);
});

// --- submitBatchWithRetry ---------------------------------------------------

test("submitBatchWithRetry: POSTs the records to the admin facilities-import route with the secret only in the header", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ ok: true, fetched: 2, inserted: 2, updated: 0, deleted: 0 });
  };
  const records = [{ sourceId: "a" }, { sourceId: "b" }];
  const result = await submitBatchWithRetry(records, { baseUrl: BASE_URL, adminSecret: SECRET, fetchImpl, sleep: noSleep });
  assert.equal(result.inserted, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE_URL}/api/admin/facilities-import`);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["x-rss-sync-admin-secret"], SECRET);
  assert.deepEqual(JSON.parse(calls[0].init.body), { records });
  assert.ok(!calls[0].init.body.includes(SECRET), "the secret must never be part of the request body");
});

test("submitBatchWithRetry: retries a transient HTML error page (502) with exponential back-off, then succeeds", async () => {
  const delays = [];
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    if (n <= 2) return new Response("<html>502 Bad Gateway</html>", { status: 502 });
    return jsonResponse({ ok: true, inserted: 1, updated: 0 });
  };
  const result = await submitBatchWithRetry([{ sourceId: "a" }], {
    baseUrl: BASE_URL,
    adminSecret: SECRET,
    fetchImpl,
    sleep: async (ms) => delays.push(ms),
    log: () => {},
  });
  assert.equal(result.inserted, 1);
  assert.equal(n, 3);
  assert.deepEqual(delays, [2000, 4000]);
});

test("submitBatchWithRetry: retries a network error and a 5xx JSON body, but gives up after maxRetries", async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    if (n === 1) throw new Error("socket hang up");
    return jsonResponse({ ok: false, error: "db down" }, 503);
  };
  await assert.rejects(
    submitBatchWithRetry([{ sourceId: "a" }], {
      baseUrl: BASE_URL,
      adminSecret: SECRET,
      fetchImpl,
      sleep: noSleep,
      maxRetries: 2,
      log: () => {},
    }),
    /HTTP 503/,
  );
  assert.equal(n, 3, "1 initial attempt + 2 retries");
});

test("submitBatchWithRetry: a genuine application failure (401 JSON) is not retried and points at the secret without printing it", async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  };
  let message = "";
  try {
    await submitBatchWithRetry([{ sourceId: "a" }], {
      baseUrl: BASE_URL,
      adminSecret: SECRET,
      fetchImpl,
      sleep: noSleep,
      log: () => {},
    });
  } catch (error) {
    message = String(error.message);
  }
  assert.equal(n, 1);
  assert.match(message, /HTTP 401/);
  assert.match(message, /ADMIN_SECRET/);
  assert.ok(!message.includes(SECRET), "the error message must not leak the secret value");
});

test("submitBatchWithRetry: a 400 JSON rejection (bad payload) is not retried either", async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    return jsonResponse({ ok: false, error: "Missing or empty 'records' array" }, 400);
  };
  await assert.rejects(
    submitBatchWithRetry([], { baseUrl: BASE_URL, adminSecret: SECRET, fetchImpl, sleep: noSleep, log: () => {} }),
    /HTTP 400/,
  );
  assert.equal(n, 1);
});

// --- runImport --------------------------------------------------------------

function makeFetch({ csv = SAMPLE_CSV, headers = {}, postResponses = null, verifyBodies = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.startsWith("https://nhplatform.mohw.gov.tw/")) {
      return new Response(csv, { status: 200, headers });
    }
    if (u.includes("/api/admin/facilities-import")) {
      const body = JSON.parse(init.body);
      if (postResponses) return postResponses(body, calls.filter((c) => c.url.includes("facilities-import")).length);
      return jsonResponse({ ok: true, fetched: body.records.length, inserted: body.records.length, updated: 0, deleted: 0 });
    }
    if (u.includes("/api/facilities?")) {
      const type = new URL(u).searchParams.get("type");
      const status = verifyBodies?.[type];
      return jsonResponse(status ?? { facilities: [], total: 0, allTotal: 0 });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  return { fetchImpl, calls };
}

const baseEnv = { ADMIN_SECRET: SECRET, HEALTH_BASE_URL: BASE_URL };

test("runImport --dry-run: downloads and summarises but needs no secret and sends nothing to production", async () => {
  const { fetchImpl, calls } = makeFetch({
    headers: { "content-disposition": "attachment; filename=114%e5%b9%b412%e6%9c%88%e5%85%a8%e5%9c%8b%e9%96%8b%e6%a5%ad%e8%ad%b7%e7%90%86%e6%a9%9f%e6%a7%8b%e6%b8%85%e5%86%8a.csv" },
  });
  const out = recordingConsole();
  const result = await runImport({
    argv: ["--dry-run", "--min-records", "1"],
    env: {},
    fetchImpl,
    sleep: noSleep,
    log: out.log,
    warn: out.warn,
  });
  assert.equal(result.dryRun, true);
  assert.equal(result.summary.records, 14);
  assert.equal(calls.filter((c) => !c.url.startsWith("https://nhplatform.mohw.gov.tw/")).length, 0);
  assert.ok(out.lines.some((l) => l.includes("114年12月全國開業護理機構清冊.csv")), "the dataset's own vintage label is printed");
});

test("runImport: a real run without ADMIN_SECRET fails before any network call", async () => {
  const { fetchImpl, calls } = makeFetch();
  await assert.rejects(
    runImport({ argv: ["--min-records", "1"], env: { HEALTH_BASE_URL: BASE_URL }, fetchImpl, sleep: noSleep, log: () => {}, warn: () => {} }),
    /Missing ADMIN_SECRET/,
  );
  assert.equal(calls.length, 0);
});

test("runImport: downloads once, posts every record in order, aggregates totals and never prints the secret", async () => {
  const { fetchImpl, calls } = makeFetch();
  const out = recordingConsole();
  const result = await runImport({
    argv: ["--min-records", "1", "--no-verify"],
    env: baseEnv,
    fetchImpl,
    sleep: noSleep,
    log: out.log,
    warn: out.warn,
  });
  const posts = calls.filter((c) => c.url.includes("facilities-import"));
  assert.equal(posts.length, 1, "14 records fit in one batch");
  assert.equal(JSON.parse(posts[0].init.body).records.length, 14);
  assert.equal(result.totals.inserted, 14);
  assert.ok(!out.lines.join("\n").includes(SECRET), "the secret must never be printed");
  assert.equal(calls[0].url, "https://nhplatform.mohw.gov.tw/dl-3820-74883655f255416abc752bef29cbd7aa.html");
});

test("runImport: --file reads a local CSV (e.g. one saved from data.gov.tw) and never touches nhplatform", async () => {
  const { fetchImpl, calls } = makeFetch();
  const result = await runImport({
    argv: ["--file", FIXTURE_PATH, "--min-records", "1", "--no-verify"],
    env: baseEnv,
    fetchImpl,
    sleep: noSleep,
    log: () => {},
    warn: () => {},
  });
  assert.equal(result.summary.records, 14);
  assert.equal(calls.filter((c) => c.url.startsWith("https://nhplatform.mohw.gov.tw/")).length, 0);
});

test("runImport: splits a larger payload into BATCH_SIZE batches and stops at the first non-retryable failure", async () => {
  const header = SAMPLE_CSV.split(/\r?\n/)[0];
  const rows = [];
  for (let i = 0; i < BATCH_SIZE + 5; i++) {
    rows.push(
      `${i + 1},74${String(i).padStart(8, "0")},臺北市,測試護理之家${i},10,0,0,02-0000${i},一般護理之家,臺北市中正區測試路${i}號,合格,118年12月31日,臺北市中正區測試路${i}號,121.5,25.0`,
    );
  }
  const big = [header, ...rows].join("\n") + "\n";
  const { fetchImpl, calls } = makeFetch({ csv: big });
  await runImport({ argv: ["--min-records", "1", "--no-verify"], env: baseEnv, fetchImpl, sleep: noSleep, log: () => {}, warn: () => {} });
  const sizes = calls.filter((c) => c.url.includes("facilities-import")).map((c) => JSON.parse(c.init.body).records.length);
  assert.deepEqual(sizes, [BATCH_SIZE, 5]);

  const failing = makeFetch({
    csv: big,
    postResponses: () => jsonResponse({ ok: false, error: "Unauthorized" }, 401),
  });
  await assert.rejects(
    runImport({ argv: ["--min-records", "1", "--no-verify"], env: baseEnv, fetchImpl: failing.fetchImpl, sleep: noSleep, log: () => {}, warn: () => {} }),
    /HTTP 401/,
  );
  assert.equal(failing.calls.filter((c) => c.url.includes("facilities-import")).length, 1, "later batches are not attempted after a hard failure");
});

test("runImport: refuses to download when the response is not OK", async () => {
  const fetchImpl = async () => new Response("nope", { status: 403 });
  await assert.rejects(
    runImport({ argv: ["--min-records", "1"], env: baseEnv, fetchImpl, sleep: noSleep, log: () => {}, warn: () => {} }),
    /HTTP 403/,
  );
});

test("runImport: post-import verification reads the public API's per-source counts (cache-busted) and flags a shortfall", async () => {
  const ok = makeFetch({
    verifyBodies: {
      postpartum_care: { facilities: [], total: 7, allTotal: 7, dataStatus: { sourceTotal: 7, dataDate: "2026-10-16" } },
      long_term_care: { facilities: [], total: 7, allTotal: 900, dataStatus: { sourceTotal: 7, dataDate: "2026-10-16" } },
    },
  });
  const okResult = await runImport({ argv: ["--min-records", "1"], env: baseEnv, fetchImpl: ok.fetchImpl, sleep: noSleep, log: () => {}, warn: () => {} });
  assert.equal(okResult.verification.every((v) => v.ok), true);
  const verifyUrls = ok.calls.filter((c) => c.url.includes("/api/facilities?")).map((c) => new URL(c.url));
  assert.equal(verifyUrls.length, 2);
  for (const u of verifyUrls) {
    assert.ok(u.searchParams.get("_"), "cache-busting parameter so the 60s edge cache cannot hide the result");
    assert.ok(u.searchParams.get("dataStatusSource"));
  }
  assert.deepEqual(
    verifyUrls.map((u) => u.searchParams.get("dataStatusSource")).sort(),
    ["nhplatform_115950_ltc", "nhplatform_115950_postpartum"],
  );

  const short = makeFetch({
    verifyBodies: {
      postpartum_care: { facilities: [], total: 0, allTotal: 0, dataStatus: { sourceTotal: 0, dataDate: null } },
      long_term_care: { facilities: [], total: 7, allTotal: 900, dataStatus: { sourceTotal: 7, dataDate: "2026-10-16" } },
    },
  });
  const out = recordingConsole();
  const shortResult = await runImport({ argv: ["--min-records", "1"], env: baseEnv, fetchImpl: short.fetchImpl, sleep: noSleep, log: out.log, warn: out.warn });
  assert.equal(shortResult.verification.find((v) => v.facilityType === "postpartum_care").ok, false);
  assert.ok(out.lines.some((l) => /WARNING/.test(l)));
});

// --- source-text guards -------------------------------------------------------

const scriptSrc = fs.readFileSync(SCRIPT_PATH, "utf-8");

test("script source: reads the secret only from the environment and never reads .env / credential files", () => {
  assert.match(scriptSrc, /env\.ADMIN_SECRET/);
  assert.doesNotMatch(scriptSrc, /readFile(Sync)?\([^)]*\.env/);
  assert.doesNotMatch(scriptSrc, /dotenv/);
  assert.doesNotMatch(scriptSrc, /console\.(log|warn|error)\([^)]*adminSecret/i);
});

test("script source: reuses the shared parser instead of re-implementing the row mapping", () => {
  assert.match(scriptSrc, /parseNhplatformNursingCsv/);
  assert.match(scriptSrc, /nhplatformNursingInstitutions\.ts/);
  assert.doesNotMatch(scriptSrc, /sourceId:\s|serviceItem:\s|dataOrg:\s/, "no hand-built FacilityRecord shape");
});

test("script source: does not resurrect the dead importLongTermCare() or touch the mohw_ltc_full sourceKey (#605/#600)", () => {
  assert.doesNotMatch(scriptSrc, /importLongTermCare/);
  assert.doesNotMatch(scriptSrc, /mohw_ltc_full/);
  assert.doesNotMatch(scriptSrc, /cleanFacilityType/, "must not use the whole-facility-type delete: long_term_care also holds other sources' rows");
});

test("script source: only runs main() when executed directly, so importing it for tests has no side effects", () => {
  assert.match(scriptSrc, /isMainModule|import\.meta\.url/);
});

test("the six-monthly manual list names this script in both the workflow comment and the scheduling doc", () => {
  const workflow = fs.readFileSync(path.join(ROOT_DIR, ".github", "workflows", "six-monthly-sync.yml"), "utf-8");
  const doc = fs.readFileSync(path.join(ROOT_DIR, "docs", "domains", "10-scheduling-sync-ci.md"), "utf-8");
  const shell = fs.readFileSync(path.join(ROOT_DIR, "scripts", "run-six-monthly-sync.sh"), "utf-8");
  for (const [label, text] of [["workflow", workflow], ["doc", doc], ["shell", shell]]) {
    assert.ok(text.includes("import-nhplatform-nursing-institutions.mjs"), `${label} must list the new manual import script`);
  }
});
