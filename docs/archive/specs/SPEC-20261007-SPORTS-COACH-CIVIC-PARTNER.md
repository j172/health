# SPEC-20261007: 運動部不適任教練專區公民倡議友站整合與短期補習班雙軌查核規格

- **Spec ID**: `SPEC-20261007-SPORTS-COACH-CIVIC-PARTNER`
- **Issue**: #430
- **Related Tickets**: [TICKET-20261007-SPORTS-COACH-CIVIC-PARTNER.md](../tickets/TICKET-20261007-SPORTS-COACH-CIVIC-PARTNER.md)
- **Status**: Ready for Implementation
- **Author**: Antigravity (Pair Programming with User)
- **Date**: 2026-10-07

---

## 1. 概述 (Overview)

本規格定義並實作將中華民國運動部（體育署）官方公告之「涉及違法事件不適任教練資訊專區」（`https://www.sports.gov.tw/News/6295`），比照「台灣罪犯圖鑑（`metawilo.com`）」之全套深度模式整合至 `health.j172.tw`（健康生活與公共資訊中心）。

依據 GRILL ME 審定之核心共識：
1. **識別與命名定位**：識別 ID 定為 `sports-coach`，名稱定為「運動部不適任教練專區」，頁尾外連標籤為「運動部不適任教練 ↗」。
2. **夥伴群組排序**：緊隨「台灣罪犯圖鑑（`metawilo`）」之後（`g0v` ➔ `kuma` ➔ `anti-cw` ➔ `metawilo` ➔ `sports-coach` ➔ `council2026`），使兒少安全防護與司法查核兩大同主題夥伴緊密相鄰。
3. **版位三層級全面聯動**：
   - **全站頁尾（`SiteFooter.tsx`）**：在「公民倡議與友站」專欄新增文字外連。
   - **首頁與工具目錄精選專區（`CivicPartnersSection.tsx`）**：新增精緻卡片（圖示 `🥋`、徽章「體育安全」、Teal 青綠色系）。
   - **兒少教育工具情境式深度聯動（`ContextualPartnerCard.tsx`）**：在「短期補習班（`/tools/cram-schools`）」搜尋頁面頂部，以 `compact={true}` 緊湊樣式，並列 / 堆疊「台灣罪犯圖鑑（民間裁判）」與「運動部不適任教練（行政處分）」雙卡片，構建完整的課後安全查核防線。
4. **外連與追蹤安全**：全面遵循 `target="_blank" rel="noopener noreferrer"` 與標準 UTM 參數規則。

---

## 2. 夥伴配置表 (Configuration Matrix)

| 屬性 | 設定值 | 說明 |
| :--- | :--- | :--- |
| **ID** | `sports-coach` | 註冊於 `CivicPartnerId` 聯合型別 |
| **名稱** | 運動部不適任教練專區 | 卡片標題名稱 |
| **網址** | `https://www.sports.gov.tw/News/6295` | 運動部官方裁罰公告專區網址 |
| **圖示 (Icon)** | `🥋` | 代表體育教練、運動訓練與武道專長 |
| **徽章 (Badge)** | 體育安全 | 醒目標章文字 |
| **配色主題** | Teal 青綠色系 | `bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800` |
| **標籤 (Tag)** | 體育安全 ‧ 不適任名單 | 大卡片次標題 |
| **卡片簡介** | 運動部官方公告涉及性平、傷害與違法情事之不適任教練名單，守護學生與兒少運動安全。 | 專區說明文案 |
| **情境卡片標題** | 課後運動與體育教練安全查核 | 工具內橫幅標題 |
| **情境卡片說明** | 把關課後運動與才藝訓練安全：建議搭配運動部公告專區，查核是否有涉及違法事件之不適任教練。 | 工具內呼籲文案 |
| **情境行動按鈕** | 查核不適任名單 | 行動按鈕文字 |

---

## 3. 架構與實作細節 (Implementation Details)

### 3.1 情境常數定義 (`lib/constants/contextualPartners.ts`)
- 於 `CivicPartnerId` 擴充 `"sports-coach"`。
- 在 `CONTEXTUAL_PARTNERS` 字典新增 `sports-coach` 之完整主題色彩、文字與預設值配置。

### 3.2 首頁與目錄公民夥伴卡片 (`components/Common/CivicPartnersSection.tsx`)
- 在 `CIVIC_PARTNERS` 陣列中，於 `metawilo` 之後插入 `sports-coach` 卡片項目。

### 3.3 全站頁尾 (`components/News/SiteFooter.tsx`)
- 在 `civicPartnerLinks` 中，於 `metawilo` 項目之後插入：
  ```tsx
  {
    href: appendOutboundUtm("https://www.sports.gov.tw/News/6295", {
      medium: "civic_partner",
      campaign: "civic_alliance",
      content: "footer",
    }),
    label: t("footer.sportsCoach", "運動部不適任教練 ↗"),
  },
  ```

### 3.4 短期補習班情境式雙重查核 (`app/tools/cram-schools/page.tsx`)
- 將原單一 `metawilo` 卡片調整為 Compact 緊湊排版雙卡片：
  1. `metawilo`：校園與補教環境安全查核（兒少性犯罪公開判決）
  2. `sports-coach`：課後運動與體育教練安全查核（不適任體育教練名冊）

### 3.5 多國語言字典 (`locales/*.json`)
- `zh-TW.json`: `"sportsCoach": "運動部不適任教練 ↗"`
- `en.json`: `"sportsCoach": "Sports Administration Ineligible Coaches ↗"`
- `ja.json`: `"sportsCoach": "スポーツ指導者不適任公報 ↗"`
- `ko.json`: `"sportsCoach": "부적격 스포츠 지도자 조회 ↗"`

---

## 4. 測試與驗證計畫 (Verification Plan)

### 4.1 自動化合約測試
1. `lib/constants/contextualPartners.test.mjs`：
   - 擴充驗證陣列為 6 大公民夥伴（包含 `sports-coach`）。
   - 驗證 `sports-coach` 的 `baseUrl`、`name`、`badge`、預設標題與說明均非空。
   - 驗證 `buildContextualPartnerUrl` 生成標準 UTM 參數。
2. `lib/server/tools/footerLinks.test.mjs`：
   - 驗證 `SiteFooter.tsx` 包含 `https://www.sports.gov.tw/News/6295`。
   - 驗證 6 大公民夥伴連結均使用 HTTPS。

### 4.2 全站型別與迴歸測試
- 執行 `npm run typecheck`。
- 執行 `npm test` 確認全站 424+ 測試無任何破壞性變更。
