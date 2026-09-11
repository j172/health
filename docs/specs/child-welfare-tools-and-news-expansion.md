# Spec: Child Welfare Tools, Contraception Map, and Heritage Assets 6-Layer Restoration

- **Ticket ID**: `SPEC-HEALTH-20260911-CHILD-WELFARE-AND-HERITAGE-EXPANSION`
- **Priority**: HIGH (P1)
- **Status**: APPROVED
- **Affects**:
  - `docs/specs/child-welfare-tools-and-news-expansion.md`
  - `scripts/build-facility-seeds.mjs`
  - `data/heritage-map-seed.json`
  - `lib/server/culture/ingestHeritageAssets.ts`
  - `components/HeritageMap/HeritageMapContent.tsx`
  - `components/HeritageMap/HeritageMapLeaflet.tsx`
  - `scripts/build-breastfeeding-seed.mjs`
  - `data/breastfeeding-rooms-seed.json`
  - `app/api/breastfeeding-rooms/route.ts`
  - `app/tools/breastfeeding-rooms/page.tsx`
  - `components/BreastfeedingRooms/BreastfeedingMapContent.tsx`
  - `components/BreastfeedingRooms/BreastfeedingMapLeaflet.tsx`
  - `scripts/build-contraception-seed.mjs`
  - `data/contraception-map-seed.json`
  - `app/api/contraception-map/route.ts`
  - `app/tools/contraception-map/page.tsx`
  - `components/ContraceptionMap/ContraceptionMapContent.tsx`
  - `components/ContraceptionMap/ContraceptionMapLeaflet.tsx`
  - `app/tools/facilityConfigs.ts`
  - `lib/server/tools/catalog.ts`

---

## 1. Problem Statement

1. **文化資產地圖資料缺失與單一化 (`/tools/heritage-map`)**:
   - 原有種子檔生成腳本 `scripts/build-facility-seeds.mjs` 僅抓取建築類文化資產（`typeId=A`），遺漏了文化資產局開放資料 `2.1.json` 中的 58 處考古遺址，導致地圖上的「考古遺址」圖層標記為 0。
   - 此外，遺漏了文資局與文化部公告之「史蹟（1.3.json & typeId=L）」、「紀念建築（1.4.json）」、「聚落建築群（typeId=C）」與「文化景觀（3.2.json & typeId=K）」。需全面擴充為 6 大法定文資圖層（約 1,600 點），並將公共藝術與演藝場館分離維護。
2. **缺乏全國哺集乳室地圖 (`/tools/breastfeeding-rooms`)**:
   - 育兒家庭需要便捷、可靠的法定與自願設置哺集乳室查詢服務。國健署孕產兒關懷網站已公開帶有完整 GPS 經緯度之全台 3,866 處據點。本站需將其建置為專屬地圖工具，納入「兒少福利」群組，並支援「依法設置」與「自願設置」雙圖層切換。
3. **缺乏避孕諮詢地圖與診所藥局快選 (`/tools/contraception-map`)**:
   - 青年族群與兒少需要專業、去污名化的避孕諮詢與雙重避孕衛教據點。台灣婦產科醫學會與拜耳合作之 BeOK 避孕諮詢室公開了 88 家婦產科診所與 798 家藥局。需將其建置為專屬地圖工具，並反向同步擴充至全站既有之 `/tools/clinics` 與 `/tools/pharmacies`。

---

## 2. Technical Architecture & Implementation Details

### 2.1 Cultural Heritage Map 6-Layer Statutory Expansion
- 擴充 `scripts/build-facility-seeds.mjs` 中的 `buildHeritageMapSeed` 函式：
  - 抓取文化資產局與文化雲開放資料：
    - 古蹟與歷史建築（`typeId=A`, `1.2.json`）
    - 考古遺址（`2.1.json`，58 處）
    - 史蹟（`1.3.json`, `typeId=L`，約 61 處）
    - 紀念建築（`1.4.json`，21 處）
    - 聚落建築群（`typeId=C`，263 處）
    - 文化景觀（`3.2.json`, `typeId=K`，約 156 處）
  - 對齊欄位，標記 category：
    - `building`: 古蹟／歷史建築 🏛️
    - `archaeological_site`: 考古遺址 🏺
    - `memorial_building`: 紀念建築 🏢
    - `settlement`: 聚落建築群 🏘️
    - `historical_site`: 史蹟 📜
    - `cultural_landscape`: 文化景觀 🏞️
  - 整併去重存入 `data/heritage-map-seed.json`（總計約 1,600 點）。
- 前端 Leaflet 元件升級：
  - 支援 6 大圖層開關勾選。
  - 計算並顯示各圖層即時點位數量。

### 2.2 National Breastfeeding Rooms Tool (`/tools/breastfeeding-rooms`)
- **資料採集腳本** (`scripts/build-breastfeeding-seed.mjs`):
  - 爬取 `https://mammy.hpa.gov.tw/Map/BreastfeedingRoom?county={county}&district=` 22 縣市清單。
  - 產出 `data/breastfeeding-rooms-seed.json`（3,866 點）。
- **Tool Catalog Entry**:
  - `slug: "breastfeeding-rooms"`, `group: "child-welfare"`.
  - 提供 AEO Direct Answer、公衛依據（《公共場所母乳哺育條例》）、常見問答（FAQs）。
- **API & UI**:
  - `app/api/breastfeeding-rooms/route.ts`：支援縣市、關鍵字、經緯度半徑排序。
  - `app/tools/breastfeeding-rooms/page.tsx`、`components/BreastfeedingRooms/BreastfeedingMapContent.tsx`、`BreastfeedingMapLeaflet.tsx`。
  - 具備依法／自願切換、22 縣市快選、列表與地圖雙重視圖。

### 2.3 Contraception Consultation Map & Facilities Enrichment (`/tools/contraception-map`)
- **資料採集腳本** (`scripts/build-contraception-seed.mjs`):
  - 擷取 BeOK 88 家婦產科診所與 798 家諮詢藥局，產出 `data/contraception-map-seed.json`。
- **Tool Catalog Entry**:
  - `slug: "contraception-map"`, `group: "child-welfare"`.
  - 衛教重點：雙重避孕法、事後/事前口服避孕藥諮詢指引。
- **UI & API**:
  - `app/api/contraception-map/route.ts`。
  - `app/tools/contraception-map/page.tsx`。
  - `components/ContraceptionMap/ContraceptionMapContent.tsx` 與 Leaflet 元件，具備 🏥 診所 / 💊 藥局 雙圖層開關。
- **既有工具整合**:
  - 更新 `app/tools/facilityConfigs.ts`：
    - `clinics`: 加入「避孕諮詢診所」篩選選項。
    - `pharmacies`: 加入「避孕諮詢藥局」篩選選項。

---

## 3. Verification & Deployment Checklist
- [ ] 執行 `node scripts/build-facility-seeds.mjs` 生成約 1,600 點 6 大法定文資種子檔。
- [ ] 執行 `node scripts/build-breastfeeding-seed.mjs` 生成 3,866 點全台哺集乳室種子檔。
- [ ] 執行 `node scripts/build-contraception-seed.mjs` 生成 886 點避孕諮詢種子檔。
- [ ] 執行測試套件與 `verify-tool-sources.test.mjs`。
- [ ] 執行 `npm run build` 確認全站靜態打包零錯誤。
- [ ] PR 合併至 `main` 並自動觸發 FTP 部署至 `health.j172.tw`。
