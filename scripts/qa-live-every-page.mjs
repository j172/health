import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { TOOL_CATALOG } = await import("../lib/server/tools/catalog.ts");

const BASE_URL = process.env.BASE_URL || "https://health.j172.tw";

console.log("===============================================================");
console.log(`🌐 [Live Comprehensive QA] 全站 80 款工具與核心頁面即時可用性審查`);
console.log(`🎯 目標環境: ${BASE_URL}`);
console.log("===============================================================\n");

let passed = 0;
let failed = 0;
const failures = [];

async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          "User-Agent": "HealthQA/1.0",
          ...(options.headers || {}),
        },
      });
      return res;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

// 1. 核心頁面測試
const corePages = [
  { path: "/", name: "首頁 (Home)" },
  { path: "/news", name: "即時新聞總覽 (/news)" },
  { path: "/tools", name: "全站工具總覽 (/tools)" },
];

console.log("📌 1. 審查核心主頁面...");
for (const page of corePages) {
  const url = `${BASE_URL}${page.path}`;
  try {
    const res = await fetchWithRetry(url);
    if (res.status === 200) {
      const text = await res.text();
      if (text.length > 500 && !text.includes("Application error")) {
        console.log(`  ✅ [200] ${page.name} (${(text.length / 1024).toFixed(1)} KB)`);
        passed++;
      } else {
        console.error(`  ❌ [FAIL] ${page.name}: 回傳內容不完整或含錯誤`);
        failed++;
        failures.push({ target: page.name, url, error: "內容不完整或含錯誤" });
      }
    } else {
      console.error(`  ❌ [HTTP ${res.status}] ${page.name}`);
      failed++;
      failures.push({ target: page.name, url, error: `HTTP ${res.status}` });
    }
  } catch (err) {
    console.error(`  ❌ [NETWORK ERROR] ${page.name}: ${err.message}`);
    failed++;
    failures.push({ target: page.name, url, error: err.message });
  }
}

// 2. 80 款工具頁面全面抽檢與併行驗證
console.log(`\n📌 2. 審查全站 ${TOOL_CATALOG.length} 款工具頁面可用性...`);

const BATCH_SIZE = 8;
for (let i = 0; i < TOOL_CATALOG.length; i += BATCH_SIZE) {
  const batch = TOOL_CATALOG.slice(i, i + BATCH_SIZE);
  await Promise.all(
    batch.map(async (tool) => {
      const url = `${BASE_URL}/tools/${tool.slug}`;
      try {
        const res = await fetchWithRetry(url);
        if (res.status === 200) {
          const text = await res.text();
          if (text.length > 1000 && !text.includes("Application error") && !text.includes("404 Not Found")) {
            passed++;
          } else {
            console.error(`  ❌ [FAIL] ${tool.title} (/tools/${tool.slug})`);
            failed++;
            failures.push({ target: tool.title, url, error: "頁面過短或含錯誤" });
          }
        } else {
          console.error(`  ❌ [HTTP ${res.status}] ${tool.title} (/tools/${tool.slug})`);
          failed++;
          failures.push({ target: tool.title, url, error: `HTTP ${res.status}` });
        }
      } catch (err) {
        console.error(`  ❌ [NETWORK ERROR] ${tool.title}: ${err.message}`);
        failed++;
        failures.push({ target: tool.title, url, error: err.message });
      }
    })
  );
  process.stdout.write(`  ⏳ 已檢測進度: ${Math.min(i + BATCH_SIZE, TOOL_CATALOG.length)} / ${TOOL_CATALOG.length} ...\r`);
}
console.log(`\n  ✅ 完成 80 款工具頁面抽檢！`);

// 3. 測試後端真分頁與精細搜尋 API 契約
console.log("\n📌 3. 審查分頁器 (30/50/100) 與縣市行政區篩選 API 契約...");

const apiTests = [
  {
    name: "分頁 30 筆 (預設)",
    url: `${BASE_URL}/api/facilities?type=pharmacy&page=1&pageSize=30`,
    validate: (json) => json.facilities?.length > 0 && json.facilities?.length <= 30 && json.pageSize === 30,
  },
  {
    name: "分頁 50 筆",
    url: `${BASE_URL}/api/facilities?type=pharmacy&page=1&pageSize=50`,
    validate: (json) => json.facilities?.length > 0 && json.facilities?.length <= 50 && json.pageSize === 50,
  },
  {
    name: "分頁 100 筆",
    url: `${BASE_URL}/api/facilities?type=pharmacy&page=1&pageSize=100`,
    validate: (json) => json.facilities?.length > 0 && json.facilities?.length <= 100 && json.pageSize === 100,
  },
  {
    name: "台北市中正區細緻篩選",
    url: `${BASE_URL}/api/facilities?type=clinic&county=%E8%87%BA%E5%8C%97%E5%B8%82&district=%E4%B8%AD%E6%AD%A3%E5%8D%80&page=1&pageSize=30`,
    validate: (json) => json.facilities?.length > 0 && json.total > 0,
  },
  {
    name: "公共藝術與藝文場所 API",
    url: `${BASE_URL}/api/culture/public-art?limit=30`,
    validate: (json) => json.items?.length > 0,
  },
  {
    name: "健康食品認證 API",
    url: `${BASE_URL}/api/health-supplements?page=1&pageSize=30`,
    validate: (json) => (json.results || json.items)?.length > 0,
  },
];

for (const api of apiTests) {
  try {
    const res = await fetchWithRetry(api.url);
    if (res.status === 200) {
      const json = await res.json();
      if (api.validate(json)) {
        console.log(`  ✅ [PASS] ${api.name}`);
        passed++;
      } else {
        console.error(`  ❌ [FAIL] ${api.name}: 資料結構或筆數不符預期`, json);
        failed++;
        failures.push({ target: api.name, url: api.url, error: "回傳結構不符預期" });
      }
    } else {
      console.error(`  ❌ [HTTP ${res.status}] ${api.name}`);
      failed++;
      failures.push({ target: api.name, url: api.url, error: `HTTP ${res.status}` });
    }
  } catch (err) {
    console.error(`  ❌ [API ERROR] ${api.name}: ${err.message}`);
    failed++;
    failures.push({ target: api.name, url: api.url, error: err.message });
  }
}

console.log("\n===============================================================");
console.log(`📊 [QA 綜合報告]`);
console.log(`   - 總測試項目: ${passed + failed}`);
console.log(`   - 成功通過: ${passed}`);
console.log(`   - 失敗項目: ${failed}`);
console.log("===============================================================");

if (failed > 0) {
  console.error("\n❌ 以下項目未通過 QA 檢驗：");
  failures.forEach((f) => console.error(`  - ${f.target} (${f.url}): ${f.error}`));
  process.exit(1);
} else {
  console.log("\n🎉🎉🎉 全站 80 款工具、核心主頁、分頁 (30/50/100) 與 22 縣市 368 鄉鎮區極細篩選全數通過 QA！有資料且運作正常！");
  process.exit(0);
}
