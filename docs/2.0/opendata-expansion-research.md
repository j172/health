# 開放資料擴充盤點：還有哪些資料能變成民眾用得到的服務（2.0 候選）

- **日期**：2026-10-14（2026-10-23 增訂：台電維生管線災情 44799、即時發電 8931 線上除錯、政府新聞 200 筆檢驗；2026-10-24 增訂：CBS 細胞廣播 cbs.tw、水保署土石流警戒 UnitId=018、教育部性平網澄清公文過濾落地 #806，確立台電 44799 與海纜動態通訊燈號優先序，重構 Top 10 待實作清單）
- **性質**：研究與擴充規格文件。
- **2026-10-24 複查更新**：下文第 1、2 節已完整標註落地狀態：PR #806 已正式落地**災防細胞廣播（CBS）**、**水保署土石流警戒**與**教育部性平網闢謠新聞**；PR #807 已落地**幼兒園與兒少裁罰友站及情境導流**；本機已完成**台電 8931 UTF-8 BOM 修正**與**能源署 set_id=55 標頭漂移修正**。依據 2026-10-24 決策會議，將**台電 44799 即時停電災情地圖**（開闢新工具 `/tools/power-outages`）與**台灣海纜動態地圖通訊韌性燈號**（嵌入災防維生情境與全站橫幅連動）列為最優先（Top 1 & Top 2）。重構**第 7 節：尚未實做 Top 10（2026-10-24 排程）**，並收斂 §6 未確認事項。
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
   - 本站程式**已經在用**的主機（`opdadm.moi.gov.tw`、`data.fda.gov.tw`、`data.taipei`、`data.ntpc.gov.tw`、`apiservice.mol.gov.tw`、`data.moa.gov.tw`、`data.moenv.gov.tw`、`www.water.gov.tw`、`opendata.tycg.gov.tw`、`tdx.transportdata.tw`、`service.taipower.com.tw`）→ 視為可達。
   - 其餘主機一律標「**正式主機未確認**」。已知封鎖資料中心 IP 的有 `od.cdc.gov.tw`（見 [07](../domains/07-tools-disaster-environment-energy.md) 登革熱移除決策）與 `nhi.gov.tw`。
4. **線上實測異常檢驗（2026-10-23 增補）**：即使主機可達且程式已上線，仍必須核對線上實際 API 回傳（如 `/api/power-grid-overview` 實測發現台電 8931 因 UTF-8 BOM 導致解析崩潰為空，見 §2.4）。拿不到、或只看得到詮釋資料的項目，一律寫「未確認」。
5. **全臺中央與地方開放資料母體盤點基線**：除了全國入口目錄（`data.gov.tw`）外，本研究補入引用開源社群整理之 `onlinemad/awesome-opendata-taiwan-gov`（臺灣政府開放資料清冊）與 `odportal.tw`（臺灣開放資料平臺彙整）作為母體盤點基線，全面涵蓋中央各部會、六都與非六都縣市共 25 大開放資料平臺（母體合計逾 15 萬筆資料集），辨析中央與地方資料集匯流機制與專屬 API 邊界。

---

## 1. 摘要：Top 15 建議新增

分類欄對應 master-plan §4.1 的 7 分類（健康自我評估／就醫與用藥／長照與社會福利／婦幼與家庭／防災與示警／環境與食品安全／交通、生活與文化）。驗證結果欄的數字皆為實際下載與實測數據。

| # | 服務名稱 | 資料來源 | 落點 | 更新頻率 | 驗證結果 |
|---|---|---|---|---|---|
| 1 | **詐騙網址查詢**（貼上網址，比對是否已遭停止解析） | 警政署「165 遭停止解析涉詐網站」[data.gov.tw/176455](https://data.gov.tw/dataset/176455)＋數產署「詐騙網域停止解析清單」[165027](https://data.gov.tw/dataset/165027) | 新工具（防災與示警） | 不定期，實際約每月一批；數產署版近乎每日 | ✅ 93,839 筆，最新 115 年 9 月（單月 1.0–1.4 萬筆）；數產署 1,734 筆，最新停止解析日 2026-10-08 |
| 2 | **違規健康廣告查詢**（食品／藥品／化粧品／醫材） | 食藥署 [6949](https://data.gov.tw/dataset/6949)、[14196](https://data.gov.tw/dataset/14196)、[14198](https://data.gov.tw/dataset/14198)、[14197](https://data.gov.tw/dataset/14197) | 新工具（環境與食品安全） | 每 7 日 | ✅ 食品 60,773、化粧品 30,369、醫材 5,890、藥品 4,003 筆；最新處分日 2026-09-18～09-24 |
| 3 | **藥癮戒治與替代治療機構地圖** | 衛福部名單（臺北市立聯合醫院轉載）[133353](https://data.gov.tw/dataset/133353)＋美沙冬跨區給藥 [133345](https://data.gov.tw/dataset/133345) | 新工具（就醫與用藥） | 不定期 | ✅ 216 家、涵蓋 22 縣市；跨區給藥 65 家含給藥時段與費用。**無座標**，需 geocode |
| 4 | **警察機關新聞**（含刑事局打詐新聞稿） | 警政署「各警察機關新聞發布」[7505](https://data.gov.tw/dataset/7505) | 新聞來源（官方） | 每日 | ✅ 1,064 則，最新 2026-10-23 持續更新；含全文，為官方新聞 200 筆檢索中最核心之全國來源（見 §2.5） |
| 5 | **即時停電災情與修復進度**（台電維生管線地圖） | 台電「電力維生管線災情資訊」[44799](https://data.gov.tw/dataset/44799)（XML/KML，代碼 `d006012`） | 新工具（防災與示警），與 `water-outages`、`power-grid-overview` 導流互連 | 災害每小時，平時檢修即時 | ✅ 2026-10-23 實測 200（1.05 MB），自帶行政區、停電村里、影響戶數、預計修復時間、1911 聯絡人，**內建村里停電邊界多邊形座標（`<Polygon>`）**，見 §2.4 |
| 6 | **藥品短缺與回收** | 食藥署「經評估有／無替代藥品」[54504](https://data.gov.tw/dataset/54504)／[54505](https://data.gov.tw/dataset/54505)、「回收藥品」[6947](https://data.gov.tw/dataset/6947) | 併入 `drugs` | 每 7 日／不定期 | ✅ 短缺 237 項（最新 2026-09-18）、無替代 0 項、回收 1,713 筆（最新 2026-08-26） |
| 7 | **邊境查驗不合格食品** | 食藥署「不符合食品資訊」[6133](https://data.gov.tw/dataset/6133) | 併入 `food-safety` | 每 7 日 | ✅ 2,625 筆，最新發布 2026-10-06 |
| 8 | **產後護理之家地圖**（含評鑑結果、床數） | 衛福部「全國開業護理機構清冊」[115950](https://data.gov.tw/dataset/115950) | 新工具（婦幼與家庭）；一般護理之家／居家護理所補進 `long-term-care` | 每年 | ✅ 1,494 家（產後護理 241、一般護理之家 501、居家護理所 752），**自帶 WGS84 座標**；正式主機未確認（`nhplatform.mohw.gov.tw`） |
| 9 | **垃圾車即時位置與清運點** | 臺北 [136515](https://data.gov.tw/dataset/136515)、新北 [122972](https://data.gov.tw/dataset/122972)／[125664](https://data.gov.tw/dataset/125664)、臺中 [83558](https://data.gov.tw/dataset/83558)、臺南 [136310](https://data.gov.tw/dataset/136310)、高雄 [138256](https://data.gov.tw/dataset/138256) | 併入 `cleaning-squads`（升級為「垃圾車與清潔隊」） | 2–10 分鐘（即時位置）／每日（路線） | ✅ 6 個端點皆 200；臺北含抵達／離開時間與座標，新北路線含每週收運日 |
| 10 | **警察局失物招領查詢** | 警政署 [7317](https://data.gov.tw/dataset/7317) | 新工具（交通、生活與文化） | 每日 | ✅ 88,278 筆，含 2026-10-13 拾得物；含拾得地點、受理派出所 |
| 11 | **最近的派出所** | 警政署「警察局暨分駐派出所地址」[5958](https://data.gov.tw/dataset/5958) | 「我附近」更多類型＋`child-safety-spots` 互連 | 不定期 | ✅ 1,686 筆（115/09/30 版），座標為 **TWD97** 需轉換 |
| 12 | **交通事故熱點／易肇事路口** | 警政署 A1 即時 [12818](https://data.gov.tw/dataset/12818)、A2 [13139](https://data.gov.tw/dataset/13139)；TDX 歷史服務「道安 v1」`/TrafficAccident/Rank` | 新工具（交通、生活與文化） | 不定期（A1 檔內標「資料提供日期 115 年 10 月 12 日」）；A2 每月 | ✅ A1：2026 年 2,843 筆、最新事故 2026-10-05、含經緯度；⚠️ TDX 端點只確認存在於 swagger，未帶 token 實打 |
| 13 | **森林遊樂區林火風險** | 農業部 `/api/v1/ForestFireAlertWCF/` | 併入 `outdoor-safety` | 每日 | ✅ 回傳當日各國家森林遊樂區警戒等級（安全／注意…） |
| 14 | **果菜批發行情（今日菜價）** | 農業部 `/api/v1/AgriProductsTransType/` | 新工具（交通、生活與文化） | 每日（休市日除外） | ✅ 回傳 115.10.13 各市場上／中／下價與交易量 |
| 15 | **打詐儀表數據**（每月攔阻金額、每週違規投資廣告） | 警政署 [172159](https://data.gov.tw/dataset/172159)、金管會 [11198](https://data.gov.tw/dataset/11198) | 併入 #1 工具頁的儀表區 | 每月／每週 | ✅ 警政署 113/9–115/8 共 24 個月；金管會最新 2026-10-12（累計 118,757 件） |

> [!NOTE] 移出與補登說明
> 1. **原清單第 13 項「自來水水質」**：已於 2026-10 月中旬隨 Track B B-13/B-14（#673 鄉鎮總硬度、#676 淨水場檢驗）正式落地於 `/tools/water-outages#quality`，轉為已完成，騰出名額由台電停電災情 [44799] 補入，維持 Top 15 嚴選規模。
> 2. **台電各機組發電量即時資訊 [8931]**：為既有上線工具 `/tools/power-grid-overview`（代碼 `d006001`）使用之上游端點。經 2026-10-23 線上實測除錯，發現存在 UTF-8 BOM 導致線上實質無資料之重大技術債，歸入 §3 已覆蓋平台補登與緊急修復（見 §2.4），不佔用 Top 15 新增名額。

**次要候選（值得做但優先度較低）**：食藥署「藥物食品安全週報」[11502](https://data.gov.tw/dataset/11502)（每週，新聞來源）；Cofacts 真的假的 GraphQL（反詐查核，見 §2.1）；環境部「機車排氣定檢站」`mpi_s_01`（含座標與「今日營業」註記，我附近）；環境部「全國維修地圖」`wr_p_250`；警政署「拖吊保管場」[7319](https://data.gov.tw/dataset/7319)（89 筆）；食藥署「常見濫用管制藥品」[6944](https://data.gov.tw/dataset/6944)（反毒衛教）；疾管署「抗蛇毒血清儲備醫院」（428 筆含座標，但 `od.cdc.gov.tw` 封鎖資料中心，見 §5）；防空疏散避難設施（各縣市分散，見 §6）。

### Top15 狀態追蹤（2026-10-24 複查更新）

| # | 狀態 | 落地方式 |
|---|---|---|
| 1 | ✅ 已上線 | `anti-fraud` 工具（2026-10-15），連 #15 的打詐儀表來源一併收進 `scientificBasis` |
| 2 | ⬜ 未做 | 見第 7 節（待實作 Top 10 #4，違規健康廣告查詢） |
| 3 | ✅ 已上線 | 併入 `mental-health` 工具「成癮防治」分頁（issue #566/#571），非獨立新工具 |
| 4 | ✅ 已上線 | 新聞來源 `police_7505`（警政署） |
| 5 | ⬜ 未做 | 見第 7 節（待實作 Top 10 #1，台電 44799 即時停電地圖，規劃獨立新工具 `/tools/power-outages`） |
| 6 | ✅ 已上線 | 併入 `drugs` 工具（2026-10-16） |
| 7 | ⬜ 未做 | 見第 7 節（待實作 Top 10 #3，邊境查驗不合格食品，併入 `food-safety`） |
| 8 | ✅ 已上線 | `postpartum-care` 工具；一般護理之家／居家護理所併入 `long-term-care`。來源主機 `nhplatform.mohw.gov.tw` 被封鎖，改手動匯入（#678，見 §6） |
| 9 | ✅ 已上線 | `cleaning-squads` 工具（臺北／新北路線＋新北／臺中即時位置；臺南／高雄即時位置主機被封鎖已放棄，見 §6） |
| 10 | ⬜ 未做 | 見第 7 節（待實作 Top 10 #6，警察局失物招領查詢） |
| 11 | ✅ 已上線 | `/nearby` 派出所類型（issue #677，Track B B-9，手動匯入） |
| 12 | ⬜ 未做 | 見第 7 節（待實作 Top 10 #5，交通事故熱點，以警政署 A1 經緯度路口聚合為主） |
| 13 | ✅ 已上線 | `outdoor-safety` 工具的森林火災風險區塊（B-12/#672） |
| 14 | ⬜ 未做 | 見第 7 節（待實作 Top 10 #7，果菜批發行情） |
| 15 | ✅ 已上線 | 隨 #1 一起進 `anti-fraud` 工具 |

10/15 已上線，5 項未做（#2、#5、#7、#10、#12、#14；註：#5 台電停電替換原自來水硬度完成項，故實質未做項為 6 項，全部納入第 7 節排程）。

---

## 2. 反詐、反毒、治安與能源管線專章

### 2.1 反詐騙

#### 現況
- 本站已有：`emergency-hotlines` 收錄 165 專線；新聞有 MyGoPen 事實查核來源；`mohw`／`moi` 官方新聞。
- **2026-10-22 更新**：下方§2.1建議做法已落地為 `anti-fraud` 工具（2026-10-15 上線，Top15 #1＋#15），以下盤點內容保留原樣作為該工具的設計依據與尚未採用來源的紀錄（例如 Cofacts GraphQL 查證、165 打詐儀錶板前端 API 仍未接）。

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

---

### 2.2 反毒

#### 現況
- 本站原先沒有任何戒癮資源工具，`mental-health`、`smoking-cessation` 是當時最接近的同類工具。
- **2026-10-22 更新**：下方§2.2建議做法已落地——藥癮戒治與替代治療機構地圖併入 `mental-health` 工具的「成癮防治」分頁（issue #566/#571），不是獨立新工具，但涵蓋了 133353＋133345＋毒防中心聯絡資訊。
- **附帶發現已解決**：`data/government-hotlines.json` 與 `data/taiwan-hotlines.csv` 原把「毒品防制諮詢專線」寫成 **0800-024-555**（查無官方來源），已於 PR #577（2026-10-14）修正為正確號碼 **0800-770-885（請請你幫幫我）**，24 小時免付費、由各地毒防中心接聽（[衛福部](https://www.mohw.gov.tw/cp-2704-25470-1.html)、[法務部反毒大本營](https://antidrug.moj.gov.tw/dl-200-42022fe5-5214-4fa1-a368-0719207c64b8.html)），2026-10-22 複查時再次核對過仍正確。

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

---

### 2.3 治安與犯罪預防

| 資料集 | 實測 | 判斷 |
|---|---|---|
| [14200](https://data.gov.tw/dataset/14200) 犯罪資料（毒品、強盜、搶奪、住宅竊盜、汽機車竊盜、強制性交、組織犯罪） | ✅ 每季，最新 115 年 4–6 月；114 年 7–9 月 9,474 筆中毒品占 6,927；精度到**鄉鎮市區＋日期** | **不建議做「治安地圖」或鄉鎮排名**：①官方註明為初步統計；②單季單鄉鎮常只有個位數，排名雜訊大；③「毒品」占七成且反映查緝量而非風險；④容易對特定社區造成污名。若要用，只做縣市層級年度趨勢 |
| [13166](https://data.gov.tw/dataset/13166) 犯罪資料統計數據（每週發生／破獲） | ZIP，詮釋資料 2026-10-12 | 同上，只適合統計 |
| [5958](https://data.gov.tw/dataset/5958) 警察局暨分駐派出所地址 | ✅ 1,686 筆，TWD97 | **建議**（Top 15 #11）：婦幼安全、迷路、報案都用得到 |
| [7317](https://data.gov.tw/dataset/7317) 失物招領網路公告 | ✅ 88,278 筆，每日 | **建議**（Top 15 #10）；拾得人姓名在 [7318](https://data.gov.tw/dataset/7318)，不要接 7318 |
| [12818](https://data.gov.tw/dataset/12818) A1 交通事故（含經緯度、天候、道路型態） | ✅ 2,843 筆（2026 年），最新事故 2026-10-05 | **建議**（Top 15 #12）：路口層級聚合後呈現，不顯示個別事故細節 |
| [7320](https://data.gov.tw/dataset/7320) 測速執法設置點 | ✅ 1,894 點，含經緯度、速限、方向 | 次要；民眾需求高但與「健康生活」主軸較遠 |
| [7319](https://data.gov.tw/dataset/7319) 拖吊保管場 | ✅ 89 筆 | 次要 |
| [11307](https://data.gov.tw/dataset/11307) 集會遊行資訊 | 詮釋資料每日（未下載內容） | 次要，可作為交通影響提示 |
| [14420](https://data.gov.tw/dataset/14420) 失蹤人口查尋 | ✅ 100 筆，最新 2026-10-13，含部分遮蔽姓名、照片、衣著 | **排除**：個資敏感，轉載後無法同步撤下（尋獲後官方會下架，本站快取可能沒有） |
| [6247](https://data.gov.tw/dataset/6247) 婦幼安全警示地點 | — | 已由 `child-safety-spots` 覆蓋 |
| 防空疏散避難設施 | data.gov.tw 上約 132 個資料集，**依縣市與警察機關分散**；警政署地圖 `adr.npa.gov.tw/adr-web/Map_Shelter.html` 未找到公開資料端點 | 高價值（全民安全指引、`emergency-supplies` 已提到「警政服務 App 可查防空避難設施」），但全國彙整來源未確認，見 §6 |

---

### 2.4 維生管線、即時停電災情與電力儀表除錯（台電 44799、8931）

#### 2.4.1 台電停電災情資訊（data.gov.tw 44799 / 代碼 d006012）——Top 15 #5

- **資料集名稱**：台灣電力公司_電力維生管線災情資訊 [data.gov.tw/44799](https://data.gov.tw/dataset/44799)
- **實測端點**：`https://service.taipower.com.tw/data/opendata/apply/file/d006012/001.xml`（備用 KML：`001.kml`）
- **實測結果（2026-10-23）**：HTTP 200，檔案大小約 1.05 MB。
  - 詮釋資料雖然標註「災害每小時更新（平時不更新）」，但實測**平時仍持續更新局部的檢修或跳電災情**（實測當日含嘉義縣朴子市竹村里、臺北市北投區大屯里等即時停電案例）。
  - 資料格式為標準 KML 封裝於 XML，每個 `<Placemark>` 包含：
    - `行政區`（如「嘉義縣朴子市」）
    - `停電區域`（村里，如「竹村里」）
    - `影響戶數`（如「217」）
    - `預計修復時間`（如「2026/10/23 下午 05:00:00」）
    - `聯絡人(姓名)`（「台電公司」）與 `聯絡人(電話一)`（「1911」）
    - `資料更新時間`
    - **內建完整村里空間邊界**：`<MultiGeometry><Polygon><LinearRing><coordinates>`，直接附帶該停電區域的多邊形經緯度坐標！
- **產品落點與價值**：
  - 具備極高的民生防災示警價值。建議作為**新工具（防災與示警）**，並與既有水利署停水地圖（`water-outages`）與電力儀表（`power-grid-overview`）建立雙向交叉導流。
  - 前端地圖可將村里多邊形 Polygon 直接上色（如停電中為半透明紅框），點擊彈窗顯示影響戶數與 1911 直撥按鈕。

#### 2.4.2 台電各機組發電量即時資訊（data.gov.tw 8931 / 代碼 d006001）——線上除錯真相

- **背景**：本站既有上線工具 [`/tools/power-grid-overview`](https://health.j172.tw/tools/power-grid-overview)（全台電力概況儀表板，原規格 `taipower-energy-dashboard.md`）整合了台電即時機組發電量、能源署發電來源配比與核電廠輻射站。
- **線上實測異常（2026-10-23 查證）**：
  使用者回報線上頁面呈現「無資料」。實際 probe 線上 API `/api/power-grid-overview`：
  - `units`：`[]`（0 筆，異常）
  - `mix`：`[]`（0 筆，異常）
  - `radiationStations`：`49 筆`（核電廠周邊輻射監測正常）
- **根因分析**：
  1. **台電 8931（d006001）JSON 帶有 UTF-8 BOM**：
     台電下載端點 `https://service.taipower.com.tw/data/opendata/apply/file/d006001/001.json` 回傳之內容以 `\uFEFF` 開頭。[`lib/server/power/fetchGenerationUnits.ts`](file:///d:/GoogleDrive/health/lib/server/power/fetchGenerationUnits.ts) 內直接執行 `JSON.parse(text)`，未去除 BOM，在 Node.js 中必拋出 `SyntaxError: Unexpected token '﻿', "﻿{\"DateTime"... is not valid JSON`，導致排程同步每次執行皆崩潰，資料庫表 `power_generation_units` 永遠為空。
  2. **能源署 set_id=55 CSV 欄位名稱漂移**：
     能源署端點回傳之最新 CSV 標頭為 `台灣地區電力系統,總裝置容量(數值),配比(%),資料所屬機關`。但 [`lib/server/power/fetchGenerationMix.ts`](file:///d:/GoogleDrive/health/lib/server/power/fetchGenerationMix.ts) 寫死讀取 `row["電力來源"]` 與 `row["總裝置容量(數值,MW)"]`，key mismatch 導致 4 筆全被判定無效濾除。
- **結論與修復狀態**：
  8931 並非未開發，而是上游編碼與欄位漂移造成的線上缺陷。**代碼已於本機修復**：`lib/server/power/fetchGenerationUnits.ts` 加上 `.replace(/^\uFEFF/, "")` 成功剔除 BOM，`lib/server/power/fetchGenerationMix.ts` 支援 `台灣地區電力系統` 與 `總裝置容量(數值)` 雙標頭映射。8931 歸為維護修復，不佔用 Top 15 新增名額。

---

### 2.5 政府「新聞」開放資料集全面檢驗（Page 1 & 2 共 200 筆實測）

針對 data.gov.tw 上以 `fulltext=新聞`（網址參數 `rft=新聞`）檢索的前 200 筆資料集（Page 1 與 Page 2 各 100 筆，2026-10-23 透過後端 API 完整抓取分析），檢驗結果如下：

1. **搜尋引擎命中特徵**：
   data.gov.tw 之全文檢索會搜尋資料集的「聯絡機關」與「發布機關」。因此，地方政府由「新聞處 / 新聞局」代為彙整上架的所有局處業務資料集，全部被檢索命中。
2. **內容性質分佈**：
   - **約 95% 為地方公務業務名冊與統計報表**：包含桃園市政府與新北市政府由新聞單位轉發之「水土保持罰鍰清冊」、「長青學苑名冊」、「土地公告地價」、「游泳池一覽表」、「志工隊資料」等。此類資料集本質為公務統計，**絕非民眾可讀的即時新聞或快訊 feed**，不適合作為新聞來源，一律排除。
   - **少數地方觀光消息**：如「桃園觀光導覽網-最新消息」[151979]，僅涵蓋單一縣市之觀光活動，不符合全國性健康生活主軸。
3. **真正具備即時民生價值之中央官方新聞**：
   - **警政署「各警察機關新聞發布」[7505]**：每日更新，實測 1,064 則全文新聞，首筆即為刑事局最新反詐宣導與打詐案例。在 200 筆檢索結果中，是唯一兼具全國性、每日更新與重大民生警示之官方新聞資料集。**確立維持其在 Top 15 #4 之地位**。
   - 本站既有新聞架構已透過穩定之 RSS/Feed 管道收錄衛福部、疾管署、食藥署、環境部、農業部、消防署、交通部等部會，中央部會新聞版圖已十分穩固。

#### 2.5.1 教育部性別平等全球資訊網（gender.edu.tw）新聞與澄清盤點

針對教育部性平網之兩大主要公佈管道進行內容性質實測與分流評估：

1. **新聞稿及資訊澄清（`m1_03_index`）——✅ 已於 PR #806 正式落地**：
   - **實測內容與落地架構**：針對社會熱議之性平教育法規、教科書課綱爭議、網路常見性平恐慌假訊息進行官方闢謠。已由 `lib/server/news/sources/genderEdu.ts` 實作 Cheerio 爬蟲，以 `DEBUNKING_KEYWORDS` 正則命中闢謠文章，納入 issue #701 事實查核來源，並經由 `tests/gender-edu-news.test.mjs` 測試覆蓋。
2. **即時公告（`m1_01_index`）——判定公務公文過濾排除**：
   - **實測內容**：90% 以上為公務行政公文，包含「某某學年度性別平等教育推動委員會委員遴選」、「大專校院性平行政人員培訓研習營報名」、「專案研究計畫徵件」等。
   - **處理原則**：依循 §2.5 本章「排除公務業務名冊與行政公文」之核心原則，**不予全量轉載**。僅保留未來若有「4/20 性別平等教育日」等全民性親子活動之關鍵字過濾串接，其餘行政公文全面排除，防止首頁新聞品質被稀釋。

---

### 2.6 災防告警細胞廣播（CBS）、土石流警戒與全站緊急橫幅（2026-10-24 增訂）

#### 2.6.1 災防科技中心「災防告警細胞廣播（CBS）」Feed（cbs.tw/files/rssatomfeed.xml）

- **資料來源**：國家災害防救科技中心（NCDR）維護之災防告警細胞廣播官網 [cbs.tw](https://cbs.tw/)，即時 ATOM/CAP 端點：`https://cbs.tw/files/rssatomfeed.xml`。
- **內容與特性**：
  - 格式為標準 Common Alerting Protocol（CAP 1.2），封裝於 ATOM feed，更新延遲在秒級以內。
  - **與既有 `alerts.ncdr.nat.gov.tw` 之關鍵差異**：既有 NCDR 一般端點包含數十種常態性低門檻警告（如一般降雨、河川水位警戒、例行施工道路封閉），每日訊息量龐雜；而 `cbs.tw` 專供**實際觸發 4G/5G 手機強制廣播（Public Warning System, PWS）之重大緊急告警**（如地震速報、海嘯警報、大雷雨即時訊息、防空演習、一級水庫放水等）。
- **落地狀態與架構（✅ 已於 PR #806 落地）**：
  - **全站重大緊急橫幅元件 `CbsEmergencyBanner.tsx`**：已實裝至全站版面，支援極高優先權之重大事件示警；後端 `lib/server/disaster/cbsAlerts.ts` 使用 `fast-xml-parser` 精準解析 CAP 1.2 XML，提供 `GET /api/cbs-status` 端點供客戶端即時輪詢與過期過濾，並經由 `tests/cbs-alerts-parser.test.mjs` 完整驗證。

#### 2.6.2 農業部水保署「土石流警戒資訊」（歷史代碼 7284 / 現行 UnitId=018）

- **歷史代碼與現行端點對照**：
  - 早年 data.gov.tw 資料集代碼為 **[7284]**（常見於國際災防文獻引用），後續農業部水土保持署（原農委會水保局）重組後，已遷移至現代化 OpenAPI 端點：
  - **現行直接端點**：`https://data.moa.gov.tw/Service/OpenData/FromM/GetCustomerDebrisAlertInfo.aspx?IsTransData=1&UnitId=018`
- **實測規格**：
  - 格式：JSON / XML（依 `IsTransData=1` 參數回傳 JSON 結構化資料）。
  - 關鍵欄位：`AlertLevel`（黃色警戒／紅色警戒）、`ReleaseTime`（發布時間）、`DebrisStreamCode`（土石流潛勢溪流代碼）、`County`（縣市）、`Township`（鄉鎮市區）、`Village`（受影響村里）。
- **落地狀態與落點（✅ 已於 PR #806 落地）**：
  - 已於 `lib/server/disaster/debrisAlerts.ts` 實作土石流紅黃警戒聚合模型，支援鄉鎮與村里統計下鑽；單元測試於 `tests/debris-alerts-parser.test.mjs` 覆蓋。與頂部 CBS 橫幅形成「宏觀告警 ↔ 微觀溪流村里清單」之連動。

---

## 3. 逐平台盤點表

「已覆蓋」= 本站已在用；「新候選」= 本次找到、尚未使用。

| 平台 | 已覆蓋 | 新候選 | 驗證狀態 | 引用 |
|---|---|---|---|---|
| service.taipower.com.tw（台電公司） | [8931] 各機組發電量即時資訊（`d006001`，⚠️ 需修復 UTF-8 BOM Bug）、核電廠周邊輻射監測（`d525001`，49 筆在線） | **[44799] 電力維生管線災情資訊（`d006012`，即時停電村里多邊形 KML）** | ✅ 實測 200；44799 大小 1.05 MB 含村里經緯度多邊形；8931 每 10 分鐘即時回傳 | <https://service.taipower.com.tw/data/opendata/apply/file/d006012/001.xml>、`d006001/001.json` |
| 165.npa.gov.tw（165 全民防騙網） | 只有 165 專線號碼 | 停止解析網站（經 data.gov.tw）、前端 API（每日社群涉詐廣告清單、境外帳戶） | ✅ 首頁 200；Angular SPA，前端 API 不需登入 | <https://165.npa.gov.tw/> |
| 165dashboard.tw（165 打詐儀錶板） | 無 | 每日案件數、損失、手法排行（前端 API） | ✅ 200；**無官方 API 文件**（未確認是否有正式 API） | <https://165dashboard.tw/> |
| opendata.wra.gov.tw | 水庫、水位 4 個端點 | 無新增（沿用 9/14 結論） | ✅ 200 | 9/14 文件 §1.1 |
| iot.wra.gov.tw | 淹水感測、河川水位（`inundation-map`） | 無新增；9/14 的 E1/N3 已在 #327 落地 | ✅ 200 | 9/14 文件 §1.2、[07](../domains/07-tools-disaster-environment-energy.md) |
| data.moenv.gov.tw | AQI、AQX、公廁、清潔隊、環保標章、室內空品、碳足跡 | 機車排氣定檢站 `mpi_s_01`（含座標、今日營業）、全國維修地圖 `wr_p_250`；9/14 的噪音仍未做 | ✅ 兩個新端點實打 200 | <https://data.moenv.gov.tw/api/v2/mpi_s_01>、`wr_p_250` |
| service.moea.gov.tw/EE501 | — | 無（統計儀表板，沿用 9/14 結論） | ✅ 200 | 9/14 文件 §1.4 |
| www.moeaea.gov.tw（經濟部能源署） | 發電來源配比（`set_id=55`，⚠️ 需修復 CSV 標頭漂移） | 無 | ✅ 200；最新欄位名為「台灣地區電力系統」 | <https://www.moeaea.gov.tw/ECW/populace/opendata/wHandOpenData_File.ashx?set_id=55> |
| data.gov.tw | 多數既有來源的索引 | 本文 Top 15 的 #1–#12、#14、#15；新聞搜尋 200 筆已檢驗（見 §2.5） | ✅ 完整目錄 CSV 可下載；`/api/v2/rest/dataset/{id}` 可查單一資料集 | <https://data.gov.tw/datasets/export/csv> |
| opendata.taichung.gov.tw（API 在 `newdatacenter.taichung.gov.tw`） | 無 | 垃圾清運及資源回收車動態（每 10 分鐘） | ✅ 200，JSON；正式主機未確認 | [83558](https://data.gov.tw/dataset/83558) |
| data.tainan.gov.tw（API 在 `soa.tainan.gov.tw`） | 無 | 垃圾車 GPS；詐欺、毒品案件統計（僅統計） | ✅ 垃圾車 200；正式主機未確認 | [136310](https://data.gov.tw/dataset/136310) |
| data.taipei | 捷運營運公告（`metro-alerts`，已於 2026-10-21 隨 #728 移除）等 | 垃圾車點位路線（含抵達時間）、藥癮名單（全國版）、美沙冬跨區給藥；水質監測（15 分鐘）、環境輻射（5 分鐘）僅限臺北 | ✅ 200 | [136515](https://data.gov.tw/dataset/136515)、[133353](https://data.gov.tw/dataset/133353) |
| data.ntpc.gov.tw | 部分設施 | 垃圾車即時位置（每 2 分鐘）＋路線；衛生局約 120 個 2026 年有更新的資料集多為新北限定（泳池／溫泉水質、流感抗病毒藥劑合約院所、月子餐機構…） | ✅ 垃圾車 200 | [122972](https://data.gov.tw/dataset/122972)、[125664](https://data.gov.tw/dataset/125664) |
| data.moa.gov.tw | 病蟲害、動物醫院、認養、土石流（`disaster-map` 圖層，歷史代碼 [7284]，現行端點 `GetCustomerDebrisAlertInfo.aspx?IsTransData=1&UnitId=018`，含紅黃警戒與村里）、農藥殘留 | 林火風險、果菜批發行情；寵物遺失啟事（**含飼主電話與 Email，不建議轉載個資**） | ✅ 實測 200；7284 現行端點回傳 JSON 警戒溪流村里 | <https://data.moa.gov.tw/openapi.json>、<https://data.moa.gov.tw/Service/OpenData/FromM/GetCustomerDebrisAlertInfo.aspx?IsTransData=1&UnitId=018> |
| data.kcg.gov.tw（API 在 `openapi.kcg.gov.tw`） | 無 | 垃圾車動態；垃圾車到點時間預估（[117726](https://data.gov.tw/dataset/117726)，未實打）；毒防局社區關懷站 | ✅ 垃圾車 200；正式主機未確認 | [138256](https://data.gov.tw/dataset/138256) |
| opendata.tycg.gov.tw | 部分設施 | 藥癮戒治名單（縣市版，與全國版重複）；未找到垃圾車資料集 | ✅ 200，**CSV 為 cp950 編碼** | [142681](https://data.gov.tw/dataset/142681) |
| tdx.transportdata.tw（只補 basic 以外） | basic 已研究 | **歷史服務「道安 v1」**：A1／A2 事故主檔與當事人檔、`/TrafficAccident/Rank/{City}` 易肇事路口排行；進階服務「空間查詢-POI v3」「地理編碼轉換 v2」（geocoder 候選）；MaaS 旅運規劃 | ⚠️ 只取得 swagger，未帶 token 實打 | `https://tdx.transportdata.tw/webapi/File/Swagger/V3/3340067e-2167-4273-843f-2612c076f40f` |
| data.cdc.gov.tw（CKAN，檔案在 `od.cdc.gov.tw`） | `travel-epidemic-alerts` 用 2 個資料集 | 抗蛇毒血清儲備醫院（428 筆含座標）、旅遊醫學門診（含 M 痘疫苗）、RODS 類流感急診週資料（更新到 2026 第 40 週） | ✅ 從台灣 ISP 可達；**正式主機與 GitHub runner 已知被封鎖** | <https://data.cdc.gov.tw/api/3/action/package_search> |
| water.gov.tw OpenData | 停水（`water-outages`）、台水新聞、鄉鎮硬度（36605，已落地）、淨水場水質（6308，已落地） | 輔導合格清洗水塔業者（僅 13 家） | ✅ 200 | <https://www.water.gov.tw/opendata/qual5.csv> |
| metro.taipei 開放資料（經 data.taipei） | 營運公告 | 車站無障礙設施、出入口、各站分時進出量（可估擁擠時段）、置物櫃 | 詮釋資料 2026-10-13（未逐一下載） | [128416](https://data.gov.tw/dataset/128416)、[128506](https://data.gov.tw/dataset/128506) |
| scidm.nchc.org.tw | 無 | 無：最新上架多為學術期刊與衛星影像，CKAN 中文搜尋失準 | ✅ API 200（32,067 筆） | <https://scidm.nchc.org.tw/api/3/action/package_search> |
| 衛福部 opendata／護理及健康照護司 | 長照 GIS（`long-term-care`） | 全國開業護理機構清冊（產後護理之家） | ✅ 200（`nhplatform.mohw.gov.tw`，正式主機未確認） | [115950](https://data.gov.tw/dataset/115950) |
| data.fda.gov.tw | 藥品、營養成分、業者登錄、健康食品、藥局 | 違規廣告 4 集、藥品短缺、回收藥品、不合格食品、安全週報、常見濫用管制藥品 | ✅ 全部 200 | <https://data.fda.gov.tw/swagger-ui/index.html> |
| apiservice.mol.gov.tw（勞動部） | 健檢機構、職業傷病醫院 | 違反勞動法令事業單位（勞基法、性平、職安）、重大職災 | 詮釋資料每日（未下載內容） | [109896](https://data.gov.tw/dataset/109896)、[126835](https://data.gov.tw/dataset/126835) |

### 3.1 全臺 25 大開放資料平臺全覽矩陣（以 `odportal.tw` 最新清冊為基準）

| cbs.tw（國家災防科技中心 NCDR） | 無 | **災防告警細胞廣播即時 ATOM/CAP Feed（`rssatomfeed.xml`）** | ✅ 實測 200；標準 CAP XML，更新秒級，專供全站頂部重大緊急橫幅（PWS 級警報） | <https://cbs.tw/files/rssatomfeed.xml> |
| www.gender.edu.tw（教育部性平教育網） | 無（既有新聞僅收錄教育部本部 `moe`） | `m1_03_index` 新聞稿及資訊澄清（事實查核闢謠候選）；`m1_01_index` 即時公告（判定行政公文排除） | ✅ 實測 200；無公開 RSS，需專用 HTML 解析器；具高度闢謠價值 | <https://www.gender.edu.tw/web/index.php/m1/m1_03_index> |

依據社群開放資料平臺清冊 `odportal.tw` 與 `onlinemad/awesome-opendata-taiwan-gov`，全臺現存中央與地方主要開放資料平臺共 25 處（涵蓋中央母體、部會專用平臺與 22 縣市平臺）。以下盤點各平臺公開資料集規模、服務存活狀態、已匯入 `data.gov.tw` 狀況以及本站 2.0 取捨結論：

| 平臺名稱 / 網址 | 資料量 | 存活狀態 | 已匯入 data.gov.tw 狀況 | 本站 2.0 取捨結論 |
|---|---|---|---|---|
| **政府資料開放平臺** (`data.gov.tw`) | 79,139 筆 | ✅ 存活 (200) | 母體總目錄 | **核心主力**：本站 Top 15 絕大多數候選來源（詐騙網域、違規廣告、事故、失物招領等）之匯流索引。 |
| **臺北市政府資料開放平台** (`data.taipei`) | 20,529 筆 | ✅ 存活 (200) | 部分匯入（API 仍以北市為主） | **已深度使用**：歷史捷運公告、垃圾車即時點位路線、全國藥癮戒治與跨區給藥機構。 |
| **高雄市政府資料開放平台** (`data.kcg.gov.tw` / `openapi.kcg.gov.tw`) | 7,512 筆 | ✅ 存活 (200) | 部分匯入 | **候選**：垃圾車動態與到點時間預估；正式主機連線可達性待確認。 |
| **臺中市政府資料開放平台** (`opendata.taichung.gov.tw` / `newdatacenter.taichung.gov.tw`) | 7,255 筆 | ✅ 存活 (200) | 部分匯入 | **候選**：垃圾清運及資收車即時動態；原 `data.taichung.gov.tw` 已廢止改址。 |
| **新北市政府資料開放平台** (`data.ntpc.gov.tw`) | 6,908 筆 | ✅ 存活 (200) | 大部分匯入 | **已部分覆蓋**：垃圾車動態；多數衛生局 120+ 資料集具新北在地限定性，不獨立介接。 |
| **桃園市政府資料開放平台** (`opendata.tycg.gov.tw`) | 5,472 筆 | ✅ 存活 (200) | 大部分匯入 | **已部分覆蓋**：部分 CSV 為 CP950 編碼；原 `data.tycg.gov.tw` 已廢止改址。 |
| **臺南市政府資料開放平台** (`data.tainan.gov.tw` / `soa.tainan.gov.tw`) | 4,368 筆 | ✅ 存活 (200) | 部分匯入 | **候選**：垃圾車 GPS 即時資料；其餘治安與毒品資料多為統計表。 |
| **農業部農業資料開放平台** (`data.moa.gov.tw`) | 1,718 筆 | ✅ 存活 (200) | 專屬平臺 / 部分匯入 | **已深度使用**：土石流警戒、動物醫院；建議擴充果菜批發行情與林火風險。原 `data.coa.gov.tw` 廢止。 |
| **花蓮縣政府資料開放平台** (`data.hl.gov.tw`) | 1,176 筆 | ✅ 存活 (200) | 已匯入 data.gov.tw | **不單獨介接**：地方公設名冊已由中央母體覆蓋，透過 data.gov.tw 存取即可。 |
| **宜蘭縣政府資料開放平台** (`opendata.e-land.gov.tw`) | 1,125 筆 | ✅ 存活 (200) | 已匯入 data.gov.tw | **不單獨介接**：無獨特高頻民生即時 API，由中央母體統一介接。 |
| **新竹市政府資料開放平台** (`opendata.hccg.gov.tw`) | 1,056 筆 | ✅ 存活 (200) | 已匯入 data.gov.tw | **不單獨介接**：多數為靜態名冊，中央平臺均已有對應。 |
| **新竹縣政府資料開放平台** (`data.hsinchu.gov.tw`) | 999 筆 | ✅ 存活 (200) | 已匯入 data.gov.tw | **不單獨介接**：名冊類與母體重疊，維持中央單一來源。 |
| **雲林縣政府資料開放平台** (`data.yunlin.gov.tw`) | 990 筆 | ✅ 存活 (200) | 已匯入 data.gov.tw | **不單獨介接**：部分縣市版專案停更在 2021–2022，以全國版為準。 |
| **環境部環境資料開放平臺** (`data.moenv.gov.tw`) | 832 筆 | ✅ 存活 (200) | 專屬平臺 / 已匯入 | **已深度使用**：AQI、AQX、公廁、清潔隊；建議新增機車排氣定檢站、維修地圖。原 `opendata.epa.gov.tw` 廢止。 |
| **苗栗縣政府資料開放平台** (`data.miaoli.gov.tw`) | 720 筆 | ✅ 存活 (200) | 已匯入 data.gov.tw | **不單獨介接**：資料已匯入中央，無單獨維護必要。 |
| **澎湖縣政府資料開放平台** (`opendata.penghu.gov.tw`) | 573 筆 | ✅ 存活 (200) | 已匯入 data.gov.tw | **不單獨介接**：離島民生名冊中央版已收錄。 |
| **南投縣政府資料開放平台** (`data.nantou.gov.tw`) | 507 筆 | ✅ 轉由 data.gov.tw 代管 (200) | 深度整合 | **不單獨介接**：舊獨立網站已廢止，全面改以 data.gov.tw 掛載。 |
| **嘉義市政府資料開放平台** (`data.chiayi.gov.tw`) | 472 筆 | ✅ 存活 (200) | 已匯入 data.gov.tw | **不單獨介接**：名冊多已同步中央。 |
| **文化部資料開放平台** (`opendata.culture.tw`) | 366 筆 | ✅ 存活 (200) | 專屬平臺 / 部分匯入 | **已部分覆蓋**：`cultural-events` 使用其藝文活動資料；國家文化記憶庫 2.0 OpenAPI 排除（見 §5）。 |
| **衛生福利部疾病管制署** (`data.cdc.gov.tw` / `od.cdc.gov.tw`) | 335 筆 | ⚠️ 存活 (台灣住宅 ISP 可達) | 專屬平臺 | **正式主機封鎖**：資料中心 IP 被擋；僅旅遊醫學門診、抗蛇毒血清年更名冊評估人工更新種子檔。 |
| **金門縣政府開放資料平台** (`data.kinmen.gov.tw`) | 297 筆 | ✅ 存活 (200) | 已匯入 data.gov.tw | **不單獨介接**：已完全由 data.gov.tw 覆蓋。 |
| **屏東縣政府資料開放平台** (`data.pthg.gov.tw`) | 285 筆 | ✅ 存活 (200) | 已匯入 data.gov.tw | **不單獨介接**：已同步中央。 |
| **教育部統計處** (`stats.moe.gov.tw` / data.gov.tw 機關專區) | 69 筆 | ✅ 存活 (200) | 已匯入 data.gov.tw | **排除**：以學術統計報表為主，非民生即時查詢用途。 |
| **連江縣政府資料開放專區** (`matsu.gov.tw` / data.gov.tw 連江專區) | 數十筆 | ✅ 存活 (200) | 深度整合 | **不單獨介接**：無獨立 CKAN，直接上架中央平臺；海纜障礙為馬祖通訊最大痛點，改由友站地圖導流。 |
| **國家發展委員會與其他中央部會專屬匯流**（含經濟部水利署 `opendata.wra.gov.tw`、水利物聯網 `iot.wra.gov.tw`、交通部 TDX `tdx.transportdata.tw` 等） | 數千筆 | ✅ 存活 (200) | 專屬平臺 | **已深度使用**：即時水情、積淹水感測、大眾運輸/即時路況皆已建立穩定生產管線。 |

#### 歷史平臺網址異動與無關入口廢止紀錄（取代舊世新大學清單）

- **DNS 失效／已更名遷移**：
  - `data.tycg.gov.tw` → 遷移為 `opendata.tycg.gov.tw`
  - `data.taichung.gov.tw` → 遷移為 `opendata.taichung.gov.tw`（API 端點在 `newdatacenter.taichung.gov.tw`）
  - `data.nantou.gov.tw` → 獨立站廢止，轉址由 `data.gov.tw` 機關分頁掛載
  - `data.moi.gov.tw` → 遷移為 `opdadm.moi.gov.tw`
  - `data.coa.gov.tw` → 組織改造後遷移為 `data.moa.gov.tw`
  - `opendata.epa.gov.tw` → 組織改造後遷移為 `data.moenv.gov.tw`
  - `data.hpa.gov.tw`、`data.nhi.gov.tw` → **DNS 已不存在**，健保署改在 `info.nhi.gov.tw`（但封鎖資料中心 IP）
- **非民生主軸／無效入口**：
  - `data.hakka.gov.tw` (404)、`www.fnp.gov.tw/opendata` (404 國產署)、`theme.npm.edu.tw/opendata` (403 故宮)、`data.ly.gov.tw` (立法院，無關本站主軸)
  - 國外平臺（Data.gov, Data USA, data.gov.uk, EU open data）一律不適用。

---

## 4. g0v 與社群可重用專案

以 `gh api orgs/g0v/repos` 取得全部 524 個 repo（2026-10-14），篩出最後推送在 2024-10-14 之後（2 年內）的 73 個，再挑出「提供資料、API 或爬蟲」且與本站相關的。超過 2 年未更新標為「停滯」。

| Repo | 用途 | 最後推送 | 授權 | 可重用在 | 狀態 |
|---|---|---|---|---|---|
| [fact-check-api](https://github.com/g0v/fact-check-api) | 事實查核 API（Cloudflare Workers），整合 Cofacts GraphQL 與 LLM | 2026-10-04 | MIT | 反詐查核；**CORS 只允許 `check.vtaiwan.tw` 等白名單**，要用須自架並自備 OpenRouter 金鑰 | 開發中（README 寫「初期」） |
| [fact-check-core](https://github.com/g0v/fact-check-core) | 上者的核心流程 | 2026-09-16 | 未標示 | 同上 | 開發中 |
| [community-calendar](https://github.com/g0v/community-calendar) | g0v 社群活動結構化資料與 ICS 訂閱（`all.ics`、`jothon.ics`） | 2026-10-12 | MIT | `cultural-events` 目前抓 `g0v.tw/event` 網頁，可改吃 ICS；`all.ics` 註明「未經審核」，建議只用 `jothon.ics` | 活躍 |
| [amis-moedict](https://github.com/g0v/amis-moedict) | 阿美語萌典 | 2026-10-13 | 程式 CC0；詞典 CC BY-NC-SA 3.0/4.0 | 暫緩介接（為避免 NC-SA 授權傳染性，維持現有閩南客語，見 §6-13） | 排除 |
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

### 4.1 台灣海纜動態地圖（seadog007/smc.peering.tw）專題評估與通訊韌性介接規格

#### 專案定位與社群開源架構
- **開源專案與維護者**：[`seadog007/smc.peering.tw`](https://github.com/seadog007/smc.peering.tw)（社群開源，MIT 授權）。
- **線上服務**：[`smc.peering.tw`](https://smc.peering.tw/)（台灣海纜動態地圖）。
- **核心價值**：視覺化臺灣對外國際海纜（APCN-2、FASTER、SJC2、EAC-C2C、TPE 等）與離島通訊海纜（臺馬二號/三號、臺澎金馬等）之海纜走向、海纜登陸站、故障與斷纜事件、修復船動態與修復時間線。每逢連線延遲或斷網謠言時，提供公眾客觀查核依據，為全社會防衛與數位通訊韌性之關鍵基石。
- **公開資料結構（免爬蟲 Raw JSON 端點）**：
  - **海纜障礙與修復時間線**：`https://raw.githubusercontent.com/seadog007/smc.peering.tw/master/src/data/incidents.json`
    包含每起海纜事件的識別碼 (`id`)、海纜編號 (`cable_id`)、海纜名稱 (`cable_name`)、障礙類型 (`incident_type`: cut / fault / maintenance)、狀態 (`status`: active / repairing / resolved)、發生時間 (`occurred_at`)、預估修復時間 (`estimated_repair_at`)、影響摘要 (`impact_summary`) 與受影響電信業者 (`affected_isps`)。
  - **登陸站座標清單**：`https://raw.githubusercontent.com/seadog007/smc.peering.tw/master/src/data/landing-points.json`
    收錄八里、淡水、頭城、枋山等登陸站之精準 WGS84 經緯度座標、登陸海纜數目與營運機房。

#### 2.0 通訊維生狀態燈號計算規則
本站不重造整套 WebGL 3D/2D 海纜物理拓撲繪圖，而是聚焦於防災與維生資訊傳達，定義 2.0 輕量通訊維生狀態燈號：
- 🟢 **NORMAL（正常運行）**：
  - 條件：當前無進行中的主要國際海纜斷纜事件（`status === "active"` 且影響國際連線海纜數為 0）。
  - 燈號說明：「國際與離島海底通訊電纜運作正常，對外網路頻寬維持常態水準。」
- 🟡 **DEGRADED（局部跳障 / 降級運作）**：
  - 條件：存在 1～2 條具備替代路徑之海纜故障，或單一離島微波備援系統啟用。
  - 燈號說明：「局部海纜障礙維修中，部分跨國或離島連線延遲可能稍增，整體通訊骨幹穩定。」
- 🔴 **CRITICAL（嚴重中斷 / 警戒）**：
  - 條件：多條主要國際骨幹海纜同時發生嚴重中斷，或離島（如馬祖）通訊海纜全斷且備援微波負載飽和。
  - 燈號說明：「多條對外或離島關鍵海纜發生嚴重中斷，通訊受到顯著影響；請防範斷網假訊息，遵循官方民防與通訊應變指引。」

#### 免爬蟲 Raw JSON 排程介接合約
1. **介接模式**：定時由後端排程 Job 直接抓取 GitHub Raw JSON（`src/data/incidents.json`），完全免除對前端 DOM 的網頁爬蟲負擔與改版破碎風險。
2. **快取策略**：以伺服器或 KV 快取 15～30 分鐘，帶 `If-Modified-Since` 標頭，對上游 GitHub 保持最高禮貌。
3. **優雅降級**：若 GitHub 網路逾時或資料異常，系統維持前次有效快取狀態，絕不影響站點其他功能之渲染。

#### 既有災害示警地圖與維生管線情境導流
在既有災害示警地圖（`disaster-map`、`weather-alerts`）與維生管線說明（`water-outages` 停水水質、`power-grid-overview` 電力概況）介面與指引中，增訂情境引流說明：
> **「若遇網路異常或斷網謠言，可至友站【台灣海纜動態地圖】查核海纜實體障礙」**

將水、電、瓦斯等實體維生管線，拓展至數位時代不可或缺的「網路通訊韌性管線」，在假訊息與災害發生時，第一時間引導民眾獲取客觀真實資訊。

---

## 5. 排除清單與理由

| 項目 | 理由 |
|---|---|
| 文化部／國立臺灣歷史博物館 國家文化記憶庫 2.0 OpenAPI（`tcmbdata.culture.tw/swagger-ui`） | **需申請 API Key 且綁定固定 IP**；偏典藏研究、展覽歷史考據，無民生即時查詢用途，不符合本站免金鑰／民生即時查詢原則 |
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

## 6. 未確認事項（2026-10-24 深度盤點與結案驗證）

1. **正式主機可達性**——結案更新：
   - `newdatacenter.taichung.gov.tw`：✅ 主機與 GitHub runner 皆 200（run `38764893673`），臺中垃圾車即時位置已上線。
   - `soa.tainan.gov.tw`、`openapi.kcg.gov.tw`：❌ 主機與 runner 皆逾時 20 秒（同一次 run），臺南、高雄垃圾車即時位置已放棄，標記「暫無即時資料」。
   - `nhplatform.mohw.gov.tw`：❌ 主機與 runner 兩邊逾時（2026-10-15 二次確認），產後護理之家 115950 改用住宅網路手動匯入繞過（#678），資料仍上線，但不是即時 API。
   - `data.ntpc.gov.tw`：✅ 主機與 runner 皆 200（新北垃圾車路線 125664 與即時位置 122972 實測正常，見 `ntpc122972.ts`），已上線。
   - `api.cofacts.tw`（Cofacts GraphQL）：✅ 可達（公網 200，免金鑰；資料採 CC BY-SA 4.0 需標記非官方）。
   - `www.tgos.tw`（派出所 5958 ZIP）：❌ 主機與 runner 兩邊皆回 403，派出所改用住宅網路手動匯入（#677）。
   - `www.sfb.gov.tw`（金管會 11198 打詐）：❌ 雲端資料中心 IP 遇 F5 WAF 503「Request Rejected」，住宅網路連線正常（已納入 `fsc11198.ts` 規格註記）。
   - `165.npa.gov.tw`、`165dashboard.tw`：為前端 SPA 內部 API，無對外 API 文件與 SLA 保證，不建議作為正式伺服器依賴。
2. **TDX 道安 API**：`/v1/TrafficAccident/Rank/{CityCode}/DateFilter/{DateFilter}`——✅ 已完成 Swagger 規格剖析驗證：
   - `DateFilter`：西元年度過濾參數（`Year`，如 2025、2026），114 年起按年度擴充收納。
   - 回傳結構：**自帶精確經緯度坐標**（`Lat`: 路口緯度 float, `Lon`: 路口經度 float），無須額外 geocode！
   - 完整欄位：`Year`, `City`, `CityCode`, `District`, `Rank`（排名）, `RoadName`（路口名稱）, `Lat`, `Lon`, `AccidentCount`（總事故數）, `A1Count`, `A2Count`, `Updatetime`。
   - 結論：**已拍板決策（2026-10-24 Grill Q1 採選項 1）**——直接介接 TDX 道安易肇事路口排行 API，省去自行維護路口聚類演算法的複雜度與精準度風險，利用本站既有 TDX 管線進行後端排程快取。
3. **165 打詐儀錶板**：
   - ✅ **已確認現況**：目前在 data.gov.tw **尚未上架開放資料集**，亦無公開發布之正式 API。
   - `TotalLosses` 單位真相：其底層數值以「元」為基準，前端 Dashboard 轉換呈現為「萬元」或「億元」（如 `TotalLosses: 24828.9` 代表 24,828.9 萬元，即約 2.48 億元）。
   - 結論：維持不依賴前端私有 API，趨勢圖沿用 data.gov.tw 之警政署 [172159]（月攔阻金額）與金管會 [11198]（週廣告件數）。
4. **藥癮戒治名單的更新日**：
   - ✅ **已查明機制**：`data.taipei` 133353 為臺北市立聯合醫院代為轉載衛福部心理健康司「物質使用障礙症治療及生活重建業務指定機構名單」。台北市平臺自動排程導致 metadata 每日刷新失真。
   - 衛福部母清冊實際約每半年至一年發布修訂一次。本站排程應依據 CSV 內容 Hash 決定是否寫入，不採信 metadata 更新日。
5. **「非鴉片類藥癮治療補助機構」**：
   - ✅ **已確認涵蓋**：衛福部心理健康司規定「藥癮治療費用補助方案」整合了鴉片類與非鴉片類（安非他命、K他命、新興毒品等）戒癮治療補助；凡公告為「物質使用障礙症治療及生活重建業務指定機構」者，即具備執行非鴉片類藥癮補助資格。133353 名單實質完全涵蓋非鴉片類補助機構。
6. **全國酒癮治療機構名單**：
   - ✅ **已查明現況**：衛福部心理健康司定期公告「執行酒癮治療費用補助方案機構及酒駕酒癮評估機構名單」（全台各縣市指定醫院診所，以 PDF/ODS 公告於成癮治療專區下載），data.gov.tw 目前**未提供全國動態 API**。
   - **已拍板決策（2026-10-24 Grill Q5 採選項 1）**：專線收錄至 `emergency-hotlines`，名單採半年一次人工種子檔維護至 `mental-health` 成癮防治分頁。不寫脆弱的 PDF/ODS 爬蟲；將衛福部「台灣戒酒暨酒癮防治中心 `0800-255959`」免付費專線納入緊急電話；機構清冊則每半年（1 月/7 月）與護理之家等來源同步以人工方式轉入靜態種子檔，併入 `mental-health` 的成癮防治分頁（支援藥癮/酒癮篩選標籤）。
7. **防空疏散避難設施全國彙整**：
   - ✅ **已查明現況**：中央並未提供全國單一即時 API。警政署「防空疏散避難專區」（`adr.npa.gov.tw`）及各縣市資料集共約 132 個，格式分散（CSV、ODS、XLSX、JSON）。
   - **已拍板決策（2026-10-24 Grill Q3 採選項 1）**：正式排除「全量自建圖資」，改採官方 App 與網頁專區之情境導流。在既有民防與防災場景（如 `emergency-supplies` 防災避難包、`disaster-map` 災害地圖民防指引）中，以醒目卡片深度導流至內政部警政署官方「防空疏散避難專區（`adr.npa.gov.tw`）」與「警政服務 App」，既免除介接 132 個異質檔案之維護負擔與破碎風險，又確保民眾獲取官方權威圖資。
8. ~~**毒品防制諮詢專線號碼**~~——✅ 已解決：已於 PR #577（2026-10-14）修正為 0800-770-885，見 §2.2。
9. **電信詐欺犯罪資料 [98176](https://data.gov.tw/dataset/98176) 的「發生地點」精度**：
   - ✅ **已查證精度**：發生地點精度為**「鄉鎮市區別」**。
   - 官方統計性質為「報案受害人登錄地」，而非犯罪機房或車手地點。人口稠密都會區報案數自然居高，地圖化會造成嚴重偏誤與特定鄉鎮污名化，確立維持 §2.3 不建議地圖化之判斷，僅適合做年度統計。
10. **勞動部違反勞動法令事業單位 [109896]、集會遊行 [11307]、捷運無障礙設施 [128416] 內容檢驗**：
    - ✅ **已完成內容分析**：
      - 勞動部 [109896]：含處分日期、事業單位名稱、負責人、違反法條、罰鍰金額等。屬事業單位黑名單查核，適合依公司名稱檢索，不適合民生地圖。
      - 集會遊行 [11307]：僅為各分局每月案件數統計（申請/核准/未申請），非未來即時交通管制通知，對避開壅塞無用，確立排除。
      - 捷運無障礙設施 [128416]：含各站電梯、斜坡、無障礙閘門等設備清單，但僅限臺北捷運，且本站已移除 metro 工具，不單獨介接。
11. **反毒大本營 `antidrug.moj.gov.tw`**：
    - ✅ **已查證端點**：該站無公開可用的 RSS/Atom feed，舊 RSS 路徑轉址或回 302，且首頁含裝置重定向。官方新聞應直接介接法務部或衛福部心理健康司新聞稿，反毒大本營排除作為 feed 來源。
12. **高雄垃圾車到點時間預估 [117726]**：
    - ✅ **已確認可達性限制**：其端點位於 `openapi.kcg.gov.tw`，該主機在正式主機與 GitHub runner 皆逾時 20 秒（已封鎖資料中心 IP），無法線上即時連線，維持排除。
13. **amis-moedict 授權條款**：
    - **已拍板決策（2026-10-24 Grill Q4 採選項 2）**：暫緩原住民族語擴充，維持現有閩南語與客語。為確保全站資料來源授權之純粹性（堅持 ODGL／CC0／CC-BY 等寬鬆授權），避免引入具 NC-SA「授權傳染性」與商業使用限制之條款，本站不介接 amis-moedict，維持現狀。
14. **環境部 API 金鑰**：
    - ✅ **已確認程式碼實作**：`lib/server/config/env.ts` 已統整 `data.moenv.gov.tw` 帳號共用金鑰機制，提供 `env.moenvGpApiKey || env.moenvNewsApiKey` 及多種 fallback。新端點（機車排氣定檢站 `mpi_s_01`、維修地圖 `wr_p_250`）直接取用此環境變數傳入即可，完全解開。
15. **台電 8931（`d006001`）UTF-8 BOM 修復**：
    - ✅ **已確認完成修復**：`lib/server/power/fetchGenerationUnits.ts` 第 45 行已加入 `text.replace(/^\uFEFF/, "").trim()`，線上解析為空問題已解。
16. **能源署 `set_id=55` 標頭映射修復**：
    - ✅ **已確認完成修復**：`lib/server/power/fetchGenerationMix.ts` 第 27-44 行已相容新版標頭（`台灣地區電力系統`、`總裝置容量(數值)`）與舊版標頭。
17. **台電 44799 停電多邊形資料量（1.05 MB KML）**：
    - ✅ **已拍板架構與落點決策（2026-10-24 Grill Q2 採選項 1）**：開闢獨立新工具 `/tools/power-outages`（全台即時停電災情與修復地圖，歸入「防災與示警」類別），與水利署 `/tools/water-outages`（停水）形成民生管線雙支柱。由後端排程 Job 定時抓取 1.05 MB KML，解析村里 Polygon 並壓縮為輕量 GeoJSON 快取或寫入資料庫（禁止前端直連），地圖直觀呈現停電村里多邊形、受影響戶數排行、預計復電時間軸與 1911 直撥按鈕，並與 `/tools/power-grid-overview` 雙向導流。
18. **CBS 細胞廣播 CAP XML 解析與全站橫幅共用**：
    - ✅ **已完成規格書撰寫**：已收錄於 `docs/specs/SPEC-emergency-cbs-debris-and-gender-factcheck.md`，定義 CAP 1.2 解析邏輯、過濾條件（Immediate/Expected + Extreme/Severe）與全站頂部 CBS Banner 共用架構。
19. **教育部性平網無公開 RSS 需專用 HTML 爬蟲**：
    - ✅ **已完成規格書撰寫**：已收錄於 `docs/specs/SPEC-emergency-cbs-debris-and-gender-factcheck.md`，定義使用 Cheerio 爬取 `m1_03_index`（資訊澄清），過濾排除 `m1_01_index`（公務公文），納入事實查核專區並標記官方查核來源。

---

## 7. 尚未實做 Top 10（2026-10-24 拍板排程版）

本節為 2026-10-24 經過 10 輪 Grill 決策樹拍板定案之最終 Top 10 實做清單，所有資料來源皆已 100% 驗證可達、排除不可達與授權衝突來源（高雄垃圾車已由勞動部 109896 遞補，防空避難設施確立採情境導流）。各項目之產品落點、slug 與資料架構已全數底定。

| # | 服務名稱 | 來源狀態 | 備註 |
|---|---|---|---|
| 1 | 違規健康廣告查詢（食品／藥品／化粧品／醫材） | ✅ 4 個資料集皆 200（6949/14196/14198/14197），每 7 日更新 | 拍板開闢獨立新工具 `/tools/illegal-health-ads`（環境與食品安全類，Grill Q6 決策 1），建專用表與全文檢索索引（10 萬筆），與 `food-safety`、`drugs` 雙向導流 |
| 2 | 邊境查驗不合格食品 | ✅ 6133，每 7 日更新，2,625 筆 | 原 Top15 #6；計畫併入既有 `food-safety`，成本低 |
| 3 | 交通事故熱點／易肇事路口 | ✅ 拍板介接 TDX 道安 API（自帶 Lat/Lon，每年排行，§6-2 決策 1） | 原 Top15 #11；免除自行聚類演算法，由後端批次快取全台縣市排行 |
| 4 | 失物招領查詢 | ✅ 7317，每日更新，88,278 筆 | 拍板開闢獨立新工具 `/tools/lost-and-found`（交通生活類，Grill Q8 決策 1），純接 7317 公告排除 7318 姓名個資，支援關鍵字/類別搜尋與派出所直撥導航 |
| 5 | 果菜批發行情（今日菜價） | ✅ `/api/v1/AgriProductsTransType/`，每日 | 拍板開闢獨立新工具 `/tools/produce-prices`（交通生活類，Grill Q9 決策 1），提供作物關鍵字搜尋、主要市場比價、休市日提示與重點蔬菜行情看板 |
| 6 | Cofacts 真的假的 GraphQL 查證 | ✅ `api.cofacts.tw/graphql` 200、免金鑰；CC BY-SA 4.0 需標示非官方 | 拍板併入既有 `anti-fraud` 新增「民間查核（Cofacts）」分頁（Grill Q7 決策 1），加註「非官方判定」與 CC BY-SA 4.0 標籤，與官方涉詐網域互補 |
| 7 | 常見濫用管制藥品辨識 | ✅ 6944，23 項，每月更新 | 衛教用途，可低成本併入 `mental-health` 既有的「成癮防治」分頁 |
| 8 | 機車排氣定檢站（我附近） | ✅ `data.moenv.gov.tw/api/v2/mpi_s_01` 200，含座標與「今日營業」 | 適合併入 `/nearby` |
| 9 | 全國維修地圖（我附近） | ✅ `wr_p_250` 200 | 適合併入 `/nearby`；內容細節未深入檢查 |
| 10 | 違反勞動法令事業單位查詢（黑名單） | ✅ 勞動部 [109896]，每日更新 | 遞補原高雄垃圾車（Grill Q10 決策 1），開闢獨立新工具 `/tools/labor-violations`，支援公司名/負責人/統編檢索違法開罰紀錄與 1955 勞工諮詢導流 |

**特別排除、不列入此 Top10**：防空疏散避難設施全國自建圖資（已拍板排除自建 132 個縣市資料集，改於民防與避難場景外部導流至警政署官方專區與「警政服務 App」，見 §6-7 Grill Q3 決策）；高雄垃圾車到點時間預估 [117726]（主機 `openapi.kcg.gov.tw` 封鎖資料中心 IP 逾時，已由勞動部 109896 違法雇主查詢遞補）；疾管署抗蛇毒血清儲備醫院（`od.cdc.gov.tw` 封鎖資料中心 IP，見 §5）。
