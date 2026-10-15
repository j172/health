// Issue #679 (B-17): the client-safe vocabulary of the live garbage-truck layer —
// which cities have a live adapter, and how old a position may be before it is
// flagged or hidden. Server (getLiveTrucks) and page share these, so the rule
// "stale positions are flagged, expired ones are never drawn" lives in one place.
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
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

const {
  LIVE_TRUCK_CITIES,
  LIVE_FRESH_MAX_AGE_SECONDS,
  LIVE_EXPIRED_AGE_SECONDS,
  LIVE_FUTURE_SKEW_SECONDS,
  countyForLiveCity,
  isLiveTruckCity,
  classifyTruckAge,
  formatTruckAge,
  formatTaipeiDateTime,
} = await import("./live.ts");
const { TAIWAN_COUNTIES } = await import("../../constants/taiwanDistricts.ts");

test("only 新北市 has a live adapter in this ticket (#680 adds 臺中市 with the same skeleton)", () => {
  assert.deepEqual([...LIVE_TRUCK_CITIES], ["new_taipei"]);
  assert.equal(countyForLiveCity("new_taipei"), "新北市");
  assert.ok(TAIWAN_COUNTIES.includes(countyForLiveCity("new_taipei")));
});

test("isLiveTruckCity accepts exactly the registered city codes", () => {
  assert.equal(isLiveTruckCity("new_taipei"), true);
  for (const bad of ["taipei", "taichung", "", "NEW_TAIPEI", null, undefined, 3]) {
    assert.equal(isLiveTruckCity(bad), false, `should reject ${String(bad)}`);
  }
});

test("freshness thresholds: fresh up to 10 minutes, flagged stale up to 30 minutes, hidden beyond", () => {
  assert.equal(LIVE_FRESH_MAX_AGE_SECONDS, 10 * 60);
  assert.equal(LIVE_EXPIRED_AGE_SECONDS, 30 * 60);
  assert.ok(LIVE_FUTURE_SKEW_SECONDS > 0 && LIVE_FUTURE_SKEW_SECONDS <= 10 * 60);

  assert.equal(classifyTruckAge(0), "fresh");
  assert.equal(classifyTruckAge(120), "fresh");
  assert.equal(classifyTruckAge(LIVE_FRESH_MAX_AGE_SECONDS), "fresh");
  assert.equal(classifyTruckAge(LIVE_FRESH_MAX_AGE_SECONDS + 1), "stale");
  assert.equal(classifyTruckAge(LIVE_EXPIRED_AGE_SECONDS), "stale");
  assert.equal(classifyTruckAge(LIVE_EXPIRED_AGE_SECONDS + 1), "expired");
  // 78 minutes old — the real file's only row when this ticket was written (00:07 vs 22:48).
  assert.equal(classifyTruckAge(78 * 60), "expired");
});

test("a report slightly ahead of our clock counts as fresh; one far in the future is invalid, never drawn", () => {
  assert.equal(classifyTruckAge(-30), "fresh");
  assert.equal(classifyTruckAge(-LIVE_FUTURE_SKEW_SECONDS), "fresh");
  assert.equal(classifyTruckAge(-LIVE_FUTURE_SKEW_SECONDS - 1), "invalid");
  assert.equal(classifyTruckAge(Number.NaN), "invalid");
});

test("formatTaipeiDateTime prints the instant as Taipei wall-clock time, across the midnight boundary, and '' for junk", () => {
  assert.equal(formatTaipeiDateTime("2026-10-15T14:48:51.000Z"), "2026/10/15 22:48:51");
  assert.equal(formatTaipeiDateTime("2026-10-15T16:07:00.000Z"), "2026/10/16 00:07:00");
  assert.equal(formatTaipeiDateTime("2026-12-31T16:00:00.000Z"), "2027/01/01 00:00:00");
  assert.equal(formatTaipeiDateTime("not a date"), "");
});

test("formatTruckAge reads naturally in Traditional Chinese and never goes negative", () => {
  assert.equal(formatTruckAge(-20), "不到 1 分鐘前");
  assert.equal(formatTruckAge(0), "不到 1 分鐘前");
  assert.equal(formatTruckAge(59), "不到 1 分鐘前");
  assert.equal(formatTruckAge(60), "1 分鐘前");
  assert.equal(formatTruckAge(7 * 60 + 30), "7 分鐘前");
  assert.equal(formatTruckAge(59 * 60 + 59), "59 分鐘前");
  assert.equal(formatTruckAge(3600), "1 小時前");
  assert.equal(formatTruckAge(78 * 60), "1 小時前");
  assert.equal(formatTruckAge(5 * 3600 + 10), "5 小時前");
});
