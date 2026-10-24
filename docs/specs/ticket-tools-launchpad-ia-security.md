### Summary

This ticket tracks the complete implementation of:
1. **正式站全量工具直連巡檢與健康監控**：建立 `scripts/verify-production-tools.mjs` 直連正式站 `https://health.j172.tw` 驗證全量 85 款工具在線狀態與資料完整度；新增 `app/api/healthz/route.ts` 輕量監控端點。
2. **資安漏洞修復與標頭防護**：修復 `app/(zh)/admin/social-queue/enter/route.ts` 將全域主金鑰明文寫入 Cookie 漏洞，改用 HMAC 簽章；於 `middleware.ts` 配置全站標準 HTTP 安全標頭（HSTS, X-Frame-Options, nosniff）；於 `lib/server/http/errorResponse.ts` 生產環境遮蔽內部資料庫錯誤。
3. **首頁「便民工具快速發射台（Tool Launchpad）」**：建立 `components/Home/ToolLaunchpad.tsx`，含即時搜尋框、8 大民生高頻工具膠囊與 7 大分類捷徑，重構首頁視覺焦點。
4. **工具總覽頁（`/tools`）互動升級**：建立 `components/Tools/ToolsIndexClient.tsx`，實作吸頂分類頁籤（Sticky Category Pills）、頁內即時過濾搜尋框，並解構標籤子工具（綠色旅宿/餐廳、加油站、水庫水情等）為獨立直達卡片。
5. **Google Analytics 4 (GA4) 與 Google Search Console (GSC) 修正**：
   - 建立 `components/Analytics/AnalyticsTracker.tsx`，徹底解決 Next.js App Router SPA 換頁漏抓 `page_view` 的問題。
   - 封裝 `lib/client/analytics.ts` 自訂行為事件（`tool_search`, `tool_launch`, `tool_category_click`）。
   - 確保所有卡片與直達標籤 Canonical 規範化，符合 GSC 索引標準。

### Specification Reference
- Specification: [`docs/specs/SPEC-tools-launchpad-ia-security.md`](SPEC-tools-launchpad-ia-security.md)
- Planning Alignment: `/plan` & `/grill-me` (2026-10-24, 6 階段決策全數確認)

### Checklist
- [x] 1. **正式站直連巡檢與監控**
  - [x] 實作 `scripts/verify-production-tools.mjs`，測試正式站 85 款工具與關鍵 API 狀態
  - [x] 實作 `app/api/healthz/route.ts` 輕量存活健康端點
- [x] 2. **資安漏洞修復與標頭防護**
  - [x] 重構 `app/(zh)/admin/social-queue/enter/route.ts` 與 `page.tsx`，Cookie 改用 HMAC 簽署驗證
  - [x] 於 `middleware.ts` 配置全站 HSTS, X-Frame-Options, nosniff, Referrer-Policy
  - [x] 於 `lib/server/http/errorResponse.ts` 在 production 遮蔽原始例外錯誤訊息
- [x] 3. **GA4 與 GSC 企業級修正**
  - [x] 實作 `lib/client/analytics.ts` 數據追蹤工具
  - [x] 實作 `components/Analytics/AnalyticsTracker.tsx` SPA 換頁自動發送 `page_view`
  - [x] 於 `app/(zh)/layout.tsx` 與 `app/[locale]/layout.tsx` 整合 `AnalyticsTracker`
- [x] 4. **首頁便民工具發射台（Tool Launchpad）**
  - [x] 實作 `components/Home/ToolLaunchpad.tsx`（即時搜尋框、8 大高頻膠囊、7 大分類捷徑）
  - [x] 於 `app/(zh)/(site)/page.tsx` 整合 `ToolLaunchpad`
- [x] 5. **工具總覽頁（`/tools`）互動升級與子工具解構**
  - [x] 實作 `components/Tools/ToolsIndexClient.tsx`（吸頂頁籤、即時篩選、子工具獨立卡片）
  - [x] 更新 `app/(zh)/tools/page.tsx` 整合客戶端元件
  - [x] 實作多標籤工具頁內吸頂導航 `components/Tools/SubToolStickyNav.tsx`
- [x] 6. **驗證與測試**
  - [x] 執行 `node scripts/verify-production-tools.mjs` 驗證線上工具
  - [x] 執行 `npm run typecheck`
  - [x] 執行 `npm test`
