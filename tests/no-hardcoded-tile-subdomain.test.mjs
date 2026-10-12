import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function getAllSourceFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllSourceFiles(fullPath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") ||
        entry.name.endsWith(".tsx") ||
        entry.name.endsWith(".js") ||
        entry.name.endsWith(".jsx") ||
        entry.name.endsWith(".mjs"))
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

// Matches hardcoded OSM tile URLs that embed the deprecated `{s}` (or a literal
// letter) load-balancing subdomain, e.g. `https://{s}.tile.openstreetmap.org/...`
// or `https://a.tile.openstreetmap.org/...`. The OSMF Tile Usage Policy warns
// against hardcoding subdomain variants — they may be withdrawn without notice.
// See lib/constants/mapTiles.ts for the single approved constant.
export function findHardcodedTileSubdomainViolations(fileContent, filePath = "") {
  const lines = fileContent.split("\n");
  const violations = [];
  const subdomainTilePattern = /(\{s\}|\b[a-c])\.tile\.openstreetmap\.org/;

  lines.forEach((line, index) => {
    if (subdomainTilePattern.test(line)) {
      violations.push({
        file: filePath,
        line: index + 1,
        code: line.trim(),
      });
    }
  });

  return violations;
}

test("Regression Guard: no source file hardcodes a subdomain-prefixed OSM tile URL", () => {
  const rootDir = process.cwd();
  const sourceDirs = ["app", "components", "lib", "scripts", "tests", "types"].map((dir) =>
    path.join(rootDir, dir)
  );

  const files = sourceDirs.flatMap((dir) => getAllSourceFiles(dir));
  assert.ok(files.length > 20, `Expected multiple source files, found ${files.length}`);

  const allViolations = [];

  for (const file of files) {
    // Don't flag this test file's own fixture strings/comments as a violation.
    if (path.basename(file) === "no-hardcoded-tile-subdomain.test.mjs") {
      continue;
    }
    const content = fs.readFileSync(file, "utf-8");
    const relPath = path.relative(rootDir, file).replace(/\\/g, "/");
    const violations = findHardcodedTileSubdomainViolations(content, relPath);
    if (violations.length > 0) {
      allViolations.push(...violations);
    }
  }

  if (allViolations.length > 0) {
    const errorDetails = allViolations
      .map((v) => `  - ${v.file}:${v.line} -> ${v.code}`)
      .join("\n");
    assert.fail(
      `Found hardcoded subdomain-prefixed OSM tile URL(s) (violates OSMF Tile Usage Policy — subdomains may be withdrawn without notice):\n${errorDetails}\nUse OSM_TILE_URL from '@/lib/constants/mapTiles' instead.`
    );
  }

  assert.equal(allViolations.length, 0);
});

test("Regression Guard detection unit tests: correctly distinguishes subdomain vs single-host tile URLs", () => {
  const withTemplateSubdomain = `url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"`;
  assert.equal(
    findHardcodedTileSubdomainViolations(withTemplateSubdomain, "test.tsx").length,
    1
  );

  const withLiteralSubdomain = `const url = "https://a.tile.openstreetmap.org/1/2/3.png";`;
  assert.equal(
    findHardcodedTileSubdomainViolations(withLiteralSubdomain, "test.ts").length,
    1
  );

  const singleHost = `url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"`;
  assert.deepEqual(findHardcodedTileSubdomainViolations(singleHost, "test.tsx"), []);
});

test("9 OSM map components all import the shared OSM_TILE_URL / OSM_TILE_ATTRIBUTION constants", () => {
  const rootDir = process.cwd();
  const expectedFiles = [
    "components/HeritageMap/HeritageMapLeaflet.tsx",
    "components/Facilities/FacilityMap.tsx",
    "components/DisasterMap/DisasterMapLeaflet.tsx",
    "components/ContraceptionMap/ContraceptionMapLeaflet.tsx",
    "components/BreastfeedingRooms/BreastfeedingMapLeaflet.tsx",
    "components/WaterOutages/WaterOutagesLeaflet.tsx",
    "components/Tools/InundationMapLeaflet.tsx",
    "components/Tools/CpcStationMap.tsx",
    "components/Tools/AedMapLeaflet.tsx",
  ];

  for (const relPath of expectedFiles) {
    const fullPath = path.join(rootDir, relPath);
    assert.ok(fs.existsSync(fullPath), `Missing expected map component: ${relPath}`);
    const content = fs.readFileSync(fullPath, "utf-8");
    assert.ok(
      content.includes('from "@/lib/constants/mapTiles"'),
      `${relPath} must import the shared tile constants from lib/constants/mapTiles`
    );
    assert.ok(
      content.includes("<TileLayer") && content.includes("OSM_TILE_URL"),
      `${relPath} must use OSM_TILE_URL on its <TileLayer>`
    );
  }
});
