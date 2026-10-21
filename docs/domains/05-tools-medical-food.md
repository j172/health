# 05 醫療、急救與食藥工具

> 合併自 12 份原始文件 · 狀態核對基準：`main` @ `7fe098b`（2026-10-12）
> 狀態圖例：✅ 已上線｜🟡 部分完成｜❌ 未實作｜⛔ 受阻｜🗄️ 已取代

---

## 1. 目前真相

| 工具 | 網址 | 資料來源 | 備註 |
|---|---|---|---|
| 醫療院所 | [/tools/clinics](https://health.j172.tw/tools/clinics) | 健保署特約院所＋雙北桃高衛生局 | 7×3 看診時段表；「⚠️ 違規／停約名單」篩選；醫事性平情境卡 |
| 急診即時看板 | [/tools/er-status](https://health.j172.tw/tools/er-status) | 健保署急診壅塞 | 每 15 分鐘（`7,22,37,52`）快照、24 小時 Sparkline、過期日誌自動刪除 |
| AED 地圖 | [/tools/aed](https://health.j172.tw/tools/aed) | 衛福部公共場所 AED | `facilities.facility_type='aed'`，含樓層、開放時間 |
| 長照服務 | [/tools/long-term-care](https://health.j172.tw/tools/long-term-care) | 衛福部長照 GIS 10 個資料集 | 以機構代碼去重；空床、評鑑、ABC 級徽章（2.0 將擴為「長照照顧圈地圖」） |
| 健康檢查 | [/tools/health-checks](https://health.j172.tw/tools/health-checks) | 國健署＋勞動部職業傷病防治醫院 | MOL 來源以 `醫療機構名稱|地址` 作穩定鍵 |
| 食品營養／藥品 | [/tools/food-nutrition](https://health.j172.tw/tools/food-nutrition)、[/tools/drugs](https://health.j172.tw/tools/drugs) | 食藥署 | 已分頁化（餐點分析、營養素排行）；健康食品獨立為 [/tools/health-supplements](https://health.j172.tw/tools/health-supplements) |
| 食安檢驗看板 | [/tools/food-safety](https://health.j172.tw/tools/food-safety) | 農業部抽檢＋60+ 蔬果基準 | 蔬果農藥殘留（非業者登錄） |
| 戶外安全指數 | [/tools/outdoor-safety](https://health.j172.tw/tools/outdoor-safety) | 氣象＋AQI＋UV＋疫情 | 100 分扣分制，四族群建議 |
| 醫事性平查詢 | [/tools/medical-violators](https://health.j172.tw/tools/medical-violators) | 衛福部「狼醫平台」 | 爬取 18 類醫事人員，快取於 `data/medical-violators-seed.json`，GHA 定期同步 |

---

## 2. 長期有效的決策

- 健保懲處名單依日期判定狀態（處分中／暫緩／已期滿），**已期滿必須明確標示**，避免法律爭議。
- 急診看板健保端點受限時，退回依時段的人潮模型，並清楚標示為推估。
- AED 首頁直接算最近 3 台並標示「開放中／已閉館」。
- 藥品仿單（適應症、副作用、交互作用）沒有官方結構化資料，**不得以非官方來源補**。

---

## 3. 核對後仍未完成的項目

| # | 項目 | 來源文件 | 說明 |
|---|---|---|---|
| M-1 | 藥品仿單結構化資料 | drug-label-source-blocked | ⛔ 食藥署僅提供逐藥 PDF，無 bulk API、無交互作用矩陣；有官方來源出現才解除 |

---

## 4. 逐份紀錄

#### 看診時段 7×3 矩陣 ✅
- 原檔：[clinic-weekly-hours-matrix.md](../archive/specs/clinic-weekly-hours-matrix.md)（#242）
- 21 碼看診字串展開為週一到週日 × 早午晚；手機可點擊展開（原本只有 hover `title`）；今日高亮。

#### 健保違規、停約與五年不予特約名冊 ✅
- 原檔：[nhi-clinic-penalties-integration.md](../archive/specs/nhi-clinic-penalties-integration.md)（#234）
- 4 份名冊；既有院所以醫事機構代碼注入 `extra_json.penalty`；已除名機構與純管制地址以 `source_key='nhi_penalty'` 建檔；民國日期轉西元判定狀態。

#### 急診即時看板＋AED 地圖 ✅
- 原檔：[emergency-room-status-and-aed-map-expansion.md](../archive/specs/emergency-room-status-and-aed-map-expansion.md)（#290）
- `emergency_room_status`（最新）＋`emergency_room_logs`（24 小時）；8 大生活圈分頁；`scripts/import-mohw-aed.mjs（已移除，見 git 歷史）`。

#### AED／防災地圖修復、定位標準化、全站工具巡檢 ✅
- 原檔：[emergency-aed-disaster-map-and-site-wide-tools-health.md](../archive/specs/emergency-aed-disaster-map-and-site-wide-tools-health.md)（#300）
- AED 0 筆（無種子）；防災地圖同時畫約 6,000 個 SVG 標記凍結主執行緒 → 加 MarkerCluster；所有地圖統一「🎯 重新取得定位」懸浮鈕。

#### Twinkle Hub 醫療食安工具補完 ✅
- 原檔：[twinkle-hub-food-drug-tools.md](../archive/specs/twinkle-hub-food-drug-tools.md)
- 對照 Twinkle Hub 9 個 MCP 工具，本站缺的 7 個以「既有頁面新分頁」形式加入，每個資料集都進 DB（`ensureSchema()`＋匯入腳本）。

#### 藥品仿單資料源（受阻） ⛔
- 原檔：[drug-label-source-blocked.md](../archive/specs/drug-label-source-blocked.md)
- 見待辦 M-1。

#### 食安農藥殘留看板＋戶外安全指數 ✅
- 原檔：[food-safety-and-outdoor-safety-mashup.md](../archive/specs/food-safety-and-outdoor-safety-mashup.md)（#292）
- 表：`food_pesticide_standards`、`food_pesticide_records`、`outdoor_safety_indices`；評分公式：AQI 最多扣 40、熱指數最多扣 30、UV、疫情。
- 林火風險區塊（Track B B-12，#672；[spec](../2.0/track-b-opendata-phase2-3-spec.md) §2.4 D-2）：農業部 `ForestFireAlertWCF?CreateDate=今日`（Asia/Taipei 當日，只取當日列）→ `forest_fire_alerts`（最新狀態表，UNIQUE KEY 只有 `site_code`，約 61 列）→ `/api/outdoor-safety/forest-fire`（明確 `Cache-Control`）→ 戶外安全指數頁「林火風險」區塊（`components/Tools/ForestFireSection.tsx`）。cron `9 6,12 * * *`（`lib/server/forestFire/runSync.ts`）。等級 0–4 = 安全／注意／警告／危險／最危險；未知或自相矛盾的等級**不顯示**（不當作安全），`error_msg` 字串 `"NULL"` 視為無錯誤。來源無座標，61 筆座標 seed（`lib/server/forestFire/data/forestFireSites.ts`）取自林業及自然保育署「林火風險評估系統」公開 GeoJSON，逐筆標註比對依據（59 筆代碼相符、2 筆——冬山、滿月圓——代碼不同、以名稱相符）；完整性測試在 `lib/server/forestFire/forestFire.test.mjs`。

#### 衛福部醫事人員性平專區 ✅
- 原檔：[SPEC-20261007-MOHW-VIO-MEDICAL-SAFETY.md](../archive/specs/SPEC-20261007-MOHW-VIO-MEDICAL-SAFETY.md)、工單 [TICKET-20261007-MOHW-VIO-MEDICAL-SAFETY.md](../archive/tickets/TICKET-20261007-MOHW-VIO-MEDICAL-SAFETY.md)（#432）
- 雙軌：友站外連＋站內獨立查詢頁；附裁判書連結與權威免責說明。

#### Phase 4 — 健康檢查補上勞動部來源 ✅
- 原檔：[phase4-health-checks-mol-source.md](../archive/specs/phase4-health-checks-mol-source.md)
- 職業傷病防治網絡醫院 39 家，原本標示「暫未收錄」；實作為 `lib/server/facilities/sources/molOccupationalInjuryHospital.ts`。

#### 勞動部來源改用穩定複合鍵 ✅
- 原檔：[mol-occupational-injury-source-id-migration.md](../archive/specs/mol-occupational-injury-source-id-migration.md)（#21）
- 原以上游「序號」當 `source_id`，上游一重排就會覆寫錯的醫院；改 `名稱|地址`，`initDb()` 內冪等遷移並保留座標。

#### 衛福部長照 GIS 全生態系整併 ✅
- 原檔：[mohw-ltc-gis-ecosystem-consolidation.md](../archive/specs/mohw-ltc-gis-ecosystem-consolidation.md)（#285）
- `ltc.csv` 4,114、`all.csv` 23,304、`res.csv` 2,205、`eval.csv` 123、`g_pi400.csv` 4,699 等；以機構代碼去重；失智、家照、關懷據點統一為 `long_term_care`。
