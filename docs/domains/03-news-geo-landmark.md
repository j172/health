# 03 新聞地標與地理萃取

> 合併自 8 份原始文件 · 狀態核對基準：`main` @ `7fe098b`（2026-10-12）
> 狀態圖例：✅ 已上線｜🟡 部分完成｜❌ 未實作｜🗄️ 已取代｜📚 研究

---

## 1. 目前真相

新聞的「📍 地標」由 `lib/server/news/geoExtractor.ts` 的 `extractLocationFromText` 依瀑布順序判定：

| Tier | 比對方式 | 規則 |
|---|---|---|
| 1 醫院 | `COMMON_HOSPITAL_PATTERNS` → `facilities`（**限定 `facility_type = 'clinic'`**） | 必須唯一識別一家醫院；同一院名被多個 pattern 命中先做包含關係歸併；仍有多家則放棄 |
| 2 鄉鎮區 | `TAIWAN_DISTRICT_COORDINATES`（**已擴充為全部 368 鄉鎮市區**） | 必須唯一，多個鄉鎮同時出現則放棄 |
| 3 縣市 | 22 縣市中心點 | 只顯示徽章，不畫地圖 |
| 4 外部 geocode | TGOS／OpenCage／Nominatim，共用每日預算 | `newsGeocodeBatch.ts` |

- 詳情頁擷取會剝除 SVG `<desc>`／`<title>`（CWA 公報內嵌全台鄉鎮地圖，曾讓每篇都被判成「臺北市中正區」）。
- 新聞卡片仍顯示地標徽章；**新聞內頁的地圖小卡（`NewsMapCard`）已於 2026-09-20 依使用者要求整個移除**。
- 規則修改後，既有資料要用 `landmarkBackfill.ts`（`/api/admin/news-landmark-backfill`，先 dry-run）重算，因為 `persistItems` 對內容未變的文章不會重新萃取。

---

## 2. 長期有效的決策

- **一個 tier 只有在能識別出唯一地點時才使用**（#65 確立，Tier 1 於 #84、多院情境再補強）。
- Tier 1 只查醫院名冊：新增任何設施來源都不得讓醫院地標被別類設施（健檢、長照）搶走。
- 回填只重新萃取既有文字，**不重新抓網頁**。
- 新聞卡不需要使用者定位（從來沒有）；側欄小工具的定位是另一回事（見 [12](12-frontend-stability.md)）。

---

## 3. 核對後仍未完成的項目

| # | 項目 | 來源文件 | 說明 |
|---|---|---|---|
| G-1 | 地標精確度分級欄位 | news-landmark-precision-tiers | `matchType` 仍未存入 DB（無 `location_precision` 欄位）。由於內頁地圖已移除，原本「縣市級猜測卻畫 4 位小數座標」的最大問題已消失；剩餘價值是在卡片徽章上區分精確度，需重新評估是否還要做 |

---

## 4. 逐份紀錄

#### 新聞與設施的地理萃取與圖片回填（起點） ✅
- 原檔：[news-geo-and-image-enrichment.md](../archive/specs/news-geo-and-image-enrichment.md)
- 混合萃取：行政區字典 → 設施資料庫比對 → 外部 geocode（每日預算＋斷路器）；`news_items` 新增 `lat`／`lng`／`location_name`／`facility_id`；同時建立三層圖片備援與靜態地圖卡。

#### 地標精確度分級與靜態地圖雜湊碰撞 🟡
- 原檔：[news-landmark-precision-tiers.md](../archive/specs/news-landmark-precision-tiers.md)
- 實測 `/news/862449` 屏東豪雨被標「臺北市中正區」並以 4 位小數畫地圖；所有 tier 呈現方式相同、`matchType` 被丟掉、靜態地圖檔名只依座標雜湊而互相覆蓋。
- 現況：地圖卡已移除；精確度欄位未做（待辦 G-1）。

#### 剝除 SVG metadata、要求唯一匹配 ✅
- 原檔：[news-landmark-saturation-guard.md](../archive/specs/news-landmark-saturation-guard.md)（#65）
- 根因 A：CWA 內嵌 SVG 的 `<desc>` 含全台每個鄉鎮名；根因 B：Tier 2 回傳陣列中第一個命中，第 0 筆剛好是「臺北市中正區」，造成決定性的錯誤。
- 實測 71% 的鄉鎮級徽章都是這個錯誤。

#### 既有新聞重新套用地標規則 ✅
- 原檔：[news-landmark-backfill.md](../archive/specs/news-landmark-backfill.md)（#72）
- 160 篇抽樣中約 19% 的地標值與新規則結果不同；新增回填模組與 admin 端點，強制先 dry-run、不發任何外部 HTTP。

#### Tier 1 醫院比對決定化 ✅
- 原檔：[tier1-facility-matching.md](../archive/specs/tier1-facility-matching.md)（#84）
- `%榮民總醫院%` 命中 6 種設施類型 175 列，最小 id 是健檢機構「臺中榮總灣橋分院」，導致每篇榮總新聞都被導到健檢頁。
- 限定 `facility_type = 'clinic'`；臺北市立聯合醫院各院區因名冊無「院區」命名而落空，另行對應。

#### Tier 1 必須唯一識別一家醫院，否則放棄 ✅
- 原檔：[tier1-multi-hospital.md](../archive/specs/tier1-multi-hospital.md)
- 89 篇醫院相關新聞中 10 篇多重命中，其中 3 篇其實是同一院（「淡水馬偕紀念醫院」同時命中兩個 pattern）。改為「收集全部 → 歸併包含關係 → 要求唯一」（`facilityMatch.ts`）。

#### 鄉鎮表由 122 擴充為 368 ✅
- 原檔：[district-table-expansion-368.md](../archive/specs/district-table-expansion-368.md)
- 原表偏重北部都會；改用內政部 TGOS 鄉鎮界線 shapefile（TWD97 經緯度、免轉投影、純 `node:fs` 解析）計算面積中心點；依賴 #65 先上線。

#### 移除新聞內頁「相關地理位置」區塊 ✅
- 原檔：[remove-news-article-geolocation-card.md](../archive/specs/remove-news-article-geolocation-card.md)（#338、PR #344）
- 整個 `NewsMapCard`（小地圖＋經緯度數字）移除；DB 座標欄位保留供其他功能使用。
