#!/usr/bin/env node
/**
 * Fetches MOHW's 全國身心障礙福利機構一覽表 (nationwide disability welfare
 * institution directory, a Big5-encoded CSV) and pushes the parsed records
 * to production's /api/admin/facilities-import endpoint.
 *
 * Why this runs locally instead of via the deployed app's own facilities-
 * sync: opendata.mohw.gov.tw is a mohw.gov.tw subdomain, the same apex
 * domain as ltcpap.mohw.gov.tw — which is confirmed unreachable from both
 * the production host and GitHub Actions runners (IP-range block). A
 * facilities-sync run attempting this source came back with zero rows and
 * no visible error (fire-and-forget endpoint, no per-source log surfaced),
 * consistent with the same block rather than a code bug — this script
 * (running on a regular residential/office network) confirms that.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-mohw-disability-welfare.mjs
 */
import iconv from "iconv-lite";
import { parseCsv, toHalfwidthDigits, normalizeAddress, submitFacilities } from "./lib/mohw-csv.mjs";

const SOURCE_URL =
  "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/12061/%E5%85%A8%E5%9C%8B%E8%BA%AB%E5%BF%83%E9%9A%9C%E7%A4%99%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E4%B8%80%E8%A6%BD%E8%A1%A8.csv";
const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}

async function fetchRecords() {
  console.log("Fetching MOHW disability welfare institution directory...");
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`${SOURCE_URL} failed: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  console.log(`  downloaded ${buffer.length} bytes`);

  const text = iconv.decode(buffer, "big5");
  const rows = parseCsv(text);
  console.log(`  ${rows.length} raw rows`);

  return rows
    .filter((r) => r["機構名稱"] && r["地址"])
    .map((r) => {
      // 地址 already includes the full county+district+street (confirmed:
      // 263/266 rows start with 縣市 verbatim) — prepending unconditionally
      // produced "新北市土城區新北市土城區中正路18號6樓"-style duplication.
      // Only prepend for the rare row where it's genuinely missing.
      const rawAddress = r["地址"].startsWith(r["縣市"]) ? r["地址"] : `${r["縣市"]}${r["鄉鎮市區"]}${r["地址"]}`;
      const address = normalizeAddress(rawAddress);
      return {
        facilityType: "disability_welfare",
        sourceKey: "mohw_disability_welfare",
        sourceId: `${r["機構名稱"]}|${address}`.slice(0, 100),
        name: r["機構名稱"],
        address,
        phone: r["連絡電話"] ? toHalfwidthDigits(r["連絡電話"]) : null,
        lat: null,
        lng: null,
        serviceItem: r["機構類型"] || null,
        serviceTime: null,
        dataOrg: "衛福部",
      };
    });
}

async function main() {
  const records = await fetchRecords();
  console.log(`Importing ${records.length} institutions...`);
  const result = await submitFacilities(BASE_URL, ADMIN_SECRET, records);
  console.log("Import result:", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
