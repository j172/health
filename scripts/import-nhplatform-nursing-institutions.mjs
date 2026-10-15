#!/usr/bin/env node
/**
 * Manual (residential-network) import of 全國開業護理機構清冊 — data.gov.tw 115950,
 * hosted on nhplatform.mohw.gov.tw — into production's
 * /api/admin/facilities-import endpoint.
 *
 * One CSV (~1,494 rows) feeds two destinations, routed by the shared parser in
 * lib/server/facilities/sources/nhplatformNursingInstitutions.ts:
 *   - 產後護理之家 (~241)            -> facility_type "postpartum_care"  (/tools/postpartum-care)
 *   - 一般護理之家 / 居家護理所 (~1,253) -> facility_type "long_term_care"   (the 護理之家 / 居家護理所
 *                                         category filters on /tools/long-term-care)
 *
 * Why this runs by hand instead of inside the deployed app or a GitHub Action
 * (issue #678, Track B B-8; spec docs/2.0/track-b-opendata-phase2-3-spec.md §2.2/§7.1 D7):
 * nhplatform.mohw.gov.tw times out from BOTH the production host and GitHub
 * runners (egress-probe runs 38724026473 and 38764893673, 2026-10-15) while
 * answering immediately from a normal residential/office network — an
 * IP-range block, the same family as the other *.mohw.gov.tw sources. The
 * owner ruled out a runner relay (it cannot help when the runner is blocked
 * too), so the supported refresh path is this script, run roughly every six
 * months alongside the other manual MOHW imports (see
 * docs/domains/10-scheduling-sync-ci.md §1.3). The in-app facilities-sync
 * entry "nhplatform_115950" still exists and will take over by itself if that
 * block is ever lifted; both write the same source keys, so they never
 * duplicate each other.
 *
 * Nothing here deletes data: the admin route upserts by (source_key,
 * source_id). A closed institution therefore lingers until a cleanup is done
 * separately; this script deliberately never uses the route's whole-facility-
 * type delete, because "long_term_care" also holds other sources' rows.
 *
 * Usage (from a residential/office network, repo root):
 *   node scripts/import-nhplatform-nursing-institutions.mjs --dry-run
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-nhplatform-nursing-institutions.mjs
 *
 * Options:
 *   --dry-run            download + parse + summarise only; needs no secret, sends nothing
 *   --file <path>        use a CSV already saved locally (e.g. downloaded from
 *                        https://data.gov.tw/dataset/115950 in a browser) instead of downloading
 *   --min-records <n>    refuse to import fewer than n usable records (default 1000; the live
 *                        file has ~1,494) — guards against a truncated/blocked download
 *   --no-verify          skip the post-import read of the public API's per-source counts
 *
 * Environment:
 *   ADMIN_SECRET         the production x-rss-sync-admin-secret value (never printed or stored)
 *   HEALTH_BASE_URL      defaults to https://health.j172.tw
 */
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../", import.meta.url);

// The shared parser is TypeScript and uses this repo's "@/..." path alias.
// Node >= 22.18 strips the types on its own; this hook only teaches it that
// "@/..." means repo-root-relative, and that an extensionless relative import
// means the .ts file — the same shim scripts/import-mohw-social-welfare-centers.mjs
// and lib/**/*.test.mjs use.
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
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { parseNhplatformNursingCsv, NHPLATFORM_NURSING_SOURCE_URL } = await import(
  "../lib/server/facilities/sources/nhplatformNursingInstitutions.ts"
);
const { parseCsv } = await import("../lib/server/facilities/csv.ts");

export const DEFAULT_BASE_URL = "https://health.j172.tw";
/** The live file has ~1,494 rows; anything far below that is a truncated or blocked download. */
export const MIN_EXPECTED_RECORDS = 1000;
/** Well inside the admin route's 60s maxDuration, and small enough that one retried batch is cheap. */
export const BATCH_SIZE = 500;
const MAX_RETRIES = 4;
const SUBMIT_TIMEOUT_MS = 55_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const VERIFY_TIMEOUT_MS = 30_000;
const MAX_ERROR_BODY_PREVIEW = 200;

const POSTPARTUM_SOURCE_KEY = "nhplatform_115950_postpartum";
const LTC_SOURCE_KEY = "nhplatform_115950_ltc";

const USAGE =
  "Usage: node scripts/import-nhplatform-nursing-institutions.mjs [--dry-run] [--file <path>] [--min-records <n>] [--no-verify]";

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseArgs(argv) {
  const opts = { dryRun: false, file: null, minRecords: MIN_EXPECTED_RECORDS, verify: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--no-verify") opts.verify = false;
    else if (arg === "--file" || arg.startsWith("--file=")) {
      const value = arg === "--file" ? argv[++i] : arg.slice("--file=".length);
      if (!value) throw new Error(`--file needs a path. ${USAGE}`);
      opts.file = value;
    } else if (arg === "--min-records" || arg.startsWith("--min-records=")) {
      const value = arg === "--min-records" ? argv[++i] : arg.slice("--min-records=".length);
      const n = Number(value);
      if (!value || !Number.isInteger(n) || n < 0) throw new Error(`--min-records needs a non-negative integer. ${USAGE}`);
      opts.minRecords = n;
    } else {
      throw new Error(`Unknown argument: ${arg}. ${USAGE}`);
    }
  }
  return opts;
}

/**
 * CSV text -> facility records via the shared parser, plus a per-destination
 * summary. Refuses (throws) when fewer than `minRecords` usable records come
 * out, so an HTML denial page or a truncated download can never be imported
 * as if it were the register.
 */
export function buildRecordsFromCsv(text, { minRecords = MIN_EXPECTED_RECORDS } = {}) {
  const parsed = parseNhplatformNursingCsv(text);
  // Two rows can only share (sourceKey, sourceId) if the upstream file repeats
  // an institution; keep the last one so a single batch never upserts a key twice.
  const byKey = new Map();
  for (const record of parsed) byKey.set(`${record.sourceKey}|${record.sourceId}`, record);
  const records = [...byKey.values()];

  if (records.length < minRecords) {
    throw new Error(
      `Parsed only ${records.length} usable records (expected at least ${minRecords}); ` +
        "refusing to import what looks like a truncated or blocked download. " +
        "Pass --min-records <n> only if the register genuinely shrank.",
    );
  }

  // The shared mapper drops unrecognised 機構類別 rows, so count the file's own data rows separately.
  const totalRows = parseCsv(text).length;
  return {
    records,
    summary: {
      totalRows,
      records: records.length,
      postpartumCare: records.filter((r) => r.facilityType === "postpartum_care").length,
      longTermCare: records.filter((r) => r.facilityType === "long_term_care").length,
      skippedRows: totalRows - parsed.length,
      duplicateKeys: parsed.length - records.length,
    },
  };
}

export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The real download sends `content-disposition: attachment; filename=114%e5%b9%b412%e6%9c%88...csv`. */
export function parseContentDispositionFilename(header) {
  if (!header) return null;
  const match = header.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export async function downloadCsv({ fetchImpl, url = NHPLATFORM_NURSING_SOURCE_URL, timeoutMs = DOWNLOAD_TIMEOUT_MS }) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    throw new Error(
      `Download of ${url} failed: HTTP ${res.status}. ` +
        "This must run from a residential/office network (the host and GitHub runners are blocked); " +
        "alternatively save the CSV from https://data.gov.tw/dataset/115950 and pass --file <path>.",
    );
  }
  return {
    text: await res.text(),
    fileName: parseContentDispositionFilename(res.headers.get("content-disposition")),
  };
}

/**
 * POSTs one batch to the admin route. The production host occasionally serves
 * a transient HTML error page (502/504, brief resource contention — see
 * docs/domains/11-hosting-ops-incidents.md) instead of JSON; without a retry
 * one blip aborted a whole run in the past (import-mohw-ltc-gis.mjs, live
 * 2026-10-15). Network errors, non-JSON bodies, 429 and 5xx are retried with
 * exponential back-off (the upsert is idempotent); a genuine application
 * failure (4xx JSON, or res.ok with json.ok === false) is not.
 */
export async function submitBatchWithRetry(
  records,
  { baseUrl, adminSecret, fetchImpl = globalThis.fetch, sleep = defaultSleep, maxRetries = MAX_RETRIES, log = console.warn },
) {
  const body = JSON.stringify({ records });
  for (let attempt = 0; ; attempt++) {
    const delayMs = 2000 * 2 ** attempt;
    let res;
    let text;
    try {
      res = await fetchImpl(`${baseUrl}/api/admin/facilities-import`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-rss-sync-admin-secret": adminSecret },
        body,
        signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
      });
      text = await res.text();
    } catch (networkError) {
      if (attempt >= maxRetries) {
        throw new Error(`Import batch failed after ${attempt + 1} attempts: ${networkError.message}`);
      }
      log(`  Batch request failed (${networkError.message}), retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(delayMs);
      continue;
    }

    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Non-JSON body: a transient HTML error page (or a Cloudflare interstitial).
    }
    if (json === null || typeof json !== "object") {
      if (attempt >= maxRetries) {
        const preview = text.length > MAX_ERROR_BODY_PREVIEW ? `${text.slice(0, MAX_ERROR_BODY_PREVIEW)}... (truncated)` : text;
        throw new Error(`Import batch failed: HTTP ${res.status}, non-JSON body: ${preview}`);
      }
      log(`  Batch got non-JSON HTTP ${res.status} response, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(delayMs);
      continue;
    }

    if (res.ok && json.ok) return json;

    const transient = res.status >= 500 || res.status === 429;
    if (transient && attempt < maxRetries) {
      log(`  Batch got HTTP ${res.status}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(delayMs);
      continue;
    }
    const hint =
      res.status === 401 || res.status === 403
        ? " (check that ADMIN_SECRET equals the production x-rss-sync-admin-secret value)"
        : "";
    throw new Error(`Import batch failed: HTTP ${res.status} ${JSON.stringify(json)}${hint}`);
  }
}

/**
 * Reads the public API's per-source counts after the import (cache-busted: the
 * route's 60s edge cache must not hide the result). Never fatal — a null `ok`
 * means "could not verify", `false` means the live count is below what was just
 * imported.
 */
export async function verifyLiveCounts({ baseUrl, fetchImpl, expected }) {
  const targets = [
    { facilityType: "postpartum_care", sourceKey: POSTPARTUM_SOURCE_KEY, expected: expected.postpartumCare },
    { facilityType: "long_term_care", sourceKey: LTC_SOURCE_KEY, expected: expected.longTermCare },
  ];
  const results = [];
  for (const target of targets) {
    const params = new URLSearchParams({
      type: target.facilityType,
      limit: "1",
      dataStatusSource: target.sourceKey,
      _: String(Date.now()),
    });
    try {
      const res = await fetchImpl(`${baseUrl}/api/facilities?${params}`, { signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const reported = json?.dataStatus?.sourceTotal;
      // An API deployed before this feature ignores dataStatusSource; for the
      // postpartum tool allTotal is still exact (that type has one source).
      const actual =
        typeof reported === "number" ? reported : target.facilityType === "postpartum_care" ? (json?.allTotal ?? null) : null;
      results.push({
        ...target,
        actual,
        dataDate: json?.dataStatus?.dataDate ?? null,
        ok: actual === null ? null : actual >= target.expected,
      });
    } catch (error) {
      results.push({ ...target, actual: null, dataDate: null, ok: null, note: error.message });
    }
  }
  return results;
}

export async function runImport({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  log = console.log,
  warn = console.warn,
} = {}) {
  const opts = parseArgs(argv);
  const baseUrl = (env.HEALTH_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const adminSecret = env.ADMIN_SECRET;
  if (!opts.dryRun && !adminSecret) {
    throw new Error(
      "Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value). Use --dry-run to test parsing without it.",
    );
  }

  let text;
  let fileName = null;
  if (opts.file) {
    log(`Reading ${opts.file} ...`);
    text = fs.readFileSync(path.resolve(opts.file), "utf-8");
  } else {
    log("Downloading 全國開業護理機構清冊 (data.gov.tw 115950) from nhplatform.mohw.gov.tw ...");
    ({ text, fileName } = await downloadCsv({ fetchImpl }));
  }
  if (fileName) log(`  source file: ${fileName}`);

  const { records, summary } = buildRecordsFromCsv(text, { minRecords: opts.minRecords });
  log(
    `  ${summary.totalRows} data rows -> ${summary.records} records ` +
      `(產後護理之家 ${summary.postpartumCare}, 一般護理之家/居家護理所 ${summary.longTermCare}; ` +
      `${summary.skippedRows} skipped, ${summary.duplicateKeys} duplicate keys)`,
  );

  if (opts.dryRun) {
    log("Dry run complete. Nothing was sent to production.");
    return { dryRun: true, summary, fileName };
  }

  const batches = chunk(records, BATCH_SIZE);
  const totals = { inserted: 0, updated: 0 };
  for (let i = 0; i < batches.length; i++) {
    log(`Submitting batch ${i + 1}/${batches.length} (${batches[i].length} records) to ${baseUrl} ...`);
    const result = await submitBatchWithRetry(batches[i], { baseUrl, adminSecret, fetchImpl, sleep, log: warn });
    totals.inserted += result.inserted || 0;
    totals.updated += result.updated || 0;
    log(`  Batch ${i + 1} done: inserted=${result.inserted ?? 0} updated=${result.updated ?? 0}`);
  }
  log(`Import finished: inserted=${totals.inserted} updated=${totals.updated}`);

  let verification = null;
  if (opts.verify) {
    verification = await verifyLiveCounts({ baseUrl, fetchImpl, expected: summary });
    for (const v of verification) {
      const live = v.actual === null ? "unknown" : String(v.actual);
      const tail = v.note ? ` (${v.note})` : v.dataDate ? ` (資料日期 ${v.dataDate})` : "";
      if (v.ok === false) {
        warn(`WARNING: live ${v.facilityType}/${v.sourceKey} count is ${live}, expected at least ${v.expected}${tail}`);
      } else if (v.ok === null) {
        log(`  could not verify ${v.facilityType}/${v.sourceKey}: live count ${live}${tail}`);
      } else {
        log(`  verified ${v.facilityType}/${v.sourceKey}: live count ${live} >= ${v.expected}${tail}`);
      }
    }
  }

  return { dryRun: false, summary, totals, verification, fileName };
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  runImport()
    .then((result) => {
      if (result.verification?.some((v) => v.ok === false)) process.exitCode = 2;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
