// Tests for the WHO DON disease-name dictionary (issue #596, parent #583).
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

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

const { resolveDiseaseName } = await import("./diseaseNames.ts");

test("resolves an exact-match disease name", () => {
  assert.equal(resolveDiseaseName("Yellow fever"), "黃熱病");
  assert.equal(resolveDiseaseName("Marburg virus disease"), "馬堡病毒出血熱");
});

test("is case-insensitive", () => {
  assert.equal(resolveDiseaseName("YELLOW FEVER"), "黃熱病");
});

test("WHO's Bundibugyo-virus phrasing maps to the same zh name as issue #589's plain 'Ebola virus disease' key", () => {
  assert.equal(resolveDiseaseName("Ebola disease caused by Bundibugyo virus"), "伊波拉病毒感染");
  assert.equal(resolveDiseaseName("Ebola virus disease"), "伊波拉病毒感染");
});

test("falls back to a substring match for a disease name WHO qualified with extra clade/subtype text", () => {
  assert.equal(
    resolveDiseaseName("Mpox: recombinant virus with genomic elements of clades Ib and IIb"),
    "M痘",
  );
});

test("returns null for a disease name not in the dictionary, never a guessed translation", () => {
  assert.equal(resolveDiseaseName("Pneumonia of undetermined etiology"), null);
  assert.equal(resolveDiseaseName("Some Entirely Unknown Disease"), null);
});
