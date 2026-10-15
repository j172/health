// Unit tests for lib/server/facilities/twd97.ts — run with `npm test`.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(specifier + extension, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(specifier + extension, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { twd97ToWgs84, isWithinTaiwanBounds } = await import("./twd97.ts");

// Real X坐標/Y坐標 pair taken from a live row of 臺中市公私協力及私立托嬰中心
// (dataset 83669, confirmed live 2026-10-14): "臺中市東區東勢里17鄰進化路221
// 巷25號1-3樓" — expected to land in 臺中市東區 (~lat 24.13–24.16, lng 120.68–120.70).
test("twd97ToWgs84: converts a real 83669 X/Y pair into 臺中市東區", () => {
  const point = twd97ToWgs84(218777.003, 2671649.703);
  assert.ok(point, "expected a non-null result");
  assert.ok(point.lat > 24.1 && point.lat < 24.2, `lat ${point.lat} out of expected 臺中市東區 range`);
  assert.ok(point.lng > 120.6 && point.lng < 120.8, `lng ${point.lng} out of expected 臺中市東區 range`);
});

test("twd97ToWgs84: a second real 83669 X/Y pair also lands in Taichung", () => {
  const point = twd97ToWgs84(219304.532, 2670293.385);
  assert.ok(point, "expected a non-null result");
  assert.ok(point.lat > 24.1 && point.lat < 24.2, `lat ${point.lat} out of expected range`);
  assert.ok(point.lng > 120.6 && point.lng < 120.8, `lng ${point.lng} out of expected range`);
});

test("twd97ToWgs84: returns null for non-finite input instead of throwing", () => {
  assert.equal(twd97ToWgs84(NaN, 2671649.703), null);
  assert.equal(twd97ToWgs84(218777.003, undefined), null);
});

test("twd97ToWgs84: returns null when the converted point falls outside Taiwan (e.g. swapped X/Y)", () => {
  // Swapping X and Y for this real pair sends the result far outside Taiwan's bounds.
  const point = twd97ToWgs84(2671649.703, 218777.003);
  assert.equal(point, null);
});

test("isWithinTaiwanBounds: rejects NaN and out-of-range coordinates", () => {
  assert.equal(isWithinTaiwanBounds(NaN, 121), false);
  assert.equal(isWithinTaiwanBounds(0, 0), false);
  assert.equal(isWithinTaiwanBounds(24.15, 120.68), true);
});
