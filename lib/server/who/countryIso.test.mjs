// Tests for the WHO DON country-name -> ISO resolver (issue #596, parent
// #583) — same loader-hook + ".ts via node:test" approach as
// lib/server/gdacs/sources/gdacs.test.mjs.
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

const { resolveCountryIsoFromName } = await import("./countryIso.ts");

test("resolves a country name that matches #589's EPIDEMIC_COUNTRY_NAMES table verbatim (reused, not re-derived)", () => {
  assert.equal(resolveCountryIsoFromName("India"), "IN");
  assert.equal(resolveCountryIsoFromName("Italy"), "IT");
  assert.equal(resolveCountryIsoFromName("Ethiopia"), "ET");
});

test("is case- and whitespace-insensitive", () => {
  assert.equal(resolveCountryIsoFromName("  india  "), "IN");
  assert.equal(resolveCountryIsoFromName("ITALY"), "IT");
});

test("resolves a known WHO-vs-CDC naming variant via the explicit alias list", () => {
  assert.equal(resolveCountryIsoFromName("the Russian Federation"), "RU");
  assert.equal(resolveCountryIsoFromName("United States of America"), "US");
});

test("returns null for a multi-country location segment rather than guessing one country", () => {
  assert.equal(resolveCountryIsoFromName("Democratic Republic of the Congo & Uganda"), null);
});

test("returns null for Global/Multi-country/regional segments", () => {
  assert.equal(resolveCountryIsoFromName("Global"), null);
  assert.equal(resolveCountryIsoFromName("Global situation"), null);
  assert.equal(resolveCountryIsoFromName("Multi-country"), null);
  assert.equal(resolveCountryIsoFromName("Multi-locations"), null);
  assert.equal(resolveCountryIsoFromName("African Region (AFRO)"), null);
});

test("returns null for an unrecognized name rather than a fuzzy/guessed match", () => {
  assert.equal(resolveCountryIsoFromName("Not A Real Country"), null);
});
