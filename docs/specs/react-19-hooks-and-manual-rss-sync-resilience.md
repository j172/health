# 規格書：修復 React 19 Hook 規範與手動 RSS 同步非同步化防逾時

- **Type**: 程式碼品質與維運彈性強化（Bugfix / Refactor / CI Ops）
- **Affects**: 
  - 前端元件：`components/LatestBooks/LatestBooksContent.tsx`、`components/PetAdoption/PetAdoptionContent.tsx`、`components/Tools/CpcPriceSidebarWidget.tsx`、`components/Tools/CpcStationsClient.tsx`、`components/Tools/PestAlertSidebarWidget.tsx`、`components/Facilities/WeeklyHours.tsx`
  - 後端 API 與 CI 工作流：`app/api/admin/rss-sync/route.ts`、`.github/workflows/rss-sync-manual.yml`

---

## 1. 背景與問題

### 1.1 前端 React 19 / ESLint 規則錯誤
在既有程式碼庫中，執行 `npm run lint` 存在 8 項來自 React 19 / ESLint 規範的報錯：
1. **`react-hooks/set-state-in-effect`**：
   在 `useEffect` 本體中同步呼叫 `setState`（如 `setLoading(true)` 或 `setUserLocation(...)`），會觸發 React 同一 commit 週期內的串聯重複渲染（cascading renders），降低前端效能。
2. **`react-hooks/purity`**：
   在 `PestAlertSidebarWidget.tsx` 元件 render 期間直接呼叫不純函數 `Date.now()`，違反 React 渲染必須為純函數且冪等（idempotent）的架構規範。

### 1.2 手動 RSS 同步工作流程連線中斷（Empty reply）
`.github/workflows/rss-sync-manual.yml` 於 PR #287 導入，但於手動觸發時（Run ID `34979983097`），遠端主機執行了約 4 分鐘後噴出 `curl: (52) Empty reply from server`。
原因是 `/api/admin/rss-sync` 串接了 50+ 個新聞源的擷取、解析與去重，同步執行時間極長，超過了 Node HTTP keepAlive 或反向代理的 Socket 連線超時門檻，導致伺服器主動中斷 Socket。

---

## 2. 解決方案

### 2.1 前端 Hook 延遲與純粹化
1. **微任務排程（`queueMicrotask`）**：
   沿用 PR #126 確立的慣例，將 `useEffect` 中的非同步擷取前導 `setLoading(true)` 或資料同步操作包覆於 `queueMicrotask`，確保狀態更新延遲至當前繪製提交完成後才排入微任務隊列，滿足 ESLint 規範。
2. **惰性初始化時間戳**：
   在 `PestAlertSidebarWidget` 中使用 `const [mountTime] = useState(() => Date.now())` 記錄掛載時間，過濾器對比 `mountTime - t <= fourteenDaysMs`，維持 render 邏輯的純粹與穩定。

### 2.2 後端 `/api/admin/rss-sync` 支援 `?async=1` 非同步模式
1. 比照既有 `app/api/admin/facilities-sync/route.ts` 的成熟架構，當接收到 `?async=1` 或 `?async=true` 時：
   - 在 Node 背景程序中以非阻塞方式執行 `runRssIngestion("admin-manual")`。
   - 立即回應 `202 Accepted`：`{ "ok": true, "status": "started" }`。
   - 保留未帶參數時的同步行為，完全向下相容。
2. 更新 `.github/workflows/rss-sync-manual.yml`：
   - 呼叫端改為 `http://127.0.0.1:3000/api/admin/rss-sync?async=1`。
   - `curl` 設定 `--max-time 60` 快速取得回應，徹底免除 4 分鐘逾時斷線問題。

---

## 3. 驗收標準

1. `npm run lint`：所有 8 項 React Hook 相關 error 完全歸零（0 error）。
2. `npm run typecheck`：TypeScript 編譯無任何錯誤。
3. `npm test`：既有 259 項單元測試全數通過（259 pass, 0 fail）。
4. 本地工作區已將已合併之 162 個舊分支安全清理（`git branch -d`）。
