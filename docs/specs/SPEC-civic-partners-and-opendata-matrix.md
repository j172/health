# 規格書：全臺開放資料平臺矩陣升級、海纜動態地圖公民友站落地與數位通訊韌性整合

- **建立日期**：2026-10-24
- **狀態**：Ready for Implementation (`ready-for-agent`)
- **關聯研究**：[`docs/2.0/opendata-expansion-research.md`](../2.0/opendata-expansion-research.md)、[`docs/2.0/master-plan.md`](../2.0/master-plan.md)
- **牽涉範疇**：全站頁尾（SiteFooter）、公民夥伴導覽模型（NavModel）、公民倡議卡片（CivicPartnersSection）、多國語系字典（Locales）、開放資料擴充盤點研究文件

---

## Problem Statement

在當前地緣政治灰色地帶威脅、頻繁的天災以及網路斷線假訊息充斥的環境下，臺灣民眾與數位公民面臨兩大核心資訊痛點：

1. **通訊基礎設施脆弱性與斷網謠言恐慌**：海底通訊電纜（Submarine Cables）是臺灣對外連網與離島（如臺馬）的最脆弱生命線。每逢連線延遲或局部通訊異常，社群常充斥「全臺對外海纜全斷」、「敵對勢力實施封鎖」等未經查證的假訊息。民眾缺乏權威、透明、即時且可驗證的民間第三方海纜狀態資訊入口，難以在第一時間查核實體故障真相與修復進度。
2. **開放資料來源零碎與盤點過時**：現有研究文件在盤點全臺開放資料時，依賴年代久遠的大專院校入口清冊（如世新大學清單），遺漏了多個非六都縣市（如新竹縣市、苗栗、雲林、花蓮、屏東等數萬筆資料集），且混淆了中央匯流與地方專屬 API 的界線；同時，部分需要申請專案金鑰與綁定固定 IP 的部會 API（如國立臺灣歷史博物館「國家文化記憶庫 2.0 OpenAPI」），缺乏明確的收錄/排除評估標準，影響 2.0 擴充決策效率。

---

## Solution

透過「全站公民倡議友站落地」、「即時通訊韌性情境導流」以及「全臺 25 大開放資料平臺母體全覽重構」三大支柱，提供完整的解決方案：

1. **全站落地「台灣海纜動態地圖（smc.peering.tw）」公民友站**：
   - 將開源社群維運的「台灣海纜動態地圖」正式納入全站「公民倡議與友站」體系（成為第 10 個夥伴），與「黑熊學院」、「反認知作戰教育網」互為全社會防衛、媒體素養與數位通訊韌性之三支柱。
   - 於全站頁尾、導覽模型與公民倡議卡片區提供標準化外鏈、無障礙跳轉與多國語系支援。
2. **維生/防災情境導流與輕量狀態燈號規格確立**：
   - 在災害示警與維生管線工具中，建立「若遇網路異常，請至友站查核海纜實體障礙」的情境導流文字。
   - 介接其開源 Git JSON 架構（`src/data/incidents.json`），訂定 2.0 輕量通訊維生狀態燈號（🟢 正常 / 🟡 局部跳障 / 🔴 嚴重中斷）的後端同步規格，無需重造 3D 海纜拓撲圖即可破除謠言。
3. **重構全臺 25 大開放資料平臺母體全覽矩陣**：
   - 淘汰過時入口清單，以 `odportal.tw` 彙整的全國 25 平臺（中央 + 24 地方/專屬平臺，母體逾 15 萬筆資料）與 GitHub `awesome-opendata-taiwan-gov` 為基準，於研究文件中建立全覽矩陣，標明資料量、存活狀態、匯流機制與取捨結論。
   - 正式將「國家文化記憶庫 2.0 OpenAPI」納入排除清單（§5），明確記錄其「需專案金鑰與固定 IP、偏學術典藏」之排除理由。

---

## User Stories

1. As a Taiwanese citizen experiencing sudden internet slowdowns, I want to find a link to the "Taiwan Submarine Cable Status" in the site footer, so that I can immediately check whether international cables are physically disrupted.
2. As a digital reader exposed to social media rumors about undersea cable sabotage, I want to access real-time cable incident timelines from the civic partner section, so that I can debunk panic-inducing misinformation with facts.
3. As a Matsu or Kinmen offshore island resident, I want to easily access domestic submarine cable status reports, so that I can understand local telecommunication repair progress and ship arrival schedules.
4. As an accessibility-focused user relying on a screen reader, I want the new civic partner external link to clearly announce "opens in a new window" and hide visual icons (`↗`), so that my screen reader is not cluttered with redundant glyphs.
5. As a foreign national living in Taiwan, I want the submarine cable civic partner title to be properly localized in English, Japanese, and Korean, so that I can navigate to the external tool in my preferred language.
6. As a disaster-preparedness enthusiast browsing the civil defense section, I want to see "Taiwan Submarine Cable Status" contextualized under "Communication Resilience & Critical Infrastructure", so that I understand its role in comprehensive societal defense.
7. As a citizen consulting the live disaster or power outage maps during an emergency, I want contextual tips pointing to the cable status dashboard, so that I know where to distinguish local power/telecom failures from nationwide undersea cable cuts.
8. As a developer evaluating 2.0 candidate datasets, I want an authoritative matrix of all 25 Taiwan open data portals with exact dataset counts, so that I know the true population size and coverage status of public data.
9. As a data engineer reviewing regional datasets, I want to see whether non-special municipality platforms (like Hsinchu, Miaoli, Yunlin, Hualien) are already federated into `data.gov.tw`, so that I do not write duplicate scrapers for synced data.
10. As a product manager reviewing open data APIs, I want a documented exclusion rationale for the Taiwan Cultural Memory Bank 2.0 OpenAPI, so that the team does not waste time re-investigating endpoints that require manual IP whitelisting and API keys.
11. As an open-source contributor, I want the data ingestion contract for submarine cable incidents (`incidents.json`) clearly specified, so that I can implement the status indicator without reverse-engineering upstream payloads.
12. As a platform maintainer, I want automated unit and integration tests asserting the exact count, attributes, and security flags (`rel`, `target`) of all 10 civic partner links, so that future refactoring never silently breaks outbound navigation.

---

## Implementation Decisions

### 1. Civic Partner Identity & Presentation Contract
- The "Taiwan Submarine Cable Status" partner is assigned the following domain attributes:
  - **ID**: `smc-peering`
  - **Name (zh-TW)**: `台灣海纜動態地圖`
  - **URL**: `https://smc.peering.tw/`
  - **Icon**: `🌊` (Water Wave / Ocean)
  - **Badge**: `通訊韌性`
  - **Badge Color**: `bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800`
  - **Tag**: `海底電纜 ‧ 即時障礙監控`
  - **Description**: `即時追蹤臺灣對外與離島海底通訊電纜運行狀態、障礙事件與修復時間線，破除斷網謠言、強化通訊韌性。`
- **Hostname Mapping**: Mapped to hostname `smc.peering.tw` in the footer link translation registry, resolving to localization key `footer.smcPeering`.

### 2. Localization Dictionary Contract
- Add key `footer.smcPeering` across the 4 supported language dictionaries:
  - `zh-TW`: `台灣海纜動態地圖`
  - `en`: `Taiwan Submarine Cable Status`
  - `ja`: `台湾海底ケーブル動態マップ`
  - `ko`: `대만 해저 케이블 동태 지도`

### 3. Navigation & Footer Model Integration
- Extend the canonical `CIVIC_PARTNER_LINKS` model array from 9 to 10 items, appending `{ href: "https://smc.peering.tw/", label: "台灣海纜動態地圖" }`.
- Ensure all outbound links continue to receive automated UTM appending via the established outbound link utility (`utm_source`, `utm_medium=footer_civic`).
- In the dedicated Civic Partners UI section, ensure the dynamic count badge updates seamlessly to display "10 個友善公民組織與專案".

### 4. Submarine Cable Data Ingestion Architecture (2.0 Candidate Specification)
- **Upstream Repository**: `https://github.com/seadog007/smc.peering.tw` (Open-source, MIT).
- **Target Endpoint**: `https://raw.githubusercontent.com/seadog007/smc.peering.tw/master/src/data/incidents.json`.
- **Payload Contract**:
  ```ts
  interface SubmarineCableIncident {
    id: string;
    cable_id: string;
    cable_name: string;
    incident_type: "cut" | "fault" | "maintenance";
    status: "active" | "repairing" | "resolved";
    occurred_at: string;
    estimated_repair_at: string | null;
    impact_summary: string;
    affected_isps: string[];
  }
  ```
- **Display Strategy**:
  - Do NOT replicate the full 3D/2D geographical cable route canvas.
  - Compute a single high-level health state for Taiwan's external connectivity:
    - `NORMAL` (0 active incidents affecting major international cables)
    - `DEGRADED` (1-2 non-critical or redundant cable cuts)
    - `CRITICAL` (Multiple simultaneous major cable cuts or domestic Matsu/Kinmen cable isolation)
  - Surface this as a lightweight status indicator badge inside disaster and critical infrastructure pages.

### 5. Open Data Research Document Revisions (`docs/2.0/opendata-expansion-research.md`)
- **§3 Platform Matrix Upgrade**:
  - Replace the legacy 11-entry university table with the complete 25-portal census from `odportal.tw` (including total dataset counts, current crawl status, federation status with `data.gov.tw`, and evaluation conclusions).
  - Reference `onlinemad/awesome-opendata-taiwan-gov` in §0/§3 as an authoritative secondary directory for cross-referencing ministerial APIs.
- **§4 Civic Technology Additions**:
  - Document `smc.peering.tw` under §4, detailing its data source, GitHub schema, and resilience value.
- **§5 Exclusion List Additions**:
  - Add `tcmbdata.culture.tw/swagger-ui` (National Cultural Memory Bank 2.0 OpenAPI) to the exclusion table with explicit rationale (mandatory API key application, fixed IP whitelisting required, academic/archival focus).

---

## Testing Decisions

### What Makes a Good Test
- **External Behavior Only**: Tests must render the full footer component to static HTML and assert on accessibility markup (`aria-hidden`, `.sr-only`), external link security flags (`rel="noopener noreferrer"`, `target="_blank"`), and correct URL matching.
- **Zero JSX Transpiler Dependencies**: Tests must execute under Node.js's native test runner (`node --test`) without adding jsdom or testing library overhead, utilizing existing lightweight TypeScript transpilation hooks.

### Modules Tested
1. **`tests/footer-external-links-746.test.mjs`**:
   - Assert `CIVIC_PARTNER_LINKS.length === 10`.
   - Assert that `smc.peering.tw` appears exactly once in the rendered HTML across all 4 locales.
   - Assert that `smc.peering.tw` contains the required accessibility wrapper: `<span aria-hidden="true">↗</span><span class="sr-only">（另開新視窗）</span>`.
   - Assert that localized labels match their respective dictionaries without duplicated arrow glyphs.
2. **`components/Common/CivicPartnersSection.tsx`**:
   - Verify array consistency and metadata completeness (id, name, url, icon, badge, tag, description).

---

## Out of Scope

1. **Rendering full WebGL / SVG cable line maps**: This platform will not build interactive 2D/3D submarine cable GIS route visualizers; users will be routed to `smc.peering.tw` for detailed geographical exploration.
2. **Real-time BGP packet probing**: We do not perform active network telemetry or server pings; all status signals rely on upstream open data feeds.
3. **Modifying cultural-events or heritage-map**: The Cultural Memory Bank OpenAPI is explicitly excluded; no changes will be made to cultural tools.
4. **Altering .env or deploying database schema migrations**: This specification requires no environment variables or new database tables.

---

## Further Notes

- The addition of `smc.peering.tw` brings the total count of civic partner links to an even 10, fitting naturally into desktop and mobile multi-column grid layouts.
- By combining civic partnership with structured data ingestion specifications, this ticket serves as a model for bridging civil society open-source projects into mainstream public service portals.
