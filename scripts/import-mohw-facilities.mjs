#!/usr/bin/env node
/**
 * Fetches ltcpap.mohw.gov.tw's health-check facility CSV and pushes the
 * parsed records to the production /api/admin/facilities-import endpoint.
 *
 * (This script used to also import long-term-care facilities via
 * importLongTermCare(), but that was removed in issue #605: it was
 * superseded by scripts/import-mohw-ltc-gis.mjs back in #285, yet wrote
 * degraded data — serviceItem hardcoded to null — under the same
 * sourceKey, "mohw_ltc_full", that the newer script also writes. Re-running
 * this old function would have silently clobbered the better data back to
 * the degraded version. See #600 for the bug this caused in production.)
 *
 * Why this runs locally instead of as part of the deployed app: the CSV is
 * unreachable from both the production cPanel host and GitHub Actions
 * runners (both time out — likely an IP-range block on ltcpap.mohw.gov.tw's
 * side), but reachable fine from a regular residential/office network. Run
 * this from your own machine whenever the data needs refreshing (e.g. every
 * 6 months, alongside the other facility sources).
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-mohw-facilities.mjs
 */

const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}

/** Minimal CSV line parser — handles quoted fields, no embedded newlines (these CSVs don't have any). */
function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function parseCsv(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}

async function fetchCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed: HTTP ${res.status}`);
  return parseCsv(await res.text());
}

const toNum = (s) => {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

async function importHealthCheck() {
  console.log("Fetching hpa.csv (健檢機構)...");
  const rows = await fetchCsv("https://ltcpap.mohw.gov.tw/public/csv/hpa.csv");
  console.log(`  ${rows.length} rows`);

  const records = rows
    .filter((r) => r["機構名稱"])
    .map((r) => ({
      facilityType: "health_check",
      sourceKey: "mohw_hpa_facility",
      sourceId: `${r["機構名稱"]}|${r["地址全址"] || ""}`.slice(0, 100),
      name: r["機構名稱"],
      address: r["地址全址"] || null,
      phone: r["機構電話"] || null,
      lat: toNum(r["緯度"]),
      lng: toNum(r["經度"]),
      serviceItem: "成人預防保健",
      serviceTime: r["聯絡人"] ? `聯絡人：${r["聯絡人"]}` : null,
      dataOrg: "國健署健康促進機構",
    }));

  return records;
}

async function submit(records) {
  const res = await fetch(`${BASE_URL}/api/admin/facilities-import`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-rss-sync-admin-secret": ADMIN_SECRET },
    body: JSON.stringify({ records }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(`Import failed: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const hpa = await importHealthCheck();
  const hpaResult = await submit(hpa);
  console.log("健檢機構 import result:", hpaResult);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
