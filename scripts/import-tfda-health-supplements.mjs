#!/usr/bin/env node
/**
 * Fetches TFDA's 健康食品(健字號) open-data export (data.fda.gov.tw
 * export/19, a small ~400-600 row JSON export, confirmed live 2026-09-07)
 * and pushes the parsed records to the production
 * /api/admin/health-supplements-import endpoint in a single batch — small
 * enough to fetch/parse/POST directly, unlike
 * scripts/import-tfda-food-nutrition.mjs which needs GitHub Actions batching.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-tfda-health-supplements.mjs
 */
const SOURCE_URL = "https://data.fda.gov.tw/data/opendata/export/19/json";
const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
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

async function submitBatch(records) {
  const res = await fetch(`${BASE_URL}/api/admin/health-supplements-import`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-rss-sync-admin-secret": ADMIN_SECRET },
    body: JSON.stringify({ records }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(`Import batch failed: ${JSON.stringify(json)}`);
  return json;
}

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
