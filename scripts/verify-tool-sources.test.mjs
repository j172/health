import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();

// Load TOOL_CATALOG entries by parsing catalog.ts
function getCatalogSlugs() {
  const catalogPath = path.join(ROOT_DIR, "lib", "server", "tools", "catalog.ts");
  const content = fs.readFileSync(catalogPath, "utf-8");
  const matches = [...content.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
  return matches;
}

test("TOOL_CATALOG has exactly 63 tools registered", () => {
  const slugs = getCatalogSlugs();
  assert.equal(slugs.length, 63, `Expected 63 tools in catalog, got ${slugs.length}`);
});

test("Seed fallbacks exist for newly onboarded and offline-fallback tools", () => {
  const seedsDir = path.join(ROOT_DIR, "data", "facilities-seeds");

  // 1. Tourism factories seed
  const tfPath = path.join(seedsDir, "tourism_factory.json");
  assert.ok(fs.existsSync(tfPath), "tourism_factory.json seed file must exist");
  const tfData = JSON.parse(fs.readFileSync(tfPath, "utf-8"));
  assert.ok(Array.isArray(tfData) && tfData.length > 100, `Expected > 100 tourism factories, got ${tfData.length}`);
  const tfWithCoords = tfData.filter((x) => x.lat != null && x.lng != null);
  assert.ok(tfWithCoords.length > 100, "Tourism factories must have coordinates populated");

  // 2. Bookstores seed
  const bsPath = path.join(seedsDir, "bookstore.json");
  assert.ok(fs.existsSync(bsPath), "bookstore.json seed file must exist");
  const bsData = JSON.parse(fs.readFileSync(bsPath, "utf-8"));
  assert.ok(Array.isArray(bsData) && bsData.length > 500, `Expected > 500 bookstores, got ${bsData.length}`);
  const bsWithCoords = bsData.filter((x) => x.lat != null && x.lng != null);
  assert.ok(bsWithCoords.length > 500, "Bookstores must have coordinates populated");

  // 3. Heritage map seed (6 statutory categories)
  const hmPath = path.join(ROOT_DIR, "data", "heritage-map-seed.json");
  assert.ok(fs.existsSync(hmPath), "heritage-map-seed.json must exist");
  const hmData = JSON.parse(fs.readFileSync(hmPath, "utf-8"));
  assert.ok(
    hmData.ok && Array.isArray(hmData.points) && hmData.points.length > 1200,
    `Expected > 1200 heritage points, got ${hmData.points?.length}`,
  );
  const categoriesPresent = new Set(hmData.points.map((p) => p.category));
  assert.ok(categoriesPresent.has("building"), "Must contain building");
  assert.ok(categoriesPresent.has("archaeological_site"), "Must contain archaeological_site");
  assert.ok(categoriesPresent.has("memorial_building"), "Must contain memorial_building");
  assert.ok(categoriesPresent.has("settlement"), "Must contain settlement");
  assert.ok(categoriesPresent.has("historical_site"), "Must contain historical_site");
  assert.ok(categoriesPresent.has("cultural_landscape"), "Must contain cultural_landscape");

  // 4. Pet adoptions seed
  const paPath = path.join(ROOT_DIR, "data", "pet-adoptions-seed.json");
  assert.ok(fs.existsSync(paPath), "pet-adoptions-seed.json must exist");
  const paData = JSON.parse(fs.readFileSync(paPath, "utf-8"));
  assert.ok(Array.isArray(paData) && paData.length > 0, "Pet adoptions seed must not be empty");

  // 5. Breastfeeding rooms seed
  const bfPath = path.join(ROOT_DIR, "data", "breastfeeding-rooms-seed.json");
  assert.ok(fs.existsSync(bfPath), "breastfeeding-rooms-seed.json must exist");
  const bfData = JSON.parse(fs.readFileSync(bfPath, "utf-8"));
  assert.ok(
    bfData.ok && Array.isArray(bfData.points) && bfData.points.length > 3000,
    `Expected > 3000 breastfeeding rooms, got ${bfData.points?.length}`,
  );
  const hasStatutory = bfData.points.some((p) => p.settingType === "statutory");
  const hasVoluntary = bfData.points.some((p) => p.settingType === "voluntary");
  assert.ok(hasStatutory && hasVoluntary, "Must contain both statutory and voluntary rooms");

  // 6. Contraception consultation map seed
  const cmPath = path.join(ROOT_DIR, "data", "contraception-map-seed.json");
  assert.ok(fs.existsSync(cmPath), "contraception-map-seed.json must exist");
  const cmData = JSON.parse(fs.readFileSync(cmPath, "utf-8"));
  assert.ok(
    cmData.ok && Array.isArray(cmData.points) && cmData.points.length > 800,
    `Expected > 800 contraception facilities, got ${cmData.points?.length}`,
  );
  const hasClinics = cmData.points.some((p) => p.category === "clinic");
  const hasPharmacies = cmData.points.some((p) => p.category === "pharmacy");
  assert.ok(hasClinics && hasPharmacies, "Must contain both clinics and pharmacies");

  // 7. Cultural events seed (19 categories + festival + venue_h)
  const cePath = path.join(ROOT_DIR, "data", "cultural-events-seed.json");
  assert.ok(fs.existsSync(cePath), "cultural-events-seed.json must exist");
  const ceData = JSON.parse(fs.readFileSync(cePath, "utf-8"));
  assert.ok(
    ceData.ok && Array.isArray(ceData.events) && ceData.events.length > 1500,
    `Expected > 1500 cultural events, got ${ceData.events?.length}`,
  );
  const ceCategories = new Set(ceData.events.map((e) => e.category));
  assert.ok(ceCategories.has("1"), "Must contain music events (cat 1)");
  assert.ok(ceCategories.has("2"), "Must contain drama events (cat 2)");
  assert.ok(ceCategories.has("6"), "Must contain exhibition events (cat 6)");
  assert.ok(ceCategories.has("festival"), "Must contain festival events");
  assert.ok(ceCategories.has("venue_h"), "Must contain venue_h events");

  // 8. Performance venues seed (767 venues)
  const pvPath = path.join(ROOT_DIR, "data", "performance-venues-seed.json");
  assert.ok(fs.existsSync(pvPath), "performance-venues-seed.json must exist");
  const pvData = JSON.parse(fs.readFileSync(pvPath, "utf-8"));
  assert.ok(
    pvData.ok && Array.isArray(pvData.venues) && pvData.venues.length === 767,
    `Expected exactly 767 performance venues, got ${pvData.venues?.length}`,
  );
  const allVenuesHaveCoords = pvData.venues.every((v) => v.lat != null && v.lng != null);
  assert.ok(allVenuesHaveCoords, "All performance venues must have valid coordinates");

  // 9. Combined public art seed (pure art + venues)
  const artPath = path.join(ROOT_DIR, "data", "public-art.json");
  assert.ok(fs.existsSync(artPath), "public-art.json must exist");
  const artData = JSON.parse(fs.readFileSync(artPath, "utf-8"));
  assert.ok(Array.isArray(artData) && artData.length > 7000, `Expected > 7000 combined art items, got ${artData.length}`);
  const hasVenueType = artData.some((a) => a.fieldType === "演藝活動場所" || String(a.artNo).startsWith("VENUE_"));
  const hasArtType = artData.some((a) => a.fieldType !== "演藝活動場所" && !String(a.artNo).startsWith("VENUE_"));
  assert.ok(hasVenueType && hasArtType, "Must contain both public art installations and performance venues");

  // 10. Latest books seed (博客來 4 榜 + 誠品 27 類 + TAAZE 10 類)
  const lbPath = path.join(ROOT_DIR, "data", "latest-books-seed.json");
  assert.ok(fs.existsSync(lbPath), "latest-books-seed.json must exist");
  const lbData = JSON.parse(fs.readFileSync(lbPath, "utf-8"));
  assert.ok(
    lbData.ok && Array.isArray(lbData.books) && lbData.books.length >= 31,
    `Expected at least 31 latest books across categories, got ${lbData.books?.length}`,
  );
  const lbPlatforms = new Set(lbData.books.map((b) => b.platform));
  assert.ok(lbPlatforms.has("books_com_tw"), "Must contain books_com_tw books");
  assert.ok(lbPlatforms.has("eslite"), "Must contain eslite books");
  assert.ok(lbPlatforms.has("taaze"), "Must contain taaze books");

  // 11. Vet clinics seed
  const vcPath = path.join(seedsDir, "vet_clinic.json");
  assert.ok(fs.existsSync(vcPath), "vet_clinic.json seed file must exist");
  const vcData = JSON.parse(fs.readFileSync(vcPath, "utf-8"));
  const vcList = Array.isArray(vcData) ? vcData : (vcData.records || []);
  assert.ok(Array.isArray(vcList) && vcList.length > 1000, `Expected > 1000 vet clinics, got ${vcList.length}`);

  // 12. Metro alerts seed
  const maPath = path.join(ROOT_DIR, "data", "metro-alerts-seed.json");
  assert.ok(fs.existsSync(maPath), "metro-alerts-seed.json must exist");

  // 13. YouBike stations seed
  const ybPath = path.join(ROOT_DIR, "data", "youbike-stations-seed.json");
  assert.ok(fs.existsSync(ybPath), "youbike-stations-seed.json must exist");
  const ybData = JSON.parse(fs.readFileSync(ybPath, "utf-8"));
  assert.ok(Array.isArray(ybData) && ybData.length > 2000, `Expected > 2000 youbike stations, got ${ybData.length}`);

  // 14. Pest alerts seed
  const pestPath = path.join(ROOT_DIR, "data", "pest-alerts-seed.json");
  assert.ok(fs.existsSync(pestPath), "pest-alerts-seed.json must exist");
});

test("facilityConfigs has matching configurations for all facility tool pages", () => {
  const configsPath = path.join(ROOT_DIR, "app", "tools", "facilityConfigs.ts");
  const content = fs.readFileSync(configsPath, "utf-8");

  assert.ok(content.includes('"tourism-factories":'), "facilityConfigs must contain tourism-factories");
  assert.ok(content.includes('facilityType: "tourism_factory"'), "tourism-factories must have facilityType tourism_factory");

  assert.ok(/["']?bookstores["']?\s*:/.test(content), "facilityConfigs must contain bookstores");
  assert.ok(content.includes('facilityType: "bookstore"'), "bookstores must have facilityType bookstore");

  assert.ok(content.includes("避孕諮詢"), "facilityConfigs must contain 避孕諮詢 filter option");
  assert.ok(content.includes('"vet-clinics":'), "facilityConfigs must contain vet-clinics");
  assert.ok(content.includes('facilityType: "vet_clinic"'), "vet-clinics must have facilityType vet_clinic");
});

test("All 63 tool page files exist on disk", () => {
  const slugs = getCatalogSlugs();
  for (const slug of slugs) {
    const pagePath = path.join(ROOT_DIR, "app", "tools", slug, "page.tsx");
    assert.ok(fs.existsSync(pagePath), `Page file missing for /tools/${slug}: ${pagePath}`);
  }
});
