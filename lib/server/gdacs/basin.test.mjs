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

const { deriveTcBasin } = await import("./basin.ts");

test("deriveTcBasin: Western Pacific (near Taiwan)", () => {
  assert.equal(deriveTcBasin(23.5, 121.0), "WP");
  assert.equal(deriveTcBasin(15, 130), "WP");
});

test("deriveTcBasin: Eastern Pacific (off Mexico — the live TRUDY-26 fixture's position)", () => {
  assert.equal(deriveTcBasin(11.2, -97.0), "EP");
});

test("deriveTcBasin: North Atlantic", () => {
  assert.equal(deriveTcBasin(20, -60), "NA");
});

test("deriveTcBasin: North Indian Ocean", () => {
  assert.equal(deriveTcBasin(15, 85), "NI");
});

test("deriveTcBasin: South-West Indian Ocean", () => {
  assert.equal(deriveTcBasin(-15, 60), "SI");
});

test("deriveTcBasin: Australian region", () => {
  assert.equal(deriveTcBasin(-15, 130), "AU");
});

test("deriveTcBasin: South Pacific, including across the dateline", () => {
  assert.equal(deriveTcBasin(-18, 175), "SP");
  assert.equal(deriveTcBasin(-18, -170), "SP");
});

test("deriveTcBasin: handles lng given in 0-360 convention the same as -180..180", () => {
  assert.equal(deriveTcBasin(11.2, 263), "EP"); // 263 - 360 = -97, same as the EP test above
});

test("deriveTcBasin: returns null in the gap where no basin forms (0-30E, northern hemisphere)", () => {
  assert.equal(deriveTcBasin(20, 10), null);
});
