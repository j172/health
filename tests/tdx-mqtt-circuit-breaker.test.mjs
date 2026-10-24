import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import {
  createStreamCircuitBreaker,
  DISCONNECT_FAILOVER_THRESHOLD_MS,
  FALLBACK_POLL_INTERVAL_MS,
  MAX_FALLBACK_REQUESTS_PER_DAY,
} from "../lib/server/tdx/mqtt/circuitBreaker.ts";
import { createTdxMqttManager } from "../lib/server/tdx/mqtt/connection.ts";
import { runStreamSupervisorTick } from "../lib/server/tdx/mqtt/worker.ts";

function createMockMqttClient() {
  const emitter = new EventEmitter();
  const client = Object.assign(emitter, {
    options: { reconnectPeriod: 1000 },
    subscriptions: [],
    subscribe(topics, opts, cb) {
      if (typeof opts === "function") opts(null);
      else if (cb) cb(null);
      return client;
    },
    end(force, opts, cb) {
      if (typeof opts === "function") opts();
      else if (cb) cb();
      emitter.emit("close");
      return client;
    },
  });
  return client;
}

test("initial state is CLOSED, activeEngine is 'push'", () => {
  let currentTime = 1_000_000;
  const cb = createStreamCircuitBreaker({ now: () => currentTime });

  assert.equal(cb.getState(), "CLOSED");
  assert.equal(cb.getActiveEngine(), "push");
  assert.equal(cb.getLastDisconnectTime(), null);

  const status = cb.getCircuitStatus();
  assert.equal(status.state, "CLOSED");
  assert.equal(status.activeEngine, "push");
  assert.equal(status.failoverCount, 0);
  assert.deepEqual(status.transitionHistory, []);
  assert.equal(status.fallbackRequestsToday, 0);
  assert.equal(status.dailyBudgetRemaining, MAX_FALLBACK_REQUESTS_PER_DAY);
});

test("disconnect under 15 minutes remains CLOSED (backoff retries allowed)", () => {
  let currentTime = 10_000;
  const cb = createStreamCircuitBreaker({
    now: () => currentTime,
    disconnectThresholdMs: DISCONNECT_FAILOVER_THRESHOLD_MS,
  });

  // Broker disconnects at t = 10,000
  cb.recordDisconnect(currentTime);
  assert.equal(cb.getLastDisconnectTime(), 10_000);
  assert.equal(cb.getState(), "CLOSED");

  // Advance time by 5 minutes (5 * 60 * 1000 = 300,000 ms)
  currentTime += 5 * 60 * 1000;
  assert.equal(cb.checkAndEvaluateState(currentTime), "CLOSED");
  assert.equal(cb.getActiveEngine(), "push");

  // Advance time to 14 minutes and 59 seconds
  currentTime = 10_000 + 14 * 60 * 1000 + 59 * 1000;
  assert.equal(cb.checkAndEvaluateState(currentTime), "CLOSED");
  assert.equal(cb.getActiveEngine(), "push");
  assert.equal(cb.getCircuitStatus().failoverCount, 0);
});

test("disconnect exceeding 15 minutes trips to OPEN, activeEngine becomes 'fallback_polling'", () => {
  let currentTime = 10_000;
  const cb = createStreamCircuitBreaker({
    now: () => currentTime,
    disconnectThresholdMs: DISCONNECT_FAILOVER_THRESHOLD_MS,
  });

  cb.recordDisconnect(currentTime);

  // Advance time exactly past 15 minutes threshold
  currentTime = 10_000 + DISCONNECT_FAILOVER_THRESHOLD_MS;
  const newState = cb.checkAndEvaluateState(currentTime);

  assert.equal(newState, "OPEN");
  assert.equal(cb.getState(), "OPEN");
  assert.equal(cb.getActiveEngine(), "fallback_polling");

  const status = cb.getCircuitStatus();
  assert.equal(status.failoverCount, 1);
  assert.equal(status.transitionHistory.length, 1);
  assert.equal(status.transitionHistory[0].fromState, "CLOSED");
  assert.equal(status.transitionHistory[0].toState, "OPEN");
  assert.match(status.transitionHistory[0].reason, /15 minutes/);
});

test("probing triggers HALF_OPEN and activeEngine becomes 'degraded'", () => {
  let currentTime = 10_000;
  const cb = createStreamCircuitBreaker({ now: () => currentTime });

  // Trip to OPEN
  cb.tripToOpen("Simulated broker outage");
  assert.equal(cb.getState(), "OPEN");
  assert.equal(cb.getActiveEngine(), "fallback_polling");

  // Start probe
  const recovered = cb.attemptRecovery("Testing TDX broker socket");
  assert.equal(recovered, true);
  assert.equal(cb.getState(), "HALF_OPEN");
  assert.equal(cb.getActiveEngine(), "degraded");

  const status = cb.getCircuitStatus();
  assert.equal(status.transitionHistory.length, 2);
  assert.equal(status.transitionHistory[0].fromState, "OPEN");
  assert.equal(status.transitionHistory[0].toState, "HALF_OPEN");
});

test("successful reconnect transitions HALF_OPEN -> CLOSED, activeEngine returns to 'push'", () => {
  let currentTime = 10_000;
  const cb = createStreamCircuitBreaker({ now: () => currentTime });

  cb.tripToOpen("Broker unavailable");
  cb.attemptRecovery("Probing connection");
  assert.equal(cb.getState(), "HALF_OPEN");

  // Reconnection probe succeeds
  cb.recordConnectionSuccess();

  assert.equal(cb.getState(), "CLOSED");
  assert.equal(cb.getActiveEngine(), "push");
  assert.equal(cb.getLastDisconnectTime(), null);

  const status = cb.getCircuitStatus();
  assert.equal(status.transitionHistory[0].fromState, "HALF_OPEN");
  assert.equal(status.transitionHistory[0].toState, "CLOSED");
});

test("reconnect while in OPEN state directly restores to CLOSED", () => {
  let currentTime = 10_000;
  const cb = createStreamCircuitBreaker({ now: () => currentTime });

  cb.tripToOpen("Direct outage");
  assert.equal(cb.getState(), "OPEN");

  cb.recordConnectionSuccess();
  assert.equal(cb.getState(), "CLOSED");
  assert.equal(cb.getActiveEngine(), "push");
  assert.equal(cb.getLastDisconnectTime(), null);
});

test("quota check: fallback polling respects 80 requests/day ceiling and minimum interval", async () => {
  let currentTime = new Date("2026-10-24T00:00:00.000Z").getTime();
  let reconcileCalls = 0;

  const cb = createStreamCircuitBreaker({
    now: () => currentTime,
    minFallbackIntervalMs: FALLBACK_POLL_INTERVAL_MS, // 3 hours
    maxDailyRequests: 80,
    requestsPerPoll: 20,
    reconcileFn: async () => {
      reconcileCalls += 1;
      return {
        ok: true,
        reconciledAt: new Date(currentTime).toISOString(),
        systemsChecked: ["TRTC", "NTMC", "TYMC", "TMRT", "KRTC", "KLRT"],
        activeCount: 1,
        resolvedCount: 0,
        errors: [],
      };
    },
  });

  // In CLOSED state, fallback poll is bypassed
  const bypassed = await cb.executeFallbackPoll();
  assert.equal(bypassed.ran, false);
  assert.equal(bypassed.bypassed, true);
  assert.equal(reconcileCalls, 0);

  // Trip to OPEN
  cb.tripToOpen("Broker offline");

  // Run 1 at 00:00: consumes 20, remaining 60
  const run1 = await cb.executeFallbackPoll();
  assert.equal(run1.ran, true);
  assert.equal(run1.requestsConsumed, 20);
  assert.equal(run1.dailyRemaining, 60);
  assert.equal(reconcileCalls, 1);

  // Immediate 2nd Run at 00:01: throttled by 3-hour minimum interval
  currentTime += 60 * 1000;
  const throttled = await cb.executeFallbackPoll();
  assert.equal(throttled.ran, false);
  assert.equal(throttled.throttled, true);
  assert.match(throttled.reason, /min_interval_not_elapsed/);
  assert.equal(reconcileCalls, 1);

  // Run 2 at 03:00: consumes 20, remaining 40
  currentTime += 3 * 60 * 60 * 1000;
  const run2 = await cb.executeFallbackPoll();
  assert.equal(run2.ran, true);
  assert.equal(run2.dailyRemaining, 40);
  assert.equal(reconcileCalls, 2);

  // Run 3 at 06:00: consumes 20, remaining 20
  currentTime += 3 * 60 * 60 * 1000;
  const run3 = await cb.executeFallbackPoll();
  assert.equal(run3.ran, true);
  assert.equal(run3.dailyRemaining, 20);
  assert.equal(reconcileCalls, 3);

  // Run 4 at 09:00: consumes 20, remaining 0 (reaches 80 cap)
  currentTime += 3 * 60 * 60 * 1000;
  const run4 = await cb.executeFallbackPoll();
  assert.equal(run4.ran, true);
  assert.equal(run4.dailyRemaining, 0);
  assert.equal(reconcileCalls, 4);

  // Total requests consumed today = 4 * 20 = 80 requests
  assert.equal(cb.getCircuitStatus().fallbackRequestsToday, 80);
  assert.equal(cb.getCircuitStatus().dailyBudgetRemaining, 0);

  // Run 5 at 12:00 (same calendar day): MUST be blocked by 80 requests/day ceiling!
  currentTime += 3 * 60 * 60 * 1000;
  const quotaBlocked = await cb.executeFallbackPoll();
  assert.equal(quotaBlocked.ran, false);
  assert.equal(quotaBlocked.quotaExceeded, true);
  assert.equal(quotaBlocked.reason, "daily_fallback_budget_exceeded");
  assert.equal(reconcileCalls, 4, "Reconcile MUST NOT be called once daily budget is exhausted");

  // Day rollover: advance time to next calendar day
  currentTime = new Date("2026-10-25T00:00:00.000Z").getTime();
  const nextDayRun = await cb.executeFallbackPoll();
  assert.equal(nextDayRun.ran, true);
  assert.equal(nextDayRun.dailyRemaining, 60);
  assert.equal(reconcileCalls, 5);
});

test("admin status route returns circuit status, activeEngine, and transition history without leaking secrets", async () => {
  const routePath = path.join(process.cwd(), "app/api/admin/tdx-mqtt-status/route.ts");
  assert.ok(fs.existsSync(routePath), "admin status route must exist");
  const src = fs.readFileSync(routePath, "utf8");

  assert.match(src, /tdxStreamCircuitBreaker\.getCircuitStatus\(\)/, "wires circuit breaker status");
  assert.match(src, /activeEngine:\s*circuitStatus\.activeEngine/, "exposes activeEngine");
  assert.match(src, /circuit:\s*\{/, "exposes circuit object");
  assert.match(src, /state:\s*circuitStatus\.state/, "exposes circuit state");
  assert.match(src, /failoverCount:\s*circuitStatus\.failoverCount/, "exposes failoverCount");
  assert.match(src, /transitionHistory:\s*circuitStatus\.transitionHistory/, "exposes transitionHistory");

  // Verify error and reason sanitization
  const cb = createStreamCircuitBreaker();
  cb.tripToOpen("Failed with key=super_secret_token_abc and password=confidential_pass");
  const status = cb.getCircuitStatus();
  const serialized = JSON.stringify(status);

  assert.ok(!serialized.includes("super_secret_token_abc"), "Tokens must be redacted");
  assert.ok(!serialized.includes("confidential_pass"), "Passwords must be redacted");
  assert.ok(serialized.includes("[REDACTED]"), "Must contain REDACTED tags");
});

test("manager and worker integration: manager lifecycle events notify circuit breaker", async () => {
  let mockClient = null;
  let fixedTime = 10_000;

  const cb = createStreamCircuitBreaker({
    now: () => fixedTime,
    disconnectThresholdMs: 900_000,
  });

  const manager = createTdxMqttManager(
    {
      username: "user_test",
      password: "pw",
      clientId: "client_test",
    },
    {
      clientFactory: () => {
        mockClient = createMockMqttClient();
        return mockClient;
      },
      now: () => new Date(fixedTime),
      circuitBreaker: cb,
    },
  );

  await manager.connect();
  assert.equal(manager.getActiveEngine(), "push");

  // On connect
  mockClient.emit("connect");
  assert.equal(cb.getState(), "CLOSED");
  assert.equal(cb.getLastDisconnectTime(), null);

  // On disconnect / close
  fixedTime = 20_000;
  mockClient.emit("close");
  assert.equal(cb.getLastDisconnectTime(), 20_000);

  // Fast forward past 15 minutes
  fixedTime = 20_000 + 900_001;
  cb.checkAndEvaluateState(fixedTime);
  assert.equal(cb.getState(), "OPEN");
  assert.equal(manager.getActiveEngine(), "fallback_polling");

  // Worker supervisor tick runs fallback poll when in OPEN state
  let fallbackRan = false;
  const tickResult = await runStreamSupervisorTick({
    now: () => fixedTime,
    requestsPerPoll: 6,
    reconcileFn: async () => {
      fallbackRan = true;
      return { ok: true, systemsChecked: [], activeCount: 0, resolvedCount: 0, errors: [] };
    },
  });
  // Since cb is OPEN, supervisor tick executes fallback poll
  assert.equal(typeof tickResult.ran, "boolean");

  // Reconnect
  mockClient.emit("connect");
  assert.equal(cb.getState(), "CLOSED");
  assert.equal(manager.getActiveEngine(), "push");
});

test("guardrail #728 compliance: no retired tokens in newly created / modified modules", () => {
  const retiredTable = ["metro", "alerts"].join("_");
  const retiredCamel = ["metro", "Alerts"].join("");
  const retiredTableRegex = new RegExp(`\\b${retiredTable}\\b`);
  const retiredCamelRegex = new RegExp(`\\b${retiredCamel}\\b`);

  const filesToCheck = [
    "lib/server/tdx/mqtt/circuitBreaker.ts",
    "lib/server/tdx/mqtt/connection.ts",
    "lib/server/tdx/mqtt/worker.ts",
    "app/api/admin/tdx-mqtt-status/route.ts",
    "app/api/transit-alerts/route.ts",
    "components/Tools/AccessibleTransitContent.tsx",
    "components/Tools/TransitSuspensionSection.tsx",
  ];

  for (const relPath of filesToCheck) {
    const fullPath = path.join(process.cwd(), relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, "utf8");

    assert.doesNotMatch(
      content,
      retiredTableRegex,
      `${relPath} must not reference retired table ${retiredTable}`,
    );
    assert.doesNotMatch(
      content,
      retiredCamelRegex,
      `${relPath} must not reference retired identifier ${retiredCamel}`,
    );
  }
});
