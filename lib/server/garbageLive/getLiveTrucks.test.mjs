// Issue #679 (B-17, decision #13): live truck positions are fetched only when a
// visitor opens the page and are never stored. These tests pin the three
// behaviours the issue names — in-flight de-duplication (5 concurrent calls ->
// 1 upstream request), the 60-120 s in-process cache, and per-county graceful
// degradation — plus the freshness rule (stale flagged, expired hidden) and the
// guarantee that an upstream failure is never cached or leaked to the visitor.
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

const { getLiveTrucks, getLiveTrucksForCities, resetLiveTruckCacheForTests, LIVE_CACHE_TTL_MS } = await import(
  "./getLiveTrucks.ts"
);
const { ntpcLiveAdapter } = await import("./adapters/ntpc122972.ts");
const { taichungLiveAdapter } = await import("./adapters/taichung83558.ts");

const fixtureText = readFileSync(new URL("./__fixtures__/ntpc-122972-sample.csv", import.meta.url), "utf-8");
const taichungFixtureText = readFileSync(new URL("./__fixtures__/taichung-83558-sample.json", import.meta.url), "utf-8");

// 2026-10-15 22:49:30 in Taipei — 41 s after the real row's report time.
const T0 = Date.parse("2026-10-15T14:49:30Z");

const makeClock = (start = T0) => {
  const clock = { t: start, now: () => clock.t, advance: (ms) => (clock.t += ms) };
  return clock;
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const okFetcher = (text = fixtureText) => {
  const fetcher = async (url) => {
    fetcher.calls.push(url);
    return { status: 200, text };
  };
  fetcher.calls = [];
  return fetcher;
};

const makeLog = () => {
  const lines = [];
  const log = (line) => lines.push(line);
  log.lines = lines;
  return log;
};

beforeEach(() => resetLiveTruckCacheForTests());

test("cache window is inside the 60-120 s the issue asks for", () => {
  assert.ok(LIVE_CACHE_TTL_MS >= 60_000 && LIVE_CACHE_TTL_MS <= 120_000, `TTL ${LIVE_CACHE_TTL_MS}`);
});

test("in-flight de-duplication: 5 concurrent calls trigger exactly one upstream request", async () => {
  const clock = makeClock();
  const gate = deferred();
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    await gate.promise; // upstream is still answering while all 5 calls arrive
    return { status: 200, text: fixtureText };
  };
  const log = makeLog();

  const pending = Array.from({ length: 5 }, () => getLiveTrucks("new_taipei", { fetcher, now: clock.now, log }));
  gate.resolve();
  const results = await Promise.all(pending);

  assert.equal(calls.length, 1, "5 concurrent calls must share one upstream request");
  assert.equal(calls[0], ntpcLiveAdapter.endpoint);
  for (const result of results) {
    assert.equal(result.status, "ok");
    assert.equal(result.trucks.length, 4);
  }
  assert.equal(
    log.lines.filter((line) => line.includes("upstream fetch")).length,
    1,
    `the log must show one upstream request, got: ${JSON.stringify(log.lines)}`,
  );
});

test("in-flight de-duplication also holds when the calls start in the same tick and the upstream answers at once", async () => {
  const clock = makeClock();
  const fetcher = okFetcher();
  await Promise.all(Array.from({ length: 5 }, () => getLiveTrucks("new_taipei", { fetcher, now: clock.now, log: makeLog() })));
  assert.equal(fetcher.calls.length, 1);
});

test("in-flight de-duplication also coalesces a failure: 5 callers, 1 request, 5 degraded results", async () => {
  const clock = makeClock();
  const gate = deferred();
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    await gate.promise;
    throw new Error("connect ETIMEDOUT");
  };
  const pending = Array.from({ length: 5 }, () => getLiveTrucks("new_taipei", { fetcher, now: clock.now, log: makeLog() }));
  gate.resolve();
  const results = await Promise.all(pending);
  assert.equal(calls, 1);
  assert.ok(results.every((r) => r.status === "unavailable"));
});

test("cache: a second call inside the window does not hit upstream; one after it does", async () => {
  const clock = makeClock();
  const fetcher = okFetcher();
  const deps = { fetcher, now: clock.now, log: makeLog() };

  const first = await getLiveTrucks("new_taipei", deps);
  clock.advance(LIVE_CACHE_TTL_MS - 1_000);
  const second = await getLiveTrucks("new_taipei", deps);
  assert.equal(fetcher.calls.length, 1, "inside the window the cached snapshot is reused");
  assert.equal(second.fetchedAt, first.fetchedAt, "a cache hit keeps the original fetch time");

  clock.advance(2_000); // now past the window
  const third = await getLiveTrucks("new_taipei", deps);
  assert.equal(fetcher.calls.length, 2, "after the window the upstream is asked again");
  assert.notEqual(third.fetchedAt, first.fetchedAt);
});

test("cache hits write no 'upstream fetch' log line (so 5 hits in a row show 1 line in the logs)", async () => {
  const clock = makeClock();
  const fetcher = okFetcher();
  const log = makeLog();
  for (let i = 0; i < 5; i += 1) {
    await getLiveTrucks("new_taipei", { fetcher, now: clock.now, log });
    clock.advance(1_000);
  }
  assert.equal(fetcher.calls.length, 1);
  assert.equal(log.lines.filter((line) => line.includes("upstream fetch")).length, 1);
  assert.ok(log.lines.every((line) => line.includes("city=new_taipei")), "log lines name the city");
});

test("freshness at the fixture clock: fresh and stale positions are shown (stale flagged), expired and impossible ones are hidden", async () => {
  const clock = makeClock();
  const result = await getLiveTrucks("new_taipei", { fetcher: okFetcher(), now: clock.now, log: makeLog() });

  assert.equal(result.status, "ok");
  const byCar = Object.fromEntries(result.trucks.map((truck) => [truck.car, truck]));
  assert.deepEqual(Object.keys(byCar).sort(), ["KEV-0028", "TST-0002", "TST-0006", "TST-0009"]);

  assert.equal(byCar["KEV-0028"].stale, false);
  assert.equal(byCar["KEV-0028"].ageSeconds, 39); // 22:48:51 -> 22:49:30
  assert.equal(byCar["TST-0002"].stale, false);
  assert.equal(byCar["TST-0006"].stale, true, "19 minutes old: flagged, not hidden");
  assert.equal(byCar["TST-0009"].stale, false, "2.5 minutes ahead of our clock is clock skew, not an error");
  assert.equal(byCar["TST-0009"].ageSeconds, 0, "age never goes negative");

  // TST-0007 is from yesterday (expired); TST-0010 claims 23:30 (40 minutes in the future).
  assert.equal(result.hiddenCount, 2);
});

test("trucks come back freshest first", async () => {
  const clock = makeClock();
  const result = await getLiveTrucks("new_taipei", { fetcher: okFetcher(), now: clock.now, log: makeLog() });
  const ages = result.trucks.map((t) => t.ageSeconds);
  assert.deepEqual(ages, [...ages].sort((a, b) => a - b));
});

test("dataAsOf is the newest report time (never later than 'now'); fetchedAt is when upstream was asked", async () => {
  const clock = makeClock();
  const result = await getLiveTrucks("new_taipei", { fetcher: okFetcher(), now: clock.now, log: makeLog() });
  assert.equal(result.fetchedAt, new Date(T0).toISOString());
  // Newest believable report is TST-0009's 22:52:00, which is ahead of the clock -> clamped to now.
  assert.equal(result.dataAsOf, new Date(T0).toISOString());
});

test("when every report is old, nothing is drawn but the data timestamp is still shown (the real file at 00:07 was exactly this)", async () => {
  const clock = makeClock(Date.parse("2026-10-15T16:07:00Z")); // 2026-10-16 00:07 +08:00
  const realRowOnly = fixtureText.split("\n").slice(0, 2).join("\n") + "\n";
  const result = await getLiveTrucks("new_taipei", { fetcher: okFetcher(realRowOnly), now: clock.now, log: makeLog() });
  assert.equal(result.status, "ok");
  assert.deepEqual(result.trucks, []);
  assert.equal(result.hiddenCount, 1);
  assert.equal(result.dataAsOf, "2026-10-15T14:48:51.000Z");
});

test("freshness is judged on every call, not frozen when the snapshot was cached", async () => {
  const clock = makeClock();
  const reported = new Date(T0 - 590_000).toISOString(); // 9 min 50 s old when fetched
  const adapter = {
    ...ntpcLiveAdapter,
    parse: () => [
      { lineId: "L1", car: "AAA-0001", lat: 25.01, lng: 121.46, location: null, district: null, recordedAt: reported },
    ],
  };
  const fetcher = okFetcher("ignored");
  const deps = { fetcher, now: clock.now, log: makeLog(), adapters: { new_taipei: adapter } };

  const first = await getLiveTrucks("new_taipei", deps);
  assert.equal(first.trucks[0].stale, false);

  clock.advance(30_000); // still inside the cache window, but the position is now 10 min 20 s old
  const second = await getLiveTrucks("new_taipei", deps);
  assert.equal(fetcher.calls.length, 1, "served from cache");
  assert.equal(second.trucks[0].stale, true, "the same cached position is now flagged");
  assert.equal(second.trucks[0].ageSeconds, 620);
});

test("an adapter that declares no freshness window keeps the shared 10/30-minute one (新北市 is unchanged), and the response says so", async () => {
  assert.equal(ntpcLiveAdapter.freshness, undefined, "新北市 declares nothing");
  const clock = makeClock();
  const result = await getLiveTrucks("new_taipei", { fetcher: okFetcher(), now: clock.now, log: makeLog() });
  assert.deepEqual(result.freshness, { freshMaxAgeSeconds: 600, expiredAfterSeconds: 1800 });

  // A report 12 minutes old is flagged for 新北市 (it refreshes every 2 minutes) ...
  const reported = new Date(T0 - 12 * 60_000).toISOString();
  const position = { lineId: "L1", car: "AAA-0001", lat: 25.01, lng: 121.46, location: null, district: null, recordedAt: reported };
  const plain = { ...ntpcLiveAdapter, parse: () => [position] };
  resetLiveTruckCacheForTests(); // the call above cached the real fixture's snapshot for this city
  const shared = await getLiveTrucks("new_taipei", { fetcher: okFetcher("x"), now: clock.now, log: makeLog(), adapters: { new_taipei: plain } });
  assert.equal(shared.trucks[0].stale, true);

  // ... while an adapter that declares a longer window is judged by it.
  resetLiveTruckCacheForTests();
  const declared = { ...plain, freshness: { freshMaxAgeSeconds: 20 * 60, expiredAfterSeconds: 40 * 60 } };
  const own = await getLiveTrucks("new_taipei", { fetcher: okFetcher("x"), now: clock.now, log: makeLog(), adapters: { new_taipei: declared } });
  assert.equal(own.trucks[0].stale, false);
  assert.deepEqual(own.freshness, { freshMaxAgeSeconds: 1200, expiredAfterSeconds: 2400 });
});

test("an upstream failure is not cached: the very next call asks upstream again", async () => {
  const clock = makeClock();
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    if (calls === 1) throw new Error("socket hang up");
    return { status: 200, text: fixtureText };
  };
  const deps = { fetcher, now: clock.now, log: makeLog() };

  const failed = await getLiveTrucks("new_taipei", deps);
  assert.equal(failed.status, "unavailable");
  assert.equal(failed.reason, "network");
  assert.deepEqual(failed.trucks, []);
  assert.equal(failed.fetchedAt, null);
  assert.equal(failed.dataAsOf, null);

  const recovered = await getLiveTrucks("new_taipei", deps);
  assert.equal(calls, 2, "no negative caching");
  assert.equal(recovered.status, "ok");
  assert.equal(recovered.reason, null);
});

test("degradation reasons: HTTP error status, non-CSV body and a hung upstream each become an 'unavailable' result, never an exception", async () => {
  const clock = makeClock();

  const http = await getLiveTrucks("new_taipei", {
    fetcher: async () => ({ status: 503, text: "busy" }),
    now: clock.now,
    log: makeLog(),
  });
  assert.equal(http.status, "unavailable");
  assert.equal(http.reason, "http_error");

  const html = await getLiveTrucks("new_taipei", {
    fetcher: async () => ({ status: 200, text: "<html>Just a moment...</html>" }),
    now: clock.now,
    log: makeLog(),
  });
  assert.equal(html.status, "unavailable");
  assert.equal(html.reason, "bad_payload");

  const hung = await getLiveTrucks("new_taipei", {
    fetcher: () => new Promise(() => {}), // never answers
    now: clock.now,
    log: makeLog(),
    deadlineMs: 25,
  });
  assert.equal(hung.status, "unavailable");
  assert.equal(hung.reason, "timeout");

  // None of those is cached; the hung request's slot is released too.
  const fine = await getLiveTrucks("new_taipei", { fetcher: okFetcher(), now: clock.now, log: makeLog() });
  assert.equal(fine.status, "ok");
});

test("a degraded result never exposes the upstream URL or the raw error text", async () => {
  const clock = makeClock();
  const result = await getLiveTrucks("new_taipei", {
    fetcher: async () => {
      throw new Error("getaddrinfo ENOTFOUND data.ntpc.gov.tw secret-internal-detail");
    },
    now: clock.now,
    log: makeLog(),
  });
  const json = JSON.stringify(result);
  assert.ok(!json.includes("secret-internal-detail"));
  assert.ok(!json.includes("ENOTFOUND"));
  assert.ok(!json.includes("api/datasets"), "no upstream endpoint in the payload");
});

test("per-county degradation: one county failing leaves the other county's trucks intact and never throws", async () => {
  const clock = makeClock();
  const fakeEndpoint = "https://example.invalid/taichung-live";
  const fakeAdapter = {
    city: "taichung",
    county: "臺中市",
    sourceLabel: "fake",
    datasetUrl: "https://data.gov.tw/dataset/83558",
    endpoint: fakeEndpoint,
    parse: () => [],
  };
  const fetcher = async (url) => {
    if (url === fakeEndpoint) throw new Error("connect ETIMEDOUT");
    return { status: 200, text: fixtureText };
  };

  const response = await getLiveTrucksForCities(["new_taipei", "taichung"], {
    fetcher,
    now: clock.now,
    log: makeLog(),
    adapters: { new_taipei: ntpcLiveAdapter, taichung: fakeAdapter },
  });

  assert.equal(response.cities.length, 2);
  const [ntpc, taichung] = response.cities;
  assert.equal(ntpc.city, "new_taipei");
  assert.equal(ntpc.status, "ok");
  assert.equal(ntpc.trucks.length, 4);
  assert.equal(taichung.city, "taichung");
  assert.equal(taichung.county, "臺中市");
  assert.equal(taichung.status, "unavailable");
  assert.equal(response.generatedAt, new Date(T0).toISOString());
});

test("an adapter whose parser throws degrades only its own county", async () => {
  const clock = makeClock();
  const brokenAdapter = {
    ...ntpcLiveAdapter,
    city: "taichung",
    county: "臺中市",
    endpoint: "https://example.invalid/broken",
    parse: () => {
      throw new Error("unexpected shape");
    },
  };
  const response = await getLiveTrucksForCities(["new_taipei", "taichung"], {
    fetcher: okFetcher(),
    now: clock.now,
    log: makeLog(),
    adapters: { new_taipei: ntpcLiveAdapter, taichung: brokenAdapter },
  });
  assert.deepEqual(
    response.cities.map((c) => [c.city, c.status]),
    [
      ["new_taipei", "ok"],
      ["taichung", "unavailable"],
    ],
  );
});

test("getLiveTrucksForCities defaults to every registered city and carries the source for the page's attribution", async () => {
  const clock = makeClock();
  // Each city answers in its own format: 新北市 a CSV, 臺中市 a JSON array (#680).
  const fetcher = async (url) => ({ status: 200, text: url === taichungLiveAdapter.endpoint ? taichungFixtureText : fixtureText });
  const response = await getLiveTrucksForCities(undefined, { fetcher, now: clock.now, log: makeLog() });
  assert.deepEqual(
    response.cities.map((c) => c.city),
    ["new_taipei", "taichung"],
  );
  assert.deepEqual(
    response.cities.map((c) => c.status),
    ["ok", "ok"],
  );
  assert.equal(response.cities[0].county, "新北市");
  assert.equal(response.cities[0].source.datasetUrl, "https://data.gov.tw/dataset/122972");
  assert.match(response.cities[0].source.label, /新北市/);
  assert.equal(response.cities[1].county, "臺中市");
  assert.equal(response.cities[1].source.datasetUrl, "https://data.gov.tw/dataset/83558");
  assert.match(response.cities[1].source.label, /臺中市/);
});

test("the real 新北市 and 臺中市 adapters degrade independently: 臺中市's feed down leaves 新北市's trucks intact (and the reverse)", async () => {
  const clock = makeClock();
  const taichungDown = async (url) => {
    if (url === taichungLiveAdapter.endpoint) throw new Error("connect ETIMEDOUT");
    return { status: 200, text: fixtureText };
  };
  const first = await getLiveTrucksForCities(undefined, { fetcher: taichungDown, now: clock.now, log: makeLog() });
  assert.deepEqual(
    first.cities.map((c) => [c.city, c.status]),
    [
      ["new_taipei", "ok"],
      ["taichung", "unavailable"],
    ],
  );
  assert.equal(first.cities[0].trucks.length, 4);

  resetLiveTruckCacheForTests();
  const ntpcDown = async (url) => {
    if (url === ntpcLiveAdapter.endpoint) return { status: 503, text: "" };
    return { status: 200, text: taichungFixtureText };
  };
  const second = await getLiveTrucksForCities(undefined, { fetcher: ntpcDown, now: clock.now, log: makeLog() });
  assert.deepEqual(
    second.cities.map((c) => [c.city, c.status]),
    [
      ["new_taipei", "unavailable"],
      ["taichung", "ok"],
    ],
  );
  assert.equal(second.cities[0].reason, "http_error");
});

test("a city with no registered adapter is a programming error and throws (the route validates the city before this point)", async () => {
  await assert.rejects(
    getLiveTrucks("atlantis", { fetcher: okFetcher(), now: makeClock().now, log: makeLog() }),
    /no live-truck adapter/,
  );
});

test("every city code in LIVE_TRUCK_CITIES has an adapter, and the adapter agrees on the county", async () => {
  const { LIVE_TRUCK_ADAPTERS } = await import("./registry.ts");
  const { LIVE_TRUCK_CITIES, countyForLiveCity } = await import("../../tools/garbageTrucks/live.ts");
  assert.deepEqual(Object.keys(LIVE_TRUCK_ADAPTERS).sort(), [...LIVE_TRUCK_CITIES].sort());
  for (const city of LIVE_TRUCK_CITIES) {
    assert.equal(LIVE_TRUCK_ADAPTERS[city].city, city);
    assert.equal(LIVE_TRUCK_ADAPTERS[city].county, countyForLiveCity(city));
  }
});
