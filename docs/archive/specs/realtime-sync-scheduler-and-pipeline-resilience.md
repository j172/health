# 即時資料排程同步與 CI/CD 管線強韌化規格書 (SPEC)

## 1. 概述 (Overview)

本規格書依循全站最高架構準則 **「資料都先入 DB，讀 DB 資料，不直接對接 API」**，為全站即時與動態開放資料（YouBike 2.0 即時車位、臺北捷運即時營運與電梯公告、農業部作物病蟲害即時預警、書籍推薦每日排行榜）實作常態性後端排程入庫機制，並強化前台軟性降級防護與 GitHub Actions FTPS 部署驗證管線。

---

## 2. 模組規格與同步策略 (Synchronization Taxonomy)

| 模組名稱 | 檔案路徑 | 排程頻率 (Cron) | 目標資料表 | 外部來源端點 | 處理策略與容錯 |
|---|---|---|---|---|---|
| **YouBike 2.0 即時車位** | `lib/server/youbike/runSync.ts` | 每 5 分鐘 (`*/5 * * * *`) | `youbike_stations` | 雙北桃竹交通局 / OpenAPI | 批次抓取雙北桃竹即時車位；單一 SQL 批次 `INSERT ... ON DUPLICATE KEY UPDATE`；若某縣市 API 異常，保留 DB 原有資料，若超過 15 分鐘未更新前台標註「更新延遲」。 |
| **臺北捷運即時公告** | `lib/server/metro/runSync.ts` | 每 30 分鐘 (`0,30 * * * *`) | `metro_alerts` | 臺北大眾捷運公司 (Big5 CSV rid: `649c44eb...`) | 即時下載 Big5 CSV，解碼為 UTF-8，增量寫入 `metro_alerts` (`uq_metro_alert` 避免重複)。 |
| **作物病蟲害即時預警** | `lib/server/pest/runSync.ts` | 每 6 小時 (`12 0,6,12,18 * * *`) | `pest_alerts` | 農業部動植物防檢署 (UnitId: `4KDR5HtfkTBp`) | 增量寫入 `pest_alerts`；首頁與新聞側邊欄 Widget 僅展示「14 天內最新」或「達中高級警戒」警訊（上限 5 則），其餘留於工具頁歷史歸檔。 |
| **書籍推薦每日榜單** | `lib/server/books/runSync.ts` | 每日 05:30 (`30 5 * * *`) | `latest_books` | 博客來 (4 榜)、誠品 (27 類)、TAAZE (10 類 RSS) | 每日離峰排程抓取，各頻道保留最新 Top 20 本，保持全站約 800~1,000 本推薦，自動清理過期下架書籍。 |

---

## 3. 前台軟性降級 (Frontend Soft Fallback)

1. **YouBike 2.0 狀態判斷** (`components/Tools/YoubikeContent.tsx`)：
   - 計算目前時間與 `station.updated_at_source` 的時間差。
   - 若時間差大於 15 分鐘（900 秒），於卡片上呈現黃色「資料更新延遲」警示標籤，但維持站點顯示、即時可借可還數參考值與 Google 地圖導航。
2. **病蟲害示警過濾** (`components/Tools/PestAlertSidebarWidget.tsx`)：
   - 僅篩選發布時間在 14 天內，或其監測數據包含「警戒」、「防治」、「重度」關鍵字之項目，最多呈現 5 則。

---

## 4. CI/CD 部署管線強化 (`deploy-ftps.yml`)

1. **移除硬編碼 Anycast IP**：
   - 將 `curl --resolve "health.j172.tw:443:103.21.221.12"` 移除，直接使用標準系統 DNS 解析。
2. **重試與容錯**：
   - 驗證新聞卡片圖檔與 JS Chunks 之步驟加入 `continue-on-error: true`，避免 CDN 邊緣節點暫時性風控反阻擋 runner 造成部署誤報中斷。
