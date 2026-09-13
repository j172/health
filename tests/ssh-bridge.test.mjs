import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createBridgeServer } from "../scripts/lib/ssh-bridge.mjs";

test("ssh-bridge: GET /healthz returns 200 without invoking ssh", async () => {
  let sshCalled = false;
  const mockSsh = {
    call: () => {
      sshCalled = true;
      return { status: 0, stdout: "200" };
    },
    close: () => {},
  };

  const server = createBridgeServer({ ssh: mockSsh });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true, bridge: true });
    assert.equal(sshCalled, false, "ssh.call should not be invoked for /healthz");
  } finally {
    server.close();
  }
});

test("ssh-bridge: GET request forwards to remote curl and returns response", async () => {
  let executedCommand = "";
  const mockSsh = {
    call: (cmd) => {
      executedCommand = cmd;
      return {
        status: 0,
        stdout: '{"aqi":45,"status":"Good"}\n200',
      };
    },
    close: () => {},
  };

  const server = createBridgeServer({ ssh: mockSsh });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/aqi`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.deepEqual(json, { aqi: 45, status: "Good" });
    assert.ok(executedCommand.includes("http://127.0.0.1:3000/api/aqi"));
    assert.ok(executedCommand.includes("-X GET"));
  } finally {
    server.close();
  }
});

test("ssh-bridge: POST request forwards headers, body, and remote status code", async () => {
  let executedCommand = "";
  let passedInput = "";
  const mockSsh = {
    call: (cmd, opts) => {
      executedCommand = cmd;
      passedInput = opts?.input || "";
      return {
        status: 0,
        stdout: '{"ok":true,"synced":12}\n201',
      };
    },
    close: () => {},
  };

  const server = createBridgeServer({ ssh: mockSsh });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/culture-sync?type=heritage`, {
      method: "POST",
      headers: {
        "x-rss-sync-admin-secret": "test-secret-123",
        "content-type": "application/json",
      },
      body: JSON.stringify({ batch: 1 }),
    });

    assert.equal(res.status, 201);
    const json = await res.json();
    assert.deepEqual(json, { ok: true, synced: 12 });
    assert.ok(executedCommand.includes("http://127.0.0.1:3000/api/admin/culture-sync?type=heritage"));
    assert.ok(executedCommand.includes("-X POST"));
    assert.ok(executedCommand.includes("x-rss-sync-admin-secret: test-secret-123"));
    assert.ok(executedCommand.includes("--data-binary @-"));
    assert.equal(passedInput, JSON.stringify({ batch: 1 }));
  } finally {
    server.close();
  }
});

test("ssh-bridge: handles host LVE saturation exit 255 as 503", async () => {
  const mockSsh = {
    call: () => ({ status: 255, stdout: "" }),
    close: () => {},
  };

  const server = createBridgeServer({ ssh: mockSsh });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/facilities-sync`, { method: "POST" });
    assert.equal(res.status, 503);
    const json = await res.json();
    assert.equal(json.error, "host_lve_saturated_exit_255");
  } finally {
    server.close();
  }
});
