import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { TDX_SENIORS_API_BASE, parseTdxCoordinate } = await import("./seniors.ts");

const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

test("TDX seniors base URL matches the server + path prefix in TDX's Senior OpenAPI document", () => {
  // servers[0].url = https://tdx.transportdata.tw/api/seniors, paths = /V1/Senior/...
  assert.equal(TDX_SENIORS_API_BASE, "https://tdx.transportdata.tw/api/seniors/V1/Senior");
});

test("Rail, Tourism and SeniorCard clients derive from the shared base, never the 404ing advanced-tier guess", () => {
  const rail = read("../transit/tdxSeniorClient.ts");
  const tourism = read("../seniorTourism/tdxClient.ts");

  assert.match(rail, /SENIOR_RAIL_BASE = `\$\{TDX_SENIORS_API_BASE\}\/Rail\/Station`/);
  assert.match(tourism, /SENIOR_TOURISM_BASE = `\$\{TDX_SENIORS_API_BASE\}\/Tourism`/);
  assert.match(tourism, /SENIOR_CARD_BASE = `\$\{TDX_SENIORS_API_BASE\}\/SeniorCard`/);

  // Comments may still name the old guess for context; only code is checked.
  const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const source of [rail, tourism]) {
    assert.doesNotMatch(stripComments(source), /api\/(advanced|basic)\/v\d\/Senior/i);
  }
});

test("every Senior coordinate written to the DB goes through parseTdxCoordinate", () => {
  // The transit sync's writes moved out of runSync.ts into railSyncCore.ts (station items) and
  // railSyncStore.ts (transfer rows) when it became a per-system sync (issue #704).
  for (const file of [
    "../transit/runSync.ts",
    "../transit/railSyncCore.ts",
    "../transit/railSyncStore.ts",
    "../seniorTourism/runSync.ts",
  ]) {
    assert.doesNotMatch(read(file), /Position(Lat|Lon) \?\? null/, `${file} must not write raw TDX coordinates`);
  }
  for (const file of ["../transit/railSyncCore.ts", "../transit/railSyncStore.ts", "../seniorTourism/runSync.ts"]) {
    assert.match(read(file), /parseTdxCoordinate\(/, `${file} must coerce coordinates`);
  }
});

test("parseTdxCoordinate: numeric strings and numbers pass through", () => {
  assert.equal(parseTdxCoordinate("121.517055"), 121.517055);
  assert.equal(parseTdxCoordinate(" 25.04776 "), 25.04776);
  assert.equal(parseTdxCoordinate(120.6), 120.6);
});

test("parseTdxCoordinate: missing, blank, non-numeric and zero become null", () => {
  for (const value of [undefined, null, "", "   ", "N/A", "0", 0, Number.NaN, Infinity, {}, []]) {
    assert.equal(parseTdxCoordinate(value), null, `expected null for ${JSON.stringify(value)}`);
  }
});
