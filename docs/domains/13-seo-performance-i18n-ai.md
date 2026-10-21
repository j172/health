# 13 SEO、效能、多語系、AI 友善與授權

> 合併自 15 份原始文件 · 狀態核對基準：`main` @ `7fe098b`（2026-10-12）
> 狀態圖例：✅ 已上線｜🟡 部分完成｜❌ 未實作｜🗄️ 已取代｜📚 研究

---

## 1. 目前真相

| 面向 | 現況 |
|---|---|
| Lighthouse 基準（2026-09-14） | Mobile：Performance 83／A11y 85／Best Practices 92／SEO 100；Desktop 94／94／92／100。Field LCP 1.8s、CLS 0；Lab mobile LCP 4.6s |
| 結構化資料 | 工具頁 `MedicalWebPage` 或 `WebPage`（非醫療資料集用後者）＋`WebApplication`＋`FAQPage`；新聞 `NewsArticle`；首頁 graph |
| 索引 | `sitemap.ts`、`news-sitemap.xml`、IndexNow 主動推送（Bing 等）。新頁面類型一律要同時進 sitemap、`/llms.txt`、`/llms-full.txt`（#438 §R 末句）：目前涵蓋 `/tools/category/*` 分類頁、`/guides` 與 `/guides/*` 情境頁、`/nearby`（含 en/ja/ko 版 hreflang）、`/accessibility`；`/llms*.txt` 的語言與外語頁連結用真實 `/en/`、`/ja/`、`/ko/` 路徑（舊 `?lang=` 已 301），工具數量取自 `TOOL_CATALOG.length`，共用建構器在 `lib/server/content/sitewideLlmsIndex.ts`，測試在 `tests/sitemap-llms-hub-pages-438.test.mjs` |
| 分析 | Google Analytics（gtag）＋Microsoft Clarity |
| 多語系 | zh-TW（預設）、en、ja、ko；不改 URL，以 `?lang=` 參數＋`hreflang`；**簡體中文已完全移除**（含 OpenCC）。⚠️ 2026-10-12 實測：`?lang=` 只在瀏覽器端生效，伺服器對爬蟲永遠輸出中文，外語 `hreflang` 實際無效 → 2.0 P6 改為 `/en/`、`/ja/`、`/ko/` 前綴並由伺服器輸出（#438 §Q） |
| AI 友善 | `/llms.txt`（符合 llmstxt.org 格式）、`/llms-full.txt`、`/llm-info`（Hey AI 官方簡介頁）。⚠️ 2026-10-12 實測：Cloudflare AI 機器人防護對 GPTBot、ClaudeBot 回 403（`robots.txt` 卻寫允許），PerplexityBot 回 200 → 2.0 P0 三類全部放行，並新增每頁 `llms.txt`＋`.md`（#438 §S、§T） |
| 用字 | 全站「台」→ 教育部標準「臺」，API 雙向相容「台／臺」 |
| 授權 | SPDX `MIT AND CC0-1.0`：程式碼 MIT、原創結構化資料 CC0；上游政府資料依 OGDL 1.0 標示出處 |
| 外連追蹤 | `appendOutboundUtm()`：`utm_source=health.j172.tw`（不帶協定字串），`utm_medium` 依版位；不覆蓋上游既有 UTM |
| Google 首選來源 | 新聞內頁「加入 Google 首選」按鈕 |

---

## 2. 長期有效的決策

- **不為 Best Practices 分數妥協「進頁面即定位」**。
- `utm_source` 固定為 `health.j172.tw`（2026-10-12 再次確認），全站外連都要經過 UTM 函式（2.0 補齊覆蓋率）。
- ja／ko 只翻譯介面與名稱，工具與 hub 內文維持中文（2026-10-12 決策）。
- `/llms.txt` 保持精簡索引，細節放 `/llms-full.txt`。

---

## 3. 核對後仍未完成的項目

已併入 2.0：外連 UTM 覆蓋率（20 個寫死外連＋139 個科學依據連結）、en／ja／ko 缺 24 個工具名稱翻譯、行動版 lab LCP。

---

## 4. 逐份紀錄

### 4.1 效能與 SEO

#### Core Web Vitals 與 Search Central 最佳化 ✅
- 原檔：[core-web-vitals-and-seo-optimization.md](../archive/specs/core-web-vitals-and-seo-optimization.md)（#192）
- 行動版 LCP 14.9 秒（HeroPost 原生 `<img>` 傳 2.32MB 原圖）、首頁 `force-dynamic` TTFB 過高；改 ISR、圖片轉 WebP、sitemap 修正。

#### PageSpeed、Search Central、Schema.org 全站系統化最佳化 ✅
- 原檔：[pagespeed-search-central-schema-optimization.md](../archive/specs/pagespeed-search-central-schema-optimization.md)（#227）
- 63 個工具頁 metadata 與 JSON-LD 一致化；分析腳本延後載入。

#### Lighthouse 基準量測 📚
- 原檔：[pagespeed-lighthouse-baseline-20260914.md](../archive/specs/pagespeed-lighthouse-baseline-20260914.md)
- 見 §1 數值；lab 與 field LCP 落差大，代表弱網情境體驗差。

#### UI/UX 與 SEO 精修（依 Lighthouse 基準） ✅
- 原檔：[uiux-seo-lighthouse-remediation.md](../archive/specs/uiux-seo-lighthouse-remediation.md)（#262、PR #255）
- 補按鈕 `aria-label`、移除與旁邊文字重複的 `alt`、修對比不足、標題階層。

#### IndexNow 與 Microsoft Clarity ✅
- 原檔：[indexnow-and-microsoft-clarity.md](../archive/specs/indexnow-and-microsoft-clarity.md)
- 注意：最初的 IndexNow 實作使用全域 `fetch` 造成 502（見 [11](11-hosting-ops-incidents.md)）。

### 4.2 AI 友善

#### /llms.txt 格式符合 llmstxt.org ✅
- 原檔：[llms-txt-spec-compliance-fix.md](../archive/specs/llms-txt-spec-compliance-fix.md)（#254）
- 原本每項用 H3＋多行 bullet；改為 H1、blockquote、H2 下單行 `- [名稱](url): 備註`。

#### Hey AI（/llm-info）官方簡介頁 ✅
- 原檔：[hey-ai-llm-info-profile.md](../archive/specs/hey-ai-llm-info-profile.md)（#235）
- 宣告權威範圍、E-E-A-T 訊號、台灣特有臨床切點（例如 BMI 24 而非 WHO 25）、引用要求。

### 4.3 多語系與用字

#### 多語系切換與首字排序（初版） 🗄️
- 原檔：[i18n-and-footer-sorting.md](../archive/specs/i18n-and-footer-sorting.md)
- zh-TW／zh-CN／en＋OpenCC、`localeCompare('zh-Hant')` 排序；簡體已移除、排序改為筆畫規則。

#### Google 首選來源按鈕＋移除簡體中文 ✅
- 原檔：[google-preferred-source-and-remove-zh-cn.md](../archive/specs/google-preferred-source-and-remove-zh-cn.md)
- 刪除 `zh-CN.json`、產生腳本、OpenCC 動態轉換與 alternate 標記。

#### Google 地圖導航、日韓語系、三層 ISR ✅
- 原檔：[issue-418-map-navigation-i18n-ja-ko-seo-isr.md](../archive/specs/issue-418-map-navigation-i18n-ja-ko-seo-isr.md)（#418）
- 所有設施卡片與地圖加「🗺️ Google 地圖導航」深連結；新增 `ja.json`、`ko.json`；觀光相關工具（急診、AED、YouBike…；YouBike 已於 2026-10-21 隨 #727 移除；樂齡旅遊地圖已於 2026-10-21 隨 #729 移除，`senior-friendly` 的 en／ja／ko 標題同步改為「敬老卡補助」）加強外語。

#### 全系統「台」→「臺」 ✅
- 原檔：[standardize-taiwan-orthography-tai.md](../archive/specs/standardize-taiwan-orthography-tai.md)（#317）
- 平臺、服務臺、月臺、舞臺等一併統一；`normalizeCountyName` 雙向相容；種子 JSON 清洗、`migrations/20260918_convert_tai_to_tai.sql` 供正式庫選用。

### 4.4 授權與外連

#### MIT＋CC0-1.0 雙軌授權 ✅
- 原檔：[dual-license-mit-and-cc0-spdx.md](../archive/specs/dual-license-mit-and-cc0-spdx.md)
- `LICENSE`、`package.json`、README、llms 檔、Footer 同步；`tests/license-and-spdx.test.mjs`。

#### 全站外連 UTM 規範化與 OG 回填暫態防禦 ✅
- 原檔：[universal-outbound-utm-and-backfill-resilience.md](../archive/specs/universal-outbound-utm-and-backfill-resilience.md)（PR #325）
- 建立 `appendOutboundUtm`；SSH loopback 對 curl exit 52／56 做指數退避（4/8/16/24 秒），全部失敗以 exit 0 優雅結束。

### 4.5 研究報告

#### 免費／免費額度工具方案研究 📚
- 原檔：[free-tier-tooling-recommendations-20260914.md](../archive/specs/free-tier-tooling-recommendations-20260914.md)
- 地理編碼、資料正確性、SEO、監控告警、效能 CDN 五大面向；促成 zod 匯入驗證與 Cloudflare 設定 workflow。

#### Open Data 來源盤點與更權威來源提案 📚
- 原檔：[opendata-sources-audit-20260914.md](../archive/specs/opendata-sources-audit-20260914.md)（22KB）
- 逐一比對當時 65 個工具的資料源是否有更即時、更官方的版本，以及尚未涵蓋的資料集；是 #256 合併候選的分析來源。
