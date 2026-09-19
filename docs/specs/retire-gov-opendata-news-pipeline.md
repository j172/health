# 退役重複的政府開放資料新聞管線（gov-opendata-news-sources.ts）

- **作者**：Claude（診斷會話）
- **日期**：2026-09-20
- **狀態**：Draft
- **對應診斷**：`docs/specs/news-fulltext-fetch-findings.md` 第 2.1、2.4 節
- **已與使用者確認**：直接退役整條管線，不修復個別壞掉的來源。

## 1. 背景（已確認，不用重新調查）

站上有 3 條互相獨立的新聞擷取管線同時餵進 `news_items` 表。其中 `GOV_OPENDATA_SOURCES`（`lib/server/config/gov-opendata-news-sources.ts`，12 筆設定）由獨立的 `lib/server/news/fetchGovOpenDataNews.ts`（`syncGovOpenDataNews()`）處理，排程在 `lib/server/cron/registerJobs.ts` 第 110-113 行：`cron.schedule("12,42 * * * *", ...)`，每小時兩次。

實測這 12 筆設定的健康狀況：

| 來源 | 狀態 |
|---|---|
| 農業部 moa | HTTP 404，網址本身失效 |
| 內政部消防署 nfa | HTTP 504／連線逾時 |
| 交通部 motc | 302 轉址後 HTTP 502 |
| 環境部 moenv | 302 轉址到 /error，最終 403 |
| 公路局 thb | HTTP 200，但回應內容是 Incapsula 機器人挑戰頁而非真 RSS——因為 `syncGovOpenDataNews()` 只檢查 HTTP 狀態碼，這種「假 200」完全不會被記錄成錯誤，靜默產出 0 筆 |
| 高速公路局 freeway | 正常（200） |
| 衛福部社家署 sfaa（此路徑） | 正常（200），是 sfaa 真正有效的 RSS 網址 |
| 健保署 nhi | HTTP 403（已知的資料中心 IP 封鎖，見既有記錄 `ops_host_ip_blocked_upstreams`） |
| 食藥署 tfda（此路徑重複設定） | 正常（200），但網址與 `rss-feeds.ts` 裡已驗證有效的 `tfda` 設定不同 |
| 國健署 hpa（此路徑重複設定） | 302 轉址，網址本身就不對，與 `rss-feeds.ts` 裡驗證有效的網址不同 |
| 疾管署 cdc（此路徑重複設定） | 302 轉址，雜湊 ID 疑似過期或抄錯，與 `rss-feeds.ts` 裡驗證有效的網址不同 |

`mohw`/`cdc`/`tfda`/`hpa`/`nhi`/`sfaa` 這 6 個代號在 `lib/server/config/rss-feeds.ts`（管線 1，`enrichItem()` 處理）裡各自都有一份**已驗證正常運作**的設定，網址與這裡不同。也就是說，這條獨立管線 12 筆裡有 5 筆已死/被擋、6 筆與另一條正常運作的管線重複（且網址版本更舊、更容易壞），只有 `freeway` 一筆是這條管線獨有且正常的。

## 2. 待辦事項

1. 確認 `freeway`（高速公路局）這一筆是否在 `lib/server/config/rss-feeds.ts`（管線 1）裡已經有對應設定。若沒有，先把 `freeway` 這個來源遷移過去（比照 `rss-feeds.ts` 既有其他政府來源的設定方式），確保退役這條管線後 `freeway` 的新聞不會消失。
2. 確認 `sfaa` 的處理方式：`sfaa.gov.tw/SFAA/RSS.aspx?type=1`（這條管線用的網址）已驗證正常且有全文；而 `lib/server/rss/fetchExpandedSources.ts` 裡另有一條走 `sfaa.gov.tw/sfaa/list/5cX`（HTML 列表頁，從不抓全文）的路徑，`feedCode` 同樣是 `sfaa_news`，兩條路徑目前並存、容易混淆。退役本管線時，**若 `fetchExpandedSources.ts` 那條 HTML 列表頁路徑目前是唯一仍在運作的 sfaa 來源**，評估是否要把本管線這條「網址正常、能抓到全文」的 RSS 路徑遷移進 `rss-feeds.ts`，取代或並存於現有的 HTML 列表頁爬蟲（取決於哪一條資料品質更好——RSS 路徑已驗證正常且被記錄為「能抓到全文」，值得優先保留）。不要讓 sfaa 的新聞在退役後完全消失或本文品質不明不白地變差。
3. 移除 `lib/server/config/gov-opendata-news-sources.ts`、`lib/server/news/fetchGovOpenDataNews.ts`，以及 `lib/server/cron/registerJobs.ts` 第 110-113 行的排程註冊與相關 import。
4. 全文搜尋確認沒有其他程式碼（測試、腳本、admin 工具等）還在引用這兩個被刪除的檔案，一併清除或更新。

## 3. 驗收標準

- 退役後，`freeway` 與 `sfaa` 的新聞來源仍能正常進站（不因本次清理而消失或劣化），且不重複（不要出現同一篇文章因為兩條管線都在跑而被匯入兩次的過渡期問題——由於退役是直接移除整條管線，理論上不會有這個問題，但實作時仍要留意遷移 freeway/sfaa 設定的時間點）。
- `mohw`/`cdc`/`tfda`/`hpa`/`nhi` 這 5 個既有在 `rss-feeds.ts` 正常運作的來源不受影響。
- 每小時兩次（`:12`/`:42`）的排程從此不再執行，這條票不需要額外處理排程去重疊（該項目已在先前的 cron 去重疊工單完成，本工單是直接移除一整個排程，不影響其計算結果）。
- `npm test`／`npm run build` 通過。
