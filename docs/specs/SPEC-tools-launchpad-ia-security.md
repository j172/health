# 規格書：全站便民工具發射台（Tool Launchpad）、資訊架構優化、正式站健檢、資安漏洞防護與 GA4/GSC 修正

- **建立日期**：2026-10-24
- **狀態**：Approved (`ready-for-agent`)
- **關聯討論**：2026-10-24 /plan & /grill-me（共六項核心決策一致確認）
- **牽涉範疇**：
  1. 首頁「便民工具 Launchpad」（即時搜尋、8 大高頻民生膠囊、7 大分類捷徑）
  2. `/tools` 工具總覽頁重構（吸頂分類頁籤 Sticky Pills、頁內即時過濾篩選）
  3. 解構單頁多標籤：藏於 `?tab=` 的子工具（綠色旅宿/餐廳、加油站、水庫水情等）獨立卡片化直達
  4. Google Analytics 4 (GA4) 修正：徹底修復 App Router SPA 換頁漏抓 `page_view`，補齊工具自訂行為事件
  5. Google Search Console (GSC) 修正：規範 Canonical 與 Schema.org JSON-LD，維持多標籤不產生重複頁面警訊
  6. 資安漏洞修復與標頭防護：修復 `hz_admin_session` Master Secret 明文 Cookie，補齊 HSTS / X-Frame-Options / nosniff 安全標頭，遮蔽內部 DB 報錯
  7. 正式站 85 款工具全量直連巡檢：建立自動化測試腳本 `scripts/verify-production-tools.mjs`，新增 `/api/healthz` 存活監控

---

## 1. Problem Statement & Background

### 1.1 UI/UX 工具入口深埋與過度集中
1. **首頁「重新聞、輕工具」**：
   - 首頁現為公衛新聞佈局，85 款工具在首頁無即時搜尋框與分類入口；既有的「最近使用的工具」對新訪客完全空白（回傳 `null`），造成使用者無法第一時間察覺工具存在。
2. **`/tools` 長瀑布流難以查找**：
   - 目前 `/tools` 一次性平鋪 7 大類 85 款工具，卡片垂直堆疊數千像素，使用者尋找中後段工具（如環境食安、交通生活）滾動成本極高，且缺乏頁內即時過濾。
3. **子工具藏於單頁分頁中**：
   - 諸多便民工具被整併進單一頁面（如 `/tools/green-certifications?tab=green-restaurants`、`/tools/cpc-prices?tab=stations`），使用者在目錄中只看到籠統的大主題，難以直接找到「綠色餐廳」或「加油站」。

### 1.2 GA4 與 GSC 盲點
1. **GA4 SPA 換頁完全漏抓**：
   - `GoogleTag.tsx` 僅於 Initial Load 執行 `gtag('config')`。在 Next.js App Router 客戶端跳轉時，不會自動發送 `page_view`，導致全站工具頁真實造訪量與留存率嚴重失真。
   - 缺少使用者搜尋關鍵字、工具啟動與分類點擊事件。
2. **GSC 索引重複疑慮**：
   - 帶有 `?tab=` 參數的子工具若無明確規範 Canonical，易被 GSC 標記為「未選定標準網頁之重複內容」。

### 1.3 資安風險與維運監控缺口
1. **高風險 Cookie 漏洞**：
   - `app/(zh)/admin/social-queue/enter/route.ts` 將全域最高管理主金鑰（`RSS_SYNC_ADMIN_SECRET`）明文存入 `hz_admin_session` Cookie。
2. **全站缺乏標準 HTTP 安全標頭**：
   - 缺少 HSTS、`X-Frame-Options`（防 Clickjacking）、`X-Content-Type-Options: nosniff`。
3. **內部錯誤訊息洩漏**：
   - `internalErrorResponse` 發生例外時直接將 `error.message` 直吐給前端。
4. **缺少輕量存活端點**：
   - 無公開免鑑權 `/api/healthz`，外部健康監控只能請求重型 SSR/ISR 頁面。

---

## 2. Architecture & Design Specifications

### 2.1 首頁工具發射台（Tool Launchpad）
- **組件位置**：`components/Home/ToolLaunchpad.tsx`，置於 `app/(zh)/(site)/page.tsx` 中 `HomeStatusBar` 正下方、`GuideCardsSection` 正上方。
- **三大組成區塊**：
  1. **即時工具關鍵字搜尋框**：
     - 即時過濾 85+ 款工具（匹配 title, keywords, directAnswer）。
     - 支援鍵盤熱鍵 `/` 或 ⌘K 喚醒聚焦，Arrow 鍵選取，Enter 直達。
     - 觸發 `trackToolSearch(term, resultCount, "home_launchpad")`。
  2. **8 大高頻民生工具膠囊（Quick Pills）**：
     - 🚑 急診即時看板（`/tools/er-status`）
     - 🏥 健保特約診所（`/tools/clinics`）
     - ⚡ AED 急救地圖（`/tools/aed`）
     - 🌀 防災避難地圖（`/tools/disaster-map`）
     - 🛡️ 165 反詐騙（`/tools/anti-fraud`）
     - 🚰 即時水庫水情（`/tools/water-conditions`）
     - 🚻 全臺公廁導航（`/tools/public-toilets`）
     - ⛽ 即時油價與加油站（`/tools/cpc-prices`）
     - 最小觸控目標滿足 44x44px。
  3. **7 大主題分類快速捷徑**：
     - 健康自我評估、就醫用藥、長照社福、婦幼家庭、防災示警、環境食安、交通生活。點擊快速滑動至 `/tools#<group>`。

### 2.2 工具總覽頁（`/tools`）互動升級
- **組件位置**：`components/Tools/ToolsIndexClient.tsx`，由 `app/(zh)/tools/page.tsx` 注入 SSR 資料。
- **功能特性**：
  1. **吸頂分類導航（Sticky Category Bar）**：
     - 「全部 (85+)」＋ 7 大分類膠囊按鈕，吸頂停駐。
     - 點擊即時過濾顯示該類別或平滑捲動，網址同步更新 Hash。
  2. **頁內即時過濾搜尋框**：
     - 輸入關鍵字即時篩選卡片，無需重新整理，零結果時提供友善回饋。
  3. **標籤子工具解構一級化**：
     - 將「綠色旅宿」、「綠色餐廳」、「中油加油站」、「水庫即時水情」於前端呈現為獨立卡片，點擊直達該標籤（`?tab=`）。

### 2.3 GA4 與 GSC 企業級修正
1. **SPA 換頁追蹤**：
   - 建立 `components/Analytics/AnalyticsTracker.tsx`，掛載於 Root Layout。
   - 監聽 `usePathname()` 與 `useSearchParams()`，於路由切換完成時自動調用：
     ```ts
     window.gtag("event", "page_view", {
       page_location: window.location.href,
       page_path: pathname,
       page_title: document.title,
     });
     ```
2. **自訂事件追蹤（`lib/client/analytics.ts`）**：
   - `tool_search`：搜尋詞彙、結果數量、來源位置。
   - `tool_launch`：點擊啟動的工具 slug、類別、是否帶子標籤。
   - `tool_category_click`：切換的分類名稱。
3. **GSC Canonical 與結構化資料**：
   - 帶有 `?tab=` 的頁面嚴格維持 canonical 指向標準主網址（例如 `/tools/green-certifications`），符合 Google 重複頁面整合標準。
   - 確保所有卡片具備合規的 Schema.org `WebApplication` / `MedicalWebPage` 與 `BreadcrumbList`。

### 2.4 安全加固與健康檢查
1. **Cookie 安全性**：
   - `app/(zh)/admin/social-queue/enter/route.ts` 移除明文 `RSS_SYNC_ADMIN_SECRET`。
   - 改以 HMAC-SHA256 簽署字串儲存，驗證端以時序安全比對（`timingSafeEqual`）。
2. **全站安全標頭**：
   - 在 `middleware.ts` 注入 HSTS（`max-age=31536000; includeSubDomains; preload`）、`X-Frame-Options: SAMEORIGIN`、`X-Content-Type-Options: nosniff`。
3. **錯誤防禦**：
   - `internalErrorResponse` 在 `NODE_ENV === "production"` 時遮蔽底層細節。
4. **標準存活端點**：
   - 新增 `app/api/healthz/route.ts`，回傳 `{ status: "ok", timestamp: ... }`。

### 2.5 正式站直連巡檢腳本
- 撰寫 `scripts/verify-production-tools.mjs`，非侵入式並發連線檢驗 `https://health.j172.tw` 所有 85 款工具、子分頁與 API 狀態，回報響應時間與狀態碼。

