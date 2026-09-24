# 規格：導入 MIT 與 CC0-1.0 雙軌授權（SPDX: MIT AND CC0-1.0）

- **Type**: Licensing / Legal Compliance / Open Data Governance
- **Affects**:
  - `LICENSE`
  - `package.json`
  - `README.md`
  - `app/llms.txt/route.ts`
  - `app/llms-full.txt/route.ts`
  - `components/News/SiteFooter.tsx`
  - `locales/zh-TW.json`
  - `locales/en.json`
  - `tests/license-and-spdx.test.mjs`

---

## 1. 背景與緣起

本專案 `j172tw Healthz` 原先根目錄 `LICENSE` 僅保留了上游 Next.js Templates 之 MIT License 聲明。隨著專案持續發展，本平臺彙整並產出了大量的公衛數據、結構化中繼資料（Metadata）、計算器公式、經緯度補全（Geocoding）與 AI 結構化摘要（`geo_summary`）。

為了推動開放資料與 AI 友好（GEO / LLMs Ingestion），同時妥善保護與釐清原創軟體原始碼、上游模板與外部政府資料的權益界限，決定正式導入 **SPDX: `MIT AND CC0-1.0`** 複合授權結構：
- **軟體原始碼**：採用寬鬆且廣為採納的 **MIT License**。
- **原創結構化資料與中繼資料**：採用公眾領域貢獻宣告 **CC0-1.0 Universal**（No Rights Reserved）。
- **底層政府資料與外部新聞**：清楚標記上游臺灣政府開放資料（OGDL 1.0）之出處標示要求，與外部媒體著作權引述限制。

---

## 2. 授權邊界與定義 (Licensing Boundaries)

1. **軟體原始碼 (Code) - MIT License**
   - 涵蓋所有前端與後端應用程式碼（`.ts`, `.tsx`, `.js`, `.mjs`, `.css`）、Next.js 核心邏輯、伺服器排程（cron）與組態檔。
   - 保留上游著作權聲明，並列新增本專案著作權人：
     ```text
     Copyright (c) 2023 Next.js Templates
     Copyright (c) 2026 j172tw (https://health.j172.tw)
     ```

2. **自創資料庫結構、中繼資料與 AI 摘要 - CC0-1.0 Universal**
   - 涵蓋本站原創設計之資料庫 Schema、資料清洗與標準化轉換規則、TGOS / 座標補全中繼資料、AI 結構化新聞重點摘要（`geo_summary`）、端點導航清單與健康試算常數對照表。
   - 全球性放棄著作權與相關鄰接權利，允許任何人、任何 AI 代理人在免經許可、免標示版權的前提下自由複製、修改、散布與商用（但仍鼓勵署名）。

3. **第三方與政府資料保留 (Upstream Data & Third-Party Rights)**
   - **臺灣政府開放資料**：底層公衛、機構、氣象、空品等資料源自政府部門，下游使用者利用該等原始資料時，仍應遵照《政府資料開放授權條款-第1版》（OGDL-Taiwan-1.0）之規範標明資料來源機關。
   - **外部媒體新聞**：新聞標題與引述內容受原著作權人保護，本平臺依公衛公益資訊彙整與合理使用（Fair Use）原則呈現。
   - **圖檔**：部分配圖來自 Pixabay 等免版權圖庫，各依其平台條款授權。

---

## 3. 落地執行項目 (Implementation Plan)

1. **`LICENSE`**：
   - 撰寫整合型授權書，開頭以明確的前言（Preamble）標明 Code（MIT）與 Data/Metadata（CC0-1.0）的權利劃分。
   - 完整收錄 MIT 授權條款全文。
   - 完整收錄 CC0-1.0 Universal 法律條款全文。
2. **`package.json`**：
   - 保留 `"private": true`。
   - 新增 `"license": "MIT AND CC0-1.0"`。
3. **`README.md`**：
   - 增設 `## 📄 授權條款 (License & Open Data)` 章節，詳述程式碼與資料雙重授權機制與政府開放資料出處說明。
4. **`app/llms.txt/route.ts` & `app/llms-full.txt/route.ts`**：
   - 在知識端點加入授權與使用條款宣告，明示 AI 代理人與爬蟲可於 CC0-1.0 基礎下自由利用結構化規格、公式與摘要。
5. **`components/News/SiteFooter.tsx` & 語系檔**：
   - 於頁尾著作權列標註「程式碼採用 MIT 授權 · 結構化資料採用 CC0-1.0」，兼顧開放精神與透明度。
6. **自動化驗證測試 (`tests/license-and-spdx.test.mjs`)**：
   - 驗證 `package.json` 的 `license` 欄位為 `MIT AND CC0-1.0`。
   - 驗證 `LICENSE` 同時包含 MIT 與 CC0-1.0 關鍵字與版權人資訊。
   - 驗證 `/llms.txt` 路由輸出包含 CC0 授權說明。

---

## 4. 驗收標準 (Acceptance Criteria)

- `LICENSE` 檔案語意清晰且合法有效。
- `package.json` 符合 npm / SPDX 標準。
- `npm run test` 所有單元測試與授權驗證測試全數通過 (0 failure)。
- `npm run typecheck` 型別檢查通過。
- 網站建置與端點（`/llms.txt`、頁尾）正常渲染。
