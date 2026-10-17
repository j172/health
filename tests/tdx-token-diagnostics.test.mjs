import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Since ~2026-10-15 22:00 UTC the production TDX token request has been
// failing for every consumer, but getTdxToken() only returned null, so the
// logs could not distinguish an over-quota account from a revoked credential
// or a transport problem. These helpers make the failure line say why, without
// ever echoing request secrets or arbitrary response text.
const { describeTokenFailure, nextTokenFailureLogAt, TDX_TOKEN_FAILURE_LOG_INTERVAL_MS } = await import(
  "../lib/server/tdx/tokenDiagnostics.ts"
);

test("describeTokenFailure reports the HTTP status and the OAuth error fields", () => {
  const line = describeTokenFailure(
    400,
    JSON.stringify({ error: "invalid_client", error_description: "Invalid client credentials" }),
  );
  assert.equal(line, "HTTP 400, error=invalid_client, description=Invalid client credentials");
});

test("describeTokenFailure falls back to `message` for gateway-style quota errors", () => {
  const line = describeTokenFailure(429, JSON.stringify({ message: "API rate limit exceeded" }));
  assert.equal(line, "HTTP 429, description=API rate limit exceeded");
});

test("describeTokenFailure never echoes a non-JSON body, only its shape", () => {
  assert.equal(describeTokenFailure(503, "<html><body>secret-looking text</body></html>"), "HTTP 503, html body");
  assert.equal(describeTokenFailure(502, "upstream connect error"), "HTTP 502, non-json body");
  assert.equal(describeTokenFailure(500, ""), "HTTP 500, empty body");
  assert.equal(describeTokenFailure(500, "   \n"), "HTTP 500, empty body");
  assert.equal(describeTokenFailure(500, "null"), "HTTP 500, json body (not an object)");
});

test("describeTokenFailure ignores unrelated JSON fields (so a stray secret field cannot be logged)", () => {
  const line = describeTokenFailure(
    400,
    JSON.stringify({ error: "invalid_request", client_secret: "do-not-log-me", access_token: "nor-this" }),
  );
  assert.equal(line, "HTTP 400, error=invalid_request");
  assert.ok(!line.includes("do-not-log-me") && !line.includes("nor-this"));
});

test("describeTokenFailure clips long fields to a single short line", () => {
  const long = `x ${"y".repeat(500)}\nsecond line`;
  const line = describeTokenFailure(400, JSON.stringify({ error: "e", error_description: long }));
  assert.ok(line.length < 260, `line was ${line.length} chars`);
  assert.ok(!line.includes("\n"));
  assert.ok(line.endsWith("…"));
});

test("nextTokenFailureLogAt allows the first line, then throttles to one per interval", () => {
  const t0 = 1_000_000;
  assert.equal(nextTokenFailureLogAt(0, t0), t0, "first failure is always logged");
  assert.equal(nextTokenFailureLogAt(t0, t0 + 60_000), null, "1 minute later is suppressed");
  assert.equal(nextTokenFailureLogAt(t0, t0 + TDX_TOKEN_FAILURE_LOG_INTERVAL_MS - 1), null);
  assert.equal(
    nextTokenFailureLogAt(t0, t0 + TDX_TOKEN_FAILURE_LOG_INTERVAL_MS),
    t0 + TDX_TOKEN_FAILURE_LOG_INTERVAL_MS,
    "logs again once the interval has elapsed",
  );
});

test("auth.ts wires the diagnostics in and no longer swallows the HTTP status", () => {
  const src = fs.readFileSync(new URL("../lib/server/tdx/auth.ts", import.meta.url), "utf8");
  assert.match(src, /describeTokenFailure\(res\.status, bodyText\)/, "a rejected token request must log its status/body shape");
  assert.match(src, /logTokenFailure\(/);
  // The request form (client_id / client_secret) must never reach a log call.
  const logCalls = src.match(/console\.warn\([^)]*\)/g) ?? [];
  for (const call of logCalls) {
    assert.ok(!/clientSecret|clientId|form\b/.test(call), `log call leaks credentials: ${call}`);
  }
});
