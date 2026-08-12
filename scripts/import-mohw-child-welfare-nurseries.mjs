#!/usr/bin/env node
/**
 * Fetches MOHW's 全國親子館(托育資源中心)名冊 (UTF-8 CSV)
 * and pushes the parsed records to production's /api/admin/facilities-import endpoint.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-mohw-child-welfare-nurseries.mjs
 */
import { parseCsv, toHalfwidthDigits, normalizeAddress, submitFacilities } from "./lib/mohw-csv.mjs";

const SOURCE_URL =
  "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/160907/" +
  encodeURIComponent("全國親子館(托育資源中心)名冊.csv");
const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}

async function fetchRecords() {
  console.log("Fetching MOHW child welfare nurseries directory (全國親子館名冊)...");
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`${SOURCE_URL} failed: HTTP ${res.status}`);
  const text = await res.text();
  console.log(`  downloaded ${text.length} characters`);

  const rows = parseCsv(text);
  console.log(`  ${rows.length} raw rows`);

  return rows
    .filter((r) => (r["親子館(托育資源中心)名稱"] || r["名稱"]) && r["地址"])
    .map((r) => {
      const name = (r["親子館(托育資源中心)名稱"] || r["名稱"] || "").trim();
      const rawAddr = (r["地址"] || "").trim();
      const city = (r["縣市"] || "").trim();
      const district = (r["區域"] || r["鄉鎮市區"] || "").trim();

      const rawAddress = city && !rawAddr.startsWith(city) ? `${city}${district}${rawAddr}` : rawAddr;
      const address = normalizeAddress(rawAddress);
      const phone = r["電話"] || r["連絡電話"] || null;

      return {
        facilityType: "child_welfare_nursery",
        sourceKey: "mohw_child_welfare_nursery",
        sourceId: `${name}|${address}`.slice(0, 100),
        name,
        address,
        phone: phone ? toHalfwidthDigits(phone) : null,
        lat: null,
        lng: null,
        serviceItem: null,
        serviceTime: null,
        dataOrg: "衛福部社會及家庭署",
      };
    });
}

async function main() {
  const records = await fetchRecords();
  console.log(`Importing ${records.length} child welfare nurseries...`);
  const result = await submitFacilities(BASE_URL, ADMIN_SECRET, records);
  console.log("Import result:", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
