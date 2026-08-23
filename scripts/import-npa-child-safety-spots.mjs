#!/usr/bin/env node
/**
 * Fetches National Police Agency (NPA) Child & Women Safety Alert Spots (婦幼安全警示地點)
 * normalizes coordinates & addresses with county context,
 * and pushes the records to production's /api/admin/facilities-import endpoint.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-npa-child-safety-spots.mjs
 */
import { parseCsv, toHalfwidthDigits, normalizeAddress } from "./lib/mohw-csv.mjs";

const SOURCE_URL =
  "https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/DBB18796-8A89-4917-B4AB-D0AF26FAFEDC/resource/ADD554F1-FE8C-422C-8ACE-1E560D119E2A/download";
const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET or RSS_SYNC_ADMIN_SECRET env var.");
  process.exit(1);
}

function extractCityFromDept(deptNm) {
  if (!deptNm) return "";
  const match = deptNm.match(/^([^\s市縣]+[市縣])/);
  if (match) return match[1].replace(/政府$/, "");
  return "";
}

async function main() {
  console.log("=================================================");
  console.log("🛡️ [Child Safety Spots] 開始下載警政署婦幼安全警示地點資料...");
  console.log(`🎯 來源: ${SOURCE_URL}`);
  console.log(`🎯 目標伺服器: ${BASE_URL}`);
  console.log("=================================================\n");

  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": "j172-health-sync/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to download NPA dataset`);

  const text = await res.text();
  const rows = parseCsv(text);
  console.log(`原始下載 ${rows.length} 筆資料。開始過濾表頭與清洗格式...`);

  const validRows = rows.filter(
    (r) =>
      r.No &&
      r.No !== "編號" &&
      r.Address &&
      r.Address !== "地點位置" &&
      r.DeptNm !== "管轄警察局"
  );

  const records = validRows.map((r) => {
    const rawNo = (r.No || "").trim();
    const rawAddr = (r.Address || "").trim();
    const dept = (r.DeptNm || "").trim();
    const branch = (r.BranchNm || "").trim();
    const contact = (r.Contact || "").trim();
    const phone = (r.ContactNumber || "").trim();

    const city = extractCityFromDept(dept);
    const rawAddress = city && !rawAddr.startsWith(city) ? `${city}${rawAddr}` : rawAddr;
    const address = normalizeAddress(rawAddress);
    const displayName = `${rawAddr} (${branch || dept})`;

    return {
      facilityType: "child_safety_spot",
      sourceKey: "npa_child_safety_spot",
      sourceId: `npa_${rawNo}_${address}`.slice(0, 100),
      name: displayName,
      address,
      phone: phone ? toHalfwidthDigits(phone) : null,
      lat: null,
      lng: null,
      serviceItem: `管轄：${dept} ${branch} | 窗口：${contact || "專人"}`,
      serviceTime: null,
      dataOrg: "內政部警政署",
      extra: {
        no: rawNo,
        dept,
        branch,
        contact,
        city,
      },
    };
  });

  console.log(`有效警示地點資料: ${records.length} 筆，提交至資料庫...`);

  const submitRes = await fetch(`${BASE_URL}/api/admin/facilities-import`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rss-sync-admin-secret": ADMIN_SECRET,
    },
    body: JSON.stringify({ records }),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`匯入失敗: HTTP ${submitRes.status} - ${errText}`);
  }

  const result = await submitRes.json();
  console.log("\n=================================================");
  console.log("🎉 婦幼安全警示地點資料匯入完成！");
  console.log(`📊 總筆數: ${records.length} | 新增: ${result.inserted} | 更新: ${result.updated}`);
  console.log("=================================================");
}

main().catch((err) => {
  console.error("執行失敗:", err);
  process.exit(1);
});
