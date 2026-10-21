import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("TDX shared auth: lib/server/tdx/auth.ts exports getTdxToken (issue #434)", () => {
  const authFile = path.join(process.cwd(), "lib", "server", "tdx", "auth.ts");
  assert.ok(fs.existsSync(authFile), "lib/server/tdx/auth.ts should exist");
  const authContent = fs.readFileSync(authFile, "utf-8");
  assert.ok(authContent.includes("export async function getTdxToken"), "auth.ts should export getTdxToken");
  assert.ok(authContent.includes("TDX_CLIENT_ID"), "auth.ts should read TDX_CLIENT_ID");
  assert.ok(authContent.includes("TDX_CLIENT_SECRET"), "auth.ts should read TDX_CLIENT_SECRET");
});

test("TDX Senior/Rail client: keeps only the Facility/Alert endpoint across the 10 RailSystem codes (issues #434, #730)", () => {
  const clientFile = path.join(process.cwd(), "lib", "server", "transit", "tdxSeniorClient.ts");
  assert.ok(fs.existsSync(clientFile), "tdxSeniorClient.ts should exist");
  const content = fs.readFileSync(clientFile, "utf-8");

  assert.ok(content.includes("fetchSeniorFacilityAlert"), "tdxSeniorClient.ts should export fetchSeniorFacilityAlert");
  // issue #730：每日軌道無障礙同步的四支（Facility／Service／Map／Transfer）已移除。
  for (const fn of ["fetchSeniorFacility =", "fetchSeniorService", "fetchSeniorMap", "fetchSeniorTransfer", "flattenFacilityCategories"]) {
    assert.ok(!content.includes(fn), `tdxSeniorClient.ts should no longer contain ${fn}`);
  }
  assert.ok(content.includes("getTdxToken"), "should use the shared TDX auth helper");

  const countyFile = path.join(process.cwd(), "lib", "server", "transit", "railSystems.ts");
  assert.ok(fs.existsSync(countyFile), "railSystems.ts should exist");
  const countyContent = fs.readFileSync(countyFile, "utf-8");
  for (const system of ["TRA", "THSR", "TRTC", "NTMC", "TYMC", "TMRT", "KRTC", "KLRT", "NTDLRT", "NTALRT"]) {
    assert.ok(countyContent.includes(`"${system}"`), `RAIL_SYSTEMS should include ${system}`);
  }
  assert.ok(!countyContent.includes("fetchStationCountyMap"), "the daily county lookup was removed in issue #730");
});

test("TDX Senior/Rail sync: upserts the hourly elevator-outage alerts and records per-system errors instead of throwing (issues #434, #730)", () => {
  const syncFile = path.join(process.cwd(), "lib", "server", "transit", "runSync.ts");
  assert.ok(fs.existsSync(syncFile), "lib/server/transit/runSync.ts should exist");
  const content = fs.readFileSync(syncFile, "utf-8");

  assert.ok(!content.includes("runTransitAccessibilitySync"), "the daily sync was removed in issue #730");
  assert.ok(content.includes("export async function runTransitFacilityAlertsSync"), "should export the alerts sync function");
  assert.ok(content.includes("ON DUPLICATE KEY UPDATE"), "alerts upserts should use ON DUPLICATE KEY UPDATE");
  assert.ok(content.includes("summary.errors.push"), "failures should be recorded into errors[] rather than thrown");
  // try/catch-per-system so one failing system never takes down the rest
  const tryCount = (content.match(/\btry\s*{/g) || []).length;
  assert.ok(tryCount >= 2, `expected independent try/catch blocks for per-system resilience, found ${tryCount}`);
});

test("TDX Senior/Rail: alerts table registered in schema.ts/mysql.ts and ALTER adds source/station_id/uniq_station (issues #434, #730)", () => {
  const schemaContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "db", "schema.ts"), "utf-8");
  assert.ok(
    schemaContent.includes("CREATE TABLE IF NOT EXISTS accessible_transit_facility_alerts"),
    "schema.ts should define CREATE TABLE IF NOT EXISTS accessible_transit_facility_alerts",
  );

  const mysqlContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "db", "mysql.ts"), "utf-8");
  assert.ok(mysqlContent.includes("TABLE_DDL.accessibleTransitFacilityAlerts"), "mysql.ts should run the new alerts table DDL");
  assert.ok(
    mysqlContent.includes("ALTER TABLE accessible_transit_facilities") &&
      mysqlContent.includes("ADD COLUMN IF NOT EXISTS source") &&
      mysqlContent.includes("ADD COLUMN IF NOT EXISTS station_id") &&
      mysqlContent.includes("uniq_station"),
    "mysql.ts should migrate accessible_transit_facilities with source/station_id columns and the uniq_station key"
  );
});

test("TDX Senior/Rail: the hourly alerts cron job is registered and the admin sync route exists (issues #434, #730)", () => {
  const cronContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "cron", "registerJobs.ts"), "utf-8");
  assert.ok(!cronContent.includes("runTransitAccessibilitySync"), "the daily sync is no longer scheduled (issue #730)");
  assert.ok(cronContent.includes("runTransitFacilityAlertsSync"), "registerJobs.ts should schedule the alerts sync");

  const adminRouteFile = path.join(process.cwd(), "app", "api", "admin", "transit-accessibility-sync", "route.ts");
  assert.ok(fs.existsSync(adminRouteFile), "admin transit-accessibility-sync route should exist");
  const adminContent = fs.readFileSync(adminRouteFile, "utf-8");
  assert.ok(adminContent.includes("requireAdminSecret"), "admin route should be protected by requireAdminSecret");
});

test("Accessible Transit queries: features_json reader accepts both legacy string[] and new {tags, items} shapes (issue #434)", () => {
  const queriesContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "transit", "queries.ts"), "utf-8");
  assert.ok(queriesContent.includes("alerts"), "overview should return alerts");
  assert.ok(!queriesContent.includes("stationMaps"), "overview no longer returns stationMaps (issue #730)");
  assert.ok(!/\btransfers\b/.test(queriesContent), "overview no longer returns transfers (issue #730)");
  assert.ok(queriesContent.includes("activeAlertCount"), "summary should include activeAlertCount");
  assert.ok(queriesContent.includes("parseFeaturesJson"), "should centralize features_json parsing in one function");
});

test("NCDR Alerts: severity determination and county normalization", () => {
  const ncdrFile = path.join(process.cwd(), "lib", "server", "ncdr", "ncdrAlerts.ts");
  assert.ok(fs.existsSync(ncdrFile), "ncdrAlerts.ts should exist");
  const content = fs.readFileSync(ncdrFile, "utf-8");

  assert.ok(content.includes("determineSeverity"), "determineSeverity function should exist");
  assert.ok(content.includes("critical"), "critical severity should be supported");
  assert.ok(content.includes("extractCounties"), "extractCounties function should exist");
  assert.ok(content.includes("CACHE_TTL_MS"), "caching mechanism should exist");
});

test("MapViewController: component exports userLocationIcon with Leaflet styling", () => {
  const mapCtrlFile = path.join(process.cwd(), "components", "Common", "MapViewController.tsx");
  assert.ok(fs.existsSync(mapCtrlFile), "MapViewController.tsx should exist");
  const content = fs.readFileSync(mapCtrlFile, "utf-8");

  assert.ok(content.includes("userLocationIcon"), "userLocationIcon should be exported");
  assert.ok(content.includes("flyTo"), "map.flyTo should be utilized for smooth camera movements");
});

test("Disaster Map: includes both shelter/eoc/rescue layers and real-time inundation layer", () => {
  const contentFile = path.join(process.cwd(), "components", "DisasterMap", "DisasterMapContent.tsx");
  const leafletFile = path.join(process.cwd(), "components", "DisasterMap", "DisasterMapLeaflet.tsx");
  assert.ok(fs.existsSync(contentFile) && fs.existsSync(leafletFile));

  const contentCode = fs.readFileSync(contentFile, "utf-8");
  const leafletCode = fs.readFileSync(leafletFile, "utf-8");

  assert.ok(contentCode.includes("showInundation"), "showInundation state should exist");
  assert.ok(contentCode.includes("/api/disaster/inundation"), "inundation API should be fetched");
  assert.ok(leafletCode.includes("makeInundationIcon"), "makeInundationIcon should render status pins");
});
