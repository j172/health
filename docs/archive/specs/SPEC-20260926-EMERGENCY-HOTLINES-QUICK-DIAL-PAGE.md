# SPEC-20260926: 全臺急用緊急專線速查與直撥單頁 (Emergency Hotlines Quick Dial Page)

- **Issue/Ticket**: #421
- **Status**: Accepted / Ready for Implementation
- **Author**: Antigravity Assistant & Engineering Team
- **Date**: 2026-09-26

---

## 1. 核心動機與問題陳述 (Problem Statement & Motivation)

在天然災害（強震、颱風積淹水）、人身安全威脅（暴力、性侵害、詐騙）、緊急醫療傷病（急救送醫、中毒）或突發民生危機（無預警停電、自來水幹管破裂）發生時，民眾常因驚慌或緊張，難以在第一時間回憶起正確的政府簡碼（如 110、119、112、113、118、165、1925、1910、1911 等），或因撥打 1999 跨縣市/手機分流錯誤而延誤通報。

既有的政府 Open Data 缺乏即時、統一、跨部會的簡碼直撥服務。本功能旨在提供一個**極致速度、直覺高對比、零延遲、離線可用且無障礙支援**的單頁應用（Single Page Tool），讓使用者在緊急關頭以最短時間定位專線並「一鍵直撥（One-Click Dial）」。

---

## 2. 路由與架構定位 (Routing & Architecture)

1. **雙入口機制 (Dual Route Entry)**：
   - 官方完整路徑：`/tools/emergency-hotlines`（隸屬於 `ToolPageShell` 與全站工具體系 `disaster-safety` 類別，具備完整 SEO / FAQPage / MedicalWebPage Schema.org 標註）。
   - 頂級捷徑：`/emergency`（即時轉向或渲染該工具頁，提供極簡、易記的緊急訪問網址）。
2. **目錄登錄 (Catalog Integration)**：
   - 在 `lib/server/tools/catalog.ts` 註冊 `emergency-hotlines`。
   - 歸入 `disaster-safety`（防災與安全示警）分類，並加入 `INDEXABLE_SLUGS` 確保列入 Sitemap 與搜尋引擎索引。
3. **零延遲離線架構 (Zero-Latency Offline SSR/Hydration)**：
   - 資料庫中既有的 47 筆全台簡碼與 22 縣市 1999 對照資料，在 SSR 初始頁面載入時直接預載（Pre-injected via JSON/DB）。
   - 前端搜尋（Fuzzy Match）、分類標籤過濾與縣市切換全部於客戶端記憶體中運行，無任何網路往返（Round-trip）延遲。即使災難發生時行動網路微弱或斷線，已載入頁面仍能 100% 離線運作。

---

## 3. 首屏與互動設計層級 (Tiered Emergency UX)

頁面由上而下規劃為四層急難漸進式架構：

### 第一層：極限急難「五大直撥卡片」（Top Critical Action Cards）
針對生命危急、治安、海難、暴力人身安全，置頂 5 張高對比、超大點擊區域卡片：
1. **110 警察報案**（警徽紅藍主色，一鍵 `tel:110`，附聽語障簡訊報案號碼）
2. **119 火警救護搶救**（高對比救護紅主色，一鍵 `tel:119`）
3. **112 全球行動求救**（金橙主色，提示無 SIM 卡/微弱收訊可撥打）
4. **113 全國婦幼保護**（紫羅蘭主色，家暴、兒虐、性侵保護）
5. **118 海難與海巡報案**（海藍主色，海岸溺水、海難求救）

### 第二層：即時關鍵字模糊搜尋 ＋ 情境痛點標籤（Instant Search & Quick Pills）
- 搜尋欄位：支援拼音、注音、常用口語詞彙（如「停電」、「水費」、「車禍」、「長照」、「心理」、「自殺」、「詐騙」、「家暴」、「食安」、「霸凌」）。
- 快捷標籤列：一鍵點擊切換過濾：
  - `全部`、`🚨 緊急救援`、`🛡️ 弱勢保護`、`⚡ 民生水電`、`🧠 心理協談`、`👮 治安詐騙`、`🚗 交通路況`、`🏥 醫療長照`、`🏛️ 市政便民`。

### 第三層：全臺 22 縣市 1999 便民專線智慧切換器（22-County Smart Switcher）
- 22 縣市切換晶片列（基隆、台北、新北、桃園、台中、台南、高雄...）。
- 支援「自動 GPS 推薦所在縣市」（使用既有 Geolocation hook）。
- 切換選取縣市後，動態展示：
  - **境內市話簡碼**：`1999`（附該縣市市話通話補助或免費分鐘數說明）。
  - **外縣市 / 手機直撥專用代表號**（點擊即可撥打，徹底解決跨縣市 1999 誤轉問題，如人在新北想報修台北市道路坑洞，直撥 `(02)2720-8889`）。

### 第四層：完整結構化專線資料庫卡片列表（Comprehensive Hotline Directory）
- 每張號碼卡片包含：
  - 號碼（超大粗體、點擊撥打）、服務名稱、主管機關。
  - 計費狀態標籤（免付費 / 市話計費 / 前5-10分鐘免費）。
  - 服務時間標籤（24小時 / 平日白天）。
  - 替代號碼（國外直撥號、免付費 0800 長碼、聽語障簡訊專線）。
  - 詳細使用指引與服務項目。

---

## 4. 驗證與相容性標準 (Verification & Quality Assurance)

1. **無障礙支援 (WCAG 2.1 AA / Taiwan moda)**：
   - 確保所有點擊電話連結具備明確語義 `aria-label`（如 `aria-label="撥打 110 警察報案專線"`）。
   - 色彩對比度達 4.5:1 以上，支援淺色（Light Mode）與深色（Dark Mode）無縫切換。
2. **效能要求 (Core Web Vitals)**：
   - LCP < 1.2s，CLS = 0，無任何昂貴客戶端 API 阻塞。
3. **自動化測試**：
   - `npm run typecheck` 零錯誤。
   - `npm run test` 現有 415 項測試維持 100% 通過，且新增相關工具頁測試。

---

## 5. 交付時程與步驟 (Implementation Steps)

1. 建立 SPEC 文件（本檔）。
2. 在 `lib/server/tools/catalog.ts` 登錄 `emergency-hotlines`。
3. 實作 `components/Tools/EmergencyHotlinesContent.tsx` 前端組件。
4. 實作 `app/tools/emergency-hotlines/page.tsx` 工具頁面。
5. 實作 `app/emergency/page.tsx` 頂級捷徑重導向。
6. 執行全套型別檢查與單元測試。
7. 合併至 `main` 分支並檢視部署。
