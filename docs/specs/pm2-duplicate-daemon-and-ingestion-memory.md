# PM2 雙 God Daemon 的孤兒清理修法 + ingestion 記憶體峰值降低

- **作者**：Claude（grill 會話延伸調查）
- **日期**：2026-09-22
- **狀態**：已實作

## 1. 背景

2026-09-22 晚上驗證新聞來源 PR（#388/#390）時意外發現正式站一連串問題，追查後定位到兩個互相關聯、但成因不同的根因，詳見 issue #391 及其後續留言。

## 2. 根因一：PM2 雙 God Daemon 永遠清不掉

`.remote-health-index.php` 的 `reap-stragglers`（`/__ops/reap-stragglers`）本來就有 ancestor-protection 機制（issue #370）：先掃出所有真正活著的 `next-server` process（`health-web`／`bid-web`），把它們的祖先鏈整個標記成 `$mustProtect`，任何在 `$mustProtect` 裡的 pid 絕對不會被清掉。

但同時，函式一開始判斷「哪顆是真正的 God Daemon」時，是直接信任 `~/.pm2/pm2.pid` 檔案內容當作 `$godPid`，完全沒有跟 `$mustProtect` 交叉比對。如果重複的 `pm2 delete`＋`pm2 start` 循環（見下方根因二的觸發鏈）讓 `pm2.pid` 指向的 daemon 剛好不是真正扛著 app 的那顆，就會出現：

- `pm2.pid` 記錄的舊 daemon：因為 `$godPid` 邏輯無條件信任它，永遠不會被當成「重複的」候選
- 真正扛著 app 的新 daemon：因為 `$mustProtect` 正確保護它

**兩顆 daemon 都被永久保護，沒有人會被清掉。** 唯一會被抓到的，只有掛在舊 daemon 底下、本身不是 app 的東西（例如 `pm2-logrotate`），而且它每次被清掉後 PM2 自己的模組自動重啟機制又會讓它在原本（錯的）daemon 底下重生——這就是為什麼手動 `apply=1` 清一次之後幾分鐘又復發。

### 修法

在 `$mustProtect` 算完之後，額外掃一次：找出「本身就在 `$mustProtect` 裡、且 cmdline 符合 God Daemon 特徵」的 pid，當作 `$realGodPidFromApps`。如果它跟 `pm2.pid` 給的 `$godPid` 不一樣，代表 `pm2.pid` 過期了——用 `$realGodPidFromApps` 覆寫 `$godPid` 再繼續往下跑候選判斷，這樣舊的、過期的那顆就會被既有的「duplicate God Daemon」邏輯（section 1）正確抓成候選並清掉。`apply=1` 實際清除後，順便把 `~/.pm2/pm2.pid` 改寫成正確的 pid，避免下一次又是同樣的循環。

沒有 stale 情況時（`$realGodPidFromApps` 跟 `$godPid`一致，或找不到），行為完全不變，不影響現有的安全機制。

## 3. 根因二：ingestion 的記憶體峰值把 process 壓爆

正式站的 `~/.pm2/logs/health-web-error-*.log` 直接看到大量 `FATAL ERROR: ... JavaScript heap out of memory` 的 V8 硬崩潰（不是 PM2 優雅的 `max_memory_restart`），伴隨 `[runIngestion]` 一次處理 2589 篇文章的紀錄——比今晚新增 7 個新聞來源之前的正常量明顯高出一截。

`lib/server/rss/runIngestion.ts` 原本的流程是：先把所有 ~70 個 RSS 來源、~50 個特殊來源的「新鮮」項目全部 enrich（detail 內文、圖片、AI SEO 摘要）完，累積在一個陣列裡，最後才呼叫一次 `persistItems()` 整批寫入資料庫。整個 ~11 分鐘的 run 期間，這個陣列一直在記憶體裡長大，正是把 768MB V8 heap 上限（`ecosystem.config.cjs` 刻意設低，見該檔案註解）推爆的直接原因。

**沒有調高記憶體上限**——那個上限是刻意設低的，目的是讓記憶體壓力表現成「V8 可攔截的 heap OOM」而不是「host 資源治理器的靜默 SIGKILL」（更難查），調高有倒退回 2026-08-21 那次事故處境的風險。

### 修法

把「全部 fetch+enrich 完才一次 persist」改成「每個來源（每個 RSS feed、每個特殊來源）處理完就立刻 persist」：

- `processSpecialSource` 原本把 enrich 完的項目 push 進一個跨整個 run 共用的 `ctx.enrichedItems` 陣列；改成只累積這個來源自己的項目，處理完立刻呼叫 `persistItems()`，再把統計數字（`inserted`/`updated`/`unchanged`/`externalIdDrift`/`insertedIds`）併入 run 層級的累加器（`RunningPersistStats`）
- 主要的 RSS feeds 迴圈原本分兩段：第一段把所有 feed 的新鮮項目收集到 `normalizedItems`，第二段才對整個陣列做雜湊比對＋enrich。改成合併成單一迴圈，每個 feed 抓完、判斷新鮮度、雜湊比對、enrich、persist 一次做完才進下一個 feed
- 副作用（額外的好處，不是目的）：如果 process 在跑到一半時崩潰，已經處理完並 persist 的批次不會遺失，只有正在處理中的那個來源會遺失，不像以前整個 run 的心血都在最後一刻才寫入、崩潰就全部白做

## 4. 附帶小改動：ingestion_runs 孤兒視窗縮短

`lib/server/logging/ingestionLogger.ts` 的 `ORPHAN_RUN_AFTER_MINUTES` 從 45 分鐘調到 20 分鐘——完整一輪 ingestion 大約 11 分鐘，20 分鐘留了將近一倍緩衝，同時讓 `/api/admin/ingestion-runs` 能更快反映出真的被腰斬的 run，不用等到 45 分鐘後才被回收標記成 `Abandoned`。

## 5. 驗證

- `npx tsc --noEmit`／`npx eslint`／`npm test`（375 個測試）全過
- `php -l .remote-health-index.php` 語法檢查過
- 部署後：
  1. 用唯讀的 `/__ops/pm2-status` 觀察 24-48 小時，確認只剩一顆 God Daemon、`pm2-logrotate` 不再被列為候選
  2. 觸發一次手動 RSS sync，確認完整跑完期間 `health-web` 沒有因為 OOM 重啟（`pm2 describe health-web` 的 `created at` 不變），且 `ingestion_runs` 最新一筆順利進入 `success`
  3. 觀察 `~/.pm2/logs/health-web-error-*.log` 有沒有繼續出現 `JavaScript heap out of memory`

## 6. 沒有處理的部分（刻意）

- 不對共用的帳號層級 PM2 daemon 做任何會連累 `bid-web`（另一個獨立 repo）的操作，例如 `pm2 kill`
- 不拆成兩顆獨立的 PM2 daemon（更大的架構改動，這次不評估）
- ingestion 的記憶體峰值修法只到「分批 persist」，沒有進一步做真正的並行/串流最佳化——如果分批之後 heap OOM 還是持續發生，需要另外排查是不是有更深層的記憶體洩漏或單一來源本身資料量過大
