# 全台開放資料擴充與工具整併規格書 (SPEC)

## 1. 概述 (Overview)

本規格書定義並規範本站（j172tw Healthz）全台開放資料大擴充、長照雙工具整併、捷運營運公告、北北桃竹公共自行車（YouBike 2.0）、農業部作物病蟲害即時預警、全台動物醫院查詢，以及書籍推薦改版之架構與實作標準。

### 核心架構準則
1. **「資料都先入 DB，讀 DB 資料，不直接對接 API」**：
   - 外部第三方資料源（包含即時動態資料）均透過伺服器端同步器（Sync scripts / cron jobs）寫入 MySQL 8.0 資料表，前端及 API Routes 嚴格自本站資料庫讀取，徹底杜絕前端直接外連第三方造成之阻擋、CORS、超時與限流風險。
2. **「繁體中文首字筆劃與音序定序 (First-Character Collation)」**：
   - 全站 `TOOL_CATALOG`、頂部導航選單（`SiteNav`）及頁尾（`SiteFooter`）均使用繁體中文 `localeCompare('zh-Hant')` 標準進行排序。
3. **「SEO 與 URL 權威性保護」**：
   - 整併之工具（長照特約 `/tools/ltc-contracted`）配置 HTTP 308 Permanent Redirect 至統一權威路徑 `/tools/long-term-care`，保持外部反向連結與搜尋引擎權重。

---

## 2. 來源資料集與分類矩陣 (Source Datasets Taxonomy)

| 項次 | 業務範疇 | 資料來源機關 | 原始資料端點 / 格式 | 入庫目標資料表 / 處理方式 |
|---|---|---|---|---|
| **1** | 醫療院所擴充 | 臺北/新北/桃園/高雄衛生局 | 臺北 4 組、新北 1 組、桃園 1 組、高雄 1 組 CSV/JSON | `facilities` (`facility_type='clinic'`)，依地址/代碼匹配座標 |
| **2** | 捷運資訊公告 | 臺北大眾捷運公司 | Big5 CSV (rid `649c44eb...`) | 新增 `metro_alerts` 資料表，UTF-8 解碼入庫 |
| **3** | 公共自行車 (YouBike) | 臺北/新北/桃園/新竹交通局 | 北北桃竹 4 直轄市即時 JSON | 新增 `youbike_stations` 資料表，即時站點車位動態入庫 |
| **4** | 長照雙工具整併 | 衛福部及雙北/桃園/高雄 | 中央 2 組 + 地方 8 組 CSV/JSON | 統一至 `/tools/long-term-care`，`facilities` (`facility_type='long_term_care'`) |
| **5, 8** | 幼兒園與補習班 | 雙北/桃園教育局 | 新北 4 組、桃園 2 組、臺北 2 組 | 幼兒園入 `kindergartens`；補習班入 `cram-schools`；親子中心入兒少工具 |
| **6** | 寵物認領養 | 臺北/桃園/農業部 | 臺北 4 組、桃園 2 組、農業部 3 組 | `pet_adoptions`，定時增量更新 |
| **7** | 成人健檢 | 臺北市衛生局 | rid `cb3fdf1f...` | `facilities` (`facility_type='health_check'`) |
| **9** | 老人福利機構 | 新北/高雄社會局 | 新北 3 組、高雄 2 組 JSON | `facilities` (`facility_type='elder_welfare'`) |
| **10** | 身障福利機構 | 新北市社會局 | 新北 3 組 JSON | `facilities` (`facility_type='disability_welfare'`) |
| **11** | 防災避難地圖 | 新北市消防局 | 25e439ab JSON | `facilities` (`facility_type='disaster_shelter'`) |
| **12, 14** | 托嬰中心 | 新北市社會局 | 4182946c JSON | `facilities` (`facility_type='child_welfare_nursery'`) |
| **13** | 親子館/兒少福利 | 新北/桃園社會局 | 新北 2 組、桃園 1 組 | `facilities` (`facility_type='child_welfare_center'`) |
| **15** | 公共藝術 | 新北市文化局 | 47ccf63f JSON | `public_arts` / `facilities` (`facility_type='public_art'`) |
| **16** | 文化資產地圖 | 新北市文化局 | 新北 3 組 JSON | `facilities` (`facility_type='heritage'`) |
| **17** | 藝文活動 | 新北市文化局 | 新北 2 組 JSON | `cultural_events` 展演資料表 |
| **18** | 清潔隊部 | 新北市環保局 | 47aced4b JSON | `facilities` (`facility_type='cleaning_squad'`) |
| **19** | 環保旅店 | 新北市環保局 | c9fe0056 JSON | `facilities` (`facility_type='green_hotel'`) |
| **20** | 環保餐館 | 新北市環保局 | e90d14f8 JSON | `facilities` (`facility_type='green_restaurant'`) |
| **21** | 綠色商店 | 新北市環保局 | 6ccd0274 JSON | `facilities` (`facility_type='green_shop'`) |
| **22** | 桃園門牌坐標庫 | 桃園市政府資科局 | ec47dbd5 坐標資料 | 後端高精 Geocoding 比對字典，回填桃園無坐標機構 |
| **23** | 藥局查詢 | 桃園市衛生局 | 2cb206f2 JSON | `facilities` (`facility_type='pharmacy'`) |
| **24** | 作物病蟲害示警 | 農業部動植物防檢署 | 4KDR5HtfkTBp JSON | 新增 `pest_alerts` 資料表，側邊欄 Widget + 便民服務工具 |
| **25** | 動物醫院與獸醫診所 | 農業部動植物防檢署 | UnitId 078 (2,078 筆全台獸醫機構) | 獨立工具 `/tools/vet-clinics`，`facilities` (`facility_type='vet_clinic'`) |
| **26** | 書籍推薦改版 | TAAZE 讀冊生活 | 10 組 RSS Feeds (XML) | `latest_books` 表新增平台 `taaze`，更名「書籍推薦」 |

---

## 3. 資料庫結構 (Database Schema / TABLE_DDL)

### 3.1 捷運營運與無障礙公告 (`metro_alerts`)
```sql
CREATE TABLE IF NOT EXISTS metro_alerts (
  id BIGINT NOT NULL AUTO_INCREMENT,
  external_id VARCHAR(50) NOT NULL,
  line_name VARCHAR(50) NOT NULL,
  station_name VARCHAR(50) NOT NULL,
  alert_title VARCHAR(255) NOT NULL,
  alert_content TEXT NOT NULL,
  alert_type VARCHAR(50) NOT NULL DEFAULT 'elevator',
  alert_time DATETIME NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_metro_alert (external_id),
  KEY idx_metro_station (station_name),
  KEY idx_metro_line (line_name),
  KEY idx_metro_time (alert_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.2 公共自行車即時站點車位 (`youbike_stations`)
```sql
CREATE TABLE IF NOT EXISTS youbike_stations (
  id BIGINT NOT NULL AUTO_INCREMENT,
  city_code VARCHAR(10) NOT NULL,
  station_no VARCHAR(50) NOT NULL,
  name_tw VARCHAR(100) NOT NULL,
  district_tw VARCHAR(50) NOT NULL,
  address_tw VARCHAR(255) NOT NULL,
  lat DECIMAL(10,7) NOT NULL,
  lng DECIMAL(10,7) NOT NULL,
  total_spaces INT NOT NULL DEFAULT 0,
  available_bikes INT NOT NULL DEFAULT 0,
  available_ebikes INT NOT NULL DEFAULT 0,
  empty_spaces INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  updated_at_source DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_youbike_station (city_code, station_no),
  KEY idx_youbike_geo (lat, lng),
  KEY idx_youbike_city_district (city_code, district_tw)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.3 作物病蟲害即時預警 (`pest_alerts`)
```sql
CREATE TABLE IF NOT EXISTS pest_alerts (
  id BIGINT NOT NULL AUTO_INCREMENT,
  subject_name VARCHAR(100) NOT NULL,
  monitor_type VARCHAR(50) NOT NULL,
  alert_time DATETIME NOT NULL,
  target_crops VARCHAR(255) NULL,
  alert_data_json LONGTEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_pest_alert_time (alert_time),
  KEY idx_pest_subject (subject_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 4. 路由與跳轉設計 (Routing & Redirects)

1. `/tools/ltc-contracted` 透過 `next.config.js` 的 `redirects()` 回傳 HTTP 308 永久跳轉至 `/tools/long-term-care`：
   ```javascript
   {
     source: "/tools/ltc-contracted",
     destination: "/tools/long-term-care",
     permanent: true,
   }
   ```
2. 新增路由：
   - `/tools/youbike`: 北北桃竹公共自行車即時查詢
   - `/tools/metro-alerts`: 捷運營運與無障礙公告
   - `/tools/pest-alerts`: 作物病蟲害即時示警
   - `/tools/vet-clinics`: 全台動物醫院與獸醫診所查詢
3. 更名路由維持：
   - `/tools/latest-books`（保持 URL 相容，全站標題更名為「書籍推薦」）

---

## 5. 側邊欄與導航重構 (Sidebar & Nav Architecture)

1. **`NewsSidebar.tsx`**：
   - 在水情/疾管署監測區塊後方新增 `<PestAlertSidebarWidget />`，自動讀取 `pest_alerts`，若有警報顯示黃/紅燈標籤與受影響作物摘要，點擊導向 `/tools/pest-alerts`。
2. **`TOOL_CATALOG` 與 `SiteNav.tsx`**：
   - 移除獨立之 `ltc-contracted` 連結，統一為 `long-term-care`（長照服務機構查詢）。
   - 在 `public-facility`（便民服務）中加入 4 款新工具：
     - `metro-alerts`（捷運營運與電梯公告）
     - `pest-alerts`（作物病蟲害即時示警）
     - `vet-clinics`（全台動物醫院查詢）
     - `youbike`（公共自行車即時資訊）
   - 全面依繁體中文首字筆劃音序重排。
