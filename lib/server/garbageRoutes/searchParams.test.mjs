// Issue #674 (B-16): validation/normalisation of GET /api/garbage-routes query
// params. Pure so it can be tested without a database.
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

const { parseGarbageRouteSearchParams, escapeLike, DEFAULT_LIMIT, MAX_LIMIT, MAX_KEYWORD_LENGTH } = await import(
  "./searchParams.ts"
);

const parse = (query) => parseGarbageRouteSearchParams(new URLSearchParams(query));

test("city is required and must be one of the two covered cities", () => {
  assert.equal(parse("").ok, false);
  assert.equal(parse("city=").ok, false);
  assert.equal(parse("city=taichung").ok, false);
  assert.equal(parse("city=臺北市").ok, false, "county names are for the UI; the API takes city codes");
  const bad = parse("city=taichung");
  assert.match(bad.error, /city/);
  assert.equal(parse("city=taipei").ok, true);
  assert.equal(parse("city=new_taipei").ok, true);
});

test("defaults: 30 per page (the site's PAGE_SIZE default), offset 0, no filters", () => {
  const result = parse("city=taipei");
  assert.deepEqual(result.params, { city: "taipei", district: undefined, keyword: undefined, limit: 30, offset: 0 });
  assert.equal(DEFAULT_LIMIT, 30);
  assert.equal(MAX_LIMIT, 100);
});

test("limit is clamped to 1..100 and falls back to the default when not a number", () => {
  assert.equal(parse("city=taipei&limit=50").params.limit, 50);
  assert.equal(parse("city=taipei&limit=100").params.limit, 100);
  assert.equal(parse("city=taipei&limit=5000").params.limit, 100);
  assert.equal(parse("city=taipei&limit=0").params.limit, 1);
  assert.equal(parse("city=taipei&limit=-3").params.limit, 1);
  assert.equal(parse("city=taipei&limit=abc").params.limit, 30);
});

test("offset is a non-negative integer", () => {
  assert.equal(parse("city=taipei&offset=60").params.offset, 60);
  assert.equal(parse("city=taipei&offset=-5").params.offset, 0);
  assert.equal(parse("city=taipei&offset=abc").params.offset, 0);
  assert.equal(parse("city=taipei&offset=1.9").params.offset, 1);
});

test("keyword and district are trimmed; blank becomes undefined; keyword length is capped", () => {
  const result = parse(`city=new_taipei&district=${encodeURIComponent(" 板橋區 ")}&keyword=${encodeURIComponent("  文化路  ")}`);
  assert.equal(result.params.district, "板橋區");
  assert.equal(result.params.keyword, "文化路");
  assert.equal(parse("city=taipei&keyword=%20%20").params.keyword, undefined);
  assert.equal(parse("city=taipei&district=").params.district, undefined);

  const long = "路".repeat(MAX_KEYWORD_LENGTH + 40);
  assert.equal(parse(`city=taipei&keyword=${encodeURIComponent(long)}`).params.keyword.length, MAX_KEYWORD_LENGTH);
});

test("escapeLike neutralises LIKE wildcards and the escape character itself", () => {
  assert.equal(escapeLike("50%"), "50!%");
  assert.equal(escapeLike("a_b"), "a!_b");
  assert.equal(escapeLike("wow!"), "wow!!");
  assert.equal(escapeLike("文化路"), "文化路");
});
