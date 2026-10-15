// Issue #679 (B-17): behaviour of GET /api/garbage-trucks/live, exercised through
// the request handler the route file delegates to (so the real fetcher can be
// replaced by a counting fake). Pins the header rule from spec §4.4 — explicit
// Cache-Control with s-maxage <= 60 — and the "one upstream request however
// many visitors" guarantee seen from the outside.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
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

const { handleLiveTrucksRequest } = await import("./handler.ts");
const { resetLiveTruckCacheForTests } = await import("./getLiveTrucks.ts");

const fixtureText = readFileSync(new URL("./__fixtures__/ntpc-122972-sample.csv", import.meta.url), "utf-8");
const T0 = Date.parse("2026-10-15T14:49:30Z");

const makeDeps = (overrides = {}) => {
  const calls = [];
  const logLines = [];
  return {
    calls,
    logLines,
    deps: {
      fetcher: async (url) => {
        calls.push(url);
        return { status: 200, text: fixtureText };
      },
      now: () => T0,
      log: (line) => logLines.push(line),
      ...overrides,
    },
  };
};

const get = (query = "") => new Request(`https://health.j172.tw/api/garbage-trucks/live${query}`);

const sMaxAge = (response) => {
  const match = /s-maxage=(\d+)/.exec(response.headers.get("cache-control") ?? "");
  return match ? Number(match[1]) : null;
};

beforeEach(() => resetLiveTruckCacheForTests());

test("200 with an explicit Cache-Control: public, s-maxage <= 60 (spec §4.4; never the upstream's mystery 30-minute default)", async () => {
  const { deps } = makeDeps();
  const response = await handleLiveTrucksRequest(get(), deps);
  assert.equal(response.status, 200);
  const header = response.headers.get("cache-control");
  assert.ok(header, "Cache-Control must be set explicitly");
  assert.match(header, /\bpublic\b/);
  const maxAge = sMaxAge(response);
  assert.ok(maxAge !== null && maxAge > 0 && maxAge <= 60, `s-maxage must be 1..60, got ${header}`);
  assert.ok(!/(^|,\s*)max-age=/.test(header), "browsers get no max-age of their own: the edge TTL is the only cache window");
});

test("body: ok flag, generation time and one entry per live city with trucks, data timestamp and attribution", async () => {
  const { deps } = makeDeps();
  const body = await (await handleLiveTrucksRequest(get(), deps)).json();
  assert.equal(body.ok, true);
  assert.equal(body.generatedAt, new Date(T0).toISOString());
  assert.equal(body.cities.length, 1);
  const [ntpc] = body.cities;
  assert.equal(ntpc.city, "new_taipei");
  assert.equal(ntpc.county, "新北市");
  assert.equal(ntpc.status, "ok");
  assert.equal(ntpc.trucks.length, 4);
  assert.equal(ntpc.hiddenCount, 2);
  assert.ok(ntpc.dataAsOf && ntpc.fetchedAt);
  assert.equal(ntpc.source.datasetUrl, "https://data.gov.tw/dataset/122972");
  assert.ok(ntpc.trucks.every((truck) => typeof truck.ageSeconds === "number" && typeof truck.stale === "boolean"));
});

test("5 requests in a row, with cache-busting query strings, make exactly 1 upstream request and 1 log line", async () => {
  const { deps, calls, logLines } = makeDeps();
  for (let i = 0; i < 5; i += 1) {
    const response = await handleLiveTrucksRequest(get(`?cb=${i}`), deps);
    assert.equal(response.status, 200, "an unknown query parameter must not be rejected");
  }
  assert.equal(calls.length, 1);
  assert.equal(logLines.filter((line) => line.includes("upstream fetch")).length, 1);
});

test("5 concurrent requests also make exactly 1 upstream request", async () => {
  const { deps, calls } = makeDeps();
  const responses = await Promise.all(Array.from({ length: 5 }, () => handleLiveTrucksRequest(get(), deps)));
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(calls.length, 1);
});

test("?city=new_taipei narrows to that city", async () => {
  const { deps } = makeDeps();
  const body = await (await handleLiveTrucksRequest(get("?city=new_taipei"), deps)).json();
  assert.deepEqual(
    body.cities.map((c) => c.city),
    ["new_taipei"],
  );
});

test("an unknown city is a 400 that is never cached", async () => {
  const { deps, calls } = makeDeps();
  const response = await handleLiveTrucksRequest(get("?city=atlantis"), deps);
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(calls.length, 0, "validation happens before any upstream request");
});

test("a county whose feed is down is still a 200 (the page degrades per county) with a shorter edge TTL so recovery is quick", async () => {
  const healthy = await handleLiveTrucksRequest(get(), makeDeps().deps);
  resetLiveTruckCacheForTests();

  const failing = makeDeps({
    fetcher: async () => {
      throw new Error("connect ETIMEDOUT data.ntpc.gov.tw:443");
    },
  });
  const response = await handleLiveTrucksRequest(get(), failing.deps);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.cities[0].status, "unavailable");
  assert.equal(body.cities[0].reason, "network");
  assert.deepEqual(body.cities[0].trucks, []);

  const degradedAge = sMaxAge(response);
  assert.ok(degradedAge !== null && degradedAge <= 60);
  assert.ok(degradedAge < sMaxAge(healthy), "a degraded answer must not be edge-cached as long as a good one");
  assert.ok(!JSON.stringify(body).includes("ETIMEDOUT"), "no raw upstream error text reaches the visitor");
});

test("the response never echoes the request's query string or any visitor detail back", async () => {
  const { deps } = makeDeps();
  const request = new Request("https://health.j172.tw/api/garbage-trucks/live?lat=25.03&lng=121.56&cb=1", {
    headers: { "x-forwarded-for": "203.0.113.9", cookie: "session=abc" },
  });
  const text = await (await handleLiveTrucksRequest(request, deps)).text();
  for (const needle of ["25.03", "121.56", "203.0.113.9", "session=abc"]) {
    assert.ok(!text.includes(needle), `response leaked ${needle}`);
  }
});

test("the handler's log lines never contain the visitor's query or coordinates", async () => {
  const { deps, logLines } = makeDeps();
  await handleLiveTrucksRequest(get("?lat=25.0330&lng=121.5654"), deps);
  assert.ok(logLines.length > 0);
  for (const line of logLines) {
    assert.ok(!/25\.0330|121\.5654|lat=|lng=/.test(line), `log line leaks location: ${line}`);
  }
});
