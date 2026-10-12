import { test } from "node:test";
import assert from "node:assert/strict";

const {
  computeLowFloorRatio,
  buildSampleTrips,
  buildRoutesFromTdxBusData,
  partitionSyncableCounties,
} = await import("./busLowFloorMath.ts");

test("computeLowFloorRatio: counts distinct plates, ignores entries without a plate number", () => {
  const ratio = computeLowFloorRatio([
    { plateNumb: "AAA-001", isLowFloor: true },
    { plateNumb: "AAA-002", isLowFloor: true },
    { plateNumb: "AAA-003", isLowFloor: false },
    { plateNumb: "", isLowFloor: true }, // dropped: no plate number
  ]);
  // 2 of 3 real vehicles are low-floor
  assert.equal(ratio, 66.7);
});

test("computeLowFloorRatio: dedupes repeated plate numbers (same bus seen twice in one TDX snapshot)", () => {
  const ratio = computeLowFloorRatio([
    { plateNumb: "AAA-001", isLowFloor: true },
    { plateNumb: "AAA-001", isLowFloor: true }, // duplicate GPS ping
    { plateNumb: "AAA-002", isLowFloor: false },
  ]);
  assert.equal(ratio, 50);
});

test("computeLowFloorRatio: all low-floor fleet rounds cleanly to 100", () => {
  const ratio = computeLowFloorRatio([
    { plateNumb: "A", isLowFloor: true },
    { plateNumb: "B", isLowFloor: true },
  ]);
  assert.equal(ratio, 100);
});

test("computeLowFloorRatio: empty fleet returns 0, never NaN/divide-by-zero", () => {
  assert.equal(computeLowFloorRatio([]), 0);
});

test("buildSampleTrips: maps TDX Timetable.IsLowFloor into the trip-level shape and caps at the limit", () => {
  const trips = buildSampleTrips(
    [
      { tripId: "T1", isLowFloor: true, departureTime: "08:30:00" },
      { tripId: "T2", isLowFloor: false, departureTime: "09:00:00" },
      { tripId: "T3", isLowFloor: true, departureTime: "09:30:00" },
      { tripId: "T4", isLowFloor: true, departureTime: "10:00:00" },
    ],
    2,
  );
  assert.equal(trips.length, 2);
  assert.deepEqual(trips[0], { tripId: "T1", departureTime: "08:30:00", isLowFloor: true });
  assert.deepEqual(trips[1], { tripId: "T2", departureTime: "09:00:00", isLowFloor: false });
});

test("buildSampleTrips: deduplicates repeated TripIDs and synthesizes an id when TDX omits one", () => {
  const trips = buildSampleTrips([
    { tripId: "T1", isLowFloor: true, departureTime: null },
    { tripId: "T1", isLowFloor: true, departureTime: null }, // duplicate, should be skipped
    { tripId: undefined, isLowFloor: false, departureTime: "07:00:00" },
  ]);
  assert.equal(trips.length, 2);
  assert.equal(trips[0].tripId, "T1");
  assert.ok(trips[1].tripId.startsWith("trip-"));
  assert.equal(trips[1].departureTime, "07:00:00");
});

test("buildRoutesFromTdxBusData: maps IsLowFloor into lowFloorRatio + sampleTrips, tags source as tdx_bus", () => {
  const vehiclesByRoute = new Map([
    [
      "ROUTE-A",
      [
        { plateNumb: "A1", isLowFloor: true },
        { plateNumb: "A2", isLowFloor: true },
        { plateNumb: "A3", isLowFloor: false },
        { plateNumb: "A4", isLowFloor: false },
      ],
    ],
  ]);
  const routeNamesByRoute = new Map([["ROUTE-A", "307 路線"]]);
  const tripsByRoute = new Map([
    [
      "ROUTE-A",
      [
        { tripId: "T1", isLowFloor: true, departureTime: "08:00:00" },
        { tripId: "T2", isLowFloor: false, departureTime: "08:30:00" },
      ],
    ],
  ]);

  const routes = buildRoutesFromTdxBusData({
    county: "臺北市",
    vehiclesByRoute,
    routeNamesByRoute,
    tripsByRoute,
  });

  assert.equal(routes.length, 1);
  const route = routes[0];
  assert.equal(route.county, "臺北市");
  assert.equal(route.routeId, "ROUTE-A");
  assert.equal(route.routeName, "307 路線");
  assert.equal(route.lowFloorRatio, 50);
  assert.equal(route.isAllLowFloor, false);
  assert.equal(route.source, "tdx_bus");
  assert.equal(route.sampleTrips.length, 2);
  assert.equal(route.sampleTrips[0].isLowFloor, true);
  assert.equal(route.sampleTrips[1].isLowFloor, false);
});

test("buildRoutesFromTdxBusData: isAllLowFloor is only true at an exact 100% ratio", () => {
  const vehiclesByRoute = new Map([
    ["ROUTE-B", [{ plateNumb: "B1", isLowFloor: true }]],
  ]);
  const routes = buildRoutesFromTdxBusData({
    county: "高雄市",
    vehiclesByRoute,
    routeNamesByRoute: new Map(),
    tripsByRoute: new Map(),
  });
  assert.equal(routes[0].isAllLowFloor, true);
  assert.equal(routes[0].sampleTrips, undefined);
});

test("buildRoutesFromTdxBusData: a route with zero vehicles is skipped instead of reported as 0%", () => {
  const vehiclesByRoute = new Map([["ROUTE-EMPTY", []]]);
  const routes = buildRoutesFromTdxBusData({
    county: "臺中市",
    vehiclesByRoute,
    routeNamesByRoute: new Map(),
    tripsByRoute: new Map(),
  });
  assert.equal(routes.length, 0);
});

test("partitionSyncableCounties: counties with routes go to syncable, empty ones are skipped (fallback mechanism)", () => {
  const routesByCounty = new Map([
    ["臺北市", [{ id: 1 }]],
    ["新北市", []], // simulated TDX failure for this county this run
    ["高雄市", [{ id: 2 }, { id: 3 }]],
  ]);

  const { syncable, skippedCounties } = partitionSyncableCounties(routesByCounty);

  assert.deepEqual([...syncable.keys()].sort(), ["臺北市", "高雄市"]);
  assert.deepEqual(skippedCounties, ["新北市"]);
  // The skipped county's existing seed/previous-sync rows are never passed to
  // a DB write — this Map simply never contains them, by construction.
  assert.equal(syncable.has("新北市"), false);
});

test("partitionSyncableCounties: an entirely failed sync (every county empty) skips everything, writing nothing", () => {
  const routesByCounty = new Map([
    ["臺北市", []],
    ["新北市", []],
  ]);
  const { syncable, skippedCounties } = partitionSyncableCounties(routesByCounty);
  assert.equal(syncable.size, 0);
  assert.deepEqual(skippedCounties.sort(), ["新北市", "臺北市"]);
});
