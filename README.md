# j172tw Healthz (智慧健康與生活資訊整合平台)

> **網址**: [https://health.j172.tw](https://health.j172.tw)  
> **技術棧**: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · MySQL 8.0 · OpenCC · next-themes

`j172tw Healthz` 是一個全方位的智慧健康與公衛資訊整合平台。本專案將衛福部、疾管署、食藥署、國健署、中央氣象署及各大媒體公開資訊進行自動化採集、清洗、結構化與快取，提供最新公衛新聞、線上健康試算工具、全台醫療長照機構搜尋與即時全球地震/紫外線觀測服務。

---

## 🌟 核心功能特色 (Core Features)

### 1. 全台公衛醫療新聞彙整與 AI 摘要 (Health News Aggregator)
* **15 大權威新聞源**: 包含衛福部 (焦點新聞/即時新聞澄清/公告訊息/活動訊息/最新消息)、疾管署 (CDC)、食藥署 (TFDA)、國健署 (HPA 5大頻道)、健保署 (NHI)、自由時報健康版及 Google 新聞關鍵字頻道。
* **增量去重與內文解析**: 使用 payload hash 比對 (`existingHashes.ts`) 進行增量採集，自動提取正文、多媒體圖檔與附件。
* **閱讀時間預估與封面匹配**: 計算文章閱讀時間（附 ⏱ 標籤），無封面文章自動透過 Pixabay API 匹配高品質創用圖檔並本地化快取。
* **AI 結構化摘要 (`#geo-summary`)**: 提供新聞內文高密度重點摘要與 LLM (Large Language Model) 引用優化。

### 2. 多功能健康算盤與評估工具 (Health Calculators & Assessments)
全站提供 14+ 款免安裝、開箱即用的互動式健康計算與評估工具：
* **身體組成與基礎代謝**: 
  * `BMI 計算器` (對照衛福部國健署與 WHO 標準)
  * `卡路里需求計算器` (採用 Mifflin-St Jeor 公式估算 BMR / TDEE)
  * `每日營養素建議計算器` (三大營養素比例調配)
  * `飲水量計算器` (體重活動量估算與分段補水時間表)
  * `體脂率計算器` (採用美國海軍 Navy Method)
  * `腰臀比計算器` (採用 WHO 腹部肥胖與心血管風險標準)
  * `去脂體重 (LBM) 計算器` (Boer 公式)
* **心肺與循環健康**:
  * `VO2Max 估算器` (Uth 公式，可搭配 Apple Watch 安靜心率紀錄)
  * `目標心率計算器` (Karvonen 儲備心率公式，5 大運動區間)
  * `血壓分析器` (依 2023 ESH 歐洲高血壓學會指南分類)
* **睡眠與精神壓力評估**:
  * `睡眠品質評估` (基於匹茲堡 PSQI 量表 7 大面向)
  * `壓力評估測驗` (採用 PSS-10 知覺壓力量表)

### 3. 即時環境與公衛動態觀測 (Live Observatories)
* **全球顯著地震動態 (`/tools/earthquakes`)**:
  * 即時整合美國地質調查局 (USGS)、歐洲地中海地震中心 (EMSC)、香港天文台 (HKO) 與中央氣象署 (CWA) 多源資料。
  * 自動進行時間/空間模糊比對去重，標示 M6.0+ 顯著強震與海嘯警戒警示 (`tsunami_warning`)。
* **全台即時紫外線指數 (`/tools/uv`)**:
  * 即時連線中央氣象署全台地面觀測站數據。
  * 提供 5 級防護等級（低量、中量、高量、過量、極高量）與專業防曬建議。
* **全台 AQI 空氣品質地圖 (`/tools/aqi`)**:
  * 連線環境部全台監測站，提供 AQI 指標與 PM2.5 細懸浮微粒即時濃度。

### 4. 醫療院所與長照資源查詢 (Healthcare & Welfare Registries)
* **醫療設施**: 全台特約醫院、診所、藥局、健檢機構、居家醫療服務機構。
* **長照與福利**: 長照照顧機構、長照 2.0 特約機構、身心障礙福利機構、老人福利機構、客庄社區發展協會。
* **藥品與食品**: TFDA 藥品許可證與外觀辨識、食品營養成分資料庫、食品業者登錄查詢。

### 5. 多語言支援 (i18n & OpenCC)
* **語言切換**: 支援 **正體中文 (`zh-TW`)**、**简体中文 (`zh-CN`)**、**English (`en`)**。
* **動態繁簡轉換**: 整合 `opencc-js`，當切換為簡體中文時，新聞標題、地震地點與 AQI 測站等動態 API 內容自動進行即時繁簡字轉換。
* **自動偵測與記憶**: 支援瀏覽器語言 (`navigator.language`) 自動偵測，並持久化記錄於 LocalStorage 與 Cookie。

### 6. 全站第一字定序 (First-Character Collation)
* `TOOL_CATALOG` 及頁尾 (`SiteFooter`) 5 大分類欄位全面採用標準繁體中文 `localeCompare('zh-Hant')` 依第一個字音序/筆劃排列，檢索體驗一致。

---

## 🛠 系統架構與技術細節 (System Architecture)

```
                     ┌───────────────────────────────┐
                     │   Browser / Client / Mobile   │
                     └───────────────┬───────────────┘
                                     │ (HTTPS / Reverse Proxy)
                     ┌───────────────▼───────────────┐
                     │   PHP Proxy (.remote-health)  │  <-- Direct Static Files & Caching
                     └───────────────┬───────────────┘
                                     │ (127.0.0.1:3000)
                     ┌───────────────▼───────────────┐
                     │     Next.js 16 (App Router)   │  <-- Node.js / PM2 (health-web)
                     └───────────────┬───────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           │                         │                         │
┌──────────▼──────────┐   ┌──────────▼──────────┐   ┌──────────▼──────────┐
│   MySQL 8.0 DB      │   │  OpenCC / i18n Context│   │ Outbound HTTP Client│
│ (Pooled & Memoized) │   │ (zh-TW/zh-CN/en)    │   │ (Custom Native HTTP)│
└─────────────────────┘   └─────────────────────┘   └─────────────────────┘
```

* **`lib/server/net/httpClient.ts`**: 使用 Node 原生 `node:http`/`node:https` 模組，避免 Linux 虛擬記憶體限制下 Undici WASM llhttp 解析器崩潰，並捆綁 TWCA 中繼憑證。
* **`lib/server/db/mysql.ts`**: 提供 MySQL 8.0 連線池（`connectionLimit: 8`）、自動 Schema 遷移（`ensureSchema`）、型態安全轉換（`Number(DECIMAL)`）與 `GET_LOCK` 排他鎖防護。
* **`lib/server/cache/memo.ts`**: 記憶化查詢快取，降低高頻 API 與 DB 的重複查詢負擔。

---

## 📚 API 與定時任務 (Endpoints & Cron Jobs)

### 公開與功能 API

| Endpoint | 方法 | 說明 |
|---|---|---|
| `/api/aqi` | `GET` | 取得即時 AQI 監測站資料 (支援 `?county=` 篩選) |
| `/api/facilities` | `GET` | 醫療與長照機構查詢 (支援關鍵字與定位) |
| `/api/drugs` | `GET` | 藥品資料與外觀特徵查詢 |
| `/api/food-nutrition` | `GET` | 食品營養成分查詢 |
| `/llms.txt` / `/llms-full.txt` | `GET` | 提供 LLM / AI Crawler 結構化引用內容 |

### 排程同步任務 (Cron Schedule)

| 任務名稱 | 頻率 | Endpoint / 腳本 | 說明 |
|---|---|---|---|
| **RSS 新聞採集** | 每 30 分鐘 | `/api/internal/rss-sync` | 增量比對 15 大新聞源並持久化 |
| **AQI 空氣品質** | 每 30 分鐘 | `/api/internal/aqi-sync` | 快照環境部最新監測數據 |
| **CWA 氣象與地震** | 每 30 分鐘 | `/api/admin/cwa-sync` | 刷新預報、地震、海嘯與氣象觀測 |
| **機構與藥品備份** | 每 6 個月 | `.github/workflows/six-monthly-sync.yml` | 透過 GitHub Actions 自動同步健保署與食藥署名冊 |

---

## 💻 本地開發與建置 (Local Development)

### 環境需求
* **Node.js**: >= 20.0.0
* **MySQL**: 8.0+

### 安裝與啟動
```bash
# 複製設定檔範本
cp .env.example .env

# 安裝依賴套件
npm install

# 啟動開發伺服器
npm run dev

# 執行型態檢查與生產建置
cmd /c npx tsc --noEmit
cmd /c npm run build
```

---

## 📄 專案文件與規格 (Documentation)

* 完整的技術設計與多語言規格說明請參閱 [docs/SPECIFICATION.md](docs/SPECIFICATION.md)。
