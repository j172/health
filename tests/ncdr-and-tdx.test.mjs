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

  // The name cleaning moved out with the pure mapping (format.ts / tdxStations.ts) when the sync was
  // split into an Availability-only TDX round plus free open-data jobs for Taipei and New Taipei.
  const format = fs.readFileSync(path.join(process.cwd(), "lib", "server", "youbike", "format.ts"), "utf-8");
  assert.ok(format.includes("export function cleanName"), "cleanName function should exist");
  assert.ok(format.includes("YouBike2\\.0_"), "cleanName should strip the YouBike2.0_ prefix");
  const stations = fs.readFileSync(path.join(process.cwd(), "lib", "server", "youbike", "tdxStations.ts"), "utf-8");
  assert.ok(stations.includes("cleanName("), "the TDX mapper should clean station names with it");
});

test("YouBike TDX sync: Taipei and New Taipei never go through TDX, TDX owns exactly the other 13 cities", () => {
  const tdxFile = path.join(process.cwd(), "lib", "server", "youbike", "tdxClient.ts");
  const content = fs.readFileSync(tdxFile, "utf-8");
  assert.match(content, /DIRECT_OPENDATA_CITY_CODES: readonly string\[\] = \["TPE", "NTPC"\]/);
  assert.match(content, /TDX_SYNCED_CITY_CODES/);

  const runSync = fs.readFileSync(path.join(process.cwd(), "lib", "server", "youbike", "runSync.ts"), "utf-8");
  assert.ok(runSync.includes("export async function runYouBikeDirectSync"), "Taipei + New Taipei job");
  assert.ok(runSync.includes("export async function runYouBikeTdxSync"), "the other 13 cities via TDX");
  const direct = runSync.slice(runSync.indexOf("export async function runYouBikeDirectSync"), runSync.indexOf("/** Hsinchu's open-data host"));
  assert.ok(!/getTdxToken|fetchTdx|tdxGetJsonWithRetry/.test(direct), "the direct job must not touch TDX");
});

test("YouBike TDX_CITIES: covers all 15 TDX-enumerated counties/cities (issue #453)", () => {
  const tdxFile = path.join(process.cwd(), "lib", "server", "youbike", "tdxClient.ts");
  const content = fs.readFileSync(tdxFile, "utf-8");

  const expectedCities = [
    "Taipei",
    "NewTaipei",
    "Taoyuan",
    "Hsinchu",
    "HsinchuCounty",
    "MiaoliCounty",
    "Taichung",
    "ChanghuaCounty",
    "YunlinCounty",
    "Chiayi",
    "ChiayiCounty",
    "Tainan",
    "Kaohsiung",
    "PingtungCounty",
    "TaitungCounty",
  ];
  for (const tdxName of expectedCities) {
    assert.ok(content.includes(`"${tdxName}"`), `TDX_CITIES should include tdxName "${tdxName}"`);
  }

  // Count entries in TDX_CITIES by matching "CODE: { tdxName:" lines, to pin down
  // the total at exactly 15 rather than just checking each name is present.
  const entryMatches = content.match(/^\s*[A-Z]{2,5}:\s*{\s*tdxName:/gm) || [];
  assert.strictEqual(
    entryMatches.length,
    15,
    `Expected TDX_CITIES to have exactly 15 entries, found ${entryMatches.length}`
  );
});

test("YouBike TDX sync: per-city failures are isolated via Promise.allSettled and reported, not thrown (issue #453)", () => {
  const tdxFile = path.join(process.cwd(), "lib", "server", "youbike", "tdxClient.ts");
  const content = fs.readFileSync(tdxFile, "utf-8");

  assert.ok(
    content.includes("requireList") && content.includes("throw new Error"),
    "the TDX client should throw on a non-200 so one city's failure is a rejected promise the round isolates"
  );

  // The per-city isolation lives in the round itself now (tdxSyncCore.ts), not in the HTTP client.
  const coreFile = path.join(process.cwd(), "lib", "server", "youbike", "tdxSyncCore.ts");
  const coreContent = fs.readFileSync(coreFile, "utf-8");
  assert.ok(
    coreContent.includes("Promise.allSettled"),
    "the TDX round should isolate per-city failures with Promise.allSettled instead of Promise.all"
  );
  assert.ok(
    coreContent.includes("`TDX fetch failed for ${code}: ${errorMessage(result.reason)}`"),
    "the TDX round should record per-city TDX errors into summary.errors in the 'TDX fetch failed for <city>: <msg>' format"
  );

  const syncFile = path.join(process.cwd(), "lib", "server", "youbike", "runSync.ts");
  const syncContent = fs.readFileSync(syncFile, "utf-8");
  assert.ok(
    syncContent.includes("runTdxCitiesSync"),
    "runYouBikeTdxSync should run the per-city-isolated round"
  );
});

test("YouBike UI: city picker and badge labels cover the 15-county TDX_CITIES set (issue #453)", () => {
  const uiFile = path.join(process.cwd(), "components", "Tools", "YoubikeContent.tsx");
  const content = fs.readFileSync(uiFile, "utf-8");

  for (const code of [
    "TPE",
    "NTPC",
    "TYCG",
    "HSC",
    "HCH",
    "MAL",
    "TXG",
    "CHA",
    "YUN",
    "CYI",
    "CYQ",
    "TNN",
    "KHH",
    "PTT",
    "TTT",
  ]) {
    assert.ok(content.includes(`"${code}"`), `YoubikeContent.tsx CITIES/labels should include city code ${code}`);
  }

  // The city badge on each station card used to be a hardcoded TPE/NTPC/else="新竹"
  // ternary that mislabeled every other county — guard against regressing back to it.
  assert.ok(
    !/station\.cityCode === "TPE"[\s\S]{0,80}"新竹"/.test(content),
    "station city badge should not regress to the old hardcoded TPE/NTPC/else-新竹 ternary"
  );
});

test("TDX shared auth: lib/server/tdx/auth.ts exports getTdxToken and youbike client no longer duplicates it (issue #434)", () => {
  const authFile = path.join(process.cwd(), "lib", "server", "tdx", "auth.ts");
  assert.ok(fs.existsSync(authFile), "lib/server/tdx/auth.ts should exist");
  const authContent = fs.readFileSync(authFile, "utf-8");
  assert.ok(authContent.includes("export async function getTdxToken"), "auth.ts should export getTdxToken");
  assert.ok(authContent.includes("TDX_CLIENT_ID"), "auth.ts should read TDX_CLIENT_ID");
  assert.ok(authContent.includes("TDX_CLIENT_SECRET"), "auth.ts should read TDX_CLIENT_SECRET");

  // The token is obtained once per round by runSync.ts (from the shared helper) and handed to the
  // client functions; neither file may carry a second token implementation.
  const runSyncContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "youbike", "runSync.ts"), "utf-8");
  assert.ok(
    runSyncContent.includes('import { getTdxToken } from "@/lib/server/tdx/auth"'),
    "runSync.ts should import the shared getTdxToken helper instead of defining its own"
  );
  for (const file of ["runSync.ts", "tdxClient.ts"]) {
    const src = fs.readFileSync(path.join(process.cwd(), "lib", "server", "youbike", file), "utf-8");
    assert.ok(
      !src.includes("async function getTdxToken"),
      `${file} should not define its own getTdxToken (now shared via lib/server/tdx/auth.ts)`
    );
  }
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
