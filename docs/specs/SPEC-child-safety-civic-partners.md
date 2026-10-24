# 規格書：教育部幼兒園裁罰專區與衛福部兒少法裁罰公告納入公民倡議友站暨情境防護導流

- **建立日期**：2026-10-24
- **狀態**：Ready for Implementation (`ready-for-agent`)
- **關聯討論**：GRILL ME 決策結論、[`docs/2.0/master-plan.md`](../2.0/master-plan.md)、[`docs/domains/04-ia-navigation-civic.md`](../domains/04-ia-navigation-civic.md)
- **牽涉範疇**：全站頁尾（SiteFooter）、公民夥伴導覽模型（NavModel）、公民倡議卡片（CivicPartnersSection）、情境導流模組（ContextualPartnerCard）、幼兒園工具頁（KindergartensPage）、多國語系字典（Locales）、自動化測試套件（Tests）

---

## Problem Statement

家長與照顧者在為幼童挑選教保托育機構或檢視生活安全時，面臨嚴重的資訊不對稱與零碎化挑戰：

1. **官方裁罰紀錄分散且隱蔽**：教育部「全國教保資訊網」雖然依法公告違法幼兒園與教保人員處分名冊，衛福部社會及家庭署亦依法公開違反《兒童及少年福利與權益保障法》（兒少權法）之不當對待兒少裁罰名單，但一般家長在搜尋幼兒園立案資料或社區安全資訊時，往往不知曉官方裁罰專區之確切入口與網址，甚至誤信社群片面口碑。
2. **缺乏情境式安全提醒**：民眾在站內查詢「全國幼兒園查詢」等公私立園所名錄時，若僅有基本核准班級數與月費資訊，無法直接在同一工作流程中聯動官方最新違法裁罰紀錄與重大兒少案件防護。
3. **網址參數雜亂與相容性風險**：部分官方站點（如兒少法裁罰專區）帶有 ASP.NET 暫態偵測參數（`?AspxAutoDetectCookieSupport=1`），若未予正規化清理，容易造成 UTM 追蹤標籤破裂或跳轉循環；且若無統一的外聯無障礙（Accessibility）與多語系支援，將造成螢幕閱讀器與非繁體中文使用者的存取障礙。

---

## Solution

透過全站層級的「公民倡議與友站」納入、工具頁面之「情境防護導流」以及標準化的「外聯 UTM 與無障礙規範」，建立完整的兒少公共安全守護網絡：

1. **雙重載體同步落地**：
   - 於全站頁尾（`SiteFooter` / `CIVIC_PARTNER_LINKS`）納入「教育部幼兒園裁罰專區」與「衛福部兒少法裁罰專區」，使友站連結數由 9 提升至 11。
   - 於工具首頁與新聞首頁之「公民倡議與社會守護」卡片區（`CivicPartnersSection` / `CIVIC_PARTNERS`）建立完整卡片（含圖示、安全徽章、分類標籤與詳細說明），卡片總數由 7 張擴增至 9 張。
2. **統一規範化網址與 UTM 追蹤**：
   - 剔除 `?AspxAutoDetectCookieSupport=1` 暫態參數，保留正規 Canonical URL。
   - 透過全站統一之 `appendOutboundUtm` 附加標準參數（`utm_source=health.j172.tw`、`utm_medium=civic_partner`、`utm_campaign=civic_alliance`），確保政府站台後端相容性與流量追蹤正確。
3. **語意聚合與排序對齊**：
   - 排列於「衛福部醫事性平專區」之後、「2026 政治人物前科」之前，與「台灣罪犯圖鑑」、「運動部不適任教練專區」共同形成完整的「公共安全與違法／不適任查驗名單」聚合區塊。
4. **情境式工具連動導流**：
   - 擴充 `CONTEXTUAL_PARTNERS` 與 `ContextualPartnerCard`，在「全國幼兒園查詢」頁面精準置頂情境導流卡，直接引導家長在挑選園所時同步至教育部專區查核違法裁罰紀錄。
5. **完整多語系與自動化測試防護**：
   - 提供 `zh-TW`、`en`、`ja`、`ko` 四國語言之頁尾外部連結在地化名稱，並確保具備視覺隱藏的「（另開新視窗）」與 `aria-hidden="true"` 的 `↗` 符號。
   - 更新既有單元測試與端對端渲染測試中的長度斷言，並新增專屬回歸測試套件。

---

## User Stories

1. As a parent searching for a kindergarten, I want to see a direct link to the Ministry of Education's preschool penalty database on the kindergarten tool page, so that I can immediately verify whether a prospective school has violations before enrolling my child.
2. As a caregiver browsing the civic alliance section, I want to see a dedicated "Ministry of Education Preschool Violations Database" card with clear safety badges, so that I understand where to find official inspection records.
3. As a citizen concerned about child safety, I want quick access to the MOHW Child and Youth Welfare Act sanction announcement page from the site footer, so that I can look up registered sanctions for improper treatment of minors.
4. As a screen-reader user, I want the new civic partner external links in the footer to announce "opens in a new window" accessibly while hiding visual arrow icons, so that my auditory experience is clean and uncluttered.
5. As an English-speaking resident in Taiwan, I want the preschool and child protection partner links in the footer to display localized titles in English, so that I can easily navigate to official Taiwanese safety databases.
6. As a Japanese-speaking resident, I want the preschool and child welfare sanction links to be translated into Japanese, so that I can understand and access government childcare safety resources.
7. As a Korean-speaking user, I want localized Korean titles for the new civic partners in the footer, so that language is not a barrier to accessing critical public safety notices.
8. As a website visitor, I want outbound links to official databases to carry clean URLs without broken session cookies, so that I never encounter ASP.NET cookie redirect errors or blocked pages.
9. As a platform analyst, I want all outbound clicks to these government portals to carry standard UTM tags with `utm_source=health.j172.tw`, so that public agencies can recognize traffic coming from this public advocacy initiative.
10. As a user reviewing public safety resources, I want preschool and child welfare sanction links logically clustered next to the medical misconduct and sports coach safety lists, so that my mental model for public safety lookup remains coherent.
11. As a frontend engineer maintaining the project, I want `CIVIC_PARTNER_LINKS` and `CIVIC_PARTNERS` to be pure data arrays with strong TypeScript typings, so that UI components and server models never drift.
12. As a QA engineer running continuous integration, I want regression tests to verify link length invariants, UTM parameters, security attributes (`_blank`, `noreferrer noopener`), and contextual card wiring, so that future changes cannot break these civic connections.

---

## Implementation Decisions

### 1. 資料模型與中繼規格 (Data Models & Metadata Contract)
- 於公民倡議夥伴清單與導覽模型中定義兩組常態中繼資料：
  - **教育部幼兒園裁罰專區**：
    - `id`: `moe-ece`
    - `name` / `label`: `教育部幼兒園裁罰專區`
    - `url`: `https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx`
    - `icon`: 🏫
    - `badge`: `幼教安全`（琥珀橙配色 `amber`）
    - `tag`: `幼兒保護 ‧ 違法教保名單`
    - `description`: `教育部全國教保資訊網公開之幼兒園裁罰紀錄，透明揭露違法教保機構與負責人處分，守護幼兒在學安全。`
  - **衛福部兒少法裁罰專區**：
    - `id`: `sfaa-crc`
    - `name` / `label`: `衛福部兒少法裁罰專區`
    - `url`: `https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction`（強制去除 `?AspxAutoDetectCookieSupport=1`）
    - `icon`: 🚸
    - `badge`: `兒少安全`（天藍配色 `sky`）
    - `tag`: `兒少權益 ‧ 違法裁罰公告`
    - `description`: `衛生福利部社會及家庭署公告違反兒少法裁罰案件名冊，公開涉及兒少身心虐待或違法托育名單，保障下一代成長權益。`

### 2. 呈現排序 (Ordering Strategy)
- 兩者依序插入至「衛福部醫事性平專區」（`mohw-vio`）之後、「2026 政治人物前科」（`council2026`）之前，形成五大公共安全查驗名單聚落。

### 3. UTM 追蹤規格 (UTM Outbound Link Contract)
- 透過既有之純函式 `appendOutboundUtm` 處理：
  - 首頁卡片外連：`?utm_source=health.j172.tw&utm_medium=civic_partner&utm_campaign=civic_alliance`
  - 頁尾外連：`?utm_source=health.j172.tw&utm_medium=civic_partner&utm_campaign=civic_alliance&utm_content=footer`

### 4. 多語系映射 (i18n Translation Contract)
- 於頁尾標籤對應表以主機名稱進行綁定：
  - `ap.ece.moe.edu.tw` ➔ `footer.moeEce`
  - `crc.sfaa.gov.tw` ➔ `footer.sfaaCrc`
- 字典字串：
  - `zh-TW`: `教育部幼兒園裁罰專區` / `衛福部兒少法裁罰專區`
  - `en`: `MOE Preschool Violations Database` / `MOHW Child Protection Sanctions`
  - `ja`: `教育部幼稚園処分情報検索` / `衛生福利部児童青少年保護法処分公報`
  - `ko`: `교육부 유치원 행정처분 조회` / `위생복지부 아동복지법 행정처분 공보`

### 5. 情境導流連動 (Contextual Integration)
- 擴充 `CivicPartnerId` 聯合型別與 `CONTEXTUAL_PARTNERS` 設定。
- 在幼兒園查詢工具頁面（`app/(zh)/tools/kindergartens/page.tsx`）加入 `ContextualPartnerCard`，提示前往教育部裁罰專區。

---

## Testing Decisions

1. **外部行為優先**：測試僅驗證資料契約、HTML 渲染輸出、無障礙屬性、安全性屬性（`rel="noreferrer noopener"`、`target="_blank"`）及 UTM 參數是否正確，不耦合實作細節。
2. **受測模組**：
   - 導覽模型純函式：`lib/server/tools/navModel.ts`
   - 頁尾模型與無障礙外聯：`components/News/SiteFooter.tsx`、`tests/footer-external-links-746.test.mjs`
   - 幼兒園工具頁面結構：`app/(zh)/tools/kindergartens/page.tsx`
   - 專屬回歸測試套件：`tests/child-safety-civic-partners.test.mjs`
3. **既有測試基準（Prior Art）**：
   - 參照 `tests/mohw-vio-medical-safety.test.mjs` 與 `tests/sports-coach-civic-partner.test.mjs` 的測試設計，確保全流程自動檢驗。

---

## Out of Scope

1. 爬取或快取教育部及社家署之裁罰名冊內容至內部資料庫（目前定位為官方權威友站外聯跳轉與情境防護導流）。
2. 開發裁罰歷史名單的站內全文檢索或特定園所裁罰歷程比對（由各官方專區提供原生查詢功能）。
3. 修改其他與兒少無直接相關之工具頁面。

---

## Further Notes

- 本擴充遵循「零破壞性變更」原則，擴展陣列長度並向下相容既有 7 個卡片與 9 個頁尾連結。
- 若未來官方將裁罰專區升級為開放資料 API，本架構已預留遷移與資料庫對接介面。
