# reapStragglers() 靠 `~/.pm2/pm2.pid` 判斷「誰是活著的 daemon」不可靠，差點又搞掉一次 health-web

- **作者**：Claude（診斷會話，本次事故的當事人）
- **日期**：2026-09-20
- **狀態**：Draft
- **對應**：issue #368（`Daemon.js`/`God Daemon` 字串比對修復）上線後，第一次實際用 `apply=1` 執行清理就造成了當天第三次 health-web 停機。

## 1. 事故經過（已確認，不用重新調查）

issue #368 修好之後，`reapStragglers()` 第一次能正確回報 `god_pid`（不再是 `unknown`）。用 `/__ops/reap-stragglers`（dry run）檢查，回報：
```
god_pid=1502318 candidates=5
  pid 1241931 ... duplicate pm2 God Daemon (the live one is 1502318) :: .../Daemon.js
  pid 1502286 ... duplicate pm2 God Daemon (the live one is 1502318) :: PM2 v7.0.3: God Daemon (...)
  pid 1502432 ... descendant of duplicate pm2 God Daemon 1502286 :: .../pm2-logrotate/app.js
  pid 1541746 ... unmanaged pm2 worker, alive 217006s
  pid 469687  ... unmanaged pm2 worker, alive 175767s
```
看起來完全合理（兩個老舊孤兒 worker、一個重複 daemon 加上它的 logrotate 子程序），實際下 `apply=1` 執行後，**health-web 立刻消失、網站 502**。

根因：`reapStragglers()` 判斷「誰是活著的 God Daemon」（`$godPid`）的邏輯，是讀取 `~/.pm2/pm2.pid` 這個檔案的內容，看它指到的 PID 是不是一個 God Daemon process。但**當天稍早因為連續多次 `apply-prebuilt` 重啟、`pm2 delete`/`pm2 start` 反覆執行，`~/.pm2/pm2.pid` 這個檔案本身在一天內被覆寫過很多次**，它反映的是「最近一次被啟動/連上的 daemon」，不保證是「目前實際在管理 health-web 這個活著的 process 的那個 daemon」。這次事故裡，`pm2.pid` 指向的 `1502318` 其實才是真正的孤兒，而被判定為「重複、可以殺」的 `1502286` 才是實際上管著 health-web 的那個——結果程式很有信心地把真正活著的那個判定成要清除的目標。

**這不是 issue #368 那個修復本身的問題**（`Daemon.js`/`God Daemon` 字串比對修正是對的、也已經證實生效），是 `$godPid` 識別邏輯這個更根本的部分，第一次真正被拿去執行（`apply=1`）就曝露出它靠不住。

## 2. 修法方向：不要只靠「正面指認活著的是誰」，改成「絕對不能動有活著的 app 掛在底下的 process」

與其繼續嘗試把「哪個 PID 是活著的 daemon」這件事識別得更準（`pm2.pid` 檔案內容本質上就是一個容易過期的快照），更穩健的做法是反過來：**不管 `pm2.pid` 怎麼說，只要一個 process（不論是不是 God Daemon）底下（子孫）目前掛著一個正在跑的 `health-web` 或 `bid-web` 實際服務 process（`next-server` cmdline），這個 process 以及它的所有祖先都絕對不能被 `reapStragglers()` 簽署 kill 訊號**——這是一個安全下限（safety invariant），獨立於、且優先於現有「靠 `pm2.pid` 指認活著的 daemon」這個判斷本身。

具體待辦：
1. 在 `reapStragglers()` 裡，掃描 `$procs`（已經有的全帳號 process 列表）找出所有 cmdline 符合「實際在跑的 app process」特徵的 process（例如 cmdline 含有 `next-server`，這是 health-web/bid-web 實際服務請求的 process，而不是 PM2 daemon 本身）。
2. 對每一個找到的 app process，往上追祖先鏈（跟現有 `$protected` 那段「保護自己與自己的祖先」的寫法邏輯一樣，往上追 `ppid`），把整條祖先鏈（包含它的 God Daemon）都加進一個「絕對保護」清單。
3. 這個「絕對保護」清單要蓋過現有所有其他判斷——即使某個 PID 被 `pm2.pid` 判斷邏輯認為是「重複的 daemon」，只要它同時也在絕對保護清單裡，就一律跳過，不列入 candidates。
4. 這一步要放在 `$keep()` 這個既有的保護判斷函式裡新增一個條件，而不是另外寫一套平行的邏輯，維持這個檔案現有的結構慣例。
5. 維持 `/__ops/pm2-ensure-running` 的 watchdog path 呼叫 `$reapStragglers(false)`（observe-only）不變——這次事故剛好證明了保守設計的必要性，不要因為這次修復而變得更激進，反而應該更保守。

## 3. 驗收標準

- 針對這次事故的實際數據重建測試情境：模擬一組 process 列表，其中「被 `pm2.pid` 判斷為活著」的 daemon 底下沒有任何 `next-server` process，而「被判斷為重複、要清除」的另一個 daemon 底下確實掛著一個活著的 `next-server`（health-web）——驗證修正後的邏輯不會把後者（也不會把它的祖先）列入 candidates。
- `php -l .remote-health-index.php` 通過。
- 不改動其他既有邏輯與 watchdog path 的 observe-only 行為。
- PR 說明裡誠實記錄這次事故的來龍去脈（本文件第1節），讓之後任何人審視這份 ops 腳本歷史時看得懂為什麼會有這條防護。
