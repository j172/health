# 全站工具健康巡檢、自動化審核與持續監控標準規格書

- **作者**：Antigravity Agent
- **日期**：2026-09-16
- **狀態**：Implemented & Verified
- **關聯 Issue**：https://github.com/j172/health/issues/306 (#306)

---

## 1. 背景與目標

本站已上線 67 款核心民生、醫療、環境、防災與文化生活工具（加上轉址頁與獨立目錄共 69 款工具路由）。
為確保全站工具長期維持最高品質，避免隨時間演進產生：
1. 工具頁面遺漏、路由損毀或路徑未登錄。
2. SEO Metadata、Canonical URL 或 Schema.org 結構化資料丟失。
3. 客戶端載入卡死、未逾時防禦或 blocking guards 回歸。
4. FacilitySearch 工具缺少配置或篩選器無法正常過濾。

本規格書建立了全站工具的自動化健康審核機制，並將其納入 CI/CD 持續集成測試體系。

---

## 2. 審查指標與檢查維度 (Audit Dimensions)

### 2.1 路由與型錄對齊 (Catalog & Routing Integrity)
- **目錄登錄校驗**：`lib/server/tools/catalog.ts` 中的每一款工具，必須在 `app/tools/<slug>/page.tsx` 存在對應之伺服端渲染頁面。
- **孤島檢查**：掃描 `app/tools/` 磁碟目錄，識別未登錄目錄是否為合規之轉址包裝（如 `ltc-contracted`、`tax-organizations`）。

### 2.2 SEO 與中繼資料完整度 (Metadata & Canonical Assurance)
- 每款工具頁面必須明確匯出 `metadata: Metadata`。
- 必須定義標準 `alternates.canonical`，指向全域規範 URL，防範重複索引。
- 標題 (`title`)、描述 (`description`)、直接解答 (`directAnswer`) 及常見問題 (`faqs`) 必須具備實質長度與內容。

### 2.3 零卡死無阻斷防護 (Zero-Stuck Loading Guard)
- 嚴格禁止元件在首屏生命週期使用 `if (location.loading) return;` 阻斷發起查詢。
- 所有非同步地圖與即時資料查詢，皆須具備 5 秒客戶端逾時截斷與種子備援機制。

### 2.4 設施搜尋整合性 (FacilitySearch Integration)
- 凡引用 `FacilitySearchContent` 之工具，必須在 `facilityConfigs.ts` 具有相應之非空 `facilityType` 規格，確保各類別過濾器與地理半徑正確生效。

---

## 3. 測試與驗證

1. **獨立審查腳本**：`scripts/audit-all-tools-health.mjs`
   - 提供即時 CLI 全站巡檢報告。
2. **自動化回歸測試**：`scripts/audit-all-tools-health.test.mjs`
   - 自動併入 `npm test`，於每次 PR 與部署前自動驗證，確保 0 回歸。
