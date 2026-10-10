import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Senior Tourism TDX client: exports Tourism + SeniorCard fetchers, reuses shared auth, and covers 22 SeniorCard cities (issue #436)", () => {
  const clientFile = path.join(process.cwd(), "lib", "server", "seniorTourism", "tdxClient.ts");
  assert.ok(fs.existsSync(clientFile), "lib/server/seniorTourism/tdxClient.ts should exist");
  const content = fs.readFileSync(clientFile, "utf-8");

  for (const fn of [
    "fetchTourismFacility",
    "fetchTourismService",
    "fetchTourismPackage",
    "fetchTourismFacilityAlert",
    "fetchSeniorCard",
  ]) {
    assert.ok(content.includes(fn), `tdxClient.ts should export ${fn}`);
  }
  assert.ok(
    content.includes('from "@/lib/server/tdx/auth"') && content.includes("getTdxToken"),
    "should reuse the shared TDX auth helper instead of a new OAuth2 implementation",
  );
  assert.ok(
    content.includes("flattenTourismFacilityCategories"),
    "should expose a helper to flatten dynamic facility categories",
  );

  for (const city of [
    "TPE", "NWT", "TAO", "TXG", "TNN", "KHH", "KEE", "HSZ", "HSQ", "MIA",
    "CHA", "NAN", "YUN", "CYQ", "CYI", "PIF", "ILA", "HUA", "TTT", "KIN",
    "PEN", "LIE",
  ]) {
    assert.ok(content.includes(`"${city}"`), `SENIOR_CARD_CITIES should include ${city}`);
  }
  assert.ok(content.includes("SENIOR_CITY_CODE_TO_COUNTY"), "should define a CityCode -> county mapping");
});

test("Senior Tourism sync: three independently try/caught sync functions that record errors instead of throwing (issue #436)", () => {
  const syncFile = path.join(process.cwd(), "lib", "server", "seniorTourism", "runSync.ts");
  assert.ok(fs.existsSync(syncFile), "lib/server/seniorTourism/runSync.ts should exist");
  const content = fs.readFileSync(syncFile, "utf-8");

  assert.ok(content.includes("export async function runSeniorTourismSync"), "should export the daily Tourism sync function");
  assert.ok(content.includes("export async function runSeniorTourismAlertsSync"), "should export the Tourism alerts sync function");
  assert.ok(content.includes("export async function runSeniorCardSync"), "should export the SeniorCard sync function");
  assert.ok(content.includes("ON DUPLICATE KEY UPDATE"), "alerts upsert should use ON DUPLICATE KEY UPDATE");
  assert.ok(content.includes("DELETE FROM senior_card_subsidies WHERE county"), "SeniorCard sync should delete+insert per county (no natural per-row key)");
  assert.ok(content.includes("summary.errors.push"), "failures should be recorded into errors[] rather than thrown");
  const tryCount = (content.match(/\btry\s*{/g) || []).length;
  assert.ok(tryCount >= 5, `expected multiple independent try/catch blocks for per-endpoint/per-county resilience, found ${tryCount}`);
});

test("Senior Tourism DB: 5 new tables registered in schema.ts and run in mysql.ts's runSchemaMigrations (issue #436)", () => {
  const schemaContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "db", "schema.ts"), "utf-8");
  for (const table of [
    "senior_tourism_facilities",
    "senior_tourism_services",
    "senior_tour_packages",
    "senior_tourism_alerts",
    "senior_card_subsidies",
  ]) {
    assert.ok(schemaContent.includes(table), `schema.ts should define CREATE TABLE IF NOT EXISTS ${table}`);
  }

  const mysqlContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "db", "mysql.ts"), "utf-8");
  for (const key of [
    "seniorTourismFacilities",
    "seniorTourismServices",
    "seniorTourPackages",
    "seniorTourismAlerts",
    "seniorCardSubsidies",
  ]) {
    assert.ok(mysqlContent.includes(`TABLE_DDL.${key}`), `mysql.ts should run the new ${key} table DDL`);
  }
});

test("Senior Tourism cron: jobs registered at non-colliding minutes and admin sync route exists (issue #436)", () => {
  const cronContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "cron", "registerJobs.ts"), "utf-8");
  assert.ok(cronContent.includes("runSeniorTourismSync"), "registerJobs.ts should schedule the daily Tourism sync");
  assert.ok(cronContent.includes("runSeniorTourismAlertsSync"), "registerJobs.ts should schedule the Tourism alerts sync");
  assert.ok(cronContent.includes("runSeniorCardSync"), "registerJobs.ts should schedule the SeniorCard sync");

  // Minutes picked for this feature (20 3, 17/47, 25 3) must not collide with
  // Spec A's existing transit-accessibility entries (15 3, 16,46).
  assert.ok(cronContent.includes('"20 3 * * *"'), "senior-tourism sync should be scheduled at an unused 3am minute");
  assert.ok(cronContent.includes('"17,47 * * * *"'), "senior-tourism alerts sync should be scheduled at unused half-hourly minutes");
  assert.ok(cronContent.includes('"25 3 * * *"'), "senior-card sync should be scheduled at a different unused 3am minute");
  assert.ok(!cronContent.includes('"20 3 * * *"') || cronContent.includes('"15 3 * * *"'), "transit-accessibility's existing 15 3 entry should remain untouched");

  const adminRouteFile = path.join(process.cwd(), "app", "api", "admin", "senior-tourism-sync", "route.ts");
  assert.ok(fs.existsSync(adminRouteFile), "admin senior-tourism-sync route should exist");
  const adminContent = fs.readFileSync(adminRouteFile, "utf-8");
  assert.ok(adminContent.includes("requireAdminSecret"), "admin route should be protected by requireAdminSecret");
  assert.ok(
    adminContent.includes("runSeniorTourismSync") &&
      adminContent.includes("runSeniorTourismAlertsSync") &&
      adminContent.includes("runSeniorCardSync"),
    "admin route should trigger all 3 sync functions",
  );
});

test("Senior Tourism API route: GET /api/senior-friendly supports county/query filters (issue #436)", () => {
  const routeFile = path.join(process.cwd(), "app", "api", "senior-friendly", "route.ts");
  assert.ok(fs.existsSync(routeFile), "app/api/senior-friendly/route.ts should exist");
  const content = fs.readFileSync(routeFile, "utf-8");
  assert.ok(content.includes("getSeniorFriendlyOverview"), "route should call getSeniorFriendlyOverview");
  assert.ok(content.includes('searchParams.get("county")'), "route should read the county filter");
  assert.ok(content.includes('searchParams.get("query")'), "route should read the query filter");
});

test("Senior Tourism queries: seeds only when empty and returns all 5 collections + counties (issue #436)", () => {
  const queriesFile = path.join(process.cwd(), "lib", "server", "seniorTourism", "queries.ts");
  assert.ok(fs.existsSync(queriesFile), "lib/server/seniorTourism/queries.ts should exist");
  const content = fs.readFileSync(queriesFile, "utf-8");

  assert.ok(content.includes("export async function ensureSeniorFriendlySeeded"), "should export ensureSeniorFriendlySeeded");
  assert.ok(content.includes("export async function getSeniorFriendlyOverview"), "should export getSeniorFriendlyOverview");
  assert.ok(content.includes("cnt") && content.includes("=== 0"), "ensureSeniorFriendlySeeded should only insert seed rows when a table's count is 0");
  for (const field of ["seniorCards", "tourismFacilities", "tourismServices", "tourPackages", "tourismAlerts", "counties"]) {
    assert.ok(content.includes(field), `getSeniorFriendlyOverview should return ${field}`);
  }

  const seedFile = path.join(process.cwd(), "lib", "server", "seniorTourism", "data", "seniorFriendlySeed.ts");
  assert.ok(fs.existsSync(seedFile), "senior-friendly seed data file should exist");
  const seedContent = fs.readFileSync(seedFile, "utf-8");
  assert.ok(seedContent.includes("SENIOR_CARD_SUBSIDIES_SEED"), "should export SENIOR_CARD_SUBSIDIES_SEED");
  assert.ok(seedContent.includes("TAIWAN_COUNTIES"), "SeniorCard seed should cover all 22 counties via TAIWAN_COUNTIES");
});

test("Senior Tourism catalog: TOOL_CATALOG has a senior-friendly entry in life-services with WebPage schema and bidirectional relatedSlugs (issue #436)", () => {
  const catalogContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "tools", "catalog.ts"), "utf-8");
  assert.ok(catalogContent.includes('slug: "senior-friendly"'), "catalog.ts should define the senior-friendly entry");
  assert.ok(
    /slug:\s*"senior-friendly"[\s\S]{0,200}group:\s*"life-services"/.test(catalogContent),
    "senior-friendly should be in the life-services group",
  );
  assert.ok(
    /slug:\s*"senior-friendly"[\s\S]{0,300}schemaType:\s*"WebPage"/.test(catalogContent),
    "senior-friendly is an administrative/open-data tool, not clinical content, so schemaType should be WebPage (issue #136)",
  );
  assert.ok(
    /slug:\s*"senior-friendly"[\s\S]{0,900}relatedSlugs:\s*\[[^\]]*"elder-welfare"[^\]]*"accessible-transit"[^\]]*"ltc-contracted"/.test(
      catalogContent,
    ),
    "senior-friendly should link to elder-welfare, accessible-transit and ltc-contracted",
  );

  assert.ok(
    /slug:\s*"elder-welfare"[\s\S]{0,400}relatedSlugs:\s*\[[^\]]*"senior-friendly"/.test(catalogContent),
    "elder-welfare should link back to senior-friendly",
  );
  assert.ok(
    /slug:\s*"accessible-transit"[\s\S]{0,2200}relatedSlugs:\s*\[[^\]]*"senior-friendly"/.test(catalogContent),
    "accessible-transit should link back to senior-friendly",
  );
});

test("Senior Tourism page: /tools/senior-friendly page + component exist and follow ToolPageShell + lazy Date.now() conventions (issue #436)", () => {
  const pageFile = path.join(process.cwd(), "app", "tools", "senior-friendly", "page.tsx");
  assert.ok(fs.existsSync(pageFile), "app/tools/senior-friendly/page.tsx should exist");
  const pageContent = fs.readFileSync(pageFile, "utf-8");
  assert.ok(pageContent.includes("ToolPageShell"), "page should use the shared ToolPageShell wrapper");
  assert.ok(pageContent.includes('getToolCatalogEntry("senior-friendly")'), "page should pull metadata from the catalog entry");

  const componentFile = path.join(process.cwd(), "components", "Tools", "SeniorFriendlyContent.tsx");
  assert.ok(fs.existsSync(componentFile), "components/Tools/SeniorFriendlyContent.tsx should exist");
  const componentContent = fs.readFileSync(componentFile, "utf-8");
  assert.ok(componentContent.includes('useState(() => Date.now())'), "should use the lazy useState(() => Date.now()) idiom instead of calling Date.now() during render");
  assert.ok(componentContent.includes("/api/senior-friendly"), "should fetch from the new API route");
});
