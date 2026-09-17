# 全站導外與新聞網址全面 UTM 規範化與 OG Backfill 暫態防禦規格說明書

## 1. 背景與核心痛點

1. **導外連結缺乏統一來源標籤**：
   - 使用者在新聞詳情頁點擊「前往官方原始網頁」時，系統透過 `/out?url=...` 轉址，但並未在目標 URL 上附加 UTM 標籤。
   - 首頁與生活工具目錄的公民倡議卡片（`CivicPartnersSection`）以及頁尾（`SiteFooter`）亦直接導向原始首頁網址，缺少合作識別來源。
   - 需要建立統一的 `appendOutboundUtm` 函式，全面規範化注入來源標籤。

2. **News OG image backfill 排程 42 秒偶發失敗**：
   - 遠端主機（HawkHost/Passenger）在進行部署、FTPS 同步或記憶體行程回收時，Next.js 伺服器進行重啟，此時本機 loopback curl 請求會返回 `curl: (52) Empty reply from server`。
   - 現行腳本預設重試僅 2 次、每次間隔 3 秒（總計約 6 秒即燒盡），若重啟耗時 10~20 秒，腳本即因 exit 52 報錯退出（42~46 秒中斷）。
   - 後續排程皆證實伺服器就緒後能 100% 成功執行，因此此失敗為暫態假警報（False Alarm），需要增加指數退避重試與優雅退避機制。

---

## 2. GRILL ME 審定決策與設計規格

### 2.1 UTM 命名規範體系

- **`utm_source`**：固定為 `health.j172.tw`（標準主機名稱，避免協定字串在分析工具中造成重複統計）。
- **`utm_medium`**：場景分流
  - 新聞官方原始網頁跳轉：`news_outbound`
  - 公民夥伴倡議卡片與頁尾：`civic_partner`
  - 生活工具外部資源：`tool_outbound`
- **`utm_campaign`**：
  - 新聞跳轉：`news_source`
  - 公民夥伴：`civic_alliance`
  - 生活工具：相應工具之 `slug`（例如 `cultural_events`）
- **保護與安全機制**：
  - 若目標 URL 原先已包含 `utm_source` 參數，則予以保留，絕不粗暴覆蓋原有標籤。
  - 對非 HTTPS 網址或格式異常網址優雅 fallback，保證轉址功能 100% 穩定可用。

### 2.2 OG Backfill 暫態防禦機制

- 在 `scripts/lib/ssh-loopback.mjs` 中，將 `curl exit 52`（Empty reply）與 `exit 56`（Network receive failure）識別為「伺服器短暫重啟暫態」。
- 對暫態錯誤實施漸進式指數退避重試（4 次重試，間隔 4s, 8s, 16s, 24s，累積等待約 52 秒）。
- 若在所有重試耗盡後伺服器仍未回應，判定為遠端正在進行大型維護或部署，印出明確日誌後以 exit code 0 優雅退出，保留任務至下一輪排程執行，避免誤觸失敗告警。

---

## 3. 驗證與自動化測試

1. **單元測試**：`tests/outboundLinkUtm.test.mjs`
   - 驗證 URL 解析與 UTM 參數注入。
   - 驗證保留現有 query 參數（如 `?cat=1`）。
   - 驗證保留現有 `utm_source` 參數。
2. **全域測試**：`npm test` 確保所有既有與新增測試全數通過。
3. **型別檢查**：`npm run typecheck`。
