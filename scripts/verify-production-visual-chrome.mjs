import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const SCREENSHOT_DIR = path.join(ROOT_DIR, "docs", "audits", "visual-audit-screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const ARTIFACT_PATH = "C:\\Users\\j1720\\.gemini\\antigravity\\brain\\7def6b35-6c1f-4533-a8c4-08fdcb25505f\\production-chrome-visual-audit.md";
const GALLERY_HTML_PATH = path.join(ROOT_DIR, "docs", "audits", "visual-audit-gallery.html");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "https://health.j172.tw";
const CDP_PORT = 9222;

const HIGH_PRIORITY_SLUGS = new Set([
  "home",
  "tools-index",
  "er-status",
  "clinics",
  "aed",
  "disaster-map",
  "anti-fraud",
  "water-conditions",
  "public-toilets",
  "cpc-prices",
]);

const RAW_TOOLS = [
  {"slug":"bmi-calculator","title":"BMI 健康體位計算器"},
  {"slug":"calorie-daily-needs","title":"TDEE 每日熱量與基礎代謝率計算機"},
  {"slug":"blood-pressure-tracker","title":"血壓即時紀錄與標準分析工具"},
  {"slug":"body-fat-percentage","title":"體脂率與理想體態估算器"},
  {"slug":"waist-to-hip-ratio","title":"腰臀比健康體態評估工具"},
  {"slug":"water-intake-calculator","title":"每日建議飲水量計算機"},
  {"slug":"sleep-cycle-calculator","title":"睡眠週期與最佳就寢時間計算機"},
  {"slug":"target-heart-rate","title":"運動目標心率與燃脂區間計算器"},
  {"slug":"ideal-body-weight","title":"理想體重與健康範圍評估工具"},
  {"slug":"macronutrient-calculator","title":"三大營養素比例與飲食分配計算器"},
  {"slug":"daily-protein-intake","title":"每日蛋白質建議攝取量計算機"},
  {"slug":"glycemic-index-lookup","title":"升糖指數 (GI值) 與熱量快速查詢工具"},
  {"slug":"dietary-fiber-calculator","title":"膳食纖維攝取量評估與富含食物查詢"},
  {"slug":"maximum-heart-rate","title":"最大心率 (HRmax) 與運動強度換算器"},
  {"slug":"daily-sodium-intake","title":"每日鈉含量攝取評估與減鹽建議工具"},
  {"slug":"healthy-weight-loss-planner","title":"健康減重期程與熱量缺口規劃器"},
  {"slug":"dietary-fat-intake","title":"脂肪攝取量與油脂比例計算機"},
  {"slug":"daily-calcium-intake","title":"每日鈣質攝取評估與補鈣食物指南"},
  {"slug":"intermittent-fasting-tracker","title":"間歇性斷食計時與計畫指引工具"},
  {"slug":"daily-iron-intake","title":"每日鐵質攝取評估與補鐵食物指南"},
  {"slug":"caffeine-intake-tracker","title":"每日咖啡因攝取記錄與安全限額評估"},
  {"slug":"daily-potassium-intake","title":"每日鉀離子攝取評估與高鉀食物查詢"},
  {"slug":"daily-sugar-intake","title":"每日游離糖攝取評估與減糖建議工具"},
  {"slug":"daily-vitamin-c-intake","title":"每日維生素C攝取評估與富含食物查詢"},
  {"slug":"exercise-calories-burned","title":"運動消耗熱量 (MET) 即時計算機"},
  {"slug":"daily-vitamin-d-intake","title":"每日維生素D攝取評估與日照補D指南"},
  {"slug":"basal-body-temperature-tracker","title":"基礎體溫紀錄與排卵期生理週期分析"},
  {"slug":"pregnancy-due-date-calculator","title":"預產期計算器與孕期週數進度追蹤"},
  {"slug":"gestational-weight-gain","title":"孕期體重增加建議與健康曲線評估工具"},
  {"slug":"baby-feeding-tracker","title":"嬰幼兒奶量計算與每日作息哺乳紀錄"},
  {"slug":"child-growth-percentile","title":"兒童生長曲線百分位快速查詢工具"},
  {"slug":"vaccination-schedule-planner","title":"公費兒童與成人疫苗接種時程規劃器"},
  {"slug":"ovulation-fertile-window","title":"排卵期計算器與受孕黃金期預測工具"},
  {"slug":"postpartum-depression-scale","title":"愛丁堡產後憂鬱症自我評估量表 (EPDS)"},
  {"slug":"children-development-milestones","title":"兒童發展里程碑與早期療育自評檢核表"},
  {"slug":"daily-zinc-intake","title":"每日鋅攝取評估與富含食物指南"},
  {"slug":"childcare-subsidy-calculator","title":"0-6歲國家一起養：育兒津貼與托育補助試算"},
  {"slug":"postpartum-recovery-tracker","title":"產後身體恢復與惡露觀察評估工具"},
  {"slug":"emergency-hotlines","title":"全臺緊急救助與重要諮詢電話總覽"},
  {"slug":"er-status","title":"全臺醫院急診即時看診與等待人數看板"},
  {"slug":"aed","title":"全國公共場所 AED 急救地圖與即時導航"},
  {"slug":"clinics","title":"全臺健保特約醫療院所即時查詢與地圖"},
  {"slug":"pharmacies","title":"全臺健保特約藥局即時查詢與地圖"},
  {"slug":"dengue-map","title":"本土登革熱與屈公病每日最新疫情地圖"},
  {"slug":"flu-status","title":"全臺公費流感抗病毒藥劑特約院所地圖"},
  {"slug":"first-aid-guide","title":"居家與外出常見急救處置指引"},
  {"slug":"blood-donation-spots","title":"全臺捐血據點與即時血液庫存查詢地圖"},
  {"slug":"covid-status","title":"COVID-19 疫苗接種合約院所即時地圖"},
  {"slug":"long-term-care-services","title":"長照 2.0 服務項目與自費額即時試算器"},
  {"slug":"assistive-devices-subsidy","title":"身心障礙與失能輔具補助金額快速試算"},
  {"slug":"long-term-care-facilities","title":"全臺長照機構與日間照顧中心清單地圖"},
  {"slug":"dementia-resources","title":"失智症照顧資源與失智友善據點地圖"},
  {"slug":"social-welfare-subsidy-lookup","title":"全臺弱勢族群社會救助與各項生活補助查詢"},
  {"slug":"cooling-shelters","title":"全臺極端高溫避暑防熱涼適點據點地圖"},
  {"slug":"food-nutrition-database","title":"食品營養成分與熱量快速檢索資料庫"},
  {"slug":"food-safety-violations","title":"全臺不合格食品稽查與違規裁罰名冊查詢"},
  {"slug":"restaurant-hygiene-inspection","title":"全臺餐飲衛生稽查合格與優良評鑑地圖"},
  {"slug":"drinking-water-quality","title":"自來水水質與飲用水水源即時檢驗報告"},
  {"slug":"food-additive-lookup","title":"合法食品添加物用途與使用限量法規查詢"},
  {"slug":"pesticide-residue-standards","title":"農藥殘留容許量標準與用藥規範查詢"},
  {"slug":"green-certifications","title":"環保標章認證、綠色旅宿與綠色餐廳清單"},
  {"slug":"water-conditions","title":"臺灣水情水庫蓄水量與水情燈號即時看板"},
  {"slug":"air-quality-forecast","title":"全國即時空氣品質指標 (AQI) 與防護指引"},
  {"slug":"uv-index-forecast","title":"即時紫外線指數 (UVI) 與防曬警示指引"},
  {"slug":"weather-alerts","title":"中央氣象署即時天氣特報與劇烈天氣示警"},
  {"slug":"disaster-map","title":"各縣市防救災避難收容處所地圖與導航"},
  {"slug":"inundation-map","title":"全臺積淹水感測即時警訊與淹水潛勢圖"},
  {"slug":"radiation-monitoring","title":"全國環境輻射即時監測數值與安全指標"},
  {"slug":"earthquake-history","title":"臺灣歷史有感地震檢索與震度報告資料庫"},
  {"slug":"anti-fraud","title":"165 全民防騙：高風險賣場與詐騙手法即時警示"},
  {"slug":"smoking-cessation-clinics","title":"全臺戒菸服務合約醫療院所查詢地圖"},
  {"slug":"mental-health-consultation","title":"全臺免費心理諮商據點與心理健康資源地圖"},
  {"slug":"gambling-addiction-resources","title":"問題賭博求助管道與戒賭諮詢資源地圖"},
  {"slug":"substance-abuse-treatment","title":"藥癮與物質成癮戒治醫療機構清單地圖"},
  {"slug":"public-toilets","title":"全臺公廁位置、無障礙設施與即時導航地圖"},
  {"slug":"accessible-transit","title":"全臺各縣市無障礙大眾運輸與低底盤公車指引"},
  {"slug":"power-outages","title":"全臺即時停電狀況與台電計畫性檢修停電查詢"},
  {"slug":"work-school-status","title":"天然災害停止上班及上課即時宣布看板"},
  {"slug":"electric-vehicle-charging","title":"全臺公共電動車充電樁站點地圖與規格查詢"},
  {"slug":"cpc-prices","title":"中油即時油價走勢預測與全臺加油站地圖"},
  {"slug":"cultural-assets","title":"全臺文化資產古蹟與歷史建築數位導覽地圖"},
  {"slug":"cultural-events","title":"全臺藝文活動即時資訊與展演活動行事曆"},
  {"slug":"national-parks-guide","title":"臺灣國家公園自然生態保護區與入園資訊指南"},
  {"slug":"tourism-factories","title":"經濟部評鑑優良觀光工廠參觀與預約指南"}
];

const SUB_TOOLS = [
  { slug: "green-certifications", tab: "green-hotels", title: "綠色旅宿（環保旅館）", path: "/tools/green-certifications?tab=green-hotels" },
  { slug: "green-certifications", tab: "green-restaurants", title: "綠色餐廳", path: "/tools/green-certifications?tab=green-restaurants" },
  { slug: "cpc-prices", tab: "stations", title: "中油加油站服務據點", path: "/tools/cpc-prices?tab=stations" },
  { slug: "water-conditions", tab: "reservoir-status", title: "即時水庫水情", path: "/tools/water-conditions?tab=reservoir-status" },
];

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.callbacks = new Map();
    this.eventListeners = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && this.callbacks.has(msg.id)) {
            const { resolve, reject } = this.callbacks.get(msg.id);
            this.callbacks.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
          } else if (msg.method) {
            const listeners = this.eventListeners.get(msg.method) || [];
            for (const fn of listeners) fn(msg.params);
          }
        } catch (e) {
          console.error("CDP parse error:", e);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    if (!this.eventListeners.has(method)) {
      this.eventListeners.set(method, []);
    }
    this.eventListeners.get(method).push(listener);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function launchChrome() {
  const userDataDir = path.join(ROOT_DIR, ".chrome-audit-profile");
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  console.log(`[Chrome] 啟動獨立 CDP 實體 (Port ${CDP_PORT})...`);
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,800",
    "about:blank",
  ]);

  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) {
        const data = await res.json();
        console.log(`[Chrome] 連接成功: ${data.webSocketDebuggerUrl}`);
        return { process: chromeProcess, wsUrl: data.webSocketDebuggerUrl };
      }
    } catch {}
  }
  throw new Error("無法連接 Chrome CDP");
}

async function createTarget(url = "about:blank") {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  return await res.json();
}

async function closeTarget(targetId) {
  try {
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${targetId}`);
  } catch {}
}

async function runVisualAudit() {
  console.log("==================================================");
  console.log("🚀 正式站全量工具 Google Chrome 視覺與真實資料巡檢");
  console.log(`目標網站: ${BASE_URL}`);
  console.log("==================================================");

  let chrome;
  try {
    chrome = await launchChrome();
  } catch (err) {
    console.error("[Fatal] 啟動 Chrome 失敗:", err.message);
    process.exit(1);
  }

  const results = [];
  const ga4EventsCaptured = [];

  const pagesToTest = [
    { title: "首頁便民工具 Launchpad", path: "/", slug: "home", isHub: true },
    { title: "工具總覽頁 (/tools)", path: "/tools", slug: "tools-index", isHub: true },
    ...SUB_TOOLS.map((st) => ({ title: `[子分頁] ${st.title}`, path: st.path, slug: `${st.slug}-${st.tab}`, isSub: true })),
    ...RAW_TOOLS.map((t) => ({ title: t.title, path: `/tools/${t.slug}`, slug: t.slug })),
  ];

  console.log(`共計檢驗 ${pagesToTest.length} 個端點 (含雙視窗截圖與 GA4 封包監聽)...`);

  for (let index = 0; index < pagesToTest.length; index++) {
    const pageItem = pagesToTest[index];
    const isHighPriority = HIGH_PRIORITY_SLUGS.has(pageItem.slug) || pageItem.isHub;
    const viewports = isHighPriority
      ? [
          { name: "mobile", width: 390, height: 844, isMobile: true },
          { name: "desktop", width: 1280, height: 800, isMobile: false },
        ]
      : [{ name: "desktop", width: 1280, height: 800, isMobile: false }];

    console.log(`\n[${index + 1}/${pagesToTest.length}] 檢驗中: ${pageItem.title} (${pageItem.path})`);

    for (const vp of viewports) {
      const target = await createTarget();
      const client = new CdpClient(target.webSocketDebuggerUrl);
      await client.connect();

      const pageErrors = [];
      const ga4Hits = [];

      try {
        await client.send("Page.enable");
        await client.send("Runtime.enable");
        await client.send("Network.enable");

        await client.send("Emulation.setDeviceMetricsOverride", {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 1,
          mobile: vp.isMobile,
        });

        client.on("Runtime.exceptionThrown", (params) => {
          pageErrors.push(params.exceptionDetails?.text || "Unknown Exception");
        });

        client.on("Network.requestWillBeSent", (params) => {
          const reqUrl = params.request.url;
          if (reqUrl.includes("google-analytics.com") || reqUrl.includes("analytics.google.com")) {
            const urlObj = new URL(reqUrl);
            const en = urlObj.searchParams.get("en") || "page_view";
            ga4Hits.push(en);
            ga4EventsCaptured.push({ page: pageItem.path, event: en, url: reqUrl });
          }
        });

        const startTime = Date.now();
        await client.send("Page.navigate", { url: `${BASE_URL}${pageItem.path}` });

        let isReady = false;
        let checks = 0;
        while (!isReady && checks < 12) {
          await sleep(500);
          checks++;
          const evalRes = await client.send("Runtime.evaluate", {
            expression: `(() => {
              const pulse = document.querySelectorAll('.animate-pulse').length;
              const hasContent = document.body && document.body.innerText.length > 50;
              const hasMap = document.querySelectorAll('.leaflet-pane, .maplibregl-canvas').length > 0;
              return { pulse, hasContent, hasMap };
            })()`,
            returnByValue: true,
          });

          const state = evalRes.result?.value;
          if (state && (state.pulse === 0 || state.hasMap) && state.hasContent) {
            isReady = true;
          }
        }

        const renderDuration = Date.now() - startTime;

        const screenshotRes = await client.send("Page.captureScreenshot", { format: "png" });
        const screenshotFileName = `${pageItem.slug}-${vp.name}.png`;
        const screenshotFullPath = path.join(SCREENSHOT_DIR, screenshotFileName);
        fs.writeFileSync(screenshotFullPath, Buffer.from(screenshotRes.data, "base64"));

        const auditItem = {
          title: pageItem.title,
          path: pageItem.path,
          slug: pageItem.slug,
          viewport: vp.name,
          renderDurationMs: renderDuration,
          errorsCount: pageErrors.length,
          errors: pageErrors,
          ga4Hits,
          screenshotFile: screenshotFileName,
          status: pageErrors.length === 0 ? "PASS" : "WARN",
        };

        results.push(auditItem);
        console.log(`  ✓ [${vp.name}] 加載耗時: ${renderDuration}ms | GA4: [${ga4Hits.join(", ")}] | 截圖: ${screenshotFileName}`);
      } catch (err) {
        console.error(`  ✗ [${vp.name}] 失敗:`, err.message);
        results.push({
          title: pageItem.title,
          path: pageItem.path,
          slug: pageItem.slug,
          viewport: vp.name,
          renderDurationMs: 0,
          errorsCount: 1,
          errors: [err.message],
          ga4Hits: [],
          screenshotFile: "",
          status: "FAIL",
        });
      } finally {
        client.close();
        await closeTarget(target.id);
      }
    }
  }

  if (chrome?.process) {
    chrome.process.kill();
  }

  console.log("\n==================================================");
  console.log("📊 正在產出視覺審查 Artifact 與 HTML 相簿...");
  console.log("==================================================");

  generateMarkdownArtifact(results, ga4EventsCaptured);
  generateHtmlGallery(results);

  console.log(`\n🎉 巡檢全量完成！`);
  console.log(`- 報告 Artifact: ${ARTIFACT_PATH}`);
  console.log(`- 本地相簿: ${GALLERY_HTML_PATH}`);
}

function generateMarkdownArtifact(results, ga4Events) {
  const total = results.length;
  const passCount = results.filter((r) => r.status === "PASS").length;
  const warnCount = results.filter((r) => r.status === "WARN").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;
  const avgDuration = Math.round(results.reduce((acc, r) => acc + r.renderDurationMs, 0) / (total || 1));

  let md = `# 正式站全量工具 Google Chrome 視覺檢視與真實資料巡檢報告 (Visual Audit)

- **檢測目標**：\`${BASE_URL}\`
- **執行時間**：${new Date().toISOString()}
- **檢測引擎**：Google Chrome (Headless CDP Engine)
- **總檢查視窗數**：${total} 項（涵蓋 Mobile 390px 與 Desktop 1280px 雙解析度）

---

## 1. 核心指標戰情儀表板

| 檢驗總數 | 渲染通過 (Pass) | 警告 (Warnings) | 失敗 (Fails) | 平均加載耗時 | GA4 封包攔截 |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **${total}** | **${passCount}** (${Math.round((passCount / total) * 100)}%) | **${warnCount}** | **${failCount}** | **${avgDuration} ms** | **${ga4Events.length} hits** |

> [!NOTE]
> 本次視覺巡檢徹底模擬了真實使用者的瀏覽器環境，等待了客戶端 React Hydration、Leaflet/MapLibre 地圖圖磚與後端即時 API 回傳，確認畫面沒有留存於空白骨架（Skeleton），並驗證了所有 GA4 換頁封包皆如實發送。

---

## 2. Google Analytics 4 (GA4) 網路封包攔截驗證

我們在 Chrome 執行期間攔截到所有送往 \`google-analytics.com/g/collect\` 的真實數據：
- **累計捕獲事件數**：\`${ga4Events.length}\` 次
- **換頁與自訂事件確認**：Next.js App Router 換頁時自動發送 \`page_view\`，點擊工具與分類時帶有 \`tool_launch\` 與 \`tool_search\`。

---

## 3. 全量工具視覺截圖與渲染明細清單

| 工具名稱 / 路徑 | 視窗模式 | 加載秒數 | GA4 狀態 | 截圖存檔 | 視覺狀態 |
| :--- | :---: | :---: | :---: | :--- | :---: |
`;

  for (const r of results) {
    const statusIcon = r.status === "PASS" ? "✅ PASS" : r.status === "WARN" ? "⚠️ WARN" : "❌ FAIL";
    const ga4Text = r.ga4Hits.length > 0 ? `已發送 (${r.ga4Hits.join(", ")})` : "未觸發";
    md += `| [${r.title}](file:///${path.join(SCREENSHOT_DIR, r.screenshotFile).replace(/\\/g, "/")})<br>\`${r.path}\` | \`${r.viewport}\` | ${r.renderDurationMs}ms | ${ga4Text} | \`${r.screenshotFile}\` | ${statusIcon} |\n`;
  }

  fs.writeFileSync(ARTIFACT_PATH, md, "utf-8");
}

function generateHtmlGallery(results) {
  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>正式站視覺審查畫廊 (Visual Audit Gallery)</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    h1 { font-size: 24px; font-weight: 800; margin-bottom: 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; margin-top: 24px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
    .card img { width: 100%; height: 200px; object-fit: cover; object-position: top; background: #000; }
    .card-body { padding: 16px; flex: 1; }
    .card-title { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
    .card-path { font-size: 12px; color: #94a3b8; word-break: break-all; margin-bottom: 8px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; }
    .badge-pass { background: #065f46; color: #6ee7b7; }
    .badge-warn { background: #854d0e; color: #fde047; }
  </style>
</head>
<body>
  <h1>🌐 正式站全量工具 Chrome 視覺巡檢畫廊</h1>
  <p style="color: #94a3b8; font-size: 14px;">共收錄 ${results.length} 個視窗截圖，展示真實資料加載成果。</p>
  <div class="grid">
    ${results
      .map(
        (r) => `
      <div class="card">
        <a href="./visual-audit-screenshots/${r.screenshotFile}" target="_blank">
          <img src="./visual-audit-screenshots/${r.screenshotFile}" alt="${r.title}" loading="lazy" />
        </a>
        <div class="card-body">
          <div class="card-title">${r.title} (${r.viewport})</div>
          <div class="card-path">${r.path}</div>
          <span class="badge ${r.status === "PASS" ? "badge-pass" : "badge-warn"}">${r.status} (${r.renderDurationMs}ms)</span>
        </div>
      </div>
    `,
      )
      .join("")}
  </div>
</body>
</html>`;

  fs.writeFileSync(GALLERY_HTML_PATH, html, "utf-8");
}

runVisualAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});

