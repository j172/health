// YouBike TDX 回合（tdxSyncCore.ts）— TDX 點數超額後的降載：
//   - 平常每個縣市只打 Bike/Availability 一次（舊版是 Station + Availability = 2 次，且含雙北）；
//   - 站名／地址／座標／車柱數從資料庫併入；
//   - 只有「資料庫沒有」「距上次載入超過 24 小時」「Availability 出現未知 StationID」才補打 Bike/Station，
//     且每輪有上限；載入時間存在 DB，行程重啟不會重載；
//   - 斷路器開啟（沒有 token）時完全不打 TDX；單一縣市失敗互相隔離。
// 全部用假的邊界（TDX 呼叫、資料庫、新竹直連）驅動，沒有任何網路或 MySQL。
import test from "node:test";
import assert from "node:assert/strict";
import { registerRepoHooks } from "../garbageRoutes/testSupport/repoHooks.mjs";

registerRepoHooks();
const core = await import("./tdxSyncCore.ts");
const { planCityRound, runTdxCitiesSync, MAX_STATION_REQUESTS_PER_RUN, STATION_REFRESH_INTERVAL_MS, UNKNOWN_STATION_REFRESH_COOLDOWN_MS } = core;

const HOUR = 60 * 60_000;
const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);
/** The 13 cities the TDX round owns, in the production order. */
const CITIES = ["TYCG", "HSC", "HCH", "MAL", "TXG", "CHA", "YUN", "CYI", "CYQ", "TNN", "KHH", "PTT", "TTT"];

// --- fixtures ----------------------------------------------------------------------------------

const staticRow = (stationNo, over = {}) => ({
  stationNo,
  nameTw: `站${stationNo}`,
  districtTw: "測試區",
  addressTw: `路${stationNo}號`,
  lat: 24.1,
  lng: 120.6,
  totalSpaces: 20,
  ...over,
});

const availItem = (id, bikes = 5, empty = 10, over = {}) => ({
  StationUID: `UID${id}`,
  StationID: id,
  ServiceStatus: 1,
  AvailableRentBikes: bikes,
  AvailableReturnBikes: empty,
  AvailableRentBikesDetail: { GeneralBikes: bikes, ElectricBikes: 1 },
  SrcUpdateTime: "2026-10-18T11:58:00+08:00",
  ...over,
});

const stationItem = (id, over = {}) => ({
  StationUID: `UID${id}`,
  StationID: id,
  StationName: { Zh_tw: `YouBike2.0_站${id}` },
  StationPosition: { PositionLat: 24.1, PositionLon: 120.6 },
  StationAddress: { Zh_tw: `路${id}號` },
  BikesCapacity: 24,
  ...over,
});

/** Every city stored with `perCity` stations, all reloaded `hoursAgo` hours ago. */
function steadyWorld(perCity = 2, hoursAgo = 1) {
  const stored = {};
  const lastRefresh = {};
  const availability = {};
  for (const code of CITIES) {
    stored[code] = Array.from({ length: perCity }, (_, i) => staticRow(`${code}-${i + 1}`));
    availability[code] = stored[code].map((s) => availItem(s.stationNo));
    lastRefresh[code] = NOW - hoursAgo * HOUR;
  }
  return { stored, lastRefresh, availability };
}

/** Fake edges that record every call; the world's stored rows and refresh times are mutated by writes, like a real DB. */
function makeEdges(world, options = {}) {
  const calls = { availability: [], station: [], upserts: [], refreshes: [], hsinchu: 0, events: [] };
  let blocked = false;
  const edges = {
    now: () => options.now ?? NOW,
    getToken: async () => (options.token === undefined ? "fake-token" : options.token),
    explainNoToken: () => "circuit breaker open (test)",
    isTdxBlocked: () => (typeof options.blockedAfterBatches === "number" ? calls.upserts.length >= options.blockedAfterBatches : blocked),
    fetchAvailability: async (code) => {
      calls.availability.push(code);
      calls.events.push(`availability:${code}`);
      if (options.failAvailability?.[code]) throw new Error(options.failAvailability[code]);
      return world.availability[code] ?? [];
    },
    fetchStationList: async (code) => {
      calls.station.push(code);
      calls.events.push(`station:${code}`);
      if (options.failStation?.[code]) throw new Error(options.failStation[code]);
      return world.stationLists?.[code] ?? [];
    },
    loadStaticStations: async () => {
      if (options.readError) throw new Error(options.readError);
      return new Map(Object.entries(world.stored).map(([code, rows]) => [code, [...rows]]));
    },
    loadStaticRefreshTimes: async () => {
      if (options.stateReadError) throw new Error(options.stateReadError);
      return new Map(Object.entries(world.lastRefresh));
    },
    upsertStations: async (stations) => {
      if (options.upsertError) throw new Error(options.upsertError);
      calls.upserts.push(stations);
      calls.events.push(`upsert:${stations.length}`);
      // A real upsert is what makes the next round see the city as "stored".
      for (const s of stations) {
        const rows = (world.stored[s.cityCode] ??= []);
        if (!rows.some((r) => r.stationNo === s.stationNo)) rows.push(staticRow(s.stationNo, { nameTw: s.nameTw, totalSpaces: s.totalSpaces }));
      }
      return stations.length;
    },
    recordStaticRefresh: async (codes, atMs) => {
      calls.refreshes.push([...codes]);
      for (const code of codes) world.lastRefresh[code] = atMs;
    },
    fetchHsinchuDirect: async () => {
      calls.hsinchu += 1;
      calls.events.push("hsinchu");
      return options.hsinchu ?? { stations: [], error: "Hsinchu fetch failed: timeout of 5000ms exceeded" };
    },
  };
  return { edges, calls, setBlocked: (v) => (blocked = v) };
}

const run = (edges, extra = {}) => runTdxCitiesSync(edges, { cityCodes: CITIES, ...extra });

// --- the request budget -------------------------------------------------------------------------

test("steady state: a round sends exactly one Bike/Availability request per city and no Bike/Station request", async () => {
  const world = steadyWorld();
  const { edges, calls } = makeEdges(world);
  const summary = await run(edges);

  assert.deepEqual(calls.availability, CITIES);
  assert.deepEqual(calls.station, []);
  assert.deepEqual(summary.tdx, { availabilityCalls: 13, stationCalls: 0, refreshedCities: [], deferredCities: [] });
  assert.equal(summary.ok, true);
  assert.deepEqual(summary.errors, []);
  assert.equal(summary.totalUpserted, 26);
  assert.equal(summary.source, "tdx");
  assert.deepEqual(calls.refreshes, [], "nothing was reloaded, so no reload time is rewritten");
});

test("static fields come from the database, live fields from Availability", async () => {
  const world = steadyWorld(1);
  world.stored.TXG = [staticRow("TXG-1", { nameTw: "臺中車站", districtTw: "中區", addressTw: "站前路1號", lat: 24.137, lng: 120.686, totalSpaces: 36 })];
  world.availability.TXG = [availItem("TXG-1", 7, 29, { ServiceStatus: 1, SrcUpdateTime: "2026-10-18T11:59:30+08:00" })];
  const { edges, calls } = makeEdges(world);
  await run(edges);

  const row = calls.upserts.flat().find((s) => s.stationNo === "TXG-1");
  assert.deepEqual(row, {
    cityCode: "TXG",
    stationNo: "TXG-1",
    nameTw: "臺中車站",
    districtTw: "中區",
    addressTw: "站前路1號",
    lat: 24.137,
    lng: 120.686,
    totalSpaces: 36,
    availableBikes: 7,
    availableEbikes: 1,
    emptySpaces: 29,
    isActive: 1,
    updatedAtSource: "2026-10-18 11:59:30",
  });
});

test("a stored capacity of 0 falls back to bikes + empty docks; an out-of-service station is written inactive", async () => {
  const world = steadyWorld(1);
  world.stored.KHH = [staticRow("KHH-1", { totalSpaces: 0 })];
  world.availability.KHH = [availItem("KHH-1", 4, 6, { ServiceStatus: 0 })];
  const { edges, calls } = makeEdges(world);
  await run(edges);
  const row = calls.upserts.flat().find((s) => s.stationNo === "KHH-1");
  assert.equal(row.totalSpaces, 10);
  assert.equal(row.isActive, 0);
});

test("the daily request count: 13 per round x 4 rounds an hour is ~1,250 a day, down from ~4,300", async () => {
  const world = steadyWorld();
  const { edges, calls } = makeEdges(world);
  await run(edges);
  const perRound = calls.availability.length + calls.station.length;
  assert.equal(perRound, 13);
  assert.equal(perRound * 4 * 24, 1248, "4 rounds an hour (11,26,39,54) x 24 hours");
  // The old round: Station + Availability for all 15 cities, a round finishing about every 10 minutes (it took 6.5 min).
  const oldPerRound = 15 * 2;
  assert.equal(oldPerRound * 6 * 24, 4320);
});

// --- when Bike/Station IS requested ---------------------------------------------------------------

test("an Availability StationID the database has never seen triggers a Bike/Station request for that city only", async () => {
  const world = steadyWorld(2);
  world.availability.MAL = [...world.availability.MAL, availItem("MAL-NEW", 3, 9)];
  world.stationLists = { MAL: [stationItem("MAL-1"), stationItem("MAL-2"), stationItem("MAL-NEW", { StationName: { Zh_tw: "YouBike2.0_新站" }, BikesCapacity: 12 })] };
  const { edges, calls } = makeEdges(world);
  const summary = await run(edges);

  assert.deepEqual(calls.station, ["MAL"]);
  assert.equal(calls.availability.length, 13);
  assert.deepEqual(summary.tdx.refreshedCities, ["MAL"]);
  assert.deepEqual(calls.refreshes, [["MAL"]]);
  const added = calls.upserts.flat().find((s) => s.stationNo === "MAL-NEW");
  assert.equal(added.nameTw, "新站", "the YouBike2.0_ prefix is cleaned");
  assert.equal(added.totalSpaces, 12);
  assert.equal(added.availableBikes, 3);
  assert.equal(summary.cities.MAL, 3);
});

test("an unknown StationID is NOT chased more than once per cooldown: known stations are still written, the unknown one waits", async () => {
  const world = steadyWorld(2);
  world.lastRefresh.MAL = NOW - 10 * 60_000; // reloaded 10 minutes ago
  world.availability.MAL = [...world.availability.MAL, availItem("MAL-ORPHAN")];
  const { edges, calls } = makeEdges(world);
  const summary = await run(edges);

  assert.deepEqual(calls.station, [], "inside the cooldown no Station request goes out");
  assert.equal(summary.cities.MAL, 2, "the two known stations were still updated");
  assert.equal(summary.ok, true);

  // Once the cooldown has passed it is allowed again.
  const later = makeEdges(world, { now: NOW + UNKNOWN_STATION_REFRESH_COOLDOWN_MS });
  world.stationLists = { MAL: [stationItem("MAL-1"), stationItem("MAL-2"), stationItem("MAL-ORPHAN")] };
  await run(later.edges);
  assert.deepEqual(later.calls.station, ["MAL"]);
});

test("a city whose static data was last loaded more than 24 hours ago is reloaded; one loaded 23 hours ago is not", async () => {
  const world = steadyWorld(1, 1);
  world.lastRefresh.TNN = NOW - STATION_REFRESH_INTERVAL_MS - 1;
  world.lastRefresh.PTT = NOW - 23 * HOUR;
  world.stationLists = { TNN: [stationItem("TNN-1", { StationName: { Zh_tw: "YouBike2.0_改名後" } })] };
  const { edges, calls } = makeEdges(world);
  const summary = await run(edges);

  assert.deepEqual(calls.station, ["TNN"]);
  assert.deepEqual(summary.tdx.refreshedCities, ["TNN"]);
  assert.equal(world.lastRefresh.TNN, NOW, "the new reload time is stored (so a restart does not reload it again)");
  assert.equal(calls.upserts.flat().find((s) => s.stationNo === "TNN-1").nameTw, "改名後");
});

test("the reload time survives a restart: a second round right after the first reloads nothing", async () => {
  const world = steadyWorld(1, 30); // every city is 30 hours overdue
  world.stationLists = Object.fromEntries(CITIES.map((c) => [c, [stationItem(`${c}-1`)]]));
  const first = makeEdges(world);
  await run(first.edges);
  assert.equal(first.calls.station.length, MAX_STATION_REQUESTS_PER_RUN);

  // A fresh edges object = a restarted process; only the "database" (world) carries over.
  const afterRestart = makeEdges(world);
  await run(afterRestart.edges);
  const stillDue = afterRestart.calls.station.filter((c) => first.calls.station.includes(c));
  assert.deepEqual(stillDue, [], "cities reloaded in the first round are not reloaded again");
});

test("a round never sends more than the per-round cap of Station requests, most overdue first", async () => {
  const world = steadyWorld(1, 30);
  world.lastRefresh.TTT = NOW - 100 * HOUR;
  world.lastRefresh.KHH = NOW - 90 * HOUR;
  world.lastRefresh.TNN = NOW - 80 * HOUR;
  world.stationLists = Object.fromEntries(CITIES.map((c) => [c, [stationItem(`${c}-1`)]]));
  const { edges, calls } = makeEdges(world);
  const summary = await run(edges);

  assert.equal(MAX_STATION_REQUESTS_PER_RUN, 3);
  assert.deepEqual([...calls.station].sort(), ["KHH", "TNN", "TTT"]);
  assert.equal(calls.availability.length, 13, "the other cities still get their normal Availability update");
  assert.equal(summary.tdx.stationCalls, 3);
});

test("cold start (nothing stored, no state): 3 cities load per round, the rest wait without costing any request, and 5 rounds load all 13", async () => {
  const world = { stored: {}, lastRefresh: {}, availability: {}, stationLists: {} };
  for (const code of CITIES) {
    world.availability[code] = [availItem(`${code}-1`), availItem(`${code}-2`)];
    world.stationLists[code] = [stationItem(`${code}-1`), stationItem(`${code}-2`)];
  }

  const perRound = [];
  for (let round = 0; round < 5; round++) {
    const { edges, calls } = makeEdges(world);
    const summary = await run(edges);
    perRound.push({ station: calls.station.length, availability: calls.availability.length, deferred: summary.tdx.deferredCities.length });
    assert.ok(calls.station.length <= 3, `round ${round + 1} sent ${calls.station.length} Station requests`);
  }
  assert.deepEqual(perRound.map((r) => r.station), [3, 3, 3, 3, 1]);
  assert.deepEqual(perRound.map((r) => r.availability), [3, 6, 9, 12, 13], "a deferred city is not asked for Availability it could not be written with");
  assert.deepEqual(perRound.map((r) => r.deferred), [10, 7, 4, 1, 0]);

  const steady = makeEdges(world);
  await run(steady.edges);
  assert.deepEqual([steady.calls.availability.length, steady.calls.station.length], [13, 0]);
});

test("a city TDX answers 200 [] for is recorded as loaded, so it is not reloaded every round just because nothing is stored", async () => {
  const world = steadyWorld(1);
  world.stored.TTT = [];
  delete world.lastRefresh.TTT;
  world.availability.TTT = [];
  world.stationLists = { TTT: [] };
  const first = makeEdges(world);
  await run(first.edges);
  assert.deepEqual(first.calls.station, ["TTT"]);
  assert.ok(world.lastRefresh.TTT, "the empty reload is remembered");

  const second = makeEdges(world);
  await run(second.edges);
  assert.deepEqual(second.calls.station, []);
});

test("Station is listed but Availability is not: the station is written inactive with zero counts (the old full-fetch behaviour)", async () => {
  const world = steadyWorld(1, 30);
  world.availability.TXG = [];
  world.stationLists = { TXG: [stationItem("TXG-1")] };
  world.lastRefresh.TXG = NOW - 99 * HOUR; // reloaded first
  const { edges, calls } = makeEdges(world);
  await run(edges);
  const row = calls.upserts.flat().find((s) => s.cityCode === "TXG");
  assert.equal(row.isActive, 0);
  assert.equal(row.availableBikes, 0);
  assert.equal(row.totalSpaces, 24);
});

// --- TDX unavailable / circuit breaker --------------------------------------------------------------

test("no token (e.g. the circuit breaker is open): not one TDX request is sent, and the summary says why", async () => {
  const world = steadyWorld();
  const { edges, calls } = makeEdges(world, { token: null });
  const summary = await run(edges);

  assert.deepEqual(calls.availability, []);
  assert.deepEqual(calls.station, []);
  assert.deepEqual(calls.upserts.filter((u) => u.some((s) => s.cityCode !== "HSC")), []);
  assert.equal(summary.ok, false);
  assert.match(summary.errors.join("\n"), /TDX unavailable \(circuit breaker open \(test\)\); 13 cities were not updated/);
});

test("the breaker opening in the middle of a round stops the round: later cities are skipped with ONE summary line", async () => {
  const world = steadyWorld();
  const { edges, calls } = makeEdges(world, { blockedAfterBatches: 1 });
  const summary = await run(edges);

  assert.equal(calls.availability.length, 3, "only the first batch (3 cities) was requested");
  const line = summary.errors.find((e) => e.includes("circuit breaker opened during the round"));
  assert.ok(line, summary.errors.join("\n"));
  assert.equal(line, "TDX circuit breaker opened during the round; skipped 10 cities: MAL, TXG, CHA, YUN, CYI, CYQ, TNN, KHH, PTT, TTT");
  assert.equal(summary.errors.filter((e) => e.startsWith("TDX fetch failed")).length, 0, "not 10 separate failures");
  assert.equal(summary.totalUpserted, 6, "what was fetched before the trip is kept");
});

test("an unreadable database stops the round before any TDX request (nowhere to merge or write)", async () => {
  const world = steadyWorld();
  const { edges, calls } = makeEdges(world, { readError: "connect ECONNREFUSED" });
  const summary = await run(edges);
  assert.deepEqual(calls.availability, []);
  assert.equal(summary.ok, false);
  assert.match(summary.errors[0], /^MySQL read error: connect ECONNREFUSED/);
});

test("an unreadable youbike_sync_state is not fatal: every city looks due, the per-round cap keeps it to 3 Station requests", async () => {
  const world = steadyWorld(1);
  world.stationLists = Object.fromEntries(CITIES.map((c) => [c, [stationItem(`${c}-1`)]]));
  const { edges, calls } = makeEdges(world, { stateReadError: "Table 'youbike_sync_state' doesn't exist" });
  const summary = await run(edges);
  assert.equal(calls.station.length, 3);
  assert.equal(summary.ok, true);
  assert.match(summary.errors.join("\n"), /youbike_sync_state read failed/);
});

// --- failure isolation -------------------------------------------------------------------------------

test("one city failing never affects the others, and is reported in the 'TDX fetch failed for <city>: <message>' format", async () => {
  const world = steadyWorld();
  const { edges, calls } = makeEdges(world, { failAvailability: { CHA: "TDX Bike/Availability/City/ChanghuaCounty returned status 429" } });
  const summary = await run(edges);

  assert.deepEqual(summary.errors, ["TDX fetch failed for CHA: TDX Bike/Availability/City/ChanghuaCounty returned status 429"]);
  assert.equal(summary.cities.CHA, 0);
  assert.equal(summary.cities.TXG, 2);
  assert.equal(summary.totalUpserted, 24);
  assert.equal(summary.ok, true);
  assert.equal(calls.availability.length, 13);
});

test("a failed Station reload on a city that has stored stations keeps updating it from the stored static data, and is not retried for an hour", async () => {
  const world = steadyWorld(2);
  world.lastRefresh.YUN = NOW - 30 * HOUR;
  const reloadFailures = new Map();
  const first = makeEdges(world, { failStation: { YUN: "TDX Bike/Station/City/YunlinCounty returned status 500" } });
  const summary = await run(first.edges, { reloadFailures });

  assert.equal(summary.cities.YUN, 2, "Availability + stored static data still produced both rows");
  assert.match(summary.errors.join("\n"), /TDX Station reload failed for YUN \(kept the stored static data\)/);
  assert.deepEqual(summary.tdx.refreshedCities, [], "a failed reload is not recorded as a reload");
  assert.equal(first.calls.station.length, 1);

  const second = makeEdges(world, { now: NOW + 15 * 60_000, failStation: { YUN: "still down" } });
  await run(second.edges, { reloadFailures });
  assert.deepEqual(second.calls.station, [], "15 minutes later it is not retried: one broken endpoint must not cost a request every round");

  const third = makeEdges(world, { now: NOW + UNKNOWN_STATION_REFRESH_COOLDOWN_MS + 1 });
  await run(third.edges, { reloadFailures });
  assert.deepEqual(third.calls.station, ["YUN"], "after the cooldown it is tried again");
});

test("a Station failure on a city with nothing stored fails that city only, and a broken city does not crowd the others out of the cap", async () => {
  const world = { stored: {}, lastRefresh: {}, availability: {}, stationLists: {} };
  for (const code of CITIES) {
    world.availability[code] = [availItem(`${code}-1`)];
    world.stationLists[code] = [stationItem(`${code}-1`)];
  }
  const reloadFailures = new Map();
  const first = makeEdges(world, { failStation: { TYCG: "boom" } });
  const s1 = await run(first.edges, { reloadFailures });
  assert.match(s1.errors.join("\n"), /TDX fetch failed for TYCG: boom/);

  const second = makeEdges(world);
  const s2 = await run(second.edges, { reloadFailures });
  assert.ok(!second.calls.station.includes("TYCG"), "TYCG is cooling down");
  assert.equal(second.calls.station.length, 3, "the cap went to the cities that can actually be loaded");
  assert.ok(s2.tdx.deferredCities.includes("TYCG"));
});

test("each batch is written before the next is requested, so a process killed mid-round keeps what it fetched", async () => {
  const world = steadyWorld();
  const { edges, calls } = makeEdges(world);
  await run(edges);
  assert.equal(calls.upserts.length, 5, "13 cities in batches of 3 = 5 writes");
  const firstUpsert = calls.events.indexOf("upsert:6");
  const fourthAvailability = calls.events.indexOf("availability:MAL");
  assert.ok(firstUpsert > -1 && firstUpsert < fourthAvailability, "batch 1 is written before batch 2 starts");
});

test("a failed write stops the round (nothing more is fetched into a broken database) and nothing is marked as reloaded", async () => {
  const world = steadyWorld(1, 30);
  world.stationLists = Object.fromEntries(CITIES.map((c) => [c, [stationItem(`${c}-1`)]]));
  const { edges, calls } = makeEdges(world, { upsertError: "Deadlock found" });
  const summary = await run(edges);

  assert.equal(summary.ok, false);
  assert.match(summary.errors.join("\n"), /MySQL upsert error: Deadlock found/);
  assert.equal(calls.availability.length, 3, "stopped after the first batch");
  assert.deepEqual(calls.refreshes, [], "an unsaved reload must be retried, not remembered");
  assert.equal(calls.hsinchu, 0);
});

test("stored HSC_ placeholder rows (from the old Hsinchu fallback) are not treated as TDX stations", async () => {
  const world = steadyWorld(1);
  world.stored.HSC = [staticRow("HSC_1"), staticRow("HSC_2")];
  world.availability.HSC = [availItem("500101001")];
  world.stationLists = { HSC: [stationItem("500101001")] };
  const { edges, calls } = makeEdges(world);
  await run(edges);
  assert.ok(calls.station.includes("HSC"), "the placeholders do not count as stored stations, so Hsinchu loads its real list");
  assert.equal(calls.upserts.flat().find((s) => s.cityCode === "HSC").stationNo, "500101001");
});

// --- Hsinchu open-data fallback ------------------------------------------------------------------------

test("Hsinchu's direct feed is NOT tried when TDX returned Hsinchu stations", async () => {
  const { edges, calls } = makeEdges(steadyWorld());
  await run(edges);
  assert.equal(calls.hsinchu, 0);
});

test("Hsinchu's direct feed is NOT tried when TDX fails for Hsinchu but the database still holds its real TDX stations", async () => {
  const world = steadyWorld();
  const { edges, calls } = makeEdges(world, { failAvailability: { HSC: "boom" } });
  await run(edges);
  assert.equal(calls.hsinchu, 0, "the fallback's placeholder rows must not sit next to real ones");
});

test("Hsinchu's direct feed is the fallback when TDX has no Hsinchu data, started as soon as that is known so it does not delay the round", async () => {
  const world = steadyWorld();
  world.stored.HSC = [];
  delete world.lastRefresh.HSC;
  world.availability.HSC = [];
  world.stationLists = { HSC: [] };
  const placeholder = { cityCode: "HSC", stationNo: "HSC_1", nameTw: "新竹火車站", districtTw: "新竹市", addressTw: "x", lat: 24.8, lng: 120.97, totalSpaces: 20, availableBikes: 10, availableEbikes: 0, emptySpaces: 10, isActive: 1, updatedAtSource: "2026-10-18 12:00:00" };
  const { edges, calls } = makeEdges(world, { hsinchu: { stations: [placeholder] } });
  const summary = await run(edges);

  assert.equal(calls.hsinchu, 1);
  const hsinchuAt = calls.events.indexOf("hsinchu");
  const lastAvailabilityAt = calls.events.lastIndexOf(`availability:${CITIES.at(-1)}`);
  assert.ok(hsinchuAt > -1 && hsinchuAt < lastAvailabilityAt, "it overlaps the remaining batches instead of running after them");
  assert.equal(summary.cities.HSC, 1);
  assert.equal(summary.source, "tdx", "other cities came from TDX");
  assert.ok(calls.upserts.flat().some((s) => s.stationNo === "HSC_1"));
});

test("with no TDX token at all the Hsinchu fallback still runs once, and its failure is reported without hiding the TDX reason", async () => {
  const world = steadyWorld();
  world.stored.HSC = [];
  const { edges, calls } = makeEdges(world, { token: null });
  const summary = await run(edges);
  assert.equal(calls.hsinchu, 1);
  assert.ok(summary.errors.some((e) => e.startsWith("TDX unavailable")));
  assert.ok(summary.errors.some((e) => e.startsWith("Hsinchu fetch failed")));
  assert.equal(summary.ok, false);
});

test("when only the Hsinchu fallback produced stations the summary says direct_fallback", async () => {
  const world = steadyWorld();
  world.stored.HSC = [];
  const placeholder = { cityCode: "HSC", stationNo: "HSC_1", nameTw: "新竹火車站", districtTw: "新竹市", addressTw: "x", lat: 24.8, lng: 120.97, totalSpaces: 20, availableBikes: 10, availableEbikes: 0, emptySpaces: 10, isActive: 1, updatedAtSource: "2026-10-18 12:00:00" };
  const { edges } = makeEdges(world, { token: null, hsinchu: { stations: [placeholder] } });
  const summary = await run(edges);
  assert.equal(summary.source, "direct_fallback");
  assert.equal(summary.totalUpserted, 1);
});

// --- the planner on its own -----------------------------------------------------------------------------

test("planCityRound: nothing due, nothing planned", () => {
  const plan = planCityRound({
    cityCodes: ["A", "B"],
    storedCounts: new Map([["A", 5], ["B", 5]]),
    lastRefreshMs: new Map([["A", NOW - HOUR], ["B", NOW - HOUR]]),
    nowMs: NOW,
    maxStationRequests: 3,
    refreshIntervalMs: 24 * HOUR,
  });
  assert.deepEqual(plan, { refresh: [], deferred: [], supplementBudget: 3 });
});

test("planCityRound: empty cities first, then the longest overdue; the budget left over is what unknown-ID reloads may use", () => {
  const plan = planCityRound({
    cityCodes: ["A", "B", "C", "D"],
    storedCounts: new Map([["A", 5], ["B", 5], ["C", 0], ["D", 5]]),
    lastRefreshMs: new Map([["A", NOW - 50 * HOUR], ["B", NOW - 80 * HOUR], ["D", NOW - HOUR]]),
    nowMs: NOW,
    maxStationRequests: 2,
    refreshIntervalMs: 24 * HOUR,
  });
  assert.deepEqual(plan.refresh, ["C", "B"]);
  assert.deepEqual(plan.deferred, [], "A is overdue but has stored rows, so it is merged normally rather than deferred");
  assert.equal(plan.supplementBudget, 0);
});

test("planCityRound: a cap of 0 plans nothing and defers the empty cities", () => {
  const plan = planCityRound({
    cityCodes: ["A", "B"],
    storedCounts: new Map([["A", 0], ["B", 3]]),
    lastRefreshMs: new Map(),
    nowMs: NOW,
    maxStationRequests: 0,
    refreshIntervalMs: 24 * HOUR,
  });
  assert.deepEqual(plan, { refresh: [], deferred: ["A"], supplementBudget: 0 });
});
