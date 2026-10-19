# health-web 記憶體歸因量測（issue #709）

在**本機隔離資料夾**重現 `next start`（正式站的啟動方式），量出常駐記憶體花在哪。
這些腳本**不改任何應用程式行為、不連資料庫、不碰 `.env*`／secrets**；它們只啟動一份既有的建置輸出，
並從外面讀記憶體。結果與結論見 `docs/specs/memory-attribution-709.md`。

## 檔案

| 檔案 | 用途 |
|---|---|
| `prepare-isolated-dir.mjs` | 從已 `npm run build` 的 repo 複製出乾淨的執行資料夾（`.next3`、`public/`、`data/`、`next.config.js`、`package.json`，`node_modules` 用 junction）；`--variant B` 只改複本裡 `.next3` 的 instrumentation 輸出，把 `register()` 換成空函式；what-if 專用：`--next-config-patch "cacheMaxMemorySize: 0"`（只改複本的 `next.config.js`）、`--stub-json data/child-native-languages-seed.json`（只改複本 chunk 裡該 JSON 的 `JSON.parse('…')` 字面量）；結尾掃描確認沒有任何 `.env*` |
| `mem-preload.cjs` | 用 `NODE_OPTIONS=--require` 預載進被測行程：每秒（前 60 秒）／每 5 秒寫一列 `process.memoryUsage()` + V8 heap space 統計到 `samples.csv`；另開一個只聽 127.0.0.1 的控制埠，提供 `/gc`、`/mark`、`/snapshot`（先強制 GC 再 `v8.writeHeapSnapshot`） |
| `routes.mjs` | 所有變體共用的請求序列（約 50 條：首頁、新聞、前 20 個工具頁、前 15 個公開 API、`/en` `/ja` `/ko`）與變體 C 的大型種子探針清單 |
| `run-instance.mjs` | 啟動「一個」被測 `next start`（環境變數用白名單，不繼承呼叫端的 shell），依時程送請求、取 heap snapshot、最後停止行程 |
| `run-matrix.mjs` | 為整個量測矩陣各準備一個資料夾並**同時**啟動全部實例（A／B 各 long、s5、s30、idle，C，以及 Next 基線 M）；其他模式：`--startup-reps N [--solo --startup-sec 120]`（冷啟動，`--solo` 一次只開一個才量得到可信的 3 秒／30 秒）、`--whatif`（只改資料夾**複本**的 `next.config.js` 一個選項，例如 `cacheMaxMemorySize: 0`）、`--boot`（不送請求，第 300 秒取 snapshot）；`--port-base` 可與另一組同時跑 |
| `make-minimal-app.mjs` | 建 Next 基線對照組：同版本 Next／React、只有一頁回傳 `ok`、沒有 middleware／instrumentation |
| `summarize-series.mjs` | 把各實例的 `samples.csv` 整理成「時間點 × 實例」的 markdown 表 |
| `heapsnapshot-lib.mjs` | 無依賴的 `.heapsnapshot` 讀取器：手寫整數陣列解析、dominator tree、retained size |
| `analyze-heapsnapshot.mjs` | 歸因報告：依節點類型、DevTools 風格的 class 摘要、最大 retainer 與其 dominator 鏈、字串種類、已載入 script 的原始碼常駐量（透過 source map 拆回原始模組，所以打包進 chunk 的 JSON 會顯示成那個 JSON）、整個 heap 的擁有者分割 |
| `partition-known-holders.mjs` | 把一份 snapshot 切成互不重疊的幾塊（JS 原始碼文字、Next 頁面快取 `LRUCache`、辭典解析後物件、藝文解析後資料、其餘），各列相加＝reachable heap；辭典與藝文是用屬性名簽章找的，換資料結構要改簽章 |
| `compare-reports.mjs` | 兩份 `--json` 報告相減（A−B＝排程依賴圖的常駐成本；30 分鐘−5 分鐘＝成長） |
| `measure-json-cost.mjs` | 不經 Next，單獨量各大型 JSON 種子「原文字串」與「解析後物件」在堆積裡各占多少 |
| `seed-route-golden.mjs` | 把靜態 import 的 JSON 種子改成按需讀檔時，證明輸出沒變：在資料庫不可用（`MYSQL_PORT=1`）下對「舊樹」與「新樹」各跑同一組 57 個固定請求（哺乳室、避孕諮詢、遺產地圖、書籍、寵物領養、設施、中油站點、藝文、公共藝術），記下狀態碼／Cache-Control／body SHA-256，`diff` 子指令逐案比對（#709，見 PR 說明）。用法：`run --repo <樹> --out <資料夾>`、`diff <A> <B>` |

## 在乾淨資料夾重現

需求：Node 20（正式站是 v20.20.2；`engines` 寫 `>=24` 但正式站實際跑 20；本機沒有 nvm 時可從 nodejs.org 下載 zip，核對 `SHASUMS256.txt`）。
腳本在 Windows 上開發與驗證（`taskkill`、PowerShell 取樣的 `winproc.jsonl` 只在 Windows 有作用）；Linux 理論上可跑（停止行程會退回 `SIGKILL`、junction 退回一般 symlink），但**未實測**。
下面用 `$REPO` 代表已 `npm ci` 的 repo、`$WORK` 代表一個**全新的空資料夾**。

```bash
# 1. 用 Node 20 建置（placeholder 值與 deploy-ftps.yml 的 fallback 相同，不是真的連線資訊；
#    lib/server/config/env.ts 在 import 時就要求這幾個變數存在，所以沒有它們連建置都過不了）
cd "$REPO"
NODE_ENV=production MYSQL_HOST=127.0.0.1 MYSQL_PORT=1 MYSQL_USER=placeholder MYSQL_PASSWORD=placeholder \
  MYSQL_DATABASE=placeholder MYSQL_SSL=false RSS_SYNC_SECRET=placeholder RSS_SYNC_ADMIN_SECRET=placeholder \
  npm run build

# 2. Next 基線對照組（可省略）
node scripts/ops/memory-attribution/make-minimal-app.mjs --repo "$REPO" --dest "$WORK/dir-minimal"

# 3. 跑整個矩陣（約 2 小時；--long-sec 可縮短，--only A-s5,B-s5 只跑部分）
node scripts/ops/memory-attribution/run-matrix.mjs --repo "$REPO" --node "$(which node)" \
  --root "$WORK/matrix" --minimal "$WORK/dir-minimal" --long-sec 7200

# 3b. 其他組（可與 3 同時跑，注意 --port-base 不要重疊；冷啟動請在安靜的機器上單獨量）
node scripts/ops/memory-attribution/run-matrix.mjs --repo "$REPO" --node "$(which node)" --root "$WORK/whatif" --whatif --port-base 100
node scripts/ops/memory-attribution/run-matrix.mjs --repo "$REPO" --node "$(which node)" --root "$WORK/boot" --boot --port-base 200
node scripts/ops/memory-attribution/run-matrix.mjs --repo "$REPO" --node "$(which node)" --root "$WORK/start" \
  --minimal "$WORK/dir-minimal" --startup-reps 3 --solo --startup-sec 120 --port-base 400

# 3c. 「3 秒／30 秒」只有在執行資料夾的檔案已被（防毒）掃描過時才可信：第一次讀剛複製的檔案，
#     第一個請求會拖 24–76 秒。請對 3b 跑過的資料夾再啟動一次（run-instance 直接指向同一個 --dir）：
node scripts/ops/memory-attribution/run-instance.mjs --dir "$WORK/start/dirs/A-start1" --node "$(which node)" \
  --out "$WORK/warm/A-warm1" --label A-warm1 --sweep --sweep-first-at-sec 45 --sweep-every-sec 180 --duration-sec 120

# 4. 整理（--out-root 可用逗號接多組；--space-times 另外列出 V8 各 space 與 native 的 MB；--window 列出分布）
node scripts/ops/memory-attribution/summarize-series.mjs --out-root "$WORK/matrix/out"
node --max-old-space-size=16384 scripts/ops/memory-attribution/analyze-heapsnapshot.mjs \
  "$WORK/matrix/out/A-s30/A-s30-t1800s.heapsnapshot" --md a30.md --json a30.json
node --max-old-space-size=16384 scripts/ops/memory-attribution/analyze-heapsnapshot.mjs \
  "$WORK/matrix/out/B-s30/B-s30-t1800s.heapsnapshot" --md b30.md --json b30.json
node scripts/ops/memory-attribution/compare-reports.mjs a30.json b30.json
```

單一實例也可以直接跑：

```bash
node scripts/ops/memory-attribution/prepare-isolated-dir.mjs --repo "$REPO" --dest "$WORK/one" --variant A
node scripts/ops/memory-attribution/run-instance.mjs --dir "$WORK/one" --node "$(which node)" --out "$WORK/one-out" \
  --label demo --sweep --duration-sec 330 --snapshot-at-sec 300
```

## 如何確認沒有帶入 `.env`

三道檢查，任何一道失敗就不會啟動：

1. `prepare-isolated-dir.mjs` 複製時過濾所有名為 `.env`／`.env.*` 的檔案，結尾再掃一次執行資料夾（略過 `node_modules`），有就 exit 1。
   事後可單獨重跑：`node prepare-isolated-dir.mjs --verify "$WORK/matrix/dirs/A-s5"`。
2. `run-instance.mjs` 啟動前檢查執行資料夾的頂層沒有 `.env*`。`next start` 只會從 cwd 讀 dotenv，所以 cwd 乾淨＝不會讀到 secrets。
3. 被測行程的環境變數是**白名單**（`SystemRoot`、`TEMP`、`PATH`、`NODE_ENV`、`PORT`、`NODE_OPTIONS`、`MEMATTR_*`、`NEXT_TELEMETRY_DISABLED` 以及下面的 placeholder），不繼承呼叫端 shell；
   實際傳入的鍵（敏感值已遮蔽）寫在每個實例輸出資料夾的 `child-env-keys.txt`，可以直接檢視。

### 為什麼還是有 `MYSQL_*` placeholder

`lib/server/config/env.ts` 在模組載入時對 `MYSQL_HOST`／`MYSQL_USER`／`MYSQL_PASSWORD`／`MYSQL_DATABASE`／`RSS_SYNC_ADMIN_SECRET`
呼叫 `mustGet()`，缺任何一個就丟錯。實測（`--db-env none`）：production 的 instrumentation 一匯入排程依賴圖就丟
`Missing required env: MYSQL_HOST`，`Failed to prepare server`，伺服器起不來。所以變體 A 沒有 placeholder 就無法啟動。
`--db-env placeholder`（預設）傳入的是 `deploy-ftps.yml` 在 secrets 缺值時用的公開 fallback（`placeholder`、`127.0.0.1`），
埠號設成 `1`（沒有任何東西在聽）→ `ECONNREFUSED` → 各路由走 `[mysql] Falling back to empty data` 的降級／種子路徑。
**沒有任何真實的連線資訊或 secret 被讀取或使用。**

## 讀數注意

- 本機是 Windows：`rss` 是 working set，閒置時 Windows 會修剪，所以數字常比 Linux 的 RSS 低；`heapUsed`（強制 GC 之後）不受此影響，最可比較。
  `winproc.jsonl` 另外記錄 `PrivateMemorySize64`（committed private bytes）。
- 沒有資料庫：任何依賴 DB 資料的常駐量（查詢結果快取、排程實際處理的資料列）都量不到，所以這是「下界」。
- 取 heap snapshot 會讓該行程的 RSS 永久墊高（序列化緩衝區），所以 RSS 時間序列與 snapshot 分在不同實例做。
- 排程是真的會在本機執行：它們會連公開的政府開放資料網站（沒有任何金鑰時多半直接略過），然後在寫 DB 時失敗。
