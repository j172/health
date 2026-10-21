# j172tw Healthz 2.0 全站規劃（Master Plan）

- **作者**：Claude (orchestrator)
- **日期**：2026-10-12
- **狀態**：Approved — 2026-10-12 /grill 完成，PRD 已發布為 [Issue #438](https://github.com/j172/health/issues/438)（副本：[spec-issue-438.md](spec-issue-438.md)）
- **範圍**：全站 83 個工具（同步後為 84，含已上線的 `senior-friendly`）、新聞、首頁、Nav/Footer、技術棧與相依套件
- **前置**：[navbar-footer-reclassification-and-merges.md](../archive/specs/navbar-footer-reclassification-and-merges.md)（#256）、
  [pagespeed-lighthouse-baseline-20260914.md](../archive/specs/pagespeed-lighthouse-baseline-20260914.md)、
  [map-technology-findings.md](../archive/specs/map-technology-findings.md)、TDX Spec A／B（#435、#437 已上線）

> 本文件是 grill **之前**的草案，保留作為研究背景。**最終決策以下表與 Issue #438 為準**；與下表衝突的段落（例如分類網址 `/tools/c/`、Footer 5 欄、M5 合併）已被取代。
> 本文件的數字是 2026-10-12 對 `main`（`e3edc8b`）實測；同步到 `7fe098b` 後工具數為 84，其他數字不變。

> **2026-10-21 範圍調整（#727–#731）**：本文提到的 YouBike（T6）、全台軌道營運通阻（T4，`metro-alerts`）、樂齡旅遊，以及無障礙交通的 TDX 即時同步（T1 每日公車低地板比率、每日軌道無障礙同步）已**整個移除或降級為靜態種子資料**；下文對應段落保留作當時的決策與研究紀錄，**不再是現況**。現況：TDX 只剩每小時電梯停用公告（`transit-accessibility-alerts`，約 240 次／天）、半年一次的設施同步（停車 T3、有聲號誌 T2，仍在）與管理員手動的敬老卡同步；請求預算與症狀判讀見 [domains/10-scheduling-sync-ci.md](../domains/10-scheduling-sync-ci.md) §2.1。

## 決策結果（2026-10-12 /grill 24 項＋同日追加 6 項）

| # | 主題 | 決策 |
|---|---|---|
| 1 | 分類數量 | **9 類 → 7 類**（見 §4.1） |
| 2 | 分類頁網址 | `/tools/category/[slug]` |
| 3 | Navbar | 5 項：新聞｜工具▾（mega menu）｜生活情境▾｜我附近｜🚨緊急；拿掉「首頁」 |
| 4 | Mega menu | 列出全部約 79 個工具＋頂部搜尋框 |
| 5 | Footer | **4 欄約 24 連結**：關於本站／7 分類／5 情境／公民友站；不設熱門工具 |
| 6 | 生活情境 hub | 5 個全做：家有長輩、懷孕到育兒、颱風地震來了、身心障礙者生活、出國與防疫 |
| 7 | Hub 網址 | `/guides/[slug]`，索引 `/guides` |
| 8 | 我附近 | 預設急用 8 類各最近 3 筆，「更多類型」逐類延遲載入 |
| 9 | M1 `ltc-contracted` | 301 → `long-term-care` |
| 10 | M2 `green-shops` | 301 → `green-certifications?tab=green-shops`（已查證同一份資料） |
| 11 | M3 中油 | 合併，沿用 `cpc-prices`，分頁「本週油價｜附近加油站」 |
| 12 | M4 長照 | **4 頁全併**（長照、居家醫療、老人福利、伯公），沿用 `/tools/long-term-care`，標題改「長照照顧圈地圖」 |
| 13 | 照顧圈 | 使用者可切換 1／3／5 公里直線半徑，誠實標示非車程 |
| 14 | M5 食安 | **取消**（農藥殘留 ≠ 業者登錄），只互相導流 |
| 15 | 首頁 | 狀態列＋情境卡＋最近使用工具＋新聞，資料由 1 支 snapshot API 提供 |
| 16 | 工具頁 | 重排（下一步、相關新聞上移）＋公式／參考表／科學依據／FAQ 用 `<details>` 收合 |
| 17 | 手機 | 加 5 格底部導覽列 |
| 18 | 身體數據 | 只記身高／體重／年齡／性別，預設關閉、勾選才存本機、可一鍵清除 |
| 19 | 底圖 | 國土測繪中心 EMAP，OSM 備援 |
| 20 | react-leaflet | 先保留，Leaflet 2.0 穩定後再評估 |
| 21 | 套件 | 移除 swiper、sharp、framer-motion、react-hot-toast、iconv-lite；segmentit 先 A/B 再換 |
| 22 | Node | 升 24 LTS，先在主機做記憶體實測 |
| 23 | Next 新功能 | Cache Components、React Compiler 皆延後 |
| 24 | 外語／MCP／執行 | 4 語保留只翻名稱；MCP 另開計畫；分期拆 issue 逐期上線；外連 UTM 覆蓋 100%（`utm_source=health.j172.tw`） |
| 25 | TDX 資料整合（同日追加） | 納入 T1 無障礙公車真實資料、T2 有聲號誌、T3 孕婦親子／身障／復康巴士車位、T4 全台軌道通阻（已於 2026-10-21 移除，#728）、T6 YouBike 15 縣市（已於 2026-10-21 移除，#727）；不新增工具頁；T6 排 P0、T1–T4 排 P2；其餘 TDX 項目 2.0 之後。見 [tdx-basic-integration-research.md](tdx-basic-integration-research.md) |
| 26 | 多語系支援（同日追加，**取代 #24 對指定頁面的部分**） | 約 21 個指定頁面：介面＋內容全翻、政府資料保留原文；網址 `/en/`、`/ja/`、`/ko/` 前綴、伺服器端輸出；`?lang=` 301；不依瀏覽器語言自動跳轉；排入 P6 |
| 27 | 每頁 llms.txt | 每個公開頁面（含外語版、官方新聞）都有 `/{path}/llms.txt` 與 `/{path}.md` |
| 28 | AI 爬蟲 | Cloudflare Search／Agent／Training 三類全部允許（目前 GPTBot、ClaudeBot 被 403），排入 P0 |
| 29 | Cloudflare 免費方案 | 設定即程式碼、Crawler Hints 取代自寫 IndexNow、Web Analytics、靜態圖片轉換（新聞圖不用） |
| 30 | SEO／AEO／GEO／Schema.org | 依頁面類型的 JSON-LD 型別表、speakable、citation、SearchAction（見 PRD §R） |

測試接縫：① catalog 導覽模型純函式（主）② 原始碼掃描 ③ snapshot／nearby 聚合函式注入假資料源；不引入瀏覽器 E2E。

---

## 0. 現況盤點（實測）

| 項目 | 數量／狀態 |
|---|---|
| 工具（`TOOL_CATALOG`） | **83**（另有 1 個未列入 catalog 的幽靈頁 `/tools/ltc-contracted`，noindex，內容＝`long-term-care`） |
| 工具分類（`TOOL_GROUP_META`） | **9**：照護機構 17／健康工具 12／防災示警 12／環境 10／公益生活 10／交通能源 6／文化觀光 6／藥品食品 5／兒少 5 |
| Navbar 頂層項目 | **11**（首頁、新聞＋9 個下拉）＋緊急電話＋搜尋＋3 個切換鈕；因此只能在 **≥1280px（xl）** 才展開，筆電 1024–1279px 全部縮成漢堡 |
| Footer | **11 欄、約 95 個連結**（總覽 5＋工具 83＋公民友站 7） |
| 分類體系 | **3 套互相漂移**：Nav/Footer 用 9 組；`/tools` 索引頁自己的 `CATEGORIES` 是 10 段（把健康工具拆成 2 段，且「藥品食品」段寫死 3 個 slug，漏掉 `food-safety`、`health-supplements`）；README 是 7 組 A–G |
| 站內搜尋（Ctrl+K） | **只搜新聞**（`/api/news/search`），83 個工具完全搜不到 |
| 交叉連結 | `relatedSlugs` 平均 3.0 個；**20 個工具零入站連結**（見 §3.1）；3 處指向幽靈頁 `ltc-contracted` |
| i18n | en/ja/ko 只翻了 **60/83** 個工具名稱，其餘 23 個在外語介面的 Nav/Footer 顯示中文 |
| 地圖元件 | **9 個各自獨立的 Leaflet 元件**，全部寫死 `https://{s}.tile.openstreetmap.org` |
| 地理定位 | **25 個檔案**直接碰 geolocation（曾因此出過 4 處各自修的 timeout bug） |
| 首頁側欄 | **10 個 widget 各自 client fetch**（首頁一次載入 = 10 支 API 請求） |
| API routes | 93（admin 45） |
| 排程 | in-app node-cron **32 個 job** ＋ GitHub Actions **14 個 workflow** |
| Runtime 相依 | 18 個；其中 `swiper`、`sharp` **0 處使用** |
| 空殼目錄 | **23 個**（SaaS 樣板殘留：`components/About|Pricing|Testimonial|…`、`app/(site)/auth|blog|docs|error|support`） |
| Node 版本 | `engines: ">=20"`，但 **Node 20 已於 2026-04-30 EOL** |

---

## 1. 能否用其他技術／工具更優化

依「效益 ÷ 風險」排序。主機限制（768MB V8 heap、20 Entry Processes、不能跑 WASM 渲染）是所有建議的硬邊界。

### 1.1 【高】Ctrl+K 搜尋涵蓋工具 —— 零相依
`TOOL_CATALOG` 只有 83 筆，直接在 client 端對 `title / navLabel / description / directAnswer / faqs` 做子字串＋注音／簡稱比對即可，不需要搜尋引擎。結果分兩區：「工具」在上、「新聞」在下。
- **不建議 Pagefind**：它是建置期產生靜態索引，本站是 SSR＋ISR 動態內容，新聞每小時變；雖然 Pagefind extended 版支援中文，但架構不合。
- 加一個 `keywords?: string[]` 欄位到 `ToolCatalogEntry`（例如 `bmi` → 「肥胖」「體重」；`aed` → 「心臟電擊」），同時餵給搜尋與 JSON-LD。

### 1.2 【高】統一地圖底層 `<BaseMap>` ＋ 改用國土測繪中心底圖
- 9 個 Leaflet 元件 → 1 個 `components/Map/BaseMap.tsx`（底圖、定位按鈕、群聚、標註、attribution、i18n 一次處理），各工具只傳 markers 與 popup renderer。
- **底圖**：預設改用國土測繪中心 NLSC `EMAP` WMTS（正體中文標註、官方圖資、免申請服務），OSM 當備援。理由：OSMF 圖磚政策明確寫「容量有限、可能無預警封鎖」、「不要把 tile.openstreetmap.org 寫死」、「其他子網域可能被撤除」——本站 9 處都寫死 `{s}` 子網域，正好全中。
- 底圖 URL 改成單一設定常數（政策也建議可設定化）。
- **不建議換 MapLibre GL**：WebGL＋~800KB，對行動裝置與本站「機構點位」需求是殺雞用牛刀。
- **Leaflet 2.0 暫緩**：仍在 alpha（2025-05 起），穩定版時程未定；等穩定後，因為只剩 `BaseMap` 一個接觸點，遷移成本會很低。

### 1.3 【高】首頁 10 個 widget → 1 支 `/api/home/snapshot`
把 AQI／UV／天氣／地震／停水／CDC／急診／病蟲害／油價／氣象警報合成一支伺服器端快取的 snapshot API（每個區塊獨立 try/catch，沿用 #377 的 unified error-state）。首頁請求數 10 → 1，直接降低 Node 端併發與 NPROC 壓力（正是 2026-08/09 數次事故的根源）。

### 1.4 【中】單一 `useLocation()` hook
25 個檔案收斂到 `lib/client/hooks/useLocation.ts`（Permissions-API-aware timeout、快取到 sessionStorage、全站共用一次授權結果）。同時讓「我附近」hub（§3.4）成為可能。

### 1.5 【中】Next.js 16 新機制試點（僅試點，不全面）
- **Cache Components（`'use cache'` + `cacheTag`）**：可取代每頁 `revalidate = 300` 與部分 client fetch。風險：快取在記憶體，768MB 上限需實測；先在 `ToolPageShell` 的 catalog 區塊試點。
- **React Compiler（`reactCompiler: true`，Next 16 已轉 stable）**：建置在 GitHub Actions 上跑，Babel 增加的建置時間不影響主機；先用 `compilationMode: "annotation"` 只開在 Nav、Search、地圖幾個重互動元件，比較 bundle 與 INP 再決定。

### 1.6 【低／觀察】排程
32 個 in-app job ＋ 14 個 GHA workflow 已經做過去碰撞（`github-actions-cron-decollision`）。Cloudflare Workers 免費方案只給 **5 個 cron trigger**，不足以承接；**維持現狀**，不換。

---

## 2. 是否可以合併

#256 已拍板「毛孩認養＋動物醫院不合併」「AQI＋AQX 不合併」，本節不重談。以下是新候選，依信心排序：

| # | 候選 | 建議 | 理由 |
|---|---|---|---|
| M1 | `ltc-contracted` 幽靈頁 | **直接 301 → `long-term-care`**，修正 3 處 `relatedSlugs` | 已是 noindex 重複頁，卻還在吃內部連結權重 |
| M2 | `green-shops` vs `green-certifications` | **合併**（`green-shops` 變成 certifications 的一個分頁） | #256 合併環保標章家族時，旅館／產品／餐廳都 301 了，唯獨綠色商店留下；兩頁描述高度重疊（都含「環保餐廳」「碳足跡商品」） |
| M3 | `cpc-prices` ＋ `cpc-stations` | **合併為「中油油價與加油站」** | 同一機構、同一使用情境（「今天油價多少、最近哪裡加」），站點頁本來就需要顯示價格 |
| M4 | 長照家族：`long-term-care`、`home-healthcare`、`elder-welfare`、`hakka-bogong` | **合併為「長照照顧圈地圖」**（機構類型篩選＋「10 分鐘車程」半徑） | 衛福部「長照 3.0」預計 2027 上路，核心目標是「10 分鐘照顧圈」、據點由 720 擴到 1.5 萬。民眾的問題是「我家附近有什麼長照資源」，不是「哪個名冊」。需 grill：伯公照護站的客家文化定位要不要保留獨立頁 |
| M5 | 食安登錄：`food-operators` 併入 `food-safety` | **候選，需 grill** | `food-safety` 已是 mashup 頁；業者登錄查詢是同一情境的下一步 |
| — | 健康計算器 12 個 | **不合併 URL**，改做「身體數據檔案」 | 每個計算器各自吃一個搜尋關鍵字（「BMI計算」「體脂計算」），合併會傷 SEO。改成身高／體重／年齡／性別只輸入一次（localStorage），12 個計算器自動帶入＋互相導流 |
| — | 水情三兄弟（停水／水情／淹水） | **不合併**，改用 hub 串 | 三者資料與時間尺度完全不同 |

合併後工具數：83 → 約 **78**（M1 不計入 catalog；M2、M3 各減 1；M4 減 3）。

---

## 3. 是否可以交叉連結

### 3.1 補洞：零入站連結的 20 個工具
`child-native-languages, travel-epidemic-alerts, iaq-premises, cleaning-squads, aqx-monitoring, tourism-factories, accessible-transit, health-supplements, sheltered-workshops, mental-health, smoking-cessation, rare-disease-care, organ-donation-hospitals, home-emergency-care, pesticide-sales, green-shops, hearing-aid-subsidies, funeral-facilities, emergency-supplies, medical-violators`

做法：
1. `relatedSlugs` 維持人工策展，但 `ToolPageShell` 不足 4 個時，自動用「同分類」補滿。
2. 新增測試 `lib/server/tools/relatedLinks.test.mjs`：(a) 無懸空 slug、(b) 每個工具入站 ≥ 2、(c) 不得指向 noindex 頁。測試會擋住未來新增的孤兒工具。

### 3.2 新聞 ↔ 工具雙向連結（目前完全沒有）
- 新聞內頁：依新聞分類＋關鍵字對照表顯示 1–3 張「相關工具」卡（登革熱 → `pest-alerts`／`travel-epidemic-alerts`；地震 → `earthquakes`／`emergency-supplies`／`disaster-map`；食安 → `food-safety`）。對照表放在 catalog 的 `keywords`（§1.1 同一欄位，一魚三吃）。
- 工具頁：底部「相關新聞」列出 3 則最近新聞（用同一組 keywords 查 `news_items`，伺服器端快取）。

### 3.3 生活情境 hub（參考 GOV.UK step-by-step pattern）
GOV.UK 從「依部會分類」改成「依使用者主題」，再加上 step-by-step 串起跨部會的完整旅程。本站 83 個工具本質上就是跨部會的，最適合這樣做。先做 5 個：

| Hub | 串起的工具（依步驟） |
|---|---|
| 家有長輩 | 長照照顧圈 → 敬老／樂齡（`senior-friendly`，進行中） → 無障礙交通 → 助聽器補助 → 居家急救 |
| 懷孕到育兒 | 母嬰親善醫院 → 哺集乳室 → 幼兒園 → 兒少福利機構 → 兒童安全地點 |
| 颱風地震來了 | 氣象警報 → 地震 → 防災避難地圖 → 淹水地圖 → 停水 → 防災物資計算 → 緊急電話 |
| 身心障礙者生活 | 身障福利機構 → 庇護工場 → 無障礙 ATM → 無障礙交通 → 公廁 |
| 出國與防疫 | 國際旅遊疫情 → 成人預防保健 → 診所 → 藥局 |

Hub 頁面 = 有序步驟＋每步一張工具卡＋FAQ，JSON-LD 用 `HowTo`／`ItemList`。

### 3.4 「我附近」hub
定位一次，同時列出最近的 AED、急診、藥局、診所、公廁、避難所、涼適點。資料大多已在同一張 `facilities` 表（以 `facility_type` 區分），只需一支 nearest-N 查詢。這是全站最能展現「整合」價值的頁面，也是手機版底部導覽的核心入口。

### 3.5 機構 popup 深連結
任何地圖 popup 增加「看附近的 AED／急診／藥局」，帶 `?lat=&lng=` 開啟對應工具。

---

## 4. Footer 與 Navbar 的分類數量

### 4.1 建議：分類 9 → **7**（每類 8–15 個，平均化）

| 新分類 | 內容 | 約數 |
|---|---|---|
| 健康自我評估 | 12 個計算器 | 12 |
| 就醫與用藥 | 診所、藥局、急診量能、健檢、成人預防保健、心理健康、戒菸、罕病、器捐醫院、居家急救、醫事違規、藥品、保健食品 | 13 |
| 長照與社會福利 | 長照照顧圈（M4）、身障福利、庇護工場、助聽器補助、無障礙 ATM、無障礙交通、NPO、殯葬、敬老／樂齡（新） | 9 |
| 婦幼與家庭 | 母嬰親善、哺集乳室、避孕地圖、幼兒園、補習班、兒少機構、本土語言、毛孩認養、動物醫院 | 9 |
| 防災與示警 | 地震、氣象警報、UV、防災地圖、淹水、停水、水情、緊急電話、防災物資、AED、旅遊疫情、病蟲害、兒童安全地點 | 13 |
| 環境與食品安全 | AQI、AQX、室內空品、戶外安全、食安、食品業者、營養成分、農藥販售、清潔隊、碳足跡、環保標章（M2） | 11 |
| 交通、生活與文化 | YouBike（已移除，#727）、捷運（軌道通阻 `metro-alerts` 已移除，#728）、中油（M3）、電力、公廁、涼適點、藝文活動、公共藝術、文化資產、書店、新書、觀光工廠 | 12 |

> 合計 79 ＝ 合併後 78 ＋ 進行中的 `senior-friendly`；已逐一核對 83 個 slug 無遺漏、無重複。
>
> 關鍵修正：現行「醫療照護機構」17 個太肥、「藥品食品」與「兒少」只有 5 個太瘦；且「公益與生活服務」是雜項桶。7 分類改以**使用者是誰／遇到什麼事**切分，而不是「資料是名冊還是登錄」。

### 4.2 Navbar：11 項 → **5 項**，改 mega menu
`新聞`｜`工具 ▾`（mega menu，7 欄＋頂部搜尋框）｜`生活情境 ▾`（5 個 hub）｜`我附近`｜`🚨 緊急`
- 5 項可在 **≥1024px（lg）** 就展開，筆電不再全部縮成漢堡。
- 分類與分類內工具維持 #256 拍板的筆畫排序規則。
- 手機：新增底部固定導覽列（首頁／工具／我附近／緊急／搜尋），PWA 體驗一致。

### 4.3 Footer：11 欄 95 連結 → **5 欄約 35 連結**
`關於本站`（首頁、新聞、隱私、無障礙、Hey AI）｜`工具分類`（7 個分類落地頁）｜`生活情境`（5 hub）｜`熱門工具`（8 個，依 GA／Clarity 實際流量挑）｜`公民倡議與友站`（7）
- 83 個工具的完整連結移到新的**分類落地頁** `/tools/c/[group]`（目前沒有分類頁，等於少了 7 個可吃「長照資源查詢」這類大詞的 SEO 頁）。爬蟲路徑：Footer → 分類頁 → 工具頁，加上 sitemap，不會有孤兒頁。
- 工具頁既有麵包屑（目前為「首頁 / 健康工具與公衛資料庫 / 工具」，含 `BreadcrumbList` JSON-LD）加入分類層級，改為「首頁 › 工具 › 分類 › 工具」。

### 4.4 單一真相來源
`/tools` 索引頁的私有 `CATEGORIES`、README 的 A–G 7 組，全部改由 `TOOL_GROUP_META` 產生。加測試：每個工具恰好出現在一個分類、一個 Nav 欄、一個 Footer 分類頁。順便補齊 en/ja/ko 缺的 23 個 `catalog.*` 翻譯，並加測試擋缺漏。

---

## 5. 版面優化

1. **首頁改為「今日儀表板＋新聞」**：最上方一列定位感知的精簡狀態列（天氣／AQI／UV／最新地震／警報），接著「生活情境」5 張入口卡＋「最近使用的工具」（localStorage），再下面才是新聞。現在首頁是純新聞版型，83 個工具這個核心產品在首頁幾乎看不到。
2. **工具頁 `ToolPageShell` 重排**：工具本體 → **相關工具／下一步**（往上提）→ 相關新聞 → 公式／參考表 → 科學依據 → FAQ。公式、科學依據、FAQ 改用 `<details>` 收合（JSON-LD 不受影響），手機首屏留給工具本身。
3. **地圖類工具統一「清單／地圖」切換**（`BaseMap` 一併提供），手機預設清單、桌機並排。
4. **動畫**：唯一使用 framer-motion 的 `SectionHeader` 改 CSS（`@starting-style`＋`prefers-reduced-motion`），見 §6。
5. **行動版 LCP**：baseline 測得 lab LCP 4.6s vs field 1.8s。snapshot API（§1.3）＋減少首頁 client JS（§6）是最直接的兩個槓桿；改完重跑 Lighthouse 比對。

---

## 6. 技術棧優化與減少套件依賴

### 6.1 Runtime 相依：18 → 12

| 套件 | 使用處 | 處置 |
|---|---|---|
| `swiper` | 0 | **移除** |
| `sharp` | 0（`images.unoptimized: true`） | **移除**（先確認 build log 無 sharp 警告） |
| `iconv-lite` | 4（`decodeBig5`） | **改用 `new TextDecoder("big5")`**——`metroAlerts/runSync.ts` 已經這樣用，Node 內建 full-ICU |
| `segmentit` | 1（新聞配圖關鍵字） | **改用 `Intl.Segmenter("zh-TW", { granularity: "word" })`**。注意：ICU 中文字典對部分詞會切成單字，先用 200 篇新聞 A/B 比對抽出的關鍵字再切換 |
| `framer-motion` | 1（`SectionHeader`） | **移除**，改 CSS；省下最大的一包 client JS |
| `react-hot-toast` | 2 | **改寫成 ~40 行的 `Toast` 元件**（只用到基本 toast） |
| `next-themes` | 2 | 保留（處理 FOUC 的 inline script 自己寫不划算） |
| `react-leaflet` | 10 | §1.2 收斂成 `BaseMap` 後**評估直接用 Leaflet API**，為 Leaflet 2.0 遷移鋪路 |
| `cheerio`、`fast-xml-parser`、`adm-zip`、`node-cron`、`mysql2`、`zod`、`leaflet`、`next`、`react`、`react-dom` | — | 保留 |

DevDeps：`cnchar`＋`cnchar-trad` 只用來算筆畫排序；可改成建置期產生一份「首字 → 筆畫」JSON 表後移除（低優先）。

### 6.2 執行環境
- **Node 20 → 24 LTS**（Node 20 已 EOL，無安全更新；24 LTS 維護到 2028-04）。先確認 HawkHost cPanel Node selector 提供哪些版本，GHA workflow 的 `node-version` 一併更新，`engines` 改 `>=24`。
- 清掉 23 個空殼目錄（純樣板殘留，無任何引用）。
- README 漂移修正：TypeScript 徽章寫 5.8、實際 6.0；工具分類寫 7 組 A–G、實際 9 組。

---

## 7. 機構資料源動態（外部研究摘要）

| 機構／來源 | 2026 動態 | 對本站的意義 |
|---|---|---|
| 衛福部 長照 3.0 | 預計 2027 上路；「10 分鐘照顧圈」、據點 720 → 1.5 萬、擴及年輕型失智與 PAC 失能者 | M4「長照照顧圈地圖」的直接依據；據點暴增代表資料量與 geocode 量都會上升 |
| 交通部 TDX Senior | Rail／Tourism／SeniorCard 分類；base path 仍未確認（見 Spec A） | 已有 2 份 spec 進行中，2.0 的「家有長輩」hub 會用到 |
| 國土測繪中心 NLSC | EMAP WMTS 免申請服務 | §1.2 底圖替代方案 |
| OSMF 圖磚政策 | 容量有限、可無預警封鎖、勿寫死 URL、子網域可能撤除 | 本站 9 處違反建議，屬潛在風險 |
| 環境部資料平臺 | OpenAPI 文件在 `data.moenv.gov.tw/swagger/` | 匯入腳本應以 swagger 為準做 schema 驗證（已有 zod） |
| NCDR 民生示警 | CAP 1.2 格式 | 已有 `ncdr-disaster-alerts-integration` spec |
| 各國政府資料 MCP | 法國 data.gouv.fr（2026-02）、日本數位廳、印度 NSO 已推出官方唯讀 MCP server；未查到我國數發部推出 | 本站已有 `llms.txt`；**可考慮推出唯讀 MCP 端點**（stateless JSON-RPC route，查工具／機構／警報），成為「台灣第一個公衛生活資料 MCP」——列為 Phase 5 選項 |

---

## 8. 分期執行

| 期 | 內容 | 風險 | 依賴 |
|---|---|---|---|
| **P0 速贏**（1–2 PR） | 移除 swiper/sharp/空目錄；M1 幽靈頁 301；Ctrl+K 搜尋工具；交叉連結測試＋補 20 個孤兒；補 23 個翻譯；README 修正；OSM URL 去 `{s}` | 低 | 無 |
| **P1 資訊架構** | 7 分類（`TOOL_GROUP_META`）；`/tools/c/[group]` 分類頁；麵包屑；Nav mega menu；Footer 精簡；`/tools` 索引改吃單一來源 | 中（大量 URL／版面變動，需 301 檢查） | 需使用者拍板分類 |
| **P2 交叉連結** | `keywords` 欄位；新聞 ↔ 工具；5 個生活情境 hub；我附近 hub；popup 深連結 | 中 | P1 |
| **P3 版面** | 首頁儀表板＋snapshot API；`ToolPageShell` 重排；手機底部導覽；身體數據檔案 | 中 | P1、P2 |
| **P4 技術** | `BaseMap`＋NLSC；`useLocation`；iconv/segmentit/framer/toast 替換；Node 24；Cache Components 與 React Compiler 試點 | 中（Node 升級需主機確認） | 可與 P1–P3 平行 |
| **P5 合併與延伸** | M2、M3、M4、M5；MCP 端點 | 高（M4 牽涉長照資料模型） | 需 grill |

每期完成後：`npm run typecheck && npm test && npm run build`，部署後**實打 live API 驗證**（見 2026-09-21 regression 教訓），並重跑 Lighthouse 與 baseline 比對。

---

## 9. 待使用者拍板

1. **7 分類方案（§4.1）**是否採用？這會推翻 #256 的 9 分類（#256 當時已授權「分類可自由重新設計」）。
2. Navbar 改 mega menu、Footer 從 95 連結精簡到約 35 連結？
3. M4 長照照顧圈：伯公照護站要併入還是保留獨立頁（客家文化定位）？
4. 外語：ja/ko 要補齊工具內容，還是收斂成 zh-TW＋en 兩語？
5. MCP 端點要不要列入 2.0？

---

## 參考來源

- [Next.js 16 release](https://nextjs.org/blog/next-16)、[Next.js 16 beta（reactCompiler 轉 stable）](https://nextjs.org/blog/next-16-beta)
- [Leaflet 2.0.0-alpha](https://leafletjs.com/2025/05/18/leaflet-2.0.0-alpha.html)、[FOSS4G 2026 Leaflet 2.0 talk](https://talks.osgeo.org/foss4g-2026/talk/VK8SSV/)
- [Node.js 20 EOL](https://endoflife.ai/nodejs/20)、[AWS SDK 對齊 Node 時程](https://aws.amazon.com/blogs/developer/aws-sdk-for-javascript-aligns-with-node-js-release-schedule/)
- [OSMF Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)
- [NLSC WMTS 使用範例（iThome）](https://ithelp.ithome.com.tw/articles/10321719)
- [GOV.UK step by step navigation](https://design-system.service.gov.uk/patterns/step-by-step-navigation)、[GDS：building a better step by step](https://gds.blog.gov.uk/2018/10/17/building-a-better-gov-uk-step-by-step/)
- [Pagefind multilingual](https://pagefind.app/docs/multilingual)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits)
- [長照 3.0（工商時報 2026-06）](https://www.ctee.com.tw/news/20260606700756-431401)、[衛福部](https://mohw.gov.tw/cp-16-81597-1.html)
- [環境部 OpenAPI](https://data.moenv.gov.tw/swagger/)
- [France data.gouv.fr MCP server](https://rits.shanghai.nyu.edu/ai/france-opens-74000-public-datasets-to-ai-agents-via-official-mcp-server/)、[GOV.UK：SSO + MCP](https://digitaltrade.blog.gov.uk/2026/05/14/using-single-sign-on-and-mcp-to-safely-connect-ai-to-live-government-data/)
- [Intl.Segmenter 中文切詞缺陷回報](https://claudeissues.com/issue/67418-bug-cjk-word-boundary-navigation-option-arrow-splits-common-chinese-words-into-s)
