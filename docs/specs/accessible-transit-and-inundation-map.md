# Phase 2 跨部會開放資料雙旗艦工具規格書：全台無障礙交通地圖與積淹水即時感測地圖

- **作者**：Antigravity Agent
- **日期**：2026-09-16
- **狀態**：Approved & In Progress
- **關聯 Issue**：TBD

---

## 1. 背景與目標

銜接 Phase 1 蔬果農藥看板與全台戶外安全指數之成功交付，本階段（Phase 2）深入交通部 TDX 與經濟部水利署 IoT 兩大高價值開放資料源，交付全站第 61、62 款公衛民生工具：

1. **全台無障礙交通地圖 (`/tools/accessible-transit`)**
   - 解決行動不便者、輪椅族、推嬰兒車家庭及高齡長者的外出移動痛點。
   - 結合交通部 TDX 低地板公車即時比例、捷運與鐵路無障礙電梯設備狀態、全台 22 縣市復康巴士與通用計程車預約專線。
   - 歸屬分類：`transport-energy`（交通與能源）。

2. **全台積淹水即時感測地圖 (`/tools/inundation-map`)**
   - 整合水利署 IoT 路面積淹水即時感測器（公分級水深）、河川水位站一至三級防汛警戒及 NCDR 避難收容指引。
   - 提供豪大雨、颱風期間行車低窪路段避災避險指引。
   - 歸屬分類：`disaster-safety`（防災與安全示警）。

---

## 2. 資料庫架構 (MySQL Schema)

### 2.1 無障礙交通路線與據點 (`accessible_transit_routes` & `accessible_transit_facilities`)
```sql
CREATE TABLE IF NOT EXISTS accessible_transit_routes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  county VARCHAR(32) NOT NULL,
  route_id VARCHAR(64) NOT NULL,
  route_name VARCHAR(128) NOT NULL,
  operator_name VARCHAR(128) NOT NULL,
  low_floor_ratio DECIMAL(5, 2) NOT NULL DEFAULT 0.00 COMMENT '低地板公車比率 0~100%',
  is_all_low_floor TINYINT(1) NOT NULL DEFAULT 0,
  wheelchair_slots INT NOT NULL DEFAULT 2,
  description TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_county (county),
  INDEX idx_route_name (route_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS accessible_transit_facilities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  county VARCHAR(32) NOT NULL,
  system_type VARCHAR(32) NOT NULL COMMENT 'metro / rail / hsrail / rehab_bus / accessible_taxi',
  station_or_agency VARCHAR(128) NOT NULL,
  facility_name VARCHAR(128) NOT NULL,
  service_phone VARCHAR(64) NULL,
  booking_rules TEXT NULL,
  features_json JSON NULL,
  lat DECIMAL(10, 7) NULL,
  lng DECIMAL(10, 7) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_county_system (county, system_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.2 水利署路面淹水感測器 (`wra_inundation_sensors`)
```sql
CREATE TABLE IF NOT EXISTS wra_inundation_sensors (
  sensor_id VARCHAR(64) PRIMARY KEY,
  sensor_name VARCHAR(128) NOT NULL,
  county VARCHAR(32) NOT NULL,
  township VARCHAR(32) NOT NULL,
  address VARCHAR(255) NULL,
  water_depth_cm DECIMAL(5, 1) NOT NULL DEFAULT 0.0,
  warning_depth_cm DECIMAL(5, 1) NOT NULL DEFAULT 10.0,
  alert_level VARCHAR(20) NOT NULL DEFAULT 'normal' COMMENT 'normal, warning, critical',
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'WRA IoT',
  recorded_at DATETIME NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_county_town (county, township),
  INDEX idx_alert_level (alert_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 3. API 規範

### 3.1 `GET /api/accessible-transit`
- **Query Params**: `county` (選填), `systemType` (選填), `query` (關鍵字)
- **Response**:
  ```json
  {
    "ok": true,
    "totalRoutes": 120,
    "totalFacilities": 45,
    "routes": [...],
    "facilities": [...],
    "hotlines": [...]
  }
  ```

### 3.2 `GET /api/inundation-map`
- **Query Params**: `county` (選填), `onlyAlert` (boolean)
- **Response**:
  ```json
  {
    "ok": true,
    "sensors": [...],
    "riverAlerts": [...],
    "shelters": [...],
    "summary": {
      "totalSensors": 85,
      "alertCount": 3,
      "criticalCount": 0
    }
  }
  ```

---

## 4. UI/UX 與跨頁導流設計

1. **無障礙交通地圖**：
   - 縣市快速切換、低地板公車即時率篩選、輪椅坡道與升降設備清單。
   - 復康巴士一鍵撥號與長照就醫補助指引卡片。
   - 導流 Banner：與 `/tools/metro-alerts`、`/tools/long-term-care`、`/tools/disability-atm` 互通。

2. **積淹水即時感測地圖**：
   - 台灣本島地圖視覺化與警示燈號（綠色安全、橙色警戒 10-30cm、紅色嚴重積水 >30cm）。
   - 周邊防災避難學校與安全收容點一覽。
   - 導流 Banner：與 `/tools/water-conditions`、`/tools/disaster-map` 互通。
