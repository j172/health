import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

const REPO_ROOT = new URL("../../../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSyncSafe(candidate)) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

function existsSyncSafe(url) {
  try {
    return fs.existsSync(fileURLToPath(url));
  } catch {
    return false;
  }
}

const {
  antiDrugCenterRowSchema,
  buildAntiDrugCenterSourceId,
  parseAntiDrugCenterHtml,
  stripSecondaryAddress,
} = await import("./antiDrugCenters.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");
const { normalizeAddress } = await import("../csv.ts");

const FIXTURE_PATH = path.join(
  fileURLToPath(REPO_ROOT),
  "lib/server/facilities/__fixtures__/anti-drug-center-sample.html",
);

function loadFixtureHtml() {
  return fs.readFileSync(FIXTURE_PATH, "utf-8");
}

test("real fixture: parses all 4 rows from the #HelpCenter table (name + address)", () => {
  const rows = parseAntiDrugCenterHtml(loadFixtureHtml());
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], { name: "臺北市政府毒品危害防制中心", address: "臺北市萬華區昆明街100號4樓" });
});

test("real fixture: the last row in document order (連江縣) is not dropped or mishandled", () => {
  const rows = parseAntiDrugCenterHtml(loadFixtureHtml());
  const last = rows[rows.length - 1];
  assert.equal(last.name, "連江縣政府毒品危害防制中心");
  assert.equal(last.address, "連江縣南竿鄉復興村216號");
});

test("real fixture: a hyphenated house number (金門縣's 復興路1-12號) parses as plain text, untouched", () => {
  const rows = parseAntiDrugCenterHtml(loadFixtureHtml());
  const kinmen = rows.find((r) => r.name?.includes("金門縣"));
  assert.equal(kinmen.address, "金門縣金湖鎮新市里復興路1-12號");
});

test("real fixture: passes antiDrugCenterRowSchema validation", () => {
  const rows = parseAntiDrugCenterHtml(loadFixtureHtml());
  assert.doesNotThrow(() => validateImportRows("Anti-drug prevention centers (反毒大本營)", antiDrugCenterRowSchema, rows));
});

test("stripSecondaryAddress: drops a second office's full address glued on with a full-width '、' (臺南市's real row — the only anomaly across all 22)", () => {
  const raw = "臺南市東區林森路一段418號(林森辦公室)、臺南市新營區東興路163號(東興辦公室)";
  assert.equal(stripSecondaryAddress(raw), "臺南市東區林森路一段418號(林森辦公室)");
});

test("stripSecondaryAddress: full pipeline with normalizeAddress drops both the second office's address AND the parenthetical annotation", () => {
  const raw = "臺南市東區林森路一段418號(林森辦公室)、臺南市新營區東興路163號(東興辦公室)";
  assert.equal(normalizeAddress(stripSecondaryAddress(raw)), "臺南市東區林森路一段418號");
});

test("stripSecondaryAddress: a normal single-office address (only one county-name match) is returned untouched", () => {
  assert.equal(stripSecondaryAddress("臺北市萬華區昆明街100號4樓"), "臺北市萬華區昆明街100號4樓");
  assert.equal(stripSecondaryAddress("連江縣南竿鄉復興村216號"), "連江縣南竿鄉復興村216號");
});

test("stripSecondaryAddress: also matches the informal 台 spelling as a second occurrence", () => {
  assert.equal(stripSecondaryAddress("台南市東區林森路一段418號、台南市新營區東興路163號"), "台南市東區林森路一段418號");
});

test("buildAntiDrugCenterSourceId: produces a stable compound key {name}|{address}", () => {
  assert.equal(
    buildAntiDrugCenterSourceId("臺北市政府毒品危害防制中心", "臺北市萬華區昆明街100號4樓"),
    "臺北市政府毒品危害防制中心|臺北市萬華區昆明街100號4樓",
  );
});

test("buildAntiDrugCenterSourceId: handles a null/empty address gracefully", () => {
  assert.equal(buildAntiDrugCenterSourceId("某中心", null), "某中心|");
  assert.equal(buildAntiDrugCenterSourceId("某中心", undefined), "某中心|");
});

test("parseAntiDrugCenterHtml: an empty/unexpected page structure (no #HelpCenter table) returns an empty array, not a throw", () => {
  assert.deepEqual(parseAntiDrugCenterHtml("<html><body>no table here</body></html>"), []);
});

test("antiDrugCenterRowSchema: throws if address comes back a non-string for every row (e.g. the selector started matching the wrong <td>)", () => {
  assert.throws(
    () =>
      validateImportRows("Anti-drug prevention centers (反毒大本營)", antiDrugCenterRowSchema, [
        { name: "某中心", address: 123 },
      ]),
    /field "address"/,
  );
});

test("antiDrugCenterRowSchema: throws if the `address` key is entirely missing (renamed/removed upstream)", () => {
  assert.throws(
    () =>
      validateImportRows("Anti-drug prevention centers (反毒大本營)", antiDrugCenterRowSchema, [{ name: "某中心" }]),
    /field "address"/,
  );
});
