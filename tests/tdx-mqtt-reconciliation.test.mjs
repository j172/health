import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  RECONCILIATION_CACHE_KEY,
  RECONCILIATION_TTL_MS,
  METRO_RECONCILIATION_SYSTEMS,
  fetchMetroAlertsSnapshot,
  reconcileMetroAlerts,
  ensureColdStartSnapshot,
} from "../lib/server/tdx/mqtt/reconciliation.ts";
import {
  extractCronSchedules,
  parseCronExpression,
  sharedTickMinutes,
} from "../lib/server/cron/cronCollisions.mjs";

test("reconciliation: TTL guard bypasses REST calls when cache is fresh (< 1h) and DB has active records", async () => {
  let restCalls = 0;
  const now = new Date("2026-10-24T05:00:00.000Z");
  // 30 minutes old cache (< 1 hour TTL)
  const freshCacheDate = new Date("2026-10-24T04:30:00.000Z").toISOString().slice(0, 19).replace("T", " ");

  const mockQuery = async (sql) => {
    if (sql.includes("provider_api_cache")) {
      return [
        {
          response_json: JSON.stringify({
            reconciledAt: "2026-10-24T04:30:00.000Z",
            systemsChecked: [...METRO_RECONCILIATION_SYSTEMS],
            activeCount: 3,
            resolvedCount: 0,
            status: "ok",
          }),
          fetched_at_utc: freshCacheDate,
        },
      ];
    }
    if (sql.includes("SELECT COUNT(*)")) {
      return [{ cnt: 3 }];
    }
    return [];
  };

  const res = await ensureColdStartSnapshot({
    queryFn: mockQuery,
    fetchSnapshotFn: async () => {
      restCalls += 1;
      return [];
    },
    intervalMs: 0,
    now: () => now,
  });

  assert.equal(res.ok, true);
  assert.equal(res.bypassed, true);
  assert.equal(res.reason, "fresh_cache_and_active_records");
  assert.equal(res.activeCount, 3);
  assert.equal(restCalls, 0, "No REST calls must be made when TTL guard triggers");
});

test("reconciliation: cold-start triggers snapshot when cache is missing or stale (> 1h)", async () => {
  let restCalls = 0;
  const now = new Date("2026-10-24T06:00:00.000Z");
  // 90 minutes old cache (> 1 hour TTL)
  const staleCacheDate = new Date("2026-10-24T04:30:00.000Z").toISOString().slice(0, 19).replace("T", " ");

  const executedStatements = [];
  const mockQuery = async (sql) => {
    if (sql.includes("provider_api_cache")) {
      return [
        {
          response_json: JSON.stringify({ reconciledAt: "2026-10-24T04:30:00.000Z" }),
          fetched_at_utc: staleCacheDate,
        },
      ];
    }
    return [];
  };

  const mockExecute = async (sql, params) => {
    executedStatements.push({ sql, params });
    return [{ affectedRows: 1 }];
  };

  const res = await ensureColdStartSnapshot({
    queryFn: mockQuery,
    executeFn: mockExecute,
    intervalMs: 0, // 0 for fast unit test
    fetchSnapshotFn: async (system) => {
      restCalls += 1;
      return [
        {
          alertId: `${system}_ALERT_1`,
          railSystem: system,
          systemLabel: system,
          stationId: "ST01",
          stationName: "站點",
          lineId: "L1",
          lineName: "主線",
          reason: "信號異常",
          description: "信號異常導致延誤",
          severity: "warning",
          startTime: "2026-10-24 05:00:00",
          endTime: null,
          publishTime: "2026-10-24 05:00:00",
        },
      ];
    },
    now: () => now,
  });

  assert.equal(res.ok, true);
  assert.equal(res.bypassed, false);
  assert.equal(res.reason, "snapshot_completed");
  assert.equal(restCalls, 6, "Must fetch all 6 metro operators on stale cache");
  assert.equal(res.activeCount, 6);

  // Check that provider_api_cache was updated
  const cacheUpsert = executedStatements.find((s) => s.sql.includes("provider_api_cache"));
  assert.ok(cacheUpsert, "Must update provider_api_cache with new reconciliation record");
  assert.equal(cacheUpsert.params[0], RECONCILIATION_CACHE_KEY);
});

test("reconciliation: soft-resolves disappeared alerts with end_time = NOW()", async () => {
  const now = new Date("2026-10-24T04:16:00.000Z");
  const executedUpdates = [];

  // Upstream returns only TRTC_NEW_01 (TRTC_OLD_VANISHED has disappeared upstream)
  const mockFetch = async (system) => {
    if (system === "TRTC") {
      return [
        {
          alertId: "TRTC_NEW_01",
          railSystem: "TRTC",
          systemLabel: "臺北捷運",
          stationId: "BL11",
          stationName: "台北車站",
          reason: "設備檢修",
          description: "月台檢修",
          severity: "info",
          startTime: "2026-10-24 04:00:00",
          endTime: null,
          publishTime: "2026-10-24 04:00:00",
        },
      ];
    }
    return [];
  };

  const mockQuery = async (sql, params) => {
    if (sql.includes("SELECT alert_id FROM accessible_transit_facility_alerts")) {
      const system = params[0];
      if (system === "TRTC") {
        // DB currently contains TRTC_NEW_01 and TRTC_OLD_VANISHED
        return [{ alert_id: "TRTC_NEW_01" }, { alert_id: "TRTC_OLD_VANISHED" }];
      }
    }
    return [];
  };

  const mockExecute = async (sql, params) => {
    if (sql.includes("UPDATE accessible_transit_facility_alerts")) {
      executedUpdates.push({ sql, params });
    }
    return [{ affectedRows: 1 }];
  };

  const res = await reconcileMetroAlerts({
    fetchSnapshotFn: mockFetch,
    queryFn: mockQuery,
    executeFn: mockExecute,
    intervalMs: 0,
    now: () => now,
  });

  assert.equal(res.ok, true);
  assert.equal(res.activeCount, 1);
  assert.equal(res.resolvedCount, 1);

  // Verify that TRTC_OLD_VANISHED was soft-resolved with end_time = NOW()
  assert.equal(executedUpdates.length, 1);
  assert.match(executedUpdates[0].sql, /SET end_time = NOW\(\)/);
  assert.equal(executedUpdates[0].params[0], "TRTC_OLD_VANISHED");
});

test("boundary isolation: elevator and accessibility facility alerts (-EL) are NEVER soft-resolved or touched", async () => {
  const executedUpdates = [];

  // Upstream returns empty disruptions list for all systems
  const mockFetch = async () => [];

  const mockQuery = async (sql, params) => {
    if (sql.includes("SELECT alert_id FROM accessible_transit_facility_alerts")) {
      // Confirm the query strictly filters by disruption facility_name and excludes elevator alerts
      assert.match(sql, /facility_name LIKE '%· 營運通報'/);
      assert.match(sql, /facility_id IS NULL OR facility_id NOT LIKE '%-EL%'/);
      return [];
    }
    return [];
  };

  const mockExecute = async (sql, params) => {
    if (sql.includes("UPDATE accessible_transit_facility_alerts")) {
      assert.match(sql, /facility_name LIKE '%· 營運通報'/);
      assert.match(sql, /facility_id IS NULL OR facility_id NOT LIKE '%-EL%'/);
      executedUpdates.push({ sql, params });
    }
    return [{ affectedRows: 1 }];
  };

  await reconcileMetroAlerts({
    fetchSnapshotFn: mockFetch,
    queryFn: mockQuery,
    executeFn: mockExecute,
    intervalMs: 0,
  });

  // No updates should touch elevator outages
  assert.equal(executedUpdates.length, 0);
});

test("cron schedule & budget: 16 4 * * * is collision-free and respects the 3,000 monthly quota", () => {
  const registerJobsSource = fs.readFileSync(
    path.join(process.cwd(), "lib/server/cron/registerJobs.ts"),
    "utf8",
  );
  const jobs = extractCronSchedules(registerJobsSource);

  const reconcileJob = jobs.find((j) => j.name === "tdx-metro-reconcile-cron.log");
  assert.ok(reconcileJob, "tdx-metro-reconcile-cron.log must be registered");
  assert.equal(reconcileJob.expression, "16 4 * * *");

  const elevatorJob = jobs.find((j) => j.name === "transit-accessibility-alerts-cron.log");
  assert.ok(elevatorJob, "transit-accessibility-alerts-cron.log must be registered");
  assert.equal(elevatorJob.expression, "16 */3 * * *");

  // Verify zero collisions between tdx-metro-reconcile (04:16) and transit-accessibility-alerts (*/3)
  const shared = sharedTickMinutes(reconcileJob.expression, elevatorJob.expression);
  assert.deepEqual(shared, [], "Hour 4 does not collide with */3 (0, 3, 6, 9, 12, 15, 18, 21)");

  // Daily requests calculation
  const elevatorRunsPerDay = parseCronExpression(elevatorJob.expression).hour.size; // 8 runs
  const elevatorRequestsPerDay = 10 * elevatorRunsPerDay; // 10 systems * 8 = 80 requests/day

  const reconcileRunsPerDay = parseCronExpression(reconcileJob.expression).hour.size; // 1 run
  const reconcileRequestsPerDay = METRO_RECONCILIATION_SYSTEMS.length * reconcileRunsPerDay; // 6 systems * 1 = 6 requests/day

  const totalDailyTdxRequests = elevatorRequestsPerDay + reconcileRequestsPerDay; // 80 + 6 = 86 requests/day
  const totalMonthlyTdxRequests = totalDailyTdxRequests * 30; // 2,580 requests/month

  assert.equal(elevatorRequestsPerDay, 80);
  assert.equal(reconcileRequestsPerDay, 6);
  assert.equal(totalDailyTdxRequests, 86);
  assert.equal(totalMonthlyTdxRequests, 2580);
  assert.ok(totalMonthlyTdxRequests <= 3000, "Must be comfortably below the 3,000 monthly quota");
});

test("API route & UI badges: returns syncMeta and renders dual badges", () => {
  const apiRouteSource = fs.readFileSync(
    path.join(process.cwd(), "app/api/transit-alerts/route.ts"),
    "utf8",
  );
  assert.match(apiRouteSource, /syncMeta/, "API route must return syncMeta");
  assert.match(apiRouteSource, /pushMode:\s*"mqtt_live"/, "API route pushMode must be mqtt_live");
  assert.match(apiRouteSource, /lastReconciledAt/, "API route must include lastReconciledAt");

  const uiSource = fs.readFileSync(
    path.join(process.cwd(), "components/Tools/AccessibleTransitContent.tsx"),
    "utf8",
  );
  assert.match(uiSource, /即時推播 \(MQTTS\)/, "UI must render 即時推播 (MQTTS) badge");
  assert.match(uiSource, /官方核驗：/, "UI must render 官方核驗 badge");
});
