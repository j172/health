# TDX 基礎服務整合研究（2.0 候選）

- **日期**：2026-10-12
- **來源**：完整爬取 [TDX swagger／基礎服務](https://tdx.transportdata.tw/api-service/swagger/basic) 背後的資料：群組清單 `GET /webapi/serviceCategory/ForSwagger`，以及每個群組的 OpenAPI 文件 `GET /webapi/File/Swagger/V3/{groupId}`。
- **範圍**：`basic` 分類全部 18 個群組、674 支 API，逐一比對本站 84 個工具。另附 `seniors` 分類（高齡友善）的修正結果。
- **狀態**：2026-10-12 使用者核准，**T1–T4、T6 納入 2.0**（PRD [#438](https://github.com/j172/health/issues/438) §P；T6 排 P0、T1–T4 排 P2）；T5、T7–T11 留待 2.0 之後。原則：不新增 catalog 工具頁，資料餵給既有工具、hub 與「我附近」。

> **2026-10-21 範圍調整（#727–#731）與 2026-10-23 配額重算**：本文提到的 YouBike（T6）、全台軌道營運通阻（T4，`metro-alerts`）、樂齡旅遊，以及無障礙交通的 TDX 即時同步（T1 每日公車低地板比率、每日軌道無障礙同步）已**整個移除或降級為靜態種子資料**；現況：TDX 基礎會員規格為 **0 元/月、3 點/月（約 3,000 次/月）、5 次/分/金鑰**。TDX 排程只剩每 3 小時電梯停用公告（`transit-accessibility-alerts`，`16 */3 * * *`，80 次／天，月計約 2,400 次，控制在 3,000 點內）、半年一次的設施同步（停車 T3、有聲號誌 T2，仍在）與管理員手動的敬老卡同步；請求預算與症狀判讀見 [domains/10-scheduling-sync-ci.md](../domains/10-scheduling-sync-ci.md) §2.1。

---

## 0. 先修好的：高齡友善 API（`seniors` 分類）

| 項目 | 結果 |
|---|---|
| 正確 base | `https://tdx.transportdata.tw/api/seniors` ＋ `/V1/Senior/...`（獨立的服務分類，不在 basic、也不在 advanced） |
| API | 軌道 5 支（10 個軌道系統）、觀光 4 支、敬老卡 1 支（22 縣市） |
| 修正 | 分支 `fix/tdx-seniors-base-path`（commit `90cf107`，尚未推送）：3 個 base 常數改由共用的 `TDX_SENIORS_API_BASE` 推導；座標在 schema 中是字串，改用 `parseTdxCoordinate()` 轉換；新增 5 個測試，全套 455/455 通過 |
| 部署後 | `accessible-transit` 與 `senior-friendly` 會由種子資料改為真實資料；需實打正式 API 確認 |

---

## 1. TDX 基礎服務 18 個群組總覽

server 一律是 `https://tdx.transportdata.tw/api/basic`。

| 群組 | API 數 | 與本站的關係 |
|---|---|---|
| 公共運輸-公車 v2／v3 | 79／75 | **高**：車輛低地板、站位無障礙、醫院接駁公車、偏鄉 DRTS |
| 公共運輸-軌道 v2／v3 | 84／49 | **高**：全台捷運／臺鐵／高鐵營運通阻、車站設施與出入口 |
| 公共運輸-自行車 v2 | 3 | **中**：本站已用 TDX，但只接了 5 個縣市，TDX 提供 15 個 |
| 停車資訊 v1 | 73 | **高**：身障、孕婦親子、復康巴士車位與即時剩餘數 |
| 有聲號誌 v1 | 2 | **高**：盲人有聲號誌點位（含座標） |
| 道路事件 v1 | 6 | **中**：即時道路事件，可依類別篩出「天氣」「災害」「特殊管制」 |
| 綠色運輸-充電樁 v1 | 49 | 中：全台充電站與充電槍即時狀態（目前站上沒有對應工具） |
| 共通資料-行政區 v2、GIS 圖資 v3 | 6／34 | 低：縣市、鄉鎮、村里清單與界線圖資 |
| 觀光資訊 v2 | 22 | 低：台灣好行公車 |
| 共通資料-公共運輸 v2 | 4 | 低：含年度行事曆（國定假日） |
| 公共運輸-航空、航運；路況資訊；路段編碼；共通資料-道路 | 20／40／79／44／10 | 無：與本站定位不符 |

---

## 2. 已納入 2.0（T1–T4；T6 見 §3）

### T1. 無障礙公車改用真實資料（取代種子）★（已於 2026-10-21 隨 #730 移除，改回靜態種子）
- **現況**：`accessible_transit_routes` 的「低地板公車比率」是寫死的種子值（`transitSeed.ts`，例如 100.0、98.5）。當初 Spec A 認為 TDX 沒有這筆資料，但那只是 `seniors` 分類沒有。
- **TDX 實際有的**：
  - `GET /v3/Bus/Vehicle/City/{City}`：每台車的 `IsLowFloor`（是否低地板）、`HasLiftOrRamp`（是否有升降或斜坡板）。
  - `GET /v3/Bus/Schedule/City/{City}`：每個班次的 `IsLowFloor`。
  - v3 站位設施 `HasBarrierFree`。
  - v2 `Vehicle.VehicleType`：`2` 代表復康巴士。
- **做法**：每日同步車輛資料，依縣市計算真實的低地板比率；路線頁可以進一步標示「下一班是否為低地板車」。
- **服務對象**：長照與社福分類、「家有長輩」與「身心障礙者生活」兩個 hub。

### T2. 盲人有聲號誌 ★
- **API**：`GET /v1/Traffic/Road/APS/City/{City}`。欄位有 `PositionLon`／`PositionLat`、路口道路名、各方向引導音、是否可用 App 觸發（含 Android／iOS 下載連結）。
- **服務對象**：「身心障礙者生活」hub 新增一步；「我附近」的「更多類型」新增一類；`BaseMap` 可作為圖層。

### T3. 身障／孕婦親子／復康巴士停車位（含即時剩餘） ★
- **API**：`/v1/Parking/OffStreet/{CarPark, ParkingSpace, ParkingAvailability}/City/{City}`，以及路邊的 `OnStreet/ParkingSegmentSpace`、`ParkingSegmentAvailability`。
- **關鍵**：`SpaceType` 列舉值包含 `7` 孕婦及親子專用車位、`9` 身心障礙汽車車位、`10` 身心障礙機車車位、`13` 復康巴士。
- **服務對象**：「懷孕到育兒」hub（孕婦親子車位）、「身心障礙者生活」hub、「我附近」更多類型。
- **注意**：車位總量很大，同步只保留上述 4 種 `SpaceType`，避免資料表膨脹（參考 [09](../domains/09-database-data-integrity.md) 的教訓）。

### T4. 全台軌道營運通阻（升級捷運公告） ★（已於 2026-10-21 隨 #728 整個移除）
- **現況**：[/tools/metro-alerts](https://health.j172.tw/tools/metro-alerts) 只有臺北捷運，來源是 data.taipei 的 Big5 CSV。
- **TDX**：
  - `/v2/Rail/Metro/Alert/{RailSystem}`：TRTC 臺北、TRTCMG 貓空纜車、TYMC 桃捷、TMRT 中捷、KRTC 高捷、KLRT 高雄輕軌。
  - `/v3/Rail/TRA/Alert`：臺鐵。
  - `/v2/Rail/THSR/AlertInfo`：高鐵。
- **服務對象**：交通分類；「颱風地震來了」hub 新增「交通是否停駛」一步。

### T5. 醫院接駁公車
- **API**：`/v3/Bus/Shuttle/Hospital/{Route, Stop, StopOfRoute, Schedule}/Authority/{Code}`。
- **涵蓋**：目前只有 8 家：三總基隆、新光、臺大、臺大金山、三總、成大、高榮、北榮。
- **做法**：在醫療院所卡片與急診看板中，為這 8 家顯示「有接駁公車」並附班表。涵蓋面有限，屬於加分項。

---

## 3. 建議 2.0 之後另開：屬於新工具或擴充

| # | 項目 | API | 說明 |
|---|---|---|---|
| T6 ✅ 已納入 2.0 P0，**後於 2026-10-21 整個移除（#727）** | YouBike 擴至 15 縣市 | `/v2/Bike/{Station, Availability}/City/{City}` | 現有程式已用 TDX，只需把 `TDX_CITIES` 從 5 個加到 15 個（新增台中、苗栗、彰化、雲林、嘉義縣市、屏東、台東、高雄、台南）。改動很小，**也可以放進 2.0 P0** |
| T7 | 道路事件（防災相關） | `/v1/Traffic/RoadEvent/LiveEvent/{Highway, Freeway, City/{City}}` | `EventType` 5 天氣、6 災害、4 特殊管制；可補 NCDR 待辦 D-1 的「公路」類別 |
| T8 | 偏鄉需求反應式公車（DRTS） | `/v3/Bus/DRTS/*` | 預約條件、站位、班表；偏鄉長者就醫交通，可放入「家有長輩」hub |
| T9 | 電動車充電站 | `/v1/EV/{Station, ConnectorLiveStatus}/City/{City}` | 全新工具，與現有工具無重疊 |
| T10 | 國定假日行事曆 | `/v2/Basic/Calendar/Year/{Year}` | 可用來提醒「今天國定假日，診所時段可能調整」 |
| T11 | 行政區界線 | `/V3/Map/District/Boundary/{City, Town, Village}` | 可作為 368 鄉鎮與村里的官方來源；目前已用內政部 shapefile，價值有限 |

---

## 4. basic 以外值得另查（本次未下載定義檔）

- **進階服務／輔助工具-地理編碼轉換 v2**、**空間查詢-POI v3**：可能成為 TGOS、OpenCage 之外的免費 geocoder，減輕 [08](../domains/08-facilities-geocode-maps.md) 的額度壓力。
- **觀光服務／觀光資訊資料庫開放資料 V2**：景點、活動、餐廳、旅宿，可與藝文活動和觀光工廠交叉。

---

## 5. 實作共通注意事項

1. **嚴守基礎會員月配額（2026-10-23 核實）**：TDX 基礎會員（0 元/月）虛擬點數僅 3 點/月（約 3,000 次 API 呼叫/月），存取頻率 5 次/分/金鑰。日均配額極限為 100 次/天，每日常駐排程已定為 80 次/天（每 3 小時一次電梯停用公告，月計 2,400 次），保留 600 次/月給半年同步與測試。**任何未來新增功能均不得新增常駐 TDX 排程**，以免點數破表；優先使用 data.gov.tw 等無 API 額度限制的資料源。
2. 一律走既有的 `getTdxToken()` 與 `httpGetJson`（禁止全域 `fetch`）；TDX 有每秒請求上限，逐縣市呼叫要依序加間隔。
2. 座標在 TDX schema 中多為字串，一律經 `parseTdxCoordinate()` 轉換。（該函式已於 #731 隨最後一個呼叫端移除；停車、有聲號誌來源各自有座標轉換。）
3. 只存「最新狀態」的資料表，UNIQUE KEY **不得包含時間欄位**（見 [09](../domains/09-database-data-integrity.md)）。
4. 每個新同步都要有種子備援，並列入 GitHub Actions 或 in-app 排程時參考 [10](../domains/10-scheduling-sync-ci.md) 錯開分鐘數；目前 in-app 已有 36 個 job，需注意 NPROC。
5. 縣市代碼：TDX 有兩套，basic 用英文名（`Taipei`、`NewTaipei`），`seniors` 用 3 碼（`TPE`、`NWT`）；建議集中一份對照表。
