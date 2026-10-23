import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  calculateBackoffMs,
  createTdxMqttManager,
  DEFAULT_BASE_BACKOFF_MS,
  DEFAULT_MAX_BACKOFF_MS,
  DEFAULT_TDX_MQTT_BROKER,
} from "../lib/server/tdx/mqtt/connection.ts";

function createMockMqttClient() {
  const emitter = new EventEmitter();
  const client = Object.assign(emitter, {
    options: { reconnectPeriod: DEFAULT_BASE_BACKOFF_MS },
    subscriptions: [],
    subscribe(topics, opts, cb) {
      const list = Array.isArray(topics) ? topics : [topics];
      client.subscriptions.push(...list);
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

test("calculateBackoffMs doubles exponentially and respects the 5s cap", () => {
  assert.equal(calculateBackoffMs(0), 1000);
  assert.equal(calculateBackoffMs(1), 2000);
  assert.equal(calculateBackoffMs(2), 4000);
  assert.equal(calculateBackoffMs(3), 5000); // capped at max (5000)
  assert.equal(calculateBackoffMs(10), 5000);
});

test("returns null and reports configured=false when credentials are not configured", async () => {
  const manager = createTdxMqttManager({});
  const client = await manager.connect();

  assert.equal(client, null);
  const diag = manager.getDiagnostics();
  assert.equal(diag.configured, false);
  assert.equal(diag.status, "disconnected");
  assert.equal(diag.broker, DEFAULT_TDX_MQTT_BROKER);
});

test("enforces singleton connection: concurrent connect() calls share the single client", async () => {
  let factoryCalls = 0;
  let mockClient = null;

  const manager = createTdxMqttManager(
    {
      username: "test_user",
      password: "secret_password_123",
      clientId: "test_client_id",
    },
    {
      clientFactory: () => {
        factoryCalls += 1;
        mockClient = createMockMqttClient();
        return mockClient;
      },
    },
  );

  const c1 = await manager.connect();
  const c2 = await manager.connect();

  assert.equal(factoryCalls, 1, "clientFactory should only be called once");
  assert.equal(c1, c2, "both connect calls must return the identical client");
});

test("tracks lifecycle states and events in diagnostics", async () => {
  let mockClient = null;
  const fixedDate = new Date("2026-10-23T19:30:00.000Z");

  const manager = createTdxMqttManager(
    {
      username: "user_a",
      password: "super_secret_pw",
      clientId: "client_a",
    },
    {
      clientFactory: () => {
        mockClient = createMockMqttClient();
        return mockClient;
      },
      now: () => fixedDate,
    },
  );

  await manager.connect();
  let diag = manager.getDiagnostics();
  assert.equal(diag.status, "connecting");
  assert.equal(diag.configured, true);
  assert.equal(diag.clientId, "client_a");

  // Simulate connect event
  mockClient.emit("connect");
  diag = manager.getDiagnostics();
  assert.equal(diag.status, "connected");
  assert.equal(diag.lastConnectedAt, "2026-10-23T19:30:00.000Z");
  assert.equal(diag.reconnectAttempts, 0);

  // Simulate incoming messages
  mockClient.emit("message", "v2/Rail/Metro/Alert/TRTC", Buffer.from("{}"));
  mockClient.emit("message", "v2/Rail/Metro/Alert/KRTC", Buffer.from("{}"));
  diag = manager.getDiagnostics();
  assert.equal(diag.messagesReceived, 2);

  // Simulate reconnect event
  mockClient.emit("reconnect");
  diag = manager.getDiagnostics();
  assert.equal(diag.status, "reconnecting");
  assert.equal(diag.reconnectAttempts, 1);
  assert.equal(mockClient.options.reconnectPeriod, 2000); // 1st attempt doubled to 2000

  // Simulate close
  mockClient.emit("close");
  diag = manager.getDiagnostics();
  assert.equal(diag.lastDisconnectedAt, "2026-10-23T19:30:00.000Z");
});

test("subscribes to topics and auto-resubscribes active topics upon reconnect", async () => {
  let mockClient = null;

  const manager = createTdxMqttManager(
    {
      username: "user_b",
      password: "pw",
      clientId: "client_b",
    },
    {
      clientFactory: () => {
        mockClient = createMockMqttClient();
        return mockClient;
      },
    },
  );

  await manager.connect();
  mockClient.emit("connect");

  await manager.subscribe(["v2/Rail/Metro/Alert/#", "v3/Rail/TRA/Alert"]);
  let diag = manager.getDiagnostics();
  assert.deepEqual(diag.subscribedTopics.sort(), ["v2/Rail/Metro/Alert/#", "v3/Rail/TRA/Alert"]);

  // Clear mock subscriptions to test auto-resubscribe on reconnect
  mockClient.subscriptions = [];
  mockClient.emit("connect"); // Trigger reconnect event

  assert.deepEqual(mockClient.subscriptions.sort(), ["v2/Rail/Metro/Alert/#", "v3/Rail/TRA/Alert"]);
});

test("security: passwords are never leaked in diagnostics or sanitized error logs", async () => {
  let mockClient = null;
  const SECRET = "SuperConfidentialTdxPass987!";

  const manager = createTdxMqttManager(
    {
      username: "user_c",
      password: SECRET,
      clientId: "client_c",
    },
    {
      clientFactory: () => {
        mockClient = createMockMqttClient();
        return mockClient;
      },
    },
  );

  await manager.connect();

  // Emit an error that embeds the secret password in the error message
  mockClient.emit("error", new Error(`Connection failed with password ${SECRET}`));

  const diag = manager.getDiagnostics();
  const serialized = JSON.stringify(diag);

  assert.ok(!serialized.includes(SECRET), "Serialized diagnostics must NEVER contain plain secret");
  assert.ok(diag.lastError?.includes("[REDACTED]"), "Error message must redact secret");
});

test("disconnect gracefully shuts down the client and resets state", async () => {
  let mockClient = null;

  const manager = createTdxMqttManager(
    {
      username: "user_d",
      password: "pw",
      clientId: "client_d",
    },
    {
      clientFactory: () => {
        mockClient = createMockMqttClient();
        return mockClient;
      },
    },
  );

  await manager.connect();
  mockClient.emit("connect");

  assert.equal(manager.getDiagnostics().status, "connected");

  await manager.disconnect();
  assert.equal(manager.getDiagnostics().status, "disconnected");
  assert.equal(manager.getClient(), null);
});

test("admin status route: protected by requireAdminSecret and wires diagnostics", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const routePath = path.join(process.cwd(), "app/api/admin/tdx-mqtt-status/route.ts");

  assert.ok(fs.existsSync(routePath), "app/api/admin/tdx-mqtt-status/route.ts must exist");
  const src = fs.readFileSync(routePath, "utf8");

  assert.match(src, /requireAdminSecret\(request\)/, "route must require admin secret");
  assert.match(src, /export async function GET/, "route must support GET");
  assert.match(src, /tdxMqttManager\.getDiagnostics\(\)/, "GET handler must return diagnostics");
});

