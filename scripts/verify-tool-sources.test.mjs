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

test("TOOL_CATALOG has exactly 57 tools registered", () => {
  const slugs = getCatalogSlugs();
  assert.equal(slugs.length, 57, `Expected 57 tools in catalog, got ${slugs.length}`);
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

  // 3. Heritage map seed
  const hmPath = path.join(ROOT_DIR, "data", "heritage-map-seed.json");
  assert.ok(fs.existsSync(hmPath), "heritage-map-seed.json must exist");
  const hmData = JSON.parse(fs.readFileSync(hmPath, "utf-8"));
  assert.ok(
    hmData.ok && Array.isArray(hmData.points) && hmData.points.length > 500,
    `Expected > 500 heritage points, got ${hmData.points?.length}`,
  );

  // 4. Pet adoptions seed
  const paPath = path.join(ROOT_DIR, "data", "pet-adoptions-seed.json");
  assert.ok(fs.existsSync(paPath), "pet-adoptions-seed.json must exist");
  const paData = JSON.parse(fs.readFileSync(paPath, "utf-8"));
  assert.ok(Array.isArray(paData) && paData.length > 0, "Pet adoptions seed must not be empty");
});

test("facilityConfigs has matching configurations for all facility tool pages", () => {
  const configsPath = path.join(ROOT_DIR, "app", "tools", "facilityConfigs.ts");
  const content = fs.readFileSync(configsPath, "utf-8");

  assert.ok(content.includes('"tourism-factories":'), "facilityConfigs must contain tourism-factories");
  assert.ok(content.includes('facilityType: "tourism_factory"'), "tourism-factories must have facilityType tourism_factory");

  assert.ok(/["']?bookstores["']?\s*:/.test(content), "facilityConfigs must contain bookstores");
  assert.ok(content.includes('facilityType: "bookstore"'), "bookstores must have facilityType bookstore");
});

test("All 57 tool page files exist on disk", () => {
  const slugs = getCatalogSlugs();
  for (const slug of slugs) {
    const pagePath = path.join(ROOT_DIR, "app", "tools", slug, "page.tsx");
    assert.ok(fs.existsSync(pagePath), `Page file missing for /tools/${slug}: ${pagePath}`);
  }
});
