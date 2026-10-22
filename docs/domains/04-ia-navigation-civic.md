# 04 資訊架構、導覽、工具平台與公民友站

> 合併自 14 份原始文件 · 狀態核對基準：`main` @ `7fe098b`（2026-10-12）
> 相關頁面：[工具總覽](https://health.j172.tw/tools) · [首頁](https://health.j172.tw/)
> 狀態圖例：✅ 已上線｜🟡 部分完成｜❌ 未實作｜🗄️ 已取代｜📚 研究
> **2.0 改版進行中**：本領域將由 [2.0 master plan](../2.0/master-plan.md) 與 [Issue #438](https://github.com/j172/health/issues/438) 全面改寫（9 類 → 7 類、Navbar 5 項＋mega menu、Footer 4 欄）。

---

## 1. 目前真相（2.0 之前）

| 項目 | 現況 |
|---|---|
| 工具數 | 84（`TOOL_CATALOG`，單一真相來源） |
| 分類 | 9 類（`TOOL_GROUP_META`，#256）：健康工具 12／醫療照護機構 17／防災示警 12／環境 10／公益生活 11／交通能源 6／文化觀光 6／藥品食品 5／兒少 5 |
| 排序 | 分類與工具各自「英文在前、中文依首字筆畫由少到多」（`compareByStrokeOrder`，`STROKE_COUNTS` 由 `scripts/generate-stroke-table.mjs（已移除，見 git 歷史）` 產生） |
| Navbar | 首頁、新聞＋9 個下拉，≥1280px 才展開 |
| Footer | 總覽 5＋9 分類 84 工具＋公民友站 7，共 11 欄 |
| 工具頁外框 | `ToolPageShell`：自動產生 `MedicalWebPage`／`WebPage`＋`WebApplication`＋`FAQPage` JSON-LD、相關工具、FAQ、科學依據 |
| 列表 | 預設 30 筆、分頁器 30/50/100、22 縣市＋368 鄉鎮二級篩選、伺服器端分頁 |
| 零空白 | 所有工具具備種子資料備援；客戶端請求 5 秒逾時；定位不阻擋首次渲染 |
| 健康巡檢 | 測試確認每個 catalog 工具都有頁面、metadata、canonical、FAQ |
| 公民友站 | g0v、黑熊學院、反認知作戰、台灣罪犯圖鑑、運動部不適任教練、衛福部醫事性平專區、2026 政治人物前科 |

---

## 2. 長期有效的決策

- `navLabel` 只影響 Nav／Footer 顯示，**永不改動**工具頁 SEO `title`。
- 合併工具一律真正合併為同一路由，舊 slug 用 **301** 永久轉址。
- **下架（不併入其他工具）的工具**：頁面網址（含 en／ja／ko 前綴）301 導向 `/tools`，對應的 `/api/*` 只留極小的 route handler 回 **410 Gone**（附明確 `Cache-Control`），並一併移除 `catalog`、`translatedPages`、`toolContent`、`locales/*.json`、導覽與其他工具的 `relatedSlugs`。首例：YouBike（#727，2026-10-21，導向 `/tools`）；其次：全台軌道營運通阻 `metro-alerts`（#728，2026-10-21，頁面網址導向對應語系的 `/tools/accessible-transit`）。**瘦身而非下架**：無障礙交通 `/tools/accessible-transit`（#730，2026-10-21）頁面與網址保留，只拿掉空的導覽圖／轉乘區塊與兩個每日 TDX 排程，公車低地板比率標註「種子資料・非即時」。
- 毛孩認養＋動物醫院、AQI＋AQX **不合併**（#256 決議）。
- 所有工具「資料先入 DB、讀 DB、不直連 API」，且必須有種子備援（零空白）。
- 公民友站外連帶 `utm_source=health.j172.tw`；情境卡（`ContextualPartnerCard`）常駐、不可關閉。
- 「進頁面即定位」為全站規則，不為 Lighthouse Best Practices 分數妥協。
- **工具 catalog 的數量檢查是結構性的，不寫死計數**（#669）：`lib/server/tools/catalog.test.mjs` 驗每組 8–15 個工具、每個工具恰屬一組、slug 不重複、每個工具有 `keywords`／`directAnswer`／`lastUpdated`。新增或下架工具**不需要**改任何計數器——過去兩個 PR 各把同一行 `TOOL_CATALOG.length` 改成相同的新數字，git 不報衝突，合併後才在 CI 失敗。某組超過 15 個時請把工具移到有餘裕的組，不要調高上限。

---

## 3. 核對後仍未完成的項目

已全部併入 2.0（Issue #438），此處不重複列出；重點包括：Ctrl+K 搜尋不含工具、19 個工具零入站連結、`funeral-facilities` 相關連結寫成分類名、`ltc-contracted` 與 `green-shops` 重複頁、`/tools` 索引頁自有分類定義與 catalog 漂移、en/ja/ko 缺 24 個工具名稱翻譯。

---

## 4. 逐份紀錄

#### Navbar／Footer 重新分類＋5 組工具合併＋筆畫排序 ✅
- 原檔：[navbar-footer-reclassification-and-merges.md](../archive/specs/navbar-footer-reclassification-and-merges.md)（#256）
- 7 類改 9 類；合併兒少機構、環保標章家族（旅館／產品／餐廳）、水情家族、文化活動家族、碳足跡家族；新增 `navLabel`。
- 已知遺漏：`green-shops` 未一起轉址（2.0 M2 處理）。

#### Phase 1 — 身心障礙、綠色商店導覽群組 🗄️
- 原檔：[phase1-nav-footer-restructure.md](../archive/specs/phase1-nav-footer-restructure.md)
- 2026-08 早期版本，新增 `disability`、`green-shop` 群組；已被 #256 的 9 類取代。

#### Phase 16 — Footer 連結完整性與疾管署旅遊疫情同步 ✅
- 原檔：[phase16-footer-integrity-and-cdc-sync.md](../archive/specs/phase16-footer-integrity-and-cdc-sync.md)
- 當時 48 個 Footer 連結全數驗證；修 `/tools/travel-epidemic-alerts` 空資料（更新端點、CSV 種子、`scripts/sync-cdc-alerts.mjs`）；新增 `footerLinks.test.mjs` 回歸測試。

#### 擴充至 80 款工具與設計規範對齊 ✅
- 原檔：[expansion-to-80-tools-and-design-system-compliance.md](../archive/specs/expansion-to-80-tools-and-design-system-compliance.md)（#308）
- 67 → 80：健康食品、庇護工場、心理諮商、戒菸、成人預防保健、母嬰親善、器捐醫院、罕病、居家急救等 13 款。

#### 全台開放資料擴充與長照整併 ✅
- 原檔：[open-data-tools-expansion-and-consolidation.md](../archive/specs/open-data-tools-expansion-and-consolidation.md)（#211）
- 雙北桃高衛生局醫療院所、臺北捷運公告（已於 2026-10-21 隨 #728 整個移除）、北北桃竹 YouBike（已於 2026-10-21 隨 #727 整個移除）、樂齡旅遊地圖（景區無障礙設施／服務／套票；已於 2026-10-21 隨 #729 移除，`/tools/senior-friendly` 網址不變，改名「敬老卡補助」只留敬老卡）、農業部病蟲害（已於 2026-10-22 隨 #788 整個移除）、動物醫院、書籍；`ltc-contracted` 以 308 併入 `long-term-care`（該頁至今仍以 noindex 存在，2.0 M1 改 301）。

#### 全站列表預設 30 筆、分頁器、極細搜尋 ✅
- 原檔：[site-wide-list-pagination-and-granular-search.md](../archive/specs/site-wide-list-pagination-and-granular-search.md)（PR #312）
- 地圖類預設「最近 30 筆」、純資料類預設「最新 30 筆」；排序可切換距離／最新／筆畫；地圖標記與當頁 1:1 連動。

#### 工具資料源備援與自動同步 ✅
- 原檔：[tool-data-sources-fallback-and-integrity.md](../archive/specs/tool-data-sources-fallback-and-integrity.md)（#194、PR #201）
- 觀光工廠 0 筆（匯入腳本從未在正式環境執行、來源無座標）；建立全站通用種子備援、書店與觀光工廠座標補全、半年同步排程。

#### 全站工具健康巡檢與持續監控 ✅
- 原檔：[site-wide-tools-health-audit-and-continuous-monitoring.md](../archive/specs/site-wide-tools-health-audit-and-continuous-monitoring.md)（#306）
- CI 檢查：catalog ↔ 頁面對齊、metadata／canonical、禁止 `if (location.loading) return;` 阻塞、FacilitySearch 設定完整。

#### 客戶端請求逾時與雙軌即時渲染 ✅
- 原檔：[client-fetch-timeout-and-dual-track-rendering-resilience.md](../archive/specs/client-fetch-timeout-and-dual-track-rendering-resilience.md)（#304）
- `lib/client/fetchWithTimeout.ts` 預設 5 秒；第一軌用已知或預設座標立即渲染，第二軌取得 GPS 後平滑更新；食安、淹水、戶外安全補種子。

#### 公民倡議友站情境式工具聯動 ✅
- 原檔：[contextual-civic-partners-in-tool-linking.md](../archive/specs/contextual-civic-partners-in-tool-linking.md)（PR #323）
- `ContextualPartnerCard` 放在工具標題下方：台灣罪犯圖鑑 ↔ 幼兒園／補習班／兒童安全地點；黑熊學院 ↔ 防災類；反認知作戰 ↔ 新聞／查核類等。

#### g0v 活動整合與友站全站能見度 ✅
- 原檔：[g0v-events-and-civic-partners-visibility.md](../archive/specs/g0v-events-and-civic-partners-visibility.md)（PR #321）
- 解析 g0v 官方 Google Calendar ICS；建立 `CivicPartnersSection`，於首頁與 `/tools` 底部展示。

#### 運動部不適任教練專區 ✅
- 原檔：[SPEC-20261007-SPORTS-COACH-CIVIC-PARTNER.md](../archive/specs/SPEC-20261007-SPORTS-COACH-CIVIC-PARTNER.md)、工單 [TICKET-20261007-SPORTS-COACH-CIVIC-PARTNER.md](../archive/tickets/TICKET-20261007-SPORTS-COACH-CIVIC-PARTNER.md)（#430）
- 排在台灣罪犯圖鑑之後；Footer、精選區、短期補習班情境卡三層聯動。

#### Footer 社群圖示＋社群貼文草稿佇列 ✅（Phase 1）
- 原檔：[social-icons-and-post-drafts.md](../archive/specs/social-icons-and-post-drafts.md)
- Footer 加 Instagram／Facebook／Threads；每日由官方新聞組貼文草稿，於 `/admin/social-queue` 檢視。
- 不呼叫任何 Meta API；正式發佈待 Meta 商業驗證後另開 spec。

#### 2.0 全站規劃 🟡（進行中）
- 文件：[../2.0/master-plan.md](../2.0/master-plan.md)、PRD：[Issue #438](https://github.com/j172/health/issues/438)
