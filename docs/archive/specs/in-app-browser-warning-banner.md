# App 內建瀏覽器（LINE/FB/IG/微信）警告橫幅

- **作者**：Claude（診斷會話）
- **日期**：2026-09-20
- **狀態**：Draft（範圍已與使用者質問確認完畢，可直接依此實作）
- **對應使用者回報**：「1. 加入使用外部瀏覽器的警告」

## 1. 已確認的範圍（不用再跟使用者確認，直接照此實作）

情境：使用者從 LINE／Facebook／Instagram／微信等 App 點擊連結進入本站時，是用該 App 內建的簡化版瀏覽器（in-app webview）開啟，而不是系統預設瀏覽器（Safari/Chrome）。這類 webview 對地理定位權限彈窗、複製連結等功能經常有相容性問題。

確認事項：
1. **顯示位置**：全站頂部橫幅（不限特定頁面），可關閉。
2. **偵測對象**：LINE、Facebook、Instagram、微信（WeChat）這四種 in-app browser 的 User-Agent 特徵。
3. **行為**：
   - 提供一鍵「用外部瀏覽器開啟」按鈕。
   - 記住使用者本次已關閉，不要每頁都彈（用 localStorage）。

## 2. 待辦事項

1. **User-Agent 偵測**：撰寫一個判斷函式，辨識目前 User-Agent 是否來自以下 in-app browser：
   - LINE：UA 含 `Line/`
   - Facebook：UA 含 `FBAN`/`FBAV`（Messenger/Facebook App）
   - Instagram：UA 含 `Instagram`
   - 微信（WeChat）：UA 含 `MicroMessenger`
   這個判斷應該放在 client component 裡（`navigator.userAgent`），因為 in-app browser 的偵測本質上是前端行為；若專案裡已有類似的 UA 判斷慣例（例如既有的裝置偵測邏輯），優先沿用該慣例的檔案組織方式。
2. **橫幅元件**：新增一個全站頂部橫幅元件，僅在偵測到上述 in-app browser 時渲染。放置位置：檢查 `app/layout.tsx`（真正的全站根 layout）與 `app/(site)/layout.tsx` 的差異，決定橫幅該放在哪一層——建議放在會涵蓋所有消費者導向頁面、但排除 `/admin/*` 的層級（`/admin` 是後台操作介面，不需要這個提示）。
3. **「用外部瀏覽器開啟」按鈕邏輯**：
   - iOS 與 Android 的「強制用外部瀏覽器開啟目前網址」做法不同（沒有單一萬用寫法），需要分別處理：常見做法是 iOS 上引導使用者點選 in-app browser 選單中的「在 Safari 中開啟」，Android 上可嘗試 intent-based 深連結喚起 Chrome。若無法可靠地一鍵跳轉，退而求其次的做法是：按鈕改為「複製連結」+ 顯示簡短文字說明使用者接下來要自己貼到瀏覽器/點選選單中的「在瀏覽器開啟」選項。實作前先上網確認目前（2026年）LINE/FB/IG in-app browser 是否仍支援可靠的強制跳轉手法，避免做出成功率很低的假解法；若確認可靠只做得到「複製連結+引導」，就誠實做這個版本，不要為了功能列表好看硬做一個不可靠的深連結。
4. **關閉/記住狀態**：使用者按下關閉（或按下「用外部瀏覽器開啟」後）要記住，用 `localStorage`（例如 key `inapp_browser_banner_dismissed`），避免每頁都重複顯示。這是「per-viewer 的小便利」，適合用 localStorage，不需要伺服器端狀態。
5. **不要**在偵測邏輯或橫幅本身以外新增任何後端 API 或資料庫欄位——這純粹是前端 UX 功能。

## 3. 驗收標準

- 用瀏覽器開發者工具切換 User-Agent 模擬 LINE/FB/IG/微信 in-app browser，確認橫幅正確顯示；切換回一般桌機/手機瀏覽器 UA，確認橫幅不顯示。
- 關閉橫幅後重新整理頁面或切換到站內其他頁面，橫幅不再顯示（同一瀏覽器/裝置內）。
- 橫幅不影響一般瀏覽器使用者的版面（未觸發時不佔用任何空間）。
- `npm test`／`npm run build` 通過，並為 User-Agent 偵測函式補上單元測試（涵蓋 LINE/FB/IG/微信 UA 字串各一個正例，以及一般 Chrome/Safari UA 的反例）。
