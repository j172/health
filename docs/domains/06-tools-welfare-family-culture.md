# 06 社福、NPO、兒少家庭與文化工具

> 合併自 20 份原始文件 · 狀態核對基準：`main` @ `7fe098b`（2026-10-12）
> 狀態圖例：✅ 已上線｜🟡 部分完成｜❌ 未實作｜🗄️ 已取代

---

## 1. 目前真相

| 群組 | 工具 |
|---|---|
| 長者 | [伯公照護站](https://health.j172.tw/tools/hakka-bogong)、[敬老／樂齡](https://health.j172.tw/tools/senior-friendly)、[無障礙交通](https://health.j172.tw/tools/accessible-transit) |
| 身心障礙 | [身障福利機構](https://health.j172.tw/tools/disability-welfare)、[無障礙 ATM](https://health.j172.tw/tools/disability-atm)、[庇護工場](https://health.j172.tw/tools/sheltered-workshops)、[助聽器補助](https://health.j172.tw/tools/hearing-aid-subsidies) |
| NPO | [公益組織查詢](https://health.j172.tw/tools/npo-organizations)（範圍收斂為 `facility_type='npo'`，live 約 47 筆主檔）；`/tools/tax-organizations` 已 301 併入 |
| 兒少家庭 | [兒少福利機構](https://health.j172.tw/tools/child-welfare-institutions)、[幼兒園](https://health.j172.tw/tools/kindergartens)、[短期補習班](https://health.j172.tw/tools/cram-schools)、[兒童安全地點](https://health.j172.tw/tools/child-safety-spots)、[本土語言辭典](https://health.j172.tw/tools/child-native-languages)、[哺集乳室](https://health.j172.tw/tools/breastfeeding-rooms)、[避孕諮詢地圖](https://health.j172.tw/tools/contraception-map)、[毛孩認養](https://health.j172.tw/tools/pet-adoption) |
| 文化 | [藝文活動](https://health.j172.tw/tools/cultural-events)（文化部 19 類＋節慶＋社企流＋黑熊學院＋g0v＋NPO Center＋總統府參觀）、[公共藝術與演藝場所](https://health.j172.tw/tools/public-art)、[文化資產地圖](https://health.j172.tw/tools/heritage-map)、[書店](https://health.j172.tw/tools/bookstores)、[最新書籍](https://health.j172.tw/tools/latest-books)、[觀光工廠](https://health.j172.tw/tools/tourism-factories) |

---

## 2. 長期有效的決策

- 使用「閩南語」「客語」（對齊教育部用詞），不用「台語」。
- 庇護工場商品販售的組織，在 NPO 列表加權排前並附購買連結。
- 婦幼安全警示地點的「地址」其實是路段描述，**不應強行 geocode**；改為誠實揭露無法定位的筆數。
- TDX 樂齡 API 未確認前，程式必須優雅降級到種子資料，不得 crash。

---

## 3. 核對後仍未完成的項目

| # | 項目 | 來源文件 | 說明 |
|---|---|---|---|
| W-1 | **TDX「樂齡」API base path 未確認** | tdx-senior-* | 2026-10-10 以真實 OAuth token 測了 10 多種路徑組合全部 404（同 token 呼叫 Basic Rail 正常）。目前 `accessible-transit` 與 `senior-friendly` 實際跑種子資料。需從 TDX 會員權限頁或 swagger「Try it out」的 Network 擷取真實路徑；修正只需改 `SENIOR_RAIL_BASE`／`SENIOR_TOURISM_BASE`／`SENIOR_CARD_BASE` 常數 |
| W-2 | 文化資產局（BOCH）從正式主機的連線未驗證 | heritage-assets-map | 延到下次 `six-monthly-sync.yml` 自然執行時確認 |

---

## 4. 逐份紀錄

### 4.1 長者與身障

#### 客委會「伯公照護站」查詢（更名） ✅
- 原檔：[hakka-bogong-care-station.md](../archive/specs/hakka-bogong-care-station.md)
- `/tools/hakka-community` → `/tools/hakka-bogong`（301）；資料源客委會 `DTST20230600002.json`。2.0 M4 將併入長照照顧圈地圖。

#### 伯公擴展、便民三工具、NPO 信任徽章、10+1 社福新聞、19 家藝文售票 ✅
- 原檔：[hakka-bogong-npo-and-public-services-expansion.md](../archive/specs/hakka-bogong-npo-and-public-services-expansion.md)（#194）
- 一次性大型工單：伯公全台擴展、毛孩認養、書店、觀光工廠、NPO 信任徽章與補強管線、社福新聞來源、藝文雙語售票與募款連結。

#### Phase 2 — 無障礙 ATM ✅
- 原檔：[phase2-disability-accessible-atm.md](../archive/specs/phase2-disability-accessible-atm.md)
- 信合社輪椅 ATM 與語音 ATM 兩份 CSV 以「代號」合併為一頁，用類別篩選切換。

#### TDX 樂齡軌道無障礙，升級無障礙交通（Spec A） 🟡
- 原檔：[tdx-senior-rail-accessibility-upgrade.md](../archive/specs/tdx-senior-rail-accessibility-upgrade.md)（#434、PR #435）
- 10 種軌道系統的設施、服務、導覽圖、轉乘、停用公告；新增每日同步。程式已上線，但 API 路徑未確認（待辦 W-1）。

#### TDX 樂齡觀光＋敬老卡，新增 senior-friendly（Spec B） 🟡
- 原檔：[tdx-senior-tourism-and-card-new-tool.md](../archive/specs/tdx-senior-tourism-and-card-new-tool.md)（#436、PR #437；此 spec 原為未提交草稿，整合時一併納入版控）
- 上半部 22 縣市敬老卡交通補助、下半部景區無障礙設施／服務／樂齡套票。同受待辦 W-1 影響。

### 4.2 庇護工場與 NPO

#### 修正庇護工場 facility_type 寫入／查詢不一致 ✅
- 原檔：[SPEC-20260930-SHELTERED-WORKSHOPS-FACILITY-TYPE-BUGFIX.md](../archive/specs/SPEC-20260930-SHELTERED-WORKSHOPS-FACILITY-TYPE-BUGFIX.md)（#422、PR #424）
- 查詢讀 `sheltered_workshop`、匯入卻寫成 `npo` → 工具上線以來每次都讀種子檔。
- 審查時抓到初版會把長照／身障機構誤改類型的回歸，合併前修正；正式重跑證實 62 筆中 29 筆走到該路徑。

#### NPO 組織去重與範圍收斂 ✅
- 原檔：[SPEC-20260930-NPO-ORGANIZATIONS-DEDUP-AND-SCOPE.md](../archive/specs/SPEC-20260930-NPO-ORGANIZATIONS-DEDUP-AND-SCOPE.md)（#423、PR #425）
- `NPO_FACILITY_TYPES_SQL` 原本聯集 `disability_welfare`（與身障工具重複）與 `tax_organization`（抽樣 300 筆超過一半不是 NPO）；收斂為只含 `npo`。

#### 庇護工場公益禮盒＋總統府開放參觀 ✅
- 原檔：[sheltered-workshops-and-presidential-visit.md](../archive/specs/sheltered-workshops-and-presidential-visit.md)（#186）
- 62 家庇護工場禮盒、商品加權排序；總統府參觀場次收進藝文活動。

#### NPO 名錄整合與補強 ✅
- 原檔：[npo-organizations-directory.md](../archive/specs/npo-organizations-directory.md)（#184）
- 原 `/tools/tax-organizations` 只有財政部扣繳名冊（無門牌、無聯絡方式）；改以台灣公益資訊中心為主、雙階去重、地址座標與官網補齊。

#### NPO 實體門牌補齊管線 ✅
- 原檔：[npo-address-enrichment-pipeline.md](../archive/specs/npo-address-enrichment-pipeline.md)
- 三層：61 家庇護工場直接回寫 → NPO Center 7,850 家經 `/api/admin/npo-sync`＋GHA 分批同步 → TGOS 批次比對座標。

#### 毛孩認養自動種子、藝文分頁器、62 家 NPO 商品 ✅
- 原檔：[pet-adoption-cultural-pager-and-npo-products.md](../archive/specs/pet-adoption-cultural-pager-and-npo-products.md)（#56、#57）
- `pet_adoptions` 0 筆（未排程、無種子）；藝文活動一次列出數百筆 → 分頁器 30/50/100。

### 4.3 兒少家庭

#### 兒少本土語言辭典（閩南語／客語） ✅
- 原檔：[child-native-languages-dictionary.md](../archive/specs/child-native-languages-dictionary.md)（#238）
- g0v 萌典 `moedict-data-twblg`（約 2 萬詞）與 `moedict-data-hakka`（約 1.5 萬詞、六腔調）；華語反查、漢字、拼音三種搜尋。

#### 婦幼安全警示地點誠實揭露定位涵蓋率 ✅
- 原檔：[child-safety-spots-honest-coverage.md](../archive/specs/child-safety-spots-honest-coverage.md)（PR #62）
- 186 筆資料完整，問題是「地址」欄是路段描述（「指南路一段道南橋下涵洞附近」）；不強行定位，改在頁面揭露。

#### 兒少福利擴充與「便民服務」更名 ✅
- 原檔：[child-welfare-and-public-services-expansion.md](../archive/specs/child-welfare-and-public-services-expansion.md)
- 「公共設施」改名「便民服務」；新增幼兒園、補習班、兒童安全地點、親子藝文、機關團體扣繳查詢等 7 個資料集。

#### 兒少工具、避孕地圖、文化資產 6 圖層修復 ✅
- 原檔：[child-welfare-tools-and-news-expansion.md](../archive/specs/child-welfare-tools-and-news-expansion.md)（PR #203）
- 新增哺集乳室與避孕諮詢地圖（含種子建置腳本）；修復文化資產地圖 6 個圖層。

### 4.4 文化

#### 藝文 19 類 API 與 767 處演藝場所 ✅
- 原檔：[cultural-events-and-performance-venues-expansion.md](../archive/specs/cultural-events-and-performance-venues-expansion.md)（#205）
- 文化部 `doFindTypeJ` 全部 19 類＋節慶＋文化生活圈；演藝場所以 `field_type='演藝活動場所'` 存入 `public_arts`。

#### g0v 黑客松與社群活動 ✅
- 原檔：[g0v-cultural-events.md](../archive/specs/g0v-cultural-events.md)（#222）
- 揪松團與 Cofacts 的 KKTIX `events.json`；歸類「🤝 公益活動」。後續改以官方 ICS 為主（見 [04](04-ia-navigation-civic.md)）。

#### 最新書籍（Phase 4） ✅
- 原檔：[latest-books-service-phase4.md](../archive/specs/latest-books-service-phase4.md)
- 博客來 4 榜＋誠品 27 類選書；`latest_books` 表＋`data/latest-books-seed.json` 備援。

#### 文化資產地圖 ✅
- 原檔：[heritage-assets-map.md](../archive/specs/heritage-assets-map.md)（PR #171）
- 文資局 `assetsCase/1.2.json`（建築類 1,789 筆）與 `2.1.json`（考古遺址），自帶經緯度免 geocode；與防災地圖共用多圖層 UI 模式。

#### Phase 3 — 綠色商店 ✅（後併入環保標章）
- 原檔：[phase3-green-shops.md](../archive/specs/phase3-green-shops.md)
- 環境部 `gp_p_01`，需 `MOENV_GP_API_KEY`；無座標，以 OpenCage 批次定位（見 [08](08-facilities-geocode-maps.md) Phase 9）。現已是 `green-certifications` 的一個分頁，2.0 M2 將把舊頁 301。
