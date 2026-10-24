# 規格書：全站重大緊急告警（CBS細胞廣播＋土石流警戒）與教育部性平謠言澄清管線

- **建立日期**：2026-10-24
- **狀態**：Ready for Implementation (`ready-for-agent`)
- **關聯研究**：[`docs/2.0/opendata-expansion-research.md`](../2.0/opendata-expansion-research.md)（§2.5.1、§2.6、§3）
- **主要資料源**：
  1. 國家災害防救科技中心（NCDR）「災防告警細胞廣播即時 Feed」：`https://cbs.tw/files/rssatomfeed.xml`
  2. 農業部水土保持署「土石流警戒發布資訊」（歷史代碼 7284）：`https://data.moa.gov.tw/Service/OpenData/FromM/GetCustomerDebrisAlertInfo.aspx?IsTransData=1&UnitId=018`
  3. 教育部性別平等全球資訊網「新聞稿及資訊澄清」：`https://www.gender.edu.tw/web/index.php/m1/m1_03_index`

---

## 1. Problem Statement

在全民健康生活、防災示警與公共資訊求證的日常場景中，台灣民眾持續面臨以下痛點：

1. **災防示警過度細碎或遺漏重大手機告警**：
   現行 NCDR CAP 示警源每日發布大量常態性低門檻警告（如道路例行施工、小規模河川水情、局部陣雨），民眾面臨嚴重的示警疲勞；而當真正發生國家級警報（如重大地震速報、防空演習、一級土石流或水庫洩洪）時，網頁端缺乏如手機「細胞廣播（Public Warning System, PWS）」般具備極高權重的全站即時頂部橫幅通知。
2. **土石流警戒缺乏即時村里級下鑽資訊**：
   當水保署發布土石流警戒時，民眾難以直觀得知自己所在的鄉鎮甚至特定村里是否落在黃色或紅色警戒潛勢溪流範圍內，且早期資料集編號（7284）更迭後缺乏系統化介接。
3. **性別平等假訊息與恐慌謠言在社群群組肆虐**：
   每逢性平教育相關議題或重大法規修訂，通訊軟體常充斥針對校園課綱的扭曲造謠與不實言論，造成家長與學子恐慌。雖然教育部性平網定期發布權威性新聞稿與澄清，但因缺乏公開 RSS 或開放資料 API，無法被主流新聞管線或查核系統即時聚合。

---

## 2. Solution

本規格建立一體化的民生防護與求證升級方案，由後端服務、前端共用元件與新聞查核管線無縫串聯：

1. **全站重大緊急告警橫幅（CBS Banner）**：
   - 介接 `cbs.tw/files/rssatomfeed.xml`，解析 CAP 1.2 XML 規格，過濾出當前生效之 PWS 級重大細胞廣播告警。
   - 與本站既有全站颱風警報橫幅（`TyphoonBanner.tsx`）及全站地震速報橫幅（`EarthquakeBanner.tsx`）採用相同的客戶端輪詢與排除路徑架構，共用全站頂部版位（`app/(zh)/layout.tsx`、`app/[locale]/layout.tsx`），當有國家級警報時展示深紅/亮橙緊急橫幅，並提供直達避難或查證引導。
2. **土石流潛勢溪流與警戒村里即時圖層**：
   - 介接水保署現行 OpenAPI 端點（`UnitId=018`），即時獲取各縣市鄉鎮村里之黃色／紅色警戒溪流清冊。
   - 與 `/tools/disaster-map` 災害地圖整合，並由 CBS 橫幅在偵測到土石流警報時提供一鍵直達村里警戒下鑽。
3. **教育部性平網事實查核新聞管線**：
   - 專門抓取 `gender.edu.tw` 之 `m1_03_index` 澄清專區，納入本站新聞系統之「事實查核／謠言（`factcheck`，issue #701）」與教育部官方源。
   - 新聞卡片自動標註「教育部官方澄清」與「查核機構，非本站判定」標記，賦予民眾第一時間查證破除謠言的能力。
   - 排除 `m1_01_index` 公務研習公文，維護首頁新聞品質。

---

## 3. User Stories

1. As a resident in Taiwan browsing any page on the site, I want to see an immediate, prominent site-wide emergency banner when a critical Cell Broadcast (PWS) alert is active, so that I am instantly informed of imminent life-safety events.
2. As a visitor on mobile, I want the emergency CBS banner to clearly display the hazard type (e.g. 國家級強震、海嘯、大雷雨、土石流警戒) and affected counties, so that I can quickly assess personal risk.
3. As a resident living in mountainous areas during torrential rain, I want to click through from the CBS banner or disaster map to see the exact list of villages under red or yellow debris flow alerts, so that I can decide whether to evacuate.
4. As a user checking debris flow alerts, I want to clearly distinguish between yellow alert (warning to prepare evacuation) and red alert (mandatory evacuation order), so that I know what action to take.
5. As an anxious parent who received a viral social media rumor claiming controversial content in elementary textbooks, I want to see official debunking articles from the Ministry of Education Gender Equality Network directly in the news fact-check feed (`/news?group=factcheck`), so that I can confirm the truth.
6. As a news reader, I want articles from `gender.edu.tw/m1_03_index` to be clearly badged as "教育部官方澄清", so that I know the source is authoritative.
7. As a regular visitor browsing general news, I do NOT want my feed cluttered with administrative civil service exam notices or academic committee nomination memos from `gender.edu.tw/m1_01_index`, so that my reading experience remains clean and focused.
8. As a site operator, I want CBS alerts and debris alerts to be cached sensibly on the server and polled cleanly by the client without slamming upstream government servers or exceeding API rate limits.
9. As a developer, I want the CBS emergency banner client logic to mirror `EarthquakeBanner` and `TyphoonBanner` with path exclusion support (e.g., admin pages, print views), so that maintenance remains straightforward.
10. As a user with slow internet or offline hiccups, I want the client stores to gracefully handle fetch timeouts or parsing anomalies without breaking the layout or throwing uncaught exceptions.
11. As an accessibility user, I want the emergency banner to use high-contrast color schemes meeting WCAG AA standards (contrast > 6:1) and proper ARIA live regions, so that screen readers announce the alert.
12. As an international or tourist user viewing translated pages (`/en`, `/ja`, `/ko`), I want the emergency banner to show appropriate localized headers or translated hazard titles, so that non-Chinese speakers understand the emergency.
13. As an operator running unit tests, I want automated regression tests verifying that valid CAP XML, invalid XML, expired alerts, and debris alert JSON are parsed accurately without crash.
14. As an operator running news feeds, I want the `gender.edu.tw` parser to withstand HTML markup quirks and handle character encoding cleanly.
15. As a privacy-conscious user, I want the alert system to function purely based on public broadcast feeds without requiring personal location permissions unless user explicitly uses GPS search.

---

## 4. Implementation Decisions

### 4.1 Data Architecture & Pipeline

#### A. CBS Cell Broadcast Engine (`lib/server/disaster/cbsAlerts.ts`)
- **Upstream URL**: `https://cbs.tw/files/rssatomfeed.xml`
- **Protocol**: HTTP GET, ATOM Feed containing `<entry>` elements with embedded CAP 1.2 XML (`<alert>`).
- **Parsing Rules**:
  - Parse `<status>`, `<msgType>`, `<scope>`, `<info>` block.
  - Check `<expires>` timestamp: Ignore any item where `Date.now() > Date.parse(expires)`.
  - Filter for alerts with `<urgency>` in `["Immediate", "Expected"]` and `<severity>` in `["Extreme", "Severe"]` to preserve PWS exclusivity.
  - Return normalized object:
    ```typescript
    export interface ActiveCbsAlert {
      id: string;
      headline: string;
      description: string;
      event: string;
      severity: "Extreme" | "Severe" | "Moderate";
      effective: string;
      expires: string;
      areas: string[];
      web?: string;
    }
    ```
- **Caching**: Server-side in-memory or Redis/SWR cache of 60 seconds.

#### B. Debris Alert Ingestion (`lib/server/disaster/debrisAlerts.ts`)
- **Upstream URL**: `https://data.moa.gov.tw/Service/OpenData/FromM/GetCustomerDebrisAlertInfo.aspx?IsTransData=1&UnitId=018`
- **Output Interface**:
  ```typescript
  export interface DebrisAlertItem {
    alertLevel: "黃色警戒" | "紅色警戒";
    releaseTime: string;
    debrisStreamCode: string;
    county: string;
    township: string;
    village: string;
  }
  ```

#### C. Ministry of Education Gender Equality Factcheck (`lib/server/news/sources/genderEdu.ts`)
- **Upstream URL**: `https://www.gender.edu.tw/web/index.php/m1/m1_03_index`
- **Source Config**:
  - Add `{ sourceName: "gender_edu", label: "教育部性平網" }` to `SOURCE_CATEGORIES` under `gov` and allow filtering in `factcheck`.
  - Extract article title, date, URL, content summary, and image where available.
  - Tag incoming items with `fact_check_marker = "gov_clarification"`.

### 4.2 Shared Client Banner Architecture

- **Component**: `components/Emergency/CbsEmergencyBanner.tsx`
- **Store**: `lib/client/cbsAlertStore.ts` (polling `/api/cbs-status` every 60 seconds).
- **Styling**:
  - Follows #744 design language (rounded-3xl, high-contrast, bold iconography, clean action links).
  - Placed alongside `<TyphoonBanner />` and `<EarthquakeBanner />` in `app/(zh)/layout.tsx` and `app/[locale]/layout.tsx`.

---

## 5. Verification & Test Plan

1. **Unit Tests**:
   - `tests/cbs-alerts-parser.test.mjs`: Test parsing of standard CAP 1.2 XML, expiration logic, multiple `<area>` tags, empty feed.
   - `tests/debris-alerts-parser.test.mjs`: Test parsing of MOA UnitId=018 JSON, handling empty results when no typhoon/rain is present.
   - `tests/gender-edu-news.test.mjs`: Test HTML scraping and field extraction from `m1_03_index`.
2. **Typecheck & Lint**:
   - Run `npm run typecheck` or `npx tsc --noEmit` to ensure clean TypeScript definitions.
3. **Build & Integration Test**:
   - Verify layout rendering with simulated active CBS alert and verified empty state.
