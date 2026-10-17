// Issue #704: the wiring of runTransitAccessibilitySync() — the real Senior/Rail client and the real
// MySQL store, with only the outside edges stubbed: the TDX HTTP call (tdxGetJsonWithRetry), the
// OAuth token, and the database pool / advisory lock. railSync.test.mjs covers the sync logic
// against fakes; this file proves the pieces are connected the way production runs them.
import test from "node:test";
import assert from "node:assert/strict";
import { registerRepoHooks, stubModule } from "../garbageRoutes/testSupport/repoHooks.mjs";

const mysqlStub = `
const w = () => globalThis.__railWiring;
export const ensureSchema = async () => { if (w().schemaError) throw new Error(w().schemaError); };
export const getPool = () => w().pool;
export const withAdvisoryLock = async (name, _timeout, fn) => {
  w().lockNames.push(name);
  if (w().lockHeld) return { acquired: false };
  return { acquired: true, result: await fn({}) };
};
`;
const authStub = `export const getTdxToken = async () => globalThis.__railWiring.token;`;
const httpStub = `
export const tdxGetJsonWithRetry = async (url) => {
  const w = globalThis.__railWiring;
  w.requests.push(url);
  w.inFlight += 1;
  w.maxInFlight = Math.max(w.maxInFlight, w.inFlight);
  try {
    await new Promise((resolve) => setImmediate(resolve));
    return w.respond(url);
  } finally {
    w.inFlight -= 1;
  }
};
`;

registerRepoHooks({
  "@/lib/server/db/mysql": stubModule(mysqlStub),
  "@/lib/server/tdx/auth": stubModule(authStub),
  "@/lib/server/tdx/getJsonWithRetry": stubModule(httpStub),
});

const { runTransitAccessibilitySync } = await import("./runSync.ts");
const { RAIL_SYSTEMS } = await import("./railStationCounty.ts");

const SENIOR_URL = /\/Rail\/Station\/(Facility|Service|Map|Transfer)\/(\w+)\?/;
const BASIC_URL = /\/api\/basic\/v2\/Rail\/(?:Metro\/Station\/(\w+)|(TRA|THSR)\/Station)\?/;

/** Resets the shared state and returns it. `failing` is a list of "Endpoint:SYSTEM" strings that answer HTTP 500. */
const setup = ({ failing = [], lastSuccess = {}, token = "token", lockHeld = false, schemaError = null } = {}) => {
  const state = {
    token,
    lockHeld,
    schemaError,
    lockNames: [],
    requests: [],
    inFlight: 0,
    maxInFlight: 0,
    statements: [],
    transactions: [],
    stateRows: Object.entries(lastSuccess).map(([rail_system, at]) => ({ rail_system, last_success_at: new Date(at) })),
    respond(url) {
      const senior = url.match(SENIOR_URL);
      if (senior) {
        const [, endpoint, system] = senior;
        if (failing.includes(`${endpoint}:${system}`)) return { status: 500, data: null };
        const id = `${system}-1`;
        const rows = {
          Facility: [{ StationID: id, StationName: `${system} 站`, Elevators: [{ FacilityName: "電梯" }] }],
          Service: [{ StationID: id, ServiceName: "協助", ServicePhone: "02-1" }],
          Map: [{ StationID: id, MapName: "圖" }],
          Transfer: [{ StationID: id, ExitName: "出口" }],
        }[endpoint];
        return { status: 200, data: rows };
      }
      const basic = url.match(BASIC_URL);
      if (basic) {
        const system = basic[1] || basic[2];
        return { status: 200, data: [{ StationID: `${system}-1`, StationAddress: "100001新北市板橋區" }] };
      }
      return { status: 404, data: null };
    },
  };

  const transactional = (log) => ({
    async beginTransaction() {
      log.push(["begin"]);
    },
    async query(sql, params) {
      log.push(["query", sql.replace(/\s+/g, " ").trim(), params]);
      return [{ affectedRows: 1 }];
    },
    async commit() {
      log.push(["commit"]);
    },
    async rollback() {
      log.push(["rollback"]);
    },
    release() {
      log.push(["release"]);
    },
  });

  state.pool = {
    async query(sql, params) {
      const text = sql.replace(/\s+/g, " ").trim();
      state.statements.push([text, params]);
      if (/FROM accessible_transit_sync_state/.test(text)) return [state.stateRows];
      if (/SELECT COUNT/.test(text)) return [[{ total: 0 }]];
      return [{ affectedRows: 1 }];
    },
    async getConnection() {
      const log = [];
      state.transactions.push(log);
      return transactional(log);
    },
  };
  globalThis.__railWiring = state;
  return state;
};

/** Collects the sync's JSON stage lines (it logs with console.log, straight to the pm2 log). */
const captureStageLines = async (fn) => {
  const original = console.log;
  const lines = [];
  console.log = (...args) => {
    const first = args[0];
    if (typeof first === "string" && first.startsWith('{"event":"transit_accessibility_sync_stage"')) {
      lines.push(JSON.parse(first));
    } else {
      original(...args);
    }
  };
  try {
    return { result: await fn(), lines };
  } finally {
    console.log = original;
  }
};

const deletes = (state) =>
  state.transactions
    .flat()
    .filter((e) => e[0] === "query" && e[1].startsWith("DELETE"))
    .map((e) => ({ table: e[1].match(/FROM (\w+)/)[1], system: e[2][0] }));

test("happy path: ~50 sequential requests, every system written and recorded, one scoped DELETE per table per system", async () => {
  const state = setup();
  const { result: summary, lines } = await captureStageLines(() => runTransitAccessibilitySync());

  assert.equal(summary.ok, true, summary.errors.join("; "));
  assert.deepEqual(summary.errors, []);
  assert.equal(summary.systems.length, RAIL_SYSTEMS.length);
  assert.equal(summary.stationsUpserted, RAIL_SYSTEMS.length);
  assert.equal(summary.mapsUpserted, RAIL_SYSTEMS.length);
  assert.equal(summary.transfersUpserted, RAIL_SYSTEMS.length);
  assert.deepEqual(state.lockNames, ["transit_accessibility_sync_lock"]);

  assert.equal(state.requests.length, RAIL_SYSTEMS.length * 5, "county + Facility + Service + Map + Transfer per system");
  assert.equal(state.maxInFlight, 1, "never more than one TDX request at a time");

  const del = deletes(state);
  assert.equal(del.length, RAIL_SYSTEMS.length * 2);
  for (const system of RAIL_SYSTEMS) {
    assert.ok(del.some((d) => d.table === "accessible_transit_station_maps" && d.system === system), `${system} maps`);
    assert.ok(del.some((d) => d.table === "accessible_transit_transfers" && d.system === system), `${system} transfers`);
  }

  const stateWrites = state.statements.filter(([sql]) => sql.startsWith("INSERT INTO accessible_transit_sync_state"));
  assert.deepEqual(stateWrites.map(([, p]) => p[0]), [...RAIL_SYSTEMS]);
  assert.ok(stateWrites.every(([, p]) => p[1] !== null), "each recorded as a success");

  for (const system of RAIL_SYSTEMS) {
    const mine = lines.filter((l) => l.system === system);
    assert.deepEqual(mine.map((l) => l.stage), ["system_start", "system_fetched", "system_done"], system);
    assert.ok(mine.every((l) => typeof l.heapUsedMB === "number" && typeof l.rssMB === "number"));
  }
});

test("resumes with the stalest system: the order follows the recorded last-success times", async () => {
  const day = 24 * 3600 * 1000;
  const base = Date.parse("2026-10-16T03:30:00Z");
  // KLRT never completed; TMRT is the oldest success; TRA the newest.
  const lastSuccess = Object.fromEntries(
    RAIL_SYSTEMS.filter((s) => s !== "KLRT").map((s, i) => [s, base - (RAIL_SYSTEMS.length - i) * day]),
  );
  lastSuccess.TMRT = base - 30 * day;
  const state = setup({ lastSuccess });

  const { result: summary } = await captureStageLines(() => runTransitAccessibilitySync());

  const order = summary.systems.map((s) => s.system);
  assert.equal(order[0], "KLRT");
  assert.equal(order[1], "TMRT");
  assert.equal(order.length, RAIL_SYSTEMS.length);
  // The very first request of the run is for the first system in that order.
  assert.match(state.requests[0], /KLRT/);
});

test("a failed Map fetch: that system's maps are not deleted, its transfers and every other system still sync", async () => {
  const state = setup({ failing: ["Map:TRTC"] });
  const { result: summary } = await captureStageLines(() => runTransitAccessibilitySync());

  assert.equal(summary.ok, true, "other systems succeeded");
  assert.ok(summary.errors.some((e) => /TRTC Map fetch failed/.test(e)));
  const del = deletes(state);
  assert.ok(!del.some((d) => d.table === "accessible_transit_station_maps" && d.system === "TRTC"), "TRTC maps kept");
  assert.ok(del.some((d) => d.table === "accessible_transit_transfers" && d.system === "TRTC"));
  assert.equal(del.filter((d) => d.table === "accessible_transit_station_maps").length, RAIL_SYSTEMS.length - 1);

  const trtcState = state.statements.find(([sql, p]) => sql.startsWith("INSERT INTO accessible_transit_sync_state") && p[0] === "TRTC");
  assert.equal(trtcState[1][1], null, "no success time is recorded for the failed system");
  assert.match(trtcState[1][3], /Map fetch failed/);
});

test("nothing answers: no row is deleted or written, and the run reports failure", async () => {
  const failing = RAIL_SYSTEMS.flatMap((s) => ["Facility", "Service", "Map", "Transfer"].map((e) => `${e}:${s}`));
  const state = setup({ failing });
  const { result: summary } = await captureStageLines(() => runTransitAccessibilitySync());

  assert.equal(summary.ok, false);
  assert.equal(deletes(state).length, 0);
  assert.ok(!state.statements.some(([sql]) => sql.startsWith("INSERT INTO accessible_transit_facilities")));
  assert.equal(summary.stationsUpserted + summary.mapsUpserted + summary.transfersUpserted, 0);
});

test("another run holds the lock: skipped quietly, no TDX request is made", async () => {
  const state = setup({ lockHeld: true });
  const summary = await runTransitAccessibilitySync();
  assert.equal(summary.skipped, "lock_held");
  assert.equal(summary.ok, true);
  assert.equal(state.requests.length, 0);
});

test("no TDX token: fails loudly once and touches nothing", async () => {
  const state = setup({ token: null });
  const summary = await runTransitAccessibilitySync();
  assert.equal(summary.ok, false);
  assert.match(summary.errors[0], /TDX credentials missing/);
  assert.equal(state.requests.length, 0);
  assert.equal(state.statements.length, 0);
});

test("database unavailable: reported before the first (rate-limited, 11-minute) TDX request goes out", async () => {
  const state = setup({ schemaError: "connect ECONNREFUSED" });
  const summary = await runTransitAccessibilitySync();
  assert.equal(summary.ok, false);
  assert.match(summary.errors[0], /MySQL unavailable: connect ECONNREFUSED/);
  assert.equal(state.requests.length, 0);
});
