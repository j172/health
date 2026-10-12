# 移除 9 個從沒成功抓過任何一篇文章的新聞來源

- **作者**：Claude（診斷會話）
- **日期**：2026-09-22
- **狀態**：Draft，待 worktree subagent 實作

## 1. 背景

盤點 `ingest_errors` 表時發現，以下 9 個新聞來源自加入以來**從未成功產出過任何一篇文章**（`news_items` 裡對應 `source_name` 查詢筆數為 0），已經持續失敗 7-24 天不等，每次同步都寫入錯誤紀錄：

| feed_code | 名稱 | 失敗天數 | 錯誤筆數 | 根因 |
|---|---|---|---|---|
| `nhi_web` | 健保署 | 24 天 | 773 | 政府網站封鎖機房 IP（已知，見 `docs 記憶/ops_host_ip_blocked_upstreams`） |
| `uniqman_blog` | UNIQMAN | 23 天 | 725 | 網站回 403（封鎖），偶發 DNS 解析失敗 |
| `sfaa_news` | 衛福部社家署 | 11 天 | 320 | 連線逾時，偶發 DNS 解析失敗 |
| `unitedway_news` | 台灣聯合勸募 | 11 天 | 180 | **對方網站自己的 TLS 憑證鏈設定錯誤**（用 openssl 直接驗證確認：少送中繼憑證），偶發 DNS 解析失敗 |
| `moe_familyedu` | 教育部家庭教育網 | 11 天 | 166 | 連線逾時，偶發 DNS 解析失敗 |
| `moc_news` | 文化部 | 7 天 | 73 | 網站回 403（封鎖），偶發 DNS 解析失敗 |
| `pchome_health` | PChome 健康 | 10 天 | 8 | HTTP 502／逾時，PChome 自己伺服器不穩 |
| `pchome_pet` | PChome 寵物 | 10 天 | 11 | 同上（跟 pchome_health 共用同一支解析函式 `parsePchomeHtml`） |
| `pchome_living` | PChome 生活 | 10 天 | 15 | 同上 |

程式碼裡完全沒有重試機制（`lib/server/rss/` 底下沒有任何 retry/backoff 邏輯），所以「加重試」救不了這些——它們是真的連不上、被擋，或對方網站本身的問題，不是我們這端的暫時性錯誤。`unitedway_news` 雖然技術上可以繞過憑證驗證來湊合，但那是犧牲整個程式對外部來源的 TLS 安全基準去將就一個小型 NPO 網站自己的設定錯誤，不值得，比照其他 8 個一起移除。

**這次順便發現並一併處理**：`pchome_health`、`pchome_pet`、`pchome_living` 三個原本只鎖定 `pchome_health`，深查後發現另外兩個共用同一支從未成功過的解析函式，一起列入範圍。

## 2. 移除範圍（逐一列出，請照著刪，不要漏）

### 2.1 `nhi_web`
- 刪除整個檔案 `lib/server/rss/fetchNhiNews.ts`
- 移除 `lib/server/rss/runIngestion.ts` 第 576 行附近呼叫這個 fetch 的區塊，以及對應的 import

### 2.2 `uniqman_blog`
- 刪除整個檔案 `lib/server/rss/fetchUniqmanBlogs.ts`
- 移除 `runIngestion.ts` 第 592 行附近呼叫這個 fetch 的區塊，以及對應的 import

### 2.3 `sfaa_news`
- 移除 `lib/server/config/rss-feeds.ts` 第 401-406 行的 `sfaa_news` 陣列項目，以及上方第 386-394 行提到 `fetchSfaaNews`／`sfaa_news` 的過時註解（那個函式已經在更早的重構移除了，註解本身也該一併清掉）

### 2.4 `unitedway_news`
- 移除 `lib/server/rss/fetchNpoSources.ts` 裡的 `fetchUnitedWayNews` 函式（約第 708-780 行，用該函式的 `export async function fetchUnitedWayNews` 到下一個 `export async function` 之間的範圍為準）
- 移除 `runIngestion.ts` 第 847 行附近呼叫這個 fetch 的區塊，以及對應的 import

### 2.5 `moe_familyedu`
- 移除 `lib/server/rss/fetchExpandedSources.ts` 裡的 `parseMoeFamilyEduHtml`（約 329-383 行）與 `fetchMoeFamilyEdu`（約 384-414 行）兩個函式
- 移除 `runIngestion.ts` 第 1006-1009 行附近呼叫這個 fetch 的區塊，以及對應的 import
- 移除 `lib/server/news/sourceLabels.ts` 第 88 行的 `moe_familyedu` 標籤
- 移除 `lib/server/news/sourceCategories.ts` 第 38 行的 `moe_familyedu` 分類項目
- 移除 `lib/server/news/seo.ts` 第 103 行的 `moe_familyedu` 項目

### 2.6 `moc_news`
- 刪除整個檔案 `lib/server/rss/fetchMocNews.ts`
- 移除 `runIngestion.ts` 第 1087 行附近呼叫這個 fetch 的區塊，以及對應的 import

### 2.7 `pchome_health` / `pchome_pet` / `pchome_living`（三個一起處理）
- 移除 `lib/server/rss/fetchExpandedSources.ts` 裡的 `parsePchomeHtml`（約 813-894 行）、`fetchPchomeHealth`（約 895-908 行）、`fetchPchomePet`（約 909-922 行）、`fetchPchomeLiving`（約 923 行到該函式結束）四個函式
- 移除 `runIngestion.ts` 第 37-39 行的三個 import（`fetchPchomeHealth`/`fetchPchomePet`/`fetchPchomeLiving`），以及第 1060-1087 行附近三個來源各自的呼叫區塊

### 2.8 `types/rss.ts`
- `FeedCode` 這個 union type 裡有這 9 個的字面量（約第 54、62、89、102、110-113、116 行），一併移除。

## 3. 待辦事項

1. 依上述範圍逐一移除。
2. 移除後跑 `grep -rn "nhi_web\|uniqman_blog\|sfaa_news\|unitedway_news\|moe_familyedu\|moc_news\|pchome_health\|pchome_pet\|pchome_living" lib/ app/ components/ types/`，確認完全乾淨（歷史 spec/docs 檔案裡的舊文字不算，只看程式碼）。
3. `npx eslint`／`npx tsc --noEmit`／`npm test` 全部通過。
4. **不要動 `ingest_errors` 表裡這 9 個來源的歷史錯誤紀錄**——資料量小、無害，留著當歷史記錄即可，這次不清。
5. **不要動 `pm25/aqi` 或任何跟今天稍早的資料庫 schema 修法（#379/#384/#385）相關的檔案**——這是完全獨立的另一個問題，不要混在同一個 PR 裡。

## 4. 驗收標準

- 9 個來源的抓取程式碼、呼叫點、顯示標籤全部移除。
- `npx eslint`/`npx tsc --noEmit`/`npm test` 全部通過。
- PR 說明列出移除的 9 個來源與各自的檔案異動清單。
