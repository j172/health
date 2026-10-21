import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// issue #436 建立 /tools/senior-friendly；issue #729 把「樂齡旅遊」整個移除，頁面改名「敬老卡補助」、
// 敬老卡改為靜態種子資料（無排程，管理員可手動同步）。樂齡旅遊移除的守護測試在
// tests/senior-tourism-removal-729.test.mjs。

test("SeniorCard TDX client: exports fetchSeniorCard, reuses shared auth, and covers 22 SeniorCard cities", () => {
  const clientFile = path.join(process.cwd(), "lib", "server", "seniorCard", "tdxClient.ts");
  assert.ok(fs.existsSync(clientFile), "lib/server/seniorCard/tdxClient.ts should exist");
  const content = fs.readFileSync(clientFile, "utf-8");

  assert.ok(content.includes("fetchSeniorCard"), "tdxClient.ts should export fetchSeniorCard");
  assert.ok(
    content.includes('from "@/lib/server/tdx/auth"') && content.includes("getTdxToken"),
    "should reuse the shared TDX auth helper instead of a new OAuth2 implementation",
  );

  for (const city of [
    "TPE", "NWT", "TAO", "TXG", "TNN", "KHH", "KEE", "HSZ", "HSQ", "MIA",
    "CHA", "NAN", "YUN", "CYQ", "CYI", "PIF", "ILA", "HUA", "TTT", "KIN",
    "PEN", "LIE",
  ]) {
    assert.ok(content.includes(`"${city}"`), `SENIOR_CARD_CITIES should include ${city}`);
  }
  assert.ok(content.includes("SENIOR_CITY_CODE_TO_COUNTY"), "should define a City code -> county mapping");
});

test("SeniorCard sync: only the per-county card sync remains, with per-county try/catch that records errors instead of throwing", () => {
  const syncFile = path.join(process.cwd(), "lib", "server", "seniorCard", "runSync.ts");
  assert.ok(fs.existsSync(syncFile), "lib/server/seniorCard/runSync.ts should exist");
  const content = fs.readFileSync(syncFile, "utf-8");

  assert.ok(content.includes("export async function runSeniorCardSync"), "should export the SeniorCard sync function");
  assert.ok(content.includes("DELETE FROM senior_card_subsidies WHERE county"), "SeniorCard sync should delete+insert per county (no natural per-row key)");
  assert.ok(content.includes("summary.errors.push"), "failures should be recorded into errors[] rather than thrown");
  assert.ok(/\btry\s*{/.test(content), "each county must be independently try/caught");
});

test("SeniorCard DB: senior_card_subsidies is still created in schema.ts and run in mysql.ts's runSchemaMigrations", () => {
  const schemaContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "db", "schema.ts"), "utf-8");
  assert.ok(schemaContent.includes("CREATE TABLE IF NOT EXISTS senior_card_subsidies"), "schema.ts must still define senior_card_subsidies");

  const mysqlContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "db", "mysql.ts"), "utf-8");
  assert.ok(mysqlContent.includes("TABLE_DDL.seniorCardSubsidies"), "mysql.ts should still run the senior_card_subsidies DDL");
  assert.ok(!/DROP TABLE[^;\n]*senior_card_subsidies/.test(mysqlContent), "senior_card_subsidies must never be dropped");
});

test("SeniorCard admin route: manual-only sync, protected by requireAdminSecret", () => {
  const adminRouteFile = path.join(process.cwd(), "app", "api", "admin", "senior-card-sync", "route.ts");
  assert.ok(fs.existsSync(adminRouteFile), "admin senior-card-sync route should exist");
  const adminContent = fs.readFileSync(adminRouteFile, "utf-8");
  assert.ok(adminContent.includes("requireAdminSecret"), "admin route should be protected by requireAdminSecret");
  assert.ok(adminContent.includes("runSeniorCardSync"), "admin route should trigger the SeniorCard sync");
});

test("SeniorCard API route: GET /api/senior-friendly supports the county filter and returns only card data", () => {
  const routeFile = path.join(process.cwd(), "app", "api", "senior-friendly", "route.ts");
  assert.ok(fs.existsSync(routeFile), "app/api/senior-friendly/route.ts should exist");
  const content = fs.readFileSync(routeFile, "utf-8");
  assert.ok(content.includes("getSeniorCardOverview"), "route should call getSeniorCardOverview");
  assert.ok(content.includes('searchParams.get("county")'), "route should read the county filter");
  assert.ok(!content.includes('searchParams.get("query")'), "the tourism search `query` parameter is gone");
});

test("SeniorCard queries: DB first, seeds only when empty, returns seniorCards + counties only", () => {
  const queriesFile = path.join(process.cwd(), "lib", "server", "seniorCard", "queries.ts");
  assert.ok(fs.existsSync(queriesFile), "lib/server/seniorCard/queries.ts should exist");
  const content = fs.readFileSync(queriesFile, "utf-8");

  assert.ok(content.includes("export async function ensureSeniorCardSeeded"), "should export ensureSeniorCardSeeded");
  assert.ok(content.includes("export async function getSeniorCardOverview"), "should export getSeniorCardOverview");
  assert.ok(content.includes("cnt") && content.includes("=== 0"), "ensureSeniorCardSeeded should only insert seed rows when the table's count is 0");
  for (const field of ["seniorCards", "counties"]) {
    assert.ok(content.includes(field), `getSeniorCardOverview should return ${field}`);
  }
  for (const gone of ["tourismFacilities", "tourismServices", "tourPackages", "tourismAlerts"]) {
    assert.ok(!content.includes(gone), `${gone} was removed with the senior tourism feature (issue #729)`);
  }

  const seedFile = path.join(process.cwd(), "lib", "server", "seniorCard", "data", "seniorCardSeed.ts");
  assert.ok(fs.existsSync(seedFile), "senior card seed data file should exist");
  const seedContent = fs.readFileSync(seedFile, "utf-8");
  assert.ok(seedContent.includes("SENIOR_CARD_SUBSIDIES_SEED"), "should export SENIOR_CARD_SUBSIDIES_SEED");
  assert.ok(seedContent.includes("TAIWAN_COUNTIES"), "SeniorCard seed should cover all 22 counties via TAIWAN_COUNTIES");
});

test("SeniorCard catalog: senior-friendly is named 敬老卡補助, in elder-care-welfare with WebPage schema and bidirectional relatedSlugs", () => {
  const catalogContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "tools", "catalog.ts"), "utf-8");
  assert.ok(catalogContent.includes('slug: "senior-friendly"'), "catalog.ts should define the senior-friendly entry (URL unchanged)");
  assert.ok(
    /slug:\s*"senior-friendly"[\s\S]{0,200}group:\s*"elder-care-welfare"/.test(catalogContent),
    "senior-friendly should be in the elder-care-welfare group (issue #442)",
  );
  assert.ok(
    /slug:\s*"senior-friendly"[\s\S]{0,300}schemaType:\s*"WebPage"/.test(catalogContent),
    "senior-friendly is an administrative/open-data tool, not clinical content, so schemaType should be WebPage (issue #136)",
  );
  assert.ok(
    /slug:\s*"senior-friendly"[\s\S]{0,300}navLabel:\s*"敬老卡補助"/.test(catalogContent),
    "navLabel should be renamed to 敬老卡補助 (issue #729)",
  );
  assert.ok(
    /slug:\s*"senior-friendly"[\s\S]{0,500}title:\s*"敬老卡補助[：:]/.test(catalogContent),
    "title should start with 敬老卡補助 (issue #729)",
  );
  assert.ok(
    /slug:\s*"senior-friendly"[\s\S]{0,1800}relatedSlugs:\s*\[[^\]]*"accessible-transit"[^\]]*"long-term-care"/.test(catalogContent),
    "senior-friendly should link to accessible-transit and long-term-care",
  );
  assert.ok(
    /slug:\s*"long-term-care"[\s\S]{0,1600}relatedSlugs:\s*\[[^\]]*"senior-friendly"/.test(catalogContent),
    "long-term-care should link back to senior-friendly",
  );
  assert.ok(
    /slug:\s*"accessible-transit"[\s\S]{0,2200}relatedSlugs:\s*\[[^\]]*"senior-friendly"/.test(catalogContent),
    "accessible-transit should link back to senior-friendly",
  );
});

test("SeniorCard page: /tools/senior-friendly page + component exist, use ToolPageShell, and no longer carry tourism sections", () => {
  const pageFile = path.join(process.cwd(), "app", "(zh)", "tools", "senior-friendly", "page.tsx");
  assert.ok(fs.existsSync(pageFile), "app/(zh)/tools/senior-friendly/page.tsx should exist (URL unchanged)");
  const pageContent = fs.readFileSync(pageFile, "utf-8");
  assert.ok(pageContent.includes("ToolPageShell"), "page should use the shared ToolPageShell wrapper");
  assert.ok(pageContent.includes('getToolCatalogEntry("senior-friendly")'), "page should pull metadata from the catalog entry");

  const componentFile = path.join(process.cwd(), "components", "Tools", "SeniorFriendlyContent.tsx");
  assert.ok(fs.existsSync(componentFile), "components/Tools/SeniorFriendlyContent.tsx should exist");
  const componentContent = fs.readFileSync(componentFile, "utf-8");
  assert.ok(componentContent.includes("/api/senior-friendly"), "should fetch from the API route");
  assert.ok(componentContent.includes("敬老卡補助"), "heading should be 敬老卡補助");
  for (const gone of ["樂齡旅遊", "樂齡套票", "景區", "tourPackages", "tourismAlerts"]) {
    assert.ok(!componentContent.includes(gone), `component must not mention ${gone}`);
  }
});
