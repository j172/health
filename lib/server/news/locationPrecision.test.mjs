// Unit tests for classifyLocationPrecision — run with `npm test`.
//
// This uses node:test and node:assert only. The repo has no test framework
// installed and this deliberately does not add one; Node's built-in runner plus
// its built-in TypeScript type-stripping is enough for a pure function, and adding
// Jest/Vitest here would mean a bundler config, a transform pipeline and a fistful
// of devDependencies to exercise a lookup against two static tables.
//
// Requires Node >= 22.18 (unflagged type stripping). Not wired into CI, whose
// deploy job runs on Node 20 — see .github/workflows/deploy-ftps.yml.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Node's ESM resolver has no extensionless resolution, so `./locationPrecision.ts`
// would load fine and then explode on that module's own extensionless
// `./data/taiwanDistricts` import. This hook resolves relative specifiers to their
// .ts/.tsx file the way tsc's `moduleResolution: "bundler"` (tsconfig.json) and the
// Next build already do, which keeps the test-only ceremony out of the source
// files — they stay written the way every other module in lib/ is written.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(specifier + extension, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(specifier + extension, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

// Dynamic, because the hook above has to be registered before the graph loads.
const { classifyLocationPrecision } = await import("./locationPrecision.ts");

test("a row with a facility_id is facility precision", () => {
  // Tier 1 writes facility.name plus a non-null facility_id, and is the only tier
  // that sets the column at all.
  assert.equal(
    classifyLocationPrecision("國立臺灣大學醫學院附設醫院", 12345),
    "facility",
  );
});

test("a bare county name is county precision", () => {
  assert.equal(classifyLocationPrecision("高雄市", null), "county");
  // 臺/台 variants are both present in TAIWAN_COUNTY_CENTROIDS, and tier 3 writes
  // whichever one the table holds, so both spellings must classify.
  assert.equal(classifyLocationPrecision("臺北市", null), "county");
  assert.equal(classifyLocationPrecision("屏東縣", null), "county");
});

test("a district full name is district precision", () => {
  assert.equal(classifyLocationPrecision("新北市永和區", null), "district");
  assert.equal(classifyLocationPrecision("台北市中正區", null), "district");
});

test("a street address is geocoded precision", () => {
  // Tier 4's regex forces a 路|街|大道|巷|弄|號 suffix, so its values can never
  // equal a county or district table entry.
  assert.equal(
    classifyLocationPrecision("台北市中正區忠孝東路一段1號", null),
    "geocoded",
  );
});

test("an unrecognised location name falls back to geocoded, not to a downgrade", () => {
  // The fallback direction is the whole point: an unknown value keeps today's
  // rendering rather than losing its map card to a classification miss.
  assert.equal(classifyLocationPrecision("桃園縣", null), "geocoded");
});

test("no location at all classifies as null", () => {
  assert.equal(classifyLocationPrecision(null, null), null);
  assert.equal(classifyLocationPrecision("", null), null);
});

test("facility_id wins over a name that also looks like a county", () => {
  // Ordering guard: facility_id is checked first, so a facility whose name happens
  // to collide with a table entry is still metre-level precision.
  assert.equal(classifyLocationPrecision("高雄市", 999), "facility");
});
