# 規格書：頁尾推薦服務列新增 Duolingo 邀請連結

- **建立日期**：2026-10-24
- **狀態**：Ready for Implementation (`ready-for-agent`)
- **關聯 Issue**：[#808](https://github.com/j172/health/issues/808)
- **關聯 Ticket**：[`docs/specs/ticket-recommended-services-duolingo.md`](ticket-recommended-services-duolingo.md)
- **目標常數**：`lib/constants/affiliateLinks.ts`
- **目標元件**：`components/News/SiteFooter.tsx`
- **關聯測試**：`tests/footer-external-links-746.test.mjs`

---

## 1. Problem Statement

站長希望在網站頁尾推薦使用服務連結列（Things I use & recommend: Hawk Host · Hahow · Uber · Klook）中，新增個人的 Duolingo 好友/個人檔案邀請連結，提供訪客追蹤與使用。

---

## 2. Solution & Design Decisions (Grill Me 結論)

經由與使用者之 Grill Me 決策流程，本規格確認以下設計決策：

1. **網址規格與 UTM 策略**：
   - 採用完全原始網址：`https://invite.duolingo.com/profile-share/j172tw?via=share_profile_qr`。
   - 不強制在網址後端追加 `&utm_source=j172.tw`，尊重並保留邀請連結之原生參數結構。
   - 保持既有聯盟/推薦連結規則：嚴格禁止經過 `appendOutboundUtm()` 改寫，絕不附加 `health.j172.tw` 內部追蹤參數。

2. **識別碼與顯示名稱**：
   - `id`: `"duolingo"`
   - `name`: `"Duolingo"`（維持與既有 Hawk Host、Hahow、Uber、Klook 一致之純英文字串與品牌大小寫風格）。

3. **排列位置**：
   - 排在既有推薦清單最末尾（第 5 位）：Hawk Host · Hahow · Uber · Klook · Duolingo。
   - 維持既有項目之歷史穩定性與最小視覺衝擊。

4. **測試契約調整**：
   - `tests/footer-external-links-746.test.mjs`：
     - 常數清單數量由 4 改為 5。
     - 增加第 5 個項目網址斷言 `assert.equal(RECOMMENDED_AFFILIATE_LINKS[4].url, "https://invite.duolingo.com/profile-share/j172tw?via=share_profile_qr")`。
     - 放寬 `utm_source=j172.tw` 檢查（僅針對原先 4 個服務驗證），但所有 5 個連結依然嚴格確保不含 `utm_source=health.j172.tw`。
     - 測試案例描述從「4 個服務皆存在」改為「5 個服務皆存在」。

5. **隱私權政策與文件範圍**：
   - 比照 Hahow / Uber / Klook，純頁尾推薦服務無需在隱私權條款（`/privacy` 及 `llms.txt`）單獨列出主機級說明。

---

## 3. Scope of Changes

- `lib/constants/affiliateLinks.ts`: 新增 Duolingo 物件至 `RECOMMENDED_AFFILIATE_LINKS`。
- `tests/footer-external-links-746.test.mjs`: 更新數量與網址檢驗斷言。

---

## 4. Verification Plan

1. 執行 `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/footer-external-links-746.test.mjs`。
2. 執行 `pnpm typecheck`（或 `npx tsc --noEmit`）確保型別健全。
