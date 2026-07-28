#!/usr/bin/env node
/**
 * Fetches ltcpap.mohw.gov.tw's long-term-care and health-check facility CSVs
 * and pushes the parsed records to the production /api/admin/facilities-import
 * endpoint.
 *
 * Why this runs locally instead of as part of the deployed app: the CSVs are
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

async function importLongTermCare() {
  console.log("Fetching ltc.csv (長照機構)...");
  const rows = await fetchCsv("https://ltcpap.mohw.gov.tw/public/csv/ltc.csv");
  console.log(`  ${rows.length} rows`);

  const records = rows
    .filter((r) => r["機構代碼"] && r["機構名稱"])
    .map((r) => ({
      facilityType: "long_term_care",
      sourceKey: "mohw_ltc_full",
      sourceId: r["機構代碼"],
      name: r["機構名稱"],
      address: r["地址全址"] || null,
      phone: r["機構電話"] || null,
      lat: toNum(r["緯度"]),
      lng: toNum(r["經度"]),
      serviceItem: null,
      serviceTime: null,
      dataOrg: "衛福部長照服務地圖",
    }));

  return records;
}

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
  const ltc = await importLongTermCare();
  const ltcResult = await submit(ltc);
  console.log("長照機構 import result:", ltcResult);

  const hpa = await importHealthCheck();
  const hpaResult = await submit(hpa);
  console.log("健檢機構 import result:", hpaResult);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
