import test from "node:test";
import assert from "node:assert/strict";

import {
  isConnectionUnavailableError,
  isBuildPhase,
  executeWithConnectionFallback,
} from "./connectionFallback.mjs";

test("isConnectionUnavailableError identifies all connection-lost error variants", () => {
  const connectionErrorMessages = [
    "connect ECONNREFUSED 127.0.0.1:3306",
    "ETIMEDOUT: connection timed out",
    "getaddrinfo ENOTFOUND mysql.host",
    "EHOSTUNREACH: host is unreachable",
    "read ECONNRESET",
    "Connection lost: The server closed the connection.",
    "connect ECONNREFUSED",
  ];

  for (const msg of connectionErrorMessages) {
    assert.equal(
      isConnectionUnavailableError(new Error(msg)),
      true,
      `expected '${msg}' to be recognized as connection unavailable`,
    );
  }

  assert.equal(
    isConnectionUnavailableError("ECONNREFUSED string error"),
    true,
    "should support non-Error string inputs",
  );
});

test("isConnectionUnavailableError rejects non-connection errors and empty inputs", () => {
  const nonConnectionErrors = [
    new Error("Table 'health.global_earthquakes' doesn't exist"),
    new Error("Unknown column 'extra_json' in 'field list'"),
    new Error("ER_PARSE_ERROR: You have an error in your SQL syntax"),
    new Error("Access denied for user 'j172'@'localhost'"),
    null,
    undefined,
  ];

  for (const err of nonConnectionErrors) {
    assert.equal(
      isConnectionUnavailableError(err),
      false,
      "expected non-connection error to return false",
    );
  }
});

test("isBuildPhase detects NEXT_PHASE and npm build lifecycle, defaults to false at runtime", () => {
  const originalNextPhase = process.env.NEXT_PHASE;
  const originalLifecycle = process.env.npm_lifecycle_event;

  try {
    delete process.env.NEXT_PHASE;
    delete process.env.npm_lifecycle_event;
    assert.equal(isBuildPhase(), false, "should be false when both are unset");

    process.env.NEXT_PHASE = "phase-production-server";
    process.env.npm_lifecycle_event = "start";
    assert.equal(isBuildPhase(), false, "should be false during runtime server phase");

    process.env.NEXT_PHASE = "phase-production-build";
    assert.equal(isBuildPhase(), true, "should be true when NEXT_PHASE is phase-production-build");

    delete process.env.NEXT_PHASE;
    process.env.npm_lifecycle_event = "build";
    assert.equal(isBuildPhase(), true, "should be true when npm_lifecycle_event is build");
  } finally {
    if (originalNextPhase !== undefined) process.env.NEXT_PHASE = originalNextPhase;
    else delete process.env.NEXT_PHASE;
    if (originalLifecycle !== undefined) process.env.npm_lifecycle_event = originalLifecycle;
    else delete process.env.npm_lifecycle_event;
  }
});

test("executeWithConnectionFallback returns runner result on successful connection", async () => {
  const fakeWithConn = async (runner) => runner({ fake: true });
  const result = await executeWithConnectionFallback(
    fakeWithConn,
    ["fallback"],
    async (_conn) => ["real", "data"],
  );

  assert.deepEqual(result, ["real", "data"]);
});

test("executeWithConnectionFallback rethrows non-connection errors in all phases", async () => {
  const originalNextPhase = process.env.NEXT_PHASE;
  const originalLifecycle = process.env.npm_lifecycle_event;

  try {
    const tableMissingError = new Error("Table 'global_earthquakes' doesn't exist");
    const failingWithConn = async () => {
      throw tableMissingError;
    };

    // Build phase
    process.env.NEXT_PHASE = "phase-production-build";
    await assert.rejects(
      async () => executeWithConnectionFallback(failingWithConn, ["fallback"], async () => []),
      /Table 'global_earthquakes' doesn't exist/,
      "build phase must rethrow non-connection errors",
    );

    // Runtime phase
    delete process.env.NEXT_PHASE;
    delete process.env.npm_lifecycle_event;
    await assert.rejects(
      async () => executeWithConnectionFallback(failingWithConn, ["fallback"], async () => []),
      /Table 'global_earthquakes' doesn't exist/,
      "runtime phase must rethrow non-connection errors",
    );
  } finally {
    if (originalNextPhase !== undefined) process.env.NEXT_PHASE = originalNextPhase;
    else delete process.env.NEXT_PHASE;
    if (originalLifecycle !== undefined) process.env.npm_lifecycle_event = originalLifecycle;
    else delete process.env.npm_lifecycle_event;
  }
});

test("executeWithConnectionFallback returns fallbackValue ONLY during build phase", async () => {
  const originalNextPhase = process.env.NEXT_PHASE;
  const originalLifecycle = process.env.npm_lifecycle_event;

  try {
    const connUnavailableError = new Error("connect ECONNREFUSED 127.0.0.1:3306");
    const failingWithConn = async () => {
      throw connUnavailableError;
    };

    // Build phase -> returns fallbackValue
    process.env.NEXT_PHASE = "phase-production-build";
    const buildResult = await executeWithConnectionFallback(
      failingWithConn,
      [{ id: "fallback" }],
      async () => [],
    );
    assert.deepEqual(buildResult, [{ id: "fallback" }], "expected fallback value during build phase");

    // Runtime phase -> rethrows to prevent polluting ISR cache with empty fallback
    delete process.env.NEXT_PHASE;
    delete process.env.npm_lifecycle_event;
    await assert.rejects(
      async () =>
        executeWithConnectionFallback(failingWithConn, [{ id: "fallback" }], async () => []),
      /connect ECONNREFUSED/,
      "runtime phase must rethrow connection-unavailable errors to preserve previous good ISR cache",
    );
  } finally {
    if (originalNextPhase !== undefined) process.env.NEXT_PHASE = originalNextPhase;
    else delete process.env.NEXT_PHASE;
    if (originalLifecycle !== undefined) process.env.npm_lifecycle_event = originalLifecycle;
    else delete process.env.npm_lifecycle_event;
  }
});
