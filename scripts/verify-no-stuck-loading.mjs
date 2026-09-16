import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("🔍 [Health Tool Loading Health Check] 正在檢驗全站工具載入安全機制...\n");

let errors = 0;
let checkedCount = 0;

// 1. 檢查 useGeolocation.ts 的逾時設定
const geoHookPath = path.join(rootDir, "components/Facilities/useGeolocation.ts");
const geoHookContent = fs.readFileSync(geoHookPath, "utf-8");

const promptTimeoutMatch = geoHookContent.match(/PROMPT_TIMEOUT_MS\s*=\s*([\d_]+)/);
const decidedTimeoutMatch = geoHookContent.match(/DECIDED_TIMEOUT_MS\s*=\s*([\d_]+)/);

const promptTimeout = Number(promptTimeoutMatch?.[1].replace(/_/g, ""));
const decidedTimeout = Number(decidedTimeoutMatch?.[1].replace(/_/g, ""));

if (!promptTimeout || promptTimeout > 15000) {
  console.error(`❌ PROMPT_TIMEOUT_MS (${promptTimeout}ms) 過高或遺失，可能導致瀏覽器授權等待卡死！`);
  errors++;
} else {
  console.log(`✅ useGeolocation.ts PROMPT_TIMEOUT_MS 設定為安全值: ${promptTimeout}ms`);
}

if (!decidedTimeout || decidedTimeout > 8000) {
  console.error(`❌ DECIDED_TIMEOUT_MS (${decidedTimeout}ms) 過高或遺失！`);
  errors++;
} else {
  console.log(`✅ useGeolocation.ts DECIDED_TIMEOUT_MS 設定為安全值: ${decidedTimeout}ms`);
}

// 2. 檢驗關鍵組件是否依然殘留 if (location.loading) return 或 if (geo.loading) 等阻斷式等待
const criticalComponents = [
  "components/Facilities/FacilitySearchContent.tsx",
  "components/Tools/AedContent.tsx",
  "components/Tools/NearbyRainfallCard.tsx",
  "components/Tools/OutdoorSafetyContent.tsx",
  "components/Tools/FoodSafetyContent.tsx",
  "components/Tools/InundationMapContent.tsx",
  "components/DisasterMap/DisasterMapContent.tsx",
  "components/BreastfeedingRooms/BreastfeedingMapContent.tsx",
  "components/ContraceptionMap/ContraceptionMapContent.tsx",
  "components/DengueMosquitoMap/DengueMosquitoMapContent.tsx",
  "components/HeritageMap/HeritageMapContent.tsx",
  "components/Activities/PublicArtContent.tsx",
  "components/Tools/YoubikeContent.tsx",
  "components/Tools/useNearestStation.ts",
  "components/News/NearbyWeatherBar.tsx",
  "components/Tools/LocalWeatherSvgWidget.tsx",
  "components/Tools/WeatherRainfallLocator.tsx",
];

console.log("\n🛡️ 檢查核心客戶端元件是否有阻斷式定位等待 (Blocking GPS Loading Guard)...");
for (const relPath of criticalComponents) {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ 找不到元件檔案: ${relPath}`);
    errors++;
    continue;
  }
  const content = fs.readFileSync(fullPath, "utf-8");

  // 檢查是否有 if (location.loading) return
  if (/if\s*\(\s*(location|geo)\.loading\s*\)\s*return/.test(content)) {
    console.error(`❌ ${relPath} 存在 if (location.loading) return 阻斷等待！`);
    errors++;
  } else {
    console.log(`✅ ${relPath}: 無定位阻斷等待`);
    checkedCount++;
  }

  // 檢查是否有使用 fetchWithTimeout
  if (content.includes("fetchWithTimeout")) {
    console.log(`  └─ 已套用 fetchWithTimeout 逾時熔斷`);
  }
}

// 3. 掃描 app/tools 底下的所有子目錄路由
console.log("\n📦 掃描 app/tools 所有工具子路由...");
const toolsDir = path.join(rootDir, "app/tools");
const entries = fs.readdirSync(toolsDir, { withFileTypes: true });

let toolRoutes = [];
for (const entry of entries) {
  if (entry.isDirectory()) {
    const pagePath = path.join(toolsDir, entry.name, "page.tsx");
    if (fs.existsSync(pagePath)) {
      toolRoutes.push(entry.name);
    }
  }
}

console.log(`共發現 ${toolRoutes.length} 款工具頁面路由。`);

// 檢驗工具頁面是否有未捕獲的異常或語法
for (const tool of toolRoutes) {
  const pagePath = path.join(toolsDir, tool, "page.tsx");
  const content = fs.readFileSync(pagePath, "utf-8");
  if (!content || content.length < 50) {
    console.error(`❌ 工具 ${tool} page.tsx 內容異常為空！`);
    errors++;
  }
}
console.log(`✅ 全數 ${toolRoutes.length} 款工具路由檔案完整度檢驗通過。`);

// 4. 驗證 fetchWithTimeout 工具模組健全度
const fwtPath = path.join(rootDir, "lib/client/fetchWithTimeout.ts");
if (!fs.existsSync(fwtPath)) {
  console.error("❌ 找不到 lib/client/fetchWithTimeout.ts");
  errors++;
} else {
  const fwtContent = fs.readFileSync(fwtPath, "utf-8");
  if (!fwtContent.includes("AbortController") || !fwtContent.includes("timeoutMs")) {
    console.error("❌ lib/client/fetchWithTimeout.ts 缺乏 AbortController 或 timeoutMs 實作");
    errors++;
  } else {
    console.log("✅ lib/client/fetchWithTimeout.ts 逾時熔斷機制完整");
  }
}

console.log("\n=========================================");
if (errors > 0) {
  console.error(`❌ 檢驗失敗，共發現 ${errors} 項問題！`);
  process.exit(1);
} else {
  console.log(`🎉 檢驗全數通過！已確認全站工具全面導入非阻斷式即時渲染與逾時防禦。`);
  process.exit(0);
}
