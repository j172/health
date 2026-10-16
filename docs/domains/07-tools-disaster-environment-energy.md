# 07 防災、水情、環境與能源工具

> 合併自 15 份原始文件 · 狀態核對基準：`main` @ `7fe098b`（2026-10-12）
> 狀態圖例：✅ 已上線｜🟡 部分完成｜❌ 未實作｜🗄️ 已取代｜📚 研究

---

## 1. 目前真相

| 工具 | 網址 | 資料來源 | 備註 |
|---|---|---|---|
| 防災避難地圖 | [/tools/disaster-map](https://health.j172.tw/tools/disaster-map) | 內政部：避難收容 5,973、消防救援 770、應變中心 25 | 獨立表 `disaster_response_points`（`layer` 區分）；MarkerCluster；可疊加農業部土石流警戒 |
| 積淹水感測地圖 | [/tools/inundation-map](https://health.j172.tw/tools/inundation-map) | 水利署 IoT 路面淹水感測＋河川水位警戒 | 已有真正的 Leaflet 地圖（`InundationMapLeaflet`） |
| 停水與供水站 | [/tools/water-outages](https://health.j172.tw/tools/water-outages) | 台水＋北水 | 新表 `wra_water_outages` 已接上真實擷取（`ingestWraWaterOutages.ts`）；「水質」分頁（`#quality`，Track B B-13／#673）讀 `water_hardness_township`（台水 36605 鄉鎮總硬度 340 筆，`lib/server/waterQuality/`，每月 2 日 05:29 同步；臺北市／金門縣／連江縣不在台水轄區，頁面明寫）；同分頁另有「淨水場檢驗結果」（Track B B-14／#676）讀 `water_plant_quality`（台水 6308 寬表，154 座淨水場 × 68 項，檢驗值一律存原字串 `ND`／`<1`／`－－`；鍵為 `(office_code, plant_code)`，因 7 碼淨水場代碼在檔內有 4 組重複；「水質合格否」為 N 者紅色標示；頁尾日期取檔內「更新日期」，不用 data.gov.tw 詮釋資料日期），與硬度同一個月 job |
| 水情（水位＋水庫） | [/tools/water-conditions](https://health.j172.tw/tools/water-conditions) | 水利署 | 站名目錄補強、SVG 量尺／水塔視覺 |
| 氣象警報與雨量 | [/tools/weather-alerts](https://health.j172.tw/tools/weather-alerts) | 氣象署 W-C0033／W-C0034、C-B0025、O-A0002 | 依 GPS 或縣市找最近雨量站；側欄另含海嘯與鄉鎮危險天氣 |
| 電力概況 | [/tools/power-grid-overview](https://health.j172.tw/tools/power-grid-overview) | 台電機組即時、能源署配比、核電廠周邊輻射 | 不做地圖，表格呈現 |
| 中油油價／站點 | [/tools/cpc-prices](https://health.j172.tw/tools/cpc-prices)、[/tools/cpc-stations](https://health.j172.tw/tools/cpc-stations) | 中油 9 類牌價、20 類服務據點、`getStationInfo` | 首頁側欄油價小卡；2.0 M3 將合併兩頁 |
| 緊急電話 | [/tools/emergency-hotlines](https://health.j172.tw/tools/emergency-hotlines)（`/emergency` 捷徑） | 47 組簡碼＋22 縣市 1999 | SSR 預載、離線可用、一鍵直撥 |
| 防災物資計算 | [/tools/emergency-supplies](https://health.j172.tw/tools/emergency-supplies) | 國防部《臺灣全民安全指引》 | 避難包／居家儲備雙模式、勾選進度本機保存、可列印 |
| 今天要上班上課嗎？（#691） | [/tools/work-school-status](https://health.j172.tw/tools/work-school-status)（en／ja／ko 有真實路徑版） | 人事行政總處《政府行政機關辦公日曆表》（data.gov.tw 14718）；天然災害停班停課**只做連結導流（link-only）** | 日曆：`office_calendar_days`（`lib/server/officeCalendar/`；UNIQUE KEY 只用 `calendar_date`，同步一律 UPDATE、不刪列），每週三 06:34 同步當年與次年檔（人事行政總處會中途修正，114 年就在 2025-10-20 改了 3 天，且該修正檔是 Big5、列在清單最後），無資料時退回內建 `data/office-calendar-seed.json`（2026–2027，頁面標示取得日期），再無則顯示「查無資料」、絕不以星期推測。「今天／明天」以 Asia/Taipei 計算，與主機時區無關。停班停課不顯示各縣市狀態，見 §2。首頁狀態列「今日上班」晶片（颱風警報發布時轉紅，只提示去看官方公告）、`/guides/typhoon-earthquake` 第 2 步。API：`/api/tools/work-school-status`；首次部署後 `POST /api/admin/office-calendar-sync` |
| NCDR 示警 | （無獨立頁） | NCDR CAP | `lib/server/ncdr/ncdrAlerts.ts` 已供 `/api/alerts/active` 與淹水模組使用 |

---

## 2. 長期有效的決策

- 文化部 EMIC `Shelter.xml` 範圍小且過時，**不採用**；以內政部全國資料集為準。
- 疾管署 `od.cdc.gov.tw` 只允許台灣 ISP 來源 IP，正式主機、GitHub runner、Cloudflare WARP 全部逾時 → **登革熱病媒蚊地圖已整個移除**（不依賴開發者個人電腦中繼）。
- 伺服器端一律使用 `httpGetText`，禁止全域 `fetch()`（undici WASM 會 OOM，見 [11](11-hosting-ops-incidents.md)）。
- 緊急電話頁必須在斷網後仍可運作（資料於 SSR 時內嵌）。
- **各縣市停班停課不做即時狀態，只連結導流（2026-10-16 查證，#691）**：這是影響出門安全的資訊，只有「官方＋穩定＋機器可讀」的來源才顯示。查證結果——(1) `www.dgpa.gov.tw/typh/daily/nds.html` 目前是伺服器端直出的 HTML（頁面唯一的 script 是 Google Tag Manager；`nds.json`／`ndsdata.json`／`nds.xml`／`ndsdata.xml`／`nds.js` 全部 404），表格版面在 2024–2026 間至少有兩種樣板來回切換（逐縣市平面表 vs. 分區 rowspan 表，後者並出現「已達停止上班及上課標準」「尚未列入警戒區」等新措辭），平日無災情時又是單列「無停班停課訊息。」——正是「因改版悄悄壞掉」的 HTML；(2) data.gov.tw 20457 指向的 CAP（`alerts.ncdr.nat.gov.tw/RssAtomFeed.ashx?AlertType=33`）回「請先登入會員」，需 NCDR 會員；(3) NCDR 公開 feed 沒有停班停課項目。因此不抓、不快取、不顯示任何縣市狀態；頁面放官方公告連結與誠實說明（`lib/tools/workSchoolStatus/closureGuidance.ts`），並由測試禁止任何程式碼抓取該頁。若日後出現穩定公開的機器可讀來源，才在該模組加入，且必須有「抓取失敗就明說、請看官網」的降級、極短快取與資料時間。首頁晶片的紅色只代表「中央氣象署發布颱風警報（`cwa_alerts` W-C0034-001）」，文字是「查停班停課」，不是停班停課本身。
- 日曆資料的修正會覆蓋舊值：同步選每年「最新的檔」（清單中 `(YYYMMDD更新)` 最大者，同分取排在後面者），解碼自動辨識 UTF-8／Big5，整年檔必須恰好 365／366 列才寫入，否則該年原樣保留並寫入 `ingest_errors`。

---

## 3. 核對後仍未完成的項目

| # | 項目 | 來源文件 | 說明 |
|---|---|---|---|
| D-1 | NCDR 全類別示警分頁 | ncdr-disaster-alerts-integration | 原設計在 `/tools/weather-alerts` 新增淹水／河川／土石流／公路分頁；目前只有後端模組與 API，**無前端分頁** |
| D-2 | 本機殘留空目錄 `app/tools/dengue-mosquito-map/`、`lib/server/dengue/` | dengue-vector-survey-removal | git 已刪除，僅 Google Drive 同步留下空資料夾；列入 2.0 P0 清理 |

---

## 4. 逐份紀錄

#### 防災地圖（避難收容／消防救援／應變中心） ✅
- 原檔：[disaster-shelter-rescue-map.md](../archive/specs/disaster-shelter-rescue-map.md)（#168、PR #169）
- 三個 CSV 皆自帶經緯度（消防欄名誤標為 TWD97 但實為經緯度）；「適用災害類別」含逗號需正規 CSV 解析；約 3% 收容所名稱在 MOI 原始檔就有「?」罕字亂碼（非本站問題）。

#### 水資源與防災線：停水地圖、IoT 淹水、土石流圖層 ✅
- 原檔：[water-outages-and-disaster-resilience-expansion.md](../archive/specs/water-outages-and-disaster-resilience-expansion.md)（#327）
- 新表 `wra_water_outages`、`moa_debris_flow_alerts`；淹水改接水利署 IoT 分鐘級資料。

#### 停水新表從未接上即時擷取 ✅（已修）
- 原檔：[water-outages-live-ingestion-gap.md](../archive/specs/water-outages-live-ingestion-gap.md)
- 舊管線（`water_outages`，CSV，每小時 :25）活著；新頁使用的 `wra_water_outages` 全專案沒有任何寫入程式，永遠顯示種子假資料。已補 `ingestWraWaterOutages.ts`。

#### 為積淹水地圖建立真正的地圖 ✅
- 原檔：[inundation-map-real-map-implementation.md](../archive/specs/inundation-map-real-map-implementation.md)
- 原頁面只有列表卡片；在列表上方加入 Leaflet 地圖，感測站依警戒等級上色。

#### 無障礙交通地圖＋積淹水感測地圖（Phase 2 雙旗艦） ✅
- 原檔：[accessible-transit-and-inundation-map.md](../archive/specs/accessible-transit-and-inundation-map.md)（#295）
- 第 61、62 款工具；無障礙交通原本為種子資料（後由 TDX Spec A 升級，見 [06](06-tools-welfare-family-culture.md)）。

#### NCDR 全類別災害示警（研究與設計） 🟡
- 原檔：[ncdr-disaster-alerts-integration.md](../archive/specs/ncdr-disaster-alerts-integration.md)
- 本站已有地震、海嘯、空品、CWA 特報專表；新增類別為淹水、河川水位、土石流、公路。後端已部分實作（待辦 D-1）。

#### 完整移除登革熱病媒蚊地圖 ✅
- 原檔：[dengue-vector-survey-removal.md](../archive/specs/dengue-vector-survey-removal.md)（#333，撤回 #269）
- 唯一可行的資料取得方式是開發者個人電腦的 Windows 排程中繼，不可接受；整個功能與 6,843 筆資料移除。

#### 氣象警報、雨量定位與導覽重整 ✅
- 原檔：[weather-alerts-and-nav-restructure.md](../archive/specs/weather-alerts-and-nav-restructure.md)（#176）
- 新增 `/tools/weather-alerts`；側欄整合海嘯與鄉鎮危險天氣；當時新增「氣象觀測」導覽群組（後被 #256 取代）。

#### 水庫與水位站目錄補強＋SVG 量尺 ✅
- 原檔：[wra-reservoir-and-water-level-catalog-enrichment.md](../archive/specs/wra-reservoir-and-water-level-catalog-enrichment.md)（#172）
- 即時資料只有代碼沒有名稱 → 匯入水庫與水位站目錄；`ReservoirWaterTankGauge`、`WaterLevelStaffGauge`。後於 #256 合併為 `water-conditions`。

#### 全台電力概況儀表板 ✅
- 原檔：[taipower-energy-dashboard.md](../archive/specs/taipower-energy-dashboard.md)（#177）
- `d006001` 機組發電量（約 10 分鐘）、能源署發電配比、`d525001` 實為核電廠周邊輻射劑量（規格更正已回報 issue）。

#### 中油牌價、20 類據點地圖、首頁小卡 ✅
- 原檔：[cpc-prices-and-stations-expansion.md](../archive/specs/cpc-prices-and-stations-expansion.md)（#246）
- 9 類產品 150 筆牌價；644 座加油站多標籤交集篩選；側欄 4 宮格油價。

#### 中油站點補接 getStationInfo ✅
- 原檔：[cpc-station-info-enrichment.md](../archive/specs/cpc-station-info-enrichment.md)（#257）
- 補上油品種類、付款方式、總營業時間，以 `stationCode` 合併進 `extra_json`。

#### 全臺緊急專線速查與直撥 ✅
- 原檔：[SPEC-20260926-EMERGENCY-HOTLINES-QUICK-DIAL-PAGE.md](../archive/specs/SPEC-20260926-EMERGENCY-HOTLINES-QUICK-DIAL-PAGE.md)（#421）
- 雙入口 `/tools/emergency-hotlines` 與 `/emergency`；Navbar 常駐「🚨 緊急電話」。

#### 防災物資：避難包與居家儲備計算機 ✅
- 原檔：[SPEC-20260930-EMERGENCY-SUPPLIES-PREPAREDNESS-CALCULATOR.md](../archive/specs/SPEC-20260930-EMERGENCY-SUPPLIES-PREPAREDNESS-CALCULATOR.md)、工單 [TICKET-20260930-EMERGENCY-SUPPLIES-PREPAREDNESS-CALCULATOR.md](../archive/tickets/TICKET-20260930-EMERGENCY-SUPPLIES-PREPAREDNESS-CALCULATOR.md)（#422）
- 依家庭成員（含長者、寵物）與 72 小時／7–14 天換算水、乾糧、藥品；勾選進度存本機、可列印或複製分工。
