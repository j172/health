#!/usr/bin/env node
/**
 * Fetches TFDA's 健康食品(健字號) open-data export (data.fda.gov.tw
 * export/19, a small ~400-600 row JSON export, confirmed live 2026-09-07)
 * and pushes the parsed records to the production
 * /api/admin/health-supplements-import endpoint in a single batch — small
 * enough to fetch/parse/POST directly, unlike
 * scripts/import-tfda-food-nutrition.mjs which needs GitHub Actions batching.
 *
 * Transport (TRANSPORT): "http" (default) POSTs straight to BASE_URL/HEALTH_BASE_URL.
 * "ssh" runs curl on the app host against its own loopback instead — a
 * GitHub Actions runner IP hitting the public hostname gets a JS anti-bot
 * challenge page back instead of JSON (confirmed live 2026-09-08, same issue
 * documented in scripts/gha-og-external-backfill.mjs), and HawkHost disables
 * TCP forwarding so an `ssh -L` tunnel isn't an option either.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-tfda-health-supplements.mjs
 *   TRANSPORT=ssh SSH_HOST=... SSH_PORT=... SSH_USER=... SSH_KEY_FILE=... ADMIN_SECRET=... node scripts/import-tfda-health-supplements.mjs
 */
import { createSshLoopback, shellQuote } from "./lib/ssh-loopback.mjs";

const SOURCE_URL = "https://data.fda.gov.tw/data/opendata/export/19/json";
const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const TRANSPORT = (process.env.TRANSPORT || "http").toLowerCase();

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}

if (TRANSPORT === "ssh") {
  const { SSH_HOST, SSH_PORT, SSH_USER, SSH_KEY_FILE } = process.env;
  if (!SSH_HOST || !SSH_USER || !SSH_KEY_FILE) {
    console.error("TRANSPORT=ssh requires SSH_HOST, SSH_USER, SSH_KEY_FILE.");
    process.exit(1);
  }
}

const nullify = (s) => (s && String(s).trim() ? String(s).trim() : null);

// Source dates are inconsistently either Western (e.g. "2023-05-01") or
// Taiwan ROC-era (e.g. "112/05/01" or "1120501") across TFDA's various
// exports — parsed defensively, returning null rather than guessing on an
// unrecognized shape.
const parseDate = (raw) => {
  const value = nullify(raw);
  if (!value) return null;

  const isoMatch = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const rocSlashMatch = value.match(/^(\d{2,3})[-/](\d{1,2})[-/](\d{1,2})/);
  if (rocSlashMatch) {
    const [, y, m, d] = rocSlashMatch;
    return `${Number(y) + 1911}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const rocCompactMatch = value.match(/^(\d{2,3})(\d{2})(\d{2})$/);
  if (rocCompactMatch) {
    const [, y, m, d] = rocCompactMatch;
    return `${Number(y) + 1911}-${m}-${d}`;
  }

  return null;
};

async function fetchRecords() {
  console.log("Fetching TFDA 健康食品(健字號) JSON...");
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`${SOURCE_URL} failed: HTTP ${res.status}`);
  const raw = await res.json();
  console.log(`  ${raw.length} raw records`);

  return raw
    .filter((r) => r["許可證字號"] && r["中文品名"])
    .map((r) => ({
      licenseNo: String(r["許可證字號"]).trim(),
      category: nullify(r["類別"]),
      nameZh: String(r["中文品名"]).trim(),
      approvedAt: parseDate(r["核可日期"]),
      applicant: nullify(r["申請商"]),
      status: nullify(r["證況"]),
      functionIngredients: nullify(r["保健功效相關成分"]),
      functionText: nullify(r["保健功效"]),
      claim: nullify(r["保健功效宣稱"]),
      warning: nullify(r["警語"]),
      notice: nullify(r["注意事項"]),
      sourceUrl: nullify(r["網址"]),
    }));
}

async function submitBatchHttp(records) {
  const res = await fetch(`${BASE_URL}/api/admin/health-supplements-import`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-rss-sync-admin-secret": ADMIN_SECRET },
    body: JSON.stringify({ records }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(`Import batch failed: ${JSON.stringify(json)}`);
  return json;
}

function submitBatchSsh(records) {
  const ssh = createSshLoopback({
    keyFile: process.env.SSH_KEY_FILE,
    host: process.env.SSH_HOST,
    port: process.env.SSH_PORT,
    user: process.env.SSH_USER,
  });
  try {
    const payload = JSON.stringify({ records });
    const remote = [
      "curl -sS --max-time 60",
      "-X POST http://127.0.0.1:3000/api/admin/health-supplements-import",
      '-H "content-type: application/json"',
      `-H ${shellQuote(`x-rss-sync-admin-secret: ${ADMIN_SECRET}`)}`,
      "--data-binary @-",
    ].join(" ");
    const result = ssh.call(remote, { input: payload });
    if (result.error) throw result.error;
    let json;
    try {
      json = JSON.parse(result.stdout);
    } catch {
      throw new Error(`ssh curl non-json exit=${result.status}: ${(result.stderr || "").slice(0, 200)} | ${(result.stdout || "").slice(0, 200)}`);
    }
    if (result.status !== 0 || !json.ok) throw new Error(`Import batch failed: ${JSON.stringify(json)}`);
    return json;
  } finally {
    ssh.close();
  }
}

const submitBatch = (records) => (TRANSPORT === "ssh" ? submitBatchSsh(records) : submitBatchHttp(records));

async function main() {
  const records = await fetchRecords();
  console.log(`Importing ${records.length} records...`);
  const result = await submitBatch(records);
  console.log(`Done. inserted=${result.inserted} updated=${result.updated}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
