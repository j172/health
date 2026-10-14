import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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

const { isoDateFromYyyymmdd, isoDateFromRocYearEnd, isExpiredValidity } = await import("./babyFriendlyHospitalShared.ts");

test("isoDateFromYyyymmdd: parses an 8-digit 西元年 date (Taipei/New Taipei's format)", () => {
  assert.equal(isoDateFromYyyymmdd("20241231"), "2024-12-31");
  assert.equal(isoDateFromYyyymmdd("20260211"), "2026-02-11");
});

test("isoDateFromYyyymmdd: returns null for empty/unparseable input rather than throwing", () => {
  assert.equal(isoDateFromYyyymmdd(null), null);
  assert.equal(isoDateFromYyyymmdd(undefined), null);
  assert.equal(isoDateFromYyyymmdd(""), null);
  assert.equal(isoDateFromYyyymmdd("116年底"), null, "must not misparse Changhua's textual format as a YYYYMMDD date");
});

test("isoDateFromRocYearEnd: parses Changhua's '116年底' into 2027-12-31", () => {
  assert.equal(isoDateFromRocYearEnd("116年底"), "2027-12-31");
});

test("isoDateFromRocYearEnd: returns null for empty/unparseable input rather than throwing", () => {
  assert.equal(isoDateFromRocYearEnd(null), null);
  assert.equal(isoDateFromRocYearEnd(""), null);
  assert.equal(isoDateFromRocYearEnd("20241231"), null, "must not misparse Taipei's YYYYMMDD format as ROC-year-end text");
});

test("isExpiredValidity: true once the validity date is strictly before today", () => {
  assert.equal(isExpiredValidity("2024-12-31", "2026-10-14"), true);
  assert.equal(isExpiredValidity("2025-12-31", "2026-10-14"), true);
});

test("isExpiredValidity: false while the validity date is still today or in the future", () => {
  assert.equal(isExpiredValidity("2026-10-14", "2026-10-14"), false);
  assert.equal(isExpiredValidity("2027-12-31", "2026-10-14"), false);
});

test("isExpiredValidity: a null/unparseable date is never treated as expired (rows with no expiry info of their own stay in)", () => {
  assert.equal(isExpiredValidity(null, "2026-10-14"), false);
});
