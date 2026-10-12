# 兒少本土語言辭典（閩南語／客語）整合規格書 (Child Native Languages Dictionary)

## 1. 背景與目標 (Background & Objectives)
依據國家《國家語言發展法》與教育部國民中小學本土語文課程綱要，閩南語與客語為基礎教育中最重要的本土語言教學內涵。然而，目前的公部門辭典多偏向成年學者或純學術檢索工具，缺乏專為兒少、家長課後輔導與親子共讀設計的直觀現代化介面。

本規格旨在整合教育部公布、g0v 萌典社群整理之兩大開源辭典資料庫：
1. **g0v `moedict-data-twblg`**：教育部《臺灣閩南語常用詞辭典》（約 2 萬多條詞目、臺羅拼音、華語對照釋義、生活例句與真人朗讀語音）。
2. **g0v `moedict-data-hakka`**：教育部《臺灣客家語常用詞辭典》（約 1.5 萬多條詞目、客語拼音、六大腔調標音、華語對照釋義、生活例句與真人朗讀語音）。

本功能將作為第 7 項工具整合至「**兒少福利**」(`child-welfare`) 分類下，打造友善、好讀、能聽、能查的「兒少本土語言辭典（閩南語／客語）」。

---

## 2. 系統架構與 Grilling 決策共識 (Key Decisions)

依據 Grilling 訪談，系統架構確立以下核心原則：

### 2.1 產品定位與導覽歸屬
- **整合型單一工具**：不拆分為兩個獨立字典，而是整合為單一工具 `兒少本土語言辭典（閩南語／客語）`。
- **網址路徑**：`/tools/child-native-languages`。
- **所屬分類**：歸類於「兒少福利」(`child-welfare`)。使兒少福利工具由原本 6 項擴增為 7 項。
- **術語規範**：嚴格使用「閩南語」（對齊教育部正式法規與辭典名稱，不使用台語）與「客語」。

### 2.2 搜尋維度與腔調切換
- **多維度搜尋**：
  - **華語意譯反查**：支援輸入日常國語/華語（如「洗澡」、「彩虹」、「謝謝」、「蝴蝶」）反查閩南語與客語之對應說法與漢字。
  - **母語漢字檢索**：支援直接輸入母語漢字（如「食飽」、「恁仔細」）。
  - **拼音檢索**：支援輸入臺羅拼音或客語拼音關鍵字。
- **雙語切換分頁**：介面頂部提供【閩南語】與【客語】Tab 切換，讓正在上特定本土語課程的學生專注於該科目。
- **客語多腔調支援**：在客語模式下，支援切換臺灣六大客語腔調（四縣、海陸、大埔、饒平、詔安、南四縣），即時切換顯示該腔調之拼音並播放對應腔調之發音。

### 2.3 兒少與親子友善 UX
- **首頁生活情境探索標籤（Topic Pills）**：
  在使用者尚未輸入搜尋字詞時（空白預設狀態），提供兒少常見生活情境標籤（如：【日常問候】、【家庭親屬】、【身體器官】、【動物昆蟲】、【美味飲食】、【學校生活】），點選立即展示精選生動詞卡，消除面對空白搜尋框不知從何查起的阻礙。
- **大字體與清晰音標**：加大漢字字體，上方或下方標註清晰之拼音（臺羅/客拼），友善國小低年級與學齡前親子閱讀。
- **一鍵真人發音播放器**：卡片附有醒目喇叭按鈕，點擊串接教育部/g0v 萌典線上真人發音 CDN，支援學童反覆聆聽朗讀。
- **單頁即時展開詳情 ＋ URL 參數同步**：
  點擊詞卡在當前頁面即時展開完整生活例句與多方言差音標，並將狀態同步至網址列（例如 `?lang=twblg&word=食飽`），方便師生與家長一鍵複製網址分享。

### 2.4 資料儲存與管線設計（雙軌架構）
- **資料庫層 (MySQL)**：
  新增 `native_dict_entries` 資料表，收錄詞目、語系、拼音、腔調、華語釋義關鍵字、音檔識別碼、完整定義 JSON，並建立前綴與全文索引。
- **自動化 ETL 腳本**：
  提供 `scripts/import-moedict-languages.mjs`，自 g0v 倉庫下載清理字元後批次寫入 MySQL。
- **精簡種子備援**：
  匯出高頻常用之 `data/child-native-languages-seed.json`，在資料庫未連線或本地離線開發時無縫 Fallback。
- **API 路由**：
  建立 `/api/tools/child-native-languages`，支援 `lang`、`q`、`dialect`、`page`、`pageSize` 參數，並加上 HTTP 快取標頭提升效能。

---

## 3. 資料庫 Schema (Database Schema)

```sql
CREATE TABLE IF NOT EXISTS native_dict_entries (
  id BIGINT NOT NULL AUTO_INCREMENT,
  lang VARCHAR(10) NOT NULL,            -- 'twblg' (閩南語) 或 'hakka' (客語)
  title VARCHAR(100) NOT NULL,          -- 詞目漢字 (如 "食飽", "恁仔細")
  pinyin VARCHAR(255) NOT NULL,         -- 主要拼音 (臺羅或客家語拼音)
  dialect VARCHAR(50) NULL,             -- 腔調 (客語: 四縣/海陸/大埔/饒平/詔安; 閩南語: 優勢腔/泉/漳)
  mandarin_keywords TEXT NULL,          -- 華語對應關鍵字 (供華語反查)
  audio_id VARCHAR(50) NULL,            -- 音檔代碼或編號
  definitions_json LONGTEXT NOT NULL,   -- 結構化定義 (含詞性、釋義、例句與翻譯)
  stroke_count INT NULL,                -- 總筆畫 (可選)
  radical VARCHAR(20) NULL,             -- 部首 (可選)
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_native_dict_lang_title (lang, title),
  KEY idx_native_dict_lang_pinyin (lang, pinyin(100)),
  KEY idx_native_dict_lang_dialect (lang, dialect)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 4. 全站目錄與文件同步 (Catalog & Docs Sync)
1. `lib/server/tools/catalog.ts`：
   - 加入 `child-native-languages` 條目，`group: "child-welfare"`，`schemaType: "WebPage"`。
   - 填寫權威學術來源（教育部終身教育司、g0v 萌典開源專案、CC BY-ND 3.0 TW）。
2. `docs/SPECIFICATION.md`：
   - 兒少福利工具數量由 6 更新至 7。
   - 工具排序鏈增加：`... ➔ 婦幼安全警示地點查詢 ➔ 兒少本土語言辭典（閩南語／客語）`。
   - 全站工具總數自 54 遞增至 55。
3. `components/News/SiteNav.tsx` 與 `components/News/SiteFooter.tsx`：自動因 `TOOL_CATALOG` 讀取並渲染。

---

## 5. 驗收標準 (Acceptance Criteria)
1. **資料管線**：ETL 腳本 `scripts/import-moedict-languages.mjs` 能正確解析 g0v 閩南語與客語詞典，並產出精簡種子檔或寫入 MySQL。
2. **API 查詢**：`/api/tools/child-native-languages?lang=twblg&q=食飽` 及 `?lang=hakka&q=恁仔細` 能正確回傳符合結構之 JSON 資料；支援以華語關鍵字反查（如查「謝謝」能找出「恁仔細」與「多謝」）。
3. **介面互動**：
   - 瀏覽 `/tools/child-native-languages` 時，預設呈現主題探索 Pills（日常問候、家庭親屬等），點選立即展示推薦詞卡。
   - 點擊發音按鈕，能順暢播放真人朗讀音檔。
   - 點擊詞卡能即時展開詳細釋義與例句，並更新瀏覽器網址 `?lang=...&word=...`。
4. **型別與構建驗證**：
   - `npm run typecheck` 0 錯誤。
   - `npm run lint` 0 錯誤。
   - 完整通過測試套件。
