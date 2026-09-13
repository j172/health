# Lighthouse/PageSpeed 基準量測（item 6/7/9 前測基準）

- **Type**: 量測記錄，非 code 變更。
- **量測方式**：使用者於 2026-09-14 01:19（報告時間戳）手動於
  https://pagespeed.web.dev/analysis?url=https://health.j172.tw 執行（本機自動化工具
  kitesurf `lighthouse_audit` 在當下環境持續回傳 `session not found`；改用 Google
  PageSpeed Insights 公開 API 直接量測也被 `429 Too Many Requests` 擋下，最終改由使用者
  手動跑並提供截圖）。

## 1. 分數總表

| 分類 | Mobile | Desktop |
|---|---|---|
| Performance | 83 | 94 |
| Accessibility | 85 | 94 |
| Best Practices | 92 | 92 |
| SEO | 100 | 100 |
| Agentic Browsing | 1/3 | 2/3 |

**Core Web Vitals（Field data，真實使用者，兩裝置皆 Passed）**：LCP 1.7-1.8s、INP N/A（樣本不足）、
CLS 0。

**Lab data（本次模擬量測，Mobile 節流網路）**：FCP 1.7s、LCP 4.6s、TBT 80ms、CLS 0.01、
Speed Index 1.7s。**Lab LCP（4.6s）與 Field LCP（1.8s）落差大**，代表弱網/節流情境下體驗
明顯劣化，跟 item 6「行動裝置優先/弱網降級體驗」直接相關，值得列入 H 票的優化項目。

**Lab data（Desktop）**：FCP 0.3s、LCP 1.1s、TBT 160ms、CLS 0.007、Speed Index 0.7s——
桌面體驗良好，優化優先度低於 mobile。

## 2. 扣分項目明細

### Performance（兩裝置共通）
- Render-blocking requests（mobile 約 150ms、desktop 約 120ms 可節省）
- Legacy JavaScript（約 24 KiB 可節省）
- Use efficient cache lifetimes（約 14 KiB 可節省）
- Reduce unused JavaScript（mobile 95 KiB／desktop 91 KiB 可節省）
- Network dependency tree、Layout shift culprits、Optimize DOM size、LCP breakdown、
  3rd parties——診斷項目，需展開細看才知道具體節省空間
- Desktop 額外：Forced reflow

### Accessibility（兩裝置共通）
- Buttons do not have an accessible name
- Image elements do not have `[alt]` attributes that are redundant text
- Background and foreground colors do not have a sufficient contrast ratio
- Heading elements are not in a sequentially-descending order
- Mobile 額外：Touch targets do not have sufficient size or spacing

### Best Practices（兩裝置共通）
- **Requests the geolocation permission on page load**——這是 Lighthouse 對「一進頁面就要
  求定位權限」的一般性反模式警告。**使用者已明確決定不為了這個分數妥協**（見下方第 3 節），
  這是本站刻意的產品設計，不當作要修的缺陷。
- Browser errors were logged to the console——需要打開瀏覽器 console 實際看是什麼錯誤，
  這份報告本身沒有列出細節，H 票實作時需要先重現、看實際錯誤訊息再判斷是否要修。

### SEO
- 100 分，無扣分項；「Structured data is valid」列在「Additional items to manually check」
  （非失敗，只是自動化工具無法完全驗證，建議之後用 Google Rich Results Test 手動複驗）。

### Agentic Browsing
- `llms.txt is not well-formed`（mobile）、`llms.txt does not follow recommendations`
  （兩裝置皆有）——**已拆成獨立 ticket 立即處理**，見
  `docs/specs/llms-txt-spec-compliance-fix.md` / issue（本文件產出時同步開出）。

## 3. 已拍板的決策

- **不為了 Best Practices 分數妥協「進頁面即定位」的設計**——這是使用者在第 3/8 點明確要求
  的全站規則，維持現狀，H 票不動這個行為。
- **llms.txt 格式問題獨立拆票立即修**，不併入 H 票，因為範圍小、獨立、不依賴其他任何決策。

## 4. 待 H 票（item 6/7 主體）處理的項目

- Accessibility：按鈕/圖片 alt/色彩對比/標題階層/（mobile）觸控目標尺寸，共 5 類。
- Performance：render-blocking、legacy JS、unused JS、cache lifetime、DOM size 精簡，
  尤其優先處理 mobile 節流網路下的 LCP 劣化（4.6s lab vs 1.8s field 的落差）。
- Console 錯誤：先重現找出實際錯誤內容,再判斷是否要修。
- SEO：結構化資料手動複驗（Rich Results Test），非自動化工具能確認的部分。

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
