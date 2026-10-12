# Specification: 全台電力概況儀表板（台電＋能源署開放資料整合）

## 0. 背景與範圍

issue #177。整合台電與經濟部能源署 3 份開放資料，做成一頁式全台電力概況儀表板，掛進便民服務（`group: "public-facility"`）。三份資料型態不同，不是像其他便民服務項目那種可定位地點名冊，因此不做地圖，改用表格/清單呈現。

## 1. 資料來源與實測結果更正

實作前依驗收標準第一項要求，先用實際 HTTP 請求驗證了三個資料集（透過 GitHub Actions runner + 正式站 SSH loopback 探測，`databaseId 34370655418`，兩者皆直接取得 HTTP 200，不需經 relay，比照本專案既有 WRA reservoir/water-level 的 in-process 抓取模式，見 `lib/server/wra/fetchReservoirStatus.ts`）。已將更正結果回報至 issue #177 留言（https://github.com/j172/health/issues/177#issuecomment-5644863288）。

| 來源 | Dataset ID / URL | 內容 | 更新頻率 |
|---|---|---|---|
| 台電 | `d006001`<br>`https://service.taipower.com.tw/data/opendata/apply/file/d006001/001.json` | 各機組發電量即時資訊（含外購電力） | ~10 分鐘 |
| 經濟部能源署 | `set_id=55`<br>`https://www.moeaea.gov.tw/ECW/populace/opendata/wHandOpenData_File.ashx?set_id=55` | 全國發電來源配比（台電/民營/汽電共生 %），僅 4 筆 | 極少變動，daily |
| 台電 | `d525001`<br>`https://service.taipower.com.tw/data/opendata/apply/file/d525001/001.csv` | **核電廠周邊輻射偵測站即時劑量率**（見下方更正說明） | ~10 分鐘（各站觀測時間不同步） |

### 1.1 `d006001` 實測欄位

回應為 JSON，頂層 `{DateTime: "2026-09-09T23:20:00", aaData: [...215 rows]}`。每一列所有欄位皆為**字串**：

```json
{"機組類型":"燃氣","機組名稱":"大潭CC#1","裝置容量(MW)":"742.7","淨發電量(MW)":"581.1","淨發電量/裝置容量比(%)":"78.242%","備註":" "}
```

`機組類型` 已知值：燃氣、民營電廠-燃氣、燃煤、民營電廠-燃煤、汽電共生、燃料油、太陽能、風力、水力、儲能、其它再生能源、儲能負載(Energy Storage System Load)。`淨發電量/裝置容量比(%)` 含 `%` 後綴需去除。`備註` 可能標示「歲修」等機組狀態。

### 1.2 `set_id=55` 實測欄位

URL 無副檔名，但實際回應是 **CSV**（`Content-Disposition: attachment`），非 JSON。僅 4 列（台電/民營電廠/汽電共生 + 1 列合計）。欄位：`電力來源, 總裝置容量(數值,MW), 配比(%), 資料所屬機關`。此表幾乎不變，daily 同步即可。

### 1.3 `d525001` 實測結果更正 — 這不是停電資料

**issue 原文猜測 `d525001` 是「計畫性工作停電資料」（分區停電時段），實測後證實此猜測錯誤。**

真實欄位為 CSV：`站名,站號,劑量率(微西弗/小時),日期時間,經度,緯度`。真實範例列：

```
放射試驗室旁,HPIC115,0.057,20260909T233025,121.5916,25.2881
石門分駐所監測站,s101,0.053,20260909T172733,121.567377,25.290809
```

站名分布集中在核一／核二（石門、萬里、金山一帶）與核三（墾丁、恆春一帶，站號多以 `s3` 開頭）周邊，每站皆附即時劑量率（µSv/h）、觀測時間、WGS84 十進位經緯度。**這是核電廠周邊輻射偵測站的即時安全監測資料（安全監測），與分區停電無關。**

因此 issue 原文「不做分區停電的地圖化定位介面」這條 Out of Scope 的前提不成立。改為：三份資料一律以表格/清單呈現，不做地圖——理由不再是「避免停電地圖化」，而是三份資料本身都適合表格呈現，即使 `d525001` 有經緯度，也沒有地圖化的必要（一頁式儀表板的原則不變）。

## 2. 導覽定位

不建立新的頂層導覽分類，掛進既有 `group: "public-facility"`。`catalog.ts` 新增 entry `slug: "power-grid-overview"`，`schemaType: "WebPage"`（非醫療/個人健康指引內容，比照 `earthquakes`/`reservoir-status` 的既有判斷準則，issue #136）。導覽下拉、頁尾欄位、`/tools` 分類皆由 `TOOL_CATALOG` 依 `group` 自動篩選產生，無需另外修改導覽元件。

## 3. 資料模型

三張表皆採「latest-snapshot upsert」慣例（issue Out of Scope 明確排除歷史/趨勢資料庫化），不記錄時間序列，每次同步直接覆蓋前次快照：

```
power_generation_units (          -- d006001，upsert key: unit_name
  id                 BIGINT PK AUTO_INCREMENT
  unit_name          VARCHAR(100) UNIQUE   -- 機組名稱
  unit_type          VARCHAR(50)           -- 機組類型
  capacity_mw        DECIMAL(10,2) NULL    -- 裝置容量(MW)
  net_generation_mw  DECIMAL(10,2) NULL    -- 淨發電量(MW)
  capacity_ratio_pct DECIMAL(6,3) NULL     -- 淨發電量/裝置容量比(%)，已去除 % 後綴
  remark             VARCHAR(255) NULL     -- 備註
  source_datetime    DATETIME NULL         -- 該批資料的來源 DateTime（同批所有列共用）
  synced_at / created_at / updated_at
)

power_generation_mix (            -- set_id=55，upsert key: source_category，僅 ~4 列
  id                 BIGINT PK AUTO_INCREMENT
  source_category    VARCHAR(50) UNIQUE    -- 電力來源（台電/民營電廠/汽電共生/合計）
  capacity_mw        DECIMAL(12,2) NULL    -- 總裝置容量(數值,MW)
  capacity_ratio_pct DECIMAL(6,3) NULL     -- 配比(%)
  data_org           VARCHAR(100) NULL     -- 資料所屬機關
  synced_at / created_at / updated_at
)

power_radiation_stations (        -- d525001，upsert key: station_no
  id                 BIGINT PK AUTO_INCREMENT
  station_no         VARCHAR(50) UNIQUE    -- 站號
  station_name       VARCHAR(100)          -- 站名
  dose_rate_usv_h    DECIMAL(10,4) NULL    -- 劑量率(微西弗/小時)
  recorded_at        DATETIME NULL         -- 日期時間（源格式 YYYYMMDDTHHMMSS）
  lat / lng          DECIMAL(10,7) NULL
  synced_at / created_at / updated_at
)
```

`power_generation_units` 與 `power_radiation_stations` 的 upsert 慣例與既有 `youbike_stations`（latest-snapshot，無時間戳鍵）相同；不採用 `wra_reservoir_status` 的「時間戳入鍵、逐時累積」模式，因為 issue 明確排除歷史資料。

## 4. 同步管線

新模組 `lib/server/power/`：

- `types.ts` — 三個來源的 record 型別
- `fetchGenerationUnits.ts` — `httpGetText` 抓 d006001 JSON，parse 字串欄位（去除 `%`）
- `fetchGenerationMix.ts` — `httpRequest` 抓 set_id=55，`decodeCsvBuffer`（UTF-8 優先，偵測到 U+FFFD 才退回 Big5，比照本站既有的政府 CSV 編碼不一致經驗）+ 既有共用 `parseCsv`（`lib/server/facilities/csv.ts`）
- `fetchRadiationStations.ts` — 同上抓 d525001 CSV，解析 `YYYYMMDDTHHMMSS` 時間戳
- `queries.ts` — 三張表個別的 `upsert*`（沿用 `chunkedUpsert`）與 `get*`（`withConnectionFallback`，DB 不可用時回傳空陣列而非炸頁面）
- `runSync.ts` — `runPowerRealtimeSync()`（d006001 + d525001，兩者各自包 `runSource` 隔離失敗）、`runPowerMixSync()`（set_id=55 獨立）

Admin 手動觸發端點（比照 `app/api/admin/aqi-sync`）：
- `app/api/admin/power-sync` — POST，觸發 `runPowerRealtimeSync()`
- `app/api/admin/power-mix-sync` — POST，觸發 `runPowerMixSync()`

排程（`lib/server/cron/registerJobs.ts`，比照現行 in-app cron scheduler）：
- `*/10 * * * *` → `runPowerRealtimeSync()`（d006001 + d525001，兩者皆 ~10 分鐘更新）
- `5 5 * * *` → `runPowerMixSync()`（set_id=55，daily off-peak，未被佔用的凌晨分鐘）

頁面本身不會在每次瀏覽時打上游——一律讀資料庫快取（`getGenerationUnits`/`getGenerationMix`/`getRadiationStations`）。

## 5. 前端

- 新頁面 `/tools/power-grid-overview`：單頁三區塊呈現，`ToolPageShell` 包裝（沿用既有 AEO/FAQ/scientificBasis 版型）。
  1. **全國發電來源配比**：長條堆疊圖 + 卡片（台電/民營電廠/汽電共生 各自占比、裝置容量），另外標示合計裝置容量。
  2. **各機組即時發電量**：依機組類型篩選 tab + 表格（機組名稱、類型、裝置容量、淨發電量、發電比、備註），表格上方顯示篩選後的機組數/裝置容量合計/淨發電量合計。
  3. **核電廠周邊輻射偵測站（安全監測）**：表格（站名、站號、劑量率 µSv/h、觀測時間），明確標示「安全監測」而非停電資訊。
- Server Component（`page.tsx`）在請求時直接查資料庫取得初始快照；Client Component（`PowerGridOverviewContent.tsx`）每 5 分鐘呼叫 `/api/power-grid-overview` 背景刷新，資料庫層仍由 10 分鐘 cron 決定實際新鮮度上限。
- 公開讀取 API `/api/power-grid-overview`：一次回傳三個區塊的最新快照（`{units, mix, radiationStations}`），`Cache-Control: no-store`。

## 6. Out of Scope

- 逐機組歷史趨勢圖或長期資料庫化存檔（僅呈現目前即時/最新快照，`power_*` 三張表皆為 latest-snapshot upsert，不保留舊值）
- 地圖化定位介面（三份資料一律清單/表格呈現；`d525001` 雖有經緯度，但如第 1.3 節說明，issue 原先「不做分區停電地圖」的前提本身不成立，這裡改以「表格呈現已足夠、無地圖化必要」為理由，結論不變：不做地圖）
