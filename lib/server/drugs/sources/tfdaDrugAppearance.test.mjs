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

const { tfdaDrugAppearanceRawSchema } = await import("./tfdaDrugAppearance.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

test("tfdaDrugAppearanceRawSchema: accepts a real-shaped row from the TFDA export/42 dataset", () => {
  assert.doesNotThrow(() =>
    validateImportRows("TFDA drug appearance", tfdaDrugAppearanceRawSchema, [
      {
        許可證字號: "衛部藥製字第012345號",
        中文品名: "普拿疼錠500公絲",
        英文品名: "Panadol Tablets 500mg",
        形狀: "圓形",
        特殊劑型: null,
        顏色: "白色",
        特殊氣味: null,
        刻痕: null,
        外觀尺寸: "10mm",
        標註一: "P",
        標註二: null,
        外觀圖檔連結: null,
      },
    ]),
  );
});

test("tfdaDrugAppearanceRawSchema: tolerates a row with legitimately null appearance detail fields", () => {
  assert.doesNotThrow(() =>
    validateImportRows("TFDA drug appearance", tfdaDrugAppearanceRawSchema, [
      { 許可證字號: "衛部藥製字第099999號", 中文品名: "某藥品", 形狀: null, 顏色: null },
    ]),
  );
});

test("tfdaDrugAppearanceRawSchema: throws if TFDA renames 許可證字號 (the field upsertDrugs() keys on)", () => {
  assert.throws(
    () =>
      validateImportRows("TFDA drug appearance", tfdaDrugAppearanceRawSchema, [
        { LicenseNo: "衛部藥製字第012345號", 中文品名: "普拿疼錠500公絲" },
      ]),
    /field "許可證字號"/,
  );
});

test("tfdaDrugAppearanceRawSchema: throws if a critical field changes type (e.g. 許可證字號 becomes a number)", () => {
  assert.throws(
    () =>
      validateImportRows("TFDA drug appearance", tfdaDrugAppearanceRawSchema, [
        { 許可證字號: 12345, 中文品名: "普拿疼錠500公絲" },
      ]),
    /field "許可證字號"/,
  );
});
