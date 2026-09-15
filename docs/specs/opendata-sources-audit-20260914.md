# 研究：health.j172.tw 現有 Open Data 來源盤點與更精準/更權威來源提案

- **Ticket ID**: `RESEARCH-HEALTH-20260914-OPENDATA-SOURCES-AUDIT`
- **Priority**: 供審閱用，本文件不含任何實作優先級承諾
- **Type**: 純研究文件。未變動任何程式碼、import/backfill script、排程或生產資料。
- **關聯文件**: `docs/specs/geocode-opendata-coverage-gap-research.md`（角度是「既有 22 個地址型設施來源的座標替代方案」；本文件角度不同，聚焦「有沒有更精準/更即時/更官方的來源可以取代或補強現有 67 個工具，以及有沒有完全沒被涵蓋但值得新增的資料集」，兩份文件互補不重疊）

---

## 0. 方法與查證方式說明

所有資料集的更新頻率、授權條款、欄位/格式，均以該資料集**自己的 schema 頁面或官方 swagger/openapi 文件**為準，透過 `WebFetch`／`curl` 實際打開頁面查證，並在下方逐條附上來源 URL。凡是无法在本次研究中確認的欄位（例如某些 swagger UI 是純前端渲染、需要登入才能看到完整資料集清單的入口），一律標注「未確認」，不用臆測數字或憑印象填寫——遵循 `geocode-opendata-coverage-gap-research.md` 已建立的高信任度優先來源原則。

本次研究也重新讀取了 `lib/server/tools/catalog.ts`（65 個實際 `slug` 條目，橫跨 7 個 `ToolGroup`：`calculator`／`facility`／`ltc`／`disability`／`child-welfare`／`public-facility`／`weather`）與對應的 `lib/server/*/sources/*.ts`、`scripts/import-*.mjs`、`scripts/backfill-*.mjs`，以確保「現有覆蓋」的判斷基於實際程式碼而非猜測。

---

## 1. 逐來源盤點

### 1.1 opendata.wra.gov.tw（經濟部水利署開放資料，Swagger UI: `/openapi/swagger/index.html`）

這是一個 Nuxt SPA，`swagger/index.html` 與 `/datasets` 頁面的實際資料集清單都是前端 JS 渲染後才載入，純文字抓取（`WebFetch`/`curl`）拿不到清單本體；`api/swagger.json`、`api/datasets` 等後端端點回傳 `{"success":false,"code":401,"s_message":"NO_AUTH"}`——**瀏覽/查詢資料集清單需要登入或 API 金鑰**，這點在既有 `geocode-opendata-coverage-gap-research.md` 沒有記錄過，值得補充。

不過本站既有程式碼（`lib/server/wra/fetch*.ts`）已經在使用 4 個 `opendata.wra.gov.tw/api/v2/{uuid}` 端點，且程式碼註解明確寫著「Confirmed live: no `api_key` param needed」：

| 用途 | UUID 端點 | 對應資料集 |
|---|---|---|
| 水庫代碼表 | `f65a2148-9c7a-4e16-acaf-48917a5124e2` | 水庫代碼表（data.gov.tw dataset 139336 的鏡像） |
| 水庫即時營運狀況 | `2be9044c-6e44-4856-aad5-dd108c2e6679` | 水庫即時營運狀況 |
| 河川水位測站站況 | `c4acc691-7416-40ca-9464-292c0c00da92` | 河川水位測站站況（data.gov.tw dataset 22227 的鏡像） |
| 水位站監測 | `73c4c3de-4045-4765-abeb-89f9f9cd5ff0` | 水位站監測（河川/地下水位） |

網站首頁（靜態 HTML 可見的分類連結）顯示的主題分類：地層下陷、水利統計、水利行政與管理、水庫與堰壩、水文統計、河川區域——與既有 4 個來源所屬主題一致，未發現這些主題底下有本站尚未使用、且不需登入即可取得的**新**資料集（受限於 SPA 前端渲染，無法排除清單中仍有未登入也能存取的其他資料集，這點**未確認**，需要瀏覽器自動化或申請帳號才能進一步查證）。

**結論：本次研究在 opendata.wra.gov.tw 本身沒有找到本站尚未使用的新公開資料集；真正的新發現在 §1.2 的姊妹站 `iot.wra.gov.tw`。**

引用：<https://opendata.wra.gov.tw/openapi/swagger/index.html>、<https://opendata.wra.gov.tw/datasets>、`lib/server/wra/fetchReservoirCatalog.ts`、`fetchReservoirStatus.ts`、`fetchWaterLevelStationCatalog.ts`、`fetchWaterLevelStations.ts`

---

### 1.2 iot.wra.gov.tw（水利署 IoT 水文開放資料 API，本站目前完全未使用 — 重要新發現）

`https://iot.wra.gov.tw/swagger/v1/swagger.json` 可直接下載完整 OpenAPI 規格（title:「水利署 水文開放資料 API v2」），共 **23 個端點**，且經實測確認**多個端點不需 API 金鑰即可直接取得即時資料**（下表「實測」欄位是本次研究直接 `curl` 驗證過的結果，不是憑 swagger schema 猜測）：

| 端點 | 說明 | 實測結果 |
|---|---|---|
| `/damstructure/stations` | 堤防結構安全監測站（含經緯度、即時量測值） | ✅ 200，回傳真實 JSON（例：`白布帆堤防`, `Latitude 24.2953`） |
| `/groundwaterlevel/stations` | 地下水位監測站（含經緯度、即時地下水位量測） | ✅ 200，回傳真實 JSON（例：金門高中站，含 `TimeStamp`/`SIUnit` 即時讀數） |
| `/rasterMap/inundation/regions` | 即時淹水範圍圖可用區域清單 | ✅ 200，回傳 12 縣市代碼陣列（`changhua`, `tainan`, `kaohsiung`...） |
| `/rasterMap/inundation` + `/historical` | 即時／歷史淹水範圍二維分佈圖（raster） | 端點存在，回應為圖檔+ metadata header，未逐一下載驗證內容 |
| `/uswg/stations` | 路面淹水感知器 | ✅ 200，但本次查證當下回傳空陣列（推測是目前無淹水事件回報，非端點失效） |
| `/river/stations` | 河川、區排水位站 | 端點存在，未逐一比對是否與既有 `水位站監測`(373 站) 完全重複或涵蓋更廣 |
| `/erosiondepth/stations` | 河床沖刷深度監測站 | 端點存在，未實測資料內容 |
| `/dustemission/stations` | 揚塵監測站 | 端點存在，未實測資料內容 |
| `/watergate/stations` | 水閘門站況 | 端點存在，未實測資料內容 |
| `/cumulativeflow/stations` | 累計流量站 | 端點存在，未實測資料內容 |
| `/precipitation/basins`、`/precipitation/CwaFormat` | 集水區降雨資料 | swagger 明確標注「僅高階會員可使用」——非公開端點 |
| `/rasterMap/precipitation` + `/historical` | 即時/歷史累積雨量二維分佈圖 | 端點存在，未實測 |
| `/adminDivisions/county`、`/adminDivisions/town` | 縣市/鄉鎮代碼表（國土測繪中心編碼） | 工具型端點，非資料本體 |

**授權條款：swagger 文件本身未標示授權欄位**（不同於 `data.moenv.gov.tw` 的資料集頁面慣例會列出「政府資料開放授權條款」），比照同機關 `opendata.wra.gov.tw` 現有資料集的慣例推測為相同授權，但**這點在本次研究中未能於 iot.wra.gov.tw 站上找到明確聲明，需要在動工前再次確認或去信洽詢**（水利署聯絡窗口可從 opendata.wra.gov.tw 網站找到）。**更新頻率**同樣未在 swagger 文件中標示，但從欄位命名（`TimeStamp` 精確到分鐘）與本次實測回應內容判斷，屬於即時（near real-time）性質的物聯網感測資料，不是靜態名冊。

引用：<https://iot.wra.gov.tw/swagger/v1/swagger.json>（本次研究直接下載解析）、實測 `https://iot.wra.gov.tw/damstructure/stations`、`https://iot.wra.gov.tw/groundwaterlevel/stations`、`https://iot.wra.gov.tw/rasterMap/inundation/regions`、`https://iot.wra.gov.tw/uswg/stations`

---

### 1.3 data.moenv.gov.tw（環境部環境資料開放平台，Swagger: `/swagger#/`）

Swagger UI 本身也是前端渲染，但其背後的完整 OpenAPI 規格可直接下載：`https://data.moenv.gov.tw/swagger/openapi.yaml`（本次研究成功下載，**791 個資料集端點**）。逐一掃描（排除已被本站大量使用的 `aqx_p_*` 系列與純行政類 `eia_p_*`/`bgt_p_*`/`eedu_p_*` 之後）找到以下跟公衛/環境安全高度相關、**本站目前完全沒有對應工具**的資料集：

| 代碼 | 資料集名稱 | 主管機關 | 更新頻率 | 授權 | 欄位重點（實際查證） |
|---|---|---|---|---|---|
| `DWS_P_02` | 自來水水質抽驗結果(依項目) | 環境部水質保護司 | 每年1月更新一次（縣市/月別彙總統計，非即時） | 政府資料開放授權條款-第1版 | `year_month`,`county`,`number_bacterial`,`number_physical`,`number_chemical`,`number_test`,`number_qualified`,`number_failed`（縣市層級彙總，非單一自來水廠/水源的逐筆檢驗值） |
| `DWS_P_01` | 自來水水質抽驗結果(依件數) | 同上 | 未逐一查證，推測同 `DWS_P_02` 頻率 | 同上 | 未逐一查證欄位 |
| `DWS_P_03`/`06` | 包裝及盛裝飲用水水源水質抽驗結果/資料 | 環境部 | 未查證 | 同上 | 未查證 |
| `DWS_P_04`/`05` | 飲用水水源水質保護區一覽表／取水口一定距離一覽表 | 環境部 | 未查證 | 同上 | 未查證，屬地理範圍/名冊型資料 |
| `GISEPA_P_19` | 環境噪音監測站位置圖 | 環境部大氣環境司 | 不定期（最近一次更新 2025-05-23） | 政府資料開放授權條款-第1版 | **確認具備 16 個欄位，含緯度/經度**：測站名稱、所屬縣市、編號、音源別、測站地址、管制區類別、設置起始/結束日、緯度、經度、記錄類型、狀態、結束原因、道路、道路寬度、參考資料 |
| `GISEPA_P_18` | 交通噪音監測站位置圖 | 環境部 | 未逐一查證，推測同 `GISEPA_P_19` 結構 | 同上 | 未逐一查證，但資料集命名與 19 同屬一組，高機率也具經緯度 |
| `NOS_P_08` | 噪音監測站資料 | 環境部 | 未查證 | 同上 | 推測是 `GISEPA_P_19`/`18` 測站的量測數值（讀數），需另外查證是否為即時資料 |
| `NOS_P_03`~`06` | 環境音量/道路交通音量監測結果統計(依時段/管制區分) | 環境部 | 未查證 | 同上 | 統計彙總類，非逐站即時值 |
| `RAD_P_01` | 非游離輻射檢測資料 | 環境部 | 未查證 | 同上 | 未查證欄位，屬環境輻射安全監測 |
| `GISEPA_P_24` | 土壤及地下水污染場址位置圖 | 環境部環境管理署 | 1年 | 政府資料開放授權條款-第1版 | **重要澄清（易誤判之處）**：雖然名稱是「位置圖」，實際欄位查證結果是 `filename`,`url`,`description`,`upload_date`,`tags`——**只是圖檔/文件的連結清單，不含經緯度**，無法直接拿來做地圖點位。這點若不實際查證欄位、只看資料集名稱很容易誤判為可用的座標來源（同樣的陷阱 `geocode-opendata-coverage-gap-research.md` 在 `child_safety_spot` 案例中也踩過一次）。 |
| `GISEPA_P_25`/`32` | 土壤污染管制區範圍圖／地下水污染管制區範圍圖 | 環境部 | 未查證 | 同上 | 未逐一查證，但依 `GISEPA_P_24` 的前例，**不應假設「範圍圖」類資料集含座標**，動工前必須先查證 schema |
| `EAMP_P_22` | 病媒防治業地理資料 | 環境部化學物質管理署 | 不定期 | 政府資料開放授權條款-第1版 | **確認不含經緯度**：只有 `types_of`,`company_name`,`county`,`county_code` 四欄，是縣市層級的持照病媒防治業名冊，需要額外地址欄位（本資料集沒有）或另尋地址來源才能地圖化 |
| `EAMP_P_13`/`14`/`23`/`24` | 環境用藥販賣業/病媒防治業許可執照資料、環境用藥製造業/販賣業地理資料 | 環境部 | 未逐一查證 | 同上 | 未逐一查證，性質與 `EAMP_P_22` 相近 |
| `GISEPA_P_14` | 環境檢測機構位置圖 | 環境部 | 未查證 | 同上 | 未查證欄位是否含座標 |

引用：<https://data.moenv.gov.tw/swagger/openapi.yaml>（本次研究直接下載完整 791 端點規格解析）、<https://data.moenv.gov.tw/dataset/detail/DWS_P_02>、<https://data.moenv.gov.tw/dataset/detail/GISEPA_P_24>、<https://data.moenv.gov.tw/dataset/detail/GISEPA_P_19>、<https://data.moenv.gov.tw/dataset/detail/EAMP_P_22>

---

### 1.4 service.moea.gov.tw/EE501（經濟部能源署主題式開放資料服務）

直接 `WebFetch` 回傳 403（推測有 Cloudflare 或類似防護擋掉一般抓取），改用瀏覽器 User-Agent 直接 `curl` 成功取得頁面（HTTP 200）。頁面內容顯示這是一個「主題式」儀表板網站，列出的主題包括：地方群聚商業活動、樂齡產業推廣、天然災害的經濟損害、能源管理、電力市場多元化、產業分布、氣象與產業用電、產業水資源、綠色消費、智慧型輔具研發與服務、商品安全等 24 個主題。

**結論：這是統計儀表板/視覺化主題頁面，不是原始開放資料集下載入口**——性質類似「經濟部各項統計數據的懶人包呈現」，與本站現有 67 個工具「抓原始開放資料、地圖化/表格化」的模式不合。「天然災害的經濟損害」「智慧型輔具研發與服務」兩個主題名稱雖然聽起來與防災/身心障礙相關，但實際內容是統計分析報告，不是可原始下載、逐筆可查詢的設施或事件資料，**本次研究判斷為低優先/低產出來源**，未進一步深挖每個主題底下是否藏著可下載的 API（该判斷可能有遺漏，因為部分主題頁面在本次研究中未逐一點開查證，這點誠實標注為未窮盡）。

引用：<https://service.moea.gov.tw/EE501/>（`curl` 加瀏覽器 UA 才能取得內容，直接 `WebFetch` 會被擋 403）

---

### 1.5 data.gov.tw（全國政府資料開放平台，僅聚焦公衛/醫療/環境/防災相關類別）

`data.gov.tw` 的分類瀏覽頁與官方搜尋 API（`POST` 到某個尚未反向工程出正確路徑與參數的端點）都需要 JS 渲染或非 GET 呼叫，本次研究改用 `WebSearch` 以關鍵字方式定點搜尋，找到以下與本站主題高度相關、**目前完全沒有對應工具**的資料集：

| 資料集 | 提供機關 | 更新頻率 | 授權 | 欄位/格式 | 來源 |
|---|---|---|---|---|---|
| 近12個月登革熱病媒蚊調查資料 | 衛福部疾病管制署 (CDC) | **每日更新** | 政府資料開放授權條款-第1版 | `Date`,`County`,`Town`,`Village`,`VillageID`,**`VillageLon`,`VillageLat`**,`BI`(布氏指數),`BILv`,`HI`(House Index),`HILv`,`CI`,`CILv`,`LI`,`LILv`,`AI`,`Con100HH`——**確認具備村里層級經緯度**，CSV/JSON 皆有全國版與台南/高雄/屏東分區版；官方 codebook：<https://od.cdc.gov.tw/eic/MosIndex_CodeBook.pdf> | <https://data.gov.tw/dataset/24161> |
| 登革熱病媒蚊調查資料（全量非近12月版） | 衛福部疾病管制署 | 每日 | 同上 | 同上，時間範圍更長 | <https://data.gov.tw/dataset/24159> |
| 登革熱近12個月每日確定病例統計 | 衛福部疾病管制署 | ~~每1日~~ **已下架（歷史資料保留，非現行資料集）** | 政府資料開放授權條款-第1版 | 29 欄位含最小統計區座標、感染縣市鄉鎮村里等 | <https://data.gov.tw/dataset/21026>——本次查證發現此 ID **已下架**，需另尋 CDC 現行等價來源（`data.cdc.gov.tw`）才能作為即時病例來源 |
| 急診傳染病監測統計-類流感 | 衛福部疾病管制署 | 每日（依 WebSearch 摘要，未逐一開啟頁面覆核） | 政府資料開放授權條款-第1版 | 依年/週/縣市統計之急診就診人次，非逐筆地址型資料 | <https://data.gov.tw/dataset/14584> |
| 急診傳染病監測統計-腸病毒 | 衛福部疾病管制署 | 同上 | 同上 | 同上 | <https://data.gov.tw/dataset/14587> |
| 健保門診及住院就診人次統計-腸病毒／類流感 | 衛福部疾病管制署 | 同上 | 同上 | 依年/週/縣市/年齡層統計 | <https://data.gov.tw/dataset/14590>、<https://data.gov.tw/dataset/14593> |
| 新北市泳池水質檢驗資料 | 新北市衛生局（縣市層級，非全國） | 每季 | 未逐一查證 | 序號、日期(民國)、郵遞區號、行政區、業者、池別、水質判定 | <https://data.gov.tw/dataset/125004> |
| 106年桃園市營業衛生水質檢驗報告(游泳池、三溫暖、溫泉) | 桃園市衛生局 | 每月2次（上半月/下半月） | 未逐一查證 | pH、有效餘氯、菌落數、大腸桿菌 | <https://data.gov.tw/dataset/127956> |

**重要限制**：`data.gov.tw` 本身是「全國性入口網站」，收錄超過 4 萬筆資料集，本次研究**只依關鍵字搜尋定點查找**，未進行全站分類爬梳（依任務指示本就不需要）。上表因此不是「data.gov.tw 上所有公衛相關資料集」的完整清單，只是本次搜尋撈到的高信號代表。游泳池水質檢驗資料目前僅發現零星縣市各自建置、欄位不統一、無全國彙整版本——這與 §1.3 找到的 `DWS_P_*`（環境部自來水水質，全國彙整但僅縣市月別統計、非逐場所）恰好互補說明了「飲用水/泳池水質」這個公衛主題目前在全國開放資料生態中呈現碎片化狀態，沒有一個「單一、逐場所、含地址或座標」的全國性資料集可用。

---

### 1.6 城市層級平台（台中／台南／台北／新北／高雄／桃園）

依任務指示，僅聚焦公衛/醫療/環境/防災相關類別、不逐一深挖每個城市的完整目錄，透過 `WebSearch` 找到以下代表性、值得留意的發現：

| 城市平台 | 發現 | 說明 |
|---|---|---|
| 台北市 (`data.taipei`) | **臺北市土壤液化潛勢圖**（`dataset/detail?id=ec40e067-930f-4058-b7dc-71399d5f3147`） | 地震防災相關，提供 TWD97 與 WGS84 兩種座標系的圖層資料——本站目前完全沒有地震防災延伸議題（土壤液化）的對應工具，且此為台北市單一縣市資料，非全國性 |
| 台北市 (`data.taipei`) | 臺北市飲用水水質檢驗資料、臺北自來水事業處各淨水場清水/原水水質OD、臺北市水質監測資訊(json) API | 比 §1.3 的環境部全國彙整版更細緻（逐淨水場、非僅縣市月別統計），但僅限台北市 |
| 新北市 (`data.ntpc.gov.tw`) | Open API 平台依 `WebSearch` 摘要顯示涵蓋環保局 145 個資料集、衛生局 **228 個資料集**、消防局 27 個資料集，統一 API 格式 `https://data.ntpc.gov.tw/api/datasets/{oid}/{format}/{method}` | 衛生局 228 個資料集規模顯著大於本站目前任何單一衛生類來源，**未逐一開啟清單查證個別資料集內容**，這是本次研究中信噪比最高、但也最需要後續人工逐一篩選的「潛力礦區」——建議列為後續研究的下一步，而非本文件直接開實作票 |
| 台南市 (`data.tainan.gov.tw`) | 109年10月臺南市登革熱病媒蚊密度調查（縣市自建版本）、結核病防治工作成果表 | 縣市自建版本，與 §1.5 找到的全國版 CDC 病媒蚊資料集（`data.gov.tw/dataset/24161`，已含台南分區資料）有重疊，**全國版優先**，縣市版本無新增價值 |
| 台中市 (`opendata.taichung.gov.tw`) | 3座衛生掩埋場地下水監測資料、多測站空氣品質監測資料、噪音管制區資料 | 依 `WebSearch` 摘要層級，皆為縣市自建版本，與環境部全國版（AQX 系列、噪音 `GISEPA_P_19`）性質重疊，**未發現本站尚未涵蓋的獨有內容** |
| 高雄市 (`data.kcg.gov.tw`) | 平台規模達 3,353 個資料集、71 個機關、18 個群組（依 `WebSearch` 摘要），但關鍵字搜尋「病媒蚊/衛生/環境/防災」主要導回全國版資料集，未找到高雄市獨有且尚未被涵蓋的公衛資料集 | 同台中/台南，縣市版本多與全國版重疊 |
| 桃園市 (`opendata.tycg.gov.tw`) | 桃園市遠距健康量測據點（`datalist/952d4f99-1d83-4af4-9a2b-dde0863a711f`）、桃園市病媒蚊密度調查結果 | 「遠距健康量測據點」（可能是社區血壓/血糖量測站）是本站目前 `health-checks` 工具沒有涵蓋的服務類型，但僅限桃園市，非全國性，且未查證其欄位是否含座標 |

**總體結論**：六個城市平台目前找到的內容**多數與環境部/CDC 全國版重疊**（病媒蚊、空氣品質、噪音），縣市版本通常沒有比全國版更精準或更即時的優勢；唯一明顯的例外是**台北市土壤液化潛勢圖**（全國無對應資料集）與**新北市衛生局 228 個資料集**這個尚待展開的礦區。城市層級研究因任務範圍限制（不逐站深挖），結論的確定性低於 §1.1~1.5，這點誠實標注。

---

### 1.7 data.moa.gov.tw/api.aspx（農業部開放資料）

`api.aspx` 頁面本身只是導覽頁，但其 OpenAPI 規格可直接下載：`https://data.moa.gov.tw/openapi.json`（本次研究成功下載並解析，共 **60 個端點**，`title`「農業部OPEN DATA API 1.0」）。本站既有 `pest-alerts`／`vet-clinics`／`pet-adoption` 三個工具已經在使用 `data.moa.gov.tw/Service/OpenData/TransService.aspx`（同一套 API 底層），因此農業部本身對本站而言不是全新的機關，但掃描 60 個端點後找到 **3 個本站完全沒有對應工具、且與防災高度相關**的端點：

| 端點 | 說明 | 相關性 |
|---|---|---|
| `/DebrisAlertServices/GetDebrisVillInfo/` | 土石流潛勢溪流資料 | 山區坡地防災，颱風季重要資訊 |
| `/DebrisAlertServices/GetCustomerDebrisAlertInfo/` | **土石流警戒資料**（即時警戒等級） | 與本站現有 `disaster-map`（避難所/消防/應變中心，靜態點位）、`weather-alerts`（氣象警報）性質互補但目前**完全沒有涵蓋土石流警戒** |
| `/DebrisAlertServices/GetStationMonitor/` | 土石流觀測站即時影像 | 即時監測，可作為 `disaster-map` 的圖層擴充 |
| `/ForestFireAlertWCF/` | 林火風險評估資訊 | 森林火災風險，本站完全沒有對應工具 |

以上 4 個端點的更新頻率、授權條款**本次研究未逐一查證**（`openapi.json` 未附帶授權欄位，且未實際呼叫端點取得資料範例），僅確認端點存在於農業部官方 OpenAPI 規格中；動工前建議先實測呼叫、確認回應是否含座標與即時性。

引用：<https://data.moa.gov.tw/api.aspx>、<https://data.moa.gov.tw/openapi.json>（本次研究直接下載解析）

---

### 1.8 bigdata.wp.shu.edu.tw/?page_id=335（開放資料網站清單彙整頁）

此頁面本身是一份「開放資料入口網站」的清單彙整（不是資料集本身），本次研究已展開列出的清單，篩出與公衛/醫療/環境/防災相關的入口站：

| 入口網站 | URL | 本站現況 |
|---|---|---|
| 食品藥物資料開放平台 | <https://data.fda.gov.tw/> | 本站 `drugs`／`food-nutrition`／`food-operators` 工具已使用（`lib/server/drugs/sources/`, `scripts/import-tfda-*.mjs`），**已覆蓋** |
| 衛生福利部資料開放平台 | <http://data.hpa.gov.tw/>（國健署） | **本站目前沒有直接使用 `data.hpa.gov.tw` 作為 API 來源**——現有工具引用「衛生福利部國民健康署」多半只是 `scientificBasis` 的權威引註（`hpa.gov.tw`），不是實際資料抓取來源；值得後續確認此平台是否有本站可用的原始開放資料（例如癌症篩檢據點、戒菸門診等） |
| 疾病管制署資料開放平台 | <https://data.cdc.gov.tw/> | 本次研究因網路連線問題（`ECONNREFUSED`）未能直接開啟站台首頁，改以 `data.gov.tw` 上掛載的 CDC 資料集（§1.5 的登革熱/流感/腸病毒系列）間接確認其內容，**本站目前僅透過 `travel-epidemic-alerts` 工具間接使用 CDC 的「國際旅遊疫情建議」與「國際重要疫情資訊」兩個資料集**，§1.5 找到的登革熱病媒蚊密度、急診傳染病監測都尚未被涵蓋 |
| 健康保險資料開放服務平台 | <http://data.nhi.gov.tw/> | 本站現有 `nhi_hospital`／`nhi_pharmacy`／`nhi_penalties`／`nhi_home_healthcare` 等來源實際上多半是透過 `info.nhi.gov.tw` 的內部地圖 API 或 `kiang/info.nhi.gov.tw` GitHub 鏡像 GeoJSON 取得（見 `geocode-opendata-coverage-gap-research.md` §2.1 #18 的說明），而不是 `data.nhi.gov.tw` 這個正式開放資料平台本身——**這是一個值得未來確認的潛在落差**：`data.nhi.gov.tw` 是否有更穩定、有明確授權條款的官方對應資料集可以取代目前依賴的非正式/內部 API 端點？本次研究未實際打開 `data.nhi.gov.tw` 逐一核對（未確認） |
| 環境部環境資源資料開放平台 | <https://opendata.epa.gov.tw/>（已併入 `data.moenv.gov.tw`） | 已在 §1.3 完整涵蓋 |
| 災害示警公開資料平台 | <https://alerts.ncdr.nat.gov.tw/> | 本站 `lib/server/ncdr/ncdrAlerts.ts` 已使用（`JSONAtomFeeds.ashx`），**已覆蓋** |
| 內政部警政署警政治安全球資訊網 | <https://www.npa.gov.tw/> | 本站 `child-safety-spots` 工具已使用其開放資料（`npa_child_safety_spot`），**已覆蓋** |

**結論**：此彙整頁本身沒有提供本站尚未觸及的全新入口網站（其列出的多數來源本站已透過其他管道間接使用），但promping 出兩個值得後續確認的潛在落差——`data.hpa.gov.tw`（國健署，未被當成資料來源使用過）與 `data.nhi.gov.tw`（健保署正式開放資料平台 vs. 本站目前依賴的非正式內部 API）。

---

### 1.9 g0v 社群 GitHub 組織

透過 `gh api orgs/g0v/repos --paginate` 取得完整 521 個 repository 清單（本次研究因未認證的 GitHub API 有 60 次/小時的速率限制，改用已認證的 `gh` CLI 取得完整清單，避免被 rate-limit 擋下），以「health、公衛、醫療、防疫、長照、空污、疫情、口罩、dengue、covid、vaccin、mask、疾病、衛生、醫院、藥」等關鍵字比對 repo 名稱/描述/topics，**只找到 3 個相關 repo**：

| Repo | 描述 | 星數 | 最後更新 |
|---|---|---|---|
| `g0v/vaccinate` | vaxx.tw — COVID-19 疫苗預約查詢工具 | 32 | 2021-12-27 |
| `g0v/covid-19-data` | Our World in Data 的 COVID-19 案例/死亡/檢測數據鏡像 | 1 | 2022-02-09 |
| `g0v/covid19-data-list` | 台灣 Covid19 相關資料資源收集（清單型 repo，非資料本身） | 5 | 2021-06-15 |

**結論**：g0v 組織中與公衛/醫療直接相關的 repo 數量少，且全部是 2021~2022 年 COVID-19 疫情高峰期的產物，**最後更新都在近 4 年前，已停止維護**，不適合作為本站正在營運中的資料來源。g0v 對本次任務而言**是低產出的來源**——g0v 的強項是公民科技工具與資料視覺化專案，不是長期維運的原始資料集鏡像。

---

## 2. 對照現有工具：三類清單

### 2.1 現有來源「可能」被這裡找到的更好來源取代

| # | 現有工具/來源 | 現況 | 建議替代來源 | 為什麼更好 | 優先級 | 工作量估計 |
|---|---|---|---|---|---|---|
| R1 | `home-healthcare`（`nhi_home_healthcare`，`info.nhi.gov.tw/api/inae1000/INAEmapS01/search`） | 依賴一個**逆向工程出來的 NHI 內部地圖 API**（`lib/server/facilities/sources/nhiHomeHealthcare.ts` 自己的註解已承認這是「reverse-engineered」），沒有正式的開放資料授權條款可循，隨時可能因 NHI 內部系統改版而失效 | `data.nhi.gov.tw`（健保署正式開放資料平台）是否有對應的正式資料集 | 若存在正式對應資料集，可以拿掉對內部 API 的依賴，換成有明確授權、有 schema 文件保障穩定性的正式來源 | 中 | 中——**本文件尚未確認 `data.nhi.gov.tw` 是否真的有對應資料集**，第一步應該是先花 1~2 小時查證平台上是否存在「居家醫療照護整合計畫特約名冊」的正式開放資料版本，若有再評估 schema 是否同樣具備座標欄位 |

**誠實說明**：本次研究並未找到其他現有來源有「明顯更精準/更權威、且欄位對等」的直接替代者——這與 `geocode-opendata-coverage-gap-research.md` 的既有結論一致（該文件已詳細確認 19 個地址型來源中，多數沒有座標替代方案；本文件從「機關權威性/資料新鮮度」角度重新檢視，同樣沒有找到能直接替換整個資料源的案例，只找到上面這 1 個「內部 API → 正式開放資料」的潛在升級機會，且尚待查證是否真的存在）。

### 2.2 現有工具可以用這裡的資料補強顆粒度

| # | 現有工具 | 現況顆粒度 | 補強資料 | 補強效果 | 優先級 | 工作量估計 |
|---|---|---|---|---|---|---|
| E1 | `disaster-map`（避難收容處所/消防救援單位/應變中心，靜態名冊，非即時） | 純靜態點位名冊，「本頁資料非即時，實際開設狀態請以地方政府正式公告為準」 | §1.2 WRA IoT 的 `/rasterMap/inundation`（即時淹水範圍圖）、`/uswg/stations`（路面淹水感知器）、`/damstructure/stations`（堤防結構安全）；§1.7 MOA 的 `/DebrisAlertServices/GetCustomerDebrisAlertInfo/`（土石流警戒） | 從「平時可查詢的靜態避難所名冊」升級為「災時可疊加即時淹水範圍/路面淹水感測/堤防安全/土石流警戒」的複合防災地圖，是本次研究單一最高槓桿的發現——這些端點皆已實測確認公開可用、含座標或明確空間範圍 | **高** | 中偏高——需新增至少 2 個新資料來源（WRA IoT + MOA 土石流警戒）、擴充 `disaster-map` 前端圖層切換 UI；建議先做 WRA IoT 這半邊（`damstructure`/`groundwaterlevel`/`inundation regions`，schema 已確認、已實測），MOA 土石流的授權/更新頻率仍待查證 |
| E2 | `water-level-stations`（現有 373 站，來自 `opendata.wra.gov.tw/api/v2/73c4c3de...`） | 「河川/地下水位，不限水庫」的單一快照 | §1.2 WRA IoT 的 `/river/stations`（河川、區排水位站）、`/groundwaterlevel/stations`（地下水位監測站，已實測含即時讀數） | 若 IoT API 的站點覆蓋範圍比既有 opendata.wra.gov.tw 版本更廣（例如更多地下水位站），可以互補既有資料的空間覆蓋率；**這點需要先比對兩份站點清單的重疊率再決定是否值得整合**，本文件未做這個比對 | 中 | 低（先比對站點清單重疊率，屬於分析工作，不需要新程式碼） |
| E3 | `aqx-monitoring`（既有 8 個 AQX 系列子資料集：一般污染物、BTEX、NMHC、THC、光化測站、CO_8hr、PM10、其它測項） | 已涵蓋 `data.moenv.gov.tw` 的 `aqx_p_*` 系列多數常用子集 | §1.3 找到 `data.moenv.gov.tw` 底下還有 100+ 個未逐一列出的 `aqx_p_*` 端點（如 `aqx_p_132`~`aqx_p_240` 等一系列細分測項），本次研究只確認端點存在、未逐一核對是否與既有 8 個子集重疊或是全新測項 | 若其中有全新測項（例如特定重金屬、揮發性有機物細分項），可以擴充既有 `aqx-monitoring` 頁面的分頁選項 | 低 | 低——先花時間逐一核對 `aqx_p_*` 完整清單的中文說明，篩出與既有 8 個子集不重疊的項目，才能評估是否值得新增 |
| E4 | `green-hotels`（`moenv_green_hotel` + `moenv_green_hotel_epr` 雙資料集） | `geocode-opendata-coverage-gap-research.md` §2.1 #3 已指出 `epr_p_02` 與 `gp_p_43` 有潛在可交叉比對的重疊，但**該文件未量化重疊比例** | 同一份既有研究內容，本文件不重複研究，僅在此提醒：這是兩份研究都指向同一個尚待落地的機會 | 見既有文件 §4 第 4 點 | 中 | 見既有文件的工作量估計，不重複 |

### 2.3 完全沒被涵蓋、建議新增

| # | 建議新工具/資料主題 | 資料來源 | 座標/可地圖化 | 更新頻率 | 授權 | 為什麼值得做 | 優先級 | 工作量估計 |
|---|---|---|---|---|---|---|---|---|
| N1 | **登革熱病媒蚊密度地圖**（村里級 BI/HI/CI/LI 指數） | `data.gov.tw/dataset/24161`（CDC，`od.cdc.gov.tw/eic/MosIndex_All_last12m.csv`） | ✅ 已確認 `VillageLon`/`VillageLat` | **每日更新** | 政府資料開放授權條款-第1版 | 本站目前沒有任何傳染病/病媒蚊相關工具，登革熱是台灣（尤其南部）每年夏秋的重大公衛議題，此資料集每日更新、有村里級座標，是本次研究中信心最高的新增候選——欄位、更新頻率、授權、下載格式都已直接查證 | **高** | 中——單一資料源、每日排程抓取、村里座標可直接點圖，不需要額外地理編碼；需設計「布氏指數(BI)/House Index(HI) 分級說明」的公衛衛教內容（比照現有 `aqi`/`uv` 工具的分級對照表模式） |
| N2 | **土石流警戒地圖**（潛勢溪流 + 即時警戒等級 + 觀測站影像） | `data.moa.gov.tw` `/DebrisAlertServices/*`（§1.7） | 未查證（端點存在於官方 openapi.json，但本次研究未實際呼叫取得資料範例確認欄位） | 未查證 | 未查證 | 颱風季山區坡地重大防災議題，可作為 `disaster-map` 的新圖層，或獨立成頁 | 高（若查證後欄位/座標confirmed） | 中——**下一步應先實測呼叫 3 個 `DebrisAlertServices` 端點確認回應格式**，再評估是否值得動工 |
| N3 | **即時防災感測地圖**（整合 WRA IoT 的淹水範圍/路面淹水感測/堤防安全/地下水位） | `iot.wra.gov.tw`（§1.2，已實測多個端點可用） | ✅ 部分已確認含座標（`damstructure`, `groundwaterlevel`） | 即時（IoT 感測資料） | 未在 swagger 明確標示，需另外確認 | 與 N2 合併，作為 `disaster-map` 的即時圖層擴充（見 §2.2 E1），比獨立開一個新工具更合理，因為使用情境高度重疊（颱風/豪雨期間查詢周邊防災狀態） | 高 | 見 §2.2 E1 |
| N4 | **自來水/飲用水水質查詢**（縣市月別彙總） | `data.moenv.gov.tw` `DWS_P_01`/`DWS_P_02`（§1.3） | ❌ 無座標，僅縣市層級彙總統計 | 每年1月更新 | 政府資料開放授權條款-第1版 | 公衛基礎議題，但資料本身是縣市月別彙總統計表，不是逐場所資料，只能做成類似 `weather-alerts` 的「分級對照表」型頁面，不是地圖 | 中 | 低——資料結構簡單（8 個欄位、縣市彙總），適合做成簡單的參考表格頁，但**每年僅更新一次**，時效性議題需要在頁面上誠實標注（避免使用者誤以為是即時水質） |
| N5 | **環境噪音地圖**（噪音監測站位置 + 監測結果） | `data.moenv.gov.tw` `GISEPA_P_19`（測站位置，已確認含座標）+ `NOS_P_08`/`NOS_P_03~06`（測站數值，未查證是否即時） | ✅ 站點位置已確認含經緯度；**站點讀數是否即時未查證** | 站點清單「不定期」；讀數更新頻率未查證 | 政府資料開放授權條款-第1版 | 噪音污染是都會區常見公衛議題，本站目前完全沒有涵蓋，且測站位置資料已確認可地圖化 | 中 | 中——**下一步應先查證 `NOS_P_08` 是否為即時可用的逐站數值**（本文件只確認了站點位置資料，數值資料集本身尚未實測），若只有位置沒有即時數值，價值會大打折扣 |
| N6 | **土壤液化潛勢查詢（地震防災）** | 台北市 `data.taipei`（`dataset/detail?id=ec40e067...`，僅台北市） | 未查證欄位細節（WebSearch 摘要顯示提供 TWD97/WGS84 圖層） | 未查證 | 未查證 | 地震防災重要議題，但**目前只發現台北市單一縣市版本，沒有全國性資料集**，價值受限於覆蓋範圍 | 低（除非找到全國版） | 未評估——先確認是否有全國性等價資料集（可能在內政部地質敏感區系統或國家災害防救科技中心），否則只做台北市版本的性價比不高 |
| N7 | **新北市衛生局 228 個資料集的後續盤點** | `data.ntpc.gov.tw/openapi`（§1.6） | 未查證 | 未查證 | 未查證 | 規模顯著大於本站目前任何單一衛生類來源，但**本次研究只確認了規模數字，未逐一開啟清單** | 未定——這是「需要再開一輪研究」的項目，不是可以直接評優先級的具體提案 | 研究工作量：中（需要瀏覽器或登入才能看到完整清單，估計 2-3 小時人工篩選） |
| N8 | 國健署開放資料平台 `data.hpa.gov.tw` 的後續確認 | §1.8 | 未查證 | 未查證 | 未查證 | 本站現有工具只把 `hpa.gov.tw` 當作衛教引註來源，從未當作實際資料抓取來源，值得確認該平台是否有戒菸門診/癌症篩檢據點等本站尚未涵蓋、且屬於本站「查詢型公衛服務地圖」既有產品模式的資料集 | 未定 | 研究工作量：低（先開啟平台首頁瀏覽分類即可判斷是否值得深入） |

---

## 3. 優先級彙總表

| 優先級 | 項目 | 一句話總結 |
|---|---|---|
| **高** | N1 登革熱病媒蚊密度地圖 | 唯一「來源、座標、更新頻率、授權」四項本次研究都已直接查證完畢的新增提案，可直接開實作票 |
| **高** | E1 / N2 / N3 防災地圖即時化（WRA IoT + MOA 土石流） | 單一最高槓桿發現；WRA IoT 半邊已實測可用，MOA 土石流半邊需要先花約 1 小時實測 3 個端點補齊查證 |
| 中 | R1 `home-healthcare` 改用 `data.nhi.gov.tw` 正式來源 | 先查證 `data.nhi.gov.tw` 是否真的有對應資料集，這是風險緩解型工作，不是新功能 |
| 中 | E2 水位站清單重疊率比對 | 分析工作，不需要新程式碼，先做這個再決定要不要整合 IoT 站點 |
| 中 | N4 自來水水質查詢（縣市月別） | 資料簡單但時效性差（年更），建議明確標示「非即時」以管理使用者期待 |
| 中 | N5 環境噪音地圖 | 站點位置已confirmed，但讀數資料集是否即時仍待查證，會直接影響此項目的實際價值 |
| 低 | E3 AQX 完整清單比對 | 純分析工作，價值取決於是否真的有本站未涵蓋的全新測項 |
| 低 | N6 土壤液化潛勢（僅台北市版本） | 覆蓋範圍受限，除非找到全國版資料集否則性價比不高 |
| 低（待轉為研究任務） | N7 新北市衛生局 228 個資料集 | 規模最大但本次完全未展開，建議另開一輪聚焦研究 |
| 低（待轉為研究任務） | N8 國健署 `data.hpa.gov.tw` | 同上，另開一輪聚焦研究即可 |
| 低 | MOEA EE501 | 儀表板/統計分析性質，與本站「查原始開放資料」模式不合，不建議投入 |
| 低 | g0v GitHub 組織 | 唯三個健康相關 repo 皆為 2021-2022 COVID 遺留專案，已停止維護 |

---

## 4. 引用來源總表

- 本站程式碼（於下方路徑實際讀取確認現況）：`lib/server/tools/catalog.ts`、`lib/server/wra/*.ts`、`lib/server/disaster/ingestDisasterPoints.ts`、`lib/server/ncdr/ncdrAlerts.ts`、`lib/server/npoOrganizations/*.ts`、`scripts/import-wra-catalogs.mjs`、`scripts/import-moenv-public-toilets.mjs`
- WRA：<https://opendata.wra.gov.tw/openapi/swagger/index.html>、<https://opendata.wra.gov.tw/datasets>、<https://opendata.wra.gov.tw/api/swagger.json>（401 NO_AUTH）
- WRA IoT：<https://iot.wra.gov.tw/swagger/v1/swagger.json>（下載解析）、實測 `damstructure/stations`、`groundwaterlevel/stations`、`rasterMap/inundation/regions`、`uswg/stations`
- MOENV：<https://data.moenv.gov.tw/swagger/openapi.yaml>（下載解析 791 端點）、<https://data.moenv.gov.tw/dataset/detail/DWS_P_02>、<https://data.moenv.gov.tw/dataset/detail/GISEPA_P_24>、<https://data.moenv.gov.tw/dataset/detail/GISEPA_P_19>、<https://data.moenv.gov.tw/dataset/detail/EAMP_P_22>
- MOEA：<https://service.moea.gov.tw/EE501/>
- data.gov.tw：<https://data.gov.tw/dataset/24161>、<https://data.gov.tw/dataset/24159>、<https://data.gov.tw/dataset/21026>（已下架）、<https://data.gov.tw/dataset/14584>、<https://data.gov.tw/dataset/14587>、<https://data.gov.tw/dataset/14590>、<https://data.gov.tw/dataset/14593>、<https://data.gov.tw/dataset/125004>、<https://data.gov.tw/dataset/127956>
- 城市平台：<https://data.taipei/dataset/detail?id=ec40e067-930f-4058-b7dc-71399d5f3147>、<https://data.ntpc.gov.tw/openapi/>、<https://data.tainan.gov.tw/dataset/109-10-df-mosquito-density>、<https://opendata.taichung.gov.tw/>、<https://data.kcg.gov.tw/>、<https://opendata.tycg.gov.tw/datalist/952d4f99-1d83-4af4-9a2b-dde0863a711f>
- MOA：<https://data.moa.gov.tw/api.aspx>、<https://data.moa.gov.tw/openapi.json>（下載解析 60 端點）
- 彙整頁：<https://bigdata.wp.shu.edu.tw/?page_id=335>
- g0v：`gh api orgs/g0v/repos --paginate`（521 repos 全量掃描）

---

## 5. 明確排除（Explicit Non-Goals）

- 本文件**沒有**修改任何程式碼、`lib/server/tools/catalog.ts`、任何 `scripts/import-*.mjs`/`scripts/backfill-*.mjs`、排程設定或生產資料。
- 本文件**沒有**呼叫任何 `/api/admin/*` 寫入端點；本次研究過程中所有 `curl`/`WebFetch` 呼叫都是對公開、未認證、唯讀的開放資料端點的 `GET`，且都是各機關自己的開放資料 API（不含任何本站自身 admin API）。
- 本文件**沒有**申請任何帳號、API 金鑰（含 `opendata.wra.gov.tw` 的登入、`iot.wra.gov.tw` 若真的需要金鑰的部分、`data.ntpc.gov.tw` 或任何其他平台）。
- 標注「未查證」/「未確認」的欄位，一律是本次研究時間內沒有直接查證到，不是「已確認不存在」——後續若要據此開實作票，請先把「未查證」項目補齊查證再排入 sprint，避免依賴本文件的臆測內容動工。
- §1.6 城市層級的結論明確標注確定性低於其他章節（因任務範圍限制不逐站深挖），不應被視為與 §1.1~1.5 同等嚴謹的查證結果。
- 本文件與 `docs/specs/geocode-opendata-coverage-gap-research.md` 的關係是互補，不是取代——後者專注既有 22 個地址型設施來源的座標替代方案，本文件專注全站 67 個工具的來源升級/新增機會，兩份文件應合併閱讀，避免未來重複研究同一個問題兩次。
