# 開放資料擴充盤點：還有哪些資料能變成民眾用得到的服務（2.0 候選）

- **日期**：2026-10-14
- **性質**：純研究文件。沒有修改程式碼、沒有 commit、沒有建分支、沒有讀 `.env`，也沒有申請任何帳號或金鑰。
- **前置文件（本文不重複其結論）**：
  - [opendata-sources-audit-20260914.md](../archive/specs/opendata-sources-audit-20260914.md)（WRA、iot.wra、MOENV、MOA 土石流、EE501、g0v 健康類 repo 已盤點過）
  - [geocode-opendata-coverage-gap-research.md](../archive/specs/geocode-opendata-coverage-gap-research.md)（既有地址型來源的座標替代方案）
  - [master-plan.md](master-plan.md)（§4.1 的 7 分類與 30 項決策，**本文不重談**）
  - [tdx-basic-integration-research.md](tdx-basic-integration-research.md)（TDX basic 18 群組已研究；本文只補 basic 以外）
  - `lib/server/tools/catalog.ts`（目前 81 個 `slug`）、`docs/domains/01–13`

---

## 0. 方法與可信度說明

1. **以全國平台的完整目錄為底**：直接下載 `https://data.gov.tw/datasets/export/csv`（68 MB，含各部會與各縣市平台匯入的資料集，2026-10-14 取得），用關鍵字與「詮釋資料更新時間」「更新頻率」篩選，再逐一到資料集本身的下載網址實際打一次。
2. **每個列入建議的資料集都實際下載過**，表中的「筆數」「最新資料日」取自檔案內容本身，不是詮釋資料。**詮釋資料更新時間常常不可信**：例如「165 詐騙闢謠專區」詮釋資料寫 2026-10-13，但內容最新一筆是 2025-04-26。
3. **測試地點是台灣住宅 ISP**（開發者電腦），不是正式主機。正式主機（HawkHost，資料中心 IP）是否可達分兩種情況：
   - 本站程式**已經在用**的主機（`opdadm.moi.gov.tw`、`data.fda.gov.tw`、`data.taipei`、`data.ntpc.gov.tw`、`apiservice.mol.gov.tw`、`data.moa.gov.tw`、`data.moenv.gov.tw`、`www.water.gov.tw`、`opendata.tycg.gov.tw`、`tdx.transportdata.tw`）→ 視為可達。
   - 其餘主機一律標「**正式主機未確認**」。已知封鎖資料中心 IP 的有 `od.cdc.gov.tw`（見 [07](../domains/07-tools-disaster-environment-energy.md) 登革熱移除決策）與 `nhi.gov.tw`。
4. 拿不到、或只看得到詮釋資料的項目，一律寫「未確認」。

---

## 1. 摘要：Top 15 建議新增

分類欄對應 master-plan §4.1 的 7 分類（健康自我評估／就醫與用藥／長照與社會福利／婦幼與家庭／防災與示警／環境與食品安全／交通、生活與文化）。驗證結果欄的數字皆為 2026-10-14 實測。

| # | 服務名稱 | 資料來源 | 落點 | 更新頻率 | 驗證結果 |
|---|---|---|---|---|---|
| 1 | **詐騙網址查詢**（貼上網址，比對是否已遭停止解析） | 警政署「165 遭停止解析涉詐網站」[data.gov.tw/176455](https://data.gov.tw/dataset/176455)＋數產署「詐騙網域停止解析清單」[165027](https://data.gov.tw/dataset/165027) | 新工具（防災與示警） | 不定期，實際約每月一批；數產署版近乎每日 | ✅ 93,839 筆，最新 115 年 9 月（單月 1.0–1.4 萬筆）；數產署 1,734 筆，最新停止解析日 2026-10-08 |
| 2 | **違規健康廣告查詢**（食品／藥品／化粧品／醫材） | 食藥署 [6949](https://data.gov.tw/dataset/6949)、[14196](https://data.gov.tw/dataset/14196)、[14198](https://data.gov.tw/dataset/14198)、[14197](https://data.gov.tw/dataset/14197) | 新工具（環境與食品安全） | 每 7 日 | ✅ 食品 60,773、化粧品 30,369、醫材 5,890、藥品 4,003 筆；最新處分日 2026-09-18～09-24 |
| 3 | **藥癮戒治與替代治療機構地圖** | 衛福部名單（臺北市立聯合醫院轉載）[133353](https://data.gov.tw/dataset/133353)＋美沙冬跨區給藥 [133345](https://data.gov.tw/dataset/133345) | 新工具（就醫與用藥） | 不定期 | ✅ 216 家、涵蓋 22 縣市；跨區給藥 65 家含給藥時段與費用。**無座標**，需 geocode |
| 4 | **警察機關新聞**（含刑事局打詐新聞稿） | 警政署「各警察機關新聞發布」[7505](https://data.gov.tw/dataset/7505) | 新聞來源（官方） | 每日 | ✅ 1,064 則，最新 2026-10-11；含全文 |
| 5 | **藥品短缺與回收** | 食藥署「經評估有／無替代藥品」[54504](https://data.gov.tw/dataset/54504)／[54505](https://data.gov.tw/dataset/54505)、「回收藥品」[6947](https://data.gov.tw/dataset/6947) | 併入 `drugs` | 每 7 日／不定期 | ✅ 短缺 237 項（最新 2026-09-18）、無替代 0 項、回收 1,713 筆（最新 2026-08-26） |
| 6 | **邊境查驗不合格食品** | 食藥署「不符合食品資訊」[6133](https://data.gov.tw/dataset/6133) | 併入 `food-safety` | 每 7 日 | ✅ 2,625 筆，最新發布 2026-10-06 |
| 7 | **產後護理之家地圖**（含評鑑結果、床數） | 衛福部「全國開業護理機構清冊」[115950](https://data.gov.tw/dataset/115950) | 新工具（婦幼與家庭）；一般護理之家／居家護理所補進 `long-term-care` | 每年 | ✅ 1,494 家（產後護理 241、一般護理之家 501、居家護理所 752），**自帶 WGS84 座標**；正式主機未確認（`nhplatform.mohw.gov.tw`） |
| 8 | **垃圾車即時位置與清運點** | 臺北 [136515](https://data.gov.tw/dataset/136515)、新北 [122972](https://data.gov.tw/dataset/122972)／[125664](https://data.gov.tw/dataset/125664)、臺中 [83558](https://data.gov.tw/dataset/83558)、臺南 [136310](https://data.gov.tw/dataset/136310)、高雄 [138256](https://data.gov.tw/dataset/138256) | 併入 `cleaning-squads`（升級為「垃圾車與清潔隊」） | 2–10 分鐘（即時位置）／每日（路線） | ✅ 6 個端點皆 200；臺北含抵達／離開時間與座標，新北路線含每週收運日 |
| 9 | **警察局失物招領查詢** | 警政署 [7317](https://data.gov.tw/dataset/7317) | 新工具（交通、生活與文化） | 每日 | ✅ 88,278 筆，含 2026-10-13 拾得物；含拾得地點、受理派出所 |
| 10 | **最近的派出所** | 警政署「警察局暨分駐派出所地址」[5958](https://data.gov.tw/dataset/5958) | 「我附近」更多類型＋`child-safety-spots` 互連 | 不定期 | ✅ 1,686 筆（115/09/30 版），座標為 **TWD97** 需轉換 |
| 11 | **交通事故熱點／易肇事路口** | 警政署 A1 即時 [12818](https://data.gov.tw/dataset/12818)、A2 [13139](https://data.gov.tw/dataset/13139)；TDX 歷史服務「道安 v1」`/TrafficAccident/Rank` | 新工具（交通、生活與文化） | 不定期（A1 檔內標「資料提供日期 115 年 10 月 12 日」）；A2 每月 | ✅ A1：2026 年 2,843 筆、最新事故 2026-10-05、含經緯度；⚠️ TDX 端點只確認存在於 swagger，未帶 token 實打 |
| 12 | **森林遊樂區林火風險** | 農業部 `/api/v1/ForestFireAlertWCF/` | 併入 `outdoor-safety` | 每日 | ✅ 回傳當日各國家森林遊樂區警戒等級（安全／注意…） |
| 13 | **自來水水質（依鄉鎮）** | 台水「用戶水質資訊公開」[36605](https://data.gov.tw/dataset/36605)、「水質資訊」[6308](https://data.gov.tw/dataset/6308) | 併入 `water-outages`（新增水質分頁） | 每 3 月／每月 | ✅ 340 列鄉鎮別（總硬度等）、給水系統 60+ 項檢驗值，最新 2026-09-23 |
| 14 | **果菜批發行情（今日菜價）** | 農業部 `/api/v1/AgriProductsTransType/` | 新工具（交通、生活與文化） | 每日（休市日除外） | ✅ 回傳 115.10.13 各市場上／中／下價與交易量 |
| 15 | **打詐儀表數據**（每月攔阻金額、每週違規投資廣告） | 警政署 [172159](https://data.gov.tw/dataset/172159)、金管會 [11198](https://data.gov.tw/dataset/11198) | 併入 #1 工具頁的儀表區 | 每月／每週 | ✅ 警政署 113/9–115/8 共 24 個月；金管會最新 2026-10-12（累計 118,757 件） |

**次要候選（值得做但優先度較低）**：食藥署「藥物食品安全週報」[11502](https://data.gov.tw/dataset/11502)（每週，新聞來源）；Cofacts 真的假的 GraphQL（反詐查核，見 §2.1）；環境部「機車排氣定檢站」`mpi_s_01`（含座標與「今日營業」註記，我附近）；環境部「全國維修地圖」`wr_p_250`；警政署「拖吊保管場」[7319](https://data.gov.tw/dataset/7319)（89 筆）；食藥署「常見濫用管制藥品」[6944](https://data.gov.tw/dataset/6944)（反毒衛教）；疾管署「抗蛇毒血清儲備醫院」（428 筆含座標，但 `od.cdc.gov.tw` 封鎖資料中心，見 §5）；防空疏散避難設施（各縣市分散，見 §6）。

---

## 2. 反詐、反毒、治安專章

### 2.1 反詐騙

#### 現況
- 本站已有：`emergency-hotlines` 收錄 165 專線；新聞有 MyGoPen 事實查核來源；`mohw`／`moi` 官方新聞。**沒有任何可查詢的反詐工具**。

#### 官方開放資料（逐一實測）

| 資料集 | 內容 | 實測結果 | 判斷 |
|---|---|---|---|
| [176455](https://data.gov.tw/dataset/176455) 165 遭停止解析涉詐網站 | 民國年月、網域、網站性質、法律依據、聲請單位 | CSV 10.2 MB、93,839 筆；115/02 起每月 1,346 → 13,947 筆（115/08）；性質以金融保險 50,043、電子商務 26,059、資訊服務 11,701 為主 | **主力來源**。只有「月」的精度，沒有通報日 |
| [165027](https://data.gov.tw/dataset/165027) 數產署詐騙網域停止解析清單 | 偽冒對象（例：「連至 PChome 24H」「假冒藍新科技」）、偽冒網址、網域、建立日、通報日、停止解析日 | JSON 1,734 筆，最新 2026-10-08；**詮釋資料寫 2026-01-29，但內容持續更新** | 補充來源，有「偽冒誰」欄位，適合做說明文字 |
| [160055](https://data.gov.tw/dataset/160055) 165 假投資（博弈）網站 | 網站名稱、網址、件數、統計期間 | 45,258 筆，統計期間只到 2025-12-31；說明已寫明改由 176455 取代 | 只當歷史比對，不要排程 |
| [38262](https://data.gov.tw/dataset/38262) 165 詐騙闢謠專區 | 標題、發佈時間、內容 | 只有 89 則，最新 2025-04-26 | **實質停更**，排除 |
| [172159](https://data.gov.tw/dataset/172159) 打詐儀錶板打擊詐欺成效 | 年、月、查緝集團團數／人數、查扣金額、攔阻金額 | 24 列，113/9–115/8 | 可做趨勢圖 |
| [11198](https://data.gov.tw/dataset/11198) 金管會打詐儀表板 | 日期、本週新增違規投資廣告蒐報件數、累計 | 97 列，最新 2026-10-12（單週 490 件） | 可做趨勢圖；下載網址是 `www.sfb.gov.tw`，正式主機未確認 |
| [98176](https://data.gov.tw/dataset/98176) 電信詐欺犯罪資料 | 案類、發生日期、發生地點 | 每季，最新 115 年 4–6 月（未下載內容逐筆檢查） | 只適合統計，不建議地圖化 |
| [7505](https://data.gov.tw/dataset/7505) 各警察機關新聞發布 | 主旨、發布機關、張貼日、內文 | 1,064 則，最新 2026-10-11，首筆即刑事局打詐新聞 | 新聞來源（Top 15 #4） |
| 法務部、矯正署、廉政署一系列「詐欺罪人數」統計 | 統計表 | — | 與民眾查詢無關，排除 |

#### 非開放資料、但可公開存取的前端 API（不建議當正式依賴）

| 端點 | 實測 | 說明 |
|---|---|---|
| `165dashboard.tw/CIB_DWS_API/api/Dashboard/GetDailyFraudMethodRanking` | ✅ 200，回傳 2026-10-11：當日 492 件、`TotalLosses` 24828.9、前 5 名手法（假網拍 128 件、假投資 54 件、釣魚連結 43 件…） | 從 165 打詐儀錶板前端 bundle 找出約 40 支 API（每日／每月縣市案件、手法排行、新聞跑馬燈、涉詐 LINE／網址清單等）。**沒有文件、沒有授權條款、金額單位未確認（推測萬元）**，隨時可能改版。建議去函刑事局請其上架 data.gov.tw，而非直接爬取 |
| `165.npa.gov.tw/api/article/list/9` | ✅ 856 則，最新 2026-10-14「115/10/13 民眾通報社群平臺涉詐廣告清單」 | 每日更新，但同樣是前端內部 API |
| `165.npa.gov.tw/api/article/subclass/1` | ✅ 「遭通報之境外帳戶（更新至 1151012）」 | 同上 |
| `165.npa.gov.tw/api/lineid/querydata` | ✅ 但最新 2025-04-30 | 詐騙 LINE ID 名單已停更，排除 |

#### 民間來源
- **Cofacts 真的假的**：`https://api.cofacts.tw/graphql` 實測 200，不需金鑰，`ListArticles` 共 274,918 則（最新一則就是「+1(899) 開頭來電是否詐騙」的提問）。完整資料以 Hugging Face [`Cofacts/line-msg-fact-check-tw`](https://huggingface.co/datasets/Cofacts/line-msg-fact-check-tw) 發布，**CC BY-SA 4.0**、需同意條款（自動核准），最後更新 2026-10-11。可做「這段訊息有人查過嗎？」查詢，但 CC BY-SA 的相同方式分享要求需要在頁面標示，且內容是群眾回應，必須清楚標示「非官方」。
- **g0v/fact-check-api**：見 §4；CORS 只允許 `check.vtaiwan.tw` 等白名單，本站不能直接從前端呼叫，要用必須自架，且依賴 OpenRouter 金鑰。

#### 建議做法（詐騙網址查詢，Top 15 #1＋#15）
1. 每日同步 176455＋165027 到一張表，**UNIQUE KEY 只用正規化後的網域**（不要含月份，見 [09](../domains/09-database-data-integrity.md) 的時間欄位膨脹教訓），保留「首次出現月份」「性質」「偽冒對象」。目前約 9.5 萬筆、每月增加約 1 萬筆。
2. 查詢只做網域比對（含子網域、去 `www.`）。**「查無資料」必須寫成「尚未列入停止解析名單，不代表安全，請撥 165 查證」**，避免變成「安全認證」。
3. 工具頁儀表區用 172159（每月攔阻金額）＋11198（每週違規投資廣告）畫趨勢；不放首頁狀態列（狀態列定位是天氣、空品、地震類即時資訊）。
4. 分類：不新增第 8 類（會推翻決策 #1），放「防災與示警」，並在「家有長輩」hub 加一步（長者是假投資、假檢警的主要受害族群）。

### 2.2 反毒

#### 現況
- 本站沒有任何戒癮資源工具。`mental-health`、`smoking-cessation` 是最接近的同類工具。
- **附帶發現（需人工確認）**：`data/government-hotlines.json` 第 509 行與 `data/taiwan-hotlines.csv` 第 47 行把「毒品防制諮詢專線」寫成 **0800-024-555**。搜尋不到任何官方來源有這個號碼；法務部與衛福部公告的全國戒毒專線是 **0800-770-885（請請你幫幫我）**，24 小時免付費、由各地毒防中心接聽（[衛福部](https://www.mohw.gov.tw/cp-2704-25470-1.html)、[法務部反毒大本營](https://antidrug.moj.gov.tw/dl-200-42022fe5-5214-4fa1-a368-0719207c64b8.html)）。緊急電話頁上的號碼若錯誤，影響比任何新功能都大，建議優先查證修正（本文不改程式）。

#### 資料集

| 資料集 | 實測 | 判斷 |
|---|---|---|
| [133353](https://data.gov.tw/dataset/133353) 各縣市指定藥癮戒治機構及替代治療機構及非鴉片類藥癮治療補助機構（`data.taipei`，臺北市立聯合醫院上架） | ✅ 216 家、22 縣市；欄位：縣市、機構名稱、電話、地址、戒治機構模式（戒治醫院 104、替代治療衛生所 41、診所 27、核心醫院 25…）、服務內容（丁基原啡因 126、美沙冬 122、跨區給藥 63） | **主力**。雖然掛在臺北市平台，內容是全國。無座標，216 筆可走 TGOS 或用機構名稱比對健保院所座標 |
| [133345](https://data.gov.tw/dataset/133345) 美沙冬跨區給藥服務機構清單 | ✅ 65 家，含平日／假日給藥時間、轉入掛號費、跨區服務費 | 併入同一工具，替代治療個案出差、返鄉時最需要 |
| 縣市版（桃園 [142681](https://data.gov.tw/dataset/142681)、臺北 [133359](https://data.gov.tw/dataset/133359)、高雄 [87718](https://data.gov.tw/dataset/87718)、彰化、南投、雲林、花蓮、新竹縣、嘉義市…） | 桃園實測 ✅，但編碼是 **cp950**；雲林、花蓮版停在 2021–2022 | 與全國版重複，不另外接 |
| [10091](https://data.gov.tw/dataset/10091)／[13717](https://data.gov.tw/dataset/13717) 各地毒品危害防制中心聯絡資訊（法務部） | 22 筆；詮釋資料 2023–2024 | 聯絡資訊可做靜態種子，需人工核對（矯正署資料也提醒各版本地址有出入） |
| [6944](https://data.gov.tw/dataset/6944) 常見濫用管制藥品資料集（食藥署） | ✅ 23 項，含俗名（如海洛因「四號、白粉」）、分級、濫用方式、危害說明、圖片 | 衛教內容，家長辨識用；每月更新 |
| [57268](https://data.gov.tw/dataset/57268) 毒品犯罪資料（警政署） | 每季，含毒品品項、淨重、發生地點 | 只做統計；**不建議地圖化**（見 §2.3） |
| 酒癮治療機構 | 只有臺北、新北、高雄、苗栗、南投、花蓮等縣市版 | 全國版未找到（未確認） |
| `antidrug.moj.gov.tw`（反毒大本營） | 首頁是 JS 裝置偵測轉址，RSS 路徑回 302 | 是否有可用的新聞 feed 未確認 |

#### 建議做法（Top 15 #3）
- 新工具「藥癮戒治與替代治療地圖」放「就醫與用藥」，和 `mental-health`、`smoking-cessation` 互相連結。
- 頁首固定顯示 0800-770-885 與所在縣市毒防中心；地圖可依「美沙冬／丁基原啡因／跨區給藥」篩選；跨區給藥機構顯示給藥時段。
- 加一個「常見濫用藥物辨識」區塊（6944），用 `<details>` 收合。
- 語氣以「求助」為主，不使用「毒蟲」等污名用語。

### 2.3 治安與犯罪預防

| 資料集 | 實測 | 判斷 |
|---|---|---|
| [14200](https://data.gov.tw/dataset/14200) 犯罪資料（毒品、強盜、搶奪、住宅竊盜、汽機車竊盜、強制性交、組織犯罪） | ✅ 每季，最新 115 年 4–6 月；114 年 7–9 月 9,474 筆中毒品占 6,927；精度到**鄉鎮市區＋日期** | **不建議做「治安地圖」或鄉鎮排名**：①官方註明為初步統計；②單季單鄉鎮常只有個位數，排名雜訊大；③「毒品」占七成且反映查緝量而非風險；④容易對特定社區造成污名。若要用，只做縣市層級年度趨勢 |
| [13166](https://data.gov.tw/dataset/13166) 犯罪資料統計數據（每週發生／破獲） | ZIP，詮釋資料 2026-10-12 | 同上，只適合統計 |
| [5958](https://data.gov.tw/dataset/5958) 警察局暨分駐派出所地址 | ✅ 1,686 筆，TWD97 | **建議**（Top 15 #10）：婦幼安全、迷路、報案都用得到 |
| [7317](https://data.gov.tw/dataset/7317) 失物招領網路公告 | ✅ 88,278 筆，每日 | **建議**（Top 15 #9）；拾得人姓名在 [7318](https://data.gov.tw/dataset/7318)，不要接 7318 |
| [12818](https://data.gov.tw/dataset/12818) A1 交通事故（含經緯度、天候、道路型態） | ✅ 2,843 筆（2026 年），最新事故 2026-10-05 | **建議**（Top 15 #11）：路口層級聚合後呈現，不顯示個別事故細節 |
| [7320](https://data.gov.tw/dataset/7320) 測速執法設置點 | ✅ 1,894 點，含經緯度、速限、方向 | 次要；民眾需求高但與「健康生活」主軸較遠 |
| [7319](https://data.gov.tw/dataset/7319) 拖吊保管場 | ✅ 89 筆 | 次要 |
| [11307](https://data.gov.tw/dataset/11307) 集會遊行資訊 | 詮釋資料每日（未下載內容） | 次要，可作為交通影響提示 |
| [14420](https://data.gov.tw/dataset/14420) 失蹤人口查尋 | ✅ 100 筆，最新 2026-10-13，含部分遮蔽姓名、照片、衣著 | **排除**：個資敏感，轉載後無法同步撤下（尋獲後官方會下架，本站快取可能沒有） |
| [6247](https://data.gov.tw/dataset/6247) 婦幼安全警示地點 | — | 已由 `child-safety-spots` 覆蓋 |
| 防空疏散避難設施 | data.gov.tw 上約 132 個資料集，**依縣市與警察機關分散**；警政署地圖 `adr.npa.gov.tw/adr-web/Map_Shelter.html` 未找到公開資料端點 | 高價值（全民安全指引、`emergency-supplies` 已提到「警政服務 App 可查防空避難設施」），但全國彙整來源未確認，見 §6 |

---

## 3. 逐平台盤點表

「已覆蓋」= 本站已在用；「新候選」= 本次找到、尚未使用。

| 平台 | 已覆蓋 | 新候選 | 驗證狀態 | 引用 |
|---|---|---|---|---|
| 165.npa.gov.tw（165 全民防騙網） | 只有 165 專線號碼 | 停止解析網站（經 data.gov.tw）、前端 API（每日社群涉詐廣告清單、境外帳戶） | ✅ 首頁 200；Angular SPA，前端 API 不需登入 | <https://165.npa.gov.tw/> |
| 165dashboard.tw（165 打詐儀錶板） | 無 | 每日案件數、損失、手法排行（前端 API） | ✅ 200；**無官方 API 文件**（未確認是否有正式 API） | <https://165dashboard.tw/> |
| opendata.wra.gov.tw | 水庫、水位 4 個端點 | 無新增（沿用 9/14 結論） | ✅ 200 | 9/14 文件 §1.1 |
| iot.wra.gov.tw | 淹水感測、河川水位（`inundation-map`） | 無新增；9/14 的 E1/N3 已在 #327 落地 | ✅ 200 | 9/14 文件 §1.2、[07](../domains/07-tools-disaster-environment-energy.md) |
| data.moenv.gov.tw | AQI、AQX、公廁、清潔隊、環保標章、室內空品、碳足跡 | 機車排氣定檢站 `mpi_s_01`（含座標、今日營業）、全國維修地圖 `wr_p_250`；9/14 的噪音、自來水水質仍未做 | ✅ 兩個新端點實打 200 | <https://data.moenv.gov.tw/api/v2/mpi_s_01>、`wr_p_250` |
| service.moea.gov.tw/EE501 | — | 無（統計儀表板，沿用 9/14 結論） | ✅ 200 | 9/14 文件 §1.4 |
| data.gov.tw | 多數既有來源的索引 | 本文 Top 15 的 #1–#7、#9–#11、#15 | ✅ 完整目錄 CSV 可下載；`/api/v2/rest/dataset/{id}` 可查單一資料集 | <https://data.gov.tw/datasets/export/csv> |
| opendata.taichung.gov.tw（API 在 `newdatacenter.taichung.gov.tw`） | 無 | 垃圾清運及資源回收車動態（每 10 分鐘） | ✅ 200，JSON；正式主機未確認 | [83558](https://data.gov.tw/dataset/83558) |
| data.tainan.gov.tw（API 在 `soa.tainan.gov.tw`） | 無 | 垃圾車 GPS；詐欺、毒品案件統計（僅統計） | ✅ 垃圾車 200；正式主機未確認 | [136310](https://data.gov.tw/dataset/136310) |
| data.taipei | 捷運營運公告（`metro-alerts`，已於 2026-10-21 隨 #728 移除）等 | 垃圾車點位路線（含抵達時間）、藥癮名單（全國版）、美沙冬跨區給藥；水質監測（15 分鐘）、環境輻射（5 分鐘）僅限臺北 | ✅ 200 | [136515](https://data.gov.tw/dataset/136515)、[133353](https://data.gov.tw/dataset/133353) |
| data.ntpc.gov.tw | 部分設施 | 垃圾車即時位置（每 2 分鐘）＋路線；衛生局約 120 個 2026 年有更新的資料集多為新北限定（泳池／溫泉水質、流感抗病毒藥劑合約院所、月子餐機構…） | ✅ 垃圾車 200 | [122972](https://data.gov.tw/dataset/122972)、[125664](https://data.gov.tw/dataset/125664) |
| data.moa.gov.tw | 病蟲害、動物醫院、認養、土石流（`disaster-map` 圖層）、農藥殘留 | 林火風險、果菜批發行情；寵物遺失啟事（**含飼主電話與 Email，不建議轉載個資**） | ✅ 三支皆 200 | <https://data.moa.gov.tw/openapi.json> |
| data.kcg.gov.tw（API 在 `openapi.kcg.gov.tw`） | 無 | 垃圾車動態；垃圾車到點時間預估（[117726](https://data.gov.tw/dataset/117726)，未實打）；毒防局社區關懷站 | ✅ 垃圾車 200；正式主機未確認 | [138256](https://data.gov.tw/dataset/138256) |
| opendata.tycg.gov.tw | 部分設施 | 藥癮戒治名單（縣市版，與全國版重複）；未找到垃圾車資料集 | ✅ 200，**CSV 為 cp950 編碼** | [142681](https://data.gov.tw/dataset/142681) |
| tdx.transportdata.tw（只補 basic 以外） | basic 已研究 | **歷史服務「道安 v1」**：A1／A2 事故主檔與當事人檔、`/TrafficAccident/Rank/{City}` 易肇事路口排行；進階服務「空間查詢-POI v3」「地理編碼轉換 v2」（geocoder 候選）；MaaS 旅運規劃 | ⚠️ 只取得 swagger，未帶 token 實打 | `https://tdx.transportdata.tw/webapi/File/Swagger/V3/3340067e-2167-4273-843f-2612c076f40f` |
| data.cdc.gov.tw（CKAN，檔案在 `od.cdc.gov.tw`） | `travel-epidemic-alerts` 用 2 個資料集 | 抗蛇毒血清儲備醫院（428 筆含座標）、旅遊醫學門診（含 M 痘疫苗）、RODS 類流感急診週資料（更新到 2026 第 40 週） | ✅ 從台灣 ISP 可達；**正式主機與 GitHub runner 已知被封鎖** | <https://data.cdc.gov.tw/api/3/action/package_search> |
| water.gov.tw OpenData | 停水（`water-outages`）、台水新聞 | 鄉鎮別用戶水質（總硬度等）、給水系統水質；輔導合格清洗水塔業者（僅 13 家） | ✅ 200 | <https://www.water.gov.tw/opendata/qual5.csv> |
| metro.taipei 開放資料（經 data.taipei） | 營運公告 | 車站無障礙設施、出入口、各站分時進出量（可估擁擠時段）、置物櫃 | 詮釋資料 2026-10-13（未逐一下載） | [128416](https://data.gov.tw/dataset/128416)、[128506](https://data.gov.tw/dataset/128506) |
| scidm.nchc.org.tw | 無 | 無：最新上架多為學術期刊與衛星影像，CKAN 中文搜尋失準 | ✅ API 200（32,067 筆） | <https://scidm.nchc.org.tw/api/3/action/package_search> |
| 衛福部 opendata／護理及健康照護司 | 長照 GIS（`long-term-care`） | 全國開業護理機構清冊（產後護理之家） | ✅ 200（`nhplatform.mohw.gov.tw`，正式主機未確認） | [115950](https://data.gov.tw/dataset/115950) |
| data.fda.gov.tw | 藥品、營養成分、業者登錄、健康食品、藥局 | 違規廣告 4 集、藥品短缺、回收藥品、不合格食品、安全週報、濫用管制藥品 | ✅ 全部 200 | <https://data.fda.gov.tw/swagger-ui/index.html> |
| apiservice.mol.gov.tw（勞動部） | 健檢機構、職業傷病醫院 | 違反勞動法令事業單位（勞基法、性平、職安）、重大職災 | 詮釋資料每日（未下載內容） | [109896](https://data.gov.tw/dataset/109896)、[126835](https://data.gov.tw/dataset/126835) |

**bigdata.wp.shu.edu.tw 清單上的其他入口**（2026-10-14 實測）：

| 入口 | 狀態 | 說明 |
|---|---|---|
| data.tycg.gov.tw、data.taichung.gov.tw、data.nantou.gov.tw、data.moi.gov.tw、data.coa.gov.tw、opendata.epa.gov.tw | **DNS 已不存在** | 已改名為 opendata.tycg、opendata.taichung、（南投改用 data.gov.tw 掛載）、opdadm.moi、data.moa、data.moenv |
| **data.hpa.gov.tw、data.nhi.gov.tw** | **DNS 已不存在** | 9/14 文件 N8、R1 建議「後續確認」的兩個平台**實際上已不存在**，可結案。健保署現行資料在 `info.nhi.gov.tw/api/iode0000s01/Dataset?rId=…`，但 `nhi.gov.tw` 封鎖資料中心 IP |
| data.hakka.gov.tw | 404 | 本站伯公照護站另有來源 |
| www.fnp.gov.tw/opendata | 404 | 國有財產，與本站無關 |
| theme.npm.edu.tw/opendata | 轉址後 403 | 故宮，與本站無關 |
| opendata.e-land.gov.tw、data.chiayi.gov.tw、opendata.penghu.gov.tw、data.kinmen.gov.tw | 200 | 縣市版資料多已匯入 data.gov.tw，本次未找到全國版沒有的高價值項目 |
| opendata.culture.tw | 200 | `cultural-events` 已用文化部資料 |
| data.ly.gov.tw | 200 | 立法院，與本站主軸無關 |
| alerts.ncdr.nat.gov.tw | 200 | 已覆蓋（待辦 D-1 前端分頁仍未做） |
| www.npa.gov.tw | 200 | 已覆蓋（婦幼安全警示地點），本次新增派出所、失物招領、事故等 |
| Data.gov、Data USA、data.gov.uk、EU open data | — | 國外，不適用 |

---

## 4. g0v 可重用專案

以 `gh api orgs/g0v/repos` 取得全部 524 個 repo（2026-10-14），篩出最後推送在 2024-10-14 之後（2 年內）的 73 個，再挑出「提供資料、API 或爬蟲」且與本站相關的。超過 2 年未更新標為「停滯」。

| Repo | 用途 | 最後推送 | 授權 | 可重用在 | 狀態 |
|---|---|---|---|---|---|
| [fact-check-api](https://github.com/g0v/fact-check-api) | 事實查核 API（Cloudflare Workers），整合 Cofacts GraphQL 與 LLM | 2026-10-04 | MIT | 反詐查核；**CORS 只允許 `check.vtaiwan.tw` 等白名單**，要用須自架並自備 OpenRouter 金鑰 | 開發中（README 寫「初期」） |
| [fact-check-core](https://github.com/g0v/fact-check-core) | 上者的核心流程 | 2026-09-16 | 未標示 | 同上 | 開發中 |
| [community-calendar](https://github.com/g0v/community-calendar) | g0v 社群活動結構化資料與 ICS 訂閱（`all.ics`、`jothon.ics`） | 2026-10-12 | MIT | `cultural-events` 目前抓 `g0v.tw/event` 網頁，可改吃 ICS；`all.ics` 註明「未經審核」，建議只用 `jothon.ics` | 活躍 |
| [amis-moedict](https://github.com/g0v/amis-moedict) | 阿美語萌典 | 2026-10-13 | 未明確（NOASSERTION） | `child-native-languages` 擴充原住民族語；授權需先確認 | 活躍 |
| [moedict-data](https://github.com/g0v/moedict-data) | 教育部重編國語辭典資料 | 2026-07-11 | 未明確 | 新聞斷詞／關鍵字補強（低優先） | 活躍 |
| [moedict-data-twblg](https://github.com/g0v/moedict-data-twblg)、[moedict-data-hakka](https://github.com/g0v/moedict-data-hakka) | 閩南語、客語辭典資料 | 2023-05-02、2023-02-23 | — | **本站 `child-native-languages` 正在用** | **停滯**（辭典內容本身變動少，可接受，但上游修正不會再來） |
| [tdx7984](https://github.com/g0v/tdx7984) | TDX 公車 API 再包裝成 GeoJSON | 2026-03-02 | GPL-3.0 | 參考用；本站已有 TDX 整合，GPL 不宜直接併入 | 低度維護 |
| [tw-rental-house-data](https://github.com/g0v/tw-rental-house-data) | 租屋資料爬蟲 | 2026-10-08 | MIT | 與本站主軸無關 | 活躍 |
| [people-in-news](https://github.com/g0v/people-in-news) | 公眾人物新聞追蹤 | 2025-08-24 | 未標示 | 無 | 低度維護 |
| [laweasyread-front](https://github.com/g0v/laweasyread-front) | 法規閱讀瀏覽器擴充 | 2025-06-01 | — | 無 | 低度維護 |
| [g0v-hackathon-manual](https://github.com/g0v/g0v-hackathon-manual) | 歷屆黑客松提案資料庫 | 2026-04-02 | — | 找可合作的公民科技專案 | 活躍 |
| [vaccinate](https://github.com/g0v/vaccinate)、[covid-19-data](https://github.com/g0v/covid-19-data)、[covid19-data-list](https://github.com/g0v/covid19-data-list) | COVID 相關 | 2021–2022 | — | 無 | **停滯**（9/14 已列） |
| （g0v 衍生，非 g0v org）[cofacts/opendata](https://github.com/cofacts/opendata) | Cofacts 資料產生程式；資料在 Hugging Face | 2026-10-11 | 程式 MIT；資料 CC BY-SA 4.0 | 反詐查核（§2.1） | 活躍 |

其餘 2 年內有更新的 repo 多為 vTaiwan、Summit、萌典網站前端、揪松團活動頁等，不提供本站可重用的資料或 API。

---

## 5. 排除清單與理由

| 項目 | 理由 |
|---|---|
| 165 詐騙闢謠專區 [38262](https://data.gov.tw/dataset/38262) | 只有 89 則、最新 2025-04-26，詮釋資料日期誤導 |
| 165 假投資（博弈）網站 [160055](https://data.gov.tw/dataset/160055) | 已由 176455 取代，統計只到 2025-12-31 |
| 165 詐騙 LINE ID（前端 API） | 最新 2025-04-30，停更 |
| 165 打詐儀錶板前端 API（當正式來源） | 無文件、無授權條款、單位不明；只建議去函請其上架開放資料 |
| 失蹤人口查尋 [14420](https://data.gov.tw/dataset/14420) | 個資敏感，尋獲下架後本站快取無法保證同步 |
| 警察機關拾得人領取 [7318](https://data.gov.tw/dataset/7318) | 含拾得人姓名，不需要 |
| 農業部寵物遺失啟事 `PetLoseList` | 含飼主手機與 Email；若要做只能連回官方頁，不轉載聯絡資料 |
| 犯罪資料鄉鎮地圖或排名（[14200](https://data.gov.tw/dataset/14200)、[57268](https://data.gov.tw/dataset/57268)） | 初步統計、樣本小、反映查緝量、易造成社區污名 |
| `od.cdc.gov.tw` 全部檔案（RODS／健保類流感與腸病毒週資料、旅遊醫學門診、抗蛇毒血清、登革熱 NS1 院所） | **IP 封鎖**：只允許台灣 ISP，正式主機與 GitHub runner 都逾時；已因此移除登革熱地圖，不重新引入每日依賴。例外：抗蛇毒血清、旅遊醫學門診屬年更名冊，若使用者同意可人工更新種子檔（需另行決定） |
| `info.nhi.gov.tw` 開放資料 API | `nhi.gov.tw` 封鎖資料中心 IP（已知） |
| data.hpa.gov.tw、data.nhi.gov.tw | 網域已不存在（9/14 待辦 N8、R1 可結案） |
| scidm.nchc.org.tw | 以學術研究資料為主，無民生即時資料 |
| service.moea.gov.tw/EE501 | 統計儀表板（沿用 9/14 結論） |
| 法務部、矯正署、廉政署各類犯罪人數統計與研究報告 | 對民眾查詢無直接用途 |
| 金融聯徵中心、NCCC 信用卡詐欺統計 | 統計彙總，無查詢用途 |
| 縣市版藥癮名單、縣市版防空避難（作為單獨來源） | 與全國版重複，或只覆蓋單一縣市 |
| 新北市衛生局約 120 個資料集 | 9/14 的 N7 礦區本次已展開：多數是新北限定名冊，全國版已有對應（藥局、AED、長照、母嬰親善）；不單獨接 |
| 測速執法、集會遊行 | 不排除但列次要：與「健康生活」主軸較遠 |
| 臺北捷運分時進出量、置物櫃 | 僅臺北，且 2.0 已決定（T4）把 `metro-alerts` 改接 TDX 全台軌道（後續於 2026-10-21 改為整個移除，#728） |

---

## 6. 未確認事項

1. **正式主機可達性**：下列主機本站從未使用，資料中心 IP 能否連線未確認：`nhplatform.mohw.gov.tw`（產後護理之家）、`newdatacenter.taichung.gov.tw`、`soa.tainan.gov.tw`、`openapi.kcg.gov.tw`、`www.sfb.gov.tw`、`165.npa.gov.tw`、`165dashboard.tw`、`api.cofacts.tw`、`www.tgos.tw`（派出所 ZIP）。動工前用既有 egress probe 從正式主機各打一次。
2. **TDX 道安 API**：`/v1/TrafficAccident/Rank/{CityCode}/DateFilter/{DateFilter}` 只確認存在於 swagger，未帶 token 實打；`DateFilter` 格式、回傳欄位、是否含座標皆未確認。
3. **165 打詐儀錶板**：是否有正式 API 或計畫上架 data.gov.tw；`TotalLosses` 單位（推測萬元）。
4. **藥癮戒治名單的更新日**：`data.taipei` 詮釋資料每日刷新，無法得知內容實際更新日；檔案內沒有版本日期欄位。
5. **「非鴉片類藥癮治療補助機構」**：133353 標題有列，但「戒治機構模式」欄位只見戒治／替代治療類別，是否涵蓋非鴉片類補助機構未確認。
6. **全國酒癮治療機構名單**：只找到縣市版。
7. **防空疏散避難設施全國彙整**：data.gov.tw 上約 132 個縣市／警察機關資料集，格式不一（CSV、ODS、XLSX、JSON）；警政署地圖頁的資料端點未找到。是否有全國單一來源未確認。
8. **毒品防制諮詢專線號碼**：`data/government-hotlines.json` 與 `data/taiwan-hotlines.csv` 的 0800-024-555 查無官方來源，官方公告為 0800-770-885；需人工查證後修正。
9. **電信詐欺犯罪資料 [98176](https://data.gov.tw/dataset/98176)** 的「發生地點」精度（縣市或鄉鎮）未逐筆檢查。
10. **勞動部違反勞動法令事業單位**、**集會遊行資訊**、**捷運車站無障礙設施**：只看詮釋資料，未下載內容。
11. **反毒大本營** `antidrug.moj.gov.tw`：是否有 RSS 或開放資料 feed 未確認（RSS 路徑回 302）。
12. **高雄垃圾車到點時間預估 [117726](https://data.gov.tw/dataset/117726)**：未實打。
13. **amis-moedict 授權**：GitHub 顯示 NOASSERTION，擴充原住民族語前需確認。
14. **環境部 API 金鑰**：data.gov.tw 目錄中的 `data.moenv.gov.tw` 下載網址夾帶公開示範金鑰；本站既有程式如何帶金鑰未查（未讀 `.env`），新端點沿用既有做法即可。
