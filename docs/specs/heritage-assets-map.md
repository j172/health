# Specification: 文化資產地圖（古蹟／歷史建築／考古遺址）

## 0. 背景與範圍

延續 `docs/specs/disaster-shelter-rescue-map.md`（Phase 1，已上線）同一輪 grill 拆分出的 Phase 2。對象是文化部文化資產局（BOCH）開放資料平台的 2 個資料集。與 Phase 1 防災地圖是完全獨立的功能，資料源、資料表、頁面互不共用，僅共用「多圖層地圖」這個 UI pattern。

## 1. 資料來源

| 資料集 | URL | 內容 | 座標欄位 |
|---|---|---|---|
| 文化資產個案（建築類） | `https://data.boch.gov.tw/opendata/v2/assetsCase/1.2.json` | 古蹟／歷史建築，含 `caseId`/`caseName`/`assetsTypes`/`pastHistory`（完整沿革文字）/`addresses`/`longitude`/`latitude`/代表圖片 | `longitude`/`latitude`（十進位度數，**免 geocode**） |
| 文化資產個案（考古遺址） | `https://data.boch.gov.tw/opendata/v2/assetsCase/2.1.json` | 考古遺址，含 `caseId`/`caseName`/`assetsClassifyCode`(`2.1.x`)/`judgeCriteria`/`registerReason`/`landScope`/`longitude`/`latitude`/代表圖片 | `longitude`/`latitude`（免 geocode） |

兩個資料集皆為 JSON array，欄位不完全相同，統一寫入同一張表時取聯集欄位，各自只填自己有的部分。

授權揭露沿用既有 `catalog.ts` 慣例：`authority: "文化部文化資產局 (BOCH)"`, `url: "https://data.boch.gov.tw"`。

### 1.1 實測結果（2026-09-09，實作時 curl 驗證）

- 建築類 (`1.2.json`)：**1,789** 筆。欄位比規格文件原先假設更多，包括 `pastHistory` 與 `registerReason` **同時存在**（規格文件原先誤以為 `registerReason` 只在考古遺址資料集出現，實測建築類個案也常見兩者並存，因此 ingest 邏輯對兩個資料集都會嘗試填入 `past_history`／`register_reason`，非互斥）。**沒有** `representImageSource` 欄位（規格文件原先假設兩者都有，實測建築類資料集完全不含此欄位，考古遺址則每筆都有）。
  - 座標缺失／為 0：2 筆（`caseId 20220831000001`「竹圍福海宮」`longitude`/`latitude` 皆為 `0`；`caseId 20241220000001`「迪化街1段15號暨南京西路233巷14號店屋」完全缺少 `longitude`/`latitude` 欄位）。ingest 將這類記錄的座標寫入 `NULL`，前端過濾掉無座標記錄不上圖。
  - `caseId` 100% 唯一、無重複，可安全作為 upsert 鍵。
  - `representImage.original` 100% 有值。
- 考古遺址 (`2.1.json`)：**58** 筆。座標、`representImage.original`、`representImageSource` 皆 100% 有值。`caseId` 100% 唯一。

## 2. 導覽定位（已拍板，不重新討論）

- **不**建立新的頂層導覽分類。掛進既有 `group: "public-facility"`。
- `catalog.ts` 新增 entry `slug: "heritage-map"`，並在 `public-art`、`cultural-events` 兩個既有 entry 的 `relatedSlugs` 裡加入 `"heritage-map"`（雙向關聯）。
- 與 Phase 1 的 `disaster-map` 不同：`disaster-map` 因安全攸關被拍板為獨立頂層導覽項目（見 `ToolGroup` 的 `disaster-preparedness`），`heritage-map` 沒有這個理由，因此**不**取得專屬頂層導覽連結，純粹透過 `group: "public-facility"` 自動掛進既有「便民服務」下拉選單／頁尾欄位／`/tools` 分類（這些位置的成員清單皆由 `TOOL_CATALOG` 依 `group` 自動篩選產生，無需另外手動修改導覽元件）。

## 3. 資料模型

新增 1 張表 `heritage_assets`（單表 + `category` enum 區分 `'building' | 'archaeological_site'`）：

```
heritage_assets (
  id                INT PK AUTO_INCREMENT
  case_id           VARCHAR(50) UNIQUE      -- 來源 caseId，可作為 upsert 鍵（跟 Phase 1 不同，這裡有穩定唯一鍵）
  category          ENUM('building','archaeological_site')
  case_name         VARCHAR(255)
  assets_type_names VARCHAR(255) NULL       -- building: assetsTypes[].name 逗號合併
  classify_code     VARCHAR(20) NULL        -- archaeological_site: assetsClassifyCode
  classify_name     VARCHAR(100) NULL       -- archaeological_site: assetsClassifyName
  city_name         VARCHAR(50) NULL
  dist_name         VARCHAR(50) NULL
  address           VARCHAR(255) NULL
  past_history      MEDIUMTEXT NULL         -- 兩資料集皆可能有值，沿革全文
  register_reason   MEDIUMTEXT NULL         -- 兩資料集皆可能有值，登錄理由全文
  gov_institution_name VARCHAR(100) NULL
  longitude         DECIMAL(10,7) NULL
  latitude          DECIMAL(10,7) NULL
  image_url         VARCHAR(500) NULL       -- representImage.original
  image_source      VARCHAR(255) NULL       -- representImageSource（僅考古遺址資料集提供，建築類固定為 NULL）
  source_updated_at DATETIME NULL
  created_at        DATETIME
  updated_at        DATETIME
)
```

- 與 Phase 1 不同：來源有穩定唯一鍵 `caseId`，因此採 **upsert**（`ON DUPLICATE KEY UPDATE`），不需要整批 truncate-and-replace；仍要記錄 `source_updated_at` 供頁面顯示同步時間。
- 部分記錄座標缺失（少數 `longitude`/`latitude` 為 0 或缺欄位，實測 2/1789 筆屬於此情況）時允許 NULL，前端過濾掉無座標記錄不上圖。

## 4. 同步管線

- 新檔 `lib/server/culture/ingestHeritageAssets.ts`：`runHeritageAssetsSync()`，抓兩個 JSON、正規化、upsert 進 `heritage_assets`。
- 擴充既有 `app/api/admin/culture-sync/route.ts`：新增 `type === "heritage" || type === "all"` 分支呼叫 `runHeritageAssetsSync()`，回傳結果併入既有 `results` 物件（`results.heritage`）。**不**新建獨立的 admin sync 端點——這是刻意跟 public-art/cultural-events 共用同一個 admin 入口與排程慣例的決策。
- 排程：實作時發現 `.github/workflows/six-monthly-sync.yml`（每年 1/2、7/2 各跑一次）**確實**會呼叫 `culture-sync`——`type=shows` 直接 curl 觸發，`public-art` 則透過 `scripts/import-public-art.mjs`（因該腳本需在 runner 端抓資料後分批 POST，非直接呼叫 `type=public-art`）。這與規格文件原先假設「public-art/cultural-events 目前都沒有自動排程」不符，已更正：比照這個既有的六個月排程慣例，在同一個 `six-monthly-sync.yml` 裡新增一個呼叫 `type=heritage` 的 curl 步驟（heritage 兩個來源皆由 `runHeritageAssetsSync()` 在正式站本機直接抓取，跟 `type=shows` 一樣不需要額外的 runner 端匯入腳本）。**沒有**另外新增獨立的 workflow 檔案。

## 5. 前端

- 新頁面 `/tools/heritage-map`：單頁多圖層地圖，兩個圖層 toggle（古蹟／歷史建築、考古遺址，皆預設開，因為皆屬静態、非安全攸關資訊，不像防災地圖需要預設收合次要圖層）。
- marker popup：名稱、類型（assets_type_names 或 classify_name）、地址、代表圖片（若有）、沿革/登錄理由摘要（過長文字截斷+展開）。
- 不需要 Phase 1 那種「資料非即時」安全免責聲明（此資料非安全攸關，變動頻率低），但仍需標示「資料來源：文化部文化資產局開放資料，最後同步時間：{source_updated_at}」。
- i18n：`nav.heritageMap`，比照 Phase 1 只需補 `zh-TW.json`／`en.json`（本專案目前只有這兩份靜態語系字典，zh-CN 走 `tDynamic` 動態產生，不建立第三份靜態檔）。另補上 `catalog["heritage-map"]`（en.json）供英文下拉選單/頁尾標題正確顯示，比照 `public-art`／`cultural-events` 既有慣例（這兩者的下拉/頁尾項目標題走 `catalog.<slug>` 這把 i18n key，並非 `nav.*`）。

## 6. Out of Scope

- 開新頂層導覽分類（已否決，見第 2 節）
- 兩個資料源分成兩個獨立 `/tools` 頁面（已否決，統一單頁多圖層）
- 進 `facilities` 主表／geocode 管線
- 即時性/免責聲明機制（非安全攸關資料，不比照 Phase 1）

## 7. 驗收標準

- `npx tsc --noEmit` 0 errors
- `npm run lint` 0 errors
- `npm run build` 成功
- 手動 curl 驗證兩個來源目前可正常下載，筆數與本規格查驗時的量級相符（見 1.1 節）
- `/tools/heritage-map` 兩圖層可切換、popup 資訊正確（含沿革/登錄理由文字、代表圖片）、頁面顯示同步時間
- `catalog.ts` 的 `public-art`／`cultural-events`／`heritage-map` 三者 `relatedSlugs` 互相正確關聯
