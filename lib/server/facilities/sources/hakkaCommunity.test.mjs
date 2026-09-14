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

const { hakkaCommunityRawSchema } = await import("./hakkaCommunity.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

test("hakkaCommunityRawSchema: accepts a real-shaped row from the Hakka Affairs Council export", () => {
  assert.doesNotThrow(() =>
    validateImportRows("Hakka Affairs Council Bo-Gong care stations", hakkaCommunityRawSchema, [
      { city_name: "花蓮縣", Unit_name: "花蓮縣花蓮市碧雲莊社區發展協會", Address: "花蓮市介禮街46號" },
    ]),
  );
});

test("hakkaCommunityRawSchema: tolerates a row where Address already repeats city_name (the common case)", () => {
  assert.doesNotThrow(() =>
    validateImportRows("Hakka Affairs Council Bo-Gong care stations", hakkaCommunityRawSchema, [
      { city_name: "臺中市", Unit_name: "臺中市東勢區詒福社區發展協會", Address: "臺中市東勢區詒福里詒福街65號" },
    ]),
  );
});

test("hakkaCommunityRawSchema: throws if the export renames Unit_name (the field sourceId and the facility name depend on)", () => {
  assert.throws(
    () =>
      validateImportRows("Hakka Affairs Council Bo-Gong care stations", hakkaCommunityRawSchema, [
        { city_name: "花蓮縣", OrgName: "花蓮縣花蓮市碧雲莊社區發展協會", Address: "花蓮市介禮街46號" },
      ]),
    /field "Unit_name"/,
  );
});

test("hakkaCommunityRawSchema: throws if the export renames city_name (the field the cross-county-mismatch fix depends on)", () => {
  assert.throws(
    () =>
      validateImportRows("Hakka Affairs Council Bo-Gong care stations", hakkaCommunityRawSchema, [
        { City: "花蓮縣", Unit_name: "花蓮縣花蓮市碧雲莊社區發展協會", Address: "花蓮市介禮街46號" },
      ]),
    /field "city_name"/,
  );
});
