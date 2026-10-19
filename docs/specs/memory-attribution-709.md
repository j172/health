# health-web 記憶體歸因量測（#709）

> 📚 量測／診斷報告，**不含任何應用程式變更**。量測日期 2026-10-19，基準 `main` @ `d860a8a`（#713）。
> 腳本與重現方式：[`scripts/ops/memory-attribution/`](../../scripts/ops/memory-attribution/README.md)。
> 背景：health-web（Next 16、PM2 fork、Node v20.20.2、`--max-old-space-size=768`）在 1 GB 實體記憶體（PMEM）上限的帳號裡被外部 SIGKILL（#709，根因已由 cPanel 證實為帳號層級記憶體管控）。#714 上線後實測尖峰：health-web ≈ 513 MB、lsphp（PHP 反向代理 worker，尖峰最多 4–5 個、各 85–134 MB）平均 ≈ 180 MB、mall ≈ 115 MB。所以 health-web 自己的 ≈ 520 MB 是「基線」，這份報告要回答：**這 520 MB 裡 Next 自身、React、我們的程式碼（含 52 個排程的依賴圖）、靜態 JSON、快取各占多少。**

## 0. 結論摘要

先講最重要的五個數字（本機、Node 20.20.2、無資料庫；條件見 §1，**實測**與**推估**都有標明）：

| # | 數字 | 意義 |
|---|---|---|
| 1 | **Next＋Node 空白基線：RSS ≈ 60 MB、堆積 ≈ 21 MB**（只回傳 "ok" 的頁面，30 分鐘不動）。完整 app **開機 3 秒就是 RSS 178／堆積 98**（正式站實測 173／80），沒有任何請求時 5 分鐘後仍是 RSS 131–153／堆積 84–95 | Next 與 React 本身只占一小部分；其餘 60–75 MB 堆積是 app **開機時**就載入的東西，原因見第 2 點 |
| 2 | **Next 預設 `experimental.preloadEntriesOnStart: true`，開機就把全部 286 個頁面／路由模組載入**，所以所有 chunk 的 JS 原始碼文字都常駐（開機後 58–64 MB、爬站後 69 MB）。其中 **33 MB 是被打包進 chunk 的 JSON 種子**，光是 `data/child-native-languages-seed.json`（整份 30 MB）就占 **24.4 MB**，任何請求都沒用到它，開機就在 | 靜態 JSON 是最大、也最容易拿掉的單一項目之一 |
| 3 | **辭典 API 被打到第一次之後再 +46～49 MB 堆積（RSS +62～74 MB）**：解析後的物件 21.4 MB，加上 `JSON.parse('…')` 字面量字串再多一份 24.4 MB（暫態，約 20 分鐘後 snapshot 已不見）。正式站使用者開辭典工具頁就會打這支 API（`ChildNativeLanguagesContent.tsx` 的 `fetch`） | 辭典整體 ≈ **46 MB 常駐**（開機 24.4 ＋首次使用 21.4），尖峰 ≈ 70 MB |
| 4 | **Next 記憶體內頁面快取（`lru-cache.js`）：30 分鐘、爬完 266 條靜態路由後 ≈ 64 MB**（堆積 46＋Buffer 18），**是 5 分鐘 → 30 分鐘成長的最大來源**（11 → 64 MB）。`cacheMaxMemorySize: 0` 後 30 分鐘 RSS 355 → 270 MB（**−85**）。上限 50 MB 是用字串**長度**計，中文頁面實際可達 2 倍（推估），正式站很可能是滿的 | 這一塊「爬得越多越大」，且一行設定就能關 |
| 5 | **52 個排程的依賴圖只多 ≈ 12 MB 堆積**（有流量 30 分鐘：264.1 vs 252.3；開機：95.9 vs 83.8），穩態中位 RSS 差 ≈ 7 MB（有流量）～ 33 MB（閒置）。排程執行當下每個 job 中位數 +0.1～+3.7 MB、最大 +12.7 MB（YouBike） | 排程**不是**主因；Next 開機就預載全部路由，路由本來就匯入了 mysql2／zod／undici／cheerio 的大半 |

**記憶體花在哪（對應正式站 ≈ 520 MB 的組成；本機 30 分鐘、完整爬站後的堆積 264 MB ＝ `heapUsed` 244.5 ＋ Buffer 19.6，RSS 355 MB；強制 GC 後；每列互不重疊，加起來＝總量）**

| 類別 | 堆積 MB | 占比 | 組成 | 性質 |
|---|---:|---:|---|---|
| Next 記憶體內頁面快取 | 63.8 | 24% | 快取的 HTML／RSC 字串 45.0、Buffer 18.4 | 實測 |
| 靜態 JSON 種子 | 62.1 | 24% | 打包進 chunk 的原始碼文字 33.4（辭典 24.4）＋辭典解析後物件 21.4 ＋藝文解析後資料 7.3 | 實測 |
| Next＋React | 20.4 | 8% | 原始碼 10.8（打包進 chunk 的 Next 4.9、`next/dist` 2.2、vendored libs 2.0、app-page／app-route runtime 含 React 1.7）＋ 其餘歸屬 9.6 | 實測；與「空白 Next」21 MB 吻合 |
| 第三方套件 | 14.4 | 5% | 原始碼 11.7（undici 2.9、mysql2 1.8、zod 1.4、aws-ssl-profiles 1.1、cheerio／parse5／iconv… ）＋ 其餘歸屬 2.7 | 實測 |
| 我們的程式碼（`app/`、`components/`、`lib/`） | 10.6 | 4% | 原始碼 6.6 ＋ bytecode／closure 等 4.0 | 實測 |
| Turbopack runtime、未解析的 chunk、Node 內部 | 23.3 | 9% | glue 6.7、未解析 chunk 8.2（多為 JSON chunk 與 runtime）、Node 內部 8.4 | 實測 |
| V8 共用結構（無法歸屬到單一模組） | 68.7 | 26% | object shape 15.0、小字串（識別字／屬性名）14.6、array 9.7、code 9.5、closure 7.7、object 6.3、hidden 4.7…；與載入的程式碼量成正比 | 實測（歸屬為推論） |
| **合計** | **263.3** | | （與 reachable heap 264.1 的差是四捨五入與 0.5 MB 的「其他」） | |

> **排程依賴圖（≈ 11.8 MB）是「第三方套件」「我們的程式碼」與「V8 共用結構」的子集**，不另外加總。表內前兩列的數字來自 dominator tree 的不重疊切分（§3.3(a)），後面各列把「其餘 102.3 MB」依擁有者拆開（§3.3(f)）。

**如果把辭典種子移出 bundle、再把頁面快取關掉**（只改資料夾複本，各自與合用都實測，30 分鐘、強制 GC 後）：

| 設定 | 堆積 | RSS |
|---|---:|---:|
| 預設（A） | 244.5 | 355.1 |
| 辭典種子移出 bundle | 195.6（−49） | 284.0（−71） |
| `cacheMaxMemorySize: 0` | 198.4（−46） | 269.8（−85） |
| **兩者合用** | **150.1（−94）** | **219.6（−136，−38%）** |

**建議的優化順序**（各項細節與風險見 §4.3、§4.4）：

1. **P0 辭典種子移出 bundle**（改成執行時按需讀檔或只走資料庫）：堆積 −24（開機）～ −49（使用後）、RSS −71（實測）。
2. **P0 `cacheMaxMemorySize` 設 10 MB 或 0**：堆積 −36～−46、RSS −72～−85（實測）；代價是頁面改讀磁碟。
3. **P1 其餘 `@/data/*.json` 靜態 import 改按需讀取**：開機 −9、使用後再 −20～25（部分推估）。
4. **P1 `experimental.preloadEntriesOnStart: false`**：穩態不變，但**每次重啟後的前 10 分鐘少 ≈ 50～75 MB 堆積／≈ 40～80 MB RSS**（實測）。health-web 現在每 15–35 分鐘就被殺一次，這個窗口正是它大部分的生命。
5. 不動排程依賴圖（≈ 12 MB，且是產品功能）。

**本機與正式站的缺口（誠實講）**：爬站後 30 分鐘～2 小時的穩態，本機 RSS 中位 391（336–454）、`heapUsed` 中位 273（245–306）；正式站 RSS 中位 517、堆積 ≈ 350。**差 ≈ 126 MB RSS／≈ 77 MB 堆積沒有被這次實驗解釋**，可能的來源（推估，未驗證）見 §4.2；最划算的下一步是讓 `proc_resources` 多記幾個 V8 欄位，見 §5。

## 1. 環境與限制

### 1.1 實際環境

| 項目 | 值 |
|---|---|
| 機器 | Windows 11 Pro 10.0.26220、Intel i5-14450HX（16 執行緒）、63.6 GB RAM；**不是**正式主機（Linux／CloudLinux LVE／共享主機） |
| Node | **v20.20.2**（官方 `node-v20.20.2-win-x64.zip`，SHA-256 `dc3700fd…bf77` 與 nodejs.org 的 `SHASUMS256.txt` 一致），V8 11.3.244.8；本機預設的 Node 26 沒有用於量測 |
| 建置 | 用同一個 Node 20 `npm ci` 後 `npm run build`（Next 16.3.6／Turbopack，約 73 秒），env 為 `deploy-ftps.yml` 在 secrets 缺值時用的公開 placeholder。正式站的建置在 GitHub Actions 用 Node 24；編譯輸出不依賴建置用的 Node 版本，但這是和正式站的一個差異 |
| 執行 | `node --max-old-space-size=768 node_modules/next/dist/bin/next start -p <port> -H 127.0.0.1`，`NODE_ENV=production`，**cwd 是只含建置輸出的乾淨資料夾** |
| 執行資料夾內容 | `.next3/`（略過只有建置用的 `cache/turbopack`）、`next.config.js`、`package.json`、`public/`（含 `public/data/` ＝ 部署時 `cp -r data/* public/data/`）、`data/`、`lib/server/news/data/`、`node_modules` junction。**沒有任何 `.env*`**（複製時過濾、結尾再掃一次、啟動前再檢查一次） |
| 被測行程環境變數 | 白名單（`SystemRoot`、`TEMP`、`PATH`、`NODE_ENV`、`PORT`、`NODE_OPTIONS`、`MEMATTR_*` 與下面的 placeholder），**不繼承呼叫端 shell**；實際傳入的鍵逐一記在每個實例的 `child-env-keys.txt` |

### 1.2 與題目要求的偏離：為什麼有 `MYSQL_*` placeholder

題目要求「環境變數沒有 `MYSQL_*`」。**實測做不到**：`lib/server/config/env.ts` 在模組載入時對 `MYSQL_HOST`／`MYSQL_USER`／`MYSQL_PASSWORD`／`MYSQL_DATABASE`／`RSS_SYNC_ADMIN_SECRET` 呼叫 `mustGet()`。變體 A 在沒有這些變數時：

```
✓ Ready in 7.7s
Failed to prepare server Error: An error occurred while loading instrumentation hook: Missing required env: MYSQL_HOST
```

（`--db-env none` 實測，`production` 的 instrumentation 一匯入排程依賴圖就丟錯，伺服器起不來。）所以實際傳入的是**公開的** placeholder——`MYSQL_HOST=127.0.0.1`、`MYSQL_PORT=1`（沒有任何東西在聽）、`MYSQL_USER／PASSWORD／DATABASE=placeholder`、`MYSQL_SSL=false`、`RSS_SYNC_SECRET／RSS_SYNC_ADMIN_SECRET=placeholder`——與 `deploy-ftps.yml` 在 secrets 缺值時的 fallback 相同；連線一律 `ECONNREFUSED`，各路由走 `[mysql] Falling back to empty data because the database is unavailable` 的降級／種子路徑。**沒有讀取或使用任何真實的連線資訊、token 或 secret。** 本機也沒有任何 MySQL 服務被連到。

### 1.3 限制（會讓數字偏離正式站的地方）

1. **沒有資料庫，這是「下界」。** 所有依賴 DB 資料的常駐量（查詢結果、`/news/<id>` 之類的動態頁、排程實際處理的資料列）都量不到；排程照常在本機被觸發、真的會連公開的政府開放資料網站，但寫 DB 時一律失敗。53 條核心路由裡，DB 相依的 API 回 500／502／400（完整爬站 266 條：233 條 200、9 條 400、12 條 500、10 條 502、其餘為轉址），照實記錄在每個實例的 `requests.csv`。
2. **Windows 的 RSS 是 working set，閒置時作業系統會修剪它**（開機後 20 秒內 RSS 從 178 掉到 149，堆積完全沒變，見 §3.1(a)）。所以 RSS 常比 Linux 低；**強制 GC 之後的 `heapUsed` 最可比較**，RSS 要看趨勢與差值，不要和正式站絕對值比。`winproc.jsonl` 另外記了 committed private bytes（載入後比 working set 高 10–25 MB）。我們量到的空白 Next（Windows）RSS 60 MB；Linux 上通常更高（未量測，推估 +20～40 MB）。
3. **位址空間（`RLIMIT_AS` 2 GiB／`VmPeak`）沒有量**：Windows 的虛擬位址配置與 Linux 不可比。這份報告只回答「實體記憶體花在哪」，不回答 #481 那種位址空間問題。
4. **取 heap snapshot 會讓該行程 RSS 永久墊高**（序列化緩衝區，實測 +50～70 MB），所以時間序列與 snapshot 分在不同實例做（見 §2）。
5. **請求序列是合成的**（約 50 條核心路由＋完整爬站），不是正式站的真實流量；正式站有大量機器人、新聞內頁與不同語系的組合，頁面快取的填滿程度可能和本機不同。
6. 排程在本機會真的執行：連公開的政府開放資料網站（沒有金鑰的 job 多半直接略過，沒有傳送任何憑證），然後寫 DB 時失敗。主矩陣同時有 4 個 A 實例，各自在同一分鐘打同樣的 youbike 等端點；這是量測的副作用，次數很小（2 小時 125 次 job 執行／實例）。

## 2. 方法

全部用 Node 內建能力，**沒有新增任何 npm 依賴到專案**（Next 基線對照組的 `next／react／react-dom` 是裝在暫存資料夾自己的 `node_modules`，版本取自 `package-lock.json`）。

- **取樣**：`mem-preload.cjs` 用 `NODE_OPTIONS=--require` 預載，每秒（前 60 秒）／每 5 秒寫一列 `process.memoryUsage()` ＋ `v8.getHeapStatistics()` ＋ 各 heap space 大小到 `samples.csv`；另開僅聽 `127.0.0.1` 的控制埠提供 `/gc`（兩次 full GC）、`/mark`、`/snapshot`（先強制 GC 再 `v8.writeHeapSnapshot`）。`--expose-gc` 不能放進 `NODE_OPTIONS`，所以在預載裡用 `v8.setFlagsFromString('--expose-gc')` ＋ `vm.runInNewContext('gc')` 取得 `gc()`。
- **變體**（皆由 `run-matrix.mjs` 為每個實例準備一個全新資料夾，並**同時**啟動，使排程在同一個 wall-clock 時間觸發）：

| 實例 | 內容 |
|---|---|
| `A-long` | 變體 A（完整 production，含 instrumentation 與 52 個排程）；每 180 秒掃一輪核心路由（53 條），第 600、3600 秒各爬一次全站（266 條）；追蹤 2 小時；不取 snapshot |
| `A-s5`／`A-s30` | 同樣時程；分別在第 300、1800 秒強制 GC 後取 heap snapshot |
| `A-idle` | 沒有任何請求（只有就緒探測 `GET /robots.txt`），30 分鐘 |
| `B-*` | 變體 B：**只改暫存資料夾裡 `.next3/server/chunks/_040nk90._.js`**，把 `register()` 換成空函式（`async function r(){}`）；其餘相同。**源碼沒有動** |
| `C` | 變體 B 為底，開機穩定 120 秒後，逐一請求大型種子路由，每次請求前後強制 GC 並記錄 RSS／堆積差 |
| `M-*` | Next 基線：同版本 Next／React、單一頁面回傳 `ok`、沒有 middleware／instrumentation |
| `*-boot-s5` | A／B 不送任何請求（只有就緒探測），第 300 秒取 snapshot ＝ 開機後 app 本身常駐的組成 |
| `W-*` | what-if（只改**暫存資料夾複本**，不動 repo）：`next.config.js` 的 `cacheMaxMemorySize`、`experimental.preloadEntriesOnStart`，或把 `.next3` chunk 裡辭典 JSON 的字面量換成空物件（`--stub-json`，模擬「種子移出 bundle」）；其餘同 `A-s30`（第 10 分鐘全站爬一次，第 30 分鐘取 snapshot） |
| `*-start*` | 冷啟動：A／B／M 各單獨啟動、`--startup-reps`，以及在檔案已被掃描過的資料夾重啟（§3.1(a)） |

- **請求序列**（`routes.mjs`）：首頁、`/news`、`/news/1`、`/tools`、`/nearby` 等 12 條頁面與純文字、前 20 個 `/tools/*`、前 15 個公開 `/api/*`、`/en` `/ja` `/ko` 與三個語系工具頁，共 53 條；admin 路由不碰（需要驗證，且會觸發同步）。完整爬站＝`app-path-routes-manifest.json` ∪ `prerender-manifest.json` 裡所有不含動態區段、非 admin 的路由，共 266 條。
- **snapshot 分析**（`analyze-heapsnapshot.mjs`，自寫、無依賴）：手寫 `.heapsnapshot` 解析（整份讀進 Buffer、逐位元組解析整數陣列；`JSON.parse` 吃不下）、Cooper–Harvey–Kennedy dominator tree、retained size；依「節點類型」「DevTools 風格的 class（retained 去重）」「最大 retainer 與 dominator 鏈」「字串種類」「已載入 script」分類；**Turbopack 的 chunk 用 `.js.map` 拆回原始模組**（所以被打包進 chunk 的 JSON 會顯示成 `data/xxx.json`），並用 closure／class 的 `locations` 把整個 heap 的節點歸給「定義它的模組」。
- **兩個實作上的坑**（寫在這裡避免之後重蹈）：Turbopack 的 JSON 模組是 `module.exports=[id,(e,t,a)=>{t.exports=JSON.parse('…')}]`，**字面量內沒有 source map 片段**，直接用片段長度會把 24 MB 算給前一個模組，要把大的 `JSON.parse(` 字面量搬到 map 裡唯一的 `.json` 來源；另外第一次讀取剛複製的 ≈ 340 MB 檔案時，`next start` 的第一個請求會從 ≈ 1.5 秒拖到 24–76 秒（防毒掃描；同時開多個更糟），所以「3 秒／30 秒」的數字只採單獨啟動、檔案已被掃描過的重啟（§3.1(a)）。

## 3. 量測結果

數字單位 MB（MiB）。「post-GC」＝取 snapshot 之前先強制兩次 full GC 的值；其餘為取樣時的瞬間值（未 GC，含尚未回收的垃圾，所以會上下跳動）。

### 3.1 四個變體的時間序列

**(a) 啟動：一次只開一個實例，執行資料夾的檔案已被掃描過（`ready` ≈ 1.3–1.5 秒）；兩次重複的值（RSS／`heapUsed`，MB）**

| 時間 | A（含排程） | B（無排程） | M（空白 Next） | 正式站（題目給的實測） |
|---|---:|---:|---:|---:|
| 1 秒 | 206／130 | 186–189／112–115 | – | – |
| **3 秒** | **178／98** | **161–189／85–113** | 44／9 | **173／80** |
| 30 秒 | 149／98 | 130–131／85 | 58／21 | – |
| 45 秒起第 1 輪 53 條核心路由後，90 秒 | 214–215／148–150 | 198–199／137 | 59–60／21 | – |
| 5 分鐘（兩輪） | 236–248／159–162 | 224–236／149–155 | 66–67／22 | 424–442／277 |

- **本機 A 的 3 秒值（RSS 178／堆積 98）與正式站（173／80）幾乎一致**，是這次最有信心的對照點：開機當下 app 就已經是 RSS ≈ 175、堆積 ≈ 80–100，空白 Next 只有 44–60／9–22。
- 開機後 2 秒內堆積 130 → 98（載入完成時的 GC），RSS 在 20 秒內再從 178 掉到 149 而堆積不變——這是 **Windows 修剪閒置行程的 working set**，不是 GC；Linux 不會這樣掉。這也是為什麼本機的 RSS 絕對值要保守看待（§1.3）。
- 5 分鐘那一列是三次重複（見 `--startup-reps 3`，同時啟動 A／B／M 各一）的範圍；5 分鐘內本機只掃 2 輪 53 條，所以 RSS 236–248，遠不到正式站的 424–442——差在**正式站 5 分鐘內有大量機器人把全站爬過一遍**（§3.1(b)：本機爬完 266 條之後堆積 253／RSS 372，才是同一量級）。

> 同時冷啟動多個實例（或第一次讀取剛複製的檔案）時，第一個請求的載入時間會從 ≈ 1.5 秒拖到 24–76 秒（磁碟＋防毒掃描 ≈ 340 MB 的新檔案），「3 秒／30 秒」會量到「還在載入」的狀態（例如 A 只有 92／32）。所以上表只採檔案已被掃描過的重啟；第一次冷啟動的值（A 30 秒 199／126、B 178／113）是載入完成當下的暫態峰值。

**(b) 追蹤 2 小時（A／B 同時間跑；每 180 秒一輪 53 條核心路由，第 10、60 分鐘各一次 266 條全站爬取）**

| 時間 | A-long RSS | A-long 堆積 | B-long RSS | B-long 堆積 | A-idle RSS／堆積 | B-idle RSS／堆積 | M（空白 Next）RSS／堆積 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2 分鐘 | 145 | 96 | 124 | 84 | 145／95 | 125／84 | 59／22 |
| 5 分鐘 | 239 | 163 | 232 | 148 | 147／96 | 125／85 | 60／22 |
| 10 分鐘 | 278 | 186 | 265 | 173 | 154／102 | 126／85 | 59／22 |
| 15 分鐘（爬站後） | 372 | 253 | 356 | 249 | 158／102 | 125／85 | 59／22 |
| 30 分鐘 | 405 | 280 | 390 | 262 | 162／104 | 125／85 | 60／23 |
| 60 分鐘 | 340 | 249 | 324 | 236 | – | – | – |
| 120 分鐘 | 418 | 281 | 344 | 237 | – | – | – |
| **30 分鐘～2 小時的分布**（最小／p10／中位／p90／最大） | RSS 336／345／**391**／420／454 | 245／250／**273**／293／306 | RSS 321／325／**384**／405／424 | 234／236／**262**／278／288 | – | – | – |
| 工作集峰值（maxRSS） | 471 | | 447 | | 230 | 222 | 64 |

- **A 與 B 的差（＝排程依賴圖的常駐成本）**：有流量時中位數 RSS +7、堆積 +11 MB（兩份 snapshot 差 +11.8 MB）；沒有流量時（idle）RSS +33、堆積 +17 MB。排程**不是**成長的來源。
- **成長的來源是爬站**：A-idle 一直停在 RSS 158／堆積 102；A-long 在第 10 分鐘的全站爬取之後從 186 跳到 253 MB 堆積。2 小時內沒有繼續單調成長，**30 分鐘之後就趨平**（在 GC 週期之間上下 ±30 MB）。
- **Next 空白基線**（M）全程 RSS 59–60、堆積 22，沒有任何成長；完整 app 在「沒有任何請求」的開機狀態（B-idle）就已經 RSS 125／堆積 85。
- 正式站對照（題目給的實測）：啟動 3–5 秒 RSS 173／堆積 80；5 分鐘 RSS 424–442／堆積 277；約 2 小時趨平 ≈ 590；穩態 RSS 中位 517／堆積 ≈ 350。本機 A 的啟動值與之接近（見 (a)），**5 分鐘的差距在於正式站 5 分鐘內就有大量機器人把全站爬過一遍**（本機 5 分鐘只掃了 2 輪 53 條；爬完 266 條之後本機 15 分鐘的堆積 253／RSS 372 與正式站 5 分鐘的 277／424–442 同量級）；穩態仍低於正式站，見 §4.2。

**(c) RSS 去哪了（強制 GC 之前的取樣；`RSS − heapTotal − external`＝V8 堆積與外部記憶體之外的原生部分）**

| 實例 | 時間 | RSS | heapTotal | old | new | code | large-object | external | RSS − heapTotal − external |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M（空白 Next） | 30 分 | 60 | 25 | 19 | 1 | 1 | 3 | 4 | **32** |
| B-idle | 30 分 | 125 | 89 | 40 | 1 | 1 | **46** | 4 | 33 |
| A-idle | 30 分 | 162 | 112 | 55 | 2 | 2 | **53** | 5 | 44 |
| B-long | 30 分 | 390 | 300 | 157 | 32 | 8 | **102** | 27 | 63 |
| A-long | 30 分 | 405 | 313 | 164 | 32 | 9 | **108** | 28 | 64 |

`large-object space`（單個物件超過約 0.5 MB：最大的幾份 JS 原始碼字串、JSON 文字、快取的 HTML）從 3 MB（空白 Next）到 46 MB（開機後）到 102–108 MB（爬站後），**是整個 heap 裡增加最多的一塊**。Node 本身的原生基線約 32 MB，與 app 無關。

### 3.2 變體 C：各大型種子「實際進入記憶體」的成本

在變體 B 上先開機穩定 120 秒（post-GC：堆積 83.4、RSS 125.3），再逐一請求；每次請求前後各強制 GC。Δ ＝請求後 − 請求前。因為 Next 開機就預載全部路由，**各 chunk 的原始碼文字在「請求前」早已在記憶體裡**，下表是「第一次真的執行該模組」才多出來的部分（`JSON.parse` 的字面量、解析後的物件圖、頁面第一次渲染的快取…）。

| 探針 | 請求（狀態、大小） | 第 1 次請求後 heapUsed Δ | RSS Δ | 第 2 次請求後 heapUsed Δ | RSS Δ |
|---|---|---:|---:|---:|---:|
| 哺乳室 | `/api/breastfeeding-rooms`（200、1173 KB） | +3.5 | +4.2 | +3.5 | +2.8 |
| 遺產地圖 | `/api/heritage-map`（200、1197 KB） | +5.8 | +12.3 | +5.6 | +10.6 |
| 公共藝術 | `/api/culture/public-art`（200、186 KB） | +6.2 | +9.0 | +6.2 | +4.1 |
| 藝文活動 API | `/api/culture/shows`（200、275 KB） | +2.1 | +4.1 | +2.4 | +3.5 |
| 藝文活動頁 | `/tools/cultural-events`（200、129 KB） | +10.4 | +28.4 | +10.5 | +18.7 |
| **辭典 twblg** | `/api/tools/child-native-languages?lang=twblg`（200、11 KB） | **+49.4** | **+62.3** | +47.0 | +54.0 |
| 辭典 hakka | `…?lang=hakka`（200、13 KB） | +0.3 | +0.9 | +0.2 | +0.6 |
| 設施（AED 等，路由靜態 import 6 份種子） | `/api/facilities?type=aed`（200、14 KB） | +7.6 | +6.3 | +7.6 | +5.1 |

（全部探針跑完：堆積 83.4 → 166.4、RSS 125.3 → 220.8。）

- **辭典（`data/child-native-languages-seed.json`）一次請求 +49.4 MB 堆積、+62 MB RSS**（另一次單獨的 B 實例前後各取 snapshot：堆積 83.4 → 134.4，RSS 131 → 205）。兩份 snapshot 的差顯示：一份 **24.4 MB 的 JSON 字面量字串**（`JSON.parse('…')` 的引數）＋ **21.4 MB 的解析後物件**（twblg 15,454 筆、hakka 14,998 筆）。字面量那份在 30 分鐘後的 snapshot 已經不見（V8 沖掉 module 函式的 bytecode，推估），解析後物件則一直在。第二種語言（hakka）+0.3 MB——整份 seed 已經在了。
- 頁面（`/tools/cultural-events` 的 +10.4 MB）含第一次渲染 React／快取的成本，不全是種子。
- 另外用 Node 20 單獨量（`measure-json-cost.mjs`，不經 Next）：辭典 30.2 MB 檔案，「原文字串」49.3 MB（含縮排空白）、解析後 25.0 MB；`public-art.json` 6.5 MB → 9.5／5.8；`cedict-terms.json` 1.8 MB → 2.8／6.5（正式站由 `news-card-images` 排程第一次呼叫時才載入；本機無資料庫，載入路徑沒被觸發，所以 A／B 的 snapshot 裡沒有它，**這 ≈ 9 MB（文字 1.9 在 chunk ＋解析後 6.5）要另外加上**）。

### 3.3 堆積快照歸因

**(a) 同一份 heap 的不重疊切分**（`partition-known-holders.mjs`；每個節點只屬於 dominator tree 上最近的一個 holder，所以各列相加＝reachable heap）

| holder | A 5 分鐘 | B 5 分鐘 | **A 30 分鐘** | B 30 分鐘 |
|---|---:|---:|---:|---:|
| JS 原始碼文字（每個載入的檔案常駐一份） | 67.6 | 61.5 | **69.2** | 63.2 |
| Next 記憶體內頁面快取（LRUCache：HTML＋RSC＋Buffer） | 11.0 | 11.0 | **63.8** | 63.8 |
| 辭典解析後物件 | 0 | 0 | **21.4** | 21.4 |
| 藝文解析後資料（public-art、cultural-events） | 7.3 | 7.3 | **7.3** | 7.3 |
| 其餘（V8 編譯產物、Node／Next 內部結構、小字串） | 65.5 | 56.3 | **102.3** | 96.6 |
| **reachable heap 合計** | **151.3** | **136.1** | **264.1** | **252.3** |
| 　其餘的組成（A 30 分鐘） | | | code 24.3、小字串 16.8、object shape 16.6、array 13.8、closure 11.9、object 9.6、hidden 5.3 | |

**(b) A 30 分鐘的 JS 原始碼文字 69.2 MB，依「原始模組」拆回（透過 chunk 的 source map）**

| 群組 | MB | 其中最大的 |
|---|---:|---|
| **打包進 chunk 的 JSON 種子** | **33.4** | `child-native-languages-seed.json` 24.4、`heritage-map-seed.json` 1.7、`breastfeeding-rooms-seed.json` 1.6、`vet_clinic.json` 1.4、`cpc_gas_station.json` 1.1（×2 份 chunk）、`contraception-map-seed` 0.6、`latest-books-seed` 0.4 … |
| 第三方套件 | 11.7 | undici 2.9、mysql2 1.8、zod 1.4、aws-ssl-profiles 1.1、encoding-sniffer 0.9、iconv-lite 0.8、parse5 0.8、whatwg-encoding 0.7、cheerio 0.2 … |
| Next 與 React | 10.8 | 打包進 chunk 的 Next 4.9、`next/dist` 2.2、`next/dist/compiled` 2.0、`app-page`／`app-route` runtime（含 React）1.7 |
| 我們的程式碼 | 6.6 | `lib/server/seo` 1.2、`components/Tools` 1.0、`lib/server/tools` 0.8、`app/(zh)/tools` 0.8、`lib/i18n` 0.5、`lib/server/news` 0.5、`lib/server/rss` 0.5 … |
| Turbopack runtime／未對應 | 5.9 | |
| 其他 | 0.8 | |

**(c) 開機後什麼都不做的 B（84 MB 堆積，`B-boot-s5`）**：`string` 62.0 MB（其中 JS 原始碼 58.2、小字串 5.6）、code 7.8、array 4.4、closure 2.8、object 2.1、object shape 1.9。JS 原始碼 58.2 MB 裡 **JSON 種子 33.2、第三方套件約 7.0、Next 約 9.0、我們的程式碼 2.6、Turbopack runtime 5.6**。這是 Next 預設 `preloadEntriesOnStart: true` 的結果（`next/dist/server/next-server.js`：`unstable_preloadEntries()` 對 `pagesManifest` 與 `appPathsManifest` 的每一項呼叫 `loadComponents`，共 286 項），**開機當下全部路由的程式碼就已經讀進記憶體**，與有沒有請求無關。

**(d) 排程依賴圖（A − B）**：開機 +12.1 MB（95.9 vs 83.8）；30 分鐘 +11.8 MB（264.1 vs 252.3）；5 分鐘 +15.2 MB。構成：JS 原始碼 +6.0（undici +1.0、zod +0.7、mysql2 +0.6、aws-ssl-profiles +0.4、whatwg-encoding／encoding-sniffer／iconv-lite／parse5 各 +0.3、`lib/server/rss` +0.2、cheerio／adm-zip／fast-xml-parser／node-cron 各 +0.1…）、JSON 文字 +3.8（5 分鐘；排程執行時讀入的資料，30 分鐘已回收）、其餘 compiled code ＋ closure ≈ +2。**不是模組本身大，而是路由已經先把大半依賴載入了。**

**(e) 排程「執行當下」**（A-long 的 `logs/memory-monitor.log`，2 小時 125 次執行、0 次因記憶體壓力略過）：每個 job 前後的 `heapUsed` 變化中位數 +0.1～+3.7 MB，最大 +12.7 MB（`youbike-sync`，抓開放資料 JSON 後寫 DB 失敗）、`power-sync` +11.9、`water-outages` +10.8；RSS 最大 +20.7（`youbike-sync`）、+19.9（`culture-shows`）。這與「排程執行當下只多 ≈ 13 MB」一致。**註**：本機沒有資料庫，job 在寫入前就失敗，真實的大批資料列處理量沒有被量到。

**(f) 把「其餘 102.3 MB」依擁有者拆開**（A 30 分鐘；`analyze-heapsnapshot.mjs` §8；擁有者＝定義該 closure／class 的模組，沿 dominator 往上找最近的有主節點）：

| 擁有者 | MB |
|---|---:|
| （無法歸屬：V8 共用結構） | 68.7 |
| Node 內部（`node:buffer`、`node:internal/modules/cjs/loader`…） | 8.4 |
| 未解析的 chunk（JSON chunk、Turbopack runtime） | 7.7 |
| 我們的程式碼（bytecode、closure、模組層物件） | 4.0 |
| Next（vendored libs 2.9、`next/dist` 2.6、app-page／app-route runtime 2.4、打包進 chunk 的 Next 1.7） | 9.6 |
| 第三方（undici 1.0、zod 1.0、mysql2 0.4、node-cron 0.2、parse5 0.1） | 2.7 |
| 其他、glue | 1.0 |

「無法歸屬」的 68.7 MB 依 V8 類型是：object shape（hidden class）15.0、小字串 14.6、array 9.7、code 9.5、closure 7.7、object 6.3、hidden 4.7、其他 1.2。這些是被**所有**模組共用或掛在 V8 內部表上的結構，沒有單一擁有者；它們的量與載入的程式碼量成正比，所以「少載入程式碼」（`preloadEntriesOnStart: false` 的窗口、移除不用的 chunk）會同時減少它們。

### 3.4 What-if：只改資料夾複本，30 分鐘、與 `A-s30` 同時程（post-GC）

這些實驗**只改暫存資料夾裡的複本**（`next.config.js` 一個選項，或 `.next3` chunk 裡辭典 JSON 的字面量換成空物件），不是對 repo 的修改；用來估計「做了之後能省多少」。

| 設定 | 堆積 | RSS | 相對預設 |
|---|---:|---:|---|
| A 預設 | 244.5 | 355.1 | – |
| 辭典種子移出 bundle（chunk 內字面量換成 119 字元的空物件） | 195.6 | 284.0 | 堆積 −48.9、RSS **−71.1** |
| `cacheMaxMemorySize: 0` | 198.4 | 269.8 | 堆積 −46.1、RSS **−85.3**（snapshot：reachable heap 264.1 → 199.5，LRUCache 與其 Buffer 全部消失） |
| **辭典移出＋`cacheMaxMemorySize: 0`** | **150.1** | **219.6** | 堆積 **−94.4**、RSS **−135.5（−38%）**；剩下的 reachable heap 151.3 MB ＝ 原始碼文字 44.8（JSON 種子只剩 9.0）＋ 藝文資料 7.3 ＋ 其餘 98.9 |
| `cacheMaxMemorySize: 10 * 1024 * 1024` | 208.3 | 282.7 | 堆積 −36.2、RSS −72.4 |
| `experimental.preloadEntriesOnStart: false` | 238.4 | 351.9 | 堆積 −6.1、RSS −3.2（30 分鐘後無差異） |
| `preloadEntriesOnStart: false` ＋ `cacheMaxMemorySize: 0` | 193.1 | 268.6 | 堆積 −51.4、RSS −86.5 |
| B（無排程）預設 | 233.3 | 338.7 | – |
| B ＋ `cacheMaxMemorySize: 0` | 187.5 | 255.1 | 堆積 −45.8、RSS −83.6 |
| B ＋ `preloadEntriesOnStart: false` | 227.0 | 339.0 | 堆積 −6.3、RSS 0 |

**辭典移出與關快取幾乎可以相加**（−49＋−46 ≈ −94），因為它們是 dominator tree 上互不重疊的兩棵子樹。

`preloadEntriesOnStart: false` 的價值在**重啟後的前 10 分鐘**（取樣值，非 post-GC）：

| 時間（堆積／RSS） | A 預設 | A＋nopreload | A＋nopreload＋nocache | B 預設 | B＋nopreload |
|---|---:|---:|---:|---:|---:|
| 5 分鐘 | 163／239 | **114／200** | **106／178** | 148／232 | 105／188 |
| 10 分鐘 | 186／278 | **112／194** | **109／188** | 173／265 | 106／178 |
| 15 分鐘（第 10 分鐘全站爬完之後） | 253／372 | 272／395 | 235／330 | 249／356 | 254／379 |

> 這一組 what-if 和主矩陣不是同一時間啟動，啟動階段的負載不同，所以 5 分鐘以內的差異（例如 2 分鐘時 `W-A-nocache` 反而較高）只能當趨勢；5–10 分鐘的差距（堆積 −49～−74、RSS −39～−84）遠大於這個雜訊。
> 本機的「爬站」把全部 266 條路由都打過，所以最後兩者收斂；正式站機器人也幾乎會把全站打過，所以 `preloadEntriesOnStart: false` 只是把 ≈ 50～75 MB 的載入**往後延**，不會讓穩態變小。
> `cacheMaxMemorySize` 的 50 MB 預設上限在 Next 是用字串**長度**（`html.length ＋ rscData.length …`，見 `node_modules/next/dist/server/lib/incremental-cache/memory-cache.external.js`）計的；中文頁面的 HTML 是雙位元組字串，實際堆積可以是計值的 2 倍。本機 30 分鐘的快取是 64 MB（含 Buffer 18 MB），還沒碰到上限；正式站有數千個新聞頁，快取很可能是滿的（推估），所以這一項在正式站可能比本機更大，也會一直有「塞滿再淘汰」的配置壓力。

## 4. 結論

### 4.1 「記憶體花在哪」的排序

排序依據本機 30 分鐘、完整爬站之後的 reachable heap 264 MB（RSS 355 MB，post-GC），表格見 §0。**全部是實測**，只有「V8 共用結構」的歸屬是推論。

| 排序 | 項目 | 堆積 MB | 占比 | 能不能拿掉 |
|---:|---|---:|---:|---|
| 1 | Next 記憶體內頁面快取 | 63.8 | 24% | 能：設定即可（`cacheMaxMemorySize`），RSS −85 |
| 2 | 靜態 JSON 種子（原始碼＋解析後物件） | 62.1 | 24% | 能：移出 bundle；辭典單獨 −49（RSS −71） |
| 3 | V8 共用結構（shape、小字串、code、closure…） | 68.7 | 26% | 只能間接減少（少載入程式碼） |
| 4 | Next＋React | 20.4 | 8% | 不能（基線；空白 Next 就是 21） |
| 5 | 第三方套件 | 14.4 | 5% | 難；有一半是 undici／mysql2／zod，路由本來就要用 |
| 6 | Turbopack runtime、未解析 chunk、Node 內部 | 23.3 | 9% | 不能 |
| 7 | 我們的程式碼 | 10.6 | 4% | 不是問題 |
| – | 排程依賴圖（子集） | 11.8 | 4% | 不建議 |

回到原本的問題——**health-web 的 ≈ 520 MB**：Node＋Next 空白基線是 RSS 60／堆積 21（≈ 12%）；其餘全是「這個 app」：開機就載入全部路由（堆積 85、RSS 125，其中 JSON 種子占 33）、頁面快取（隨爬站增加到 64）、辭典使用後的物件（21），以及與載入量成正比的 V8 結構。**排程依賴圖只占約 12 MB（< 5%）。**

RSS 的拆法（A，30 分鐘，post-GC 355 MB）：heapTotal 255、external（Buffer）23、其餘原生 77——其中 Node 原生基線 32（空白 Next 的量測）、其餘 45 為 V8 code space、malloc、isolate／zone 等。Windows 私有位元組（committed）在同一時刻比 working set 高 10–25 MB（`winproc.jsonl`：4021 秒 ws 448／priv 459；5456 秒 ws 402／priv 428）。

### 4.2 與正式站的缺口

| | 本機 A（爬站後穩態，30 分鐘～2 小時） | 正式站 | 缺口 |
|---|---:|---:|---:|
| RSS 中位數 | 391（336–454） | 517 | ≈ 126 |
| 堆積（`heapUsed`） | 273（245–306） | ≈ 350 | ≈ 77 |

缺口**沒有被這次實驗解釋**，以下是推估的來源，**沒有一項已驗證**：

1. 資料庫帶來的內容：`/news/<id>` 等動態頁與新聞列表的 HTML／RSC 進頁面快取（上限 50 MB「長度」→ 中文實際可達 ≈ 100 MB，本機只用到 64 MB）；各 `lib/server/*` 的模組層快取（本機沒有資料可放）。
2. 排程用真實資料執行：解析 JSON／XML 的暫存物件在 V8 做 major GC 之前都算在 `heapUsed`（本機 A 30 分鐘的 pre-GC／post-GC 差 36 MB；正式站的 768 MB 上限讓 GC 更晚才來）。
3. Linux RSS 與 Windows working set 的差異（Windows 會修剪閒置 working set，見 §3.1(a)；Linux 不會；未量測，推估 +20～40 MB）。
4. 外連 HTTPS 的原生記憶體（#401：httpClient 每次請求重建 TLS SecureContext），本機排程的外連量遠小於正式站。
5. 程序壽命：本機最長 2 小時；正式站目前被殺的週期是 15–35 分鐘，所以真正在正式站「看到」的多半是重啟後 0–35 分鐘的曲線，不是 2 小時趨平的值。

### 4.3 各項可節省量（標明實測／推估）

| 優化 | 堆積 | RSS | 依據 | 風險／代價 |
|---|---:|---:|---|---|
| **辭典種子移出 bundle**（按需 `fs` 讀取，或只走 DB；`service.ts` 已是「DB 優先、種子 fallback」，DB 正常時種子完全用不到） | **−49**（30 分鐘後，含開機 24.4）；暫態再 −24 | **−71** | **實測**：what-if（§3.4）、變體 C、兩份 snapshot 的差 | 低；要確認 DB 掛掉時的 fallback 仍可用 |
| **`cacheMaxMemorySize` 設 0** | **−46** | **−85** | **實測**（A、B 都測了）；正式站可能更多（推估） | 中：頁面改從 `.next3/server/app/*.html` 讀磁碟，要看正式站 CPU／TTFB；10 MB 是折衷（−36／−72，實測） |
| 上面兩者合用 | **−94** | **−136** | **實測**（§3.4） | 同上 |
| 其餘 JSON 種子改按需讀取（遺產地圖、哺乳室、獸醫、中油、避孕地圖、新書、寵物認養…） | 開機 −9（原始碼文字，實測）；使用後每份再 −3.5～−7.6（變體 C，實測）；全部合計約 −20～−35 | −10～−35 | 原始碼文字、單項使用成本：實測；合計：推估 | 低～中，逐檔改 |
| `preloadEntriesOnStart: false` | 重啟後 5–10 分鐘 **−49～−74**，穩態 0 | 5–10 分鐘 −39～−84，穩態 ≈ 0 | **實測**（§3.4） | 低；每條路由第一次請求稍慢（一次性） |
| 移除排程依賴圖 | −12 | −7（有流量）～ −33（閒置） | **實測** | **不建議**：排程是產品功能，收益太小 |
| cedict（新聞地標辭典，JSON 1.8 MB） | 載入後 +9 | +9 | 單獨量測；本機沒有觸發 | 低；已是 `import()` 惰性載入 |

> 「−94／−136」是在本機的 30 分鐘、爬站之後；如果正式站的差距（§4.2）主要來自 DB 帶來的內容與雙位元組快取，快取那一項在正式站只會更大。以本機的比例（RSS −38%）粗估正式站的 517 MB 可以降到 ≈ 360–400 MB，**這是推估，不是實測**。

### 4.4 建議的優化順序

1. **P0：把辭典 30 MB 種子移出 bundle。** 做法之一是檔案維持在 `data/`（部署已 `cp -r data/* public/data/`），`lib/server/dictionary/service.ts` 的 fallback 改成 `readSeedJson()`（`lib/server/db/seedReader.ts` 已有，用 `process.cwd()`）再快取；不要 `import … from "@/data/…json"`。每次打 API 都解析 30 MB 要避免，做法是模組層快取＋只在 DB 失敗時才讀。
2. **P0：在 `next.config.js` 試 `cacheMaxMemorySize`（先 10 MB，不行再 0）。** 一行設定、可隨時回復；部署後用 `proc_resources` 的 `rssMB` 對照，並觀察 TTFB 與 CPU。
3. **P1：其餘 `@/data/*.json` 的靜態 import 同樣改成按需讀取**（`grep -rn 'from "@/data/' lib app components` 約 15 處）。
4. **P1：`experimental.preloadEntriesOnStart: false`**，直接減少每次重啟後前 10 分鐘的記憶體——等於縮短「剛重啟又碰到門檻」的連鎖。
5. **P2：讓 `proc_resources` 多記幾個 V8 欄位**（§5），把本機與正式站的缺口量清楚，再決定要不要碰其他項目。
6. 不動排程依賴圖。

做完每一項請用本目錄的腳本在同一台機器重跑，比較**前後差**（本機的差值是可信的，絕對值不是）。

## 5. 不確定之處與後續

- **本機沒有資料庫**：所有「DB 帶來的內容」都是下界。**驗證方式**（零風險）：在 `lib/server/logging/procResourceLogger.ts` 的每 5 分鐘一行裡加 `v8.getHeapSpaceStatistics()` 的 `large_object_space`／`old_space`／`code_space` 的 `space_size`，以及 `process.memoryUsage().external`；上線後看正式站的 large-object space 是不是也占堆積的 40% 左右。若是，本報告的歸因可以直接外推。**不要**在正式站取完整 heap snapshot（本機取一份 150–250 MB 堆積的 snapshot，RSS 就多 50–70 MB、主執行緒停頓 8–10 秒；正式站在 1 GB 帳號上限下風險太高）。
- **Windows ≠ Linux**：RSS 絕對值不可直接比，見 §1.3、§4.2。
- **LRUCache 的「長度」單位與雙位元組字串**：2 倍的說法由 `memory-cache.external.js` 的原始碼與 snapshot 中中文 HTML 的大小推得，沒有用正式站資料驗證。
- **JSON 字面量那份 24.4 MB 的釋放時機**（推估是 V8 的 bytecode flushing）：只在 snapshot 上觀察到「剛執行過有、30 分鐘後沒有」，沒有直接量 V8 的 flush 事件。
- **React 本身的占比**：React／ReactDOM 被 vendored 在 `next/dist/compiled/next-server/app-page-turbo.runtime.prod.js`，無法與 Next 的 app-render 分開；只能說兩者合計的原始碼 ≈ 1.3 MB、與空白 Next 一起的堆積 ≈ 21 MB。
- **未量測**：位址空間（#481 的 `RLIMIT_AS`）、Node 24、Edge middleware 沙箱（`middleware.ts`／`edge-runtime`，原始碼約 1.0 MB）的獨立成本。
- **歸屬的方法限制**：擁有者分割沿 dominator tree 找「最近有主的節點」，解析後的 JSON 物件圖沒有 constructor 位置，所以辭典與藝文資料是用物件的屬性名簽章（`partition-known-holders.mjs`）找的，換了資料結構就要改簽章；通用工具是 `analyze-heapsnapshot.mjs` §3 的最大 retainer 清單。
- 量測副作用：本機排程會連公開的政府開放資料網站；沒有金鑰的 job 多半直接略過，沒有傳送任何憑證。

## 附錄

**原始資料位置**：每個實例的 `samples.csv`（每秒／每 5 秒一列）、`marks.csv`、`requests.csv`、`timeline.jsonl`、`winproc.jsonl`（Windows working set／private bytes）、`child-env-keys.txt`（實際傳入環境變數的鍵）、`*.heapsnapshot` 都在暫存資料夾，**不隨 PR 提交**（snapshot 每份約 20–215 MB）；`scripts/ops/memory-attribution/README.md` 說明如何在乾淨資料夾重現，所有表格都可由腳本重新產生。

**這份報告的檔名／實例對照**：`A-long`／`B-long`（2 小時）、`A-s5`／`B-s5`（5 分鐘 snapshot）、`A-s30`／`B-s30`（30 分鐘 snapshot）、`A-idle`／`B-idle`（無請求 30 分鐘）、`A-boot-s5`／`B-boot-s5`（無請求，5 分鐘 snapshot）、`C`（種子探針）、`M-long`／`M-s5`（空白 Next）、`A-start*`／`B-start*`／`M-start*`（冷啟動）、`W-*`（what-if）。

**怎麼讀 snapshot 報告**：`analyze-heapsnapshot.mjs` 的 §3（最大 retainer 與 dominator 鏈）與 §6、§8（依模組的擁有者分割）最適合追「這塊記憶體是誰的」；`partition-known-holders.mjs` 給不重疊的總帳；`compare-reports.mjs` 把兩份報告相減（A−B、30 分鐘−5 分鐘、what-if−預設）。
