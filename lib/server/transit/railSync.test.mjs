// Issue #704: the daily TDX Senior/Rail sync took ~11 minutes of strictly sequential, rate-limited
// requests and wrote to the database only at the very end, while the production web process is
// SIGKILLed about every 12 minutes — so it never finished and stationMaps/transfers stayed 0.
// These tests drive the per-system sync (railSyncCore.ts) with a fake TDX client and an in-memory
// store, and the MySQL store (railSyncStore.ts) with a fake pool:
//   - each system is written as soon as it is fetched (an abort at system N leaves 1..N-1 written),
//   - a failed or anomalously small fetch never deletes that system's rows, and never touches
//     another system's rows,
//   - the next run starts with the system that has gone longest without a success,
//   - every system writes JSON stage lines with its name and the process memory.
import test from "node:test";
import assert from "node:assert/strict";
import { registerRepoHooks } from "../garbageRoutes/testSupport/repoHooks.mjs";

registerRepoHooks();
const core = await import("./railSyncCore.ts");
const { createMysqlRailSyncStore, chunkRowValues } = await import("./railSyncStore.ts");
const { RAIL_SYSTEMS } = await import("./railStationCounty.ts");
const { createJsonStageLogger } = await import("../sync/stageLog.ts");

const { runRailSystemsSync, orderSystemsStalestFirst, toStationRecord, fetchRailSystem, SYNC_STAGE_EVENT } = core;

// ---- fakes -------------------------------------------------------------------

const noYield = async () => {};

/** A clock that moves forward on every read, so "attempted later" is always a larger number. */
const createClock = (start = 1_000_000) => {
  let t = start;
  return () => (t += 1000);
};

/**
 * Fake TDX client. Every system answers with `stations` stations, `maps` map rows and `transfers`
 * transfer rows unless `counts[system]` says otherwise; `fail[system]` lists endpoints that throw;
 * `before(endpoint, system)` can stall or observe a call. Records the call order and the highest
 * number of calls in flight (the sync must be strictly sequential).
 */
const createFakeClient = ({ counts = {}, fail = {}, before } = {}) => {
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const countsFor = (system) => ({ stations: 3, maps: 2, transfers: 2, ...counts[system] });

  const call = (endpoint, build) => async (system) => {
    calls.push(`${endpoint}:${system}`);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      if (before) await before(endpoint, system);
      if (fail[system]?.includes(endpoint)) throw new Error(`${endpoint} answered 503`);
      return build(system, countsFor(system));
    } finally {
      inFlight -= 1;
    }
  };

  return {
    calls,
    get maxInFlight() {
      return maxInFlight;
    },
    fetchStationCountyMap: call("county", (system, c) =>
      new Map(Array.from({ length: c.stations }, (_, i) => [`${system}-${i + 1}`, "新北市"])),
    ),
    fetchFacility: call("facility", (system, c) =>
      Array.from({ length: c.stations }, (_, i) => ({
        StationID: `${system}-${i + 1}`,
        StationName: `${system} 站${i + 1}`,
        Elevators: [{ FacilityName: "電梯", PositionLat: "25.04", PositionLon: "121.51" }],
      })),
    ),
    fetchService: call("service", (system, c) =>
      Array.from({ length: c.stations }, (_, i) => ({
        StationID: `${system}-${i + 1}`,
        ServiceName: "站務協助",
        ServicePhone: "02-1234",
        ServiceURL: "https://example.test/svc",
      })),
    ),
    fetchMap: call("map", (system, c) =>
      Array.from({ length: c.maps }, (_, i) => ({ StationID: `${system}-${i + 1}`, MapName: `圖${i + 1}` })),
    ),
    fetchTransfer: call("transfer", (system, c) =>
      Array.from({ length: c.transfers }, (_, i) => ({ StationID: `${system}-${i + 1}`, ExitName: `出口${i + 1}` })),
    ),
  };
};

/**
 * In-memory RailSyncStore. `maps` / `transfers` seed how many rows each system already has;
 * `lastSuccess` seeds the per-system success times. Every write is keyed by system, so a test can
 * prove which systems a call touched.
 */
const createMemoryStore = ({ maps = {}, transfers = {}, lastSuccess = {}, failOn = {} } = {}) => {
  const db = {
    stations: {},
    maps: Object.fromEntries(Object.entries(maps).map(([s, n]) => [s, Array.from({ length: n }, (_, i) => `old-${i}`)])),
    transfers: Object.fromEntries(
      Object.entries(transfers).map(([s, n]) => [s, Array.from({ length: n }, (_, i) => `old-${i}`)]),
    ),
    lastSuccess: new Map(Object.entries(lastSuccess)),
    attempts: [],
    writes: [],
  };
  const maybeFail = (op, system) => {
    if (failOn[op]?.includes(system)) throw new Error(`${op} failed for ${system}`);
  };

  return {
    db,
    async loadLastSuccess() {
      maybeFail("loadLastSuccess", "*");
      return new Map(db.lastSuccess);
    },
    async upsertStations(system, stations) {
      maybeFail("upsertStations", system);
      db.writes.push(["upsertStations", system]);
      db.stations[system] = stations.map((s) => s.stationId);
      return stations.length;
    },
    async countMaps(system) {
      return db.maps[system]?.length ?? 0;
    },
    async replaceMaps(system, rows) {
      maybeFail("replaceMaps", system);
      db.writes.push(["replaceMaps", system]);
      db.maps[system] = rows.map((r) => r.StationID);
      return rows.length;
    },
    async countTransfers(system) {
      return db.transfers[system]?.length ?? 0;
    },
    async replaceTransfers(system, rows) {
      maybeFail("replaceTransfers", system);
      db.writes.push(["replaceTransfers", system]);
      db.transfers[system] = rows.map((r) => r.StationID);
      return rows.length;
    },
    async recordAttempt(system, attempt) {
      maybeFail("recordAttempt", system);
      db.attempts.push({ system, ...attempt });
      if (attempt.success) db.lastSuccess.set(system, attempt.attemptedAtMs);
    },
  };
};

const silentLog = () => null;

const settle = async (condition, label) => {
  for (let i = 0; i < 2000; i++) {
    if (condition()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`timed out waiting for ${label}`);
};

const run = (overrides) =>
  runRailSystemsSync({
    systems: RAIL_SYSTEMS,
    log: silentLog,
    now: createClock(),
    yieldToLoop: noYield,
    ...overrides,
  });

// ---- ordering ----------------------------------------------------------------

test("orderSystemsStalestFirst: never-succeeded systems first in declared order, then oldest success first", () => {
  const systems = ["TRA", "THSR", "TRTC", "NTMC", "TYMC"];
  const last = new Map([
    ["TRA", 500],
    ["TRTC", 100],
    ["TYMC", 300],
  ]);
  assert.deepEqual(orderSystemsStalestFirst(systems, last), ["THSR", "NTMC", "TRTC", "TYMC", "TRA"]);
});

test("orderSystemsStalestFirst: with no history it is the declared order; ties stay stable; the input is not mutated", () => {
  const systems = [...RAIL_SYSTEMS];
  assert.deepEqual(orderSystemsStalestFirst(systems, new Map()), systems);
  const tie = new Map(systems.map((s) => [s, 42]));
  assert.deepEqual(orderSystemsStalestFirst(systems, tie), systems);
  const reversedHistory = new Map(systems.map((s, i) => [s, 1000 - i]));
  const out = orderSystemsStalestFirst(systems, reversedHistory);
  assert.deepEqual(out, [...systems].reverse());
  assert.deepEqual(systems, [...RAIL_SYSTEMS], "input array untouched");
});

// ---- write-as-you-go ---------------------------------------------------------

test("each system is written as soon as it is fetched: an abort during system N leaves systems 1..N-1 fully written", async () => {
  const store = createMemoryStore();
  const abortAt = "KRTC"; // 7th of 10
  const client = createFakeClient({
    // The process dies mid-fetch of KRTC: this promise never settles and nobody awaits the run.
    before: (endpoint, system) => (system === abortAt && endpoint === "facility" ? new Promise(() => {}) : undefined),
  });

  const pending = run({ client, store });
  pending.catch(() => {});
  await settle(() => client.calls.includes(`facility:${abortAt}`), "the sync to reach KRTC");

  const done = RAIL_SYSTEMS.slice(0, RAIL_SYSTEMS.indexOf(abortAt));
  assert.deepEqual(Object.keys(store.db.stations), done);
  assert.deepEqual(Object.keys(store.db.maps), done);
  assert.deepEqual(Object.keys(store.db.transfers), done);
  assert.deepEqual([...store.db.lastSuccess.keys()], done);
  for (const system of done) {
    assert.equal(store.db.stations[system].length, 3, `${system} stations`);
    assert.equal(store.db.maps[system].length, 2, `${system} maps`);
    assert.equal(store.db.transfers[system].length, 2, `${system} transfers`);
  }
  for (const system of RAIL_SYSTEMS.slice(done.length)) {
    assert.equal(store.db.stations[system], undefined, `${system} was never reached`);
  }
  assert.equal(client.maxInFlight, 1, "strictly sequential: one TDX call at a time");
});

test("the run after an abort starts with the systems that never completed, then the oldest successes, and finishes the job", async () => {
  const store = createMemoryStore();
  const abortAt = "KRTC";
  const aborted = createFakeClient({
    before: (endpoint, system) => (system === abortAt && endpoint === "facility" ? new Promise(() => {}) : undefined),
  });
  const first = run({ client: aborted, store });
  first.catch(() => {});
  await settle(() => aborted.calls.includes(`facility:${abortAt}`), "the first run to reach KRTC");

  const resumed = await run({ client: createFakeClient(), store });

  assert.deepEqual(
    resumed.map((r) => r.system),
    ["KRTC", "KLRT", "NTDLRT", "NTALRT", "TRA", "THSR", "TRTC", "NTMC", "TYMC", "TMRT"],
  );
  assert.ok(resumed.every((r) => r.success));
  assert.deepEqual(Object.keys(store.db.maps).sort(), [...RAIL_SYSTEMS].sort());
  assert.equal(store.db.lastSuccess.size, RAIL_SYSTEMS.length);
});

test("a system is written in full before the next one is requested", async () => {
  const store = createMemoryStore();
  const writtenWhenRequested = [];
  const client = createFakeClient({
    before: (endpoint, system) => {
      if (endpoint === "county") writtenWhenRequested.push([system, Object.keys(store.db.transfers).length]);
    },
  });
  await run({ client, store });
  // When system i's first request goes out, systems 0..i-1 already have their transfers (the last thing written) stored.
  writtenWhenRequested.forEach(([, written], index) => assert.equal(written, index));
  assert.equal(writtenWhenRequested.length, RAIL_SYSTEMS.length);
});

// ---- failed / anomalous fetches never delete ------------------------------------

test("a failed Map fetch keeps that system's existing maps and does not count as a success", async () => {
  const store = createMemoryStore({ maps: { TRA: 100 }, transfers: { TRA: 5 }, lastSuccess: { TRA: 5000 } });
  const client = createFakeClient({ fail: { TRA: ["map"] } });

  const [result] = await run({ systems: ["TRA"], client, store });

  assert.equal(store.db.maps.TRA.length, 100, "stored maps untouched");
  assert.ok(!store.db.writes.some(([op]) => op === "replaceMaps"), "no replace was attempted");
  assert.equal(store.db.transfers.TRA.length, 2, "the transfers endpoint was fine and is replaced independently");
  assert.equal(result.success, false);
  assert.match(result.errors.join("\n"), /TRA Map fetch failed/);
  assert.equal(store.db.lastSuccess.get("TRA"), 5000, "last success time not advanced");
  assert.equal(store.db.attempts[0].success, false);
  assert.match(store.db.attempts[0].error, /Map fetch failed/);
});

test("an anomalously small or empty snapshot is not allowed to replace stored rows (50% floor / empty-response guard)", async () => {
  const store = createMemoryStore({
    maps: { TRA: 100, THSR: 100, TRTC: 100, NTMC: 0 },
    transfers: { TRA: 5, THSR: 5, TRTC: 5, NTMC: 5 },
  });
  const client = createFakeClient({
    counts: {
      TRA: { maps: 10, transfers: 2 }, // 10 of 100 maps: broken source; 2 of 5 transfers: small baseline, replaced
      THSR: { maps: 0, transfers: 0 }, // empty answers while rows are stored
      TRTC: { maps: 80, transfers: 5 }, // ordinary churn: replaced
      NTMC: { maps: 3, transfers: 0 }, // nothing stored yet for maps: written; empty transfers with 5 stored: kept
    },
  });

  const results = await run({ systems: ["TRA", "THSR", "TRTC", "NTMC"], client, store });
  const bySystem = Object.fromEntries(results.map((r) => [r.system, r]));

  assert.equal(store.db.maps.TRA.length, 100, "TRA maps kept (10 < 50% of 100)");
  assert.equal(store.db.transfers.TRA.length, 2, "TRA transfers replaced (small baseline, non-empty answer)");
  assert.equal(store.db.maps.THSR.length, 100, "THSR maps kept (empty answer)");
  assert.equal(store.db.transfers.THSR.length, 5, "THSR transfers kept (empty answer)");
  assert.equal(store.db.maps.TRTC.length, 80, "TRTC maps replaced");
  assert.equal(store.db.maps.NTMC.length, 3, "NTMC maps written into an empty table");
  assert.equal(store.db.transfers.NTMC.length, 5, "NTMC transfers kept");

  assert.equal(bySystem.TRA.success, false);
  assert.match(bySystem.TRA.guardNotes.join("\n"), /TRA station maps: .*10 rows but 100 are stored/);
  assert.equal(bySystem.THSR.success, false);
  assert.equal(bySystem.TRTC.success, true);
  assert.equal(bySystem.NTMC.success, false);
  assert.ok(bySystem.NTMC.guardNotes.some((n) => n.startsWith("NTMC transfers")));
});

test("syncing some systems never touches the rows of the others", async () => {
  const store = createMemoryStore({ maps: { TRA: 10, TRTC: 77, KRTC: 33 }, transfers: { TRTC: 9, KRTC: 4 } });
  const before = JSON.stringify({ maps: store.db.maps.TRTC, transfers: store.db.transfers.KRTC });

  await run({ systems: ["TRA"], client: createFakeClient({ fail: { TRA: ["map", "transfer"] } }), store });
  await run({ systems: ["THSR"], client: createFakeClient(), store });

  assert.equal(JSON.stringify({ maps: store.db.maps.TRTC, transfers: store.db.transfers.KRTC }), before);
  assert.equal(store.db.maps.KRTC.length, 33);
  assert.ok(store.db.writes.every(([, system]) => system === "TRA" || system === "THSR"));
});

test("when the Facility fetch fails no station rows are written for that system (no Service-only skeletons over good rows)", async () => {
  const store = createMemoryStore();
  const results = await run({ systems: ["TRA", "THSR"], client: createFakeClient({ fail: { TRA: ["facility"] } }), store });

  assert.equal(store.db.stations.TRA, undefined);
  assert.equal(store.db.stations.THSR.length, 3);
  assert.equal(store.db.maps.TRA.length, 2, "the independent Map endpoint is still written");
  assert.equal(results[0].success, false);
  assert.equal(results[1].success, true);
});

// ---- resilience --------------------------------------------------------------

test("one system's database failure is recorded and the remaining systems still sync", async () => {
  const store = createMemoryStore({ failOn: { replaceMaps: ["THSR"], upsertStations: ["TRTC"] } });
  const results = await run({ systems: ["TRA", "THSR", "TRTC", "NTMC"], client: createFakeClient(), store });

  assert.deepEqual(
    results.map((r) => [r.system, r.success]),
    [
      ["TRA", true],
      ["THSR", false],
      ["TRTC", false],
      ["NTMC", true],
    ],
  );
  assert.match(results[1].errors.join(), /THSR station maps write failed: replaceMaps failed for THSR/);
  assert.match(results[2].errors.join(), /TRTC facilities upsert failed/);
  assert.equal(store.db.transfers.THSR.length, 2, "THSR's other writes still happened");
  assert.equal(store.db.maps.NTMC.length, 2);
});

test("an unreadable or unwritable sync state never stops the data from syncing", async () => {
  const store = createMemoryStore({ failOn: { loadLastSuccess: ["*"], recordAttempt: ["THSR"] } });
  const lines = [];
  const log = createJsonStageLogger({ event: SYNC_STAGE_EVENT, fields: {}, startedAtMs: 0, write: (l) => lines.push(JSON.parse(l)) });

  const results = await run({ systems: ["TRA", "THSR"], client: createFakeClient(), store, log });

  assert.deepEqual(results.map((r) => r.system), ["TRA", "THSR"], "declared order without history");
  assert.ok(lines.some((l) => l.stage === "state_unavailable"));
  assert.equal(store.db.maps.THSR.length, 2, "data written although its bookkeeping row was not");
  assert.match(results[1].errors.join(), /THSR sync state not recorded/);
});

test("an unexpected throw outside the per-step handlers is contained to that system", async () => {
  const store = createMemoryStore();
  // The real stage logger never throws; this one does, to prove nothing can abort the loop.
  const log = (stage, detail) => {
    if (stage === "system_start" && detail?.system === "THSR") throw new TypeError("unexpected");
    return null;
  };
  const results = await run({ systems: ["TRA", "THSR", "TRTC"], client: createFakeClient(), store, log });
  assert.deepEqual(results.map((r) => r.success), [true, false, true]);
  assert.match(results[1].errors.join(), /THSR sync failed: unexpected/);
  assert.equal(store.db.maps.TRTC.length, 2, "the system after it still synced");
});

// ---- stage log ---------------------------------------------------------------

test("every system writes JSON stage lines carrying its name, heapUsedMB and rssMB", async () => {
  const written = [];
  const log = createJsonStageLogger({
    event: SYNC_STAGE_EVENT,
    fields: {},
    startedAtMs: 0,
    now: () => 1234,
    readMemory: () => ({ heapUsedMB: 88.1, rssMB: 571.4, externalMB: 14.2 }),
    write: (line) => written.push(line),
  });

  await run({ systems: ["TRA", "THSR"], client: createFakeClient(), store: createMemoryStore(), log });

  assert.ok(written.every((line) => !line.includes("\n")), "one line per stage");
  const lines = written.map((l) => JSON.parse(l));
  assert.ok(lines.every((l) => l.event === "transit_accessibility_sync_stage"));
  assert.equal(lines[0].stage, "sync_start");
  assert.equal(lines[0].order, "TRA,THSR");
  assert.equal(lines.at(-1).stage, "sync_done");

  for (const system of ["TRA", "THSR"]) {
    const mine = lines.filter((l) => l.system === system);
    assert.deepEqual(
      mine.map((l) => l.stage),
      ["system_start", "system_fetched", "system_done"],
    );
    for (const line of mine) {
      assert.equal(line.heapUsedMB, 88.1);
      assert.equal(line.rssMB, 571.4);
    }
  }
  const fetched = lines.find((l) => l.stage === "system_fetched" && l.system === "TRA");
  assert.deepEqual([fetched.stations, fetched.maps, fetched.transfers], [3, 2, 2]);
});

test("a system that did not complete cleanly logs system_incomplete, not system_done", async () => {
  const written = [];
  const log = createJsonStageLogger({ event: "e", fields: {}, startedAtMs: 0, write: (l) => written.push(JSON.parse(l)) });
  await run({ systems: ["TRA"], client: createFakeClient({ fail: { TRA: ["service"] } }), store: createMemoryStore(), log });
  assert.ok(written.some((l) => l.stage === "system_incomplete" && l.system === "TRA" && l.errors === 1));
  assert.ok(!written.some((l) => l.stage === "system_done"));
});

// ---- row shaping (unchanged behaviour of the old accumulator) -------------------

test("toStationRecord: tags, items, service phone and booking rules, and the system type per RailSystem", async () => {
  const client = {
    ...createFakeClient(),
    fetchStationCountyMap: async () => new Map([["A1", "桃園市"]]),
    fetchFacility: async () => [
      { StationID: "A1", StationName: "台北車站", Elevators: [{ FacilityName: "E1", PositionLat: "25.0478", PositionLon: "121.517" }], Toilets: [{}] },
      { StationID: "", StationName: "no id" },
    ],
    fetchService: async () => [
      { StationID: "A1", ServiceName: "導引", Description: "預約", ServicePhone: "02-111", ServiceURL: "https://x.test" },
      { StationID: "B2", StationName: "只有服務", ServiceName: "租借輪椅" },
    ],
  };
  const fetched = await fetchRailSystem("TYMC", client);
  assert.equal(fetched.facilityOk, true);
  assert.equal(fetched.stations.size, 2);

  const a1 = toStationRecord("TYMC", fetched.stations.get("A1"));
  assert.equal(a1.systemType, "metro");
  assert.equal(a1.county, "桃園市");
  assert.equal(a1.servicePhone, "02-111");
  assert.equal(a1.bookingRules, "導引：預約");
  const features = JSON.parse(a1.featuresJson);
  assert.deepEqual(features.tags, ["無障礙電梯", "無障礙廁所"]);
  assert.equal(features.items[0].lat, 25.0478);
  assert.deepEqual(features.items.at(-1).category, "Service");

  const b2 = toStationRecord("TYMC", fetched.stations.get("B2"));
  assert.equal(b2.county, "桃園市", "no county in the lookup: the system's fallback county");
  assert.equal(toStationRecord("TRA", fetched.stations.get("B2")).systemType, "rail");
  assert.equal(toStationRecord("THSR", fetched.stations.get("B2")).systemType, "hsrail");
});

// ---- the MySQL store ---------------------------------------------------------

const createFakePool = ({ failOn, rows = [] } = {}) => {
  const log = [];
  const conn = {
    async beginTransaction() {
      log.push({ op: "begin" });
    },
    async query(sql, params) {
      log.push({ op: "query", sql, params });
      if (failOn?.test(sql)) throw new Error("boom");
      return [{ affectedRows: 1 }];
    },
    async commit() {
      log.push({ op: "commit" });
    },
    async rollback() {
      log.push({ op: "rollback" });
    },
    release() {
      log.push({ op: "release" });
    },
  };
  const pool = {
    async query(sql, params) {
      log.push({ op: "pool.query", sql, params });
      return [rows];
    },
    async getConnection() {
      log.push({ op: "getConnection" });
      return conn;
    },
  };
  return { pool, log };
};

test("replaceMaps: one transaction that deletes ONLY this system's rows, then inserts, then commits", async () => {
  const { pool, log } = createFakePool();
  const store = createMysqlRailSyncStore(pool);
  const written = await store.replaceMaps("TRTC", [
    { StationID: "R10", StationName: "台北車站", MapURL: "https://m.test/1", Geometry: "POLYGON((0 0))" },
    { StationID: "R11", MapName: "B1" },
  ]);

  assert.equal(written, 2);
  assert.deepEqual(
    log.map((e) => e.op),
    ["getConnection", "begin", "query", "query", "commit", "release"],
  );
  const del = log[2];
  assert.match(del.sql, /^DELETE FROM accessible_transit_station_maps WHERE rail_system = \?$/);
  assert.deepEqual(del.params, ["TRTC"]);
  const insert = log[3];
  assert.match(insert.sql, /INSERT INTO accessible_transit_station_maps/);
  const rows = insert.params[0];
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r[0] === "TRTC"), "every inserted row carries this system's code");
  assert.deepEqual(rows[1], ["TRTC", "R11", "R11", null, "B1", null, null]);
});

test("replaceTransfers: scoped delete + insert in one transaction, coordinates coerced, boolean to 0/1", async () => {
  const { pool, log } = createFakePool();
  const store = createMysqlRailSyncStore(pool);
  await store.replaceTransfers("THSR", [
    { StationID: "0990", ExitName: "1號出口", PositionLat: "24.8", PositionLon: "", IsOnSiteTransfer: true, TransferMode: "bus" },
  ]);
  assert.deepEqual(
    log.map((e) => e.op),
    ["getConnection", "begin", "query", "query", "commit", "release"],
  );
  assert.deepEqual(log[2].params, ["THSR"]);
  assert.match(log[2].sql, /DELETE FROM accessible_transit_transfers WHERE rail_system = \?/);
  const row = log[3].params[0][0];
  assert.equal(row[0], "THSR");
  assert.equal(row[6], 24.8);
  assert.equal(row[7], null);
  assert.equal(row[11], 1);
});

test("a failing insert rolls the whole replacement back (the delete is undone) and still releases the connection", async () => {
  const { pool, log } = createFakePool({ failOn: /^INSERT/ });
  const store = createMysqlRailSyncStore(pool);
  await assert.rejects(store.replaceMaps("TRA", [{ StationID: "1000" }]), /boom/);
  const ops = log.map((e) => e.op);
  assert.ok(ops.includes("rollback"));
  assert.ok(!ops.includes("commit"));
  assert.equal(ops.at(-1), "release");
});

test("chunkRowValues splits by row count and by text size, never emitting an empty batch", () => {
  const rows = Array.from({ length: 5 }, (_, i) => [`r${i}`, "x".repeat(400)]);
  assert.deepEqual(chunkRowValues(rows, 2, 1_000_000).map((b) => b.length), [2, 2, 1]);
  assert.deepEqual(chunkRowValues(rows, 100, 1000).map((b) => b.length), [2, 2, 1]);
  assert.deepEqual(chunkRowValues([["a", "y".repeat(5000)]], 100, 1000).map((b) => b.length), [1], "an oversized row still goes out, alone");
  assert.deepEqual(chunkRowValues([], 10, 10), []);
});

test("counts are per system; loadLastSuccess reads Date and string values and ignores unknown systems", async () => {
  const { pool, log } = createFakePool({
    rows: [
      { total: 12, rail_system: "TRA", last_success_at: new Date("2026-10-16T03:20:00Z") },
      { rail_system: "THSR", last_success_at: "2026-10-15 03:20:00" },
      { rail_system: "TRTC", last_success_at: null },
      { rail_system: "BOGUS", last_success_at: new Date("2026-10-16T03:20:00Z") },
    ],
  });
  const store = createMysqlRailSyncStore(pool);

  assert.equal(await store.countMaps("KRTC"), 12);
  assert.deepEqual(log.at(-1).params, ["KRTC"]);
  assert.match(log.at(-1).sql, /FROM accessible_transit_station_maps WHERE rail_system = \?/);
  assert.equal(await store.countTransfers("KRTC"), 12);
  assert.match(log.at(-1).sql, /FROM accessible_transit_transfers WHERE rail_system = \?/);

  const last = await store.loadLastSuccess();
  assert.deepEqual([...last.keys()].sort(), ["THSR", "TRA"]);
  assert.equal(last.get("TRA"), Date.parse("2026-10-16T03:20:00Z"));
  assert.equal(last.get("THSR"), Date.parse("2026-10-15T03:20:00Z"));
});

test("recordAttempt: a failed attempt passes NULL for last_success_at so COALESCE keeps the previous success; a success stamps it", async () => {
  const { pool, log } = createFakePool();
  const store = createMysqlRailSyncStore(pool);
  const attemptedAtMs = Date.parse("2026-10-17T03:15:42Z");

  await store.recordAttempt("TRA", { success: false, attemptedAtMs, error: "x".repeat(900), stations: 3, maps: 0, transfers: 0 });
  const failed = log.at(-1);
  assert.match(failed.sql, /last_success_at = COALESCE\(VALUES\(last_success_at\), last_success_at\)/);
  assert.equal(failed.params[0], "TRA");
  assert.equal(failed.params[1], null);
  assert.equal(failed.params[2], "2026-10-17 03:15:42");
  assert.equal(failed.params[3].length, 500, "error text fits the column");

  await store.recordAttempt("TRA", { success: true, attemptedAtMs, error: null, stations: 3, maps: 2, transfers: 2 });
  const ok = log.at(-1);
  assert.equal(ok.params[1], "2026-10-17 03:15:42");
  assert.equal(ok.params[3], null);
});

test("upsertStations upserts on the table's (station_id, system_type) key, one row per station", async () => {
  const { pool, log } = createFakePool();
  const store = createMysqlRailSyncStore(pool);
  const n = await store.upsertStations("THSR", [
    { stationId: "0990", stationName: "南港", county: "臺北市", systemType: "hsrail", servicePhone: null, bookingRules: null, featuresJson: "{}" },
    { stationId: "1000", stationName: "台北", county: "臺北市", systemType: "hsrail", servicePhone: "1", bookingRules: "r", featuresJson: "{}" },
  ]);
  assert.equal(n, 2);
  const queries = log.filter((e) => e.op === "pool.query");
  assert.equal(queries.length, 2);
  assert.match(queries[0].sql, /INSERT INTO accessible_transit_facilities[\s\S]*ON DUPLICATE KEY UPDATE/);
  assert.deepEqual(queries[0].params, ["臺北市", "hsrail", "南港", "南港 無障礙設施", null, null, "{}", "0990"]);
});
