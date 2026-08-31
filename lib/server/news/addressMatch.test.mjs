import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

// Same resolver shim the other lib tests use: Node's ESM resolver has no
// extensionless resolution, so a relative import of a .ts sibling needs help.
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

const { matchStreetAddress } = await import("./addressMatch.ts");

// The measured false positive: nine live articles, one syndicated sentence, and
// the old pattern called every one of them an address.
test("a sentence ending in 上路 is not an address", () => {
  assert.equal(
    matchStreetAddress("新竹縣的國中小營養午餐5大升級方案今起上路"),
    null,
  );
});

test("other clause-ending 路 words are not addresses either", () => {
  for (const s of [
    "臺北市民眾可透過網路預約",
    "高雄市推動長照服務的新思路",
    "桃園市擴大通路合作",
    "彰化縣道路施工一路順暢",
  ]) {
    assert.equal(matchStreetAddress(s), null, s);
  }
});

test("a road name with no house number is rejected", () => {
  // Deliberate: a road is not a location. Geocoding it returns the road's
  // midpoint while claiming the precision of a street address.
  assert.equal(matchStreetAddress("臺北市大安區信義路三段"), null);
});

test("a real address is matched", () => {
  assert.equal(
    matchStreetAddress("中央氣象署位於臺北市中正區公園路64號"),
    "臺北市中正區公園路64號",
  );
});

test("full-width digits are matched", () => {
  assert.equal(
    matchStreetAddress("臺北市中正區公園路６４號"),
    "臺北市中正區公園路６４號",
  );
});

test("台 and 臺 are both accepted", () => {
  assert.ok(matchStreetAddress("台北市中正區公園路64號"));
  assert.ok(matchStreetAddress("臺中市西區民權路100號"));
});

test("the capture stops at the first house number", () => {
  // Non-greedy: without it the match would run on through the second address.
  assert.equal(
    matchStreetAddress("臺北市中正區公園路64號，另一處在臺北市大安區和平東路二段134號"),
    "臺北市中正區公園路64號",
  );
});

test("a county named far from any number does not reach one later in the text", () => {
  // 24-character ceiling between the county and the number, so a county name in
  // one clause cannot pair with a house number in an unrelated later clause.
  assert.equal(
    matchStreetAddress(
      "新竹縣今日公布多項政策，涵蓋教育、交通與長照等領域，另據了解相關單位設於公園路64號",
    ),
    null,
  );
});
