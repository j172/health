# Watchdog 的 duplicate-daemon 偵測邏輯在 PM2 v7 上永遠抓不到活著的 God Daemon

- **作者**：Claude（診斷會話）
- **日期**：2026-09-20
- **狀態**：Draft
- **對應**：2026-09-20 同一天發生兩次的 health-web 消失事故（一次是 watchdog 自身週期性檢查觸發，一次是這次 deploy 觸發），根因調查後發現的既有程式碼 bug

## 1. 背景（`.remote-health-index.php`，這是部署到主機上、透過 FTP 上傳的自我修復 watchdog 腳本，不是 Next.js app 的一部分）

這個檔案已經是經過多次真實事故（issue #97、#98）反覆修硬化過的程式碼，`reapStragglers()` 這個函式專門用來偵測並清除「重複的 PM2 God Daemon 及其底下的殭屍 process」——正是今天兩次事故的根因。它目前刻意設計成 **observe-only（唯讀，不會真的動手殺 process）**，理由寫在第 1330-1344 行的註解：這個機制還沒被拿真實事故驗證過安全性，作者明確寫下「Flip to true once the logged decisions have been checked against a real accumulation.」（等看過真實事故的紀錄、確認判斷正確後，再打開成真的會執行）。

**今天已經有兩次真實事故的紀錄可以拿來檢驗了**，但檢驗結果發現：這個機制目前**完全沒有在運作**，不是「還沒被信任」的問題，是「根本沒偵測到任何東西」的問題。

## 2. 根因（已確認，直接修，不用重新調查）

`reapStragglers()` 判斷「哪個是目前活著的 God Daemon」的邏輯（第 561-568 行）：
```php
$godRaw = @file_get_contents('/home/tw123457/.pm2/pm2.pid');
if (is_string($godRaw)) {
    $candidatePid = (int) trim($godRaw);
    if ($candidatePid > 0 && isset($byPid[$candidatePid]) && stripos($byPid[$candidatePid]['cmdline'], 'Daemon.js') !== false) {
        $godPid = $candidatePid;
    }
}
```
只比對 cmdline 是否含有 `'Daemon.js'` 這個字串。但實測本站主機上跑的是 **PM2 v7.0.3**，其 daemon process 會把自己的 process title 改寫成 `PM2 v7.0.3: God Daemon (/home/tw123457/.pm2)`（`ps -ef` 與 `/proc/<pid>/cmdline` 都是這個字串），**根本不含 `Daemon.js`**。所以 `stripos(..., 'Daemon.js')` 永遠比對失敗，`$godPid` 永遠是 0，`reapStragglers()` 永遠回報 `god_pid=unknown`、`candidates=0`——今天兩次事故的 watchdog log 全部都是這個結果，完全沒有偵測到當時實際存在的重複 daemon。

**這個檔案裡其實已經有正確處理過這個相容性問題的寫法**，就在同一支函式後面、第 665-672 行判斷「pm2 CLI 指令是否卡死」時：
```php
if (stripos($cmd, 'Daemon.js') !== false || stripos($cmd, 'God Daemon') !== false || stripos($cmd, 'ProcessContainerFork') !== false) {
```
這裡同時比對 `'Daemon.js'` 和 `'God Daemon'` 兩種字串，但這個更寬鬆、更正確的比對沒有被套用到第 565 行（找出活著的 God Daemon）與第 620 行（找出重複的 Daemon.js process）這兩處。

## 3. 待辦事項

1. 修正第 565 行的比對條件，比照第 670 行的寫法，同時接受 `'Daemon.js'` 與 `'God Daemon'`：
   ```php
   if ($candidatePid > 0 && isset($byPid[$candidatePid]) && (stripos($byPid[$candidatePid]['cmdline'], 'Daemon.js') !== false || stripos($byPid[$candidatePid]['cmdline'], 'God Daemon') !== false)) {
   ```
2. 修正第 620 行（`(1) Duplicate God Daemons` 區塊，用來找出「除了活著的那個之外，其他所有 Daemon.js process」）的比對條件，同樣加上 `'God Daemon'`：
   ```php
   if ($p['pid'] !== $godPid && (stripos($p['cmdline'], 'Daemon.js') !== false || stripos($p['cmdline'], 'God Daemon') !== false)) {
   ```
3. **不要**在這次改動裡把 `/__ops/pm2-ensure-running`（第 1346 行 `$reapStragglers(false)`）改成 `apply=true`——第 1330-1344 行的註解明確要求「先看過真實事故紀錄再決定」，而這次改動本身就是在修「連紀錄都收集不到」的問題。等這個修復上線、之後真的發生重複 daemon 事故時，拿新的、正確的 log 紀錄去驗證 `reapStragglers()` 判斷是否安全（特別是「絕對不會誤殺 bid-web 那個帳號共用的另一個網站」這件事），才是判斷要不要打開 `apply=true` 的時機，這件事留給下一張票，不要在這次一起做。
4. 這個檔案沒有 PHP 單元測試框架（既有註解已說明：CI 只有 `php -l` 語法檢查）。驗證方式：
   - 跑 `php -l .remote-health-index.php` 確認語法正確（CI 的 `php-lint.yml` 也會做這件事）。
   - 額外寫一個獨立的、可以本機執行的小型驗證腳本（純 PHP，不需要真的連主機），模擬一組假的 `/proc` 風格資料（例如兩個 cmdline 分別是 `"PM2 v7.0.3: God Daemon (/home/tw123457/.pm2)"` 和 `"node .../Daemon.js"`），驗證修正後的比對邏輯確實能正確識別兩種版本的 daemon 字串；這個驗證腳本可以放在 PR 說明裡展示執行結果，不需要正式併入 repo 的測試套件（除非你覺得值得），因為這個檔案本來就沒有既有的測試慣例可以遵循。

## 4. 驗收標準

- `php -l .remote-health-index.php` 通過。
- 修正後的兩處比對邏輯都能同時識別 `Daemon.js`／`God Daemon` 兩種 cmdline 字串（用第 4 點的驗證腳本或等效方式證明）。
- 不改動 `$reapStragglers(false)` 在 watchdog path 上的呼叫方式（維持 observe-only）。
- 不改動這個檔案裡任何其他邏輯（這是一個範圍極小的字串比對修正，不要順便重構其他部分）。
