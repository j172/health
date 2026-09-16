# 規格書：政府資料開放平臺（data.gov.tw）與公部門即時新聞全量收錄與前台展示

## 1. 概述 (Overview)

本規格書規範並定義本站全量收錄台灣政府公部門與政府資料開放平臺（data.gov.tw）之即時新聞、政策公告與公報資訊的整合架構。

### 1.1 背景與痛點
- 原有系統的新聞來源多以傳統 RSS 與特定媒體為主，許多關鍵中央部會與地方衛環局處之開放資料（Open Data）即時新聞未被全量收錄；
- 政府開放資料之資料集格式分歧，部分包含全文，部分僅提供摘要與連結，甚至缺少隨文附圖或附帶多個 PDF/公文附件；
- 前台界面未對政府公信力資訊提供專屬標章與開放資料授權、機關承辦中繼資料之展示。

### 1.2 核心原則
1. **資料範疇精準覆蓋**：聚焦於「民生、健康、醫療、社福、環境、公共安全」以及「交通路況與安全」相關之中央部會（衛福部全體機關、環境部、農業部、內政部、交通部）與各縣市衛生局/環保局開放資料。
2. **雙軌分層擷取（Dual-Track Tiered Ingestion）**：
   - **<= 90 天內新聞**：以開放資料欄位為基礎，缺全文時自動發動深度爬蟲爬取詳細頁排版正文（`detail_html`/`detail_text`）、官方宣導海報與公文附件；
   - **> 90 天歷史存檔**：直接以開放資料集自帶之標題與欄位直接入庫，不發動外部網頁爬蟲，保護主機資源免於 OOM 或 IP 遭阻擋。
3. **無縫資料模型整合**：統一收錄於既有 `news_items` 與 `news_assets` 表，欄位語意對齊，直接享有全站搜尋、分頁、SEO JSON-LD、地理位置萃取與關聯推薦。
4. **權威公信力前台展示**：
   - 列表頁卡片標註「🏛️ 政府開放資料／發布機關」精緻標章；
   - 無官方圖時自動使用機關專屬綠色/海藍漸層徽章，不強塞無關圖庫照片；
   - 內頁增設「官方資訊卡」展示發布機關、資料集代碼、政府資料開放授權條款（ODGL）標籤及附件下載清單。
5. **雙模組運作架構**：提供獨立 CLI 腳本 `scripts/sync-gov-opendata-news.mjs`（支援 `--backfill`, `--limit`, `--dry-run`）以及站內每 30 分鐘自動增量同步與安全後台端點。

---

## 2. 涵蓋部會與資料集規格 (Ministries & Datasets Taxonomy)

| 部會／領域 | 機關代表 | 資料集類型 | 抓取與映射規範 |
| :--- | :--- | :--- | :--- |
| **衛生福利部 (MOHW)** | 疾管署 (CDC)、食藥署 (TFDA)、健保署 (NHI)、國健署 (HPA)、社家署 (SFAA) | 即時新聞、公告、疫情快訊、食品藥物檢驗通報 | `dept_name` 映射具體機關名稱；雙軌爬取官方新聞稿本文與宣導圖表 |
| **環境部 (MOENV)** | 綜合規劃司、大氣環境司、化學物質管理署 | 環保焦點新聞、空污應變通報、化學防護宣導 | `dept_name` 映射「環境部」；提取監測說明與附件 |
| **農業部 (MOA)** | 動植物防疫檢疫署、農糧署、漁業署 | 動植物疫病通報、農產品食安檢驗、產銷公告 | 聚焦食農健康與防檢疫；附件 PDF 自動關聯至 `news_assets` |
| **內政部 (MOI)** | 警政署、消防署、國土署 | 防災預警、消防安全宣導、反詐及公共安全 | 提取災防地點並通過 `geoExtractor` 進行坐標定位 |
| **交通部 (MOTC)** | 公路局、高公局、氣象署、鐵道局 | 交通管制、道路安全通報、重大工程通報 | 針對路段與地標萃取縣市鄉鎮坐標，支援地圖導覽 |
| **地方衛環局處** | 各縣市政府衛生局、環保局 | 地方疫苗施打、食品稽查、登革熱清消等即時消息 | 結合行政區代碼直接關聯縣市坐標標籤 |

---

## 3. 資料庫欄位對齊與儲存規範

所有開放資料新聞均無縫對齊既有 `news_items` 表結構：

```typescript
export interface GovOpenDataItem {
  source_name: string;        // e.g. "gov_opendata" 或機關代碼
  feed_code: string;          // 資料集代碼 / 機關簡稱
  feed_name: string;          // 資料集名稱 (e.g. "衛生福利部焦點新聞")
  external_id: string;        // 原始資料序號或 URL 雜湊
  canonical_url: string;      // 原始公告網址
  source_url: string;         // 資料集來源或 API 端點
  title: string;              // 公告標題
  description_html: string;   // 摘要 HTML
  description_text: string;   // 摘要純文字
  detail_html: string | null; // 完整文章排版 HTML (近期項目由爬蟲深度擷取)
  detail_text: string | null; // 完整文章純文字
  dept_name: string | null;   // 發布機關 / 承辦科室
  category_raw: string | null;// 分類 (e.g. "焦點新聞", "道安公告")
  published_at_utc: Date;     // 發布時間
  created_at: Date;
  updated_at: Date;
}
```

附件儲存於 `news_assets`：
- `asset_type`: `"attachment"` (PDF, DOCX, ODT) 或 `"image"` (宣導海報、圖表)。
- `title`: 附件名稱。
- `url`: 檔案下載網址。

---

## 4. 前端展示規格 (UI / UX Specifications)

1. **新聞卡片 (`NewsCard.tsx`)**：
   - 若 `item.source_name === "gov_opendata"` 或屬公部門，顯示 `🏛️ [機關名稱]` 專屬膠囊徽章。
   - 徽章樣式採用深綠／湖水藍漸層（`emerald-700`），文字加深，傳遞官方權威感。
2. **卡片縮圖 (`CardThumb.tsx`)**：
   - 優先載入爬取到之官方海報；
   - 無圖時自動渲染機關漸層徽章卡（顯示機關名稱，不強配無關庫存照片）。
3. **內頁排版 (`app/news/[id]/page.tsx`)**：
   - 頂部展示標題、發布時間、主管部會與閱讀時間。
   - 文章本體以 `NewsArticleBody` 渲染完整爬取之排版與圖片。
   - 若有地理座標，展示互動地圖卡片。
   - 文末新增 **「🏛️ 政府開放資料來源資訊卡」**：
     - 發布機關與業務單位
     - 原始資料集與公報連結（外連至官方原址）
     - 標註「中華民國政府資料開放授權條款（ODGL）」
     - 條列附件下載清單（含檔案類型圖示與一鍵下載按鈕）

---

## 5. 同步排程與維護機制

1. **獨立 CLI 工具**：`scripts/sync-gov-opendata-news.mjs`
   - `--dry-run`：僅測試連線與欄位解析，不寫入資料庫。
   - `--limit=<n>`：限制處理筆數。
   - `--backfill`：允許歷史資料存檔模式。
   - `--source=<key>`：指定特定部會資料集。
2. **站內背景自動同步**：
   - 註冊於 `lib/server/cron/registerJobs.ts`，每 30 分鐘執行一次增量更新。
3. **管理員安全 API**：
   - 端點 `/api/admin/gov-opendata-news-sync`，驗證 `RSS_SYNC_ADMIN_SECRET`，支援非同步執行以防 Reverse Proxy 超時。
