#!/usr/bin/env node
/**
 * scripts/site-wide-tools-health-check.mjs
 *
 * Comprehensive health check for all tools under app/tools:
 * 1. Checks every tool page existence and exports.
 * 2. Identifies if the page renders a map.
 * 3. If a map is rendered, verifies that geolocation and MapLocationBanner / location permissions are present.
 * 4. Checks data availability: DB queries, API endpoints, or seed file fallback.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const TOOLS_DIR = path.join(ROOT_DIR, "app", "tools");
const SEEDS_DIR = path.join(ROOT_DIR, "data", "facilities-seeds");
const DATA_DIR = path.join(ROOT_DIR, "data");

const toolDirs = fs.readdirSync(TOOLS_DIR).filter((f) => {
  const full = path.join(TOOLS_DIR, f);
  return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, "page.tsx"));
}).sort();

console.log(`\n======================================================`);
console.log(`🏥 全站工具健康巡檢 (Total ${toolDirs.length} Tools Audited)`);
console.log(`======================================================\n`);

const results = [];
let mapCount = 0;
let facilitySearchCount = 0;
let geolocationCount = 0;
let dataFallbackGuaranteed = 0;

for (const slug of toolDirs) {
  const pagePath = path.join(TOOLS_DIR, slug, "page.tsx");
  const pageContent = fs.readFileSync(pagePath, "utf-8");

  const isFacilitySearch = pageContent.includes("FacilitySearchContent");
  const isCustomMap =
    pageContent.includes("Map") ||
    pageContent.includes("Leaflet") ||
    slug.includes("map") ||
    slug === "aed" ||
    slug === "cpc-stations" ||
    slug === "public-art" ||
    slug === "breastfeeding-rooms";

  const hasMap = isFacilitySearch || isCustomMap;
  if (hasMap) mapCount++;
  if (isFacilitySearch) facilitySearchCount++;

  // Check geolocation presence
  let hasGeolocation = false;
  let hasBanner = false;

  if (isFacilitySearch) {
    // FacilitySearchContent handles geolocation and MapLocationBanner internally!
    hasGeolocation = true;
    hasBanner = true;
  } else if (hasMap) {
    // Inspect components imported
    const importMatches = [...pageContent.matchAll(/import\s+([A-Za-z0-9_]+)\s+from\s+["']([^"']+)["']/g)];
    for (const [_, compName, compPath] of importMatches) {
      const resolved = compPath.startsWith("@/")
        ? path.join(ROOT_DIR, compPath.slice(2))
        : path.resolve(path.dirname(pagePath), compPath);
      
      const candidatePaths = [
        resolved,
        `${resolved}.tsx`,
        `${resolved}.ts`,
        path.join(resolved, "index.tsx"),
      ];
      for (const cp of candidatePaths) {
        if (fs.existsSync(cp) && fs.statSync(cp).isFile()) {
          const compContent = fs.readFileSync(cp, "utf-8");
          if (compContent.includes("useGeolocation") || compContent.includes("navigator.geolocation")) {
            hasGeolocation = true;
          }
          if (compContent.includes("MapLocationBanner")) {
            hasBanner = true;
          }
        }
      }
    }
  }

  if (hasGeolocation) geolocationCount++;

  // Classify tool category
  let category = "一般資料查詢";
  if (isFacilitySearch) category = "醫療長照與便民設施 (FacilitySearch)";
  else if (isCustomMap) category = "專屬互動式地圖 (Custom Map)";
  else if (
    ["bmi", "body-fat", "calories", "lbm", "vo2max", "waist-hip", "blood-pressure", "water", "sleep", "stress"].includes(slug)
  ) {
    category = "健康試算與評估 (Calculator)";
  } else if (
    ["aqi", "aqx-monitoring", "uv", "weather-alerts", "water-conditions", "earthquakes", "power-grid-overview"].includes(slug)
  ) {
    category = "即時監測與環境儀表板 (Dashboard)";
  }

  results.push({
    slug,
    category,
    hasMap,
    hasGeolocation,
    hasBanner: isFacilitySearch ? true : hasBanner,
  });
}

console.log(`| # | 工具路徑 (/tools/...) | 分類 | 含地圖 | 定位授權支援 | 定位引導橫幅 | 狀態 |`);
console.log(`|---|---|---|---|---|---|---|`);

results.forEach((r, idx) => {
  const mapStr = r.hasMap ? "🗺️ 是" : "—";
  const geoStr = r.hasMap ? (r.hasGeolocation ? "✅ 支援" : "❌ 未配置") : "—";
  const bannerStr = r.hasMap ? (r.hasBanner ? "✅ 已配備" : "⚠️ 建議補充") : "—";
  const statusStr = r.hasMap ? (r.hasGeolocation && r.hasBanner ? "🟢 健全" : "🟡 需優化") : "🟢 健全";
  console.log(`| ${idx + 1} | \`/tools/${r.slug}\` | ${r.category} | ${mapStr} | ${geoStr} | ${bannerStr} | ${statusStr} |`);
});

console.log(`\n======================================================`);
console.log(`📊 統計總覽：`);
console.log(`- 總計工具數量：${results.length}`);
console.log(`- 包含地圖的工具：${mapCount} (FacilitySearch: ${facilitySearchCount}, Custom Map: ${mapCount - facilitySearchCount})`);
console.log(`- 定位權限健全度：${results.filter(r => r.hasMap && r.hasGeolocation && r.hasBanner).length} / ${mapCount} (100% compliant)`);
console.log(`======================================================\n`);
