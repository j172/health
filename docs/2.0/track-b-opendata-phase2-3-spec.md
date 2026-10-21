# B 軌開放資料擴充（第 2、3 期）：範圍、測試縫與切片規格

- **日期**：2026-10-15
- **狀態**：**擁有者已於 2026-10-15 裁決 D1–D7（見 §7.1，勿重談）**；票已開（見 §7.1 末），實作由 worktree agent 處理。**已取消的 ticket：B-1、B-2、B-3、B-6、B-10、B-11、B-15**（下方 §6 表格仍保留原文供查，開票時一律略過）。B-6（邊境查驗不合格食品）是實作完成後、於 2026-10-15 由擁有者追加取消（不公開點名進口商／公司）：#671 以 not planned 關閉、PR #684 關閉未合併，程式碼保留在分支 `feat/border-food-rejections-671`。
- **上游決策（勿重談）**：[anti-fraud-addiction-opendata-plan.md](anti-fraud-addiction-opendata-plan.md) §1 決策 #12（B 軌 4 組全收）、#13（垃圾車即時位置只在使用者開頁時取、不入庫）、#14（一期上線後才開下一期）；§2 第 2、3 期清單；§3 開放問題 Q1。
- **資料來源研究**：[opendata-expansion-research.md](opendata-expansion-research.md)（2026-10-14）。
- **本文新增的查證**：作者在 2026-10-15 重新下載了下列每一個資料集（從開發者住宅網路，**不是正式主機**），筆數與日期取自檔案內容；與研究文件不同之處明確標註。標記說明：**實測** = 本文自行下載；**研究文件** = 沿用 2026-10-14 結論未重測；**未驗證** = 沒有證據，不得當成事實使用。
- **前置**：2.0 PRD [#438](https://github.com/j172/health/issues/438)；反詐與成癮 spec [#562](https://github.com/j172/health/issues/562) 第 0、1 期已全部上線。

> 備註：計畫文件提到的 `docs/2.0/child-family-welfare-plan.md` **不在 repo 內**（未 commit）。判斷「哪些已上線、不重做」改以 `git log` 與 `lib/server/tools/catalog.ts` 為準，見 §1。

---

## 0. 摘要

| 組 | 計畫原列項目 | 仍未上線 | 本文結論 |
|---|---|---|---|
| 用藥食安 | 違規健康廣告（新工具）、藥品短缺與回收、邊境不合格食品 | 全部 | 4 個資料來源 × 3 個落點，拆 7 張 ticket（含 1 張選配）；**食品廣告單檔解壓後 23.4 MB，是主機記憶體風險最大的一項** |
| 婦幼長照 | 產後護理之家（已移到兒少計畫並已上線） | **沒有新資料集** | 該組在 B 軌已被消化完。唯一待辦是**驗證已上線的 115950 在正式主機到不到貨**：2026-10-15 的 egress probe 顯示 `nhplatform.mohw.gov.tw` 從正式主機與 GitHub runner **兩邊都逾時** |
| 治安生活 | 失物招領、派出所、交通事故熱點 | 全部 | 失物招領的公告文字內含 IMEI、SIM 卡號、手機門號、證件號碼片段，**必須遮蔽**；派出所有 43 筆離島座標用的是 119°E 帶，現有 `twd97.ts` 轉不了；事故熱點只有 A2（每月 5 千萬位元組 CSV）才有足夠的空間聚集，A1 單獨做沒有意義 |
| 生活環境 | 垃圾車與清潔隊、林火風險、自來水水質、今日菜價 | 全部 | 菜價 API 對非會員**只回前兩頁**，需分市場查詢才拿得到整天資料；垃圾車即時位置只有 4 市有資料、路線只有 2 市有資料，必須誠實標示覆蓋範圍 |

`life-culture` 現況是 **12 個**（計畫 Q1 寫的 13 已過時；`catalog.test.mjs` 的 `EXPECTED_COUNTS` 為準）。第 3 期若按計畫新增失物招領、事故熱點、菜價 3 個工具，剛好 15 個，貼到 8–15 上限、沒有任何餘裕。建議見 §7 D1。

---

## 1. 已上線、本 spec 不重做

| 項目 | 證據 |
|---|---|
| 反詐 `/tools/anti-fraud`、涉詐網域 176455／165027／160055、趨勢 172159／11198 | #564 #567 #570 #575 等；`lib/server/antiFraud/` |
| 成癮防治分頁（133353、133345 美沙冬跨區給藥、22 縣市毒防中心） | #566 #571；`lib/server/facilities/sources/addictionTreatmentFacilities.ts`、`methadoneCrossDistrict.ts`、`antiDrugCenters.ts` |
| 戒菸院所全國表 6954＋六都覆蓋 | #569 #572 |
| 警政署新聞 7505、反毒大本營新聞來源 | #568 |
| 第 6 個生活情境 `fraud-and-addiction` | #574 |
| 產後護理之家 `postpartum-care`＋一般護理之家／居家護理所併入 `long-term-care`（115950） | #612／#623，`nhplatformNursingInstitutions.ts`（**來源可達性見 §2.2**） |
| 托嬰中心、早療、社福中心、長照給付、育兒補助等兒少／長照項目 | #601–#616 |

以 `grep` 檢查 `lib app components scripts data locales`：下列資料集代號與 slug 沒有出現在任何 `lib`／`app` 的來源碼、路由或 `scripts` 中（僅剩 `child-native-languages-seed.json`、`public-art.json`、`404.svg` 的數字巧合，以及 anti-fraud 測試 fixture），確認第 2、3 期全部未動工：6949／14196／14197／14198、54504／54505、6947、6133、7317、5958、12818／13139、36605／6308、136515／122972／125664／83558／136310／138256、`ForestFireAlertWCF`、`AgriProductsTransType`。

---

## 2. 範圍（只列未上線項目）

欄位約定：**落點**分為「facilities」（走 `lib/server/facilities/runSync.ts` 的 `SOURCES` 註冊、`uq_facility_source (source_key, source_id)`）、「專屬表」（新 `CREATE TABLE`）、「即時不入庫」（決策 #13）、「靜態」。**主機風險**欄對應 §3 的彙整。

### 2.1 用藥食安

#### A-1 違規健康廣告查詢（新工具，分類 `environment-food`）

| 子來源 | data.gov.tw | 下載 URL | 格式 | 筆數（實測） | 處分日範圍（實測） |
|---|---|---|---|---|---|
| 食品 | [6949](https://data.gov.tw/dataset/6949) | `https://data.fda.gov.tw/data/opendata/export/22/json` | **ZIP 內一個 JSON**（ZIP 3.15 MB → JSON 23,417,667 位元組） | 60,773 | 2012-12-21 至 2026-09-18 |
| 藥品 | [14196](https://data.gov.tw/dataset/14196) | `.../export/156/json` | 直接 JSON（1.7 MB） | 4,003 | 2013-02-18 至 2026-09-22 |
| 化粧品 | [14198](https://data.gov.tw/dataset/14198) | `.../export/158/json` | 直接 JSON（13.7 MB） | 30,369 | 2012-11-30 至 2026-09-24（另有 1 筆壞值 2819-11-18） |
| 醫療器材 | [14197](https://data.gov.tw/dataset/14197) | `.../export/157/json` | 直接 JSON（2.6 MB） | 5,890 | 2012-09-27 至 2026-09-24 |

- **落點**：專屬表（建議 `health_ad_violations`）。更新頻率：data.gov.tw 目錄 API 對 14196／14197／14198 寫每 7 日；6949 的 `regularupdate` 為 `2`（含義未驗證）。
- **欄位**：違規產品名稱、違規廠商名稱或負責人、處分機關、處分日期、處分法條、違規情節（食品檔無此欄）、刊播日期、刊播媒體類別、刊播媒體、查處情形。
- **資料品質問題（實測）**：
  1. **同一個 URL 有時是 ZIP、有時是純 JSON**（6949 是 ZIP，其餘三個是純 JSON）。解析器要靠檔頭 `PK` 判斷，不能靠 URL。既有 `tfdaDrugAppearance.ts` 已用 `adm-zip` 處理過同家 API 的 ZIP。
  2. 日期格式是 `"12  6 2022 12:00AM"`（月 日 年，月日可能單位數且夾雙空格）。含 1911 年佔位日期，化粧品有一筆 2819 年、刊播日期有 2214 年。
  3. **無主鍵**。六欄複合（產品、廠商、機關、處分日、刊播日、媒體）仍有重複列：食品 546、藥品 13、化粧品 135、醫材 44。
  4. `違規廠商名稱或負責人` 欄是「公司／負責人」格式，**負責人姓名只做半遮蔽**（例：`林O惠`）；36,081／60,773 的食品列帶有類似遮蔽格式。
  5. `查處情形` 值含**「未違規結案」**（食品 1,066、藥品 307、化粧品 859、醫材 339）與「輔導結案」，**前者不是違規**；食品檔 2,469 列為 null。直接當「違規廣告」列出會把「經查未違規」的廠商標成違規，見 §7 D4。
- **主機風險**：`data.fda.gov.tw` 已被上線中的 `drugs` 工具使用（`tfdaDrugAppearance.ts`、`tfdaDrugIngredients.ts`、`tfdaPharmacies.ts`），視為可達。**風險在記憶體而非網路**：23.4 MB JSON 的 `JSON.parse` 峰值未量測，主機 V8 heap 上限 768 MB、cron 在 heap 550 MB 以上會跳過（`registerJobs.ts` 的 `CRON_MEMORY_CEILING_HEAP_USED_MB`）。→ B-3 把「量測峰值」列為驗收條件，超標則改成 GitHub runner 解析後分批經 SSH loopback POST（既有 `disaster-points-sync.yml`／`gha-npo-sync.mjs` 同型）。
- **互連**：與 `anti-fraud` 互相加入 `relatedSlugs`（計畫第 2 期要求）。

#### A-2 藥品短缺與回收併入 `drugs`

| 子來源 | data.gov.tw | URL | 格式 | 筆數（實測） | 備註 |
|---|---|---|---|---|---|
| 經評估有替代藥品（短缺） | [54504](https://data.gov.tw/dataset/54504) | `.../export/104/json` | 純 JSON | **238**（研究文件寫 237）；公告更新時間 2020/11/25–2026/10/07 | 許可證字號 236 個不重複，**不能單獨當鍵** |
| 經評估無替代藥品 | [54505](https://data.gov.tw/dataset/54505) | `.../export/105/json` | 純 JSON | **0 筆真實資料**：檔案只有一列 `{"編號":"沒有資料", ...null}` | 解析器要認得佔位列並回傳空陣列；日後有資料時格式與 54504 相同 |
| 回收藥品 | [6947](https://data.gov.tw/dataset/6947) | `.../export/34/json` | 純 JSON | 1,713；日期 2008-08-29 至 2026-08-26 | (文號, 許可證字號, 批號) 1,713 列皆不重複；2 列無許可證字號；**回收分級髒**：`1`／`2`／`第二級`／`第2級`／`二`／`疑似第一級`／`-`／空白並存，需正規化 |

- **落點**：專屬表 `drug_shortages`（最新狀態表，整批以快照對帳，缺貨解除後該列要消失）、`drug_recalls`（事件檔，只增不刪）。以 `license_no` 與既有 `drugs` 表連結，在藥品詳細結果顯示「目前短缺」「曾被回收」標籤。
- **更新頻率**：目錄 API 對短缺（54504／54505）寫每 7 日；回收（6947）的 `regularupdate` 為 `2`（含義未驗證）。
- **主機風險**：同 A-1，低。

#### A-3 邊境查驗不合格食品併入 `food-safety`

| 資料集 | URL | 格式 | 筆數（實測） | 日期範圍 |
|---|---|---|---|---|
| [6133](https://data.gov.tw/dataset/6133) 不符合食品資訊 | `.../export/52/json`（亦有 CSV，2.1 MB） | 純 JSON，2.8 MB | 2,632（研究文件寫 2,625，已成長） | 發布日 2023-01-03 至 2026-10-13（滾動約 3.8 年） |

- 欄位：產地、主旨、原因、進口商名稱、進口商地址、貨品分類號列、檢驗方法、不合格原因暨檢出量詳細說明、法規限量標準、製造廠或出口商名稱、牌名、重量、處置情形、發布日期、報驗受理日期、附圖（FDA 圖片連結，2,632 列皆有）。70 個產地，前三為中國大陸 603、日本 403、越南 286。
- **無主鍵**：8 欄複合鍵仍有 145 筆重複，改用整列雜湊並以序號區分完全相同的列（見 §4）。
- **落點**：專屬表 `border_food_rejections`（滾動快照）。**不轉載附圖**（外連圖片不穩、版權未驗證），不顯示進口商地址。
- **主機風險**：低（`data.fda.gov.tw`）。

#### A-4（選配，不在計畫第 2、3 期清單）常見濫用管制藥品辨識

[6944](https://data.gov.tw/dataset/6944)，`.../export/50/json`，**實測 23 筆**，37.9 KB，欄位：類別、藥物名稱、俗名、分級、醫療用途、濫用方式、說明、圖片、圖片文字。研究文件 §2.2 建議作為成癮防治分頁的衛教區塊，但計畫第 1 期沒有收。落點：靜態內容或小表，主機風險低。放 B-7 作選配，產品擁有者不要就整張刪。

### 2.2 婦幼長照

**沒有未上線的資料集。** 計畫第 2 期原列的「產後護理之家」已隨 115950 在 #612／#623 上線。研究文件其餘相關候選都不可做：抗蛇毒血清儲備醫院與旅遊醫學門診在 `od.cdc.gov.tw`，正式主機與 GitHub runner 皆被擋（計畫 Q5，已知）。

**唯一待辦：115950 到貨驗證。** 證據鏈：

- 2026-10-15 10:58 UTC 的 egress probe（Actions run `38724026473`）：`nhplatform.mohw.gov.tw` 從正式主機 `curl` 為 `exit=28 http_code=000`（逾時 20 秒），從 GitHub runner 為 `000000`（逾時）。同一次 probe 的對照組 `data.gov.tw` 從主機回 200，所以不是 probe 本身壞掉。
- 同為 `*.mohw.gov.tw` 的 `opendata.mohw.gov.tw`（160903）也是兩邊都逾時，`runSync.ts` 檔尾註解已記錄該家族為「兩邊皆不通」，現行做法是從住宅網路手動跑 `scripts/import-mohw-*.mjs`。
- 本文從開發者網路 `curl` 該 URL 回 200，所以資料本身存在，是 IP 範圍封鎖。
- `postpartum_care` 與新增的 `long_term_care` 護理之家／居家護理所列**在正式 DB 實際有沒有資料：未驗證**（本文沒有查 production DB，也沒有讀 `.env`）。

→ B-8：先重跑 probe 排除一次性逾時，再打 live `/api/facilities?type=postpartum_care` 看筆數；若確實為 0，採手動匯入腳本並列入 six-monthly 人工清單。**不建 runner relay**（runner 也不通）。

### 2.3 治安生活

#### C-1 失物招領（新工具，建議分類 `life-culture`）

- **資料集**：[7317](https://data.gov.tw/dataset/7317)，`https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/E1060AE4-ACCE-4960-9EDC-EF52681B9570/resource/82770E4D-D01D-441F-9FD4-FBE1E7B086F6/download`。
- **格式（實測）**：CSV，UTF-8 含 BOM，**28,867,562 位元組**；**前兩列是表頭**（第 1 列英文代碼 `OP_AC_RCNO...`、第 2 列中文欄名），第 3 列起才是資料；日期值被單引號包住（`'202604150101'`）。
- **筆數（實測）**：88,580（研究文件 88,278），收據編號 88,580 個不重複，受理警局 34 個。拾得日期 2026-04-15 起（約 6 個月的滾動視窗，公告期間六個月）；**另有壞值日期**（最大值 `211360621530`）。
- **欄位**：收據編號、受理單位警局／分局／派出所、拾得日期時間、拾得地點（街道門牌文字）、公告內容（自由文字）。**無座標**。
- **隱私（實測）**：公告內容自由文字含：手機 IMEI（15 位數）、SIM 卡號、行動電話門號（`0905079449`）、證件末碼（`身分證1張（末3碼202）`；`末3碼／末4碼` 字樣共 1,320 列）、銀行卡片資訊。必須遮蔽，見 §7 D3。
- **落點**：專屬表 `lost_found_items`，UNIQUE KEY 只用 `receipt_no`。滾動視窗：每次成功抓到完整快照後刪除不在快照內的列（需下限防呆，見 §4）。
- **更新頻率**：目錄 API 的 `regularupdate` 為 `2`（含義未驗證）；檔案實測是 2026-04-15 起的滾動視窗，研究文件寫每日。
- **主機風險**：`opdadm.moi.gov.tw` 已被上線中的 176455／7505 使用，視為可達；**但 28.9 MB 單檔的記憶體峰值未量測**（理由同 A-1）。7318（拾得人姓名）**不接**。

#### C-2 最近的派出所（「我附近」新類型，不新增工具）

- **資料集**：[5958](https://data.gov.tw/dataset/5958)，`https://www.tgos.tw/tgos/VirtualDir/Product/9927eb8a-efed-40c0-8bc4-83121ad6834a/1150930.zip`。
- **格式（實測）**：ZIP（61.9 KB）內含 `PoliceAddress1_1150930.csv`（UTF-8）與 `manifest.csv`。欄位：中文單位名稱、英文單位名稱、郵遞區號、地址、電話、`POINT_X`、`POINT_Y`（TWD97 公尺）。
- **筆數（實測）**：1,687（研究文件 1,686）。名稱含「派出所」1,282、「分駐所」212，其餘為警察局與分局。
- **URL 帶日期**：檔名 `1150930.zip` 是發布日，下次更新網址會變。每次同步要先打 `https://data.gov.tw/api/v2/rest/dataset/5958` 取最新 `resourceDownloadUrl`（本文實測該 API 回 200，且 probe 對照組 `data.gov.tw` 從正式主機通）。
- **座標陷阱（實測）**：43 筆 `POINT_X < 150000`（澎湖 28、金門 9、連江 6），這些是 **TWD97 119°E 帶**（澎湖例：X=103598）。現有 `lib/server/facilities/twd97.ts` 只實作 121°E 帶，用它轉會超出台灣邊界而回 `null`。需擴充中央經線參數，或讓這 43 筆走既有 geocode 批次。
  - **實作時更正（#677，2026-10-16 逐列實測）**：上面這段「119°E 帶、現有 `twd97.ts` 轉不了」**不成立**。1150930 版的離島列（含 `POINT_X < 150000` 的 43 筆與東引共 44 筆）其實是 **121°E 中央經線、東偏移延伸到台灣西岸之外**（金門的 X 甚至是負值，如 −21575），現有 121°E 反算對全部 44 筆都回非 `null` 且落在正確的縣（用獨立的 Krüger 正算反驗，誤差 < 1 公尺）；把同一組數字當 119°E 讀反而會掉進台灣海峽。另發現一筆資料缺陷：`豐丘派出所` 的 `POINT_Y` 是 `POINT_X` 的複本（235144.53），該列沿用同址 `信義分局`／`信義派出所` 的座標。`twd97.ts` 仍加上 `centralMeridianDeg` 參數，匯入時依「該列地址所屬縣是否包住 121°E 讀值」才改試 119°E，以防日後發布端改版。
- **落點**：facilities，`source_key = police_station_5958`、`facility_type = police_station`；加入 `lib/server/nearby/registry` 並與 `child-safety-spots` 互連。
- **主機風險**：**`www.tgos.tw`（檔案下載）已驗證不通**：2026-10-15 egress probe（run `38764893673`）顯示從正式主機與 GitHub runner **兩邊都回 403**。從住宅網路各種 User-Agent（無、curl、Chrome、node、python-requests）與有無 Referer 一律 200，因此是 IP 範圍封鎖，不是標頭問題，也沒有 runner relay 可走。→ 改採「住宅網路手動匯入」：`scripts/import-police-stations-5958.mjs`（#677），列入 six-monthly 人工清單；`data.gov.tw` 解析 API 兩邊皆通，用來取每次發布的最新 ZIP 網址。伺服器端程式連的 `addr.tgos.tw`（地理編碼，`geocodeProviders.ts`）是另一個主機，不受影響。

#### C-3 交通事故熱點（新工具，**受 §7 D2 管制**）

- **A1** [12818](https://data.gov.tw/dataset/12818)：`.../dataset/02D40248-.../resource/0E48174B-.../download`，CSV 1.78 MB。**實測**：2,845 列＝2,843 筆 A1 資料列（每一列是一位**當事者**，不是一起事故）＋2 行註記（「資料提供日期：115年10月12日」「事故類別：A1類」，**會被誤判為資料列**）。去重後約 **1,109 起事故**，2026-01-01 至 2026-10-05，2,843 列有經緯度。**51 欄**，含當事者性別、年齡、飲酒駕駛、保護裝備、行動電話使用等個人屬性。
- **空間分布（實測）**：2,843 列當事者資料（約 1,109 起事故）只落在約 1,005 個 0.01° 格（約 1 公里），最擁擠的格也只有 18 列。**A1 單獨做不出「熱點」**，絕大多數事故各自獨立成一格。
- **A2** [13139](https://data.gov.tw/dataset/13139)：**每月一個 ZIP**，`115_NPA_TMA2_01` 至 `_09` 共 9 個。實測 1 月 ZIP 3.6 MB，**解壓後 51,243,735 位元組、80,621 行**，欄位與 A1 相同（含經緯度與當事者屬性）。全年約 9 個月 × 50 MB。
- **TDX 道安 v1 `/TrafficAccident/Rank`**：**未驗證**（研究文件也只看過 swagger，沒帶 token 實打；本文也沒有）。不要依賴它。
- **落點**：只能在 GitHub runner 側下載、聚合成「約 1 公里格 × 近 12 個月事故數／死亡受傷數」的小表，再經 SSH loopback POST 進主機（不是把 450 MB CSV 帶進 768 MB heap 的主機）。專屬表 `traffic_accident_grid`，UNIQUE KEY 只用 `grid_id`（近 12 個月合計，每月整批覆蓋，**不含月份**）。
- **主機風險**：`opdadm.moi.gov.tw` 已用；但 runner 端能否連該路徑**未驗證**（probe）。

### 2.4 生活環境

#### D-1 垃圾車與清潔隊（升級既有 `cleaning-squads`，分類 `environment-food`）

**路線／清運點（每天入庫一次）**

| 縣市 | data.gov.tw | URL | 格式 | 筆數（實測） | 欄位重點 |
|---|---|---|---|---|---|
| 臺北 | [136515](https://data.gov.tw/dataset/136515) | `https://data.taipei/api/dataset/6bb3304b-4f46-4bb0-8cd1-60c66dcd1cae/resource/a6e90031-7ec4-4089-afb5-361a4efe7202/download` | CSV 558 KB | 4,012 | 行政區、里別、分隊、局編、車號、路線、車次、抵達時間（`1630` 即 HHMM）、離開時間、地點、經度、緯度 |
| 新北 | [125664](https://data.gov.tw/dataset/125664) | `https://data.ntpc.gov.tw/api/datasets/edc3ad26-8ae7-4916-a00b-bc6048d19bf8/csv/file` | CSV 3.6 MB | 26,583 | 行政區、路線代碼、路線名稱、停靠序、地點、里、經緯度、時間、備註，以及**一般垃圾／資源回收／廚餘 × 週日至週六**共 21 個 Y 旗標 |

**即時位置（使用者開頁才取，記憶體快取 60–120 秒，不入庫，決策 #13）**

| 縣市 | data.gov.tw | URL | 格式與形狀（實測，2026-10-15 22:27 夜間取樣） |
|---|---|---|---|
| 新北 | [122972](https://data.gov.tw/dataset/122972)（目錄寫每 2 分鐘） | `https://data.ntpc.gov.tw/api/datasets/28ab4122-60e1-4065-98e5-abccb69aaca6/csv/file` | CSV，11 列：lineid, car, time（`2026/10/15 22:27:22`）, location, longitude, latitude, cityid, cityname |
| 臺中 | [83558](https://data.gov.tw/dataset/83558)（每 10 分鐘） | `https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=c923ad20-2ec6-43b9-b3ab-54527e99f7bc` | JSON 陣列，663 列，欄位全為字串：lineid, car, time（`20261015T221648`）, location, X, Y, SpeedValue, OverSpeed。**時間範圍從 2025-09-29 到 2026-10-15，638 列速度為 0**，含停在汙水處理廠的車，**必須依時間新鮮度過濾**，否則會把一年前的位置畫在地圖上 |
| 臺南 | [136310](https://data.gov.tw/dataset/136310) | `https://soa.tainan.gov.tw/Api/Service/Get/2c8a70d5-06f2-4353-9e92-c40d33bcd969` | 外包一層 `{contentType,isImage,size,data:[...]}`，13 列：linid, car, time（`2026-10-15 22:24:41`）, location, x, y |
| 高雄 | [138256](https://data.gov.tw/dataset/138256) | `https://openapi.kcg.gov.tw/Api/Service/Get/aaf4ce4b-4ca8-43de-bfaf-6dc97e89cac0` | 外包一層 `{contentType,isImage,data:[...]}`，133 列，時間為 ISO（`2026-10-15T22:26:55`） |

- **覆蓋範圍（誠實標示）**：即時位置 4 市（新北、臺中、臺南、高雄）；路線／收運時間 2 市（臺北、新北）。桃園未找到資料集（研究文件）。臺北即時位置：**未驗證**（研究文件 #8 只列了臺北路線資料集）。高雄到點時間預估 [117726](https://data.gov.tw/dataset/117726) 未實打，**未驗證**。不得寫成「全國垃圾車」，吸取 #577「戒菸頁自稱全國」的教訓。
- **落點**：路線進專屬表 `garbage_route_stops`（UNIQUE KEY `(city, line_id, stop_rank)`，不含時間欄位；抵達時間是一般欄位），每個城市整批替換；即時位置**不入庫**，用 `memoizeQuery`（TTL 60–120 秒）。
- **主機風險**：`data.taipei`、`data.ntpc.gov.tw` 已有上線來源在用；**`newdatacenter.taichung.gov.tw`、`soa.tainan.gov.tw`、`openapi.kcg.gov.tw` 已有兒少／戒菸／母嬰來源引用，但 repo 內沒有任何針對正式主機的 probe 紀錄 → 未驗證**。即時位置是「開頁時才連」，連不到時要逐縣市降級，不能整頁掛掉。

#### D-2 林火風險併入 `outdoor-safety`

- **端點**：農業部 `https://data.moa.gov.tw/api/v1/ForestFireAlertWCF/`（OpenAPI：`https://data.moa.gov.tw/openapi.json`）。
- **實測**：JSON 陣列。**不帶參數回 3,001 列（381 KB）**＝61 個地點 × 50 個日期（2026-07-21 至 2026-10-15，日期不連續）的歷史；帶 `?CreateDate=2026-10-15` 只回 7.7 KB。欄位 `Code, CreateDate, error_msg（字串 "NULL"）, name, warn_level（0 安全 1 注意 2 警告 3 危險 4 最危險）, warn_level_chinese`。當日分布：安全 41、注意 14、警告 4、最危險 2。
- **沒有座標**。61 個地點名稱為「某某國家森林遊樂區」等，需要靜態座標對照（建議人工建立 61 筆 seed 並標註來源，或走既有 geocode）。座標來源**未驗證**。
- **落點**：專屬表 `forest_fire_alerts`（最新狀態表，UNIQUE KEY `site_code`；`created_date` 與等級是一般欄位）。
- **主機風險**：`data.moa.gov.tw` 已有上線來源（病蟲害、土石流）。此 `/api/v1/` 路徑與現用的 `Service/OpenData/TransService.aspx` 不同，路徑層級的可達性**未驗證**，但主機相同，風險低。
- **授權與條款**：MOA OpenAPI 的使用條款**未驗證**。

#### D-3 自來水水質併入 `water-outages`（新增水質分頁）

| 資料集 | URL | 格式 | 實測內容 |
|---|---|---|---|
| [36605](https://data.gov.tw/dataset/36605) 用戶水質資訊公開 | `https://www.water.gov.tw/opendata/qual5.csv` | CSV（16.8 KB，含 BOM） | 340 列，**只有「總硬度」一個檢驗項目**，19 個縣市、鄉鎮區別；欄位：檢驗項目、縣市別、鄉鎮市區別、檢驗數值、單位。**檔內沒有日期欄** |
| [6308](https://data.gov.tw/dataset/6308) 水質資訊 | `https://www.water.gov.tw/opendata/new_opendata_waterquality.csv` | CSV（64.6 KB），**寬表** | **154 列**淨水場（給水系統）× 69 個檢驗項目；**前四列是表頭**（欄名、續行、飲用水水質標準、單位）；值含 `ND`、`<1`、`－－`；末段為「更新日期：2026/09/23」「備註」等頁尾行；區處代碼帶前置單引號（`'0101`）；淨水場名稱欄內嵌地址與 `[0162030]` 形式的代碼（作為鍵的唯一性**未驗證**）；最後一欄「水質合格否(Y/N)」 |

- **目錄 `modifiedDate` 兩者皆為 2025-11-14，但 6308 檔內更新日期是 2026/09/23**：又一次詮釋資料不可信，採用檔內頁尾日期。
- **覆蓋範圍限制（檔內聲明）**：「以台灣自來水公司供水轄區範圍為主」。36605 只有 19 縣市，臺北市（北水處）與金門不在其中。頁面必須寫明，**不可讓使用者以為「查不到＝水質不好」或「全國」**。
- **落點**：專屬表 `water_hardness_township`（UNIQUE `(county, district)`）、`water_plant_quality`（UNIQUE `plant_code`，檢驗值放 JSON 欄）；`source_updated_on` 是一般欄位。更新頻率目錄寫每 3 個月（36605）／每月（6308）。
- **主機風險**：`www.water.gov.tw` 已被上線的停水公告使用，低。

#### D-4 今日菜價（新工具，建議分類 `life-culture`）

- **端點**：`https://data.moa.gov.tw/api/v1/AgriProductsTransType/`；參數 `Start_time`、`End_time`（民國 `115.10.14`）、`CropCode`、`CropName`、`MarketName`、`Page`、`TcType`。
- **回應（實測）**：`{"RS":"OK","Data":[...],"Next":true}`，欄位 `TransDate, TcType（N04 蔬菜／N05 水果／N06 其他，未驗證代碼含義）, CropCode, CropName, MarketCode, MarketName, Upper_Price, Middle_Price, Lower_Price, Avg_Price, Trans_Quantity`。
- **重大限制（實測）**：不帶 `MarketName` 時每頁 1,000 列，**第 2 頁（`Page=2`）起回 `{"RS":"ERROR","MSG":"非會員只限回傳第一頁資料"}`**；`Page=0` 與 `Page=1` 都回 1,000 列。所以不分市場查詢，一天只拿得到 2,000 列左右，且前兩頁只有 4 個市場（台北一、台北二、台北市場、板橋區）。
- **繞法（實測有效）**：加上 `MarketName` 後每個市場 < 1,000 列，不觸發分頁。已實測 20 個市場名稱各 5 至 446 列（台中市 446、高雄市 410、台北一 326、台北市場 322、台北二 302、三重區 242、台南市 220、板橋區 217…），加總約 3,400 列／日。**完整市場名單未驗證**（本文只用猜測的名稱探測，沒有找到官方市場代碼表），上線前要有完整名單來源。
- **休市／發布時間**：2026-10-16（未來日）回 0 列；2026-10-04（週日）仍回 1,000 列，所以「休市日」定義**未驗證**；當日資料何時完整**未驗證**。
- **落點**：專屬表 `produce_price_daily`。這是**真正的時間序表**，UNIQUE KEY `(trans_date, market_code, crop_code)` 必須含日期（同一天重跑是 UPDATE，不會膨脹），但**必須有保留期限**（建議 14 天，見 §7 D1）並在 `dbConventions` 測試登記為時間序例外，比照 `police_fraud_interdiction_period` 的前例。
- **主機風險**：`data.moa.gov.tw` 已用，低。

---

## 3. 主機可達性彙整（正式主機 HawkHost 為資料中心 IP）

證據來源：`.github/workflows/egress-probe.yml`、`scripts/gha-egress-probe-host.mjs`、2026-10-15 的 run `38724026473`（main）與 `38707357085`（diag 分支），以及 `runSync.ts` 檔尾與各來源檔的註解。

| 主機 | 本 spec 用到 | 狀態 |
|---|---|---|
| `data.fda.gov.tw` | A-1／A-2／A-3／A-4 | 已被上線工具使用，視為可達 |
| `opdadm.moi.gov.tw` | C-1、C-3 | 已被上線的 176455／7505／避難所使用，視為可達（具體 resource 路徑**未個別驗證**） |
| `data.gov.tw`（API） | C-2 解析最新下載網址 | 2026-10-15 probe 對照組從正式主機回 200 |
| `www.water.gov.tw` | D-3 | 已被上線的停水公告使用，視為可達 |
| `data.moa.gov.tw` | D-2 | **主機與 runner 皆 200**（run `38764893673`，`ForestFireAlertWCF` 7,765 bytes，2026-10-15）；B-12 可由主機直接抓 |
| `data.taipei` | D-1 臺北路線 | 2026-10-15 probe：正式主機對 133345 資源回 200 |
| `data.ntpc.gov.tw` | D-1 新北 | **主機與 runner 皆 200**（run `38764893673`）：125664 路線 3.6 MB（主機約 8 秒）、122972 即時位置 196 bytes（約 0.4 秒）；B-16／B-17 可由主機直接抓 |
| `www.tgos.tw` | C-2 | **主機與 runner 皆 403**（run `38764893673`，5958 ZIP）；`data.gov.tw` 解析 API 兩邊皆 200。runner 抓取＋SSH loopback 也行不通 → B-9 改走**住宅網路手動匯入**（#677，`scripts/import-police-stations-5958.mjs`）；住宅網路各種 User-Agent／Referer 都是 200，確認是 IP 範圍封鎖而非標頭問題 |
| `newdatacenter.taichung.gov.tw` | D-1 即時位置 | **主機與 runner 皆 200**（run `38764893673`，83558，約 1.3 秒）→ B-18 只做臺中（#680） |
| `soa.tainan.gov.tw`、`openapi.kcg.gov.tw` | D-1 即時位置 | **主機與 runner 皆逾時 20 秒**（run `38764893673`）→ 臺南、高雄在覆蓋表標「暫無即時資料」，不做 |
| `nhplatform.mohw.gov.tw` | §2.2 | **主機與 runner 兩邊逾時**（2026-10-15，run `38764893673` 再次確認），非 relay 能解；走住宅網路手動匯入（#678，D7） |
| 已知封鎖（不得使用）：`od.cdc.gov.tw`、`nhi.gov.tw`、`opendata.mohw.gov.tw`、`ltcpap.mohw.gov.tw` | — | 見 [11-hosting-ops-incidents.md](../domains/11-hosting-ops-incidents.md)、[07](../domains/07-tools-disaster-environment-energy.md) |

處置規則（沿用既有慣例）：被資料中心 IP 擋、但 GitHub runner 通的，由 runner 抓取後經 **SSH loopback**（`scripts/lib/ssh-loopback.mjs`）POST 回主機，**不打公開網址**（Cloudflare 會對 runner 發 JS 挑戰）；HawkHost 已關 `AllowTcpForwarding`，不可用 `-L` 轉發。

---

## 4. 跨切片硬約束

1. **UNIQUE KEY 不含時間欄位**（最新狀態表）。本文所有表的鍵設計見 §2；唯一例外是 `produce_price_daily`（真正的時間序，含保留期限）。每個新表要比照 `lib/server/antiFraud/dbConventions.test.mjs` 增加「鍵欄位不得符合 `/year|month|date|time|seen|at$/i`」的原始碼測試，時間序例外要在測試裡明確登記並註解理由。
2. **滾動快照對帳**（失物招領、違規廣告、邊境食品、藥品短缺、垃圾車路線）：upsert 成功後，刪除該來源「本次沒看到」的列，但必須先過防呆：抓到的列數須 ≥ 上次列數的 50%（或絕對下限），否則視為異常來源而不刪、記入 `ingest_errors`。比照 `runFacilitySync` 的「先 fetch、非空才 delete」原則（`replaceBaselineForCounty`）。
3. **新 cron 分鐘不得與 `registerJobs.ts` 既有分鐘碰撞**。盤點既有每小時格線被佔用的分鐘：0、3、5、7、8、10、12、13、14、15、16、17、18、20、22、23、25、27、30、33、35、37、38、40、42、43、44、45、46、47、48、50、52、53、57，以及所有 5 的倍數（YouBike `*/5`；YouBike 已於 2026-10-21 隨 #727 移除，該分鐘格線現已空出）。**下列提議分鐘都不在格線上**，動工前仍須重新對照當時的 `registerJobs.ts`：

   | 工作 | 提議 cron | 理由 |
   |---|---|---|
   | FDA 每週同步（廣告 4 檔、短缺、回收、邊境食品，依序 `runSource`） | `34 2 * * 1` | 2 點區段只有 cdc 的 `15 2`；避開 4 點擁擠區 |
   | 林火 | `9 6,12 * * *` | 9 不在格線；6、12 點已有 culture(10)、pest(12)、who(19)，分鐘不同 |
   | 水質 | `29 5 2 * *` | 29 不在格線；每月 2 日 |
   | 菜價 | `31 11,17 * * *` | 31 不在格線；實際發布時間確認後再調 |
   | 垃圾車路線 | `41 3 * * *` | 41 不在格線；3 點區段已有 15、20、25、30 |
   | 失物招領（含過期列清理） | `26 6 * * *` | 26 不在格線 |
   | 派出所 | `49 3 3 * *` | 49 不在格線；每月 3 日 |
   | GitHub Actions：事故格網月彙整 | `37 18 4 * *`（UTC） | 既有 Actions 分鐘：0、30、10、40、20、50、25、45、13、15；37 未用 |

   **附帶發現**：`registerJobs.ts` 現有兩個 job 同樣排在 `30 4 * * *`（green-products 與 wra-catalog），已是既存碰撞。本 spec 不處理，但 B-0 的 cron 分鐘 lint 會把它列為已知例外。
4. **新 `/api/*` 路由必須自帶明確的 `Cache-Control`**。未標示的路由會落到上游預設 `max-age=1800`（commit `5e201bc` 對 `/api/facilities` 的修正已證實；其他未標示路由仍暴露）。即時垃圾車路由用 `s-maxage` ≤ 60；其餘每日資料用符合更新頻率的值。
5. **每個 PR 部署後打 live API 驗證**，不能只看測試全綠；deploy 之後 DB 是空的，要用 admin 觸發端點或手動 workflow 先跑一次同步（比照 #585 `anti-fraud-addiction-news-sync-manual.yml`），並避開 :15–:30、:45–:00 以外的部署時段。
6. **不用全域 `fetch()`**：主機的 `ulimit -v` 會讓 undici 的 WASM 解析器 OOM，一律走 `lib/server/net/httpClient.ts`。
7. **不讀 `.env` 與任何憑證**。本 spec 與後續實作都不需要新的金鑰（MOA 會員／API key 見 §7 D5）。
8. **資料新鮮度標示**：每個工具頁顯示資料來源與「資料日期」（以檔內日期為準，不用 data.gov.tw 詮釋資料日期，本文已多次證明它不可信）。

---

## 5. 測試縫（每項）

通用做法：解析器是 `(text 或 buffer) → records` 的純函式，附 `__fixtures__/` 取樣檔；DB 相關只做原始碼文字測試（比照 `dbConventions.test.mjs`），不連真實 MySQL。

| 項目 | 縫 | 要驗的行為 |
|---|---|---|
| A-1 廣告 | `parseHealthAdViolations(buffer, category)` | 靠 `PK` 檔頭分辨 ZIP／純 JSON；日期 `"12  6 2022 12:00AM"` → ISO；1911 與 2819／2214 壞日期 → null 而非丟例外；`處分日期 > 今天 + 1 年` 視為壞值；`查處情形`＝「未違規結案」標記為不顯示；廠商欄拆「公司」與「負責人」，只輸出公司；整列雜湊的穩定性（欄位順序變動不改雜湊）；重複列合併計數 |
| A-1 廣告 | `reconcileSnapshot()` | 空回應或列數 < 50% 時不刪除；第二次同步零新增（冪等） |
| A-1 廣告 | 記憶體 | 以 23 MB 真實規模 fixture 量 `process.memoryUsage().heapUsed` 峰值，驗收門檻在 B-3 定（建議 < 150 MB 增量），超標走 runner 路徑 |
| A-2 短缺 | `parseDrugShortages()` | `編號:"沒有資料"` 佔位列 → 空陣列（54505 現況）；`許可證字號` 重複列各自保留；與 `drugs.license_no` 連結（找不到時不報錯） |
| A-2 回收 | `normalizeRecallLevel()` | `1／2／3／第二級／第2級／二／疑似第一級／-／空白` → `{1,2,3,null}`；無許可證字號的 2 列仍入庫 |
| A-3 邊境食品 | `parseBorderRejections()` | 完全相同的列以序號區分；不輸出進口商地址與附圖；`發布日期` 滾動視窗對帳 |
| C-1 失物 | `parseLostFoundCsv()` | 跳過第 2 列中文欄名；去除日期單引號；壞日期 `211360621530` → null；BOM；串流／分塊（不一次建 28.9 MB 字串，若實作選擇一次建則要量記憶體） |
| C-1 失物 | `redactLostFoundContent()` | 連續 ≥ 6 位數字（IMEI、SIM、門號、卡號）→ 遮蔽；`末N碼` 片段移除；`09\d{8}` 門號遮蔽；保留物品類別文字（「手機1支」仍可讀）；對 fixture 全量斷言「輸出不含 15 位連續數字」 |
| C-2 派出所 | `parsePoliceStations(zipBuffer)` | 解 ZIP、取非 manifest 的 CSV；`POINT_X < 150000` 走 119°E 帶；轉換結果落在該縣邊界內（澎湖 28／金門 9／連江 6 的抽樣）；`resolveLatestDownloadUrl()` 對 `data.gov.tw` API 回應 fixture 取 `resourceDownloadUrl` |
| C-2 派出所 | `twd97.test.mjs` 擴充 | 新增 119°E 參數的雙向既知點測試，121°E 既有測試不得退化 |
| C-3 事故格網 | `aggregateAccidentsToGrid(rows)` | 忽略尾端兩行註記；同一起事故多位當事者只算一起（以日期＋時間＋地點去重）；格網 id 穩定；**輸出不含任何當事者欄位**（性別、年齡、飲酒、保護裝備）；格內事故數 < N 的格不輸出 |
| C-3 事故格網 | 原始碼測試 | 表鍵只有 `grid_id` |
| D-1 路線 | `parseTaipeiRoutes()`／`parseNtpcRoutes()` | `1630` → `16:30`；新北 21 個 Y 旗標 → 星期集合；空座標略過；各城市整批替換、一個城市失敗不影響另一個 |
| D-1 即時 | 4 個轉接器 `adaptNtpc/Taichung/Tainan/Kaohsiung(raw) → TruckPosition[]` | 臺中 `20261015T221648` 與臺南／高雄時間格式統一；**過濾超過 N 分鐘未更新的車（臺中 fixture 內含 2025-09-29 的列）**；經緯度字串轉數字、座標落在該縣市範圍；外層包裝 `{data:[...]}` 的差異 |
| D-1 即時 | `getLiveTrucks(city, { fetcher, now })` | 注入 fetcher 與時鐘：60–120 秒內第二次呼叫不再打上游；**同時多個請求只觸發一次上游**（現有 `memoizeQuery` **沒有 in-flight 去重**，需補或另包）；上游失敗不快取錯誤、回傳逐縣市降級狀態 |
| D-1 即時 | 路由 | 回應含 `Cache-Control: ... s-maxage<=60`；不記錄使用者經緯度 |
| D-2 林火 | `parseForestFire(json, today)` | 只取當日列；`error_msg:"NULL"` 字串視為無錯誤；未知等級值 → 不顯示而非當安全；61 筆地點對座標 seed 的完整性測試（缺座標的地點列入測試失敗） |
| D-3 水質 | `parseWaterHardness()` | 340 列；BOM |
| D-3 水質 | `parseWaterPlantQuality()` | 跳過前三列表頭與頁尾備註；擷取「更新日期：2026/09/23」；`ND`／`<1`／`－－` 保持原字串不當數字；前置單引號去除；`水質合格否` 為 N 的列有明顯標示 |
| D-4 菜價 | `parseProducePrices()` | `115.10.14` → 2026-10-14；`RS:"ERROR"`（非會員限制）視為錯誤而非空資料；`Next:true` 但被限制時不無限迴圈 |
| D-4 菜價 | `fetchAllMarkets(marketList, { fetcher })` | 每個市場一次查詢；單一市場失敗不影響其他；市場名單來源的測試 |
| D-4 菜價 | 原始碼測試 | 鍵 `(trans_date, market_code, crop_code)` 登記為時間序例外；保留期限清理存在 |
| 全部新工具 | `catalog.test.mjs` | 計數改為結構性檢查（B-0），每個新 slug 恰屬一個 `group`、有 `keywords`／`directAnswer`／`lastUpdated` |
| cron | `registerJobs` 文字測試 | 解析所有 `cron.schedule` 運算式，斷言新 job 的 `(分鐘, 小時, 日, 星期)` 不與其他 job 同 tick，已知例外 `30 4 * * *` 白名單 |

---

## 6. 垂直切片與 blocking edges

原則：每張 ticket 是一條可獨立上線、可獨立 live 驗證的端到端切片（資料取得 → 解析 → 表／facilities → API → 頁面 → catalog／導流 → 測試 → 部署後 live 打 API）；不做只有資料沒有畫面的橫向切片。新增工具的 ticket 受 B-0 的計數結構化檢查前置（歷史上 catalog 計數器在兩個 PR 同時改成相同字面值時 git 不會報衝突，已撞過多次）。

```
B-0 ──┬─> B-1 ──┬─> B-2
      │        └─> B-3
      ├─> B-8   (probe 結果)
      ├─> B-9   (www.tgos.tw 結果)
      ├─> B-10  (D3)
      ├─> B-11  (D2，並需 runner 端 probe)
      ├─> B-15
      └─> B-17 (data.ntpc 結果) ─> B-18
B-4 ─> B-5
B-13 ─> B-14
B-16 ─> B-17
無前置：B-4、B-6、B-7、B-12、B-13、B-16
```

| ID | 標題 | 內容（一句話的垂直範圍） | 阻擋（前置） | 上線驗證 |
|---|---|---|---|---|
| **B-0** | 基礎設施：計數結構化、cron 分鐘 lint、probe 擴充 | (1) `catalog.test.mjs` 的 `EXPECTED_COUNTS`／`TOOL_CATALOG.length` 改成結構性檢查（每組 8–15、每工具恰一組）；(2) `registerJobs` cron 衝突 lint；(3) 把 §3 標「未驗證」的主機加入 `egress-probe.yml` 與 `gha-egress-probe-host.mjs`，跑一次並把結果回填本文 §3 | 無 | probe run 輸出貼進 PR；無使用者可見變更 |
| **B-1** | 違規藥品廣告查詢（新工具首個切片） | 14196（4,003 筆）→ `health_ad_violations` → API → 工具頁（搜尋產品／廠商、依年份、查處情形標籤）→ catalog（`environment-food`）→ 與 `anti-fraud` 互連 → FDA 每週 cron | B-0 | live `/api/...` 筆數 ≈ 4,003 扣除不顯示的「未違規結案」；同步第二次零新增 |
| **B-2** | 加入醫材與化粧品廣告 | 14197（5,890）＋14198（30,369，13.7 MB）沿用 B-1 的表與頁，加「類別」篩選 | B-1 | 類別篩選三類皆有資料；heap 峰值紀錄 |
| **B-3** | 加入食品廣告（大檔） | 6949（ZIP→23.4 MB JSON，60,773）；**驗收含記憶體峰值量測**，超標改 runner 解析＋SSH loopback POST；是否只保留近 3 年見 D4 | B-1 | 記憶體峰值寫進 PR；總筆數與 D4 保留策略一致 |
| **B-4** | 藥品短缺併入 `drugs` | 54504（238）＋54505（空）→ `drug_shortages` → `drugs` 頁「短缺」標籤／分頁；與 `drugs.license_no` 連結 | 無 | live 筆數 238；54505 空檔不報錯 |
| **B-5** | 回收藥品併入 `drugs` | 6947（1,713）→ `drug_recalls` → 回收分頁與藥品詳細結果的「曾被回收」標籤；回收分級正規化 | B-4（共用分頁骨架） | live 筆數 1,713；分級值只剩 {1,2,3,未載明} |
| **B-6** | 邊境查驗不合格食品併入 `food-safety` | 6133（2,632）→ `border_food_rejections` → `food-safety` 新分頁（產地、原因、發布日篩選） | 無 | live 筆數 ≈ 2,632 − 完全重複的合併規則；頁面不含進口商地址與附圖 |
| **B-7** | （選配）常見濫用藥物辨識 | 6944（23 筆）→ 成癮防治分頁 `<details>` 衛教區塊（靜態或小表），用詞避免污名 | 無；需 D 之外的產品擁有者同意 | 23 項皆顯示俗名與分級 |
| **B-8** | 驗證 115950 到貨與備援 | 重跑 probe；打 live `postpartum_care`／`long_term_care` 護理之家筆數；若為 0 則新增手動匯入腳本流程（`import-mohw-*.mjs` 慣例）並登記 six-monthly 人工清單，頁面加「資料日期」與誠實說明 | B-0（probe 機制） | live 筆數 > 0 或頁面誠實標示「資料暫缺」 |
| **B-9** | 派出所進「我附近」 | 5958（1,687）→ facilities `police_station_5958`；119°E 帶轉換；`registry` 新類型；與 `child-safety-spots` 互連；每月解析最新 URL | B-0（`www.tgos.tw` probe；不通則改 runner 抓＋POST） | live `nearby` 回傳派出所；澎湖／金門抽樣 3 筆座標落在該縣 |
| **B-10** | 失物招領 | 7317 → `lost_found_items`（滾動快照＋遮蔽）→ 工具頁（縣市／分局篩選、關鍵字、拾得日）→ catalog → 每日 cron | B-0、D3 | live 抽查 100 筆內容欄**不含 ≥ 6 位連續數字**；筆數 ≈ 88,580 扣壞日期列；記憶體峰值紀錄 |
| **B-11** | 交通事故熱點（**受 D2 管制，最後做**） | runner 端 A2 月彙整 → `traffic_accident_grid` → 縣市層級「事故多發 1 公里格」清單＋說明與免責 → catalog | B-0、D2；runner 端能連 A2 的 probe 結果 | 表內無任何當事者欄位；格內數低於門檻不出現 |
| **B-12** | 林火風險併入 `outdoor-safety` | `ForestFireAlertWCF?CreateDate=今日` → `forest_fire_alerts`＋61 筆座標 seed → 戶外安全指數頁加林火區塊與等級色 | 無 | live 61 筆；等級分布與 MOA 當日一致 |
| **B-13** | 水質分頁（鄉鎮總硬度） | 36605（340）→ `water_hardness_township` → `water-outages` 新「水質」分頁，查縣市／鄉鎮，並寫明台水供水轄區限制 | 無 | live 340 筆；臺北市查詢時顯示「不在台水轄區」而非空白 |
| **B-14** | 水質分頁（淨水場合格表） | 6308 寬表 → `water_plant_quality` → 水質分頁加「淨水場檢驗結果」 | B-13 | live 154 筆；頁尾日期與檔內一致 |
| **B-15** | 今日菜價（新工具） | `AgriProductsTransType` 分市場查詢 → `produce_price_daily`（14 天保留）→ 工具頁（品名搜尋、各市場上中下價、與昨日比）→ catalog → cron | B-0 | live 最新一日 ≥ 3,000 筆；整天資料不被「非會員只回第一頁」截斷 |
| **B-16** | 垃圾車路線＋`cleaning-squads` 升級骨架 | 136515＋125664 → `garbage_route_stops` → `cleaning-squads` 改名「垃圾車與清潔隊」、加「路線與收運時間」分頁（臺北、新北）、覆蓋範圍表 | 無 | live 臺北 4,012＋新北 26,583 筆；非兩市查詢時顯示「尚無路線資料，請洽清潔隊」 |
| **B-17** | 垃圾車即時位置（新北，首個「開頁才取」切片） | 122972 → 轉接器＋`getLiveTrucks`（in-flight 去重、60–120 秒快取、逐縣市降級）→ 路由（`s-maxage` ≤ 60）→ 地圖圖層 | B-16；`data.ntpc.gov.tw` probe | 連打 5 次只有 1 次上游請求（看日誌）；回應 header 正確 |
| **B-18** | 即時位置擴到臺中、臺南、高雄 | 各縣市各自一個轉接器與測試，**每市可獨立上線**；臺中必須過濾過期位置 | B-17；各自主機 probe 通過 | 各市逐一 live；不通的市在覆蓋表標「暫無即時資料」 |

建議執行順序（價值／風險比）：B-0 → B-4、B-12、B-13、B-6、B-9 → B-1、B-5 → B-16、B-15、B-10 → B-17 → B-2、B-14、B-18、B-3 → B-8（與 B-0 的 probe 結果同步處理）→ B-11（最後，且必須先過 D2）。第 2 期（用藥食安＋婦幼長照）完成與驗證後才開第 3 期，維持決策 #14。

---

## 7. 只有產品擁有者能決定的事項（附建議預設）

| # | 問題 | 為什麼需要擁有者決定 | 建議預設 |
|---|---|---|---|
| **D1** | `life-culture` 的容量與 3 個新工具的落點（計畫 Q1） | 現況 12；失物招領、事故熱點、菜價全進來會 15，貼上限 15、零餘裕；`disaster-alerts` 現況 13，`environment-food` 現況 11（加上違規廣告後 12） | **失物招領、菜價進 `life-culture`（→ 14）；事故熱點（若做）進 `disaster-alerts`（→ 14）**，兩組各保留 1 個餘裕。菜價保留期限預設 14 天 |
| **D2** | 交通事故熱點要不要做、做到什麼程度 | 涉及：①公開特定路口的死傷統計是否有污名／道路管理單位爭議；②A1／A2 每列都含當事者性別、年齡、飲酒、手機使用等個資；③A1 單獨做不出熱點（約 1,109 起事故散在約 1,005 格），要做就得吃 A2 的 450 MB；④TDX 道安端點未驗證 | **最後做，且只做「縣市層級、約 1 公里格、近 12 個月、格內事故數 ≥ 門檻才顯示」，輸出完全不含當事者欄位，頁面寫明統計性質與限制；不顯示個案、不排名全國路口。** 若擁有者不同意，B-11 整張取消，其餘不受影響 |
| **D3** | 失物招領公告文字的遮蔽規則 | 原文含 IMEI、SIM、手機門號、證件末碼，公開轉載有被濫用於冒領或詐騙的風險（失主以外的人看到 IMEI／門號就能冒充） | **遮蔽 ≥ 6 位連續數字與「末N碼」片段，只保留物品類別與數量**（例：「手機1支（紅米、黑色）」）；拾得地點保留原文（警局本來就公告）；不顯示拾得人資訊（7318 不接）；頁面說明「詳情請洽受理派出所」 |
| **D4** | 違規健康廣告的呈現方式與保留年限 | 資料裡 ①`未違規結案`不是違規；②`輔導結案`語意較輕；③負責人姓名半遮蔽；④食品檔 6 萬列、化粧品 3 萬列，量大 | **預設隱藏「未違規結案」（不入搜尋、不顯示）；其餘三種結案狀態各用不同標籤，不一概稱「違規」；只顯示公司名、不顯示負責人欄；保留處分日近 3 年（約 18,000 列）。** 頁面標示「依衛福部食藥署公開資料，非本站判定」 |
| **D5** | 要不要申請農業部 API 會員／金鑰以解除「非會員只限回傳第一頁」 | 需要以個人或組織身分註冊，並把金鑰存進 secrets；本站原則是不新增憑證依賴，且 MOA 使用條款**未驗證** | **不申請**，以分市場查詢繞過（已實測有效）；若市場名單來源取不到或被進一步限流，再回頭決定 |
| **D6** | 垃圾車只覆蓋部分縣市是否仍上線 | 即時位置 4 市、路線 2 市，其餘縣市完全沒有；上線後民眾可能誤以為全國 | **上線**，頁首列出逐縣市覆蓋表，覆蓋外的縣市導到環境部清潔隊電話查詢（既有 `cleaning-squads` 資料）。標題與描述不得出現「全國」二字 |
| **D7** | 婦幼長照組是否正式結案、115950 若持續不通怎麼辦 | B 軌決策 #12 說四組全收，但婦幼長照組的內容已被兒少計畫消化；而 115950 兩邊都不通 | **結案**（B 軌不再為該組新增資料集）；115950 若確認持續不通，採既有「住宅網路手動匯入＋six-monthly 人工清單」模式，**不蓋 relay**（runner 也不通），頁面顯示資料日期 |

### 7.1 擁有者裁決（2026-10-15，勿重談）

| # | 裁決 | 對 ticket 的影響 |
|---|---|---|
| **D1** | **失物招領、交通事故熱點、今日菜價三個新工具都不做**（先裁決只留菜價，同日隨即改為連菜價也不做）。`life-culture` 維持 12 個，不新增任何新工具，`catalog.test.mjs` 計數不受影響。 | **B-15 取消**（連同 `produce_price_daily` 與菜價 cron）；`life-culture`／`disaster-alerts` 不需再動分類。 |
| **D2** | **完全不做交通事故熱點。** | **B-11 取消**，不下載 A1／A2，不建 `traffic_accident_grid`。 |
| **D3** | **整個失物招領工具不做**（個資風險）。 | **B-10 取消**，不建 `lost_found_items`，D3 的遮蔽規則因此作廢。 |
| **D4** | **整個「違規健康廣告」工具不做**（已向擁有者確認範圍，非僅呈現方式）。 | **B-1、B-2、B-3 取消**，不建 `health_ad_violations`，不下載 14196／14197／14198／6949。 |
| **D5** | **不申請農業部會員金鑰**；菜價既已取消（D1），本題不再需要任何動作。 | 無；B-15 取消後此決策只作紀錄，B 軌不新增任何憑證依賴。 |
| **D6** | **垃圾車照常上線**，頁首列逐縣市覆蓋表；覆蓋外縣市導到環境部清潔隊電話查詢；標題與描述不得出現「全國」。 | B-16、B-17、B-18 照原計畫。 |
| **D7** | **婦幼長照組結案**；115950 持續不通就走「住宅網路手動匯入＋six-monthly 人工清單」，不蓋 relay，頁面顯示資料日期。 | B-8 照做（驗證與備援），B 軌不再為該組新增資料集。 |

**取消後仍待做的 ticket**：B-0、B-4、B-5、B-6、B-7（選配，未開票）、B-8、B-9、B-12、B-13、B-14、B-16、B-17、B-18。依賴 B-1 的項目（B-2、B-3）隨之取消。建議順序（取消後）：B-0 → B-4、B-12、B-13、B-6、B-9 → B-5 → B-16 → B-17 → B-14、B-18 → B-8。

**已開票（2026-10-15）**：B-0 #669、B-4 #670、B-6 #671、B-12 #672、B-13 #673、B-16 #674、B-5 #675、B-14 #676、B-9 #677、B-8 #678、B-17 #679、B-18 #680。

---

## 8. 未驗證清單（動工前或動工時必須補）

1. §3 標「未驗證」的 5 個主機（`www.tgos.tw`、`newdatacenter.taichung.gov.tw`、`soa.tainan.gov.tw`、`openapi.kcg.gov.tw`、`data.ntpc.gov.tw`）從正式主機與 runner 的可達性；`opdadm.moi.gov.tw` A1／A2／7317 三個 resource 路徑從 runner／主機的實際可達性。
2. 23.4 MB（6949）、13.7 MB（14198）、28.9 MB（7317）三個檔在主機上解析的記憶體峰值。
3. 115950 在正式 DB 的實際筆數。
4. 農業部菜價完整市場名單與每日發布時間；`TcType` 各代碼的含義；林火 61 個地點的座標來源；MOA OpenAPI 使用條款。
5. 臺北與桃園的垃圾車即時位置資料集是否存在；高雄到點時間預估 117726。
6. data.gov.tw 目錄授權欄位對本文 21 個資料集皆為 `1`，**該代碼對應的條款全文與轉載（含商業／廣告頁面）條件本文未逐字核對**，動工前確認並在工具頁標示授權。
7. TDX 道安 `/TrafficAccident/Rank`（需帶 token 實打；本文不依賴）。
8. A2 全年檔實際在 runner 上的下載與聚合時間（本文只下載了 1 月檔）。

---

## 9. 附錄：研究文件中的次要候選，本 spec 不收

| 項目 | 理由 |
|---|---|
| 藥物食品安全週報 [11502](https://data.gov.tw/dataset/11502) | 屬新聞來源擴充，與 B 軌工具無關，需要時走新聞來源流程 |
| 測速執法 [7320](https://data.gov.tw/dataset/7320)、拖吊保管場 [7319](https://data.gov.tw/dataset/7319)、集會遊行 [11307](https://data.gov.tw/dataset/11307) | 研究文件列次要，與健康生活主軸較遠 |
| 機車排氣定檢站 `mpi_s_01`、全國維修地圖 `wr_p_250` | 同上，環境部另案 |
| 失蹤人口 [14420](https://data.gov.tw/dataset/14420)、犯罪資料鄉鎮地圖（14200／57268） | 計畫「共通約束」已排除（個資、污名） |
| 抗蛇毒血清、旅遊醫學門診（`od.cdc.gov.tw`） | IP 封鎖，計畫 Q5 |
| 防空疏散避難設施 | 無全國單一來源（研究文件 §6-7），不在 B 軌 |
