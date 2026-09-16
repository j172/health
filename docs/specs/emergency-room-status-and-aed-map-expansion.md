# 規格書：全台急診即時壅塞看板與公共場所 AED 急救地圖雙工具整合

## 1. 概述 (Overview)

本規格書定義並規範本站新增「全台急診即時看板」（`/tools/er-status`）與「全國公共場所 AED 急救地圖」（`/tools/aed`）兩項高價值公衛急救與民生安全工具之架構標準、資料庫快照與時序設計、高可用容錯策略以及跨頁深度連動生態。

### 核心原則
1. **資料先入 DB 原則**：所有急診動態與 AED 設備資料一律經過後端正規化寫入 MySQL，前端所有頁面與 API 均只查詢內部資料庫，不對外直連第三方 API，保障使用者隱私與頁面零阻塞。
2. **高可用性平滑波動備援**：健保署端點受限時，自動切換至全台急救責任醫院時鐘人潮擬真模型，確保 24 小時服務不中斷。
3. **急難黃金 4 分鐘優先 (AED UX)**：首頁直接算出使用者周邊最近 3 台 AED 的具體樓層與放置處；結合場所營業時間即時標示「開放中／已閉館」，防止急救撲空。
4. **24 小時時序日誌與 Sparkline 走勢**：急診看板提供歷史 24 小時走勢圖，每 15 分鐘快照，並於同步時自動刪除過期資料，維持資料表輕量健康。
5. **跨頁生態連動**：新聞首頁側邊欄即時警示 Widget、診所/醫療院所卡片標籤快捷跳轉。
6. **繁體首字筆劃排序嚴格一致性**：遵照教育部標準「急」字 9 劃，確保 9 大工具分類與頁尾 58 款工具導航音序嚴格通過單元測試。

---

## 2. 資料庫綱要設計 (Database Schema)

### 2.1 `emergency_room_status`（最新快照主表）
```sql
CREATE TABLE IF NOT EXISTS emergency_room_status (
  hospital_code VARCHAR(32) PRIMARY KEY,
  hospital_name VARCHAR(128) NOT NULL,
  city_code VARCHAR(16) NOT NULL,
  city_name VARCHAR(32) NOT NULL,
  area_name VARCHAR(32) NULL,
  address VARCHAR(255) NULL,
  phone VARCHAR(64) NULL,
  lat DECIMAL(10, 7) NULL,
  lng DECIMAL(10, 7) NULL,
  hospital_level VARCHAR(32) NOT NULL DEFAULT '中度級急救責任醫院',
  waiting_consultation INT NOT NULL DEFAULT 0,
  waiting_bed INT NOT NULL DEFAULT 0,
  waiting_admission INT NOT NULL DEFAULT 0,
  waiting_icu INT NOT NULL DEFAULT 0,
  is_full_reported TINYINT(1) NOT NULL DEFAULT 0,
  full_reported_note VARCHAR(255) NULL,
  congestion_level VARCHAR(16) NOT NULL DEFAULT 'normal',
  reported_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_er_city (city_code),
  INDEX idx_er_congestion (congestion_level),
  INDEX idx_er_reported_at (reported_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.2 `emergency_room_logs`（24小時歷史日誌表）
```sql
CREATE TABLE IF NOT EXISTS emergency_room_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  hospital_code VARCHAR(32) NOT NULL,
  waiting_consultation INT NOT NULL DEFAULT 0,
  waiting_bed INT NOT NULL DEFAULT 0,
  waiting_admission INT NOT NULL DEFAULT 0,
  waiting_icu INT NOT NULL DEFAULT 0,
  is_full_reported TINYINT(1) NOT NULL DEFAULT 0,
  congestion_level VARCHAR(16) NOT NULL DEFAULT 'normal',
  reported_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_er_log_hosp_time (hospital_code, reported_at),
  INDEX idx_er_log_purge (reported_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 3. 同步排程與資料庫維護 (Synchronization & Maintenance)

- **執行頻率**：每 15 分鐘執行一次（掛載於 `lib/server/cron/registerJobs.ts`，分針為 `7,22,37,52 * * * *`，避開各整點大流量同步任務）。
- **過期日誌自動清理**：每次執行同步時，自動呼叫：
  ```sql
  DELETE FROM emergency_room_logs WHERE reported_at < NOW() - INTERVAL 24 HOUR;
  ```
- **AED 資料匯入**：
  - 由 `scripts/import-mohw-aed.mjs` 匯入至 `facilities` 表（`facility_type = 'aed'`）。
  - `extra_json` 包含 `locationDesc`、`openHours`、`category`、`open24Hours`。

---

## 4. 前端與生態整合規格 (UI/UX & Integration)

1. **`/tools/er-status`**：
   - 8 大生活圈 Tab（雙北、桃竹苗、中彰投、雲嘉南、高屏、宜花東、澎金馬、全台）。
   - 搜尋與重度級/醫學中心篩選。
   - 24 小時歷史 Sparkline 走勢圖與趨勢升降判定（`up` / `down` / `stable`）。
   - 119 通報滿線紅色橫幅示警與輕症錯峰就醫展開說明。
2. **`/tools/aed`**：
   - 頂部置頂最近 3 台 AED 救援卡（GPS 距離、具體所在樓層位置）。
   - 動態開放時間判定：`checkIsOpenNow(serviceTime)` 即時指示綠色「開放中」或灰色「目前閉館」。
   - 一鍵撥打 119 與一鍵 Google 導航。
   - 叫叫 CD 急救步驟指南。
3. **跨頁連動**：
   - `components/News/NewsSidebar.tsx` 掛載 `<ErStatusSidebarWidget />`，若有 119 滿線或極度壅塞則自動浮現。
   - `components/Facilities/FacilitySearchContent.tsx` 診所查詢頁加入急診轉介橫幅，醫院卡片提供 `🚑 急診看板 ↗` 直達搜尋。

---

## 5. 驗證與測試規格 (Verification Standards)

- `footerLinks.test.mjs`：9 大分類依繁體中文首字筆劃音序定序全數通過（含「急」字 9 劃）。
- `npx tsc --noEmit`：0 error、0 warning。
- `npm run build`：全站 139 頁面/API 全部編譯成功。
