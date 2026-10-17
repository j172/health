// tdxStations.ts（TDX → YouBikeStation 的純函式對應）與 directSources.ts 的 Hsinchu 後備行為。
import test from "node:test";
import assert from "node:assert/strict";
import { registerRepoHooks } from "../garbageRoutes/testSupport/repoHooks.mjs";

registerRepoHooks();
const { buildStationsFromTdx, mergeAvailabilityWithStatic, tdxStationNo } = await import("./tdxStations.ts");
const { parseHsinchuStations, withCooldown, fetchHsinchuDirect, HSINCHU_DIRECT_TIMEOUT_MS } = await import("./directSources.ts");

const station = (id, over = {}) => ({
  StationUID: `UID-${id}`,
  StationID: id,
  StationName: { Zh_tw: `YouBike2.0_${id}站` },
  StationPosition: { PositionLat: 24.5, PositionLon: 120.9 },
  StationAddress: { Zh_tw: "某路" },
  BikesCapacity: 30,
  ...over,
});
const avail = (id, over = {}) => ({
  StationUID: `UID-${id}`,
  StationID: id,
  ServiceStatus: 1,
  AvailableRentBikes: 8,
  AvailableReturnBikes: 22,
  AvailableRentBikesDetail: { ElectricBikes: 2 },
  SrcUpdateTime: "2026-10-18T10:00:00+08:00",
  ...over,
});

test("buildStationsFromTdx: both lists in hand — the mapping the full fetch always used", () => {
  const [row] = buildStationsFromTdx("MAL", [station("A1")], [avail("A1")]);
  assert.deepEqual(row, {
    cityCode: "MAL",
    stationNo: "A1",
    nameTw: "A1站",
    districtTw: "",
    addressTw: "某路",
    lat: 24.5,
    lng: 120.9,
    totalSpaces: 30,
    availableBikes: 8,
    availableEbikes: 2,
    emptySpaces: 22,
    isActive: 1,
    updatedAtSource: "2026-10-18 10:00:00",
  });
});

test("buildStationsFromTdx: skips a station without coordinates, writes one with no Availability as inactive, joins by UID or ID", () => {
  const rows = buildStationsFromTdx(
    "CHA",
    [station("NOCOORD", { StationPosition: { PositionLat: 0, PositionLon: 0 } }), station("LONELY"), station("BYUID", { StationID: "" })],
    [{ ...avail("BYUID"), StationID: "" }],
  );
  assert.deepEqual(rows.map((r) => r.stationNo), ["LONELY", "UID-BYUID"], "the coordinate-less station is skipped");
  const lonely = rows.find((r) => r.stationNo === "LONELY");
  assert.equal(lonely.isActive, 0);
  assert.equal(lonely.availableBikes, 0);
  assert.equal(rows.find((r) => r.stationNo === "UID-BYUID").availableBikes, 8, "joined through StationUID");
});

test("buildStationsFromTdx: capacity falls back to bikes + empty docks when BikesCapacity is missing", () => {
  const [row] = buildStationsFromTdx("YUN", [station("X", { BikesCapacity: undefined })], [avail("X")]);
  assert.equal(row.totalSpaces, 30);
});

test("mergeAvailabilityWithStatic: Availability alone plus stored rows; unknown IDs are reported, not guessed", () => {
  const stored = [
    { stationNo: "A1", nameTw: "甲", districtTw: "東區", addressTw: "x", lat: 1, lng: 2, totalSpaces: 12 },
  ];
  const { stations, unknownStationNos } = mergeAvailabilityWithStatic("TNN", [avail("A1"), avail("B2")], stored);
  assert.deepEqual(unknownStationNos, ["B2"]);
  assert.equal(stations.length, 1);
  assert.equal(stations[0].nameTw, "甲");
  assert.equal(stations[0].districtTw, "東區");
  assert.equal(stations[0].totalSpaces, 12);
  assert.equal(stations[0].availableBikes, 8);
});

test("mergeAvailabilityWithStatic: finds a stored row by StationUID when the StationID differs, ignores entries with no ID at all", () => {
  const stored = [{ stationNo: "UID-A1", nameTw: "甲", districtTw: "", addressTw: "", lat: 1, lng: 2, totalSpaces: 5 }];
  const { stations, unknownStationNos } = mergeAvailabilityWithStatic(
    "TNN",
    [avail("A1", { StationID: "OTHER-ID" }), { ...avail("Z"), StationID: "", StationUID: "" }],
    stored,
  );
  assert.equal(stations.length, 1);
  assert.equal(stations[0].stationNo, "UID-A1", "written under the key the row is stored under, not a duplicate");
  assert.deepEqual(unknownStationNos, []);
  assert.equal(tdxStationNo({ StationID: "", StationUID: "U" }), "U");
});

test("parseHsinchuStations: the placeholder rows are labelled HSC_n with the fixed counts the fallback always used", () => {
  const rows = parseHsinchuStations([{ "站點名稱": "YouBike2.0_新竹火車站", "站點位置": "中華路", "緯度": "24.80", "經度": "120.97" }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stationNo, "HSC_1");
  assert.equal(rows[0].nameTw, "新竹火車站");
  assert.equal(rows[0].districtTw, "新竹市");
  assert.deepEqual([rows[0].totalSpaces, rows[0].availableBikes, rows[0].emptySpaces], [20, 10, 10]);
});

test("fetchHsinchuDirect: a short timeout (5 s, was 10 s) and a failure becomes an error line, never a throw", async () => {
  assert.equal(HSINCHU_DIRECT_TIMEOUT_MS, 5000);
  let seenTimeout;
  const result = await fetchHsinchuDirect(async (_url, options) => {
    seenTimeout = options.timeoutMs;
    throw new Error("timeout of 5000ms exceeded");
  });
  assert.equal(seenTimeout, 5000);
  assert.deepEqual(result, { stations: [], error: "Hsinchu fetch failed: timeout of 5000ms exceeded" });
});

test("withCooldown: after a fetch that yields nothing the host is left alone for the cooldown, then tried again", async () => {
  let nowMs = 1_000;
  let attempts = 0;
  const guarded = withCooldown(
    async () => {
      attempts += 1;
      return { stations: [], error: "Hsinchu fetch failed: timeout" };
    },
    60 * 60_000,
    () => nowMs,
  );

  assert.equal((await guarded()).error, "Hsinchu fetch failed: timeout");
  nowMs += 59 * 60_000;
  assert.deepEqual(await guarded(), { stations: [] }, "silently skipped inside the cooldown");
  assert.equal(attempts, 1);
  nowMs += 60_000;
  await guarded();
  assert.equal(attempts, 2);
});

test("withCooldown: a successful fetch does not start a cooldown", async () => {
  let attempts = 0;
  const guarded = withCooldown(async () => {
    attempts += 1;
    return { stations: [{ cityCode: "HSC" }] };
  });
  await guarded();
  await guarded();
  assert.equal(attempts, 2);
});
