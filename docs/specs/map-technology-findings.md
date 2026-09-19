# 全站地圖技術一致性盤點：現況、可行性評估與建議

- **作者**：Claude（診斷會話）
- **日期**：2026-09-20
- **狀態**：Draft — 純診斷報告，未修改任何地圖元件程式碼
- **對應規格書**：`docs/specs/map-technology-consistency-audit.md`
- **對應 issue**：Closes #341
- **交付物性質**：本文件僅為盤點與建議，任何後續重構均需另立工單，經人工複核後才動工

## 0. 撰寫時的現況快照（重要，會影響本報告怎麼讀）

撰寫本報告時（2026-09-20），`components/News/NewsMapCard.tsx` 移除工單（issue #338，
規格見 `docs/specs/remove-news-article-geolocation-card.md`）**尚未合併**——`NewsMapCard.tsx`
仍存在於 `main` 上。因此：

- 第 1 節的盤點表格**會列出 `NewsMapCard.tsx` 作為現況基準線**，並明確標註「issue #338 移除後即消失」。
- 第 2、3 節的「需要統一」清單與代價估算**排除 `NewsMapCard.tsx`**，因為它在本報告完成前後的
  任一時間點合併都會被刪除，此刻投入分析或重構它沒有意義。
- 若你閱讀本文件時 #338 已合併，請直接跳過所有標記「（現況基準線，即將消失）」的段落。

## 1. 全站地圖技術現況盤點

### 1.1 分類總覽

全站與「地圖顯示」相關的程式碼可分成六類，彼此技術路線差異很大：

| 類別 | 技術 | 是否需要外部 API Key | 互動能力 |
|---|---|---|---|
| A. 互動式 Leaflet 地圖 | `react-leaflet` + `leaflet`，OSM 原始 tile server | 否 | 可縮放、可拖曳、可點擊標記彈出 Popup、可即時定位飛行動畫 |
| B.（現況基準線，即將消失）iframe 內嵌 OSM 地圖 | `<iframe>` 嵌入 `openstreetmap.org/export/embed.html` | 否 | 可縮放/拖曳（受限於 OSM 官方 embed 頁本身的 UI），無法客製標記樣式 |
| C. 伺服器端產生的裝飾性 SVG | 純手刻 SVG（漸層背景＋假造道路曲線＋定位大頭針＋文字座標），**不是真的地圖**，只是視覺上像地圖的裝飾圖 | 否 | 無（純靜態圖片，給新聞卡片當 OG/縮圖用） |
| D. 誤植為「地圖」但其實沒有地圖的元件 | 純 `<select>` 下拉選單 + 天氣圖示 SVG，無任何地理視覺化 | 否 | 無（不是地圖，只是文字/圖示切換 UI） |
| E. 頁面標題含「地圖」但完全沒有地圖渲染 | 純清單/卡片 UI + 文字狀態橫幅 | 否 | 無（沒有任何地圖技術，只有清單） |
| F. 清單 + 外部「在 Google 地圖開啟」深連結 | 純 `<a href="https://www.google.com/maps/...">` 外部連結，不在站內嵌入地圖 | 否（深連結不需要 API Key，不同於 Embed API/JS API） | 無站內互動能力，離開本站後才看到地圖 |

### 1.2 類別 A：互動式 Leaflet 地圖（8 個元件，全站主力）

全站以 `grep -rn "MapContainer" components/` confirm 共 **8 個**元件使用 `react-leaflet` 的
`<MapContainer>`：

| 元件 | 主要使用頁面 | 座標來源 | 使用者定位 | 視角控制 |
|---|---|---|---|---|
| `components/Facilities/FacilityMap.tsx` | **約 35+ 個 `/tools/*` 機構型頁面**（透過共用的 `components/Facilities/FacilitySearchContent.tsx`，例如 `adult-preventive-care`、`baby-friendly-hospitals`、`clinics`、`kindergartens`、`pharmacies`…）以及 `PublicArtContent.tsx`（公共藝術） | 站內機構資料庫 | `useGeolocation()` | ✅ 已接 `MapViewController`（flyTo 平滑動畫） |
| `components/Tools/AedMapLeaflet.tsx` | `/tools/aed`（AED 地圖，經 `AedContent.tsx` `dynamic(ssr:false)`） | 站內 AED 資料庫 | `useGeolocation()` | ✅ 已接 `MapViewController` |
| `components/HeritageMap/HeritageMapLeaflet.tsx` | `/tools/heritage-map` | 文化資產開放資料 | `useGeolocation()` | ✅ 已接 `MapViewController` |
| `components/DisasterMap/DisasterMapLeaflet.tsx` | `/tools/disaster-map` | 避難收容所/災害示警開放資料 | `useGeolocation()` | ✅ 已接 `MapViewController` |
| `components/ContraceptionMap/ContraceptionMapLeaflet.tsx` | `/tools/contraception-map` | 事後避孕藥供應站資料 | `useGeolocation()` | ✅ 已接 `MapViewController` |
| `components/BreastfeedingRooms/BreastfeedingMapLeaflet.tsx` | 哺集乳室頁面 | 站內哺集乳室資料庫 | `useGeolocation()` | ✅ 已接 `MapViewController` |
| `components/Tools/CpcStationMap.tsx` | `/tools/cpc-stations`（經 `CpcStationsClient.tsx`） | 中油站點資料 | `useGeolocation()` | ✅ 已接 `MapViewController`（2026-09-14 的 `cpc-station-map-shared-controller-gap.md` 工單已修復並確認上線） |
| `components/WaterOutages/WaterOutagesLeaflet.tsx` | `/tools/water-outages`（經 `WaterOutagesContent.tsx`） | 停水開放資料 | `useGeolocation()` | ⚠️ **未接**共用元件，自己在檔案內重新宣告了同名的本地 `MapViewController` function（44-56 行），用 `map.setView()` 瞬間跳轉而非 `flyTo` 平滑動畫；`userLocationIcon` 顏色也不同（indigo `#6366f1` vs. 共用版本的藍色 `#3b82f6`） |

**共通技術特徵（8 個元件一致）**：

- 套件：`leaflet@^1.9.4` + `react-leaflet@^5.0.0`（`package.json` 唯一的地圖渲染函式庫）。
- Tile 來源：**全部 8 個元件都直接打 `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`**（OSM
  官方原始 tile server），無任何自架 tile 或商業 tile provider，無需 API Key、無金錢成本。
- Marker 圖示修正 boilerplate（`delete L.Icon.Default.prototype._getIconUrl` + 改指到
  `cdn.jsdelivr.net/npm/leaflet@1.9.4/...` 的圖示檔）**在 8 個檔案裡逐字重複貼了 8 次**，未抽成共用
  module。
- 全部透過 Next.js `dynamic(() => import(...), { ssr: false })` 載入（Leaflet 依賴 `window`，
  無法 SSR），這個模式在 8 個檔案裡是一致的。
- 全部使用 `useGeolocation()`（`components/Facilities/useGeolocation.ts`）取得使用者定位，未取得
  權限時預設回退到台北101。

**視角控制的一致性缺口（現有、非本次新發現，但先前工單只查到部分）**：
`docs/specs/cpc-station-map-shared-controller-gap.md`（2026-09-14）曾記錄「7 個 MapContainer
元件中有 6 個已接共用 `MapViewController`」並已修復 `CpcStationMap.tsx` 這個缺口。**但該工單的
掃描清單漏了 `WaterOutagesLeaflet.tsx`**（可能是該元件在稽核當下尚未存在，或掃描時遺漏）。
截至本報告撰寫時，`WaterOutagesLeaflet.tsx` 仍是 8 個 Leaflet 元件中唯一一個沒有接上
`components/Common/MapViewController.tsx` 的，且其本地重新實作的版本體驗較差（無平滑動畫）。
**這是本次盤點中唯一一個成本極低（改幾行、刪掉重複的 function、換一個 import）、風險也極低的
具體可執行項目**，與「是否要統一整個地圖技術方案」這個大問題無關，值得單獨拉一張小工單處理。

### 1.3 類別 B：iframe 內嵌 OSM 地圖（現況基準線，issue #338 合併後即消失）

`components/News/NewsMapCard.tsx`：新聞文章頁的「相關地理位置」卡片。

- 預設**不**顯示地圖，使用者點擊「展開互動地圖 🗺️」按鈕後，才動態渲染一個
  `<iframe src="https://www.openstreetmap.org/export/embed.html?...">`。
- 另外提供兩個外部深連結：「Google 地圖導航」（`google.com/maps/search/?api=1&query=lat,lng`）與
  「OpenStreetMap 檢視」（`openstreetmap.org/?mlat=...`）。
- 不使用 Leaflet、不使用 `react-leaflet`，是全站唯一一個用 `<iframe>` 嵌入地圖的元件。
- **此元件已被獨立工單（issue #338）判定為要整個移除**，故不計入下一節「需要統一」的清單。

### 1.4 類別 C：伺服器端裝飾性 SVG（不是真地圖，勿與 D/E 混淆）

`lib/server/news/staticMap.ts` 的 `generateStaticMapSvg()`：

- 純手刻 SVG（漸層深色背景、幾條裝飾用的假造道路曲線、雷達脈衝圓圈、定位大頭針圖示、左上角
  地名/座標文字卡片），**沒有任何真實地理資料**，座標只是印成文字疊上去，不對應實際地圖投影。
- 用途是新聞文章在缺乏其他候選圖片時的**卡片縮圖/OG image 保底來源**（`provider = 'static_map'`
  寫入 `news_card_images`），不是給使用者看「這個地點在哪裡」的地圖，是視覺裝飾。
- 因為是伺服器端純函式產生純文字 SVG（無需 headless browser/WASM 渲染），沒有踩到既有記憶中
  「這台主機无法跑任何 WASM-based 渲染」的地雷（`ops_health_502_watchdog.md`），技術選型本身安全。
- 這個用途（缺圖保底裝飾圖）跟本報告要討論的「地圖技術一致性」關聯度低，**建議排除在統一範圍外**——
  它從來就不打算是一張可信賴的地圖，統一成 Leaflet 或任何真實地圖技術反而是殺雞用牛刀（需要
  server-side 渲染真實地圖 tile 成靜態圖片，可能需要額外服務）。

### 1.5 類別 D：規格書背景描述有誤植，需更正——`LocalWeatherSvgWidget.tsx` 其實沒有地圖

規格書 `map-technology-consistency-audit.md` 第 12 行原始描述將
`components/Tools/LocalWeatherSvgWidget.tsx` 稱為「自製 SVG 地圖」。**實際讀完整個檔案（246 行）
後確認這個描述不準確**：

- 這個元件是側欄的「即時在地天氣」小工具，內含的 SVG 只是**天氣狀況圖示**（晴天太陽、雨天雲朵+雨滴、
  雷雨閃電等 4 種圖示，依 `weather` 文字關鍵字判斷要顯示哪個），與地理位置的視覺化毫無關係。
- 使用者切換地點的 UI 是一個純文字 `<select>` 下拉選單（21 個縣市名稱 + GPS 自動定位），**沒有任何
  地圖、沒有可點擊的地理座標視覺化**。
- 全站搜尋「台灣形狀 SVG path」「TaiwanMap」等關鍵字亦未找到任何其他自製 SVG 地圖元件。

**結論：全站目前沒有真正的「自製 SVG 地圖」元件。** 這一項不需要、也無法被「統一」，因為它本來就不是
地圖技術的一種用法，建議規格書背景描述以本報告為準予以更正，避免後續工單誤以為還有一個 SVG 地圖
待處理。

### 1.6 類別 E：頁面標題含「地圖」但完全沒有渲染任何地圖（新發現，建議另立工單）

`app/tools/inundation-map/page.tsx`（經 `components/Tools/InundationMapContent.tsx`，480 行）：

- 頁面標題與 H1 文案為「全台積淹水即時感測地圖」「天然災害示警與避難地圖」。
- 但 `grep -n "leaflet\|Leaflet\|MapContainer\|<svg\|canvas\|Canvas" InundationMapContent.tsx`
  **完全沒有任何匹配**——沒有 Leaflet、沒有 SVG、沒有 Canvas、沒有 iframe，什麼地圖渲染技術都沒用到。
- 實際內容是：感測站清單卡片（依距離排序）、河川水位警戒清單、避難所清單，加上
  `components/Common/MapLocationBanner.tsx`（一個純文字/圖示的定位狀態橫幅，例如「已成功取得您的
  即時定位」「顯示預設位置：臺北101」），**`MapLocationBanner` 這個名字本身也容易誤導**——它是狀態
  提示條，不是地圖。
- 對照同樣主題的 `DisasterMap`（`/tools/disaster-map`，避難收容所）**已經是完整的 Leaflet 地圖**，
  兩者資料性質相近（都是防災/避難相關空間資訊），但呈現方式完全不同，是本次盤點中「同類需求、不同
  做法」最明顯的一個落差。
- **這不是本工單的範圍**（本工單只盤點與建議，不動程式碼），但建議另立一張獨立工單評估：
  (a) 是否要把 `InundationMapContent` 也做成 Leaflet 地圖（跟 `DisasterMapLeaflet.tsx` 共用底圖），
  或 (b) 若維持清單形式是刻意的產品決策，應該調整頁面文案，拿掉「地圖」兩字，避免使用者點進來
  找地圖卻找不到。

### 1.7 類別 F：清單 + 外部 Google 地圖深連結（無站內地圖，本身不算「不一致」）

以下元件**完全沒有嵌入任何地圖**，只是每筆資料旁邊放一個「在 Google 地圖開啟」的外部連結
（`https://www.google.com/maps/search/?api=1&query=...` 或
`https://www.google.com/maps/dir/?api=1&destination=...`），點下去會離開本站、在使用者裝置上開啟
Google 地圖 App 或網頁版：

- `components/Tools/EmergencyRoomContent.tsx`
- `components/PetAdoption/PetAdoptionContent.tsx`
- `app/tools/npo-organizations/NpoOrganizationsContent.tsx`
- `components/Epidemic/TravelEpidemicAlertsContent.tsx`
- `components/Tools/YoubikeContent.tsx`
- `components/Activities/CulturalEventsContent.tsx`

**這種「Google 地圖深連結（deep link）」用法本身技術上很單純、無需 API Key、無用量限制、無費用**——
它就是一個普通超連結，跟 Google Maps Embed API 或 JavaScript API（那些才需要 API Key 且有用量計費）
完全是两回事。全站另外有 8 個 Leaflet 地圖元件（見 1.2 節）在地圖內的每個標記 Popup 裡，**也**會
附上同樣格式的 Google 地圖深連結（例如 `AedMapLeaflet.tsx:172`、`DisasterMapLeaflet.tsx:261`），
當作「在地圖上看完後，一鍵開 Google 地圖規劃路線」的輔助功能——這個深連結格式在全站 15+ 個檔案裡
高度一致（都是官方 `api=1` 格式），**不需要納入統一範圍**，因為它不是「地圖顯示技術」，而是「導航
交接」功能，且已經一致。

上述 6 個「純清單」元件是否要補上站內 Leaflet 地圖是產品決策（例如：YouBike、動物送養、NPO
名冊這類資料是否真的需要地圖視覺化，或清單+距離排序+外部連結就已足夠），**不在本報告建議統一的
範圍內**，僅在此列出供人工判斷。

---

## 2. 統一可行性評估

### 2.1 真正需要「選一個地圖技術方案」的範圍，其實只有類別 A

盤點完六大類後，可以先排除不需要統一決策的部分：

- 類別 B（`NewsMapCard.tsx`）：即將被 #338 移除，不需要決策。
- 類別 C（裝飾性 SVG）：本來就不是地圖，不適合統一，也不應該統一。
- 類別 D（誤植的「SVG 地圖」）：不存在，不需要決策。
- 類別 E（`inundation-map` 無地圖）：是否要「補上」地圖是產品/內容決策，不是「技術一致性」問題；
  若之後決定要補，直接沿用類別 A 的方案即可，不會產生新的技術分歧。
- 類別 F（清單+外部連結）：技術上已經一致（都是標準 Google Maps deep link 格式），且是否要升級
  成站內地圖是產品決策，不是技術不一致的問題。

**真正的「統一」問題只剩類別 A 內部**：8 個 Leaflet 元件已經是**同一套技術**
（`react-leaflet` + `leaflet` + 原始 OSM tile），差異只在於：

1. `WaterOutagesLeaflet.tsx` 沒接共用的 `MapViewController`（見 1.2 節，成本極低的獨立小修）。
2. 8 個檔案各自重複貼了同一段 marker 圖示修正 boilerplate，沒抽成共用 module。
3. **全部 8 個元件共同面對同一個風險**：直接呼叫 OSM 官方原始 tile server
   （`tile.openstreetmap.org`），這才是本節真正該評估「統不統一」「要不要換」的核心問題——但不是
   「換成另一套渲染函式庫」，而是「換一個 tile 圖磚來源」。

### 2.2 OSM 原始 tile server 的用量政策風險（本次盤點的重點發現）

透過即時網路搜尋查證 OSM 官方 Tile Usage Policy（`operations.osmfoundation.org/policies/tiles/`）：

- OSM 的 `tile.openstreetmap.org` **完全由社群捐款的硬體與頻寬支撐**，官方政策明文將「量體較大的
  正式上線商業性地圖網站（a commercial map-based website in production）」列為「重度使用
  （heavy use）」的例子之一，並註明重度使用**可能未經通知就被封鎖**，且服務本身**沒有 SLA、
  沒有可用性保證**。
- 政策也明文**禁止離線／預先下載整區塊 tile 快取**的用法（本站目前沒有這樣做，屬合規）。
- 本站目前 8 個 Leaflet 地圖元件、涵蓋 35+ 個 `/tools/*` 頁面，**全部**直接打官方原始 tile server，
  沒有自架 tile、沒有改用任何商業 tile provider（MapTiler／Stadia Maps／Geoapify 等）——雖然
  health.j172.tw 目前流量規模應該遠稱不上「重度使用」，但這是一個**長期成長後會浮現的合規/穩定性
  風險**，而非現在就會出事的緊急問題。
- 對照既有記憶（`ops_health_502_watchdog.md`、`ops_ingestion_counters_and_deploy_timing.md`）與
  `docs/specs/free-tier-tooling-recommendations-20260914.md` 已確立的方針（偏好免帳密/低風險/
  零額外主機負擔的免費方案），**這個風險目前屬於「值得記錄、不急著動」的等級**，不建議現在就換
  tile provider，但應該在報告中明確點出，供未來流量成長或收到 OSM 封鎖通知時參考。

### 2.3 業界對中小型內容網站地圖技術選型的常見考量（網路查證）

透過即時 WebSearch 查證多篇 2026 年技術比較文章與 OSM 官方文件後，歸納中小型內容型網站
（本站規模：新聞 + 60+ 工具頁，非地圖為核心產品）常見的選型考量：

1. **渲染函式庫層**：多篇 2026 比較文章（PkgPulse、GIS People、Pi Stack 等）一致建議
   「單純標記+彈出視窗+底圖」需求維持用 **Leaflet**（42KB gzipped，最輕量、生態成熟），
   只有需要向量 tile、3D 地形、執行期切換樣式時才需要升級到 MapLibre GL JS（~200KB
   gzipped）。**本站的 8 個地圖元件全部都是「標記+彈出視窗+底圖」這種最基本的需求**，符合
   「應該留在 Leaflet」的建議，不需要為了統一而升級渲染函式庫。
2. **Tile 圖磚來源層**：這才是真正該評估的層面（見 2.2 節）。業界對正式上線的商業/準商業站台，
   常見做法是三選一：(a) 改用商業 tile provider 的免費/低價方案（MapTiler 免費方案：5,000 次
   地圖 session/月；Stadia Maps 免費方案：無需信用卡，maps+geocoding+routing 共用一組額度）；
   (b) 自架 tile server（如 `Martin`、`tileserver-gl`），需要額外主機資源；(c) 維持使用 OSM
   原始 tile 但控制在「輕度使用」等級並持續關注政策。
3. 對本站已知的主機限制（HawkHost 共享主機、既有的 LVE process ceiling / 記憶體上限事故，見記憶
   `ops_health_502_watchdog.md`）而言，**(b) 自架 tile server 的代價明顯過高**——這台主機已經
   因為 `next/og` 的 WASM 渲染撐爆過記憶體上限，不適合再疊加一個需要持續運算/快取磁碟空間的 tile
   渲染服務。

---

## 3. 具體建議

### 3.1 建議維持現狀（不要現在就大改地圖渲染技術）

全站 8 個真正的地圖元件已經是同一套技術（Leaflet），這件事本身**不是問題**——不需要為了「統一」
而把它們換成另一套函式庫（如 MapLibre GL、Google Maps JS API）。理由：

- 需求都很單純（標記＋彈出視窗＋底圖＋定位飛行動畫），Leaflet 完全夠用，換更重的方案是負代價。
- 換成 Google Maps JS API 需要 API Key + 計費帳戶，且本站在地理編碼那條線上已經因為「需要綁定
  信用卡、忘記關閉會被扣款」的風險而主動選擇不用 Google（見 `lib/server/facilities/geocode.ts`
  的既有註解與 `free-tier-tooling-recommendations-20260914.md` 的既有結論），地圖顯示層沒有理由
  違背這個已經定調的方針。
- 8 個元件目前的差異只是「有沒有接上共用元件」的程度問題，不是技術路線分歧，用小修就能拉齊。

### 3.2 建議事項（依優先級）

| 優先級 | 建議事項 | 預估改動檔案數 | 理由 |
|---|---|---|---|
| **高（可獨立拉一張小工單，成本低風險低）** | 把 `WaterOutagesLeaflet.tsx` 的本地 `MapViewController`／`userLocationIcon` 換成 import 共用的 `components/Common/MapViewController.tsx`，做法比照 `cpc-station-map-shared-controller-gap.md` 已完成的修法 | 1 個檔案 | 讓 8/8 而非 7/8 的地圖使用者定位體驗一致（平滑 flyTo 動畫），是本次盤點中唯一「現在就該修」的具體缺口 |
| **中** | 把 8 個 Leaflet 元件裡逐字重複的 marker 圖示修正 boilerplate（`delete L.Icon.Default.prototype._getIconUrl` + 3 行 jsdelivr URL）抽成 `components/Common/` 底下一個共用的初始化 function/module | 8 個檔案各刪 6 行、新增 1 個共用檔、8 處各加 1 行 import | 純粹的重複程式碼清理，跟本次「地圖技術一致性」直接相關，但風險極低（純搬移，行為不變），可與上一項一起處理 |
| **中** | 另立獨立工單，釐清 `app/tools/inundation-map` 究竟要不要做成 Leaflet 地圖，或先把頁面文案的「地圖」用詞拿掉 | 視決策而定：0 個檔案（只改文案）或 1-2 個檔案（比照 `DisasterMapLeaflet.tsx` 補地圖） | 目前「標題喊地圖、內容沒地圖」是使用者體驗上的落差，且與本次盤點主題（地圖技術一致性）密切相關，但屬於產品決策範疇，不應該在本報告內直接動手 |
| **低（記錄在案，暫不執行）** | 持續觀察 OSM 原始 tile server 用量政策；若站方流量顯著成長、或曾收到 OSM 存取異常/封鎖跡象，優先評估 **Stadia Maps 免費方案**（不需信用卡）或 **MapTiler 免費方案**（5,000 map sessions/月）作為 tile 來源替代，而非自架 tile server（本站主機資源限制已有多次事故紀錄，見 `ops_health_502_watchdog.md`） | 若真的要換：8 個檔案的 `<TileLayer url="...">` 那一行 + 若使用 MapTiler/Stadia 需要的環境變數 | 目前站台規模判斷尚未觸及 OSM 政策所稱「重度使用」等級，現在就換供應商是預防性成本大於當下風險的決策，符合站方一貫「免帳密/低風險優先」的方針，但應記錄下來供未來參考 |
| **低（不建議現在做）** | 把 6 個「清單 + 外部 Google 地圖連結」的類別 F 元件升級成站內 Leaflet 地圖 | 6 個檔案（若要做，直接重用 `FacilityMap.tsx` 或抽出更通用的清單型地圖元件） | 這些頁面（YouBike、動物送養、NPO 名冊等）目前的清單+外部連結模式運作正常，是否需要地圖視覺化屬於產品優先級判斷，非技術債，建議留給站方決定是否值得投入 |

### 3.3 需要保留例外、不適合被統一的既有用法

- **`lib/server/news/staticMap.ts` 的裝飾性 SVG**（類別 C）：**不應該**被統一成 Leaflet 或任何
  真實地圖 tile 技術。它的用途是「新聞卡片沒有更好圖片時的保底裝飾圖」，不是給使用者看真實地理
  資訊，換成需要抓取 tile 圖磚再合成的方案，會把一個純 CPU、零外部依賴的 fallback 機制，變成一個
  需要網路請求、可能失敗、且與其設計初衷（純裝飾）不成比例的複雜依賴。**這是唯一一個因為「特殊需求
  ——需要零外部依賴、伺服器端純函式產生」而應該明確保留例外的既有用法。**
- **類別 F 的 Google 地圖深連結**：不是需要「統一」的地圖顯示技術，是導航交接功能，且已經一致
  （見 1.7 節），不應該被誤判為需要處理的技術債。

---

## 4. 總結

1. 全站唯一需要被視為「地圖顯示技術」且需要一致性判斷的，是 8 個 `react-leaflet` 元件（類別 A）——
   它們**已經是同一套技術**，差異僅止於「有沒有接共用元件」的實作細節（1 個明確缺口：
   `WaterOutagesLeaflet.tsx`），不存在需要「選邊站」的技術路線分歧。
2. 規格書原本認定的「自製 SVG 地圖」（`LocalWeatherSvgWidget.tsx`）經查證後**並不存在**，該檔案
   只是天氣圖示 + 縣市下拉選單，建議更正這個認知。
3. 本次盤點新發現一個規格書未提及的落差：`app/tools/inundation-map` 頁面標題自稱「地圖」，但
   完全沒有使用任何地圖渲染技術，建議另立工單處理（屬產品決策範疇）。
4. 真正的中期風險不是「技術路線不一致」，而是全站 8 個地圖元件**共同**直接依賴 OSM 官方原始 tile
   server，長期而言有觸及其重度使用政策的風險——建議記錄在案、持續觀察，暫不需要現在就採取行動。
5. 本工單不建議任何「大重構」，建議拆成 1 張低成本小工單（`WaterOutagesLeaflet.tsx` 接上共用
   `MapViewController`）立即可做，其餘建議事項留待人工複核後個別決定是否值得投入。
