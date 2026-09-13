import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { buildMolOccupationalInjurySourceId } = await import("./molOccupationalInjuryHospital.ts");

test("buildMolOccupationalInjurySourceId: produces stable compound key {name}|{address}", () => {
  const name = "國立臺灣大學醫學院附設醫院";
  const address = "臺北市中正區中山南路7號";
  const sourceId = buildMolOccupationalInjurySourceId(name, address);

  assert.equal(sourceId, "國立臺灣大學醫學院附設醫院|臺北市中正區中山南路7號");
});

test("buildMolOccupationalInjurySourceId: handles empty or null address gracefully", () => {
  assert.equal(
    buildMolOccupationalInjurySourceId("臺北榮民總醫院", null),
    "臺北榮民總醫院|"
  );
  assert.equal(
    buildMolOccupationalInjurySourceId("臺北榮民總醫院", ""),
    "臺北榮民總醫院|"
  );
  assert.equal(
    buildMolOccupationalInjurySourceId("臺北榮民總醫院", undefined),
    "臺北榮民總醫院|"
  );
});

test("buildMolOccupationalInjurySourceId: trims leading and trailing whitespace", () => {
  const sourceId = buildMolOccupationalInjurySourceId("  奇美醫療財團法人奇美醫院  ", "  臺南市永康區中華路901號  ");
  assert.equal(sourceId, "奇美醫療財團法人奇美醫院|臺南市永康區中華路901號");
});

test("buildMolOccupationalInjurySourceId: enforces 100 character maximum length limit", () => {
  const longName = "A".repeat(80);
  const longAddress = "B".repeat(80);
  const sourceId = buildMolOccupationalInjurySourceId(longName, longAddress);

  assert.ok(sourceId.length <= 100, `Length ${sourceId.length} should be <= 100`);
  assert.equal(sourceId.length, 100);
  assert.equal(sourceId, `${"A".repeat(80)}|${"B".repeat(19)}`);
});
