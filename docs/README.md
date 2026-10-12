# j172tw Healthz 文件總索引

> 2026-10-12 整併：原本散落在 `docs/specs/`（182 份）、`docs/tickets/`（6 份）與 2 份總規格的 190 份 Markdown，依領域合併為 13 份文件。每一份原始文件都恰好收錄在一份領域文件中，所有狀態都已對照程式碼與 GitHub issue／PR 重新核對（基準 `main` @ `7fe098b`）。
> 原始文件全部以 `git mv` 移到 [archive/](archive/)，內容與歷史完整保留；程式碼註解中的 66 處舊路徑已同步改寫。
> 網站：[https://health.j172.tw/](https://health.j172.tw/)

## 從哪裡開始讀

| 想知道… | 讀這份 |
|---|---|
| 系統整體怎麼運作、有哪些硬限制 | [architecture.md](architecture.md) |
| 接下來要做什麼（2.0） | [2.0/master-plan.md](2.0/master-plan.md)（研究＋24 項決策）、[2.0/spec-issue-438.md](2.0/spec-issue-438.md)（PRD，正本為 [Issue #438](https://github.com/j172/health/issues/438)） |
| 某個功能的歷史與決策 | 下方領域文件 |
| 還有哪些已知問題沒處理 | 本頁「跨領域待辦彙整」 |

## 領域文件

| # | 文件 | 原始文件數 | 涵蓋 |
|---|---|---|---|
| 01 | [新聞來源與擷取管線](domains/01-news-sources.md) | 39 | 來源擴充 Phase 3–15、品質閘門、全文擷取、來源移除、首頁新聞與導流 |
| 02 | [新聞圖片管線](domains/02-news-images.md) | 13 | 四層漏斗、官方向量封面、圖庫備援與冷卻、回填 |
| 03 | [新聞地標與地理萃取](domains/03-news-geo-landmark.md) | 8 | 地標瀑布規則、唯一性、368 鄉鎮、回填 |
| 04 | [資訊架構、導覽、工具平台與公民友站](domains/04-ia-navigation-civic.md) | 14 | 分類、Navbar／Footer、分頁、零空白、健康巡檢、友站 |
| 05 | [醫療、急救與食藥工具](domains/05-tools-medical-food.md) | 12 | 診所、急診、AED、長照 GIS、食安、藥品、醫事性平 |
| 06 | [社福、NPO、兒少家庭與文化工具](domains/06-tools-welfare-family-culture.md) | 20 | 伯公、身障、庇護工場、NPO、TDX 樂齡、兒少、藝文、文資 |
| 07 | [防災、水情、環境與能源工具](domains/07-tools-disaster-environment-energy.md) | 15 | 防災地圖、淹水、停水、氣象、電力、中油、緊急電話、防災物資 |
| 08 | [設施資料、地理編碼與地圖技術](domains/08-facilities-geocode-maps.md) | 13 | TGOS、OpenCage、地址正規化、地圖控制器 |
| 09 | [資料庫與資料正確性](domains/09-database-data-integrity.md) | 10 | UNIQUE KEY 膨脹事故、ensureSchema、zod |
| 10 | [排程、同步與 CI/CD](domains/10-scheduling-sync-ci.md) | 7 | node-cron、GitHub Actions 排程表、部署 |
| 11 | [主機、維運與事故](domains/11-hosting-ops-incidents.md) | 14 | NPROC、PM2、watchdog、WASM OOM、Cloudflare |
| 12 | [前端穩定性與側欄小工具](domains/12-frontend-stability.md) | 9 | React #418、側欄重構、App 內建瀏覽器橫幅 |
| 13 | [SEO、效能、多語系、AI 友善與授權](domains/13-seo-performance-i18n-ai.md) | 15 | Lighthouse、JSON-LD、llms.txt、ja／ko、臺、授權、UTM |
| — | [architecture.md](architecture.md) | 1（取代 SPECIFICATION.md） | 系統總覽 |

狀態圖例（各文件通用）：✅ 已上線（已核對程式碼）｜🟡 部分完成｜❌ 未實作／仍開放｜🗄️ 已取代或撤銷｜📚 研究／診斷｜⛔ 受阻

## 跨領域待辦彙整（核對後仍未完成）

> 2.0 範圍內的項目（搜尋、導覽、合併、交叉連結、套件、Node 24、底圖、UTM 覆蓋率等）統一追蹤於 [Issue #438](https://github.com/j172/health/issues/438)，此處不重複。

| 優先 | 代號 | 項目 | 文件 |
|---|---|---|---|
| **高** | DB-1 | `schema.ts` 建表 DDL 仍是舊的寬 UNIQUE KEY；資料庫重建後 4 張表會再度無限膨脹（重演 2026-09-21 全站中斷） | [09](domains/09-database-data-integrity.md) |
| **高** | O-1 | httpClient 每次 HTTPS 請求重建 TLS SecureContext，記憶體壓力下 `std::bad_alloc` 崩潰（#401 OPEN） | [11](domains/11-hosting-ops-incidents.md) |
| **高** | T-1 | `npm test` 會執行健保懲處匯入器：`scripts/verify-nhi-penalties.test.mjs` import 了 `scripts/import-nhi-penalties.mjs`，後者在最外層呼叫 `main()` → 每次測試都連網下載並覆寫 `data/facilities-seeds/nhi-penalties.json`，若環境有 `ADMIN_SECRET` 還會推送正式 API。修法：腳本加 `if (import.meta.url === pathToFileURL(process.argv[1]).href)` 守衛 | [05](domains/05-tools-medical-food.md) |
| **高** | W-1 | TDX 樂齡 API base path 未確認，`accessible-transit` 與 `senior-friendly` 實際跑種子資料。**2026-10-12 已找到正確路徑**（`/api/seniors/V1/Senior`），修正在分支 `fix/tdx-seniors-base-path`，待合併部署後實測；研究見 [2.0/tdx-basic-integration-research.md](2.0/tdx-basic-integration-research.md) | [06](domains/06-tools-welfare-family-culture.md) |
| 中 | I-1 | 新聞內頁 JSON-LD 圖片卡在通用來源圖（疑 ISR 時序） | [02](domains/02-news-images.md) |
| 中 | D-1 | NCDR 全類別示警只有後端，沒有前端分頁 | [07](domains/07-tools-disaster-environment-energy.md) |
| 中 | DB-2 | `migrations/*.sql` 沒有套用紀錄表 | [09](domains/09-database-data-integrity.md) |
| 中 | G-1 | 地標精確度分級未做（內頁地圖已移除，需重新評估價值） | [03](domains/03-news-geo-landmark.md) |
| 中 | — | 只有 33／84 個工具可被索引，2.0 分類頁與 hub 規劃時需納入考量 | [architecture](architecture.md) |
| 低 | I-2、O-2 | Issue #419、#391、#394 程式已上線但 issue 未關 | [02](domains/02-news-images.md)、[11](domains/11-hosting-ops-incidents.md) |
| 低 | N-1 | Google News `site:` 代理仍有 11 筆，持續依新鮮度淘汰 | [01](domains/01-news-sources.md) |
| 低 | N-2 | 運動部新聞需客製爬蟲做日期截斷 | [01](domains/01-news-sources.md) |
| 低 | W-2 | 文資局從正式主機的連線未驗證 | [06](domains/06-tools-welfare-family-culture.md) |
| 低 | D-2 | 本機殘留空目錄（dengue 等，已列入 2.0 P0 清理） | [07](domains/07-tools-disaster-environment-energy.md) |
| 受阻 | M-1 | 藥品仿單無官方結構化來源 | [05](domains/05-tools-medical-food.md) |
| 受阻 | N-3 | 健保署封鎖資料中心 IP | [01](domains/01-news-sources.md) |
| 外部 | O-4 | 共享主機鄰居搶 CPU | [11](domains/11-hosting-ops-incidents.md) |

## 撰寫新文件的規則

1. 新的 spec 直接放 `docs/2.0/`（2.0 範圍）或在對應領域文件新增一節；**不要再建立散落的 `docs/specs/*.md`**。
2. 每份 spec 標明：日期、狀態、issue／PR、已拍板的決策。
3. 上線後回到領域文件把狀態改成 ✅，並更新「目前真相」與「待辦」。
4. 站內頁面連結使用完整網址 `https://health.j172.tw/...`；外部連結若出現在網站上，必須經 `appendOutboundUtm()`。

## 原始文件對照表

| 原始文件 | 收錄於 | 對應段落 | 狀態 |
|---|---|---|---|
| [CLOUDFLARE_OPTIMIZATION.md](archive/CLOUDFLARE_OPTIMIZATION.md) | [11 主機維運](domains/11-hosting-ops-incidents.md) | Cloudflare Free 方案優化手冊 | ✅ |
| [SPECIFICATION.md](archive/SPECIFICATION.md) | [architecture](architecture.md) | 系統技術總規格 v2.4.0（已由 architecture.md 取代） | 🗄️ |
| [specs/accessible-transit-and-inundation-map.md](archive/specs/accessible-transit-and-inundation-map.md) | [07 防災環境](domains/07-tools-disaster-environment-energy.md) | 無障礙交通地圖＋積淹水感測地圖（Phase 2 雙旗艦） | ✅ |
| [specs/add-6-gov-news-sources-dgpa-hakka-moi.md](archive/specs/add-6-gov-news-sources-dgpa-hakka-moi.md) | [01 新聞來源](domains/01-news-sources.md) | 6 個政府機關 RSS（人事總處／客委會／內政部） | ✅ |
| [specs/apatw-news-source.md](archive/specs/apatw-news-source.md) | [01 新聞來源](domains/01-news-sources.md) | APA 保護動物協會 | ✅ |
| [specs/aqi-pm25-narrow-unique-key-migration.md](archive/specs/aqi-pm25-narrow-unique-key-migration.md) | [09 資料庫](domains/09-database-data-integrity.md) | aqi_readings／pm25_readings 縮窄並補 UPDATE 欄位 | 🟡 |
| [specs/child-native-languages-dictionary.md](archive/specs/child-native-languages-dictionary.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | 兒少本土語言辭典（閩南語／客語） | ✅ |
| [specs/child-safety-spots-honest-coverage.md](archive/specs/child-safety-spots-honest-coverage.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | 婦幼安全警示地點誠實揭露定位涵蓋率 | ✅ |
| [specs/child-welfare-and-public-services-expansion.md](archive/specs/child-welfare-and-public-services-expansion.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | 兒少福利擴充與「便民服務」更名 | ✅ |
| [specs/child-welfare-tools-and-news-expansion.md](archive/specs/child-welfare-tools-and-news-expansion.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | 兒少工具、避孕地圖、文化資產 6 圖層修復 | ✅ |
| [specs/ci-deploy-and-sync-resilience.md](archive/specs/ci-deploy-and-sync-resilience.md) | [10 排程CI](domains/10-scheduling-sync-ci.md) | 部署快取清除與半年同步強化 | ✅ |
| [specs/client-fetch-timeout-and-dual-track-rendering-resilience.md](archive/specs/client-fetch-timeout-and-dual-track-rendering-resilience.md) | [04 資訊架構](domains/04-ia-navigation-civic.md) | 客戶端請求逾時與雙軌即時渲染 | ✅ |
| [specs/clinic-weekly-hours-matrix.md](archive/specs/clinic-weekly-hours-matrix.md) | [05 醫療食藥](domains/05-tools-medical-food.md) | 看診時段 7×3 矩陣 | ✅ |
| [specs/contextual-civic-partners-in-tool-linking.md](archive/specs/contextual-civic-partners-in-tool-linking.md) | [04 資訊架構](domains/04-ia-navigation-civic.md) | 公民倡議友站情境式工具聯動 | ✅ |
| [specs/core-web-vitals-and-seo-optimization.md](archive/specs/core-web-vitals-and-seo-optimization.md) | [13 SEO多語](domains/13-seo-performance-i18n-ai.md) | Core Web Vitals 與 Search Central 最佳化 | ✅ |
| [specs/cpc-prices-and-stations-expansion.md](archive/specs/cpc-prices-and-stations-expansion.md) | [07 防災環境](domains/07-tools-disaster-environment-energy.md) | 中油牌價、20 類據點地圖、首頁小卡 | ✅ |
| [specs/cpc-station-info-enrichment.md](archive/specs/cpc-station-info-enrichment.md) | [07 防災環境](domains/07-tools-disaster-environment-energy.md) | 中油站點補接 getStationInfo | ✅ |
| [specs/cpc-station-map-shared-controller-gap.md](archive/specs/cpc-station-map-shared-controller-gap.md) | [08 設施地圖](domains/08-facilities-geocode-maps.md) | 中油站點地圖接上共用 MapViewController | ✅ |
| [specs/cron-memory-monitoring.md](archive/specs/cron-memory-monitoring.md) | [10 排程CI](domains/10-scheduling-sync-ci.md) | 每個 cron job 的記憶體監控 | ✅ |
| [specs/cultural-events-and-performance-venues-expansion.md](archive/specs/cultural-events-and-performance-venues-expansion.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | 藝文 19 類 API 與 767 處演藝場所 | ✅ |
| [specs/cwa-rainfall-duplicate-row-cleanup.md](archive/specs/cwa-rainfall-duplicate-row-cleanup.md) | [09 資料庫](domains/09-database-data-integrity.md) | cwa_rainfall 重複列清理 | ✅ |
| [specs/cwa-rainfall-narrow-unique-key-migration.md](archive/specs/cwa-rainfall-narrow-unique-key-migration.md) | [09 資料庫](domains/09-database-data-integrity.md) | cwa_rainfall UNIQUE KEY 縮窄 | 🟡 |
| [specs/cwa-station-weather-duplicate-row-cleanup.md](archive/specs/cwa-station-weather-duplicate-row-cleanup.md) | [09 資料庫](domains/09-database-data-integrity.md) | cwa_station_weather 重複列累積與效能懸崖 | ✅ |
| [specs/cwa-station-weather-narrow-unique-key-migration.md](archive/specs/cwa-station-weather-narrow-unique-key-migration.md) | [09 資料庫](domains/09-database-data-integrity.md) | cwa_station_weather UNIQUE KEY 縮窄 | 🟡 |
| [specs/cwa-station-weather-obstime-update-fix.md](archive/specs/cwa-station-weather-obstime-update-fix.md) | [09 資料庫](domains/09-database-data-integrity.md) | cwa_station_weather obs_time 永遠凍結 | ✅ |
| [specs/decimal-coords-coercion.md](archive/specs/decimal-coords-coercion.md) | [08 設施地圖](domains/08-facilities-geocode-maps.md) | 查詢層統一轉換 DECIMAL 座標 | ✅ |
| [specs/dengue-vector-survey-removal.md](archive/specs/dengue-vector-survey-removal.md) | [07 防災環境](domains/07-tools-disaster-environment-energy.md) | 完整移除登革熱病媒蚊地圖 | ✅ |
| [specs/detail-page-chrome-scoping.md](archive/specs/detail-page-chrome-scoping.md) | [01 新聞來源](domains/01-news-sources.md) | 詳情頁依來源設定擷取範圍 | ✅ |
| [specs/detail-page-source-survey.md](archive/specs/detail-page-source-survey.md) | [01 新聞來源](domains/01-news-sources.md) | 全部詳情頁來源普查 | ✅ |
| [specs/disaster-shelter-rescue-map.md](archive/specs/disaster-shelter-rescue-map.md) | [07 防災環境](domains/07-tools-disaster-environment-energy.md) | 防災地圖（避難收容／消防救援／應變中心） | ✅ |
| [specs/district-table-expansion-368.md](archive/specs/district-table-expansion-368.md) | [03 新聞地標](domains/03-news-geo-landmark.md) | 鄉鎮表由 122 擴充為 368 | ✅ |
| [specs/drop-ntuh-source.md](archive/specs/drop-ntuh-source.md) | [01 新聞來源](domains/01-news-sources.md) | 移除臺大醫院（含 IFC）並清除歷史 | ✅ |
| [specs/drop-wra-drought-source.md](archive/specs/drop-wra-drought-source.md) | [01 新聞來源](domains/01-news-sources.md) | 移除 WRA 枯旱來源 | ✅ |
| [specs/drug-label-source-blocked.md](archive/specs/drug-label-source-blocked.md) | [05 醫療食藥](domains/05-tools-medical-food.md) | 藥品仿單資料源（受阻） | ⛔ |
| [specs/dual-license-mit-and-cc0-spdx.md](archive/specs/dual-license-mit-and-cc0-spdx.md) | [13 SEO多語](domains/13-seo-performance-i18n-ai.md) | MIT＋CC0-1.0 雙軌授權 | ✅ |
| [specs/emergency-aed-disaster-map-and-site-wide-tools-health.md](archive/specs/emergency-aed-disaster-map-and-site-wide-tools-health.md) | [05 醫療食藥](domains/05-tools-medical-food.md) | AED／防災地圖修復、定位標準化、全站工具巡檢 | ✅ |
| [specs/emergency-room-status-and-aed-map-expansion.md](archive/specs/emergency-room-status-and-aed-map-expansion.md) | [05 醫療食藥](domains/05-tools-medical-food.md) | 急診即時看板＋AED 地圖 | ✅ |
| [specs/ensure-schema-concurrent-call-deadlock.md](archive/specs/ensure-schema-concurrent-call-deadlock.md) | [09 資料庫](domains/09-database-data-integrity.md) | ensureSchema() 併發呼叫造成冷啟動死鎖 | ✅ |
| [specs/expansion-to-80-tools-and-design-system-compliance.md](archive/specs/expansion-to-80-tools-and-design-system-compliance.md) | [04 資訊架構](domains/04-ia-navigation-civic.md) | 擴充至 80 款工具與設計規範對齊 | ✅ |
| [specs/facilities-address-normalization-and-smart-geocoding.md](archive/specs/facilities-address-normalization-and-smart-geocoding.md) | [08 設施地圖](domains/08-facilities-geocode-maps.md) | 地址輕度正規化、官方 GPS 白名單、智慧重算 | ✅ |
| [specs/facility-nearby-fallback-and-honest-total.md](archive/specs/facility-nearby-fallback-and-honest-total.md) | [08 設施地圖](domains/08-facilities-geocode-maps.md) | 附近搜尋自動擴大與誠實總數 | ✅ |
| [specs/fix-facility-cross-county-coordinate-mismatch.md](archive/specs/fix-facility-cross-county-coordinate-mismatch.md) | [08 設施地圖](domains/08-facilities-geocode-maps.md) | 修正跨縣市座標錯配 | ✅ |
| [specs/fix-hydration-418-cron-memory-guard-and-static-manifest.md](archive/specs/fix-hydration-418-cron-memory-guard-and-static-manifest.md) | [12 前端穩定](domains/12-frontend-stability.md) | React #418、cron 記憶體防護、靜態 manifest | ✅ |
| [specs/fix-hydration-418-external-image-500-and-api-timeouts.md](archive/specs/fix-hydration-418-external-image-500-and-api-timeouts.md) | [12 前端穩定](domains/12-frontend-stability.md) | React #418、外部圖片 500、側欄 API 逾時 | ✅ |
| [specs/fix-server-fetch-wasm-oom-502.md](archive/specs/fix-server-fetch-wasm-oom-502.md) | [11 主機維運](domains/11-hosting-ops-incidents.md) | 伺服器端 fetch() WASM OOM 造成 502 | ✅ |
| [specs/food-safety-and-outdoor-safety-mashup.md](archive/specs/food-safety-and-outdoor-safety-mashup.md) | [05 醫療食藥](domains/05-tools-medical-food.md) | 食安農藥殘留看板＋戶外安全指數 | ✅ |
| [specs/four-tier-news-card-image-funnel.md](archive/specs/four-tier-news-card-image-funnel.md) | [02 新聞圖片](domains/02-news-images.md) | 四層圖片漏斗與歷史圖庫重用 | ✅ |
| [specs/free-tier-tooling-recommendations-20260914.md](archive/specs/free-tier-tooling-recommendations-20260914.md) | [13 SEO多語](domains/13-seo-performance-i18n-ai.md) | 免費／免費額度工具方案研究 | 📚 |
| [specs/g0v-cultural-events.md](archive/specs/g0v-cultural-events.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | g0v 黑客松與社群活動 | ✅ |
| [specs/g0v-events-and-civic-partners-visibility.md](archive/specs/g0v-events-and-civic-partners-visibility.md) | [04 資訊架構](domains/04-ia-navigation-civic.md) | g0v 活動整合與友站全站能見度 | ✅ |
| [specs/geocode-opendata-coverage-gap-research.md](archive/specs/geocode-opendata-coverage-gap-research.md) | [08 設施地圖](domains/08-facilities-geocode-maps.md) | 剩餘 geocode 來源的開放資料座標缺口研究 | 📚 |
| [specs/github-actions-cron-decollision.md](archive/specs/github-actions-cron-decollision.md) | [10 排程CI](domains/10-scheduling-sync-ci.md) | GitHub Actions 排程去重疊 | ✅ |
| [specs/global-unoptimized-images-and-php-bypass-502.md](archive/specs/global-unoptimized-images-and-php-bypass-502.md) | [11 主機維運](domains/11-hosting-ops-incidents.md) | 全域停用圖片最佳化、PHP 代理分流 | ✅ |
| [specs/google-preferred-source-and-remove-zh-cn.md](archive/specs/google-preferred-source-and-remove-zh-cn.md) | [13 SEO多語](domains/13-seo-performance-i18n-ai.md) | Google 首選來源按鈕＋移除簡體中文 | ✅ |
| [specs/gov-opendata-news-integration.md](archive/specs/gov-opendata-news-integration.md) | [01 新聞來源](domains/01-news-sources.md) | 政府開放資料新聞整合 | 🗄️ |
| [specs/hakka-bogong-care-station.md](archive/specs/hakka-bogong-care-station.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | 客委會「伯公照護站」查詢（更名） | ✅ |
| [specs/hakka-bogong-npo-and-public-services-expansion.md](archive/specs/hakka-bogong-npo-and-public-services-expansion.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | 伯公擴展、便民三工具、NPO 信任徽章、10+1 社福新聞、19 家藝文售票 | ✅ |
| [specs/hawkhost-server-optimization.md](archive/specs/hawkhost-server-optimization.md) | [11 主機維運](domains/11-hosting-ops-incidents.md) | HawkHost 主機最佳化與治理 | ✅ |
| [specs/heritage-assets-map.md](archive/specs/heritage-assets-map.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | 文化資產地圖 | ✅ |
| [specs/hey-ai-llm-info-profile.md](archive/specs/hey-ai-llm-info-profile.md) | [13 SEO多語](domains/13-seo-performance-i18n-ai.md) | Hey AI（/llm-info）官方簡介頁 | ✅ |
| [specs/home-news-blog-card-integration.md](archive/specs/home-news-blog-card-integration.md) | [01 新聞來源](domains/01-news-sources.md) | 首頁新聞格加入部落格卡片 | ✅ |
| [specs/homepage-news-count-30.md](archive/specs/homepage-news-count-30.md) | [01 新聞來源](domains/01-news-sources.md) | 首頁新聞 54 → 30 篇 | ✅ |
| [specs/httpclient-shared-tls-agent.md](archive/specs/httpclient-shared-tls-agent.md) | [11 主機維運](domains/11-hosting-ops-incidents.md) | httpClient 共用 keep-alive TLS Agent | ❌ |
| [specs/i18n-and-footer-sorting.md](archive/specs/i18n-and-footer-sorting.md) | [13 SEO多語](domains/13-seo-performance-i18n-ai.md) | 多語系切換與首字排序（初版） | 🗄️ |
| [specs/in-app-browser-warning-banner.md](archive/specs/in-app-browser-warning-banner.md) | [12 前端穩定](domains/12-frontend-stability.md) | App 內建瀏覽器警告橫幅 | ✅ |
| [specs/in-app-cron-scheduler.md](archive/specs/in-app-cron-scheduler.md) | [10 排程CI](domains/10-scheduling-sync-ci.md) | In-app cron 排程器（node-cron） | ✅ |
| [specs/indexnow-and-microsoft-clarity.md](archive/specs/indexnow-and-microsoft-clarity.md) | [13 SEO多語](domains/13-seo-performance-i18n-ai.md) | IndexNow 與 Microsoft Clarity | ✅ |
| [specs/inundation-map-real-map-implementation.md](archive/specs/inundation-map-real-map-implementation.md) | [07 防災環境](domains/07-tools-disaster-environment-energy.md) | 為積淹水地圖建立真正的地圖 | ✅ |
| [specs/issue-418-map-navigation-i18n-ja-ko-seo-isr.md](archive/specs/issue-418-map-navigation-i18n-ja-ko-seo-isr.md) | [13 SEO多語](domains/13-seo-performance-i18n-ai.md) | Google 地圖導航、日韓語系、三層 ISR | ✅ |
| [specs/kuma-academy-and-civic-partners.md](archive/specs/kuma-academy-and-civic-partners.md) | [01 新聞來源](domains/01-news-sources.md) | 黑熊學院（新聞＋行事曆＋友站） | ✅ |
| [specs/latest-books-service-phase4.md](archive/specs/latest-books-service-phase4.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | 最新書籍（Phase 4） | ✅ |
| [specs/llms-txt-spec-compliance-fix.md](archive/specs/llms-txt-spec-compliance-fix.md) | [13 SEO多語](domains/13-seo-performance-i18n-ai.md) | /llms.txt 格式符合 llmstxt.org | ✅ |
| [specs/map-technology-consistency-audit.md](archive/specs/map-technology-consistency-audit.md) | [08 設施地圖](domains/08-facilities-geocode-maps.md) | 地圖技術一致性盤點（工單） | 📚 |
| [specs/map-technology-findings.md](archive/specs/map-technology-findings.md) | [08 設施地圖](domains/08-facilities-geocode-maps.md) | 地圖技術盤點結果與建議 | 📚 |
| [specs/moda-press-news-source.md](archive/specs/moda-press-news-source.md) | [01 新聞來源](domains/01-news-sources.md) | 數位發展部新聞發布 | ✅ |
| [specs/mohw-ltc-gis-ecosystem-consolidation.md](archive/specs/mohw-ltc-gis-ecosystem-consolidation.md) | [05 醫療食藥](domains/05-tools-medical-food.md) | 衛福部長照 GIS 全生態系整併 | ✅ |
| [specs/mol-occupational-injury-source-id-migration.md](archive/specs/mol-occupational-injury-source-id-migration.md) | [05 醫療食藥](domains/05-tools-medical-food.md) | 勞動部來源改用穩定複合鍵 | ✅ |
| [specs/mygopen-news-source.md](archive/specs/mygopen-news-source.md) | [01 新聞來源](domains/01-news-sources.md) | MyGoPen 查核中心 | ✅ |
| [specs/navbar-footer-reclassification-and-merges.md](archive/specs/navbar-footer-reclassification-and-merges.md) | [04 資訊架構](domains/04-ia-navigation-civic.md) | Navbar／Footer 重新分類＋5 組工具合併＋筆畫排序 | ✅ |
| [specs/ncdr-disaster-alerts-integration.md](archive/specs/ncdr-disaster-alerts-integration.md) | [07 防災環境](domains/07-tools-disaster-environment-energy.md) | NCDR 全類別災害示警（研究與設計） | 🟡 |
| [specs/new-news-sources-candidate-verification.md](archive/specs/new-news-sources-candidate-verification.md) | [01 新聞來源](domains/01-news-sources.md) | 候選來源查證流程 | ✅ |
| [specs/news-article-jsonld-stale-fallback-image.md](archive/specs/news-article-jsonld-stale-fallback-image.md) | [02 新聞圖片](domains/02-news-images.md) | 新聞內頁 JSON-LD 圖片卡在預設圖 | ❌ |
| [specs/news-card-destination-routing-and-no-delay-utm.md](archive/specs/news-card-destination-routing-and-no-delay-utm.md) | [01 新聞來源](domains/01-news-sources.md) | 新聞卡片官方／非官方分流、移除 3 秒轉址 | ✅ |
| [specs/news-card-image-freshness-scheduling.md](archive/specs/news-card-image-freshness-scheduling.md) | [02 新聞圖片](domains/02-news-images.md) | 卡片圖片新鮮度排程 | ✅ |
| [specs/news-card-image-multi-provider-fallback.md](archive/specs/news-card-image-multi-provider-fallback.md) | [02 新聞圖片](domains/02-news-images.md) | 多供應商圖庫備援與遞增退避 | ✅ |
| [specs/news-card-images-and-dual-track-scheduling.md](archive/specs/news-card-images-and-dual-track-scheduling.md) | [02 新聞圖片](domains/02-news-images.md) | 圖片擷取、雙軌排程與 DB 效能 | ✅ |
| [specs/news-freshness-gate.md](archive/specs/news-freshness-gate.md) | [01 新聞來源](domains/01-news-sources.md) | 新鮮度閘門、未來日期、失效的 site-search feed | ✅ |
| [specs/news-fulltext-fetch-findings.md](archive/specs/news-fulltext-fetch-findings.md) | [01 新聞來源](domains/01-news-sources.md) | 全文抓取健康度診斷結果 | 📚 |
| [specs/news-fulltext-fetch-health-audit.md](archive/specs/news-fulltext-fetch-health-audit.md) | [01 新聞來源](domains/01-news-sources.md) | 全文抓取健康度稽核（工單） | 📚 |
| [specs/news-fulltext-ingestion-cleanup-and-gov-fixes.md](archive/specs/news-fulltext-ingestion-cleanup-and-gov-fixes.md) | [01 新聞來源](domains/01-news-sources.md) | 全文擷取整理 | ✅ |
| [specs/news-geo-and-image-enrichment.md](archive/specs/news-geo-and-image-enrichment.md) | [03 新聞地標](domains/03-news-geo-landmark.md) | 新聞與設施的地理萃取與圖片回填（起點） | ✅ |
| [specs/news-hero-image-local-path-regex-fix.md](archive/specs/news-hero-image-local-path-regex-fix.md) | [02 新聞圖片](domains/02-news-images.md) | 新聞內頁 Hero 圖遺失（regex 過時） | ✅ |
| [specs/news-image-fallback-gap-fixes.md](archive/specs/news-image-fallback-gap-fixes.md) | [02 新聞圖片](domains/02-news-images.md) | 備援缺口修復 | ✅ |
| [specs/news-image-pipeline-audit.md](archive/specs/news-image-pipeline-audit.md) | [02 新聞圖片](domains/02-news-images.md) | 抓圖流程診斷（工單） | 📚 |
| [specs/news-image-pipeline-findings.md](archive/specs/news-image-pipeline-findings.md) | [02 新聞圖片](domains/02-news-images.md) | 抓圖流程診斷結果 | 📚 |
| [specs/news-landmark-backfill.md](archive/specs/news-landmark-backfill.md) | [03 新聞地標](domains/03-news-geo-landmark.md) | 既有新聞重新套用地標規則 | ✅ |
| [specs/news-landmark-precision-tiers.md](archive/specs/news-landmark-precision-tiers.md) | [03 新聞地標](domains/03-news-geo-landmark.md) | 地標精確度分級與靜態地圖雜湊碰撞 | 🟡 |
| [specs/news-landmark-saturation-guard.md](archive/specs/news-landmark-saturation-guard.md) | [03 新聞地標](domains/03-news-geo-landmark.md) | 剝除 SVG metadata、要求唯一匹配 | ✅ |
| [specs/news-sources-expansion-phase3.md](archive/specs/news-sources-expansion-phase3.md) | [01 新聞來源](domains/01-news-sources.md) | Phase 3 — 19 大新聞與公益來源 | ✅ |
| [specs/news-static-map-svg-and-image-resilience.md](archive/specs/news-static-map-svg-and-image-resilience.md) | [02 新聞圖片](domains/02-news-images.md) | 靜態地圖 SVG 與圖片韌性 | ✅ |
| [specs/news-thematic-cover-and-pipeline-resilience.md](archive/specs/news-thematic-cover-and-pipeline-resilience.md) | [02 新聞圖片](domains/02-news-images.md) | 官方白皮書向量封面＋媒體真圖管線疏通 | ✅ |
| [specs/nhi-clinic-penalties-integration.md](archive/specs/nhi-clinic-penalties-integration.md) | [05 醫療食藥](domains/05-tools-medical-food.md) | 健保違規、停約與五年不予特約名冊 | ✅ |
| [specs/no-server-fetch-regression-guard.md](archive/specs/no-server-fetch-regression-guard.md) | [11 主機維運](domains/11-hosting-ops-incidents.md) | 禁止伺服器端 fetch 的回歸防護 | ✅ |
| [specs/npo-address-enrichment-pipeline.md](archive/specs/npo-address-enrichment-pipeline.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | NPO 實體門牌補齊管線 | ✅ |
| [specs/npo-news-sources-and-cultural-events.md](archive/specs/npo-news-sources-and-cultural-events.md) | [01 新聞來源](domains/01-news-sources.md) | NPO 公益新聞 8 家＋NPO Center 活動 | ✅ |
| [specs/npo-organizations-directory.md](archive/specs/npo-organizations-directory.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | NPO 名錄整合與補強 | ✅ |
| [specs/npo-sync-concurrency-starvation-fix.md](archive/specs/npo-sync-concurrency-starvation-fix.md) | [10 排程CI](domains/10-scheduling-sync-ci.md) | NPO 同步被 geocode 批次搶佔取消 | ✅ |
| [specs/open-data-tools-expansion-and-consolidation.md](archive/specs/open-data-tools-expansion-and-consolidation.md) | [04 資訊架構](domains/04-ia-navigation-civic.md) | 全台開放資料擴充與長照整併 | ✅ |
| [specs/opendata-geo-scheduled-backfill.md](archive/specs/opendata-geo-scheduled-backfill.md) | [08 設施地圖](domains/08-facilities-geocode-maps.md) | 開放資料預定位回填排程化 | ✅ |
| [specs/opendata-sources-audit-20260914.md](archive/specs/opendata-sources-audit-20260914.md) | [13 SEO多語](domains/13-seo-performance-i18n-ai.md) | Open Data 來源盤點與更權威來源提案 | 📚 |
| [specs/pagespeed-lighthouse-baseline-20260914.md](archive/specs/pagespeed-lighthouse-baseline-20260914.md) | [13 SEO多語](domains/13-seo-performance-i18n-ai.md) | Lighthouse 基準量測 | 📚 |
| [specs/pagespeed-search-central-schema-optimization.md](archive/specs/pagespeed-search-central-schema-optimization.md) | [13 SEO多語](domains/13-seo-performance-i18n-ai.md) | PageSpeed、Search Central、Schema.org 全站系統化最佳化 | ✅ |
| [specs/pet-adoption-cultural-pager-and-npo-products.md](archive/specs/pet-adoption-cultural-pager-and-npo-products.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | 毛孩認養自動種子、藝文分頁器、62 家 NPO 商品 | ✅ |
| [specs/phase1-nav-footer-restructure.md](archive/specs/phase1-nav-footer-restructure.md) | [04 資訊架構](domains/04-ia-navigation-civic.md) | Phase 1 — 身心障礙、綠色商店導覽群組 | 🗄️ |
| [specs/phase10-businessweekly-health-source.md](archive/specs/phase10-businessweekly-health-source.md) | [01 新聞來源](domains/01-news-sources.md) | Phase 10 — 良醫健康網（商業周刊） | ✅ |
| [specs/phase11-edh-health-source.md](archive/specs/phase11-edh-health-source.md) | [01 新聞來源](domains/01-news-sources.md) | Phase 11 — 早安健康（edh.tw） | ✅ |
| [specs/phase12-expanded-media-and-health-sources.md](archive/specs/phase12-expanded-media-and-health-sources.md) | [01 新聞來源](domains/01-news-sources.md) | Phase 12 — 15 個健康／醫學中心／媒體來源 | ✅ |
| [specs/phase13-expanded-media-and-lifestyle-sources.md](archive/specs/phase13-expanded-media-and-lifestyle-sources.md) | [01 新聞來源](domains/01-news-sources.md) | Phase 13 — 6 個熟齡／生活媒體 | ✅ |
| [specs/phase14-medical-centers-cgmh-vghtpe.md](archive/specs/phase14-medical-centers-cgmh-vghtpe.md) | [01 新聞來源](domains/01-news-sources.md) | Phase 14 — 長庚、臺北榮總 | ✅ |
| [specs/phase15-expanded-sexology-and-family-media-sources.md](archive/specs/phase15-expanded-sexology-and-family-media-sources.md) | [01 新聞來源](domains/01-news-sources.md) | Phase 15 — 性健康與親子媒體 | ✅ |
| [specs/phase16-footer-integrity-and-cdc-sync.md](archive/specs/phase16-footer-integrity-and-cdc-sync.md) | [04 資訊架構](domains/04-ia-navigation-civic.md) | Phase 16 — Footer 連結完整性與疾管署旅遊疫情同步 | ✅ |
| [specs/phase2-disability-accessible-atm.md](archive/specs/phase2-disability-accessible-atm.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | Phase 2 — 無障礙 ATM | ✅ |
| [specs/phase3-green-shops.md](archive/specs/phase3-green-shops.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | Phase 3 — 綠色商店 | ✅ |
| [specs/phase4-health-checks-mol-source.md](archive/specs/phase4-health-checks-mol-source.md) | [05 醫療食藥](domains/05-tools-medical-food.md) | Phase 4 — 健康檢查補上勞動部來源 | ✅ |
| [specs/phase5-wra-drought-alerts.md](archive/specs/phase5-wra-drought-alerts.md) | [01 新聞來源](domains/01-news-sources.md) | Phase 5 — WRA 枯旱限水通報 | 🗄️ |
| [specs/phase6-moenv-news-source.md](archive/specs/phase6-moenv-news-source.md) | [01 新聞來源](domains/01-news-sources.md) | Phase 6 — 環境部新聞（MOENV） | ✅ |
| [specs/phase7-loading-animations.md](archive/specs/phase7-loading-animations.md) | [02 新聞圖片](domains/02-news-images.md) | Phase 7 — 載入動畫（Orbs 與圖片骨架） | ✅ |
| [specs/phase8-media-health-news-sources.md](archive/specs/phase8-media-health-news-sources.md) | [01 新聞來源](domains/01-news-sources.md) | Phase 8 — 5 家媒體健康頻道 | ✅ |
| [specs/phase9-opencage-geocode-batch.md](archive/specs/phase9-opencage-geocode-batch.md) | [08 設施地圖](domains/08-facilities-geocode-maps.md) | Phase 9 — 綠色商店 OpenCage 批次定位 | ✅ |
| [specs/pm2-daemon-proliferation.md](archive/specs/pm2-daemon-proliferation.md) | [11 主機維運](domains/11-hosting-ops-incidents.md) | 阻止 PM2 daemon 增生耗盡 NPROC | ✅ |
| [specs/pm2-duplicate-daemon-and-ingestion-memory.md](archive/specs/pm2-duplicate-daemon-and-ingestion-memory.md) | [11 主機維運](domains/11-hosting-ops-incidents.md) | 雙 God Daemon 孤兒清理＋擷取記憶體峰值降低 | ✅ |
| [specs/react-19-hooks-and-manual-rss-sync-resilience.md](archive/specs/react-19-hooks-and-manual-rss-sync-resilience.md) | [12 前端穩定](domains/12-frontend-stability.md) | React 19 Hook 規範＋手動 RSS 同步非同步化 | ✅ |
| [specs/realtime-sync-scheduler-and-pipeline-resilience.md](archive/specs/realtime-sync-scheduler-and-pipeline-resilience.md) | [10 排程CI](domains/10-scheduling-sync-ci.md) | 即時資料排程入庫與部署驗證 | ✅ |
| [specs/recent-news-image-backfill.md](archive/specs/recent-news-image-backfill.md) | [02 新聞圖片](domains/02-news-images.md) | 最近新聞圖片安全回填 | ✅ |
| [specs/recovery-mechanism-as-load.md](archive/specs/recovery-mechanism-as-load.md) | [11 主機維運](domains/11-hosting-ops-incidents.md) | 恢復機制成為負載的三種方式 | ✅ |
| [specs/remove-9-never-succeeded-news-sources.md](archive/specs/remove-9-never-succeeded-news-sources.md) | [01 新聞來源](domains/01-news-sources.md) | 移除 9 個從未成功的來源 | ✅ |
| [specs/remove-cwa-forecasts-dead-pipeline.md](archive/specs/remove-cwa-forecasts-dead-pipeline.md) | [09 資料庫](domains/09-database-data-integrity.md) | 移除 cwa_forecasts 無人讀取的管線 | ✅ |
| [specs/remove-hpa-timeout-sources.md](archive/specs/remove-hpa-timeout-sources.md) | [01 新聞來源](domains/01-news-sources.md) | 移除 5 個永久逾時的國健署 RSS | ✅ |
| [specs/remove-news-article-geolocation-card.md](archive/specs/remove-news-article-geolocation-card.md) | [03 新聞地標](domains/03-news-geo-landmark.md) | 移除新聞內頁「相關地理位置」區塊 | ✅ |
| [specs/remove-orphaned-nearbyweatherbar.md](archive/specs/remove-orphaned-nearbyweatherbar.md) | [12 前端穩定](domains/12-frontend-stability.md) | 刪除孤兒元件 NearbyWeatherBar | ✅ |
| [specs/restore-missing-table-ddl.md](archive/specs/restore-missing-table-ddl.md) | [09 資料庫](domains/09-database-data-integrity.md) | 復原意外遺失的建表 DDL | ✅ |
| [specs/resurrected-dead-code-cleanup.md](archive/specs/resurrected-dead-code-cleanup.md) | [01 新聞來源](domains/01-news-sources.md) | 被復活的死檔案清理 | ✅ |
| [specs/retire-gov-opendata-news-pipeline.md](archive/specs/retire-gov-opendata-news-pipeline.md) | [01 新聞來源](domains/01-news-sources.md) | 退役重複的 gov-opendata 管線 | ✅ |
| [specs/scheduling-health-audit-20260914.md](archive/specs/scheduling-health-audit-20260914.md) | [10 排程CI](domains/10-scheduling-sync-ci.md) | 排程健康度稽核（2026-09-14） | 📚 |
| [specs/seinsights-news-and-events.md](archive/specs/seinsights-news-and-events.md) | [01 新聞來源](domains/01-news-sources.md) | 社企流（新聞＋活動） | ✅ |
| [specs/set-state-in-effect-fix.md](archive/specs/set-state-in-effect-fix.md) | [12 前端穩定](domains/12-frontend-stability.md) | 修正 4 個 set-state-in-effect lint 錯誤 | ✅ |
| [specs/sheltered-workshops-and-presidential-visit.md](archive/specs/sheltered-workshops-and-presidential-visit.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | 庇護工場公益禮盒＋總統府開放參觀 | ✅ |
| [specs/sidebar-intermittent-empty-data-fix.md](archive/specs/sidebar-intermittent-empty-data-fix.md) | [12 前端穩定](domains/12-frontend-stability.md) | 側欄有時沒有資料 | ✅ |
| [specs/sidebar-widgets-unified-error-state-refactor.md](archive/specs/sidebar-widgets-unified-error-state-refactor.md) | [12 前端穩定](domains/12-frontend-stability.md) | 側欄小工具統一 fetch／錯誤處理重構 | ✅ |
| [specs/site-wide-list-pagination-and-granular-search.md](archive/specs/site-wide-list-pagination-and-granular-search.md) | [04 資訊架構](domains/04-ia-navigation-civic.md) | 全站列表預設 30 筆、分頁器、極細搜尋 | ✅ |
| [specs/site-wide-tools-health-audit-and-continuous-monitoring.md](archive/specs/site-wide-tools-health-audit-and-continuous-monitoring.md) | [04 資訊架構](domains/04-ia-navigation-civic.md) | 全站工具健康巡檢與持續監控 | ✅ |
| [specs/social-icons-and-post-drafts.md](archive/specs/social-icons-and-post-drafts.md) | [04 資訊架構](domains/04-ia-navigation-civic.md) | Footer 社群圖示＋社群貼文草稿佇列 | ✅ |
| [specs/SPEC-20260926-EMERGENCY-HOTLINES-QUICK-DIAL-PAGE.md](archive/specs/SPEC-20260926-EMERGENCY-HOTLINES-QUICK-DIAL-PAGE.md) | [07 防災環境](domains/07-tools-disaster-environment-energy.md) | 全臺緊急專線速查與直撥 | ✅ |
| [specs/SPEC-20260926-UDN-WOMAN-FULL-RSS-FEED.md](archive/specs/SPEC-20260926-UDN-WOMAN-FULL-RSS-FEED.md) | [01 新聞來源](domains/01-news-sources.md) | UDN 女子漾改收全站 feed | ✅ |
| [specs/SPEC-20260930-EMERGENCY-SUPPLIES-PREPAREDNESS-CALCULATOR.md](archive/specs/SPEC-20260930-EMERGENCY-SUPPLIES-PREPAREDNESS-CALCULATOR.md) | [07 防災環境](domains/07-tools-disaster-environment-energy.md) | 防災物資：避難包與居家儲備計算機 | ✅ |
| [specs/SPEC-20260930-NPO-ORGANIZATIONS-DEDUP-AND-SCOPE.md](archive/specs/SPEC-20260930-NPO-ORGANIZATIONS-DEDUP-AND-SCOPE.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | NPO 組織去重與範圍收斂 | ✅ |
| [specs/SPEC-20260930-SHELTERED-WORKSHOPS-FACILITY-TYPE-BUGFIX.md](archive/specs/SPEC-20260930-SHELTERED-WORKSHOPS-FACILITY-TYPE-BUGFIX.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | 修正庇護工場 facility_type 寫入／查詢不一致 | ✅ |
| [specs/SPEC-20261007-MOHW-VIO-MEDICAL-SAFETY.md](archive/specs/SPEC-20261007-MOHW-VIO-MEDICAL-SAFETY.md) | [05 醫療食藥](domains/05-tools-medical-food.md) | 衛福部醫事人員性平專區 | ✅ |
| [specs/SPEC-20261007-PM2-RECOVERY-NPROC-RESILIENCE.md](archive/specs/SPEC-20261007-PM2-RECOVERY-NPROC-RESILIENCE.md) | [11 主機維運](domains/11-hosting-ops-incidents.md) | 阻斷 PM2 恢復放大 NPROC 耗盡 | ✅ |
| [specs/SPEC-20261007-SPORTS-COACH-CIVIC-PARTNER.md](archive/specs/SPEC-20261007-SPORTS-COACH-CIVIC-PARTNER.md) | [04 資訊架構](domains/04-ia-navigation-civic.md) | 運動部不適任教練專區 | ✅ |
| [specs/SPEC-20261007-TWREPORTER-NEWS-SOURCE.md](archive/specs/SPEC-20261007-TWREPORTER-NEWS-SOURCE.md) | [01 新聞來源](domains/01-news-sources.md) | 《報導者》 | ✅ |
| [specs/SPEC-HEALTH-20260907-P1P2-NPROC-RESILIENCE.md](archive/specs/SPEC-HEALTH-20260907-P1P2-NPROC-RESILIENCE.md) | [11 主機維運](domains/11-hosting-ops-incidents.md) | 停止在主機上 npm ci、阻斷 NPROC 連鎖 | ✅ |
| [specs/standardize-taiwan-orthography-tai.md](archive/specs/standardize-taiwan-orthography-tai.md) | [13 SEO多語](domains/13-seo-performance-i18n-ai.md) | 全系統「台」→「臺」 | ✅ |
| [specs/taipower-energy-dashboard.md](archive/specs/taipower-energy-dashboard.md) | [07 防災環境](domains/07-tools-disaster-environment-energy.md) | 全台電力概況儀表板 | ✅ |
| [specs/tdx-senior-rail-accessibility-upgrade.md](archive/specs/tdx-senior-rail-accessibility-upgrade.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | TDX 樂齡軌道無障礙，升級無障礙交通（Spec A） | 🟡 |
| [specs/tdx-senior-tourism-and-card-new-tool.md](archive/specs/tdx-senior-tourism-and-card-new-tool.md) | [06 社福文化](domains/06-tools-welfare-family-culture.md) | TDX 樂齡觀光＋敬老卡，新增 senior-friendly（Spec B） | 🟡 |
| [specs/tgos-batch-geocoding-workflow.md](archive/specs/tgos-batch-geocoding-workflow.md) | [08 設施地圖](domains/08-facilities-geocode-maps.md) | TGOS 批次門牌比對工作流 | ✅ |
| [specs/tgos-primary-geocoder.md](archive/specs/tgos-primary-geocoder.md) | [08 設施地圖](domains/08-facilities-geocode-maps.md) | TGOS 成為主要 geocoder | ✅ |
| [specs/tier1-facility-matching.md](archive/specs/tier1-facility-matching.md) | [03 新聞地標](domains/03-news-geo-landmark.md) | Tier 1 醫院比對決定化 | ✅ |
| [specs/tier1-multi-hospital.md](archive/specs/tier1-multi-hospital.md) | [03 新聞地標](domains/03-news-geo-landmark.md) | Tier 1 必須唯一識別一家醫院，否則放棄 | ✅ |
| [specs/tool-data-sources-fallback-and-integrity.md](archive/specs/tool-data-sources-fallback-and-integrity.md) | [04 資訊架構](domains/04-ia-navigation-civic.md) | 工具資料源備援與自動同步 | ✅ |
| [specs/twinkle-hub-food-drug-tools.md](archive/specs/twinkle-hub-food-drug-tools.md) | [05 醫療食藥](domains/05-tools-medical-food.md) | Twinkle Hub 醫療食安工具補完 | ✅ |
| [specs/uiux-seo-lighthouse-remediation.md](archive/specs/uiux-seo-lighthouse-remediation.md) | [13 SEO多語](domains/13-seo-performance-i18n-ai.md) | UI/UX 與 SEO 精修（依 Lighthouse 基準） | ✅ |
| [specs/universal-outbound-utm-and-backfill-resilience.md](archive/specs/universal-outbound-utm-and-backfill-resilience.md) | [13 SEO多語](domains/13-seo-performance-i18n-ai.md) | 全站外連 UTM 規範化與 OG 回填暫態防禦 | ✅ |
| [specs/watchdog-god-daemon-cmdline-match-bug.md](archive/specs/watchdog-god-daemon-cmdline-match-bug.md) | [11 主機維運](domains/11-hosting-ops-incidents.md) | Watchdog 在 PM2 v7 永遠找不到 God Daemon | ✅ |
| [specs/watchdog-reap-must-protect-live-app-ancestors.md](archive/specs/watchdog-reap-must-protect-live-app-ancestors.md) | [11 主機維運](domains/11-hosting-ops-incidents.md) | reapStragglers 必須保護活著 app 的祖先 | ✅ |
| [specs/water-outages-and-disaster-resilience-expansion.md](archive/specs/water-outages-and-disaster-resilience-expansion.md) | [07 防災環境](domains/07-tools-disaster-environment-energy.md) | 水資源與防災線：停水地圖、IoT 淹水、土石流圖層 | ✅ |
| [specs/water-outages-leaflet-shared-controller.md](archive/specs/water-outages-leaflet-shared-controller.md) | [08 設施地圖](domains/08-facilities-geocode-maps.md) | 停水地圖改用共用 MapViewController | ✅ |
| [specs/water-outages-live-ingestion-gap.md](archive/specs/water-outages-live-ingestion-gap.md) | [07 防災環境](domains/07-tools-disaster-environment-energy.md) | 停水新表從未接上即時擷取 | ✅ |
| [specs/weather-alerts-and-nav-restructure.md](archive/specs/weather-alerts-and-nav-restructure.md) | [07 防災環境](domains/07-tools-disaster-environment-energy.md) | 氣象警報、雨量定位與導覽重整 | ✅ |
| [specs/weather-widget-stale-and-precision-bug-fix.md](archive/specs/weather-widget-stale-and-precision-bug-fix.md) | [12 前端穩定](domains/12-frontend-stability.md) | 在地天氣：距離未格式化＋從不自動刷新 | ✅ |
| [specs/wra-reservoir-and-water-level-catalog-enrichment.md](archive/specs/wra-reservoir-and-water-level-catalog-enrichment.md) | [07 防災環境](domains/07-tools-disaster-environment-energy.md) | 水庫與水位站目錄補強＋SVG 量尺 | ✅ |
| [specs/wra-single-writer.md](archive/specs/wra-single-writer.md) | [01 新聞來源](domains/01-news-sources.md) | WRA 改走單一寫入者 | 🗄️ |
| [specs/zod-import-schema-validation.md](archive/specs/zod-import-schema-validation.md) | [09 資料庫](domains/09-database-data-integrity.md) | 匯入腳本導入 Zod 驗證 | ✅ |
| [tickets/TICKET-20260926-UDN-WOMAN-FULL-RSS-FEED.md](archive/tickets/TICKET-20260926-UDN-WOMAN-FULL-RSS-FEED.md) | [01 新聞來源](domains/01-news-sources.md) | UDN 女子漾改收全站 feed | ✅ |
| [tickets/TICKET-20260930-EMERGENCY-SUPPLIES-PREPAREDNESS-CALCULATOR.md](archive/tickets/TICKET-20260930-EMERGENCY-SUPPLIES-PREPAREDNESS-CALCULATOR.md) | [07 防災環境](domains/07-tools-disaster-environment-energy.md) | 防災物資：避難包與居家儲備計算機 | ✅ |
| [tickets/TICKET-20261007-MOHW-VIO-MEDICAL-SAFETY.md](archive/tickets/TICKET-20261007-MOHW-VIO-MEDICAL-SAFETY.md) | [05 醫療食藥](domains/05-tools-medical-food.md) | 衛福部醫事人員性平專區 | ✅ |
| [tickets/TICKET-20261007-PM2-RECOVERY-NPROC-RESILIENCE.md](archive/tickets/TICKET-20261007-PM2-RECOVERY-NPROC-RESILIENCE.md) | [11 主機維運](domains/11-hosting-ops-incidents.md) | 阻斷 PM2 恢復放大 NPROC 耗盡 | ✅ |
| [tickets/TICKET-20261007-SPORTS-COACH-CIVIC-PARTNER.md](archive/tickets/TICKET-20261007-SPORTS-COACH-CIVIC-PARTNER.md) | [04 資訊架構](domains/04-ia-navigation-civic.md) | 運動部不適任教練專區 | ✅ |
| [tickets/TICKET-20261007-TWREPORTER-NEWS-SOURCE.md](archive/tickets/TICKET-20261007-TWREPORTER-NEWS-SOURCE.md) | [01 新聞來源](domains/01-news-sources.md) | 《報導者》 | ✅ |

共 190 份。
