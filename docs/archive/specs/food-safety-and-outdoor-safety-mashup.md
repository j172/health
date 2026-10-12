# 規格書：食安農藥殘留檢驗透明看板與全台戶外運動安全指數雙旗艦整合

## 1. 概述 (Overview)

本規格書定義並規範本站新增「全台蔬果農藥殘留與食安檢驗透明看板」（`/tools/food-safety`）與「全台戶外運動與放電安全指數」（`/tools/outdoor-safety`）之資料結構、入庫排程、綜合評估演算法與跨頁深度連動生態。

### 核心原則
1. **資料先入 DB 原則**：所有農業部抽檢數據、蔬果毒理指標、環境氣象疾病綜合指數全數入庫 MySQL，前端只讀 DB，確保 24 小時高效能、高可用、零外連依賴。
2. **基底真實種子防護**：收錄台灣最常食用之 60+ 款蔬果（葉菜類、根莖類、果菜類、水果類）之官方質譜快檢基準合格率、常見違規超標農藥及官方核定之「黃金流水清洗指南」。
3. **跨維度環境流行病學指數聚合 (Outdoor Safety Algorithm)**：
   - 整合即時氣溫與相對濕度（計算氣象署中暑危險熱指數 Heat Index）。
   - 整合空氣品質 AQI / PM2.5 / 臭氧 O3 濃度。
   - 整合紫外線 UV 指數。
   - 整合登革熱與呼吸道傳染病群聚警戒。
   - 產出四大族群（🏃 跑者/單車、👶 親子放電、👵 銀髮長輩、🦟 防蚊示警）專屬時段與防護策略。
4. **全站筆劃排序一致性**：
   - `food-safety` 導航名「食安檢驗看板」（首字「食」，9 劃），歸入 `registry`（藥品食品登錄查詢）。
   - `outdoor-safety` 導航名「戶外安全指數」（首字「戶」，4 劃），歸入 `environment`（環境品質與綠色生活），於 `STROKE_COUNTS` 補充 `"戶": 4`。

---

## 2. 資料庫綱要設計 (Database Schema)

### 2.1 `food_pesticide_standards`（蔬果農藥抽檢基準與毒理表）
```sql
CREATE TABLE IF NOT EXISTS food_pesticide_standards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(32) NOT NULL,            -- 葉菜類 / 水果類 / 瓜果類 / 根莖類 / 豆菜類
  crop_name VARCHAR(64) NOT NULL,           -- 蔬果品名（如：高麗菜、草莓、菠菜、小黃瓜）
  crop_name_en VARCHAR(64) NULL,
  common_names VARCHAR(128) NULL,           -- 別名 / 俗稱
  pass_rate DECIMAL(5, 2) NOT NULL,         -- 官方質譜抽驗合格率 (%)
  sample_count INT NOT NULL DEFAULT 0,      -- 抽樣件數
  risk_level VARCHAR(16) NOT NULL DEFAULT 'low', -- low (綠) / moderate (黃) / high (紅)
  top_pesticides JSON NULL,                 -- 常見超標農藥陣列 [{ name, purpose, toxicity }]
  washing_guide TEXT NOT NULL,              -- 農業部專家推薦正確清洗指引
  seasonal_months VARCHAR(64) NULL,         -- 盛產季節月份
  avg_wholesale_price DECIMAL(7, 2) NULL,   -- 當季平均批發行情價 (元/公斤)
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_crop_name (crop_name),
  INDEX idx_food_category (category),
  INDEX idx_food_risk (risk_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.2 `food_pesticide_records`（農業部抽檢不合格歷史明細）
```sql
CREATE TABLE IF NOT EXISTS food_pesticide_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  crop_name VARCHAR(64) NOT NULL,
  origin_location VARCHAR(128) NULL,        -- 產地 / 採樣地點
  inspection_date DATE NOT NULL,            -- 抽驗日期
  pesticide_name VARCHAR(64) NOT NULL,      -- 檢出農藥名稱
  detected_value DECIMAL(8, 4) NOT NULL,    -- 檢出殘留量 (ppm)
  standard_limit DECIMAL(8, 4) NOT NULL,    -- 法規容許量 (ppm)
  over_ratio DECIMAL(8, 2) NOT NULL,        -- 超標倍數
  action_status VARCHAR(64) NULL,           -- 裁處狀態（下架 / 沒入銷毀 / 裁罰）
  created_at DATETIME NOT NULL,
  INDEX idx_pesticide_crop (crop_name),
  INDEX idx_pesticide_date (inspection_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.3 `outdoor_safety_indices`（各縣市戶外活動安全指數快照）
```sql
CREATE TABLE IF NOT EXISTS outdoor_safety_indices (
  city_code VARCHAR(16) NOT NULL,
  city_name VARCHAR(32) NOT NULL,
  overall_score INT NOT NULL,               -- 0~100 綜合安全分數
  safety_level VARCHAR(16) NOT NULL,        -- excellent / good / caution / hazardous
  heat_risk_level VARCHAR(16) NOT NULL,     -- 熱傷害風險：注意 / 警戒 / 危險
  aqi_value INT NOT NULL DEFAULT 0,
  pm25_value DECIMAL(6, 2) NOT NULL DEFAULT 0,
  uv_index DECIMAL(4, 1) NOT NULL DEFAULT 0,
  temperature DECIMAL(4, 1) NOT NULL DEFAULT 25.0,
  humidity INT NOT NULL DEFAULT 60,
  runner_best_window VARCHAR(64) NULL,      -- 跑者最佳時段（如 "05:30 - 08:00"）
  family_park_recommendation VARCHAR(128) NULL,
  dengue_risk_level VARCHAR(16) NOT NULL DEFAULT 'low',
  advisory_tips JSON NULL,                  -- 綜合指引字串清單
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (city_code),
  INDEX idx_outdoor_score (overall_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 3. 演算法與業務邏輯 (Algorithms & Logic)

### 3.1 戶外綜合安全評分公式 (Outdoor Safety Score Algorithm)
滿分為 100 分，依環境危害程度扣分：
- **空品扣分 (AQI Penalty, 最高扣 40 分)**：
  - AQI <= 50: 扣 0 分
  - AQI 51~100: 扣 10 分
  - AQI 101~150: 扣 25 分
  - AQI > 150: 扣 40 分
- **熱指數 / 溫差扣分 (Thermal Penalty, 最高扣 30 分)**：
  - 熱指數係數 = 溫度 + (濕度 - 50) * 0.1
  - 熱指數 >= 40 (危險)：扣 30 分
  - 熱指數 33~39 (警戒)：扣 15 分
  - 氣溫 <= 12°C 或 日夜溫差 > 10°C (心血管警戒)：扣 15 分
- **紫外線扣分 (UV Penalty, 最高扣 20 分)**：
  - UV >= 11 (危險級)：扣 20 分
  - UV 8~10 (過量級)：扣 12 分
  - UV 6~7 (高量級)：扣 5 分
- **蚊媒與疾病扣分 (Disease Penalty, 最高扣 10 分)**：
  - 登革熱警戒里或流感重度流行區：扣 10 分
- **最終安全等級判定**：
  - 85 ~ 100 分：🟢 極佳（適合各族群全天戶外活動）
  - 65 ~ 84 分：🟡 良好（大部分族群適合，敏感族群微調）
  - 45 ~ 64 分：🟠 警戒（建議挑選清晨/傍晚時段，做好防護）
  - 0 ~ 44 分：🔴 危險（非必要避免戶外劇烈運動，改為室內活動）

---

## 4. 跨頁生態深度連動 (Cross-page Integrations)
1. **`/tools/food-nutrition` ➔ `/tools/food-safety`**：
   - 當使用者查詢生鮮食材時，卡片標籤加入「🛡️ 該蔬果農藥殘留合格率與清洗指南 ↗」。
2. **`/tools/aqi` & `/tools/uv` ➔ `/tools/outdoor-safety`**：
   - 頂部加入「🏃 今日戶外運動與放電安全指數看板 ↗」引導橫幅。
