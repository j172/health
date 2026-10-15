import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

// Issue #677: scripts/import-police-stations-5958.mjs is the residential-network manual import for
// dataset 5958 (www.tgos.tw 403s the production host and GitHub runners). Its logic lives in
// lib/server/facilities/sources/policeStations5958.ts and scripts/lib/facilities-import-batches.mjs
// (both unit-tested); this file checks the script's own wiring with source-text checks (this repo's
// convention for network scripts) plus offline --dry-run runs of the real CLI.

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SCRIPT = path.join(ROOT, "scripts", "import-police-stations-5958.mjs");
const src = fs.readFileSync(SCRIPT, "utf8");
const fixtureCsv = fs.readFileSync(path.join(ROOT, "lib/server/facilities/__fixtures__/police-stations-5958-sample.csv"), "utf8");

function runScript(args, env = {}) {
  const cleanEnv = { ...process.env, ...env };
  delete cleanEnv.ADMIN_SECRET;
  if (env.ADMIN_SECRET) cleanEnv.ADMIN_SECRET = env.ADMIN_SECRET;
  return spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", SCRIPT, ...args], {
    encoding: "utf8",
    env: cleanEnv,
    timeout: 60_000,
  });
}

function writeZip(dir, csvText) {
  const zip = new AdmZip();
  zip.addFile("manifest.csv", Buffer.from("name,schema,description\r\nPoliceAddress1_1150930.csv,,x", "utf8"));
  zip.addFile("PoliceAddress1_1150930.csv", Buffer.from(csvText, "utf8"));
  const file = path.join(dir, "5958.zip");
  fs.writeFileSync(file, zip.toBuffer());
  return file;
}

/** The 71-row fixture repeated with unique names so it clears the 1000-row sanity floor. */
function bigCsv() {
  const [header, ...rows] = fixtureCsv.replace(/^﻿/, "").trim().split("\n");
  const out = [header];
  for (let copy = 0; copy < 20; copy++) {
    for (const row of rows) {
      const cells = row.split(",");
      cells[0] = `${cells[0]}#${copy}`;
      out.push(cells.join(","));
    }
  }
  return "﻿" + out.join("\n") + "\n";
}

test("script: admin secret comes from the ADMIN_SECRET env var only and is never printed", () => {
  assert.match(src, /process\.env\.ADMIN_SECRET/);
  assert.doesNotMatch(src, /\.env["'`]/, "must not read any .env file");
  assert.doesNotMatch(src, /dotenv|readFileSync\([^)]*\.env/, "must not load dotenv/.env");
  // Every console.* call: none may interpolate the secret.
  const logCalls = src.match(/console\.(log|error|warn)\([^;]*\);/g) ?? [];
  assert.ok(logCalls.length > 0);
  for (const call of logCalls) {
    assert.ok(!/\$\{\s*ADMIN_SECRET\s*\}|,\s*ADMIN_SECRET\s*[,)]/.test(call), `a log call interpolates the secret: ${call}`);
  }
});

test("script: resolves the latest ZIP URL from the data.gov.tw API instead of hard-coding the dated tgos URL", () => {
  assert.match(src, /resolveLatestDownloadUrl\(/);
  assert.match(src, /POLICE_STATION_DATASET_API_URL/);
  assert.doesNotMatch(src, /www\.tgos\.tw\/tgos\/VirtualDir/, "the dated URL must not be hard-coded");
});

test("script: explains the 403 (IP block, not headers) and offers the --zip fallback", () => {
  assert.match(src, /res\.status === 403/);
  assert.match(src, /--zip/);
  assert.match(src, /residential|home or office/i);
});

test("script: POSTs through the retrying batch helper and replaces the old snapshot by default (--no-clean opts out)", () => {
  assert.match(src, /submitFacilityBatches\(/);
  assert.match(src, /cleanFacilityType:\s*skipClean \? null : POLICE_STATION_FACILITY_TYPE/);
  assert.match(src, /--no-clean/);
});

test("script: after a real import it reads the public API's live count (cache-busted, never fatal, --no-verify skips it)", () => {
  assert.match(src, /async function readLiveCount\(\)/);
  assert.ok(src.includes("/api/facilities?${params}"), "reads the public facilities API");
  assert.match(src, /_: String\(Date\.now\(\)\)/, "cache-busted so the edge cache cannot hide the result");
  assert.match(src, /allTotal/);
  assert.match(src, /--no-verify/);
  assert.match(src, /process\.exitCode = 2/, "a live count below what was imported must be a non-zero exit");
});

test("script: the sanity guard runs before anything is sent or deleted", () => {
  const guard = src.indexOf("assertPoliceSnapshotSane(parsed)");
  const submit = src.indexOf("await submitFacilityBatches(");
  assert.ok(guard > 0 && submit > guard, "assertPoliceSnapshotSane must precede submitFacilityBatches");
});

test("script: --dry-run on a real-shaped ZIP needs no secret, sends nothing and prints the data date + island samples", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "police5958-"));
  try {
    const zip = writeZip(dir, bigCsv());
    const res = runScript(["--dry-run", "--zip", zip], { HEALTH_BASE_URL: "http://127.0.0.1:9" });
    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /data date 2026-09-30/);
    assert.match(res.stdout, /澎湖 sample: .*23\.5/);
    assert.match(res.stdout, /金門 sample: .*24\.4/);
    assert.match(res.stdout, /Dry run completed successfully\. No data was sent\./);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("script: a truncated snapshot (the 71-row fixture alone) is refused by the sanity guard", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "police5958-"));
  try {
    const zip = writeZip(dir, fixtureCsv);
    const res = runScript(["--dry-run", "--zip", zip]);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /truncated/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("script: a non-dry run without ADMIN_SECRET stops before downloading anything", () => {
  const res = runScript(["--zip", path.join(os.tmpdir(), "does-not-exist.zip")]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Missing ADMIN_SECRET/);
  assert.doesNotMatch(res.stderr, /does-not-exist/, "must fail on the missing secret before touching the file");
});

test("script: an HTML page saved as the ZIP (a 403 response) fails with a clear message", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "police5958-"));
  try {
    const file = path.join(dir, "blocked.zip");
    fs.writeFileSync(file, "<html><title>403 Forbidden</title></html>");
    const res = runScript(["--dry-run", "--zip", file]);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /not a ZIP/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
