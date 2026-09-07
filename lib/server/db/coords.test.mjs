import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

// Node's ESM resolver has no extensionless resolution, so a relative import of
// a .ts sibling needs help — same shim `locationPrecision.test.mjs` and
// `fetchDetailPage.test.mjs` already establish.
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

const { toCoordinate, coerceCoords } = await import("./coords.ts");

// The whole point of this module: Number(null) === 0 would place an
// ungeocoded row at 0°N 0°E — inside any radius filter centred near the
// equator. Null must survive as null, not become a false coordinate.
test("null and undefined stay null, not 0", () => {
  assert.equal(toCoordinate(null), null);
  assert.equal(toCoordinate(undefined), null);
});

test("empty string is treated as no coordinate, not 0", () => {
  assert.equal(toCoordinate(""), null);
});

test("a DECIMAL-shaped string coerces to the equivalent number", () => {
  assert.equal(toCoordinate("23.4700202"), 23.4700202);
  assert.equal(toCoordinate("-120.4589788"), -120.4589788);
});

test("a real number passes through unchanged", () => {
  assert.equal(toCoordinate(24.5), 24.5);
});

test("a genuine zero survives as 0, not null", () => {
  assert.equal(toCoordinate("0"), 0);
  assert.equal(toCoordinate(0), 0);
});

test("an unparseable value degrades to null rather than NaN", () => {
  assert.equal(toCoordinate("abc"), null);
});

test("coerceCoords preserves null on an ungeocoded row", () => {
  const rows = [{ id: 1, lat: null, lng: null }];
  const out = coerceCoords(rows);
  assert.equal(out[0].lat, null);
  assert.equal(out[0].lng, null);
});

test("coerceCoords converts a geocoded row's string coordinates to numbers", () => {
  const rows = [{ id: 2, lat: "23.4700202", lng: "120.4589788" }];
  const out = coerceCoords(rows);
  assert.equal(out[0].lat, 23.4700202);
  assert.equal(typeof out[0].lat, "number");
  assert.equal(out[0].lng, 120.4589788);
  assert.equal(typeof out[0].lng, "number");
});

test("coerceCoords does not invent a lat key on a row that never selected it", () => {
  // "column not selected" and "row is ungeocoded" are different facts —
  // NewsListItem.lat is optional precisely because some queries don't ask
  // for it, and this must not paper over that distinction.
  const rows = [{ id: 3, title: "no coordinates in this projection" }];
  const out = coerceCoords(rows);
  assert.equal("lat" in out[0], false);
  assert.equal("lng" in out[0], false);
});

test("coerceCoords mutates rows in place and also returns them", () => {
  const rows = [{ lat: "1.5", lng: "2.5" }];
  const out = coerceCoords(rows);
  assert.equal(out, rows);
  assert.equal(rows[0].lat, 1.5);
});
