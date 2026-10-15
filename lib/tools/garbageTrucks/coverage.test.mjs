// Issue #674 (B-16) / owner decision D6: the per-county coverage table that
// heads the 垃圾車與清潔隊 page. Must list all 22 counties, be honest about
// which have route data (only 臺北市、新北市 today), and never use the word
// 「全國」 in any user-visible string.
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const {
  GARBAGE_COVERAGE,
  NO_ROUTE_DATA_MESSAGE,
  ROUTE_CITY_BY_COUNTY,
  getRouteCityForCounty,
  getCoverageForCounty,
} = await import("./coverage.ts");
const { TAIWAN_COUNTIES } = await import("../../constants/taiwanDistricts.ts");

test("coverage table lists every one of the 22 counties exactly once, in the site's canonical order", () => {
  assert.deepEqual(
    GARBAGE_COVERAGE.map((row) => row.county),
    [...TAIWAN_COUNTIES],
  );
});

test("only 臺北市 and 新北市 have route data today (datasets 136515 and 125664)", () => {
  const withRoutes = GARBAGE_COVERAGE.filter((row) => row.routes === "available").map((row) => row.county);
  assert.deepEqual(withRoutes, ["臺北市", "新北市"]);
});

test("route city codes match what the sync writes into garbage_route_stops.city", () => {
  assert.deepEqual(ROUTE_CITY_BY_COUNTY, { 臺北市: "taipei", 新北市: "new_taipei" });
  assert.equal(getRouteCityForCounty("臺北市"), "taipei");
  assert.equal(getRouteCityForCounty("新北市"), "new_taipei");
  assert.equal(getRouteCityForCounty("臺中市"), null);
  assert.equal(getRouteCityForCounty(""), null);
});

test("every uncovered county tells users to ask their cleaning squad; message matches the issue's acceptance text", () => {
  assert.equal(NO_ROUTE_DATA_MESSAGE, "尚無路線資料，請洽清潔隊");
  const uncovered = getCoverageForCounty("臺中市");
  assert.ok(uncovered);
  assert.equal(uncovered.routes, "none");
});

test("live-location column starts as 'none' everywhere — this ticket ships no live layer (#679 flips it per city)", () => {
  for (const row of GARBAGE_COVERAGE) {
    assert.ok(row.live === "none" || row.live === "available", `${row.county} live must be a known status`);
  }
  assert.equal(
    GARBAGE_COVERAGE.filter((row) => row.live === "available").length,
    0,
    "no live location data is wired up by B-16",
  );
});

test("owner decision D6: no user-visible coverage string contains 「全國」", () => {
  assert.ok(!NO_ROUTE_DATA_MESSAGE.includes("全國"));
  for (const row of GARBAGE_COVERAGE) {
    assert.ok(!JSON.stringify(row).includes("全國"), `${row.county} row must not say 全國`);
  }
});
