# 排程健康度稽核報告（2026-09-14）

稽核方式：唯讀調查，讀取 `.github/workflows/` 全部 10 個 workflow 檔案、對應的
`scripts/*.mjs` 執行腳本、`lib/server/**` 查詢層、既有 GitHub issue/PR 歷史
（`gh issue view` / `gh pr list` / `gh run list`），以及嘗試（未成功）呼叫既有的
公開唯讀 API 端點來驗證 DB 現況。**未修改任何 workflow、script 或程式碼**——
`facilities-geocode-batch.yml`／`npo-organizations-sync.yml` 的搶佔取消問題已
另開 issue #249、`six-monthly-sync.yml` 的 tunnel 問題已由 issue #224／PR #230
解決，皆不在本報告的修復範圍內，僅引用其現況作為稽核佐證。

---

## 1. 全部排程／手動 workflow 健康度總表

| Workflow | 觸發頻率 | Concurrency group | Cancel-in-progress | 最近執行狀態（查核於 2026-09-14） | 已知問題 |
|---|---|---|---|---|---|
| `facilities-geocode-batch.yml` | 每 30 分（`*/30 * * * *`） | `host-tw123457-server` | `true` | 連續多次 `success`（最近 8 次全綠） | 無（本身運作正常；是造成 #249 搶佔問題的「攻方」） |
| `disaster-points-sync.yml` | 每天 04:20 UTC | `host-tw123457-server` | `false` | 最近 5 次全 `success` | 無 |
| `npo-organizations-sync.yml` | 每天 03:30、15:30 UTC | `host-tw123457-server` | `false` | **最近 5 次連續 `cancelled`**（09-11 15:34 起至 09-13 15:33，比 issue #249 記錄的「最近 3 次」又多惡化 2 次） | 已知，issue #249（OPEN，另案處理中，本報告不重複） |
| `opendata-geo-backfill.yml` | 每月一次（`13 18 8 * *`） | `opendata-geo-backfill`（獨立） | `false` | 僅執行過 1 次（2026-09-08），`success` | 無，新排程屬預期 |
| `news-og-backfill.yml` | 每 30 分（`*/30 * * * *`） | `host-tw123457-server` | `true` | **`disabled_manually`**，最後一次排程執行 2026-08-31T00:10:05Z 為 `failure`（SSH broken pipe） | 見第 2.1 節結論——判定為誤停用，非刻意 |
| `six-monthly-sync.yml` | 每年 1/2、7/2（`0 19 1 1,7 *`） | `six-monthly-sync`（獨立） | `false` | 2026-09-13 三次 `failure`（修復前的 tunnel bug）後，2026-09-13T14:52:50Z 起連續 2 次 `success` | 已修復，見第 2.2 節 |
| `health-supplements-import.yml` | **無 `schedule:`**，僅 `workflow_dispatch` | `host-tw123457-server` | `false` | 最後成功 2026-09-08T21:50:13Z（之前 4 次除錯用失敗/取消） | 見第 2.3 節——建議加排程 |
| `deploy-ftps.yml` | 僅 `workflow_dispatch`（部署觸發） | `host-tw123457-server` | `false` | 最近 6 次多為 `success`，1 次 `cancelled`（正常操作，非排程異常） | 非資料同步排程，略過健康度評估；內含大量 continue-on-error 的資料源同步 step |
| `egress-probe.yml` | 僅 `workflow_dispatch`（診斷工具） | `egress-probe`（獨立） | `true` | 最近 5 次 `success` | 非資料同步排程，屬人工診斷工具 |
| `php-lint.yml` | `pull_request` / `push`（`**.php` 變更時） | 無 concurrency 設定 | — | 最近 5 次 `success` | 非資料同步排程，屬 CI 品質關卡 |
| `Copilot`（`dynamic/agents/copilot-pull-request-reviewer`） | GitHub 內建動態 workflow，非 repo 內的 `.yml` 檔 | — | — | `active` | 與資料同步無關，確認後可略過 |

**共用 `host-tw123457-server` group 的 workflow**：`facilities-geocode-batch`、
`disaster-points-sync`、`npo-organizations-sync`、`news-og-backfill`（現為停用
狀態）、`health-supplements-import`、`deploy-ftps`，共 6 個。其中
`facilities-geocode-batch` 與 `news-og-backfill` 都是 `cancel-in-progress:true`
+ 完全相同的 `*/30 * * * *` cron——這正是造成 npo-sync（issue #249）搶佔問題的
同一種結構性風險，只是目前 `news-og-backfill` 剛好處於停用狀態，風險沒有實際
發生（詳見第 4 節）。

---

## 2. 三項判斷結論

### 2.1 `news-og-backfill.yml` 停用是否合理？**結論：不成立，判斷為誤停用，建議重新啟用**

證據鏈：

1. `gh api repos/j172/health/actions/workflows/336144158` 顯示
   `state: disabled_manually`，`updated_at: 2026-08-31T08:24:24+08:00`
   （= 2026-08-31T00:24:24 UTC）。
2. 該 workflow 最後一次排程執行（run #536,
   `id=33343756493`，2026-08-31T00:10:05Z）以 `failure` 收場，錯誤訊息是
   `mux_client_request_session: read from master failed: Broken pipe` 與
   `Connection to *** closed by remote host`（`gh run view 33343756493 --log-failed`
   查得）——這是 SSH 連線被中斷的症狀，不是程式邏輯錯誤。
3. Issue #98（「pm2 daemon proliferation is the recurring root cause of NPROC
   exhaustion — third occurrence」）記錄同一天發生一場 **23:51–04:30 UTC**
   （2026-08-30 23:51 至 2026-08-31 04:30）、長達 4 小時 39 分的正式站 NPROC
   耗盡當機事件。News-og-backfill 最後一次失敗的時間點（00:10 UTC）**完全落在
   這個當機視窗中央**，且停用動作（00:24 UTC）緊接在其後 14 分鐘。
4. 停用前 30 次排程執行中有 29 次 `success`，最後一次才失敗——不是「逐漸沒有
   資料要處理」的自然退場，而是單次因主機當機而失敗後立刻被手動停用。
5. 搜尋所有相關 issue（`#29`「News card image freshness — decouple Pixabay
   & OG backfill scheduling」、`#33`、`#98` 等）與該時間點前後的 commit/PR，
   **找不到任何一筆明確記載「因為 backlog 已清完所以停用 news-og-backfill」
   的決策文字**。使用者原有的記憶推論（backlog 已清、屬刻意停用）查無實據。
6. 反而，設計文件 `docs/specs/news-card-image-freshness-scheduling.md` 明確
   將這個 workflow 定位為**常態基礎設施**（"A new news item should have a
   card image assigned within roughly one hour of ingestion, independent of
   deploy cadence"），不是一次性回填任務。
7. 檢查現行架構後確認：Pixabay/Pexels/Unsplash 的**素材庫存圖**指派已經在
   2026-08 移入 `lib/server/cron/registerJobs.ts` 的 in-app cron（每 10
   分鐘跑 `assignMissingNewsCardImages(15)`），**但**「抓取文章本身真實
   og:image」這個功能（`scripts/gha-og-external-backfill.mjs`，處理
   ltn.com.tw 等會擋正式站 IP 的發布者）**沒有對應的 in-app cron
   替代方案**，必須靠 GitHub Actions runner 的乾淨對外 IP 才能抓到——目前
   `deploy-ftps.yml` 的註解也明確寫著「這個外部 OG 回填已經獨立排程，不再
   於部署時跑」。也就是說，`news-og-backfill.yml` 停用期間，**這些發布者的
   新文章會永久拿不到真實首圖，只能靠 Pixabay 隨機庫存圖頂替**，且沒有任何
   其他機制會自動補上。

**建議**：這是可以安全重新啟用的排程（`gh workflow enable news-og-backfill.yml`
或 GitHub UI 操作，本報告不代為執行），但重新啟用前應先處理第 4 節提到的
「與 `facilities-geocode-batch` 同格點 30 分排程」風險評估。

### 2.2 `six-monthly-sync.yml` 是否已套用 SSH 修復寫法？**結論：已確認修復並驗證上線**

- Issue #224 完整記錄問題根因：舊寫法用 `ssh -N -L 18080:127.0.0.1:3000`
  本地端口轉發，但 HawkHost 停用 `AllowTcpForwarding`，2026-09-13 連續
  3 次因 `administratively prohibited` 失敗。
- `gh pr list --search "224"` / `git log --oneline -- .github/workflows/six-monthly-sync.yml`
  確認修復由 **PR #230**（`0d465e0 fix(ci): harden deploy cache purge and
  replace six-monthly tunnel with ssh bridge (Closes #229, Closes #224)`）
  於 2026-09-13T11:16:45Z 合併。
- 讀取目前檔案內容（`.github/workflows/six-monthly-sync.yml` 第 59-94 行）
  確認已改為呼叫 `scripts/lib/ssh-bridge.mjs` 啟動一個**應用層**橋接服務：
  它在 runner 本機監聽 `127.0.0.1:18080`，內部把每個 HTTP 請求轉譯為
  **透過 SSH 執行遠端 `curl http://127.0.0.1:3000/...`**（`ssh.call(...)`，
  見 `scripts/lib/ssh-bridge.mjs` 第 61-74 行），而不是建立 `-L` 端口轉發——
  與 `facilities-geocode-batch.yml`／`news-og-backfill.yml` 採用的「SSH 執行
  遠端 curl」修復模式在網路層本質相同，只是多包了一層本地 HTTP 介面，方便
  `run-six-monthly-sync.sh` 等既有腳本改動最小化。
- 執行紀錄佐證：2026-09-13T10:33–10:36 三次 `failure`（修復前）之後，
  2026-09-13T11:21:22Z 與 2026-09-13T14:52:50Z 連續 2 次 `success`（修復後，
  含一次完整跑過 `run-six-monthly-sync.sh` 全流程）。

**結論成立，不需再動這個檔案。**

### 2.3 `health-supplements-import.yml` 完全沒有排程，該不該加？**結論：建議加上獨立排程（季度）**

- 資料來源：`scripts/import-tfda-health-supplements.mjs` 抓取
  `https://data.fda.gov.tw/data/opendata/export/19/json`（TFDA
  健康食品(健字號) 開放資料，約 400-600 筆）。
- 查證官方資料集頁面（`data.gov.tw/dataset/6951`「健康食品資料集」，提供機關
  衛生福利部食品藥物管理署）：**更新頻率欄位明確標示「每3月」**，即官方
  一年更新約 4 次。
- 現況：這份資料**沒有獨立排程**，只有兩條路徑會被執行：
  1. 人工 `workflow_dispatch` 觸發 `health-supplements-import.yml`（最後一次
     成功在 2026-09-08）。
  2. 每年僅 2 次（1/2、7/2）的 `six-monthly-sync.yml` 全量排程內含這個 import
     step（`type=all` 或 `type=drugs` 才會跑）。
- **自動化更新頻率（一年 2 次）明顯低於官方實際更新頻率（一年 4 次）**，
  中間會有至少 2 個官方更新週期完全靠人工記得手動觸發才會被補上——這正是
  題目一開始點出的「完全依賴有沒有人記得手動觸發」的風險，經查證確實成立，
  且有官方頻率數字可以量化落差。
- 該 workflow 本身已經是一個獨立、輕量（`concurrency: host-tw123457-server`，
  單一 import step）的檔案，具備良好的 SSH-loopback 寫法（也已修復過一次
  tunnel-vs-SSH-curl 的問題，`151da46`/`a93a71e`），技術上補一個 cron 觸發
  即可，不需要更動邏輯。

**建議**：加上獨立的季度排程（例如錯開 `facilities-geocode-batch` 的 `:00/:30`
格點與 `six-monthly-sync` 的 1/2、7/2，如 `0 18 1 1,4,7,10 *`），同時保留
`workflow_dispatch` 供臨時觸發；不建議維持現狀（純手動）。

---

## 3. DB 層抽查結果：**無法在不接觸憑證的前提下完成驗證**

依指示，過程中：

- **沒有**讀取 `.env` 或任何 credential 檔案。
- **沒有**嘗試自行組出 MySQL 連線字串或直接連 DB。

嘗試過的既有安全查詢管道：

1. **`GET /api/admin/ingestion-runs`**（`app/api/admin/ingestion-runs/route.ts`）
   ——會回傳 `ingest_runs` 表最近 20 筆同步紀錄（`started_at`/`ended_at`/
   `fetched_count`/`inserted_count`/`updated_count` 等）。但這支端點需要
   `RSS_SYNC_ADMIN_SECRET`（`requireAdminSecret`），屬於憑證，依指示不使用。
2. **`GET /api/npo-organizations`** 與 **`GET /api/health-supplements`**
   ——確認原始碼後，這兩支是**公開、無需任何密鑰**的唯讀端點
   （`app/api/npo-organizations/route.ts`、`app/api/health-supplements/route.ts`），
   一般使用者用瀏覽器打開即可看到 `total` 筆數與資料內容，理論上是最乾淨的
   查證管道。實際嘗試直接呼叫：
   - `https://health.j172.tw/api/npo-organizations?pageSize=30&page=1`
   - `https://health.j172.tw/api/health-supplements?limit=5`

   兩者皆回傳 **HTTP 403**——與既有記憶（`ops_cloudflare_bot_protection.md`／
   `ops_host_ip_blocked_upstreams.md`）記錄的「非瀏覽器 client / 非白名單來源
   打正式站公開網域會被 Cloudflare bot-protection 攔截」現象一致，這次連本次
   稽核所在的執行環境本身的請求也被視為同類流量擋下，並非額外的新問題。

**誠實記錄**：DB 層的實際資料時間戳與筆數，本次**無法**在不使用憑證的前提下
查證。建議由使用者本人執行以下其中一種方式驗證：

- **最簡單**：直接用瀏覽器打開（會通過 Cloudflare 的人機驗證）：
  - `https://health.j172.tw/api/npo-organizations?pageSize=30&page=1` → 看
    JSON 裡的 `total`
  - `https://health.j172.tw/api/health-supplements?limit=5` → 看
    `results` 筆數
- **或**請既有 ops 腳本／SSH 直接查詢正式站 DB 以下表格（欄位已從
  `lib/server/facilities/queries.ts`、`lib/server/food/healthSupplements.ts`
  的 INSERT 語句核對過，確定存在）：
  - `facilities` 表，篩選 `facility_type = 'npo'`：
    `SELECT COUNT(*), MAX(updated_at), MAX(synced_at) FROM facilities WHERE facility_type='npo';`
    （NPO 機構資料統一存放在共用的 `facilities` 表，不是獨立的
    `npo_organizations` 表）
  - `tfda_health_supplements` 表：
    `SELECT COUNT(*), MAX(updated_at), MAX(synced_at) FROM tfda_health_supplements;`
  - `ingest_runs` 表（`app/api/admin/ingestion-runs` 背後的表，需要
    admin secret 才能透過 API 讀，但直接下 SQL 不需要）：篩選對應
    npo-sync／health-supplements-import 觸發類型的最近紀錄，交叉比對
    CI 的綠燈是否真的對應到有意義的 `inserted_count`/`updated_count`
    （即 memory 中提過的「ingestion counters 曾經說謊」的教訓，CI 綠燈
    不等於資料真的有更新）。

---

## 4. 其他可優化項目（含優先級）

**P1 － `news-og-backfill.yml` 重新啟用前，必須先評估與 `facilities-geocode-batch`
的排程碰撞風險**
兩者目前用**完全相同**的 cron（`*/30 * * * *`）、**同一個** concurrency group
（`host-tw123457-server`），且都設定 `cancel-in-progress: true`——這正是
issue #249 描述的 npo-sync 搶佔問題的同一種結構性風險。查證停用前的歷史執行
紀錄（2026-08-30 全天 30 次排程執行），**29/30 次都正常 `success`，沒有一次
是被取消**（唯一一次失敗是 SSH 斷線，不是併發取消）——理論風險存在，但實際
觀測到的碰撞率遠低於 npo-sync（npo-sync 是「一天只有 2 個固定時間點」，反而
場場必中；og-backfill 是「本身也每 30 分跑一次」，GitHub 排程本身的些微時間
抖動似乎剛好避開了大部分碰撞）。**建議**：重新啟用 `news-og-backfill.yml`
時，比照 #249 對 npo-sync 的建議做法，把它的 cron 也錯開 `:00/:30` 格點（例如
`5,35 * * * *`），一次性排除掉這個本可避免的風險，而不是賭運氣延續現狀。

**P1 － `npo-organizations-sync` 搶佔問題已再惡化，建議儘速處理 #249**
本次查核（2026-09-14）發現最近 5 次排程執行**連續全部 `cancelled`**
（2026-09-11T15:34 起），比 issue #249 記錄當時的「最近 3 次」又新增 2 次。
這不是本報告的修復範圍（issue #249 已有專案處理），僅在此更新現況供優先序
參考——NPO 機構地址／網站回填目前完全沒有在跑。

**P2 － `health-supplements-import.yml` 建議加季度排程**（詳見 2.3 節）。

**P3 － `opendata-geo-backfill.yml` 的排程設計值得作為範本**：它的 cron 註解
清楚寫明「為什麼選這個日期/分鐘」（避開 `facilities-geocode-batch` 的
`:00/:30` 格點、避開 `six-monthly-sync` 的 1/2、7/2），是目前唯一一個**主動**
考慮跨 workflow 碰撞的排程設計。建議之後新增任何會打正式站或共用外部限流
資源（Nominatim/OpenCage）的排程時，都採用同樣的錯開邏輯——包含上面 P1
提到的 `news-og-backfill` 與（若採納）`health-supplements-import` 的新排程。

**P3（範圍外，僅供留意，非排程問題）**：閱讀 `deploy-ftps.yml` 時發現一則
既有註解指出 `MOENV_NEWS_API_KEY` 從未被實際佈署到正式站的 `.env`，導致
`fetchMoenvNews`（環境部新聞來源）自上線以來每次 ingestion 都會拋錯。這是
一個資料源層級的設定缺口，不屬於「排程」本身的問題，且查無對應 issue，
建議另外開一張 ticket 追蹤，本報告僅記錄不展開處理。

---

## 附錄：查核指令與資料來源

- `gh workflow list --all`、`gh run list --workflow=<file> --limit N`
- `gh run view <run_id> --log-failed`
- `gh issue view 224 / 249 / 98`
- `gh pr list --search "224" --state all`（確認 PR #230 合併與內容）
- `git log --oneline --all -- .github/workflows/six-monthly-sync.yml`
- 官方資料集頁面：`https://data.gov.tw/dataset/6951`（健康食品資料集，
  更新頻率：每3月）
- 直接嘗試 `https://health.j172.tw/api/npo-organizations`、
  `https://health.j172.tw/api/health-supplements`（皆 403，未取得資料）
