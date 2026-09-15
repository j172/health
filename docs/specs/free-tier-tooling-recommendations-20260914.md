# 研究報告：health.j172.tw 免費/免費額度工具方案研究（資料正確性、監控、SEO、效能）

- **文件類型**：純研究提案（Research only）。**未變更任何程式碼、設定檔、cron、生產環境或資料庫**。
- **日期**：2026-09-14
- **範圍**：地理編碼、資料正確性/驗證、SEO/內容正確性、監控/告警、效能/CDN 五大面向，各附候選方案表 + 針對本站現況的具體建議與優先級。
- **查證方式**：透過即時網路搜尋（WebSearch/WebFetch）比對官方文件、定價頁與技術文件，並優先閱讀本репо既有的 `docs/specs/*.md` 研究/規格文件與原始碼，避免與已完成或已研究過的項目重複。**未申請任何服務帳號、未產生任何 API 金鑰、未寫入任何程式碼。**

---

## 0. 現況總結（先讀，避免重複建議）

在深入五大面向之前，先盤點本站**已經實作或已經研究過**的相關能力，這些在下方建議中會標註「已具備」並降低優先級，避免重複造輪子：

| 面向 | 現況 | 依據 |
|---|---|---|
| 地理編碼 | **TGOS 全國門牌地址服務已是系統主要（#1）即時地理編碼供應商**（5,000 次/日），OpenCage（1,400/日）與 Nominatim（1,000/日）已降為備援；另有 **TGOS 批次比對服務**（10,000 筆/日）已建置為獨立工具鏈（`scripts/export-facilities-for-tgos.mjs`、`scripts/import-tgos-geocode-results.mjs`），供 NPO/稅籍機構等大宗待定位資料離線批次處理 | `docs/specs/tgos-primary-geocoder.md`（狀態：IMPLEMENTED，Closes #180）、`docs/specs/tgos-batch-geocoding-workflow.md`、實際腳本已存在於 `scripts/` |
| 資料正確性 | 尚未見任何 schema 驗證函式庫（`package.json` 未見 zod/ajv/joi/yup）；已有 `ingest_runs`／`ingest_errors` 內部記錄表，但屬自建記錄，非第三方資料品質監控工具；已有 22 個地理編碼資料源覆蓋率的專門研究 | `docs/specs/geocode-opendata-coverage-gap-research.md`；`docs/specs/hawkhost-server-optimization.md` §2.4 |
| SEO/內容正確性 | **IndexNow 已整合**（推送至 Bing/Yandex/Seznam/Naver，含每日 05:00 排程與新聞入庫即時推送）；**Schema.org `@graph` 實體圖譜已全站重構**（Organization/WebSite/BreadcrumbList/NewsArticle/MedicalWebPage/FAQPage 等，含 E-E-A-T 政府機關權威標記）；Core Web Vitals（LCP/TTFB/CLS/TBT）已依 PageSpeed Insights 實測全面優化（ISR、`next/image`、字型 swap） | `docs/specs/indexnow-and-microsoft-clarity.md`、`docs/specs/pagespeed-search-central-schema-optimization.md`（IMPLEMENTED, Closes #227）、`docs/specs/core-web-vitals-and-seo-optimization.md`（IMPLEMENTED, Closes #192） |
| 監控/告警 | **healthchecks.io 死人開關（dead-man's-switch）已上線**，但**僅綁定 PHP 端 cron watchdog**（`.remote-health-index.php`，`/news` 200 才 ping），**GitHub Actions 排程工作流程（9 個 `.github/workflows/*.yml`）本身完全沒有失敗通知機制**——本次稽核發現的 concurrency 搶佔 cancelled 事件正是因為沒有人監看 Actions 頁籤才被延誤發現 | `docs/specs/hawkhost-server-optimization.md` §2.2；本次對 `.github/workflows/facilities-geocode-batch.yml` 等檔案的檢查未見任何 `if: failure()` / webhook / notify 步驟 |
| 效能/CDN | Cloudflare Free 方案，Bot Fight Mode 已開啟；部署流程已有 Cloudflare 快取清除步驟（含 401 容錯）；`.htaccess` 已設定靜態資源 1 年不可變快取與壓縮 | `docs/specs/ci-deploy-and-sync-resilience.md` §2.1、`docs/specs/hawkhost-server-optimization.md` §2.3、記憶檔 `ops_cloudflare_bot_protection.md` |

---

## 1. 地理編碼（Geocoding）

**重要前提**：本站已於 2026-09-10（issue #180）將 TGOS 設為主要地理編碼供應商，OpenCage/Nominatim 已降為第 2、3 層備援；另有 TGOS 批次服務因應大宗資料。因此「還缺一個更好的免費地理編碼服務」這個問題**已經在很大程度上被回答並實作了**。以下候選方案僅供評估「是否值得再疊加一層備援」，而非取代 TGOS。

| 方案名稱 | 免費額度上限 | 適用面向 | 官方連結 |
|---|---|---|---|
| TGOS 地址定位（即時 API + 批次比對） | 即時 5,000 次/日；批次 10,000 筆/日 | 台灣門牌地址，官方權威圖資 | https://www.gov.tw/News_Content_2_371654（已採用，見上表） |
| OpenCage Data | 免費**試用**額度 2,500 次/日（非長期免費方案，本站已保守自限 1,400/日） | 通用地理編碼，OSM 為底 | https://opencagedata.com/pricing |
| Nominatim（OpenStreetMap） | 官方建議上限約 1 req/sec、每日視資源狀況（本站自限 1,000/日） | 通用地理編碼，需遵守 usage policy | https://operations.osmfoundation.org/policies/nominatim/ |
| LocationIQ | **5,000 次/日**（免費方案） | 通用地理編碼，OSM 為底，含反查 | https://locationiq.com/pricing |
| HERE Geocoding & Search | 依方案不同，官方文件常見為 **30,000 次/月**（部分文件提及舊方案 250,000 次/月，需以實際註冊後方案為準） | 通用地理編碼 | https://www.here.com/get-started/pricing |
| Google Geocoding API | **10,000 次/月**（2025-03-01 起，$200 共用額度已取消，改為各產品獨立配額；仍需綁定計費帳戶，逾額即扣款） | 通用地理編碼 | https://developers.google.com/maps/billing-and-pricing/faq |
| Mapbox Geocoding | Temporary（僅限即時使用者互動）10 萬次/月免費；**Permanent（批次/儲存用途）無免費額度**，$5/1000 起 | 不適用於本站的批次回填情境 | https://docs.mapbox.com/api/search/geocoding/ |

### 具體建議

1. **【低】暫不需再新增地理編碼供應商。** TGOS 即時 5,000/日 + 批次 10,000/日，已遠高於過去 OpenCage+Nominatim 合計 2,400/日的規模，且是官方門牌權威資料，精準度理論上優於通用地理編碼器對台灣巷弄地址的解析。目前 22 個資料源排隊的瓶頸，根據既有研究（`geocode-opendata-coverage-gap-research.md`）主要是「部分來源本身無座標可比對」的結構性問題，而非供應商配額不足——增加第 4 家 API 對此無實質幫助。
2. **【低】若未來 TGOS 本身出現額度或穩定性問題，LocationIQ（5,000/日）是最值得優先評估的下一層備援**，額度是 OpenCage 官方免費試用的 2 倍，且是長期免費方案（非試用限定），值得記錄在案但不急於現在申請帳號。
3. **【低】Google／HERE 兩者皆有免費額度但都綁定信用卡/計費帳戶**，對單人開發者而言有「忘記關閉、超額被扣款」的風險，且 Google 2025 年已取消共用額度、改為逐產品計費，評估優先級低於 LocationIQ。
4. **【不建議】Mapbox 不適用**——其免費額度限定「即時使用者互動」查詢，不可用於伺服器端批次回填既有資料庫地址，本站的地理編碼需求（排程批次處理待定位設施）正好落在其免費條款明文排除的用途。

---

## 2. 資料正確性 / 資料驗證（Data Quality & Validation）

本站架構為「政府 open data → Node.js/TypeScript 排程腳本 → MySQL」，且**目前完全沒有 schema 驗證函式庫**（`package.json` 未見 zod/ajv/joi/yup），資料正確性主要仰賴人工撰寫的欄位對應與既有的 `ingest_runs`/`ingest_errors` 記錄表。

| 方案名稱 | 免費額度上限 | 適用面向 | 官方連結 |
|---|---|---|---|
| Zod | 完全免費、開源（MIT），TypeScript 原生 | Schema 驗證、型別安全的 API/匯入資料驗證 | https://zod.dev/ |
| Ajv (JSON Schema Validator) | 完全免費、開源（MIT） | JSON Schema 驗證，效能佳，適合大量政府 open data JSON 逐筆驗證 | https://ajv.js.org/ |
| Great Expectations (GX) | 完全免費、開源（Apache 2.0），支援 MySQL | 資料品質規則（expectations）、自動產生 HTML 驗證報告 | https://greatexpectations.io/ |
| Linkinator | 完全免費、開源（MIT），Node.js 原生 | 網站 dead-link 爬蟲檢查，可整合 CI/GitHub Actions | https://github.com/JustinBeckwith/linkinator |
| muffet | 完全免費、開源（MIT），Go 語言，速度快 | 大型網站 dead-link 檢查（適合新聞頁面多達數萬篇的情境） | https://github.com/raviqqe/muffet |
| healthchecks.io（資料新鮮度告警用途） | 免費方案 20 組 checks | 排程任務／資料源「多久沒更新就告警」的新鮮度監控 | https://healthchecks.io/pricing/ |

### 具體建議

1. **【高】為新資料源匯入腳本導入 Zod（或 Ajv）做 schema 驗證。** 本站已多次因「上游政府資料集欄位悄悄改變」而踩雷（見既有規格 `mol-occupational-injury-source-id-migration.md`、`drug-label-source-blocked.md` 等），Zod 是 TypeScript 原生、零基礎設施成本，可以在每個 `scripts/import-*.mjs`／`lib/server/facilities/sources/*.ts` 讀取遠端資料後，立即用一個 schema 驗證欄位是否還存在、型別是否吻合，欄位消失或型別跑掉時提早在 `ingest_errors` 記錄明確錯誤，而非讓錯誤資料靜默寫入或讓解析邏輯默默失敗。**這是本次研究中對「架構這麼多政府 open data 匯入腳本」最直接對症下藥、成本最低的一項。**
2. **【中】為新聞與設施頁面加入 Linkinator 或 muffet 的排程 dead-link 檢查。** 本站新聞來自數十個 RSS 來源，長期累積後外部連結（政府公告原始連結、圖片來源）失效機率高；可作為一個新的 GitHub Actions workflow（比照現有 9 個排程 workflow 的模式），每週爬一次 `/news` 近期文章與 `/tools` 頁面，回報 404／逾時連結清單（本身不寫入資料庫，只產生報告）。muffet 較快、適合大量 URL；Linkinator 較完整、有現成 GitHub Action 可直接引用。
3. **【中】評估但不急著導入 Great Expectations。** 功能最完整（可對 MySQL 直接定義「地址不可為空」「lat/lng 須在台灣邊界內」等規則並產出 HTML 報告），但它是 Python 生態系工具，與本站 Node.js/TypeScript 技術棧不搭，需要額外的 Python 執行環境（本機已知這台 HawkHost 主機在記憶體/程序數上有明確限制，見既有記憶「LVE process ceiling」「768MB V8 heap cap」等事故紀錄），新增一個 Python runtime 到部署鏈的成本與風險值得先評估、不建議立即上線。
4. **【高，且幾乎零成本】把既有的 healthchecks.io 死人開關，從「只綁 1 個 PHP watchdog」擴充成「每個關鍵排程 workflow 各綁 1 個 check」。** 免費方案有 20 組 checks 額度，目前只用了 1 組，而本站已有 9 個 `.github/workflows/*.yml` 排程（`facilities-geocode-batch.yml`、`opendata-geo-backfill.yml`、`npo-organizations-sync.yml`、`disaster-points-sync.yml`、`health-supplements-import.yml`、`news-og-backfill.yml`、`six-monthly-sync.yml` 等）——每個 workflow 最後一步 `curl` ping 各自的 healthchecks.io URL，若排程「該跑而沒跑」（例如本次稽核抓到的 concurrency 搶佔 cancelled）就會逾時未 ping 而觸發告警，這是對本次稽核發現問題**最直接的解法**，且完全在既有免費額度內，零新增服務、零新增帳號。

---

## 3. SEO / 內容正確性

本站已完成 IndexNow 推送與 Schema.org `@graph` 重構（見 §0），Google Search Console 為題目明示已知免費工具，故本節聚焦「GSC 與 IndexNow 之外」的免費選項。

| 方案名稱 | 免費額度上限 | 適用面向 | 官方連結 |
|---|---|---|---|
| Bing Webmaster Tools | 完全免費 | URL 檢測（爬取/索引狀態/結構化資料錯誤/HTTP 狀態碼）、Sitemap 索引覆蓋率報告 | https://www.bing.com/webmasters |
| Google Rich Results Test | 完全免費，無需登入 | 單頁結構化資料（JSON-LD）即時驗證與 Google 特定 rich result 資格檢查 | https://search.google.com/test/rich-results |
| Schema Markup Validator（schema.org 官方協力工具） | 完全免費，無需登入 | 通用 schema.org 語法驗證（非 Google 專屬規則） | https://validator.schema.org/ |
| Ahrefs Webmaster Tools（AWT） | 免費、需驗證網站擁有權；Site Audit 每月 5,000 crawl credits，Site Explorer 可查最多 1,000 筆反向連結 | 全站技術 SEO 健檢（170+ 項檢查，含 404、redirect chain、重複標題/描述、hreflang 等）、反向連結監控 | https://ahrefs.com/webmaster-tools |

### 具體建議

1. **【高】註冊並驗證 Bing Webmaster Tools。** 本站已經在對 Bing 做 IndexNow 推送，但沒有 Bing 端的儀表板可回頭確認「有沒有真的被索引、有沒有結構化資料錯誤、有沒有 404」——這是 IndexNow 的天然盲點（IndexNow 只負責「通知」，不負責回報結果）。免費、與既有 IndexNow 投資完全互補，是本節優先級最高的一項。
2. **【中】將 Ahrefs Webmaster Tools 納入定期（例如每季）人工健檢，不做自動化整合。** 每月 5,000 crawl credits 對本站規模（news + 63 個工具頁）綽綽有餘，170+ 項技術 SEO 檢查涵蓋 §2 建議的 dead-link 檢查之外的項目（重複 meta、redirect chain、hreflang），可視為 Linkinator/muffet 的 SEO 向互補，而非重複建設；因為是需要人工登入查看報告的工具，不適合寫入排程自動化，故優先級列中。
3. **【中，一次性使用即可，不必長期監控】遇到新頁面模板（例如新增的 CPC 加油站地圖、YouBike 頁面）上線時，用 Rich Results Test / Schema Markup Validator 手動驗證一次新結構化資料。** 這兩個都是「單次貼網址進去看報告」的工具，不是持續監控服務，適合當作發布前的 checklist 項目，而非另開一個排程或帳號。

---

## 4. 監控 / 告警

這是本次稽核直接觸發的痛點：GitHub Actions 排程失敗（如本次的 concurrency 搶佔 cancelled）目前沒有任何主動告警，必須手動翻 Actions 頁籤才會發現。

| 方案名稱 | 免費額度上限 | 適用面向 | 官方連結 |
|---|---|---|---|
| healthchecks.io | 20 組 checks（免費 Hobbyist 方案），支援 Email/Slack/Discord/Webhook 等多種通知管道 | 排程「該跑而沒跑」的死人開關告警（已用於 PHP watchdog，建議擴充見 §2） | https://healthchecks.io/pricing/ |
| GitHub Actions 內建通知（Watch → Actions） | 完全免費、內建，無需第三方服務 | 對「自己觸發的 workflow 執行失敗」發送 Email/Web 通知 | https://docs.github.com/en/account-and-profile/managing-subscriptions-and-notifications-on-github/setting-up-notifications/configuring-notifications |
| slackapi/slack-github-action 或 ravsamhq/notify-slack-action | 完全免費（GitHub Actions Marketplace 開源 action），僅需 Slack Incoming Webhook（Slack 免費方案即可） | 對特定 workflow 的成功/失敗結果推播到 Slack 頻道，附連結與失敗步驟摘要 | https://github.com/marketplace/actions/slack-notify-build |
| UptimeRobot | 免費方案 50 個監控項目，5 分鐘偵測間隔，支援 HTTP/Port/Keyword 監控 | 網站可用性監控（`health.j172.tw`、`bid.j172.tw` 等對外服務） | https://uptimerobot.com/pricing/ |

### 具體建議

1. **【高】立即檢查並開啟 GitHub 帳號自己的通知設定，確保「自己觸發或排程觸發的 workflow 失敗」會收到 Email。** 這是零成本、零新增服務、五分鐘可完成的第一道防線，但容易被忽略（預設值因人而異，且倉庫層級的 Settings 不會強制個人通知偏好）。
2. **【高】在 9 個排程 workflow 中，為「業務關鍵」的幾個（`facilities-geocode-batch.yml`、`opendata-geo-backfill.yml`、`npo-organizations-sync.yml` 等資料同步類）加上失敗即發送 Slack 或 Discord 通知的步驟（`if: failure()` + webhook）。** 這是對本次稽核發現問題的直接解法：即使 workflow 因 concurrency 被取消（cancelled，不算 failure，需額外判斷 `github.event.workflow_run.conclusion` 或用 `if: always()` 搭配狀態檢查），也能設計成「執行完畢但沒有真的做完事」時主動通知，而不必等到有人手動點進 Actions 頁籤才發現。
3. **【高，見 §2 已合併建議】healthchecks.io 免費額度目前嚴重under-utilized（20 組中只用 1 組）**，比起額外導入 UptimeRobot，更划算的做法是先把既有的 healthchecks.io 帳號用滿，因為它「該跑而沒跑」的死人開關設計，比 UptimeRobot「網址現在有沒有回應」的被動輪詢，更貼合本站「排程任務有沒有真的執行完」的告警需求。
4. **【中】UptimeRobot 適合作為「網站本身是否活著」的獨立第三方視角**，與 healthchecks.io（監控排程任務）互補而非取代——healthchecks.io 是「任務有沒有跑」，UptimeRobot 是「網站現在能不能訪問」，兩者回答不同問題。免費 50 個監控額度遠超過本站現有對外端點數量（`health.j172.tw`、`bid.j172.tw` 等），值得評估但非當務之急，因為 HawkHost 主機層級的存活狀態已有既有的 watchdog 機制（`.remote-health-index.php`）覆蓋。

---

## 5. 效能 / CDN（Cloudflare Free 方案未開的功能）

以下皆已透過 Cloudflare 官方文件查證屬於 **Free 方案**（非需升級 Pro 才能使用）：

| 方案名稱 | 免費額度上限 | 適用面向 | 官方連結 |
|---|---|---|---|
| Smart Tiered Cache | Free 方案即可使用（Smart Topology 於 Free/Pro/Business/Enterprise 皆為 Yes），儀表板一鍵開啟，無需額外設定 | 減少 origin（HawkHost 主機）回源次數，多層快取節點就近服務 | https://developers.cloudflare.com/cache/how-to/tiered-cache/ |
| Cache Rules | Free 方案 10 條規則額度 | 取代舊版 Page Rules，可依路徑/副檔名設定 Edge TTL、強制快取、略過快取等 | https://developers.cloudflare.com/cache/how-to/cache-rules/ |
| Cloudflare Web Analytics | 所有方案（含 Free）皆免費，僅需在頁面插入一段 JS 片段，**不需要**網域走 Cloudflare Proxy/DNS | 無 cookie、隱私優先的頁面效能與流量分析，可與 Microsoft Clarity 互補 | https://developers.cloudflare.com/web-analytics/ |

### 具體建議

1. **【高】開啟 Smart Tiered Cache。** 這是查證中發現「Free 方案已經有、但本站尚未開啟」最具體的一項——零設定成本（儀表板一鍵開關），對於 HawkHost 這種已知有記憶體/程序數限制、且本次稽核關注效能的共享主機而言，減少回源請求次數直接降低 origin 負載，是最高投報比的一項。
2. **【中】盤點現有 `.htaccess` 的 Cache-Control 規則，改用 Cache Rules 在 edge 層設定等效或更細緻的快取策略。** 本站 Free 方案有 10 條規則額度，目前快取策略完全在 origin 端（`.htaccess`）決定，Cache Rules 可以讓 Cloudflare edge 直接依路徑/副檔名快取，連回源到 HawkHost 的請求都省下——但這屬於「調整既有設定」而非新增能力，需要先確認目前 `.htaccess` 規則與 Cloudflare 預設快取行為是否已有重疊或衝突，故列中優先級、建議先評估後動手,避免打亂目前運作正常的快取設定。
3. **【中】評估加入 Cloudflare Web Analytics 作為 Microsoft Clarity 的補充（非取代）。** Clarity 提供熱圖/錄影等深度互動分析，Cloudflare Web Analytics 則是輕量、無 cookie、不影響 Core Web Vitals 的流量與效能指標，兩者用途不重疊；由於是所有方案都免費、不需要改 DNS/Proxy 設定，導入成本極低，但因為本站已有 Clarity + GA4（`GoogleTag.tsx`）雙重分析，第三套工具的邊際資訊價值需要先評估是否值得，故列中而非高優先級。

---

## 6. 優先級總覽表

| 面向 | 建議事項 | 優先級 | 是否需要新帳號/新服務 |
|---|---|---|---|
| 監控/告警 | 確認 GitHub 個人通知設定已開啟 workflow 失敗 Email | **高** | 否（內建） |
| 監控/告警 | healthchecks.io 擴充到覆蓋所有關鍵排程 workflow（現有帳號額度內） | **高** | 否（沿用現有帳號） |
| 監控/告警 | 關鍵 workflow 加上失敗即通知 Slack/Discord 的步驟 | **高** | 是（需 Slack/Discord webhook，皆免費） |
| 資料正確性 | 匯入腳本導入 Zod/Ajv schema 驗證 | **高** | 否（純程式庫，無需帳號） |
| SEO | 註冊驗證 Bing Webmaster Tools | **高** | 是（免費帳號） |
| 效能/CDN | 開啟 Cloudflare Smart Tiered Cache | **高** | 否（沿用現有 Cloudflare 帳號） |
| 資料正確性 | 新增 Linkinator/muffet dead-link 排程檢查 | 中 | 否（開源工具，CI 內執行） |
| SEO | 導入 Ahrefs Webmaster Tools 做季度技術 SEO 健檢 | 中 | 是（免費帳號） |
| 監控/告警 | 評估 UptimeRobot 作為網站可用性第三方視角 | 中 | 是（免費帳號） |
| 效能/CDN | 盤點並導入 Cloudflare Cache Rules 取代/輔助 `.htaccess` | 中 | 否（沿用現有 Cloudflare 帳號） |
| 效能/CDN | 評估加入 Cloudflare Web Analytics 補充 Clarity | 中 | 否（沿用現有 Cloudflare 帳號） |
| 地理編碼 | 評估 LocationIQ 作為 TGOS 之後的下一層備援（僅記錄在案，非急件） | 低 | 尚不需要 |
| 資料正確性 | 評估 Great Expectations（技術棧不符，需額外 Python 環境） | 低 | 尚不需要 |
| 地理編碼 | Google/HERE 地理編碼（需綁定計費帳戶，風險大於效益） | 低 | 不建議 |
| 地理編碼 | Mapbox（免費額度條款明文排除批次回填用途） | 不建議 | — |

---

## 7. 明確排除聲明（Explicit Non-Goals）

- 本文件**未撰寫、修改任何程式碼**——所有 `.ts`/`.mjs`/`.yml`/`.php` 檔案皆未變更。
- 本文件**未申請任何服務帳號**——未註冊 Bing Webmaster Tools、Ahrefs Webmaster Tools、LocationIQ、HERE、healthchecks.io 新 checks、UptimeRobot、Slack webhook 或任何其他列出的服務。
- 所有「免費額度」數字皆於 2026-09-14 透過官方定價頁/官方文件查證得出；部分第三方比較文章（如 HERE 的兩種額度數字）存在出入，已在表格中誠實標註，未查到官方確切數字者未擅自臆測。
- 本文件不重複已完成的研究——TGOS 相關評估已詳見 `docs/specs/tgos-primary-geocoder.md` 與 `docs/specs/geocode-opendata-coverage-gap-research.md`，本文件僅在此基礎上補充「TGOS 之外還有沒有更好選項」的問題，結論是目前不需要。
