#!/usr/bin/env node
/**
 * scripts/build-contraception-seed.mjs
 *
 * Downloads certified contraception consultation facilities from BeOK (台灣婦產科醫學會 / 避孕諮詢室).
 * Endpoint: POST https://www.beok.org.tw/wp-admin/admin-ajax.php
 *
 * Saves normalized points to:
 *   data/contraception-map-seed.json
 *
 * Run:
 *   node scripts/build-contraception-seed.mjs
 */

import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const SEED_PATH = path.join(ROOT_DIR, "data", "contraception-map-seed.json");

async function main() {
  console.log("🛡️ 下載與建置避孕諮詢地圖種子資料 (BeOK 避孕諮詢室)...");
  const res = await fetch("https://www.beok.org.tw/wp-admin/admin-ajax.php", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 health.j172.tw",
    },
    body: "action=asl_load_stores&load_all=1",
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: Failed to download BeOK stores`);
  }

  const rawList = await res.json();
  console.log(`取得 ${rawList.length} 筆原始據點資料...`);

  const points = [];
  let idSeq = 1;

  for (const item of rawList) {
    const name = (item.title || "").trim();
    if (!name) continue;

    const lat = item.lat ? Number(item.lat) : null;
    const lng = item.lng ? Number(item.lng) : null;
    if (!lat || !lng || !Number.isFinite(lat) || lat === 0) continue;

    // category: 19 = 婦產科診所, 18 = 藥局
    const category = item.categories === "19" ? "clinic" : "pharmacy";
    const categoryLabel = category === "clinic" ? "婦產科診所" : "諮詢藥局";

    let openHours = null;
    if (item.open_hours) {
      try {
        openHours = typeof item.open_hours === "string" ? JSON.parse(item.open_hours) : item.open_hours;
      } catch {
        openHours = item.open_hours;
      }
    }

    points.push({
      id: idSeq++,
      originalId: item.id || null,
      name,
      category,
      categoryLabel,
      city: item.city ? item.city.trim() : null,
      postalCode: item.postal_code ? item.postal_code.trim() : null,
      address: item.street ? item.street.trim() : null,
      phone: item.phone ? item.phone.trim() : null,
      lat,
      lng,
      openHours,
      daysStr: item.days_str || null,
      source: "台灣婦產科醫學會 避孕諮詢室 (BeOK)",
    });
  }

  const clinicsCount = points.filter((p) => p.category === "clinic").length;
  const pharmaciesCount = points.filter((p) => p.category === "pharmacy").length;

  const payload = {
    ok: true,
    total: points.length,
    clinicsCount,
    pharmaciesCount,
    updatedAt: new Date().toISOString(),
    points,
  };

  fs.writeFileSync(SEED_PATH, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`\n✅ 避孕諮詢地圖種子檔已生成: ${SEED_PATH}`);
  console.log(`   總計: ${points.length} 處據點（婦產科診所 ${clinicsCount} 家，諮詢藥局 ${pharmaciesCount} 家）`);
}

main().catch((err) => {
  console.error("建置失敗:", err);
  process.exit(1);
});
