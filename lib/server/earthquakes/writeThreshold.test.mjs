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

const { MIN_WRITE_MAGNITUDE, meetsWriteThreshold } = await import("./writeThreshold.ts");

// ---------------------------------------------------------------------------
// meetsWriteThreshold (issue #582 write-threshold pure function)
// ---------------------------------------------------------------------------

test("MIN_WRITE_MAGNITUDE is 2.5 — below every display floor (M4.0 CWA-tier / M6.0 worldwide-tier)", () => {
  assert.equal(MIN_WRITE_MAGNITUDE, 2.5);
});

test("meetsWriteThreshold: above the threshold writes", () => {
  assert.equal(meetsWriteThreshold(2.6), true);
  assert.equal(meetsWriteThreshold(6.1), true);
  assert.equal(meetsWriteThreshold(9.0), true);
});

test("meetsWriteThreshold: exactly at the threshold writes (inclusive)", () => {
  assert.equal(meetsWriteThreshold(MIN_WRITE_MAGNITUDE), true);
});

test("meetsWriteThreshold: below the threshold does not write", () => {
  assert.equal(meetsWriteThreshold(2.4), false);
  assert.equal(meetsWriteThreshold(0.5), false);
  assert.equal(meetsWriteThreshold(-1), false);
});

test("meetsWriteThreshold: null magnitude does not write", () => {
  assert.equal(meetsWriteThreshold(null), false);
});
