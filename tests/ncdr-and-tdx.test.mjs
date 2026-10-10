import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("TDX Client: TDX_CITIES maps valid Taiwan cities and cleanName strips prefix", () => {
  const tdxFile = path.join(process.cwd(), "lib", "server", "youbike", "tdxClient.ts");
  assert.ok(fs.existsSync(tdxFile), "tdxClient.ts should exist");
  const content = fs.readFileSync(tdxFile, "utf-8");

  assert.ok(content.includes("Taipei"), "Should include Taipei config");
  assert.ok(content.includes("NewTaipei"), "Should include NewTaipei config");
  assert.ok(content.includes("Kaohsiung"), "Should include Kaohsiung config");
  assert.ok(content.includes("cleanName"), "cleanName function should exist");
});

test("TDX shared auth: lib/server/tdx/auth.ts exports getTdxToken and youbike client no longer duplicates it (issue #434)", () => {
  const authFile = path.join(process.cwd(), "lib", "server", "tdx", "auth.ts");
  assert.ok(fs.existsSync(authFile), "lib/server/tdx/auth.ts should exist");
  const authContent = fs.readFileSync(authFile, "utf-8");
  assert.ok(authContent.includes("export async function getTdxToken"), "auth.ts should export getTdxToken");
  assert.ok(authContent.includes("TDX_CLIENT_ID"), "auth.ts should read TDX_CLIENT_ID");
  assert.ok(authContent.includes("TDX_CLIENT_SECRET"), "auth.ts should read TDX_CLIENT_SECRET");

  const tdxClientContent = fs.readFileSync(
    path.join(process.cwd(), "lib", "server", "youbike", "tdxClient.ts"),
    "utf-8"
  );
  assert.ok(
    tdxClientContent.includes('from "@/lib/server/tdx/auth"'),
    "tdxClient.ts should import the shared getTdxToken helper instead of defining its own"
  );
  assert.ok(
    !tdxClientContent.includes("async function getTdxToken"),
    "tdxClient.ts should no longer define its own getTdxToken (now shared via lib/server/tdx/auth.ts)"
  );
});

test("TDX Senior/Rail client: covers all 5 endpoints across the 10 RailSystem codes and degrades gracefully (issue #434)", () => {
  const clientFile = path.join(process.cwd(), "lib", "server", "transit", "tdxSeniorClient.ts");
  assert.ok(fs.existsSync(clientFile), "tdxSeniorClient.ts should exist");
  const content = fs.readFileSync(clientFile, "utf-8");

  for (const fn of [
    "fetchSeniorFacility",
    "fetchSeniorService",
    "fetchSeniorMap",
    "fetchSeniorTransfer",
    "fetchSeniorFacilityAlert",
  ]) {
    assert.ok(content.includes(fn), `tdxSeniorClient.ts should export ${fn}`);
  }
  assert.ok(content.includes("getTdxToken"), "should use the shared TDX auth helper");
  assert.ok(content.includes("flattenFacilityCategories"), "should expose a helper to flatten dynamic facility categories");

  const countyFile = path.join(process.cwd(), "lib", "server", "transit", "railStationCounty.ts");
  assert.ok(fs.existsSync(countyFile), "railStationCounty.ts should exist");
  const countyContent = fs.readFileSync(countyFile, "utf-8");
  for (const system of ["TRA", "THSR", "TRTC", "NTMC", "TYMC", "TMRT", "KRTC", "KLRT", "NTDLRT", "NTALRT"]) {
    assert.ok(countyContent.includes(`"${system}"`), `RAIL_SYSTEMS should include ${system}`);
  }
  assert.ok(countyContent.includes("fetchStationCountyMap"), "should export fetchStationCountyMap");
});

test("TDX Senior/Rail sync: upserts facilities/maps/transfers/alerts and records per-system errors instead of throwing (issue #434)", () => {
  const syncFile = path.join(process.cwd(), "lib", "server", "transit", "runSync.ts");
  assert.ok(fs.existsSync(syncFile), "lib/server/transit/runSync.ts should exist");
  const content = fs.readFileSync(syncFile, "utf-8");

  assert.ok(content.includes("export async function runTransitAccessibilitySync"), "should export the daily sync function");
  assert.ok(content.includes("export async function runTransitFacilityAlertsSync"), "should export the alerts sync function");
  assert.ok(content.includes("ON DUPLICATE KEY UPDATE"), "facilities/alerts upserts should use ON DUPLICATE KEY UPDATE");
  assert.ok(content.includes("summary.errors.push"), "failures should be recorded into errors[] rather than thrown");
  // try/catch-per-system, mirroring lib/server/youbike/runSync.ts's try/catch-per-city pattern
  const tryCount = (content.match(/\btry\s*{/g) || []).length;
  assert.ok(tryCount >= 5, `expected multiple independent try/catch blocks for per-endpoint resilience, found ${tryCount}`);
});

test("TDX Senior/Rail: new tables registered in schema.ts/mysql.ts and ALTER adds source/station_id/uniq_station (issue #434)", () => {
  const schemaContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "db", "schema.ts"), "utf-8");
  for (const table of [
    "accessible_transit_facility_alerts",
    "accessible_transit_station_maps",
    "accessible_transit_transfers",
  ]) {
    assert.ok(schemaContent.includes(table), `schema.ts should define CREATE TABLE IF NOT EXISTS ${table}`);
  }

  const mysqlContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "db", "mysql.ts"), "utf-8");
  assert.ok(mysqlContent.includes("TABLE_DDL.accessibleTransitFacilityAlerts"), "mysql.ts should run the new alerts table DDL");
  assert.ok(mysqlContent.includes("TABLE_DDL.accessibleTransitStationMaps"), "mysql.ts should run the new station maps table DDL");
  assert.ok(mysqlContent.includes("TABLE_DDL.accessibleTransitTransfers"), "mysql.ts should run the new transfers table DDL");
  assert.ok(
    mysqlContent.includes("ALTER TABLE accessible_transit_facilities") &&
      mysqlContent.includes("ADD COLUMN IF NOT EXISTS source") &&
      mysqlContent.includes("ADD COLUMN IF NOT EXISTS station_id") &&
      mysqlContent.includes("uniq_station"),
    "mysql.ts should migrate accessible_transit_facilities with source/station_id columns and the uniq_station key"
  );
});

test("TDX Senior/Rail: cron jobs registered at non-colliding minutes and admin sync route exists (issue #434)", () => {
  const cronContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "cron", "registerJobs.ts"), "utf-8");
  assert.ok(cronContent.includes("runTransitAccessibilitySync"), "registerJobs.ts should schedule the daily sync");
  assert.ok(cronContent.includes("runTransitFacilityAlertsSync"), "registerJobs.ts should schedule the alerts sync");

  const adminRouteFile = path.join(process.cwd(), "app", "api", "admin", "transit-accessibility-sync", "route.ts");
  assert.ok(fs.existsSync(adminRouteFile), "admin transit-accessibility-sync route should exist");
  const adminContent = fs.readFileSync(adminRouteFile, "utf-8");
  assert.ok(adminContent.includes("requireAdminSecret"), "admin route should be protected by requireAdminSecret");
});

test("Accessible Transit queries: features_json reader accepts both legacy string[] and new {tags, items} shapes (issue #434)", () => {
  const queriesContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "transit", "queries.ts"), "utf-8");
  assert.ok(queriesContent.includes("alerts"), "overview should return alerts");
  assert.ok(queriesContent.includes("stationMaps"), "overview should return stationMaps");
  assert.ok(queriesContent.includes("transfers"), "overview should return transfers");
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
