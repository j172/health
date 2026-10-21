# 反詐與成癮防治＋開放資料擴充：執行計畫

- **日期**：2026-10-14
- **狀態**：Spec 已發布為 [Issue #562](https://github.com/j172/health/issues/562)（範圍：第 0、1 期）；已拆成 13 張 ready-for-agent ticket #563–#575（見下）；第 2、3 期另開 spec
- **來源**：/grill 決策（本文 §1）＋研究文件 [opendata-expansion-research.md](opendata-expansion-research.md)
- **前置**：2.0 PRD [#438](https://github.com/j172/health/issues/438)（P1 navModel、P2 `/guides` 已上線，本計畫直接建在其上）

---

## 1. 決策（勿重談）

| # | 主題 | 決策 |
|---|---|---|
| 1 | 範圍 | 拆兩軌：A 反詐／成癮（已 grill），B 開放資料擴充（研究完成後再 grill 取捨）；合併成本計畫 |
| 2 | 反詐形式 | 新工具 `/tools/anti-fraud`，分類 `disaster-alerts`（防災與示警） |
| 3 | 反毒形式 | 不新增工具；毒防中心＋藥癮戒治機構併入 `mental-health`（新增「成癮防治」分頁） |
| 4 | 反詐功能 | 可疑網址查詢＋最新詐騙趨勢＋常見手法與應變＋反詐新聞＋電話／LINE ID 外連 165 |
| 5 | 網址查詢資料 | 警政署 176455（停止解析，約 9.4 萬，按月）＋數產署 165027（約 1.7 千，近乎每日）；160055 假投資（2025-12 停更）可一次性匯入當歷史 |
| 6 | 趨勢資料 | 每月新增網域數／網站性質分布（176455）＋警政署 172159 每月攔阻＋金管會 11198 每週違規投資廣告 |
| 7 | 新聞 | 入庫時標記主題（`anti-fraud`、`anti-drug`、`tobacco`）＋回填 90 天＋`/news?topic=` 篩選；新增官方來源：反毒大本營、警政署新聞 7505。**不用** 165 未公開 `/api/article/*` 與打詐儀錶板前端 API |
| 8 | 情境頁 | 第 6 個情境 `fraud-and-addiction`「遠離詐騙與成癮」，Nav／Footer 由 5 改 6 |
| 9 | 導流 | 緊急電話「治安反詐」、「家有長輩」情境頁加反詐步驟、首頁 snapshot 狀態列（本月新增涉詐網域數）、公民友站加 165 全民防騙網＋反毒大本營 |
| 10 | 戒癮資料 | 全國名單 133353（216 家、22 縣市，CSV）＋美沙冬跨區給藥 133345 自動同步；無座標，交給既有 geocode 批次 |
| 11 | 菸害 | 緊急電話補戒菸專線 0800-636-363、菸害檢舉專線 0800-531-531；情境頁含 `smoking-cessation` 步驟（細節見 §1.1） |
| 12 | B 軌收錄 | 4 組全收：用藥食安、婦幼長照、治安生活、生活環境 |
| 13 | 垃圾車即時位置 | 使用者開頁時才向上游取資料，memoizeQuery 快取 60–120 秒，不入庫；路線與清運點每天入庫一次。這是「先入 DB 再讀 DB」原則的明訂例外 |
| 14 | 執行 | 第 0 期前景小 PR → 第 1–3 期依序：spec → issue → worktree agent 做到 PR → 前景讀 diff → merge → 部署 → 打 production API 實測；一期上線後才開下一期 |

### 1.1 菸害與戒菸（2026-10-14 第二輪 grill）

| # | 主題 | 決策 |
|---|---|---|
| T1 | 戒菸院所資料 | **線上錯誤**：`/tools/smoking-cessation` 自稱「全國」，實際只有 `build-expansion-seeds.mjs`（已移除，見 git 歷史）:113 手寫的 6 筆。改成國健署全國表 [6954](https://data.gov.tw/dataset/6954)（ODS，2,838 家，有給藥／衛教欄位，年更，沒有代碼和座標）當基底，**六都 CSV 依縣市整批覆蓋**：臺北 [121898](https://data.gov.tw/dataset/121898)、新北 [124244](https://data.gov.tw/dataset/124244)＋牙醫 [125915](https://data.gov.tw/dataset/125915)、桃園 [33872](https://data.gov.tw/dataset/33872)、臺中 [81720](https://data.gov.tw/dataset/81720)、臺南 [140122](https://data.gov.tw/dataset/140122)、高雄 [87259](https://data.gov.tw/dataset/87259)。不做逐筆比對去重；各縣市標示自己的資料日期；每月同步，交給 geocode 批次 |
| T2 | 排期 | 第 0 期先把頁面上的「全國」改成誠實文字，並附國健署查詢連結；資料同步放在第 1 期，新增 issue **1-D** |
| T3 | 新興菸品區塊 | 靜態宣導，每項附官方來源：電子煙全面禁止、加熱菸只有通過健康風險評估的品項合法、未滿 20 歲禁止、罰則、檢舉 0800-531-531；**喪屍煙彈警示**（連到 0800-770-885 和情境頁）；**合法加熱菸品項清單**（依國健署公告人工整理，標示公告日期，列入 six-monthly-sync 的人工更新清單） |
| T4 | 不做 | 學生電子煙吸食率圖表（[14471](https://data.gov.tw/dataset/14471)／[14472](https://data.gov.tw/dataset/14472) 只到 106 年，會誤導使用者）；指定吸菸區與禁菸場所（列入 backlog，見 §5） |
| T5 | 檳榔 | 只放宣導和外連：smoking-cessation 加「檳榔與口腔癌」段落，連到 `adult-preventive-care` 的口腔黏膜篩檢；不做戒檳榔院所地圖（只有南投 [177988](https://data.gov.tw/dataset/177988) 一個縣市有資料） |
| T6 | FAQ | 從國健署戒菸專線問答 [9514](https://data.gov.tw/dataset/9514)（30 則）挑選幾則改寫成工具頁 FAQ，並標註出處 |

### 共通約束
- 網址查詢**查不到時**一律提示「不在清單上不代表安全，請撥 165 查證」；**不記錄**使用者輸入（不寫 log、不入 DB、不送第三方）。
- 涉詐網域表 UNIQUE KEY **只放正規化後的網域**，不含月份或時間（避免 2026-09-21 `cwa_station_weather` 那種「UNIQUE KEY 含時間欄位 → 每次同步都 INSERT」的膨脹重演，見 [09-database-data-integrity.md](../domains/09-database-data-integrity.md)）；月份存成一般欄位。
- 新上游一律**先從正式主機實測可連線**（SSH loopback）；被資料中心 IP 擋的，改由 GitHub runner 抓取後經 SSH loopback POST 回來。
- 不做犯罪地圖或治安排名（避免社區污名）；不收失蹤人口（個資）。
- 新排程避開既有 cron 的分鐘點，部署時間依 :15–:30／:45–:00 規則。
- 每個 PR 在部署後打 live API 驗證，不能只看測試全綠。

---

## 1.2 Ticket 拆分（/to-tickets，2026-10-14）

Spec #562 的第 0、1 期已拆成 13 張 ready-for-agent ticket，依前置關係排列（無前置的可以立即開工）：

| # | Issue | 標題 | 前置 |
|---|---|---|---|
| 1 | [#563](https://github.com/j172/health/issues/563) | 緊急專線修正＋戒菸頁先改掉「全國」 | 無 |
| 2 | [#564](https://github.com/j172/health/issues/564) | 防詐騙查詢的主線：176455 涉詐網域同步＋網址查詢＋`/tools/anti-fraud` | 無 |
| 4 | [#565](https://github.com/j172/health/issues/565) | 新聞主題標籤：`classifyNewsTopics`＋回填＋`/news?topic=`＋依主題取相關新聞 | 無 |
| 7 | [#566](https://github.com/j172/health/issues/566) | 成癮防治分頁的主線：133353 全國藥癮戒治機構 | 無 |
| 3 | [#567](https://github.com/j172/health/issues/567) | 補上數產署 165027 每日清單和 160055 假投資歷史資料 | #564 |
| 5 | [#568](https://github.com/j172/health/issues/568) | 新增反毒大本營和警政署 7505 兩個官方新聞來源 | #565 |
| 9 | [#569](https://github.com/j172/health/issues/569) | 戒菸院所改用國健署全國表（6954），移除 6 筆手寫資料 | #563 |
| 6 | [#570](https://github.com/j172/health/issues/570) | 防詐騙工具的內容區塊：趨勢、手法與應變、165 外連、反詐新聞 | #564, #565 |
| 8 | [#571](https://github.com/j172/health/issues/571) | 成癮防治分頁補上美沙冬跨區給藥和 22 縣市毒防中心 | #566 |
| 10 | [#572](https://github.com/j172/health/issues/572) | 戒菸院所的六都資料覆蓋＋給藥／衛教／僅調劑標示 | #569 |
| 11 | [#573](https://github.com/j172/health/issues/573) | 戒菸頁新增新興菸品、檳榔與口腔癌宣導，以及官方 FAQ | #563 |
| 12 | [#574](https://github.com/j172/health/issues/574) | 第 6 個生活情境「遠離詐騙與成癮」 | #564, #566 |
| 13 | [#575](https://github.com/j172/health/issues/575) | 從各處導流到防詐騙工具：緊急電話、首頁狀態列、公民友站 | #564 |

對應第 1 期 spec 原本的 1-A～1-D：1-A → #564／#567／#570；1-B → #565／#568；1-C → #566／#571／#574／#575；1-D → #569／#572／#573。

> 2026-10-14 發布時遇到一次操作事故：第一輪 `gh issue create` 因為中文標題經過 argv 傳給 Windows 上的 `gh.exe` 被 MSYS 編碼轉換搞亂（body 用檔案寫入沒事，標題用命令列參數傳就亂碼），13 個標題全部變成亂碼發布。已用 `gh api ... -F title=@file`（讀檔案而不是 argv）全部修正，上表的標題和連結已確認正確。之後在這台主機要設定中文 issue 標題，一律用 `-F field=@file` 讀檔案，不要把中文字串直接放進 `gh issue create/edit` 的命令列參數。

## 2. 分期

### 第 0 期：專線修正（前景，小 PR，立即）
- `data/government-hotlines.json:509`、`data/taiwan-hotlines.csv:47`：毒品防制專線 `0800-024-555` → **`0800-770-885`**（法務部戒毒成功專線，24 小時，各地毒防中心接聽）。改之前先查證原號碼的來歷。
- 補戒菸專線 `0800-636-363`（國健署）、菸害諮詢及檢舉專線 `0800-531-531`，改之前先查官方頁面確認。
- `smoking-cessation` 的標題和描述：把「全國」改成誠實文字（例如「部分院所示例，完整名單請見國健署」），並加上國健署戒菸服務查詢的外連。這是 1-D 上線前的止血。
- 驗證：緊急電話頁 live 顯示正確。

### 第 1 期：反詐與成癮（4 個 issue）
**1-A 涉詐網域同步＋`/tools/anti-fraud`**
- 新表 `fraud_domains`（domain PK／UNIQUE、source、site_type、month、first_seen、last_seen）；月更同步 176455、日更同步 165027；160055 一次性匯入。
- 正規化：小寫、去 scheme／path／port、punycode；比對時依序查完整主機名和上層網域（例：`a.b.example.com` → `b.example.com` → `example.com`），**不往上比到公共後綴**（例如 `myshopify.com`、`netlify.app`），因為這些平台上的單一子網域才是涉詐單位。
- 頁面區塊：查詢框、趨勢（176455 每月新增與性質分布＋172159＋11198）、常見手法與應變（附官方來源連結）、相關新聞（依 `anti-fraud` 主題）、電話／LINE ID 外連 165 全民防騙網與 165 打詐儀表板。
- catalog 條目、keywords、JSON-LD、llms.txt／.md 依 2.0 規範。

**1-B 新聞主題標籤＋2 個官方來源**
- `news_topics`（或欄位）＋入庫規則（關鍵字表，可測試）＋回填近 90 天。
- `relatedNewsForTool` 對有主題的工具改成「依主題取最新 N 則」；`/news?topic=` 篩選。
- 新來源：反毒大本營（`antidrug.moj.gov.tw` lp 靜態頁，全文入庫）、警政署新聞 7505（全文入庫）；`sourceCategories` 的 `gov` 分類同步更新。

**1-C mental-health 成癮防治分頁＋情境頁＋導流**（依賴 1-A、1-B）
- 資料：133353＋133345 同步、22 個毒防中心（反毒大本營 `lp-33-1`）、geocode。
- `GUIDES` 新增 `fraud-and-addiction`（anti-fraud → emergency-hotlines → mental-health → smoking-cessation → clinics）；「家有長輩」加入 anti-fraud 步驟；更新 `navModel.test.mjs` 寫死的 5。
- 緊急電話 165 卡片連到工具、互相加入 relatedSlugs；首頁 snapshot 加「本月新增涉詐網域」；`CIVIC_PARTNER_LINKS` 加 165 全民防騙網、反毒大本營。

**1-D 戒菸院所全國資料＋新興菸品與檳榔宣導**（與 1-A、1-B 平行）
- 國健署 6954 ODS 解析器＋六都 CSV 解析器（各縣市欄位不同，各寫一個轉接器，輸出同一種格式）；依縣市整批替換；移除 6 筆手寫 seed。
- 每月同步，接上 geocode 批次；頁面恢復「全國」字樣，並顯示各縣市的資料日期。
- 新興菸品區塊（T3）、檳榔段落（T5）、FAQ（T6）。
- 驗證：live API 的 `type=smoking_cessation` 總數應在 2,500 筆以上，六都抽查各 3 筆。

### 第 2 期：用藥食安＋婦幼長照
- **違規健康廣告查詢**（新工具，`environment-food`）：食藥署 6949／14196／14198／14197，每週同步；跟 anti-fraud 互相連結。
- **藥品短缺與回收**併入 `drugs`：54504／54505／6947。
- **邊境查驗不合格食品**併入 `food-safety`：6133。
- ~~**產後護理之家地圖**~~：2026-10-14 移至 [child-family-welfare-plan.md](child-family-welfare-plan.md) 第 2 期（D7），連同一般護理之家和居家護理所補進 `long-term-care` 一起做（同一份 115950）。

### 第 3 期：治安生活＋生活環境
- **失物招領**（新工具）：7317，每日同步。
- **最近的派出所**：5958 加入「我附近」更多類型，TWD97 → WGS84，並與 `child-safety-spots` 互連。
- **交通事故熱點**（新工具）：A1 12818、A2 13139；TDX 道安端點要先帶 token 實打。
- **垃圾車與清潔隊**：升級 `cleaning-squads`，即時位置在使用者開頁時才取（決策 13），路線與清運點每天入庫。
- **林火風險**併入 `outdoor-safety`；**自來水水質**併入 `water-outages`（新增水質分頁）；**今日菜價**（新工具）。

---

## 3. 開放問題（到該期再決定，不阻擋第 0、1 期）

| # | 問題 | 預設建議 |
|---|---|---|
| Q1 | `life-culture` 目前 13 個，第 3 期新增失物招領、事故熱點、菜價後會變 16 個，超過 8–15 的上限 | 事故熱點改放 `disaster-alerts`，或併入既有交通工具；第 3 期 grill 時決定 |
| Q2 | `disaster-alerts` 目前已有 14 個（master plan 寫 13，實際已漂移），加入 anti-fraud 後是 15 個，已到上限 | 可以接受；之後再加就要先重新分配 |
| Q3 | 新工具的外語名稱 | 依 2.0 #24 只翻名稱，不列入 P6 全文翻譯的 21 頁 |
| Q4 | 165 打詐儀錶板的每日資料 | 不爬；另外去函請警政署上架開放資料（非程式工作） |
| Q5 | 疾管署 `od.cdc.gov.tw` 年更名冊（抗蛇毒血清醫院等）擋資料中心 IP | 是否人工更新 seed，之後再議 |

## 4. 已結案（研究附帶發現）
- `data.hpa.gov.tw`、`data.nhi.gov.tw` 的 DNS 已不存在，9/14 盤點裡「值得後續確認」的這兩項可以結案。
- g0v `moedict-data-twblg`／`moedict-data-hakka` 自 2023 年起停滯，目前仍可使用，持續觀察。

## 5. Backlog（不開 issue）
- 指定吸菸區：臺北 [177504](https://data.gov.tw/dataset/177504) 有 262 點、有座標（另有英文版 [178051](https://data.gov.tw/dataset/178051)），其他縣市沒有。
- 禁菸場所：國健署公園綠地 [31163](https://data.gov.tw/dataset/31163)（682 筆，沒有座標），臺北、臺中、臺南、新北、基隆、新竹各自公告，格式不一。
- 戒檳榔院所：只有南投 177988。
- 臺北市菸害稽查成果 [121706](https://data.gov.tw/dataset/121706)：依行政區統計，只有一個縣市。
