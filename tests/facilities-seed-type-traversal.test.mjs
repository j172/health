import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// /api/facilities?type=<x> falls back to data/facilities-seeds/<x>.json when the
// database has nothing. <x> comes from the URL, so `../../package` used to walk out of
// the seed folder and read any other .json. Only plain seed names may reach the path.
const { isSafeSeedFileStem } = await import("../lib/server/facilities/seedFileName.ts");

test("isSafeSeedFileStem accepts the real seed names", () => {
  for (const name of fs.readdirSync(new URL("../data/facilities-seeds/", import.meta.url))) {
    if (!name.endsWith(".json")) continue;
    const stem = name.slice(0, -".json".length);
    assert.equal(isSafeSeedFileStem(stem), true, `${stem} must stay readable`);
  }
});

test("isSafeSeedFileStem rejects anything that can leave the seed folder or is not a plain name", () => {
  for (const bad of [
    "../../package",
    "..",
    "../x",
    "a/b",
    "a\b",
    "a.b",
    "x%2e%2e%2fy",
    "package.json",
    "",
    " ",
    "a b",
    "a\0b",
    "a".repeat(65),
    undefined,
    null,
    42,
    {},
  ]) {
    assert.equal(isSafeSeedFileStem(bad), false, `${JSON.stringify(bad)} must be rejected`);
  }
});

test("the facilities route only builds the generic seed path from a checked name", () => {
  const src = fs.readFileSync(new URL("../app/api/facilities/route.ts", import.meta.url), "utf8");
  assert.match(src, /isSafeSeedFileStem\(facilityType\)/);
  // 路徑現在是 `facilities-seeds/${facilityType}.json`（交給 readSeedJson 依統一順序找檔，#741）
  const idx = src.indexOf("${facilityType}.json`");
  assert.ok(idx > 0, "generic seed path is still built from facilityType");
  const before = src.slice(Math.max(0, idx - 400), idx);
  assert.match(before, /isSafeSeedFileStem\(facilityType\)/, "the path construction must sit behind the name check");
});
