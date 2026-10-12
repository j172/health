# Fix: npo-organizations-sync 排程被 facilities-geocode-batch 搶佔取消

- **Type**: Bug fix (production data ingestion silently stalled).
- **Affects**: `.github/workflows/npo-organizations-sync.yml`, `.github/workflows/facilities-geocode-batch.yml`

## 1. 背景與證據

`npo-organizations-sync.yml` 排程為每天 UTC 03:30、15:30（`cron: "30 3,15 * * *"`），
`facilities-geocode-batch.yml` 排程為每 30 分鐘一次（`cron: "*/30 * * * *"`）。兩者的
`concurrency.group` 都是 `host-tw123457-server`，且 `facilities-geocode-batch.yml` 設定
`cancel-in-progress: true`。

GitHub Actions 的 concurrency group 是跨 workflow 共用的：只要 group 名稱相同，新啟動的
run 若 `cancel-in-progress: true`，就會取消**目前佔用該 group 的任何 run**，不論是不是同一個
workflow。而 npo-sync 固定在整點 `:30` 起跑，跟 geocode-batch 的 `*/30`（同樣在 `:00`/`:30`
觸發）**時間點完全重疊**。

實測結果（2026-09-14 查核，最近 3 次 npo-sync 排程執行）：

```
2026-09-13T15:33:04Z  cancelled
2026-09-13T03:38:06Z  cancelled
2026-09-12T15:33:22Z  cancelled
```

抓到其中一次的 log（run `34765939375`），npo-sync 在 `Round 1/5` 抓完第一批分頁後、
跑了約 34 秒就被砍：

```
[NPO Sync GHA] Starting crawl from page 1, rounds: 5
--- Round 1/5: Fetching pages 1..2 ---
##[error]The operation was canceled.
```

**影響**：NPO 機構地址／網站的排程回填，實質上已經長期停擺——每天固定兩次，次次在剛起步就被
`facilities-geocode-batch` 的下一輪 30 分鐘排程砍掉，且因為 conclusion 是 `cancelled` 而非
`failure`，不會被一般的「排程失敗」告警邏輯注意到。

## 2. 修法

兩個獨立修法，建議都做（互不排斥、風險都低）：

1. **錯開排程時間**：把 `npo-organizations-sync.yml` 的 cron 從 `30 3,15 * * *` 改成不落在
   `facilities-geocode-batch` 30 分鐘格點上的時間，例如 `45 3,15 * * *`（提早或延後跑都可以，
   只要不再是整點或半點）。這是最小改動、立即生效。
2. **讓兩者不再共用同一個會互相取消的 group**：評估 npo-sync 是否真的需要跟
   `facilities-geocode-batch`／`deploy-ftps`／`disaster-points-sync`／`health-supplements-import`
   共用 `host-tw123457-server` 這個 group（這個 group 存在的原意應該是「同時間只讓一個工作在打
   正式站/資料庫，避免資源衝突」）。若 npo-sync 本身跑的時間夠短、對主機負載影響有限，可以考慮
   給它自己獨立的 concurrency group（比照 `opendata-geo-backfill`／`six-monthly-sync` 的做法，
   各自用自己的 group 名稱），只保留「同一個 npo-sync 不會跟自己重疊」的保護，不再被其他
   workflow 搶佔。**但要先確認 npo-sync 執行期間是否真的會跟 geocode-batch 同時打正式站的同一個
   資源/DB 連線池**，若有實質衝突風險就不能拆開，只做修法 1。

實作前務必先讀 `facilities-geocode-batch.yml`、`npo-organizations-sync.yml`、
`disaster-points-sync.yml`、`health-supplements-import.yml`、`deploy-ftps.yml` 全部共用
`host-tw123457-server` 這個 group 的既有註解，理解這個 group 當初存在的目的（NPROC 耗盡的
教訓，見 `docs`／memory 對 2026-08-23 那次 outage 的記錄），不要為了解開衝突就整組拿掉保護。

## 3. 驗收

- 之後連續兩天（4 次排程）的 npo-organizations-sync 執行，conclusion 應為 `success`（或至少不是
  因為被同 group 的其他 workflow 取消）。
- 不影響 `facilities-geocode-batch` 本身既有的搶佔保護邏輯（它取消自己的舊 run 是刻意設計，
  不要動它的 `cancel-in-progress: true`）。
- 確認修改後 `host-tw123457-server` group 內其餘 workflow（deploy、disaster-points-sync、
  health-supplements-import）沒有被連帶影響。

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
