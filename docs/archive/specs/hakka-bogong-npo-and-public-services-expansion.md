# Spec & Ticket: 客家伯公照護站擴展、便民生活三工具、NPO組織信任徽章、10+1社福新聞來源與19家藝文雙語售票募款整合

- **Ticket ID**: `SPEC-HEALTH-20260911-HAKKA-BOGONG-NPO-AND-PUBLIC-SERVICES`
- **Priority**: HIGH (P1)
- **Status**: IMPLEMENTED
- **Closes**: #194
- **Affects**:
  - `components/Facilities/FacilitySearchContent.tsx`
  - `lib/server/petAdoption/types.ts`
  - `lib/server/petAdoption/queries.ts`
  - `app/api/pet-adoptions/route.ts`
  - `components/PetAdoption/PetAdoptionContent.tsx`
  - `app/tools/pet-adoption/page.tsx`
  - `scripts/ingest-pet-adoptions.mjs`
  - `app/tools/facilityConfigs.ts`
  - `app/tools/bookstores/page.tsx`
  - `scripts/import-moc-bookstores.mjs`
  - `app/tools/tourism-factories/page.tsx`
  - `scripts/import-ida-tourism-factories.mjs`
  - `lib/server/tools/catalog.ts`
  - `app/tools/page.tsx`
  - `locales/en.json`
  - `lib/server/npoOrganizations/enrichNpoSources.ts`
  - `lib/server/npoOrganizations/queries.ts`
  - `app/api/npo-organizations/route.ts`
  - `app/api/admin/npo-enrich/route.ts`
  - `app/tools/npo-organizations/NpoOrganizationsContent.tsx`
  - `types/rss.ts`
  - `lib/server/news/sourceLabels.ts`
  - `lib/server/news/sourceCategories.ts`
  - `lib/server/config/rss-feeds.ts`
  - `lib/server/rss/fetchNpoSources.ts`
  - `lib/server/rss/runIngestion.ts`
  - `lib/server/rss/fetchNpoSources.test.mjs`
  - `lib/server/db/schema.ts`
  - `lib/server/db/mysql.ts`
  - `lib/server/culture/types.ts`
  - `lib/server/culture/queries.ts`
  - `lib/server/culture/ingestExternalEvents.ts`
  - `app/api/admin/culture-external-sync/route.ts`
  - `components/Activities/CulturalEventsContent.tsx`

---

## 1. Problem Statement (問題與背景)

在 health.j172.tw 的公共健康、福利設施與文化生活生態系中，使用者回饋與數據分析指出了五大關鍵問題：

1. **客家伯公照護站預設顯示不足與地域限制**：
   - 全台共建置有 556 處客家伯公照護站，但 `/tools/hakka-bogong` 使用者若定位於無客家聚落之市中心，因 50km 半徑過窄，預設僅回傳 3 筆，造成使用者誤以為資料遺漏或全台僅有少數站點。
2. **缺乏身心靈放鬆與便民生活開放資料工具**：
   - 現代大眾心理健康除了傳統醫療諮商外，伴侶動物領養（身心陪伴）、實體獨立書店漫遊（文化生活、心理沉澱）、健康觀光工廠（食農教育、家庭休閒）均為關鍵生活支持環節，平台尚缺乏專屬互動查詢工具。
3. **NPO 公益組織缺乏跨平台合作認證與公信力標記**：
   - 既有 `/tools/npo-organizations` 雖已整合數千家公益組織，但使用者難以一眼辨識組織是否有長期公開勸募執照、是否為主流公益平台（Yahoo! 公益、NPO Channel、104 社會企業）之常態合作夥伴。
4. **重大社福倡議、罕病、癌症與長照 NPO 新聞缺漏**：
   - `/news` 的「公益社福」類別雖已建立，但缺乏慈濟基金會、陽光基金會、失智老人基金會、癌症基金會、至善基金會、罕見疾病基金會、弘道老人福利基金會、台灣環境資訊協會、婦女新知基金會、法律扶助基金會與天下永續會等重要第一線機構的新聞發布。
5. **藝文與公益活動未涵蓋主流售票系統與募款專案**：
   - `/tools/cultural-events` 僅同步文化部展演及 NPO 活動，未收錄 Accupass、KKTIX、寬宏售票、拓元、博客來、年代、全家 FamiTicket、ibon 等售票演出，亦未收錄 Yahoo 公益專案、NPO Channel、樂公益、iGiving 等線上勸募專案，且資料庫缺乏雙語（英文標題、簡介）與售票/募款連結之儲存欄位。

---

## 2. Solution Architecture (架構與實作設計)

### 2.1 客家伯公照護站 500km 半徑自動擴大 (`components/Facilities/FacilitySearchContent.tsx`)
- **智慧擴展邏輯**：當定位後 50km 半徑內搜尋結果小於 30 筆時，系統自動將搜尋半徑放寬至 500 km（涵蓋全台灣各縣市）。
- **誠實總筆數與友善提示**：
  - 若觸發 500km 擴大，UI 標記「（已擴大搜尋半徑至 500 km）」，並提供按鈕允許切換回 50km 原範圍。
  - 保留並誠實展示全台實際總收錄筆數（如 556 筆）。

### 2.2 便民生活三大開放資料工具
1. **全台寵物認領養資訊 (`/tools/pet-adoption`)**：
   - 整合農業部動物保護資訊網開放資料（OpenData ID: `108`）。
   - 建立 `pet_adoptions` 資料表與型別定義（`lib/server/petAdoption/types.ts`、`queries.ts`）。
   - 提供動物類別（貓、狗、其他）、性別、體型、毛色、絕育狀況、施打微晶片、收容縣市多維度即時篩選。
   - 完整呈現收容所名稱、地址、電話（可點擊直撥）與高品質領養照片。
   - 實作匯入腳本 `scripts/ingest-pet-adoptions.mjs` 與 API 端點 `/api/pet-adoptions`。
2. **獨立書店地圖 (`/tools/bookstores`)**：
   - 整合文化部全國實體書店名錄（OpenData ID: `37825`）。
   - 註冊於 `app/tools/facilityConfigs.ts`，共享高效能設施搜尋引擎（分群、地圖、距離計算、營業資訊）。
   - 實作資料轉換腳本 `scripts/import-moc-bookstores.mjs`。
3. **觀光工廠巡禮 (`/tools/tourism-factories`)**：
   - 整合經濟部產發署通過評鑑之觀光工廠開放資料。
   - 註冊於 `app/tools/facilityConfigs.ts`，涵蓋健康食品、生技美容、民生休閒工廠。
   - 實作轉換腳本 `scripts/import-ida-tourism-factories.mjs`。
4. **工具目錄與導航整合**：
   - 更新 `lib/server/tools/catalog.ts`、`app/tools/page.tsx` 及多國語系 `locales/en.json`。

### 2.3 NPO 組織多來源交叉驗證與信任徽章 (`/tools/npo-organizations`)
- **多來源匹配核心 (`lib/server/npoOrganizations/enrichNpoSources.ts`)**：
  - 交叉比對四大來源：Yahoo! 公益認證組織、NPO Channel 夥伴、104 企業與組織資料、衛福部公益勸募登記機構。
- **信任徽章系統 (`lib/server/npoOrganizations/queries.ts`)**：
  - 組織卡片注入徽章：`Yahoo! 公益合作`、`NPO Channel 夥伴`、`104 社會企業夥伴`、`衛福部勸募許可`。
  - 新增篩選功能：支援 `hasBadges: true`（前端按鈕 `[🛡️ 僅看合作認證]`）。
  - 排序演算法：具備認證徽章者自動享有較高排序權重。
  - 管理端同步端點：`/api/admin/npo-enrich`。

### 2.4 `/news` 擴增 10+1 家重要 NPO 與永續新聞來源
- **10 家自定義 Cheerio HTML 爬蟲** (`lib/server/rss/fetchNpoSources.ts`)：
  1. `tzuchi`：佛教慈濟基金會焦點新聞
  2. `sunshine`：陽光社會福利基金會
  3. `cfad`：天主教失智老人基金會
  4. `fct`：台灣癌症基金會
  5. `friendship`：至善社會福利基金會
  6. `tfrd`：罕見疾病基金會
  7. `hondao`：弘道老人福利基金會
  8. `teia`：台灣環境資訊協會
  9. `wakf`：婦女新知基金會
  10. `laf`：法律扶助基金會
- **1 家 RSS 來源** (`lib/server/config/rss-feeds.ts`)：
  - `csr_cw_social`：CSR@天下 / 永續會（透過 Google News RSS 管道安全轉接）
- **分類與排程**：
  - 在 `types/rss.ts`、`sourceLabels.ts` 註冊 11 組代碼。
  - 將全部 20 家社福組織歸類至 `lib/server/news/sourceCategories.ts` 的 `npo` (公益社福) 分類。
  - 串接至 `lib/server/rss/runIngestion.ts` 批次擷取管道。

### 2.5 藝文與售票平台整合及雙語儲存 (`/tools/cultural-events`)
- **資料表結構擴充** (`lib/server/db/schema.ts`, `mysql.ts`)：
  - `cultural_events` 新增 `title_en` (VARCHAR 255)、`description_en` (TEXT)、`extra_json` (JSON)。
  - `pet_adoptions` 建立完整資料表與索引。
- **19 家來源收錄與自動種子資料** (`lib/server/culture/ingestExternalEvents.ts`)：
  - 涵蓋售票系統：Accupass、KKTIX、寬宏售票、拓元售票、博客來售票、全家 FamiTicket、年代售票、ibon（票券/交通/活動/展覽/運動/娛樂）、TicketPlus。
  - 涵蓋公益專案：Yahoo 公益專案、NPO Channel、樂公益 LeCoin、iGiving、NPOst、生命力新聞。
  - 支援雙語存儲：自動記錄英文標題與英文說明，未提供時提供優雅回退。
- **前端介面升級** (`components/Activities/CulturalEventsContent.tsx`)：
  - 新增分類分頁：`❤️ 公益專案/線上募款` 與 `🎟️ 售票展演`。
  - 支援英文副標題展示與相應 CTA 按鈕導流（購票 / 線上捐款）。
  - 管理端手動同步端點：`/api/admin/culture-external-sync`。

---

## 3. Verification & Test Plan (測試與驗證)

1. **靜態型別安全**：
   - `npx tsc --noEmit`：0 errors，所有新介面、型別、API 路由均完全相容。
2. **單元測試回歸**：
   - `npm test`：162/162 測試全數通過（含 `fetchNpoSources.test.mjs` 爬蟲解析器回歸）。
3. **資料庫與匯入驗證**：
   - `schema.ts` / `mysql.ts` DDL 正確，支援欄位擴充與全新表建立。
   - 各外部同步與匯入腳本具備防抖與去重機制。
