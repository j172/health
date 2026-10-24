# 規格書：TDX REST API 與 MQTT 交互動態交通資訊架構（Hybrid Transit Architecture）

- **建立日期**：2026-10-23
- **狀態**：Ready for Implementation (`ready-for-agent`)
- **關聯研究**：[`docs/2.0/tdx-basic-integration-research.md`](../2.0/tdx-basic-integration-research.md)、[`docs/domains/10-scheduling-sync-ci.md`](../domains/10-scheduling-sync-ci.md) §2.1
- **主要外部依賴**：
  - 交通部 TDX RESTful Open API（OAuth2 Token、基礎會員 3,000 次/月、5 次/分/金鑰）
  - 交通部 TDX MQTTS 服務（`mqtt.transportdata.tw:8883`、TLS、[tdxmotc/MQTTSampleCode](https://github.com/tdxmotc/MQTTSampleCode)）

---

## Problem Statement

對於大眾運輸搭乘者、輪椅與推車族群、長者以及在颱風地震等災害期間需要即時掌握交通資訊的民眾而言，「即時營運通阻與事故通報（Disruption & Outage Alerts）」是攸關人身安全與就醫通勤效率的關鍵資訊。

然而，在現有純 RESTful API 的架構下，系統面臨以下嚴重矛盾與限制：

1. **嚴苛的免費點數天花板限制**：
   TDX 基礎會員（0 元/月）每月僅有 **3 點虛擬點數（約 3,000 次 API 呼叫/月）** 與 **5 次/分/金鑰** 的速率限制。若依賴 HTTP Polling 監控全臺 10 個軌道系統（臺鐵、高鐵、北捷、新北捷、桃捷、中捷、高捷、輕軌等），即使拉長至每 3 小時輪詢一次，每日仍需 80 次（每月 2,400 次，佔總配額 80%），導致所有警訊有高達 3 小時的資訊空窗。
2. **警訊即時性與配額之間的零和僵局**：
   若要做到 15 分鐘級別的即時警示，每月需消耗近萬次 API，上線數天內即遭 TDX 停用憑證；先前「全臺捷運與雙鐵通阻（`metro-alerts`）」正是因 API 點數嚴重超額而在 issue #728 被全面移除。
3. **無意義請求造成龐大浪費**：
   軌道系統在 95% 以上的平常時段運作正常，常態性輪詢發出的 HTTP 請求回傳皆為「無變動」或空陣列，寶貴的免費點數全被消耗在「確認沒有事情發生」。
4. **純 MQTT 推播無法獨立支撐完整應用**：
   雖然 TDX 提供了暫不計點的 MQTTS 動態推播服務（`mqtt.transportdata.tw:8883`），但純 MQTT 存在三大致命缺陷：
   - **冷啟動空白（Cold-Start Blank）**：服務剛啟動時若無新事件推播，系統無法得知目前已處於生效狀態中的既有警報。
   - **缺乏維度圖資（No Spatial Dimension）**：MQTT 訊息僅包含事件代碼與站點代碼，不含車站中英文名稱、WGS84 經緯度座標與周邊出入口設施。
   - **連線中斷漂移（Disconnection Drift）**：網路中斷重連期間若漏接解除訊息，過期警報將永遠殘留在畫面中。

---

## Solution

建立 **TDX RESTful API 與 MQTTS 動態推播的「雙軌交互使用架構」（Hybrid Transit Architecture）**，兼取 API 的結構完整性與 MQTT 的零成本秒級即時性：

1. **冷啟動快照 ＋ 即時差量推播（Snapshot + Delta Stream）**：
   後端啟動時發起 1 次 REST API 取得全臺活躍警訊快照（Active Snapshot）建立基線；隨後建立常駐 MQTTS 長連線，以 **0 API 點數消耗** 接收後續所有的即時事件（新增、更新、解除）。
2. **靜態維度沉澱 ＋ 即時事件豐富化（Static Dimension Enrichment）**：
   以每半年一次的低頻 REST API 同步將全臺車站名冊、出入口、WGS84 經緯度沉澱於資料庫；後端接收到 MQTT 輕量事件後，透過站點代碼進行內部 Join，直接向前端提供含精確座標、路線標籤與無障礙建議的完整警示卡片。
3. **低頻防漂移校準（Daily Reconciliation）**：
   每日離峰時段（04:16）僅需花費 1 輪（10 次）REST API 呼叫進行資料庫比對對帳，自動清理官方已解除但因短暫斷線漏接的過期事件，每日僅消耗 10 次（每月 300 次，僅佔 3,000 點配額的 10%）。
4. **雙軌容錯降級（Dual-Engine Failover）**：
   若 MQTTS 連線異常中斷逾時，系統自動啟動保護機制，降級回現行的每 3 小時低頻輪詢；連線恢復後自動切回 0 點數事件驅動模式。
5. **重啟全臺雙鐵與捷運營運通阻（Revive Metro & Rail Alerts）**：
   藉由突破點數限制，以極高品質重啟全臺軌道營運通阻服務，並強化「颱風地震來了」防災情境頁與「身心障礙者生活」無障礙交通工具。

---

## User Stories

1. As a daily metro commuter, I want to receive immediate operational delay alerts on the website when a train breakdown occurs, so that I can switch to buses or alternative routes before entering the station.
2. As a wheelchair traveler, I want the website to instantly reflect elevator outages across MRT and railway stations via real-time push events, so that I don't get trapped in an inaccessible platform upon arrival.
3. As a parent pushing an infant stroller, I want to know if an elevator at my destination station is temporarily closed, so that I can adjust my travel plans or board at an adjacent accessible station.
4. As a citizen living in an area hit by a typhoon or earthquake, I want to check the "Typhoon & Earthquake" guide and see whether Taiwan Railway (TRA), High Speed Rail (THSR), or local Metros have suspended services, so that I avoid getting stranded in severe weather.
5. As an inter-city commuter relying on Taiwan Railway, I want live delay notices published within seconds of an incident rather than waiting for a 3-hour polling cycle, so that my schedule planning is timely and accurate.
6. As a user visiting the transit tool immediately after the web server restarts, I want to see current active transit disruptions right away, so that I do not experience a false "all green" blank status caused by cold-start latency.
7. As a mobile user browsing on the subway, I want disruption alert cards to display the exact station name and route icon (e.g., "捷運淡水信義線 台北車站") rather than cryptic raw station IDs, so that I can easily understand the affected area.
8. As a visually impaired commuter using a screen reader, I want disruptions and elevator outages to be displayed in semantic, accessible HTML cards, so that my assistive device clearly announces the impacted station and cause.
9. As a commuter traveling late at night, I want the system to clean up resolved incidents once normal operations resume, so that I am not frightened by outdated delay notifications that ended hours ago.
10. As a commuter looking at an outage card on mobile, I want a direct link to the affected transit operator's official customer service hotline and announcement page, so that I can verify refund policies and shuttle arrangements.
11. As a public service site operator, I want the background ingestion system to strictly adhere to the TDX Basic Member quota limit (3,000 requests/month), so that the application never incurs unexpected fees or suffers API credential suspension.
12. As a system administrator, I want the background MQTT connection to reuse a single persistent TLS connection with exponential backoff, so that TDX's broker does not sever the connection due to duplicate Client ID logins.
13. As a backend developer, I want all incoming MQTT messages to be validated against strict schemas before writing to the database, so that malformed upstream payloads never crash the service.
14. As a site operator on a budget, I want dynamic transit alerts to be ingested with zero API quota consumption during normal operations, so that the remaining monthly quota is preserved for critical semi-annual parking and audible signal updates.
15. As a site visitor during a temporary TDX MQTT maintenance window, I want the site to automatically fall back to scheduled low-frequency REST queries, so that the service remains functional without administrative manual intervention.
16. As a database maintainer, I want alerts to be stored with idempotent keys (operator code + alert ID) and proper indexes, so that rapid push updates do not cause row bloat or locking contention.
17. As an admin inspecting system health, I want structured JSON stage logs documenting MQTT connection status, subscription ACK, and daily reconciliation counts, so that I can easily verify live synchronization health.
18. As a disaster management volunteer, I want major highway and bridge closure events from TDX to be mirrored in real-time, so that rescue and relief personnel can route around hazardous passages.
19. As a search engine crawler, I want transit disruption pages to render valid JSON-LD structured data and stable canonical URLs, so that citizens searching for live transit status on search engines land on accurate public health and safety notices.
20. As a user navigating through the "Caring for Elders" guide, I want to see elderly transit discounts alongside real-time accessibility alerts, so that accompanying seniors on outings is safe and well-prepared.

---

## Implementation Decisions

### 1. Dual-Track Hybrid Architecture Pattern (Snapshot + Delta Stream)
- The transit synchronization lifecycle is bifurcated into two synchronized tracks:
  - **Batch & Dimension Track (REST API)**: Station catalogues, GPS coordinates, exit layouts, and accessibility facilities are updated semi-annually or seeded from static snapshots into local database dimension tables.
  - **Streaming & Alert Track (MQTTS)**: Real-time alerts are streamed continuously through a long-lived MQTTS connection over port 8883.
- **Cold-Start Sequence (TTL Guard & Graceful Degradation)**:
  - Upon application startup, the engine checks `provider_api_cache` for the key `tdx:metro-alerts:reconciliation`.
  - If the last verified snapshot is fresh (< 1 hour old) and active records exist in the database, the REST snapshot fetch is bypassed to protect the 3,000 requests/month quota and prevent reboot storms.
  - If a snapshot fetch is required, queries are issued sequentially at 1.5s intervals (respecting the 5 req/min rate limit).
  - "先入 DB 再讀 DB": All snapshot data is immediately persisted to `accessible_transit_facility_alerts` before the MQTT stream begins.
  - If the REST snapshot fails (e.g. 429, timeout, or auth issue), a warning is logged, existing DB records are retained, and the MQTT worker starts normally without blocking server boot.
- **Drift Reconciliation Routine & Boundary Isolation**:
  - A single daily cron job scheduled at 04:16 (`16 4 * * *`, verified collision-free in `cronCollisions.test.mjs`) reconciles database records against the upstream REST API.
  - **Scope**: 6 Metro operators (`TRTC`, `NTMC`, `TYMC`, `TMRT`, `KRTC`, `KLRT`), consuming exactly 6 requests/day (180/month). Total scheduled TDX usage remains 86 requests/day (2,580/month, safely below the 3,000 monthly quota).
  - **Boundary Isolation (零誤殺)**: Reconciliation strictly filters disruption records via `facility_name LIKE '%· 營運通報'` and `(facility_id IS NULL OR facility_id NOT LIKE '%-EL%')`, ensuring elevator/facility outage records (`transit-accessibility-alerts`) are never touched or cleared.
  - **Soft-resolve Strategy**: Upstream-vanished alerts are soft-resolved by setting `end_time = NOW()`, instantly filtering them from active queries (`WHERE end_time IS NULL OR end_time >= NOW()`) while preserving audit logs and operational history without DDL schema changes.
  - **Metadata & UI Badges**: The reconciliation result and timestamp are saved to `provider_api_cache` (`tdx:metro-alerts:reconciliation`). The API exposes `syncMeta: { pushMode: "mqtt_live", lastReconciledAt: "..." }`, and the UI card displays dual badges: `🟢 即時推播 (MQTTS)` and `🕒 官方核驗：{時間}`.

### 2. MQTTS Connection & Topic Subscription Strategy
- **Connection Specifications**:
  - Broker URL: `mqtt.transportdata.tw:8883` over TLS/SSL (`mqtts://`).
  - Authentication: Explicit `Username`, `Password`, and `ClientId` issued by the TDX Member Center (distinct from REST client credentials).
  - Single Connection Invariant: The system enforces a strict process-wide singleton for the MQTT client. Secondary connections using the same `ClientId` are blocked to prevent the TDX broker from terminating existing connections.
- **Topic Subscriptions & Railway Expansion (Ticket 04)**:
  - Metro & Light Rail Disruptions:
    - `v2/Rail/Metro/Alert/#` (wildcard capturing all MRT and LRT systems across Taiwan)
  - Inter-city Rail & Disaster Streams:
    - `v3/Rail/TRA/Alert` (Taiwan Railway active disruptions, track closures, and train delays)
    - `v2/Rail/THSR/AlertInfo` (High Speed Rail operation status, typhoons, earthquakes, and emergency delays)
  - Road & Disaster Events:
    - `v1/Traffic/RoadEvent/LiveEvent/#` (live road incidents, weather, and traffic control)
- **Quality of Service (QoS)**:
  Subscribed at **QoS 1** (At least once delivery) with application-layer deduplication to guarantee zero message loss during transit.

### 2.1 Disaster Hub Linking & Emergency Hotlines (Typhoon & Earthquake Integration)
- The "Typhoon & Earthquake" life-situation guide (`/guides/typhoon-earthquake`, with localized variants in `en`, `ja`, `ko`) integrates the "查詢交通停駛與鐵路營運" (Check Railway & Transit Suspensions) step.
- Directly cross-links to `/tools/accessible-transit` and `/api/transit-alerts` with active disruptions, operator filters, and live push badges.
- Exposes single-tap emergency hotlines cleaned via `cleanTelUri`:
  - 臺灣鐵路 (TRA): `0800-765-888` / `02-2191-0096`
  - 台灣高鐵 (THSR): `02-4066-3000`
  - 臺北捷運 (TRTC): `02-218-12345`
  - 高雄捷運 (KRTC): `07-793-8888`
- **Architectural Guardrail (#728 Compliance)**:
  - In strict compliance with issue #728 regression guardrails, code, cron job names, and URL paths must never revive the retired `metro-alerts` tool or table name. All disruption components use `transit-alerts`, `rail-disruptions`, and `tdx-transit-reconcile-cron.log`.

### 3. Application-Layer Deduplication & Data Integrity
- Upstream MQTT brokers delivering at QoS 1 may re-deliver the same payload upon reconnection.
- **Unique Constraint Invariant**:
  Database storage for transit alerts enforces a unique constraint on `(operator, alert_id)`. Incoming MQTT messages execute an idempotent upsert (`INSERT ... ON DUPLICATE KEY UPDATE`).
- **Absence of Time in Unique Keys**:
  Following project architectural rules, time columns (`publish_time`, `update_time`) are strictly excluded from unique keys to prevent unbounded table bloat.

### 4. Station Dimension Enrichment (In-Memory Join)
- Incoming MQTT payloads contain only relational foreign keys (`StationID`, `LineID`).
- The ingestion worker enriches dynamic payloads in-memory against pre-loaded station dimension tables, attaching station names (Traditional Chinese and English) and WGS84 latitude/longitude before database persistence.

### 5. Automated Failover and Circuit Breaking (Dual-Engine Supervisor)
- **State Machine Specification (`lib/server/tdx/mqtt/circuitBreaker.ts`)**:
  - `CLOSED` (Normal Push Mode): MQTTS stream healthy. Zero TDX REST quota consumed for real-time alerts. UI badge: `🟢 即時推播 (MQTTS)`.
  - `OPEN` (Fallback Polling Mode): Tripped when MQTTS disconnect, TLS handshake failure, or socket errors persist for > 15 minutes (`DISCONNECT_FAILOVER_THRESHOLD_MS = 15 * 60 * 1000`). Activates low-frequency fallback REST reconciliation (capped at 80 requests/day, 2,400/month). UI badge: `🟡 官方定時同步 (排程備援)`.
  - `HALF_OPEN` (Probing Recovery Mode): Background probing attempts TLS connection to TDX MQTTS broker using exponential backoff (1s, 2s, 4s, capped at 5s). Upon verified stable connection, circuit auto-resumes `CLOSED` and deactivates fallback polling.
- **Admin Diagnostics (`/api/admin/tdx-mqtt-status`)**:
  - Returns structured health report:
    - `activeEngine`: `"push"` | `"fallback_polling"` | `"degraded"`
    - `circuit`: `{ state: "CLOSED" | "OPEN" | "HALF_OPEN", lastStateChange, failoverCount, history: [...] }`
    - `mqtt`: Connection uptime, reconnect attempts, subscribed topics, and sanitized errors (zero secret leaks).
- **Quota Safeguard Guarantee**:
  - Even during worst-case broker outages, the fallback engine strictly honors the 3,000 requests/month quota limit by utilizing the shared rate limiter and 3-hour minimum poll interval.

---

## Testing Decisions

### What Makes a Good Test
- Tests must strictly evaluate **external observable behavior** (database mutations, API responses, alert state transitions, and quota preservation) rather than internal callback wiring or loop mechanics.
- Tests must verify idempotent handling of duplicate MQTT payloads (QoS 1 replay resilience).
- Tests must verify that normal live operation generates zero calls to the TDX REST rate limiter.

### Modules Under Test
1. **MQTT Payload Decoder & Deduplicator**:
   Verifies that sample TDX MQTT JSON payloads for TRA, THSR, and Metro systems parse correctly and upsert into the alerts table without duplicating existing records.
2. **Cold-Start & Snapshot Baseline Ingestion**:
   Verifies that a mock REST response accurately populates the initial active alerts table prior to MQTT stream initialization.
3. **Drift Reconciliation Logic**:
   Verifies that when a mock REST reconciliation payload indicates an alert has disappeared upstream, the corresponding record in the local database is marked as resolved or removed.
4. **Dimension Enrichment Worker**:
   Verifies that raw payloads containing only `StationID` receive correct coordinates and localized station names from the database dimension table.
5. **Failover Circuit State Transitions**:
   Verifies that simulated broker disconnects trip the circuit to activate the fallback poll without exceeding the 80 requests/day budget.

### Prior Art in Codebase
- `tests/tdx-429-retry.test.mjs`: Tests rate limiting and 429 backoff semantics.
- `tests/tdx-cleanup-sweep-731.test.mjs`: Tests that only designated callers hit TDX endpoints and verifies schedule budget formulas.
- `lib/server/cron/cronCollisions.test.mjs`: Tests collision-free cron schedules for background synchronization.
- `lib/server/tdx/circuitBreaker.test.mjs`: Tests three-tier exponential backoff and half-open probing.

---

## Out of Scope

1. **Client-to-Broker Publishing (MQTT Publish)**:
   TDX permits subscription only; publishing messages back to the TDX broker is not supported by the platform.
2. **Real-time Bus GPS Coordinate Streaming**:
   High-frequency GPS tracking of thousands of moving buses across 22 counties consumes substantial CPU and memory resources not suitable for the existing lightweight hosting footprint.
3. **Self-hosted MQTT Broker**:
   The application directly connects to the official government broker (`mqtt.transportdata.tw:8883`); no intermediary Mosquitto or EMQX broker will be hosted.
4. **WebSocket Streaming to End-User Browsers**:
   Browser clients will continue to read sanitized, cached API endpoints (`/api/metro-alerts`, `/api/accessible-transit`); client-side browsers will not establish direct MQTT connections to TDX.

---

## Further Notes

- **Required Environment Variables**:
  - `TDX_MQTT_USERNAME`: TDX Member username for MQTTS authentication.
  - `TDX_MQTT_PASSWORD`: TDX Member password/key for MQTTS authentication.
  - `TDX_MQTT_CLIENT_ID`: Dedicated Client ID registered on TDX Member Center.
- **Feature Revival Candidate**:
  Adopting this architecture paves the way for re-introducing `/tools/metro-alerts` (removed in #728) with zero quota penalty, providing comprehensive real-time transit status across Taiwan.
