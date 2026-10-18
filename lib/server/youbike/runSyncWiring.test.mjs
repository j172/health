// runSync.ts 的接線：真實的 directSources／tdxClient／syncStore／tdxSyncCore，只替換最外層的邊界
// （HTTP、TDX token、MySQL pool）。證明：
//   - 臺北市、新北市的 job 完全不碰 TDX（不取 token、不打 TDX、只打兩個免費開放資料網址）；
//   - TDX 的 job 平常只打 13 個縣市各一次的 Bike/Availability，沒有 Bike/Station，也沒有雙北；
//   - 沒有 token（斷路器開啟）時 TDX 一個請求都不送。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerRepoHooks, stubModule } from "../garbageRoutes/testSupport/repoHooks.mjs";

registerRepoHooks({
  "@/lib/server/net/httpClient": stubModule(`
    export const httpGetJson = async (url, options) => globalThis.__yb.openData(url, options);
  `),
  "@/lib/server/tdx/auth": stubModule(`
    export const getTdxToken = async () => { globalThis.__yb.tokenCalls += 1; return globalThis.__yb.token; };
  `),
  "@/lib/server/tdx/getJsonWithRetry": stubModule(`
    export const tdxGetJsonWithRetry = async (url, token, options) => globalThis.__yb.tdxGet(url, token, options);
  `),
  "@/lib/server/db/mysql": stubModule(`
    export const ensureSchema = async () => { globalThis.__yb.ensureSchemaCalls += 1; };
    export const getPool = () => globalThis.__yb.pool;
  `),
});

const { runYouBikeDirectSync, runYouBikeTdxSync } = await import("./runSync.ts");
const { TDX_SYNCED_CITY_CODES, TDX_CITIES } = await import("./tdxClient.ts");

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const NOW_ISO = "2026-10-18T11:58:00+08:00";

const taipeiRow = (sno, over = {}) => ({
  sno,
  sna: `YouBike2.0_站${sno}`,
  sarea: "信義區",
  ar: `路${sno}號`,
  latitude: "25.03",
  longitude: "121.56",
  Quantity: "30",
  available_rent_bikes: "12",
  available_return_bikes: "18",
  act: "1",
  updateTime: "2026-10-18 11:57:00",
  ...over,
});
const newTaipeiRow = (sno, over = {}) => ({
  sno,
  sna: `YouBike2.0_新北${sno}`,
  sarea: "板橋區",
  ar: `新北路${sno}號`,
  lat: "25.01",
  lng: "121.46",
  tot_quantity: "40",
  sbi_quantity: "0",
  yb2_quantity: "9",
  eyb_quantity: "2",
  bemp: "31",
  act: "1",
  mday: "2026-10-18 11:56:00",
  ...over,
});

/** Installs the fake world and returns it. */
function setup({ token = "fake-token", openData, tdxGet, stored = {}, state = {} } = {}) {
  const world = {
    token,
    tokenCalls: 0,
    ensureSchemaCalls: 0,
    openDataUrls: [],
    tdxUrls: [],
    sql: [],
    upsertedRows: [],
    stateWrites: [],
    openData: async (url) => {
      world.openDataUrls.push(url);
      if (openData) return openData(url);
      if (url.includes("tcgbusfs")) return { status: 200, data: [taipeiRow("500101001"), taipeiRow("500101002")] };
      if (url.includes("data.ntpc.gov.tw")) return { status: 200, data: [newTaipeiRow("1001"), newTaipeiRow("1002")] };
      throw new Error(`unexpected open-data URL ${url}`);
    },
    tdxGet: async (url, tokenArg) => {
      world.tdxUrls.push(url);
      assert.equal(tokenArg, "fake-token");
      return tdxGet ? tdxGet(url) : { status: 200, data: [] };
    },
    pool: {
      query: async (sql, params) => {
        world.sql.push(sql);
        if (sql.includes("FROM youbike_stations")) {
          const rows = [];
          for (const code of params[0]) {
            for (const row of stored[code] ?? []) rows.push({ cityCode: code, ...row });
          }
          return [rows];
        }
        if (sql.includes("FROM youbike_sync_state")) {
          return [Object.entries(state).map(([city_code, ms]) => ({ city_code, static_refreshed_at: new Date(ms) }))];
        }
        if (sql.includes("INSERT INTO youbike_stations")) {
          world.upsertedRows.push(...params[0]);
          return [{}];
        }
        if (sql.includes("INSERT INTO youbike_sync_state")) {
          world.stateWrites.push(...params[0]);
          return [{}];
        }
        throw new Error(`unexpected SQL: ${sql}`);
      },
    },
  };
  globalThis.__yb = world;
  return world;
}

// --- Taipei + New Taipei: never TDX --------------------------------------------------------------

test("the 5-minute job reads Taipei and New Taipei from their open-data feeds and never touches TDX", async () => {
  const world = setup();
  const summary = await runYouBikeDirectSync();

  assert.equal(world.tokenCalls, 0, "no TDX token is requested");
  assert.deepEqual(world.tdxUrls, [], "no TDX request is sent");
  assert.equal(world.openDataUrls.length, 2);
  assert.match(world.openDataUrls[0], /^https:\/\/tcgbusfs\.blob\.core\.windows\.net\//);
  assert.match(world.openDataUrls[1], /^https:\/\/data\.ntpc\.gov\.tw\/api\/datasets\/.*page=0&size=1000$/);

  assert.deepEqual(summary, { ok: true, totalUpserted: 4, cities: { TPE: 2, NTPC: 2 }, errors: [], source: "direct" });
  assert.equal(world.upsertedRows.length, 4);
  assert.ok(world.sql.some((s) => /INSERT INTO youbike_stations[\s\S]*ON DUPLICATE KEY UPDATE[\s\S]*updated_at = NOW\(\)/.test(s)), "same upsert statement as before");
});

test("direct job: field mapping is unchanged (Taipei fields, New Taipei sbi/yb2 fallback, YouBike2.0_ prefix stripped)", async () => {
  const world = setup();
  await runYouBikeDirectSync();
  const tpe = world.upsertedRows.find((r) => r[0] === "TPE" && r[1] === "500101001");
  assert.deepEqual(tpe.slice(0, 13), ["TPE", "500101001", "站500101001", "信義區", "路500101001號", 25.03, 121.56, 30, 12, 0, 18, 1, "2026-10-18 11:57:00"]);
  const ntpc = world.upsertedRows.find((r) => r[0] === "NTPC" && r[1] === "1001");
  assert.deepEqual(ntpc.slice(0, 13), ["NTPC", "1001", "新北1001", "板橋區", "新北路1001號", 25.01, 121.46, 40, 9, 2, 31, 1, "2026-10-18 11:56:00"]);
});

test("direct job: New Taipei pages until a short page (1000-row pages, at most 3)", async () => {
  const page = (n, count) => Array.from({ length: count }, (_, i) => newTaipeiRow(`${n}-${i}`));
  const world = setup({
    openData: async (url) => {
      if (url.includes("tcgbusfs")) return { status: 200, data: [] };
      const pageNo = Number(/page=(\d+)/.exec(url)[1]);
      return { status: 200, data: pageNo === 0 ? page(0, 1000) : page(pageNo, 10) };
    },
  });
  const summary = await runYouBikeDirectSync();
  assert.equal(world.openDataUrls.filter((u) => u.includes("ntpc")).length, 2);
  assert.equal(summary.cities.NTPC, 1010);
});

test("direct job: failures keep the wording operators know, and one city failing does not stop the other", async () => {
  setup({
    openData: async (url) => {
      if (url.includes("tcgbusfs")) return { status: 503, data: [] };
      throw new Error("socket hang up");
    },
  });
  const summary = await runYouBikeDirectSync();
  assert.deepEqual(summary.errors, ["Taipei returned status 503", "New Taipei fetch failed: socket hang up"]);
  assert.equal(summary.ok, false);

  setup({
    openData: async (url) => {
      if (url.includes("tcgbusfs")) throw new Error("timeout of 15000ms exceeded");
      return { status: 200, data: [newTaipeiRow("9")] };
    },
  });
  const partial = await runYouBikeDirectSync();
  assert.deepEqual(partial.errors, ["Taipei fetch failed: timeout of 15000ms exceeded"]);
  assert.equal(partial.cities.NTPC, 1);
  assert.equal(partial.ok, true, "New Taipei still succeeded");
});

// --- the other 13 cities: Availability only -----------------------------------------------------------

const availabilityFor = (code) => [
  { StationUID: `U-${code}-1`, StationID: `${code}-1`, ServiceStatus: 1, AvailableRentBikes: 3, AvailableReturnBikes: 17, AvailableRentBikesDetail: { ElectricBikes: 0 }, SrcUpdateTime: NOW_ISO },
];

const storedAllCities = () =>
  Object.fromEntries(
    TDX_SYNCED_CITY_CODES.map((code) => [
      code,
      [{ stationNo: `${code}-1`, nameTw: `站-${code}`, districtTw: "", addressTw: "某路1號", lat: 23.5, lng: 120.5, totalSpaces: 20 }],
    ]),
  );

test("the TDX job covers exactly the 13 non-direct cities", () => {
  assert.equal(TDX_SYNCED_CITY_CODES.length, 13);
  assert.ok(!TDX_SYNCED_CITY_CODES.includes("TPE"));
  assert.ok(!TDX_SYNCED_CITY_CODES.includes("NTPC"));
  assert.equal(Object.keys(TDX_CITIES).length, 15);
});

test("the 15-minute TDX job sends 13 Bike/Availability requests and nothing else: no Bike/Station, no Taipei, no New Taipei", async () => {
  const world = setup({
    stored: storedAllCities(),
    state: Object.fromEntries(TDX_SYNCED_CITY_CODES.map((code) => [code, Date.now() - 60 * 60_000])),
    tdxGet: async (url) => {
      const code = TDX_SYNCED_CITY_CODES.find((c) => url.includes(`/City/${TDX_CITIES[c].tdxName}?`));
      return { status: 200, data: availabilityFor(code) };
    },
  });
  const summary = await runYouBikeTdxSync();

  assert.equal(world.tdxUrls.length, 13);
  assert.ok(world.tdxUrls.every((u) => u.startsWith("https://tdx.transportdata.tw/api/basic/v2/Bike/Availability/City/")), world.tdxUrls.join("\n"));
  assert.ok(!world.tdxUrls.some((u) => u.includes("/Bike/Station/")));
  assert.ok(!world.tdxUrls.some((u) => /City\/(Taipei|NewTaipei)\?/.test(u)), "Taipei and New Taipei are not asked of TDX");
  assert.equal(world.openDataUrls.length, 0, "Hsinchu's direct feed is not tried while TDX serves Hsinchu");
  assert.equal(world.ensureSchemaCalls, 1);
  assert.equal(summary.ok, true);
  assert.deepEqual(summary.errors, []);
  assert.equal(summary.totalUpserted, 13);
  assert.equal(summary.source, "tdx");
  assert.deepEqual(summary.tdx, { availabilityCalls: 13, stationCalls: 0, refreshedCities: [], deferredCities: [] });
  assert.equal(world.stateWrites.length, 0);
  // Static columns come from the stored rows, live ones from TDX.
  const row = world.upsertedRows.find((r) => r[1] === "KHH-1");
  assert.deepEqual(row.slice(0, 13), ["KHH", "KHH-1", "站-KHH", "", "某路1號", 23.5, 120.5, 20, 3, 0, 17, 1, "2026-10-18 11:58:00"]);
});

test("first round after a deploy (nothing in the database, no state): only 3 Bike/Station requests, load times are written to youbike_sync_state", async () => {
  const world = setup({
    tdxGet: async (url) => {
      const code = TDX_SYNCED_CITY_CODES.find((c) => url.includes(`/City/${TDX_CITIES[c].tdxName}?`));
      if (url.includes("/Bike/Station/")) {
        return { status: 200, data: [{ StationUID: `U-${code}-1`, StationID: `${code}-1`, StationName: { Zh_tw: `YouBike2.0_${code}站` }, StationPosition: { PositionLat: 23.5, PositionLon: 120.5 }, StationAddress: { Zh_tw: "某路" }, BikesCapacity: 18 }] };
      }
      return { status: 200, data: availabilityFor(code) };
    },
  });
  const summary = await runYouBikeTdxSync();

  assert.equal(world.tdxUrls.filter((u) => u.includes("/Bike/Station/")).length, 3);
  assert.equal(world.tdxUrls.filter((u) => u.includes("/Bike/Availability/")).length, 3, "cities that cannot be written yet are not even asked for Availability");
  assert.deepEqual(summary.tdx.refreshedCities, ["TYCG", "HSC", "HCH"]);
  assert.equal(summary.tdx.deferredCities.length, 10);
  assert.deepEqual(world.stateWrites.map((r) => r[0]), ["TYCG", "HSC", "HCH"]);
  assert.match(world.stateWrites[0][1], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.ok(world.sql.some((s) => /INSERT INTO youbike_sync_state[\s\S]*ON DUPLICATE KEY UPDATE static_refreshed_at/.test(s)));
});

test("no token (breaker open / credentials missing): zero TDX requests; the TDX job reports why and only Hsinchu's fallback is tried", async () => {
  const world = setup({ token: null, stored: storedAllCities() });
  const summary = await runYouBikeTdxSync();
  assert.equal(world.tdxUrls.length, 0);
  assert.equal(summary.ok, summary.totalUpserted > 0);
  assert.match(summary.errors.join("\n"), /TDX unavailable \(no usable TDX token: credentials missing, token request refused, or circuit breaker/);
});

// --- scheduling and schema conventions (source text) ------------------------------------------------------

test("registerJobs.ts: Taipei/New Taipei every 5 minutes, the 13 TDX cities on four free minutes (about every 15)", () => {
  const src = read("../cron/registerJobs.ts");
  assert.match(src, /"\*\/5 \* \* \* \*",\s*runGuarded\("youbike-sync-cron\.log", \(\) => runYouBikeDirectSync\(\)\)/);
  assert.match(src, /"11,26,39,54 \* \* \* \*",\s*runGuarded\("youbike-tdx-sync-cron\.log", \(\) => runYouBikeTdxSync\(\)\)/);
  // Four rounds an hour, never closer than 13 minutes (a round takes ~3 minutes in the shared limiter).
  const gaps = [26 - 11, 39 - 26, 54 - 39, 60 + 11 - 54];
  assert.ok(Math.min(...gaps) >= 13 && Math.max(...gaps) <= 17, `gaps ${gaps.join(",")}`);
});

test("youbike_sync_state: one row per city keyed by city_code alone, the time is a plain column, and the table is registered", () => {
  const schema = read("../db/schema.ts");
  const match = schema.match(/youbikeSyncState:\s*`([\s\S]*?)`,/);
  assert.ok(match, "youbikeSyncState DDL entry not found in schema.ts");
  const ddl = match[1];
  assert.match(ddl, /CREATE TABLE IF NOT EXISTS youbike_sync_state/, "idempotent");
  assert.match(ddl, /city_code VARCHAR\(10\) NOT NULL PRIMARY KEY/);
  assert.match(ddl, /static_refreshed_at DATETIME NULL/);
  assert.ok(!/UNIQUE KEY/i.test(ddl), "the primary key is the only key");
  assert.ok(!/\bINDEX\b|\bKEY\b\s+\w+\s*\(/i.test(ddl.replace(/PRIMARY KEY/gi, "")), "no secondary key that could pick up a time column");
  assert.match(read("../db/mysql.ts"), /TABLE_DDL\.youbikeSyncState/);
});

test("the TDX job reads the database before its first TDX request and creates its tables itself (no dependence on a page render having migrated)", () => {
  const store = read("./syncStore.ts");
  const loadFn = store.slice(store.indexOf("export async function loadYouBikeStaticStations"));
  assert.ok(loadFn.indexOf("await ensureSchema()") > -1 && loadFn.indexOf("await ensureSchema()") < loadFn.indexOf("FROM youbike_stations"));
  const core = read("./tdxSyncCore.ts");
  assert.ok(core.indexOf("edges.loadStaticStations(") < core.indexOf("edges.getToken()"), "database first, token second");
});

test("the 'update delayed' badge uses 15 minutes for the 5-minute cities and 30 for the 15-minute TDX cities", () => {
  const ui = read("../../../components/Tools/YoubikeContent.tsx");
  assert.match(ui, /DIRECT_CITY_CODES\.includes\(cityCode\) \? 15 : 30\) \* 60 \* 1000/);
  assert.match(ui, /Date\.now\(\) - t2 > staleAfterMs\(station\.cityCode\)/);
  assert.ok(!/Date\.now\(\) - t2 > 15 \* 60 \* 1000/.test(ui), "no more single fixed threshold");
});
