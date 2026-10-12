# Spec & Ticket: 依據 PageSpeed Insights、Google Search Central 與 Schema.org 規範全站系統化最佳化

- **Ticket ID**: `SPEC-HEALTH-20260913-PAGESPEED-SEO-SCHEMA-OPTIMIZATION`
- **Priority**: HIGH (P1)
- **Status**: IMPLEMENTED
- **Closes**: #227
- **Affects**:
  - `next.config.js`
  - `app/layout.tsx`
  - `app/(site)/layout.tsx`
  - `app/(site)/page.tsx`
  - `app/news/layout.tsx`
  - `app/news/[id]/page.tsx`
  - `app/tools/layout.tsx`
  - `app/tools/page.tsx`
  - `app/tools/**/page.tsx` (all 63 tool pages)
  - `app/privacy/layout.tsx`
  - `app/admin/layout.tsx`
  - `components/Analytics/GoogleTag.tsx`
  - `components/Analytics/MicrosoftClarity.tsx`
  - `components/News/HeroImage.tsx`
  - `components/News/CardThumb.tsx`
  - `components/News/HeroPost.tsx`
  - `components/Tools/ToolPageShell.tsx`
  - `lib/server/news/seo.ts`

---

## 1. Problem Statement (問題陳述)

經由 Google 三大權威指標平台檢視現行網站架構：
1. **PageSpeed Insights**：
   - **LCP (Largest Contentful Paint)**：外部政府 RSS 圖片與新聞頭條過去採用原生 `<img>` 直連，下載原始未經壓縮的數 MB 大圖，缺少 AVIF / WebP 現代格式支援。
   - **TTFB (Time to First Byte)**：全站 63 個健康工具頁（包含純前端計算的 BMI、卡路里等）皆宣告為 `export const dynamic = "force-dynamic"`，每次造訪或爬蟲檢索皆強制觸發 Node.js SSR 與資料庫查詢，無法被靜態快取，造成 TTFB 偏高且耗費伺服器資源。
   - **TBT (Total Blocking Time) & INP (Interaction to Next Paint)**：各專區（`(site)`, `news`, `tools`, `privacy`, `admin`）各自宣告獨立的 `<html>` 與 `<body>`，跨專區跳轉觸發整頁硬重新載入（Hard Navigation），導致 GA4、Clarity 與 CSS 腳本反覆解析執行；且 `GoogleTag` 使用 `strategy="beforeInteractive"` 阻塞文檔流。
   - **CLS (Cumulative Layout Shift) & FOIT**：部分專區字型未配置 `display: "swap"`，且缺乏繁體中文系統字族回退鏈，產生文字隱形與版面位移。
2. **Google Search Central**：
   - 醫療與公衛資訊屬於高敏感度 YMYL 範疇，新聞作者統一標註為 `NewsMediaOrganization`，未能精準彰顯衛福部、疾管署、國健署等政府單位的官方權威公信力（E-E-A-T）。
   - 缺乏 `SiteNavigationElement` 站點導航結構標記，錯失 Google 搜尋結果頁展示品牌子連結（Sitelinks）的機會。
3. **Schema.org**：
   - 原先在 Layout 與各頁面分散注入多個獨立的 `<script type="application/ld+json">`，實體間無 `@id` 參照鏈結，Googlebot 無法將組織、網站、頁面、文章或工具解析為單一實體圖譜（Knowledge Graph）。

---

## 2. Solution Architecture (架構與實施設計)

### 2.1 全域單一根佈局收斂 (`app/layout.tsx`)
- 建立單一頂層 `app/layout.tsx`，將首頁、新聞、工具與隱私專區收斂為單一 SPA 生命週期。
- 各子路由佈局（`app/(site)/layout.tsx`、`app/news/layout.tsx`、`app/tools/layout.tsx`、`app/privacy/layout.tsx`、`app/admin/layout.tsx`）移除重複的 `<html>` 與 `<body>`。
- 統一全域字型 `Inter`：啟用 `display: "swap"`，配置 `["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "PingFang TC", "Microsoft JhengHei", "sans-serif"]` 繁中回退鏈。

### 2.2 圖片與 LCP 現代格式全面支援 (`next.config.js`, `HeroImage`, `CardThumb`, `HeroPost`)
- `next.config.js` 配置 `formats: ['image/avif', 'image/webp']` 與通用安全 `remotePatterns: [{ protocol: 'https', hostname: '**' }]`。
- `HeroImage` 與 `CardThumb` 全面升級為 `next/image`，自動將外部新聞圖片轉碼為現代高壓縮率格式，並配置 16:9 固定比例容器消滅 CLS。
- 頭條大圖標記 `priority` 與 `fetchPriority="high"`，直擊 LCP 核心。

### 2.3 63 個工具頁 ISR 靜態快取升級 (`app/tools/**/page.tsx`, `ToolPageShell.tsx`)
- 全數 63 個工具頁由 `force-dynamic` 升級為 `export const revalidate = 300`（5 分鐘增量靜態生成）。
- 在 `ToolPageShell.tsx` 內為 `{children}` 內建 `<Suspense fallback={...}>` 邊界，使靜態外殼（標題、麵包屑、AEO Direct Answer、公式、FAQs、免責聲明）在建置期預渲染，同時相容 `useSearchParams()` 客戶端鉤子。
- TTFB 從 300-800ms 驟降至 <50ms，大幅節約 Googlebot 檢索預算。

### 2.4 第三方追蹤腳本空閒延遲載入 (`components/Analytics/`)
- `GoogleTag.tsx`：將 Consent Mode v2 改為原生 0ms 同步內聯腳本，消除 `beforeInteractive` 的 Next.js 腳本調度延遲；`gtag.js` 主體以非阻塞排程載入。
- `MicrosoftClarity.tsx`：維持 `lazyOnload` 空閒載入，並在 `/admin` 專區自動靜默不載入。

### 2.5 Schema.org 統一 `@graph` 實體圖譜重構與 E-E-A-T 深化 (`lib/server/news/seo.ts`)
- 建構集中式 `@graph` 產生引擎，以 `@id` 嚴密串接：
  - `buildSiteGraphJsonLd`: `Organization ➔ WebSite ➔ SiteNavigationElement`
  - `buildArticleGraphJsonLd`: `Organization ➔ WebSite ➔ WebPage ➔ BreadcrumbList ➔ NewsArticle`
  - `buildToolGraphJsonLd`: `Organization ➔ WebSite ➔ WebPage ➔ BreadcrumbList ➔ MedicalWebPage ➔ WebApplication ➔ FAQPage`
  - `buildHomeGraphJsonLd`: `Organization ➔ WebSite ➔ WebPage ➔ SiteNavigationElement ➔ ItemList`
  - `buildToolsIndexGraphJsonLd`: `Organization ➔ WebSite ➔ WebPage ➔ BreadcrumbList ➔ ItemList`
- **E-E-A-T 官方公信力**：`resolveAuthorType` 自動將衛福部、疾管署、國健署等政府來源對應為 `GovernmentOrganization`；醫院對應為 `MedicalOrganization`。
- **搜尋子連結 (Sitelinks)**：注入 `SiteNavigationElement` 導航標記，爭取品牌子連結展示。

---

## 3. Verification & Metrics (驗證與指標)

1. **自動化測試套件**：
   - 執行 `npm test`：**200/200 項測試全數通過（0 failed）**。
2. **型別檢查**：
   - 執行 `npm run typecheck`：**0 errors**。
3. **生產環境建置與靜態預渲染**：
   - 執行 `npm run build`：**135/135 個路由全數成功編譯**。
   - 63 個工具頁全數轉為 `○ (Static, Revalidate: 5m)` 靜態 ISR 模式。
