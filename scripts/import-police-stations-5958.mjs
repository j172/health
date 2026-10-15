#!/usr/bin/env node
/**
 * Imports 內政部警政署「各縣(市)警察(分)局暨所屬分駐(派出)所地址資料」(data.gov.tw 5958,
 * 1,687 stations in the 1150930 release) into production's facilities table as
 * facility_type "police_station" / source_key "police_station_5958", which feeds the
 * "police-stations" type on /nearby (issue #677, track B B-9).
 *
 * WHY THIS RUNS BY HAND FROM A RESIDENTIAL / OFFICE NETWORK
 * The ZIP is hosted on www.tgos.tw, which answers HTTP 403 to BOTH the production host
 * and GitHub Actions runners (egress-probe run 38764893673, 2026-10-15). Header and
 * Referer are not the cause: from a home network the very same URL returns 200 for every
 * User-Agent tried (none / curl / Chrome / node / python-requests) with or without a
 * Referer. So it is an IP-range block, which also rules out the "runner fetches, SSH
 * loopback POSTs back" relay. Same pattern as scripts/import-mohw-ltc-gis.mjs and
 * scripts/import-mohw-facilities.mjs: download here, parse here, POST the records to
 * /api/admin/facilities-import. (data.gov.tw's own dataset API is reachable from
 * everywhere and is used to find the current ZIP URL.)
 *
 * WHEN TO RUN IT
 * Every ~6 months together with the other manual imports (list: scripts/
 * run-six-monthly-sync.sh header; docs/domains/10-scheduling-sync-ci.md). The file name
 * carries the release date (…/1150930.zip) so the URL changes per release — this script
 * always resolves it from the data.gov.tw API instead of hard-coding it. The release date
 * is stored on every row as extra_json.dataAsOf and shown on the /nearby card.
 *
 * USAGE (Node >= 22.18; run `npm ci` once so adm-zip and zod exist)
 *   node scripts/import-police-stations-5958.mjs --dry-run              # download + parse + summary, sends nothing, needs no secret
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-police-stations-5958.mjs
 *
 * OPTIONS
 *   --dry-run      parse and print the summary, do not POST (no ADMIN_SECRET needed)
 *   --zip <file>   use a ZIP you already downloaded (e.g. in a browser from the data.gov.tw
 *                  dataset page) instead of fetching it — the fallback if this machine is
 *                  also blocked by www.tgos.tw
 *   --no-verify    skip the post-import read of the public API's live count
 *   --no-clean     upsert only. By default the first request also deletes every existing
 *                  facility_type "police_station" row, so stations that were renamed or
 *                  closed do not linger (the file has no stable ID; identity is name+address)
 *
 * The admin secret is read from the ADMIN_SECRET environment variable only (same as every
 * other import script) and is sent only in the x-rss-sync-admin-secret header — never
 * printed, never written to disk.
 *
 * Safety: nothing is deleted or sent unless the parsed snapshot passes
 * assertPoliceSnapshotSane() (>= 1000 stations, <= 2% without coordinates), so a truncated
 * download, an HTML 403 page or a changed projection stops here, before the old rows go.
 */
import fs from "node:fs";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { submitFacilityBatches } from "./lib/facilities-import-batches.mjs";

const REPO_ROOT = new URL("../", import.meta.url);

// The parser is TypeScript and uses this repo's "@/..." path alias. Node >= 22.18 strips
// the types itself; this hook only teaches it that "@/..." is repo-root-relative and that an
// extensionless relative import means the .ts file — the same shim as
// scripts/import-mohw-social-welfare-centers.mjs and lib/**/*.test.mjs.
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

const {
  POLICE_STATION_DATASET_API_URL,
  POLICE_STATION_FACILITY_TYPE,
  resolveLatestDownloadUrl,
  parsePoliceStations,
  assertPoliceSnapshotSane,
} = await import("../lib/server/facilities/sources/policeStations5958.ts");

const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const skipClean = args.includes("--no-clean");
const skipVerify = args.includes("--no-verify");
const zipArgIndex = args.indexOf("--zip");
const zipPath = zipArgIndex >= 0 ? args[zipArgIndex + 1] : null;

if (zipArgIndex >= 0 && !zipPath) {
  console.error("--zip needs a file path.");
  process.exit(1);
}
if (!isDryRun && !ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value). Run with --dry-run to test without it.");
  process.exit(1);
}

const FETCH_TIMEOUT_MS = 60_000;
const FETCH_HEADERS = { "user-agent": "j172-health-import/1.0 (+https://health.j172.tw)" };

async function loadZip() {
  if (zipPath) {
    console.log(`Reading ZIP from ${zipPath}`);
    return fs.readFileSync(zipPath);
  }

  console.log(`Resolving the latest download URL from ${POLICE_STATION_DATASET_API_URL}`);
  const apiRes = await fetch(POLICE_STATION_DATASET_API_URL, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!apiRes.ok) throw new Error(`data.gov.tw dataset API returned HTTP ${apiRes.status}`);
  const url = resolveLatestDownloadUrl(await apiRes.json());
  console.log(`Downloading ${url}`);

  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (res.status === 403) {
    throw new Error(
      `HTTP 403 from ${new URL(url).host}. That host blocks data-centre/cloud IPs (it is why this import is manual). ` +
        "Run it from a home or office network without VPN/cloud shell, or download the ZIP in a browser from " +
        "https://data.gov.tw/dataset/5958 and re-run with --zip <file>.",
    );
  }
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} from ${new URL(url).host}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Reads the public API's total for facility_type police_station after the import (cache-busted so the
 * edge cache cannot hide the result). Never throws: null means "could not verify".
 */
async function readLiveCount() {
  const params = new URLSearchParams({ type: POLICE_STATION_FACILITY_TYPE, limit: "1", _: String(Date.now()) });
  try {
    const res = await fetch(`${BASE_URL}/api/facilities?${params}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return typeof json?.allTotal === "number" ? json.allTotal : null;
  } catch (error) {
    console.warn(`  could not read the live count: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

function printSummary(parsed) {
  const { records, stats, dataAsOf, csvFileName } = parsed;
  console.log(`\nParsed ${csvFileName}: ${records.length} stations, data date ${dataAsOf ?? "unknown"}`);
  console.log(`  rows in file: ${stats.rows}, dropped (no name/address): ${stats.skippedMissingIdentity}, duplicates: ${stats.duplicateRows}`);
  console.log(
    `  with coordinates: ${stats.withCoordinates}, without: ${stats.withoutCoordinates}, ` +
      `borrowed from a same-address row: ${stats.coordinatesBorrowedFromSameAddress}, read as 119°E zone: ${stats.coordinateZone119}`,
  );
  const sample = (prefix) => records.filter((r) => r.address.startsWith(prefix)).slice(0, 3);
  for (const prefix of ["澎湖", "金門", "連江"]) {
    for (const r of sample(prefix)) console.log(`  ${prefix} sample: ${r.name}  ${r.lat},${r.lng}  ${r.address}`);
  }
}

async function main() {
  const parsed = parsePoliceStations(await loadZip());
  printSummary(parsed);
  assertPoliceSnapshotSane(parsed);

  if (isDryRun) {
    console.log("\nDry run completed successfully. No data was sent.");
    return;
  }

  console.log(`\nImporting ${parsed.records.length} stations into ${BASE_URL}${skipClean ? " (upsert only, --no-clean)" : ` (replacing every existing ${POLICE_STATION_FACILITY_TYPE} row)`}...`);
  const result = await submitFacilityBatches({
    baseUrl: BASE_URL,
    adminSecret: ADMIN_SECRET,
    records: parsed.records,
    cleanFacilityType: skipClean ? null : POLICE_STATION_FACILITY_TYPE,
  });

  console.log("\nImport finished!");
  console.log(`  inserted: ${result.inserted}, updated: ${result.updated}, previous rows deleted: ${result.deleted}`);

  if (!skipVerify) {
    const live = await readLiveCount();
    if (live === null) {
      console.log("  live count could not be verified (is the deploy in place?) — check `/api/facilities?type=police_station` by hand.");
    } else if (live < parsed.records.length) {
      console.warn(`WARNING: the live API reports ${live} police_station rows, fewer than the ${parsed.records.length} just imported.`);
      process.exitCode = 2;
    } else {
      console.log(`  live API reports ${live} police_station rows.`);
    }
  }
  console.log("Next: open /nearby, expand 「更多類型」 -> 派出所／警察局, and spot-check a 澎湖 / 金門 location.");
}

main().catch((err) => {
  console.error("FATAL ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
});
