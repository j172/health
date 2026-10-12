# Spec & Ticket: 網站效能與 Google Search Central SEO 最佳化 (Core Web Vitals & Search Central Optimization)

- **Ticket ID**: `SPEC-HEALTH-20260911-CORE-WEB-VITALS-AND-SEO-OPTIMIZATION`
- **Priority**: HIGH (P1)
- **Status**: IMPLEMENTED
- **Closes**: #192
- **Affects**:
  - `components/News/HeroPost.tsx`
  - `app/(site)/page.tsx`
  - `components/News/HomeCategoryNewsSection.tsx`
  - `components/Analytics/MicrosoftClarity.tsx`
  - `components/Pwa/RegisterServiceWorker.tsx`
  - `lib/server/news/queries.ts`
  - `app/sitemap.ts`
  - `lib/server/earthquakes/queries.ts`
  - `lib/server/npoOrganizations/ingestNpoOrganizations.ts`

---

## 1. Problem Statement (問題與瓶頸)

依據 Google PageSpeed Insights 行動端實測與 Google Search Central 診斷，首頁（`https://health.j172.tw/`）在使用者體驗與搜尋引擎檢索方面存在重大效能瓶頸：

1. **行動端 LCP (Largest Contentful Paint) 延遲高達 14.9 秒**：
   首頁焦點頭條新聞 (`HeroPost.tsx`) 直接使用原生 `<img>`，未針對本機圖庫圖檔進行 WebP/AVIF 自動轉碼，傳輸多達 2.32 MB 的未壓縮原始圖檔。
2. **伺服端 TTFB (Time to First Byte) 過高且全動態執行**：
   首頁宣告為 `export const dynamic = "force-dynamic"`，每次訪客或爬蟲請求皆必須即時向 Node.js 與 MySQL 發起數十筆查詢進行 SSR，缺乏伺服端靜態快取保護。
3. **首頁 DOM 規模龐大與 350KB HTML 傳輸過重**：
   首頁預設撈取 54 篇新聞，導致 HTML 頁面體積達 351KB，DOM 節點超過 800 個，在行動端裝置上造成嚴重的 Hydration 與主執行緒工作阻塞（6.7s ~ 13.4s）。
4. **第三方追蹤腳本搶佔關鍵渲染路徑 (TBT / INP)**：
   Microsoft Clarity 以 `afterInteractive` 立即執行；Service Worker 在組件 mount 時立即註冊並預載資源，與關鍵頁面元素競爭頻寬。
5. **Googlebot 檢索 Sitemap 時的記憶體暴增風險**：
   `app/sitemap.ts` 為動態路由，且每次抓取皆執行 `listLatestNews(20_000)` 載入完整文章本文、圖片資訊與關聯表，極易引發伺服端 OOM (Out Of Memory)。

---

## 2. Solution Architecture (架構與實作設計)

### 2.1 焦點頭條雙軌圖片交付最佳化 (`components/News/HeroPost.tsx`)
- 導入 Next.js `<Image>` 核心組件。
- **本機快取圖片 (`/images/news/...`)**：啟用 `<Image fill priority sizes="(max-width: 1024px) 100vw, 66vw" />`，由 Next.js 自動轉碼為 ~50KB 現代 WebP/AVIF 格式，並透過 `priority` 觸發 `<link rel="preload">`，直擊 LCP 核心。
- **外部 RSS 原生圖片 (`http(s)://`)**：保留具備 `fetchPriority="high"` 與 `decoding="async"` 的原生 `<img>`，遵循 `CardThumb.tsx` 與 `HeroImage.tsx` 的既有安全雙軌防護，防範未授權網域觸發 `remotePatterns` 錯誤。

### 2.2 首頁 ISR 增量靜態生成 (`app/(site)/page.tsx`)
- 移除 `export const dynamic = "force-dynamic"`。
- 改為 `export const revalidate = 60`（ISR 60 秒快取），靜態 HTML 實現 <80ms 毫秒級傳遞，同時維持即時新聞與警報之分鐘級更新頻率。

### 2.3 首頁新聞篇數精簡與 HTML / DOM 瘦身
- `app/(site)/page.tsx`：將首頁新聞量調降為 `listLatestNews(24)`（1 篇頭條 + 2 篇次要焦點 + 21 篇分類網格）。
- `components/News/HomeCategoryNewsSection.tsx`：將 `HOME_CARD_LIMIT` 設為 21，分類網格保持完美 7 行 3 欄排列，下方引導「查看全部新聞 →」前往完整歸檔 `/news`。
- 首頁 Schema.org `ItemList` 結構化資料完全與 24 篇展示內容同步。

### 2.4 第三方腳本排程與 Service Worker 延遲註冊
- `components/Analytics/MicrosoftClarity.tsx`：改用 `strategy="lazyOnload"`，待瀏覽器完全閒置後才非同步注入，消除 TBT。
- `components/Pwa/RegisterServiceWorker.tsx`：延遲 Service Worker 註冊時機至 `document.readyState === "complete"` 或 `window.onload` 後，搭配 `requestIdleCallback` 於背景閒置執行。

### 2.5 Google Search Central 檢索預算與 Sitemap 優化
- `lib/server/news/queries.ts`：新增專用輕量查詢 `listNewsForSitemap`，僅投影 `n.id, n.published_at_utc`，不載入本文、圖片與 Join 表。
- `app/sitemap.ts`：移除 `force-dynamic`，設定 `export const revalidate = 3600`（1 小時靜態快取），徹底消除記憶體炸彈風險。

### 2.6 靜態建置與離線資料庫防護
- `lib/server/earthquakes/queries.ts`：將 `getTieredEarthquakes` 補上 `withConnectionFallback([], ...)`，防止靜態建置時因離線資料庫拋出 `ECONNREFUSED` 中斷 build。
- `lib/server/npoOrganizations/ingestNpoOrganizations.ts`：全面改用專案標準 `httpGetText` 替換全域 `fetch`，防止 Node.js undici WebAssembly OOM。

---

## 3. Verification & Test Plan (測試與驗證準則)

1. **靜態型別檢查**：
   - `npm run typecheck`（`tsc --noEmit`）：0 errors。
2. **單元測試套件回歸**：
   - `npm test`：162/162 測試全數通過（含 `noServerFetch` 防護測試）。
3. **生產環境打包與靜態路由檢查**：
   - `npm run build`：成功完成，確認 `/` 標記為 `○ (ISR 1m)`，`/sitemap.xml` 標記為 `○ (ISR 1h)`。
