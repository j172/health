# SPEC-20260930: `npo-organizations` 去重與資料範圍收斂 (NPO Organizations Dedup & Scope)

- **Issue/Ticket**: #423 (依賴 #422，建議 #422 先落地穩定後再實作本項)
- **Status**: Approved — 2026-09-30 使用者已核准方案 B(`tax_organization` 整體移除)與 3.3 節建議(`hasProducts` 限縮至 `facility_type='npo'`),待 #422 穩定後實作
- **Author**: Antigravity Assistant & Engineering Team
- **Date**: 2026-09-30
- **Related**: SPEC-20260930-SHELTERED-WORKSHOPS-FACILITY-TYPE-BUGFIX.md（同一份前置調查的姊妹單，該單為獨立可先行部署的 bugfix，本單為較大範圍的清理，不互相阻擋）

---

## 1. 現況：`npo-organizations` 的聯集邏輯與其問題 (Current Union Logic & Its Problems)

`/tools/npo-organizations` 的查詢邏輯集中在 `lib/server/npoOrganizations/queries.ts:126-129`：

```ts
const HAS_PRODUCTS_SQL = `(extra_json LIKE '%"hasProducts":true%' OR extra_json LIKE '%"hasProducts":"true"%')`;
const HAS_BADGES_SQL = `(extra_json LIKE '%"trustBadges"%' OR extra_json LIKE '%"certifications"%')`;
const IS_NPO_CENTER_SQL = `(source_key = 'npo_tw' OR extra_json LIKE '%"npoCenterOrgid"%')`;
const NPO_FACILITY_TYPES_SQL = `(facility_type IN ('npo', 'tax_organization', 'disability_welfare') OR ${HAS_PRODUCTS_SQL})`;
```

此 `NPO_FACILITY_TYPES_SQL` 被 `getRecentNpoOrganizations`（`:150`）、`countNpoOrganizations`（`:161`）、`searchNpoOrganizations`（`:188`）、`countSearchNpoOrganizations`（`:257`）、`getNpoOrganizationCities`（`:276`）等**全部**查詢函式共用，是唯一的資料範圍界定點。它造成三個獨立問題：

### 問題 1：`disability_welfare` 被無條件重複收錄

`facility_type = 'disability_welfare'` 的每一列，來源是 `scripts/import-mohw-disability-welfare.mjs`（`:53`，抓取 MOHW 資料集 `sfaa/12061`「全國身心障礙福利機構一覽表」），這些列同時也是 `disability-welfare` 工具的資料來源（`app/tools/facilityConfigs.ts:181` `facilityType: "disability_welfare"`，經由 `lib/server/facilities/queries.ts` 的通用 `WHERE facility_type = ?` 查詢）。

由於 `NPO_FACILITY_TYPES_SQL` 把 `'disability_welfare'` 也列進 `IN (...)`，**每一筆身心障礙福利機構都會同時出現在兩個獨立工具裡**，即使它跟 `hasProducts`/NPO 中心資料庫毫無關聯。`disability-welfare` 工具已是該資料的專屬入口，沒有理由在 `npo-organizations` 重複出現。

### 問題 2：`tax_organization` 未經篩選即整批併入，法定範圍遠大於「NPO」

`facility_type = 'tax_organization'` 的來源是 `scripts/import-fia-tax-organizations.mjs`，抓取財政部「教育、文化、公益、慈善機關或團體」免稅捐贈對象名冊 `BGMOPEN99.csv`（`:14`）。這份名冊的法定收錄範圍（財政部訂定）**依法規本就不只限於 NPO**：學校（含各級學校家長會）、醫療院所、宗教團體（寺廟、教會）、政府機關/公所附屬單位、各類同業公會、社團（含同鄉會、扶輪社、獅子會、校友會等聯誼/服務性社團）等，只要符合「教育、文化、公益、慈善」捐贈稅務優惠資格即會收錄，範圍遠大於一般認知的「NPO」。程式碼在把這批資料併入 `facility_type = 'tax_organization'` 前後，都沒有任何名稱或類別篩選（`import-fia-tax-organizations.mjs` 全文可見僅做欄位映射與縣市座標標註，無任何排除邏輯）。

**實測抽樣結果**（見第 2 節）證實這個顧慮成立：資料庫內現存 99,377 筆 `tax_organization` 列，隨機抽樣顯示相當比例是學校、宗教團體、同業公會、政府機關附屬單位、聯誼/服務性社團，而非一般語意下的「公益/慈善組織」。

### 問題 3：庇護工場 fuzzy-match 造成的隱性跨型別污染

`scripts/ingest-sheltered-workshops.mjs` 在比對既有機構時（`:86-89`，本地路徑；`:222-225`，遠端路徑）：

```sql
SELECT id, name, extra_json FROM facilities
WHERE (source_key = 'sheltered_workshop' AND source_id = ?) OR name = ? OR name LIKE ? LIMIT 10
```

這條 `SELECT` **沒有 `facility_type` 篩選**，會搜尋全部 `facilities` 表（不論型別），只要名稱完全相符或經 `normalizeOrgName()` 正規化後相符/互相包含（`:91-112`、`:227-248`），就會把 `hasProducts: true`（連同 `storeUrl`、`productNote`、`isShelteredWorkshop: true`）寫進該列的 `extra_json`（`:114-120`、`:250-256`）。

由於 `NPO_FACILITY_TYPES_SQL` 中 `OR ${HAS_PRODUCTS_SQL}` 這個分支不限制 `facility_type`，任何被此 fuzzy-match 命中的 `elder_welfare`／`disability_welfare`／其他型別機構，都會**無視型別限制地**被拉進 `npo-organizations` 的結果——即使該機構原本完全不屬於 NPO 資料集。這是獨立於問題 1、2 之外的第三條污染路徑：即使解決了問題 1（移除 `disability_welfare` 型別）跟問題 2（收斂 `tax_organization`），只要某個 `disability_welfare` 列的名稱恰好模糊比對命中庇護工場名冊，它依然會透過 `hasProducts:true` 這條路徑重新出現在 `npo-organizations`。

---

## 2. `tax_organization` 實測抽樣結果 (Live DB Sampling Results)

依姊妹調查的既有模式（`scripts/ingest-sheltered-workshops.mjs:52-60` 的 `runRemoteNode()`，透過 SSH 連到正式主機以 `node --env-file=.env` 執行內嵌腳本，走 loopback 存取 MySQL），本次**成功**透過相同機制執行了唯讀 `SELECT`（未做任何寫入）：

- **總筆數**：`SELECT COUNT(*) FROM facilities WHERE facility_type='tax_organization'` → **99,377 筆**。
- **隨機抽樣 300 筆**（`ORDER BY RAND() LIMIT 300`），依名稱關鍵字粗略分類：

| 類別（名稱關鍵字判斷） | 命中數 / 300 | 佔比 |
|---|---|---|
| 協會/學會/工會/商會（含同業公會等） | 149 | 49.7% |
| 宗教（寺/廟/宮/堂/教會/佛教/道教） | 41 | 13.7% |
| 基金會 | 14 | 4.7% |
| 學校/國中小/幼兒園/補習班（含學校家長會） | 5 | 1.7% |
| 公所/政府機關/管理處/管理局等 | 4 | 1.3% |
| 醫院/衛生所/診所 | 0 | 0% |
| 農漁會 | 0 | 0% |
| 未歸類（規則未命中） | 87 | 29.0% |

未歸類的 87 筆抽樣中，可清楚辨識出的次類別包括：**學校家長會**（如「屏東縣萬丹鄉興化國民小學學生家長會」「臺南市鹽水區竹埔國民小學學生家長會」，規則遺漏是因為關鍵字只比對到校名部分未含「國小」以外的字樣被前面規則攔截，實際仍是學校附屬單位）、**同業公會**（如「澎湖縣日用雜貨商業同業公會」「中華民國太陽熱能商業同業公會」「台灣省玻璃商業同業公會聯合會」——規則遺漏是因為含「商業」而非精確比對到「商會」二字，但性質上仍是產業公會，非公益慈善組織）、**扶輪社/同濟會等服務性社團**（如「桃園市瑞誠扶輪社」「高雄鉅星扶輪社」「高雄市遠雄國際同濟會」「南投縣草屯國際扶輪社」「台北市鐵人扶輪社」）、**同鄉會**（「新北市三重雲林同鄉會」「中華民國婦女聯合會桃園縣分會中壢支會」「高雄縣貴州同鄉會」）、**祭祀公業**（「祭祀公業法人台中市張萬春」，宗教/宗族財產法人）。

若把這些用簡易關鍵字規則遺漏、但實際上可歸為「同業公會／服務性社團／學校附屬／宗族祭祀」的項目也計入，粗估**明確非一般語意 NPO 的比例逼近或超過五成**，且即使是佔比最大的「協會/學會/工會/商會」大類（49.7%）本身也高度異質——其中同時混雜了真正的社福/公益性協會（例如各縣市的身心障礙福利協會、老人福利協進會等）與純商業性質的同業公會、聯誼性質的社團，光靠「協會」二字本身無法區分。

**結論**：DB 抽樣完全可行且已執行完成，未動用備援方案（讀取本地 CSV 快取，因 `data/` 目錄下未發現 `BGMOPEN99.csv` 的本地副本）。抽樣證實 `tax_organization` 是一個範圍遠大於「NPO」的異質稅務登記名冊，且異質性連最大宗的「協會/學會」子類內部都無法迴避。

---

## 3. 修復提案 (Proposed Fixes)

### 3.1 移除 `disability_welfare`（已由使用者拍板，非提案）

`NPO_FACILITY_TYPES_SQL`（`lib/server/npoOrganizations/queries.ts:129`）由：

```ts
const NPO_FACILITY_TYPES_SQL = `(facility_type IN ('npo', 'tax_organization', 'disability_welfare') OR ${HAS_PRODUCTS_SQL})`;
```

改為：

```ts
const NPO_FACILITY_TYPES_SQL = `(facility_type IN ('npo', 'tax_organization') OR ${HAS_PRODUCTS_SQL})`;
```

單純從 `IN (...)` 列表中移除 `'disability_welfare'`。身心障礙福利機構此後只會出現在 `disability-welfare` 專屬工具（除非該列同時被庇護工場 fuzzy-match 命中並帶有 `hasProducts:true`——見 3.3 節，此殘留路徑已一併關閉）。

*（此為說明用的中間步驟，`tax_organization` 尚未移除；結合 3.2、3.3 節的最終決議後，`NPO_FACILITY_TYPES_SQL` 的最終形式見 3.3 節末。）*

### 3.2 `tax_organization` 篩選規則（**已核准：方案 B，整體移除**）

基於第 2 節的抽樣證據，曾提出以下兩個可選方案供評估，**使用者已核准方案 B**（保留方案 A 的分析於下方作為決策紀錄）：

#### 方案 A：排除清單（Exclusion Denylist）——名稱關鍵字黑名單

在 `NPO_FACILITY_TYPES_SQL` 的 `tax_organization` 分支上疊加 `NOT LIKE` 條件，排除明確可辨識的非 NPO 類別：

- 學校/教育機構附屬單位：`國小`、`國中`、`高中`、`高職`、`大學`、`學院`、`幼兒園`、`幼稚園`、`家長會`、`校友會`
- 醫療機構：`醫院`、`診所`、`衛生所`
- 政府機關附屬：`公所`、`縣政府`、`市政府`、`管理處`、`管理局`、`戶政`、`地政`
- 宗教團體：`寺`、`廟`、`宮`、`教會`、`祭祀公業`
- 產業/商業公會：`同業公會`、`商業會`
- 聯誼/服務性社團：`扶輪社`、`同濟社`、`同濟會`、`獅子會`、`同鄉會`

**優點**：實作簡單（一條 `AND NOT (name LIKE ... OR name LIKE ... )`），可解釋、可審查、可隨時增補關鍵字。
**缺點**：第 2 節顯示光是抽樣 300 筆就有 29% 落在簡易規則之外仍需人工辨識歸類，且最大宗的「協會/學會」類別（49.7%，含真正的社福公益協會）完全不會被本方案排除掉，殘留噪音仍然很高——排除清單只能砍掉「明確不是 NPO」的一部分，無法解決「協會類名稱本身無法判斷是否為 NPO」這個核心模糊地帶。

#### 方案 B：整體移除 `tax_organization`（比照 `disability_welfare` 的處理方式）

不做任何名稱篩選，直接把 `'tax_organization'` 從 `NPO_FACILITY_TYPES_SQL` 的 `IN (...)` 中整體移除（等同於 3.1 節對 `disability_welfare` 的做法）。`npo-organizations` 此後只收 `facility_type = 'npo'`（即 `source_key = 'npo_tw'` 的 NPO 中心資料庫，已是全站對「NPO」語意最嚴謹的資料源，見 `IS_NPO_CENTER_SQL`，`:128`）與 `hasProducts:true`（庇護工場商品）兩類。

**優點**：徹底解決異質性問題，不需要維護一份注定不完整的排除清單，且與 `disability_welfare` 的處理邏輯一致（兩者都是「範圍與 npo-organizations 語意不符的獨立資料集，應移出聯集」），降低使用者在 `npo-organizations` 頁面看到學校家長會、同業公會、扶輪社等非預期結果的風險趨近於零。
**缺點**：這 99,377 筆 `tax_organization` 資料中，確實也包含真正的公益/慈善型基金會與社福協會（第 2 節「基金會」4.7%、部分「協會/學會」子類），移除後這些**真正的 NPO 型 `tax_organization` 記錄會暫時從 `npo-organizations` 消失**，除非額外開發一個獨立工具或篩選介面呈現「稅務捐贈扣抵名冊」本身的公益/慈善子集。

**建議傾向**：鑑於方案 A 的排除清單在最大宗類別（協會/學會，佔近半數）上完全無效、且 29% 的樣本連簡易規則都無法歸類，方案 A 能降低的噪音有限、維護成本卻會持續累積（每次抽查都可能發現新的非 NPO 名稱型態）。若目標是讓 `npo-organizations` 保持「使用者搜尋時看到的都是可信賴的公益/慈善組織」，**方案 B（整體移除）在準確性上更可靠、心智模型也更一致**（`tax_organization` 本質是財政部的稅務登記名冊，不是 NPO 名錄，如同 `disability_welfare` 本質是衛福部的機構名錄一樣，兩者都不該被無條件視為「NPO」）。若使用者仍希望保留 `tax_organization` 中真正公益/慈善的子集，**折衷方案 C**（未在上方列為正式選項，僅供參考）是改採「允許清單」而非「排除清單」——只納入名稱含 `慈善`、`公益`、`社會福利`、`關懷`、`扶助`、`救助` 等強公益語意關鍵字的列，而非嘗試窮舉排除非公益類別；此法同樣需要人工審視關鍵字覆蓋率，且會漏收未使用這些字眼但實質從事公益工作的組織，取捨仍待使用者決定。

**方案 B 已於 2026-09-30 由使用者核准為最終決議。**

### 3.3 庇護工場 `hasProducts` 跨型別污染的處理範圍（**已核准：限縮至 `facility_type='npo'`**）

現況：`HAS_PRODUCTS_SQL` 不限制 `facility_type`，任何型別的列只要被庇護工場 ingestion 的 fuzzy-match 命中，都會被拉進 `npo-organizations`（見第 1 節問題 3）。

**已核准做法**：將 `hasProducts` 相關的 OR 分支限縮為僅在 `facility_type = 'npo'` 時生效。結合 3.1(移除 `disability_welfare`)與 3.2(移除 `tax_organization`，方案 B)的決議，`NPO_FACILITY_TYPES_SQL` 最終定案為：

```ts
const NPO_FACILITY_TYPES_SQL = `facility_type = 'npo'`;
```

`tax_organization`／`disability_welfare` 已整體移出聯集，且 `hasProducts:true` 只在同時滿足 `facility_type = 'npo'` 的列才有意義（該型別本就已被涵蓋），故 `HAS_PRODUCTS_SQL`、`IS_NPO_CENTER_SQL` 這兩個獨立分支對本查詢範圍已無新增作用，可簡化為單一條件；若未來仍需要 `hasProducts`/`IS_NPO_CENTER_SQL` 供排序或其他用途，保留其定義但不再併入範圍判斷即可。

**理由**：`hasProducts:true` 的語意是「這是一個有商品可展售的 NPO」，用途是把庇護工場商品資訊附掛在既有 NPO 記錄上（豐富化），而不是「只要商品名稱模糊比對到，不論這個機構原本是什麼型別都算作 NPO」。目前的實作讓一個純粹的資料豐富化操作（enrichment）意外具備了改變一列所屬資料集範圍的副作用，這在架構上是不乾淨的——豐富化不應該跨越型別邊界重新定義一列屬於哪個工具/資料集。

**替代方案（保留現況，不建議）**：若使用者認為「凡是有庇護工場商品的機構都該出現在 npo-organizations，不論其原始型別」是刻意的產品決策（例如身障福利機構自己生產的商品也想被 npo-organizations 的使用者搜到），則可保留現況，但應在程式碼註解中明確記錄這是刻意設計而非疏漏，並接受這與 3.1 節「移除 disability_welfare」的精神存在張力（部分 disability_welfare 記錄仍可能透過此路徑重新出現）。

---

## 4. 遷移與資料清理 (Migration & Rollout Notes)

**核心問題：這個修復只改查詢邏輯，還是資料本身也需要回填/清理？**

答案分兩部分：

1. **`disability_welfare` 移除（3.1 節）與 `tax_organization` 篩選（3.2 節，不論方案 A 或 B）**：兩者都只涉及 `NPO_FACILITY_TYPES_SQL` 這個查詢層的 `WHERE` 條件收斂，**不需要任何資料庫回填或資料清理**。這些列在 `facilities` 表中的 `facility_type`／`extra_json` 都維持原樣（它們的資料在各自的 dedicated 工具——`disability-welfare`——中仍然正確可用，或如果是 `tax_organization` 方案 B，資料本身沒有損壞只是不再出現於此工具），修復純粹是「查詢範圍」的變更，屬於零遷移成本的即時生效變更。

2. **庇護工場 `hasProducts` 污染（3.3 節）**：這裡**需要分開看兩個層面**：
   - 若只改查詢層（`NPO_FACILITY_TYPES_SQL` 加上 `facility_type = 'npo'` 限制），對已經被跨型別 fuzzy-match 污染、`extra_json` 中帶有 `hasProducts:true`／`isShelteredWorkshop:true` 的既存 `elder_welfare`／`disability_welfare` 等列**不需要清理**——它們的 `extra_json` 內容繼續保留完全無害（`elder-welfare`／`disability-welfare` 工具本身不會讀取或顯示 `hasProducts` 欄位），只是 `npo-organizations` 的查詢從此不再把它們撈出來。
   - 但如果將來想要「乾淨」的資料（例如稽核 `extra_json` 內容、避免未來新工具誤用這些殘留欄位），可以額外執行一次性資料清理：找出 `facility_type != 'npo'` 但 `extra_json` 含 `hasProducts:true` 的列，將這些欄位清除或至少加上註記說明其為誤植。**此清理屬於錦上添花的資料衛生，不影響查詢層修復的正確性，建議列為獨立的低優先度後續工單，不阻擋本次查詢層修復上線**。
   - 若日後（3.2 節）決定重寫 `ingest-sheltered-workshops.mjs` 的 fuzzy-match `SELECT`（`:86-89`、`:222-225`）加上 `facility_type = 'npo'` 篩選以避免未來繼續產生新的跨型別污染，這是**程式碼修復**，需與姊妹 SPEC（SHELTERED-WORKSHOPS-FACILITY-TYPE-BUGFIX）的 ingestion 腳本修改一併規劃、避免兩份規格對同一個檔案做出互相衝突的修改（建議實作順序：先落地姊妹 SPEC 的 `facility_type` bugfix，穩定後再疊加本 SPEC 對 fuzzy-match `SELECT` 範圍的收斂）。

**總結**：查詢層修復（3.1、3.2、3.3）本身零遷移成本、可立即生效；資料層的「殘留 `hasProducts` 污染清理」與「fuzzy-match 查詢範圍收斂」是可選的、低優先度的後續強化，不阻擋本次修復上線。

---

## 5. 變更檔案清單（依核准決議開票）(Anticipated Changed Files)

1. `lib/server/npoOrganizations/queries.ts:129`：`NPO_FACILITY_TYPES_SQL` 依 3.3 節核准決議簡化為 `facility_type = 'npo'`。
2. `scripts/ingest-sheltered-workshops.mjs:86-89`、`:222-225`：fuzzy-match `SELECT` 加上 `facility_type = 'npo'` 篩選，防止未來繼續產生新的跨型別污染——**需與姊妹 SPEC（SHELTERED-WORKSHOPS-FACILITY-TYPE-BUGFIX）的 ingestion 腳本改動協調實作順序，建議先落地姊妹 SPEC 的 bugfix，穩定後再疊加本項**。
3. 本規格文件。

（本次規格不含任何資料庫回填腳本；如第 4 節所述，查詢層修復不需要資料遷移。）
