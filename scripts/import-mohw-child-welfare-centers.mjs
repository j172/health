#!/usr/bin/env node
/**
 * Fetches MOHW's 兒童及少年福利服務中心一覽表 (Big5 CSV)
 * and pushes the parsed records to production's /api/admin/facilities-import endpoint.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-mohw-child-welfare-centers.mjs
 */
import iconv from "iconv-lite";
import { parseCsv, toHalfwidthDigits, normalizeAddress, submitFacilities } from "./lib/mohw-csv.mjs";

const SOURCE_URL =
  "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/161604/" +
  encodeURIComponent("兒童及少年福利服務中心一覽表.csv");
const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}

async function fetchRecords() {
  console.log("Fetching MOHW child welfare centers directory (兒少福利服務中心一覽表)...");
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`${SOURCE_URL} failed: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  console.log(`  downloaded ${buffer.length} bytes`);

  let text;
  try {
    text = iconv.decode(buffer, "big5");
  } catch {
    text = buffer.toString("utf-8");
  }

  const rows = parseCsv(text);
  console.log(`  ${rows.length} raw rows`);

  return rows
    .filter((r) => (r["服務中心名稱"] || r["中心名稱"] || r["名稱"]) && r["地址"])
    .map((r) => {
      const name = (r["服務中心名稱"] || r["中心名稱"] || r["名稱"] || "").trim();
      const rawAddr = (r["地址"] || "").trim();
      const city = (r["縣市別"] || r["縣市"] || "").trim();

      const rawAddress = city && !rawAddr.startsWith(city) ? `${city}${rawAddr}` : rawAddr;
      const address = normalizeAddress(rawAddress);
      const phone = r["連絡電話"] || r["電話"] || null;

      return {
        facilityType: "child_welfare_center",
        sourceKey: "mohw_child_welfare_center",
        sourceId: `${name}|${address}`.slice(0, 100),
        name,
        address,
        phone: phone ? toHalfwidthDigits(phone) : null,
        lat: null,
        lng: null,
        serviceItem: r["經營模式"] || null,
        serviceTime: null,
        dataOrg: "衛福部社會及家庭署",
      };
    });
}

async function main() {
  const records = await fetchRecords();
  console.log(`Importing ${records.length} child welfare centers...`);
  const result = await submitFacilities(BASE_URL, ADMIN_SECRET, records);
  console.log("Import result:", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
