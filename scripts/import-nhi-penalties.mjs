#!/usr/bin/env node
/**
 * Ingests the 4 NHI clinic penalty datasets:
 * - 違規情節重大名冊 (dl-75736)
 * - 停約名冊 (dl-75737)
 * - 五年內不予特約之地址 (dl-75738)
 * - 五年內不予特約之醫事機構及負責醫事人員 (dl-87941)
 *
 * Can run standalone from residential network or via GitHub Actions.
 * Supports URL overrides and local file arguments:
 *   node scripts/import-nhi-penalties.mjs [--dl75736 <path/url>] [--dl75737 <path/url>] ...
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_URLS = {
  dl75736: "https://www.nhi.gov.tw/ch/dl-75736-d1b7cbd16af9438fa57fdef17add4061-1.csv",
  dl75737: "https://www.nhi.gov.tw/ch/dl-75737-a8890d5e00fd4156b7cc4dfd1c3aeb4d-1.csv",
  dl75738: "https://www.nhi.gov.tw/ch/dl-75738-7c98b001249b4327a71ce0a0171600fd-1.csv",
  dl87941: "https://www.nhi.gov.tw/ch/dl-87941-e93b44dea2c44425a5c0121bbde13292-1.csv",
};

const BASE_URL = (process.env.HEALTH_BASE_URL || "https://health.j172.tw").replace(/\/$/, "");
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;

export function parseCsv(text) {
  const cleaned = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (inQuotes) {
      if (char === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r") {
      // skip
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");
  if (nonEmpty.length === 0) return [];
  const headers = nonEmpty[0].map((h) => h.replace(/[\r\n\s\/]/g, "").trim());
  return nonEmpty.slice(1).map((cells) => {
    const record = {};
    headers.forEach((h, idx) => (record[h] = (cells[idx] ?? "").trim()));
    return record;
  });
}

export function cleanCsvText(text) {
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.includes("序號"));
  if (headerIdx > 0) {
    return lines.slice(headerIdx).join("\n");
  }
  return text;
}

export function minguoToIsoDate(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/^(\d{2,3})(\d{2})(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10) + 1911;
  return `${year}-${m[2]}-${m[3]}`;
}

export function computeStatus(startDate, endDate, isSuspended) {
  if (isSuspended) return "suspended_execution";
  const now = new Date().toISOString().slice(0, 10);
  if (endDate && endDate < now) return "expired";
  return "active";
}

async function loadSourceText(target) {
  if (fs.existsSync(target)) {
    return fs.readFileSync(target, "utf-8");
  }
  const cleanUrl = target.trim().replace(/\/$/, "");
  console.log(`  Downloading: ${cleanUrl}...`);
  const res = await fetch(cleanUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) health.j172.tw" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch ${cleanUrl}`);
  return await res.text();
}

async function main() {
  console.log("=================================================");
  console.log("🏥 [NHI Penalties] 下載與解析健保醫療院所違規/停約/管制名冊...");
  console.log("=================================================\n");

  const args = process.argv.slice(2);
  const urls = { ...DEFAULT_URLS };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dl75736" && args[i + 1]) urls.dl75736 = args[++i];
    if (args[i] === "--dl75737" && args[i + 1]) urls.dl75737 = args[++i];
    if (args[i] === "--dl75738" && args[i + 1]) urls.dl75738 = args[++i];
    if (args[i] === "--dl87941" && args[i + 1]) urls.dl87941 = args[++i];
  }

  const [t1, t2, t3, t4] = await Promise.all([
    loadSourceText(urls.dl75736),
    loadSourceText(urls.dl75737),
    loadSourceText(urls.dl75738),
    loadSourceText(urls.dl87941),
  ]);

  const rows1 = parseCsv(cleanCsvText(t1));
  const rows2 = parseCsv(cleanCsvText(t2));
  const rows3 = parseCsv(cleanCsvText(t3));
  const rows4 = parseCsv(cleanCsvText(t4));

  console.log(`\n📊 原始列數:`);
  console.log(`  - 違規重大 (dl-75736): ${rows1.length} 筆`);
  console.log(`  - 停約名冊 (dl-75737): ${rows2.length} 筆`);
  console.log(`  - 管制地址 (dl-75738): ${rows3.length} 筆`);
  console.log(`  - 五年不予特約 (dl-87941): ${rows4.length} 筆\n`);

  const clinicMap = new Map();
  const records = [];

  // dl-75736
  for (const r of rows1) {
    const code = r["院所代號"] || r["代號"];
    const name = r["院所名稱"];
    if (!code || !name) continue;
    const sRaw = r["執行起日"] || "";
    const eRaw = r["執行迄日"] || "";
    const isSuspended = sRaw.includes("暫緩") || eRaw.includes("暫緩");
    const sDate = minguoToIsoDate(sRaw);
    const eDate = minguoToIsoDate(eRaw);
    const status = computeStatus(sDate, eDate, isSuspended);

    clinicMap.set(code, {
      code,
      name,
      address: r["縣市地區"] || r["縣市"] || null,
      penalty: {
        status,
        category: r["處分類別"] || "終止特約",
        reason: r["處分原由"] || "",
        clauses: r["處分條款"] || "",
        practitioner: r["負責醫事人員行為人"] || r["負責醫事人員"] || "",
        startDate: sDate || undefined,
        endDate: eDate || undefined,
        rawMinguoRange: sRaw && eRaw ? `${sRaw} ~ ${eRaw}` : sRaw || eRaw || undefined,
        sourceTitle: "違規情節重大名冊",
      },
    });
  }

  // dl-75737
  for (const r of rows2) {
    const code = r["院所代號"] || r["代號"];
    const name = r["院所名稱"];
    if (!code || !name) continue;
    const sRaw = r["執行起日"] || "";
    const eRaw = r["執行迄日"] || "";
    const isSuspended = sRaw.includes("暫緩") || eRaw.includes("暫緩");
    const sDate = minguoToIsoDate(sRaw);
    const eDate = minguoToIsoDate(eRaw);
    const status = computeStatus(sDate, eDate, isSuspended);

    const existing = clinicMap.get(code);
    if (!existing || (existing.penalty.status === "expired" && status === "active")) {
      clinicMap.set(code, {
        code,
        name,
        address: r["縣市地區"] || r["縣市"] || existing?.address || null,
        penalty: {
          status,
          category: r["處分類別"] || "停約處分",
          reason: r["處分原由"] || "",
          clauses: r["處分條款"] || "",
          practitioner: r["負責醫事人員行為人"] || r["負責醫事人員"] || existing?.penalty.practitioner || "",
          startDate: sDate || undefined,
          endDate: eDate || undefined,
          rawMinguoRange: sRaw && eRaw ? `${sRaw} ~ ${eRaw}` : sRaw || eRaw || undefined,
          sourceTitle: "停約名冊",
        },
      });
    }
  }

  // dl-87941
  for (const r of rows4) {
    const code = r["代號"] || r["院所代號"];
    const name = r["院所名稱"];
    if (!code || !name) continue;
    const sRaw = r["執行起日"] || "";
    const eRaw = r["執行迄日"] || "";
    const isSuspended = sRaw.includes("暫緩") || eRaw.includes("暫緩");
    const sDate = minguoToIsoDate(sRaw);
    const eDate = minguoToIsoDate(eRaw);
    const status = computeStatus(sDate, eDate, isSuspended);
    const region = `${r["縣市"] || ""}${r["鄉鎮市區"] || ""}`.trim();

    const existing = clinicMap.get(code);
    if (!existing) {
      clinicMap.set(code, {
        code,
        name,
        address: region || null,
        penalty: {
          status,
          category: "五年不予特約",
          reason: "五年內不予健保特約之醫事機構及負責醫事人員管制。",
          practitioner: r["負責醫事人員"] || "",
          startDate: sDate || undefined,
          endDate: eDate || undefined,
          rawMinguoRange: sRaw && eRaw ? `${sRaw} ~ ${eRaw}` : sRaw || eRaw || undefined,
          sourceTitle: "五年內不予特約名冊",
        },
      });
    } else if (!existing.penalty.practitioner && r["負責醫事人員"]) {
      existing.penalty.practitioner = r["負責醫事人員"];
    }
  }

  // dl-75738: 管制地址
  for (const r of rows3) {
    const county = r["縣市"] || "";
    const dist = r["鄉鎮市區"] || "";
    const rawAddr = r["地址"] || "";
    if (!rawAddr) continue;
    const fullAddr = `${county}${dist}${rawAddr}`.trim();
    const sRaw = r["執行起日"] || "";
    const eRaw = r["執行迄日"] || "";
    const isSuspended = sRaw.includes("暫緩") || eRaw.includes("暫緩");
    const sDate = minguoToIsoDate(sRaw);
    const eDate = minguoToIsoDate(eRaw);
    const status = computeStatus(sDate, eDate, isSuspended);

    const addrHash = crypto.createHash("sha256").update(fullAddr).digest("hex").slice(0, 16);
    records.push({
      facilityType: "clinic",
      sourceKey: "nhi_penalty",
      sourceId: `addr_${addrHash}`,
      name: `[健保管制地址] ${fullAddr}`,
      address: fullAddr,
      phone: null,
      lat: null,
      lng: null,
      serviceItem: "五年不予特約地址",
      serviceTime: null,
      dataOrg: "衛福部中央健康保險署",
      extra: {
        penalty: {
          status,
          category: "五年不予特約",
          reason: "依全民健康保險法規，此門牌地址於管制期間內，任何新設立之醫事機構均不予健保特約。",
          clauses: "全民健康保險醫事服務機構特約及管理辦法",
          startDate: sDate || undefined,
          endDate: eDate || undefined,
          rawMinguoRange: sRaw && eRaw ? `${sRaw} ~ ${eRaw}` : sRaw || eRaw || undefined,
          sourceTitle: "五年內不予特約之地址",
        },
      },
    });
  }

  // Convert clinicMap to standalone records
  for (const [code, item] of clinicMap.entries()) {
    records.push({
      facilityType: "clinic",
      sourceKey: "nhi_penalty",
      sourceId: code,
      name: item.name,
      address: item.address,
      phone: null,
      lat: null,
      lng: null,
      serviceItem: "健保違規停約",
      serviceTime: null,
      dataOrg: "衛福部中央健康保險署",
      extra: { penalty: item.penalty },
    });
  }

  // Status breakdown
  let activeCount = 0;
  let suspendedCount = 0;
  let expiredCount = 0;
  for (const rec of records) {
    const st = rec.extra?.penalty?.status;
    if (st === "active") activeCount++;
    else if (st === "suspended_execution") suspendedCount++;
    else if (st === "expired") expiredCount++;
  }

  console.log(`✅ 解析完成，彙整出 ${records.length} 筆懲處機構/地址記錄：`);
  console.log(`  - 🛑 處分管制進行中: ${activeCount} 筆`);
  console.log(`  - ⚠️ 暫緩執行: ${suspendedCount} 筆`);
  console.log(`  - ℹ️ 歷史處分（已期滿）: ${expiredCount} 筆\n`);

  // Write seed backup
  const seedDir = path.join(process.cwd(), "data", "facilities-seeds");
  if (!fs.existsSync(seedDir)) fs.mkdirSync(seedDir, { recursive: true });
  const seedPath = path.join(seedDir, "nhi-penalties.json");
  fs.writeFileSync(seedPath, JSON.stringify(records, null, 2), "utf-8");
  console.log(`💾 已儲存本機種子備份: ${seedPath}`);

  // Push to server if ADMIN_SECRET provided
  if (ADMIN_SECRET) {
    console.log(`\n🚀 正在推送至生產環境 ${BASE_URL}/api/admin/facilities-import ...`);
    const resp = await fetch(`${BASE_URL}/api/admin/facilities-import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rss-sync-admin-secret": ADMIN_SECRET,
      },
      body: JSON.stringify({ records }),
    });
    if (!resp.ok) {
      console.error(`❌ 推送失敗: HTTP ${resp.status}`);
      const errText = await resp.text();
      console.error(errText);
    } else {
      const resJson = await resp.json();
      console.log(`🎉 推送成功:`, resJson);
    }
  } else {
    console.log(`\nℹ️ 未設定 ADMIN_SECRET，未推送至遠端 API。若要推送請加上:`);
    console.log(`   ADMIN_SECRET=<secret> node scripts/import-nhi-penalties.mjs`);
  }
}

main().catch((err) => {
  console.error("❌ 執行出錯:", err);
  process.exit(1);
});
