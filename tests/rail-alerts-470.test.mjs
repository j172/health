import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Issue #470 ("升級捷運公告為全台軌道營運通阻（TDX T4）", parent #438 §P T4).
//
// lib/server/metroAlerts/tdxClient.ts is plain .ts with no DB access and no
// JSX (it only imports lib/server/net/httpClient.ts and lib/server/tdx/auth.ts,
// neither of which touch the DB), so this file dynamically imports and
// exercises it directly — same loader shim as tests/nearby-page-466.test.mjs /
// tests/map-popup-nearby-tools-links-463.test.mjs. lib/server/metroAlerts/
// runSync.ts and queries.ts both import lib/server/db/mysql.ts, which
// constructs its `env` object (MYSQL_HOST/USER/PASSWORD/DATABASE) eagerly at
// module load and throws without those set — so, like those two precedents,
// this file verifies them (and every DB-backed/JSX file touched by this
// ticket) via source-text inspection against the shipped files instead.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = new URL("../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

// Ensure no TDX credentials leak in from the ambient environment — this test
// exercises the "no token configured" degrade path deterministically and
// must never make a real network call.
delete process.env.TDX_CLIENT_ID;
delete process.env.TDX_APP_ID;
delete process.env.TDX_CLIENT_SECRET;
delete process.env.TDX_APP_KEY;

const {
  METRO_ALERT_SYSTEMS,
  RAIL_ALERT_SOURCES,
  normalizeRailAlert,
  fetchAllRailAlerts,
} = await import("../lib/server/metroAlerts/tdxClient.ts");

const readSource = (...segments) => fs.readFileSync(path.join(ROOT_DIR, ...segments), "utf-8");

// ---------------------------------------------------------------------------
// 1. The 6 metro/light-rail systems + TRA + THSR = 8 sources, matching TDX's
//    own confirmed RailSystem enum and docs/2.0/spec-issue-438.md §P T4.
// ---------------------------------------------------------------------------

test("METRO_ALERT_SYSTEMS has exactly the 6 TDX-confirmed Metro/Alert RailSystem codes", () => {
  const codes = METRO_ALERT_SYSTEMS.map((s) => s.code).sort();
  assert.deepEqual(codes, ["KLRT", "KRTC", "TMRT", "TRTC", "TRTCMG", "TYMC"].sort());
});

test("RAIL_ALERT_SOURCES is the 6 metro systems plus TRA and THSR — 8 total, no duplicates", () => {
  assert.equal(RAIL_ALERT_SOURCES.length, 8);
  const codes = RAIL_ALERT_SOURCES.map((s) => s.code);
  assert.equal(new Set(codes).size, 8, "no duplicate source codes");
  assert.ok(codes.includes("TRA"));
  assert.ok(codes.includes("THSR"));
  for (const metro of METRO_ALERT_SYSTEMS) {
    assert.ok(codes.includes(metro.code));
  }
});

test("every RAIL_ALERT_SOURCES entry has a non-empty Chinese label", () => {
  for (const source of RAIL_ALERT_SOURCES) {
    assert.ok(typeof source.label === "string" && source.label.length > 0, `${source.code} must have a label`);
  }
});

// ---------------------------------------------------------------------------
// 2. normalizeRailAlert: status → alertType mapping, externalId namespacing,
//    Scope fallback chain, defensive defaults, and offset-safe time parsing.
// ---------------------------------------------------------------------------

test("normalizeRailAlert: status 0 (全線停駛) maps to alertType 'suspended'; everything else maps to 'operational'", () => {
  const suspended = normalizeRailAlert({ AlertID: "A1", Title: "t", Status: 0 }, "TRA", "臺鐵");
  assert.equal(suspended.alertType, "suspended");

  for (const status of [1, 2, undefined]) {
    const normal = normalizeRailAlert({ AlertID: "A2", Title: "t", Status: status }, "THSR", "高鐵");
    assert.equal(normal.alertType, "operational");
  }
});

test("normalizeRailAlert: externalId is namespaced by systemCode, so the same AlertID from two different systems never collides", () => {
  const a = normalizeRailAlert({ AlertID: "123" }, "TRA", "臺鐵");
  const b = normalizeRailAlert({ AlertID: "123" }, "THSR", "高鐵");
  assert.notEqual(a.externalId, b.externalId);
  assert.ok(a.externalId.startsWith("TRA_"));
  assert.ok(b.externalId.startsWith("THSR_"));
});

test("normalizeRailAlert: missing AlertID/AlertUID falls back to a stable content hash, not a crash or a fixed string", () => {
  const item = { Title: "某路段施工", Description: "影響列車行駛", StartTime: "2026-10-13T08:00:00+08:00" };
  const first = normalizeRailAlert(item, "TRA", "臺鐵");
  const second = normalizeRailAlert(item, "TRA", "臺鐵");
  assert.equal(first.externalId, second.externalId, "same input must hash to the same externalId (idempotent upserts)");
  assert.notEqual(first.externalId, normalizeRailAlert({ ...item, Title: "不同標題" }, "TRA", "臺鐵").externalId);
});

test("normalizeRailAlert: Scope fallback chain — Stations > Lines > Routes > LineSections > NetworkList, each tried in order", () => {
  const withStations = normalizeRailAlert(
    { Scope: { Stations: [{ StationName: "台北站" }, { StationName: "板橋站" }] } },
    "TRA",
    "臺鐵",
  );
  assert.equal(withStations.stationName, "台北站、板橋站");

  const withLines = normalizeRailAlert({ Scope: { Lines: [{ LineName: "板南線" }] } }, "TRTC", "臺北捷運");
  assert.equal(withLines.stationName, "板南線");

  const withSections = normalizeRailAlert(
    {
      Scope: {
        LineSections: [{ StartingStationName: "台北", EndingStationName: "板橋" }],
      },
    },
    "TRA",
    "臺鐵",
  );
  assert.equal(withSections.stationName, "台北－板橋");

  const withNetworkOnly = normalizeRailAlert(
    { Scope: { NetworkList: { NetworkName: "縱貫線" } } },
    "TRA",
    "臺鐵",
  );
  assert.equal(withNetworkOnly.stationName, "縱貫線");

  const withNoScope = normalizeRailAlert({}, "TRA", "臺鐵");
  assert.equal(withNoScope.stationName, "", "no Scope at all must degrade to an empty string, not throw or say 'undefined'");
});

test("normalizeRailAlert: Title/Description default to a generic system-labeled message when TDX omits them", () => {
  const item = normalizeRailAlert({}, "THSR", "高鐵");
  assert.ok(item.alertTitle.includes("高鐵"));
  assert.equal(item.alertContent, "");
  assert.equal(item.systemCode, "THSR");
  assert.equal(item.systemLabel, "高鐵");
  assert.equal(item.status, "active");
});

test("normalizeRailAlert: time parsing extracts the literal date/time digits, ignoring any +08:00 offset (never UTC-shifts)", () => {
  const withOffset = normalizeRailAlert({ UpdateTime: "2026-10-13T08:30:00+08:00" }, "TRA", "臺鐵");
  assert.equal(withOffset.alertTime, "2026-10-13 08:30:00");

  const withoutOffset = normalizeRailAlert({ UpdateTime: "2026-10-13T08:30:00" }, "TRA", "臺鐵");
  assert.equal(withoutOffset.alertTime, "2026-10-13 08:30:00");

  const withSpaceSeparator = normalizeRailAlert({ UpdateTime: "2026-10-13 08:30:00" }, "TRA", "臺鐵");
  assert.equal(withSpaceSeparator.alertTime, "2026-10-13 08:30:00");
});

test("normalizeRailAlert: falls back to PublishTime then StartTime when UpdateTime is absent", () => {
  const usesPublish = normalizeRailAlert({ PublishTime: "2026-01-02T03:04:05+08:00" }, "TRA", "臺鐵");
  assert.equal(usesPublish.alertTime, "2026-01-02 03:04:05");

  const usesStart = normalizeRailAlert({ StartTime: "2026-05-06T07:08:09+08:00" }, "TRA", "臺鐵");
  assert.equal(usesStart.alertTime, "2026-05-06 07:08:09");
});

// ---------------------------------------------------------------------------
// 3. fetchAllRailAlerts: per-system isolation (core acceptance criterion 4 —
//    "任一系統的資料來源暫時失敗，不影響其他系統正常顯示") and the
//    no-credentials degrade path, without any real network call.
// ---------------------------------------------------------------------------

test("fetchAllRailAlerts: with no TDX credentials configured, returns an all-empty result instead of throwing or making a network call", async () => {
  const result = await fetchAllRailAlerts();
  assert.deepEqual(result.alerts, []);
  assert.deepEqual(result.bySystem, {});
  assert.deepEqual(result.errors, {});
});

// ---------------------------------------------------------------------------
// 4. Source-text inspection for the DB-backed sync/query layer (can't be
//    dynamically imported in a plain `node --test` process — see header).
// ---------------------------------------------------------------------------

test("runSync.ts fans out via fetchAllRailAlerts, falls back to the Taipei CSV only for a failed TRTC, and resolves stale rows per successfully-fetched system", () => {
  const src = readSource("lib", "server", "metroAlerts", "runSync.ts");
  assert.match(src, /import\s*\{\s*RAIL_ALERT_SOURCES,\s*fetchAllRailAlerts\s*\}\s*from\s*["']\.\/tdxClient["']/);
  assert.match(src, /if \(errors\.TRTC\)\s*\{/, "CSV fallback must be gated on TRTC's own TDX call having failed");
  assert.match(src, /fetchTaipeiCsvAlerts\(\)/);
  assert.match(src, /resolveStaleAlerts/, "must resolve stale (no-longer-reported) alerts, not let them sit as 'active' forever");
  assert.match(src, /status = 'resolved'/);
});

test("runSync.ts's upsert writes system_code and system_label into metro_alerts", () => {
  const src = readSource("lib", "server", "metroAlerts", "runSync.ts");
  assert.match(src, /system_code, system_label, created_at, updated_at/);
  assert.match(src, /system_code = VALUES\(system_code\)/);
});

test("queries.ts: getMetroAlerts selects system_code/system_label and supports filtering by systemCode", () => {
  const src = readSource("lib", "server", "metroAlerts", "queries.ts");
  assert.match(src, /system_code AS systemCode/);
  assert.match(src, /system_label AS systemLabel/);
  assert.match(src, /options\?\.systemCode/);
});

test("queries.ts exports getActiveMetroAlertsCount for the guide hub's live-status badge", () => {
  const src = readSource("lib", "server", "metroAlerts", "queries.ts");
  assert.match(src, /export async function getActiveMetroAlertsCount\(\)/);
  assert.match(src, /COUNT\(\*\) AS cnt FROM metro_alerts WHERE status = 'active'/);
});

test("db/schema.ts's metro_alerts DDL declares system_code/system_label with Taipei-Metro-safe defaults", () => {
  const src = readSource("lib", "server", "db", "schema.ts");
  const ddlStart = src.indexOf("CREATE TABLE IF NOT EXISTS metro_alerts");
  const ddl = src.slice(ddlStart, ddlStart + 1200);
  assert.match(ddl, /system_code VARCHAR\(20\) NOT NULL DEFAULT 'TRTC'/);
  assert.match(ddl, /system_label VARCHAR\(50\) NOT NULL DEFAULT '臺北捷運'/);
});

test("db/mysql.ts migrates existing metro_alerts tables with ADD COLUMN IF NOT EXISTS (never a bare ADD COLUMN that errors on a second run)", () => {
  const src = readSource("lib", "server", "db", "mysql.ts");
  assert.match(src, /ALTER TABLE metro_alerts\s*\n\s*ADD COLUMN IF NOT EXISTS system_code VARCHAR\(20\) NOT NULL DEFAULT 'TRTC'/);
  assert.match(src, /ADD COLUMN IF NOT EXISTS system_label VARCHAR\(50\) NOT NULL DEFAULT '臺北捷運'/);
});

// ---------------------------------------------------------------------------
// 5. The URL/slug must NOT change — only the title/content. Acceptance
//    criterion 2.
// ---------------------------------------------------------------------------

test("app/tools/metro-alerts/page.tsx and app/api/metro-alerts/route.ts still exist at the original path (slug unchanged)", () => {
  assert.ok(existsSync(path.join(ROOT_DIR, "app", "tools", "metro-alerts", "page.tsx")));
  assert.ok(existsSync(path.join(ROOT_DIR, "app", "api", "metro-alerts", "route.ts")));
});

test("catalog.ts: the metro-alerts entry's slug is unchanged, but its title is upgraded to 全台軌道營運通阻", () => {
  const src = readSource("lib", "server", "tools", "catalog.ts");
  const entryStart = src.indexOf('slug: "metro-alerts"');
  assert.ok(entryStart !== -1, "metro-alerts catalog entry must still exist under this exact slug");
  const entry = src.slice(entryStart, entryStart + 400);
  assert.match(entry, /title:\s*"全台軌道營運通阻"/);
});

// ---------------------------------------------------------------------------
// 6. UI: system filter covers all 8 sources + "全部系統", keyed by exact
//    systemCode (not the old line-name substring match).
// ---------------------------------------------------------------------------

test("MetroAlertsContent.tsx: SYSTEMS filter covers all 8 RAIL_ALERT_SOURCES codes plus 'all', and filters by exact systemCode", () => {
  const src = readSource("components", "Tools", "MetroAlertsContent.tsx");
  for (const source of RAIL_ALERT_SOURCES) {
    assert.match(src, new RegExp(`id:\\s*"${source.code}"`), `SYSTEMS must include "${source.code}"`);
  }
  assert.match(src, /id:\s*"all"/);
  assert.match(src, /systemCode !== selectedSystem/);
});

test("MetroAlertsContent.tsx: alertType filter includes the new 'suspended' (全線停駛) category alongside the pre-existing elevator/operational ones", () => {
  const src = readSource("components", "Tools", "MetroAlertsContent.tsx");
  assert.match(src, /setSelectedType\("suspended"\)/);
  assert.match(src, /setSelectedType\("elevator"\)/);
  assert.match(src, /setSelectedType\("operational"\)/);
});

// ---------------------------------------------------------------------------
// 7. The "颱風地震來了" guide gets a step for this tool, and the hub page
//    shows a live has-disruption-or-not badge for it. Acceptance criterion 3.
// ---------------------------------------------------------------------------

test("navModel.ts: the typhoon-earthquake guide has a step pointing at metro-alerts", () => {
  const src = readSource("lib", "server", "tools", "navModel.ts");
  const guideStart = src.indexOf('slug: "typhoon-earthquake"');
  const guideEnd = src.indexOf('slug: "disability-living"');
  const guideBlock = src.slice(guideStart, guideEnd);
  assert.match(guideBlock, /toolSlug:\s*"metro-alerts"/);
});

test("app/guides/[slug]/page.tsx: fetches and renders a live active-alert-count badge specifically for the metro-alerts step", () => {
  const src = readSource("app", "guides", "[slug]", "page.tsx");
  assert.match(src, /import\s*\{\s*getActiveMetroAlertsCount\s*\}\s*from\s*["']@\/lib\/server\/metroAlerts\/queries["']/);
  assert.match(src, /getActiveMetroAlertsCount\(\)/);
  assert.match(src, /step\.toolSlug === "metro-alerts"/);
});
