# 藝文展演 19 類 API 與演藝場所擴充規格 (Phase 2)

## 1. 概述 (Overview)
本規格涵蓋 Phase 2 交付項目（項目 6 與項目 8）：
1. **藝文展演 19 類 API 整合與入庫 (項目 6)**：
   - 介接文化部全國藝文活動資訊系統（`SearchShowAction.do?method=doFindTypeJ`）全部 19 類活動代碼、全國節慶活動（`doFindFestivalTypeJ`）與文化生活圈場館（`emapOpenDataAction.do?method=exportEmapJson&typeId=H`）。
   - 遵循使用者核心原則：**所有來源都是先入 DB，再從 DB 讀取，並提供 prebuilt static seed 離線備援**。
   - 前端 `/tools/cultural-events` 與 `/tools/family-cultural-activities` 擴充支援 19 類與節慶分類快篩。
2. **公共藝術地圖加入 767 處演藝場所 (項目 8)**：
   - 介接文化部全國公私立演藝活動場所 OpenData（`SearchPerformPlaceAction.do?method=doFindPerformPlaceTypeJ`）共 767 筆場所。
   - 入庫至 `public_arts` 資料表（以 `field_type = '演藝活動場所'` 標註），並產製靜態種子備援。
   - 前端 `/tools/public-art` 升級為「公共藝術與演藝場所地圖」，支援「全部」、「公共藝術作品」、「演藝活動場所」圖層切換與專屬聯絡資訊展示。

---

## 2. 資料來源與分類對照 (Data Sources & Taxonomy)

### 2.1 藝文展演活動 (Cultural Events)
- **Base Endpoint**: `https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindTypeJ&category={cat}`
- **全分類代碼 (1 ~ 19)**：
  - `1`: 🎵 音樂表演
  - `2`: 🎭 戲劇演出
  - `3`: 💃 舞蹈表演
  - `4`: 🎨 親子活動
  - `5`: 🎸 獨立音樂
  - `6`: 🖼️ 藝文展覽
  - `7`: 🎤 講座工作坊
  - `8`: 🎬 電影與沉浸
  - `9`: 🎪 聚會市集
  - `10`: 🏮 民俗節慶
  - `11`: 🤹 綜藝表演
  - `12`: 🗺️ 觀光文化
  - `13`: 🏆 藝文競賽
  - `14`: 📣 徵選甄選
  - `15`: 📌 其他多元
  - `16`: 🏅 競賽活動
  - `17`: ✨ 演唱會活動
  - `18`: 🚶 導覽走讀
  - `19`: 📚 研習課程
- **擴充來源**：
  - 全國節慶活動 (`category = 'festival'`): `https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindFestivalTypeJ`
  - 文化生活圈場館 (`category = 'venue_h'`): `https://cloud.culture.tw/frontsite/trans/emapOpenDataAction.do?method=exportEmapJson&typeId=H`

### 2.2 全國演藝活動場所 (Performance Places)
- **Endpoint**: `https://cloud.culture.tw/frontsite/trans/SearchPerformPlaceAction.do?method=doFindPerformPlaceTypeJ`
- **筆數**: 767 筆。
- **欄位 mapping**:
  - `art_no`: `VENUE_{placeName}_{md5(address).slice(0, 8)}`
  - `title`: `placeName` (如「西門徒步區」、「國家兩廳院」)
  - `artist`: `managerUnit` (主管/維運單位)
  - `city`: 從 `address` 或 `placeName` 自動解析縣市（支援台/臺正規化）
  - `location`: `address`
  - `lat` / `lng`: 透過縣市行政區經緯度對照表 fallback（因原始 API 未提供經緯度座標）
  - `field_type`: `"演藝活動場所"`
  - `agency`: `managerUnit` / `applyUnit`
  - `image_url`: `imageUrl`
  - `source_url`: `register` (線上登記網址或官網)
  - `extra_json`: `{ phone: officePhone, fax, email, register, contactor, isVenue: true }`

---

## 3. 架構與實作設計 (Architecture & Implementation)

### 3.1 資料庫設計 (DB First)
- **`cultural_events` & `cultural_event_shows`**:
  - `category` 儲存分類代碼（`1`..`19`, `festival`, `venue_h`, `npo`, `ticketing`）。
  - `category_label` 儲存對應帶 Emoji 的正體中文標籤。
  - `runCulturalShowsSync` 自動遍歷所有 19 類 API 及節慶與場館，入庫更新。
- **`public_arts`**:
  - 既有公共藝術作品與演藝活動場所共享資料表，以 `field_type` 區隔。
  - `runPublicArtSync` 同時抓取公共藝術與 767 處演藝場所並入庫。

### 3.2 離線備援種子 (Prebuilt Static Seeds)
- `data/cultural-events-seed.json`: 預先爬取並建置最新有效藝文展演種子檔（約 1,500 ~ 2,500 筆）。
- `data/public-art.json`: 包含既有公共藝術 + 767 筆演藝場所（共計約 4,500+ 筆）。

### 3.3 API 介面
- `GET /api/culture/shows`:
  - 參數：`category`, `keyword`, `city`, `lat`, `lng`, `distanceKm`, `limit`, `offset`。
  - 優先由 DB 查詢；DB 連線失敗或無資料時自動 fallback 至 `cultural-events-seed.json`。
- `GET /api/culture/public-art`:
  - 參數：`city`, `keyword`, `fieldType`（可篩選 `all`, `art` 公共藝術, `venue` 演藝場所）, `lat`, `lng`, `radiusKm`, `limit`。
  - 優先由 DB 查詢；DB 連線失敗或無資料時 fallback 至種子檔。

### 3.4 前端使用者體驗
- `/tools/cultural-events`:
  - 類別過濾器擴充支援全部 19 類與節慶活動。
  - 支援關鍵字搜尋、依距離排序、縣市快速選單。
- `/tools/public-art`:
  - 標題與簡介更新為「公共藝術與演藝場所地圖」。
  - 增加篩選按鈕：`全部 (4,500+)`、`🎨 公共藝術`、`🎭 演藝活動場所 (767)`。
  - 演藝場所卡片與 Pop-up 顯示聯絡電話、主辦單位、線上登記按鈕與交通地址。

---

## 4. 驗收標準 (Acceptance Criteria)
1. `npm test` 通過所有單元與整合測試。
2. 驗證 `data/cultural-events-seed.json` 存在且包含 19 類展演與節慶資料。
3. 驗證 `data/public-art.json` 包含 767 筆演藝場所，且均具備有效經緯度與行政區資訊。
4. `npm run build` 編譯乾淨通過。
5. 建立 GitHub Issue，使用 Worktree 分支實作，完成後發 PR、Merge 到 main 並觸發部署。
