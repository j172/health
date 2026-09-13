# UIUX/SEO 精修（item 6/7，依 Lighthouse 基準修復）

- **Type**: 前端可用性/效能/無障礙精修。非重構、非新功能。
- **來源**：`docs/specs/pagespeed-lighthouse-baseline-20260914.md`（2026-09-14 使用者手動跑
  PageSpeed Insights 的基準量測，Mobile Performance 83／Accessibility 85／Best Practices 92／
  SEO 100；Desktop 94／94／92／100）。

## 0. 已拍板的決策（不要重新討論）

- **不為了 Best Practices 分數妥協「進頁面即定位」的設計**——這是使用者明確要求的全站規則
  （見全站地圖定位相關 ticket），維持現狀，不要改成「使用者點擊才定位」。
- llms.txt 格式問題已在獨立 ticket（#254，PR #255）修好，不在這張範圍內。

## 1. Accessibility（兩裝置共通扣分項，逐一修）

1. **Buttons do not have an accessible name**——找出全站哪些 `<button>` 只有圖示、沒有文字或
   `aria-label`，補上 `aria-label`。
2. **Image elements do not have `[alt]` attributes that are redundant text**——注意這條的方向
   跟一般「圖片缺 alt」相反：這是在說**已經有 alt，但內容跟旁邊的文字重複**（對螢幕閱讀器是
   雜訊）。找出這類圖片，若圖片本身是裝飾性/資訊已在旁邊文字呈現，改成 `alt=""`。
3. **Background and foreground colors do not have a sufficient contrast ratio**——找出全站對比
   不足的文字/背景色組合，比對 WCAG 2.2 AA 標準（一般文字 4.5:1，大字/粗體 3:1），修正色彔
   （不要為了修對比就大改整個設計系統色票，優先微調不符合的個案）。
4. **Heading elements are not in a sequentially-descending order**——找出違反標題階層（例如
   `<h1>` 後面直接接 `<h3>` 跳過 `<h2>`）的頁面，修正階層順序。
5. **（Mobile）Touch targets do not have sufficient size or spacing**——找出行動裝置上尺寸/間距
   不足的可點擊元素（WCAG 2.2 建議至少 24x24 CSS px 或有足夠間距），調整尺寸或加大間距。

## 2. Performance（優先處理 mobile 節流網路下的劣化）

Lab 數據顯示 mobile 節流網路下 LCP 達 4.6s（真實使用者 field data 是 1.8s），這個落差是本節
優先要縮小的目標：

1. **Render-blocking requests**（mobile 約 150ms、desktop 約 120ms 可節省）——找出阻擋首屏
   渲染的 CSS/JS，評估是否可以延遲載入或內聯關鍵 CSS。
2. **Legacy JavaScript**（約 24 KiB 可節省）——檢查 build 目標/babel 設定是否針對過舊瀏覽器
   輸出了不必要的 polyfill/轉譯。
3. **Reduce unused JavaScript**（mobile 95 KiB／desktop 91 KiB 可節省）——找出未使用的
   JS（可能是某個大型函式庫只用到一小部分功能），評估動態 import／程式碼分割。
4. **Use efficient cache lifetimes**（約 14 KiB 可節省）——檢查靜態資源的 cache-control
   header 設定。
5. **Optimize DOM size**——找出 DOM 節點數過多的頁面（可能是工具清單頁一次渲染過多節點，
   評估虛擬化/分頁）。
6. **Console errors**——**先重現找出實際錯誤內容**（開瀏覽器 devtools console 實際看，
   這份 spec 沒有列出細節），確認是真正的 bug 還是無害的警告，再判斷是否要修。

## 3. SEO

- 100 分，無需修復；「Structured data is valid」被列為「需人工複驗」項目——用
  Google Rich Results Test（https://search.google.com/test/rich-results）手動驗證幾個關鍵
  頁面（首頁、一個工具頁、一篇新聞）的結構化資料，PR 描述附上驗證結果即可，不需要為了這個
  改動任何 code（除非真的發現錯誤）。

## 4. 驗收

- 修復後請自行用 Lighthouse（本機 Chrome DevTools 或 CLI）重新量測 mobile/desktop，PR 描述
  附上修復前後分數對照。理想上 Accessibility 應該顯著提升（目前扣分項目明確、可逐條對應修復）；
  Performance mobile 分數的改善幅度視實際修復深度而定，不強求要到滿分。
- 不影響「進頁面即定位」的既有行為。
- `npm run build`、既有測試維持通過。

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
