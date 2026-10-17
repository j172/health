// getTdxToken() 與斷路器的接線（auth.ts）：token 請求被拒絕就暫停打 TDX，
// 暫停期間連快取中的 token 都不給（呼叫端走降級路徑），到期後只放一次探測。
// 只替換最外層的 HTTP；憑證用明顯的假值（不是 secret），token 端點永遠不會真的被打。
import test from "node:test";
import assert from "node:assert/strict";
import { registerRepoHooks, stubModule } from "../garbageRoutes/testSupport/repoHooks.mjs";

registerRepoHooks({
  "@/lib/server/net/httpClient": stubModule(`
    export const httpRequest = async (url, options) => globalThis.__tdxAuthTest.respond(url, options);
  `),
});

const { getTdxToken } = await import("./auth.ts");
const { tdxCircuitBreaker } = await import("./circuitBreaker.ts");

const MIN = 60_000;
const savedEnv = {
  TDX_CLIENT_ID: process.env.TDX_CLIENT_ID,
  TDX_APP_ID: process.env.TDX_APP_ID,
  TDX_CLIENT_SECRET: process.env.TDX_CLIENT_SECRET,
  TDX_APP_KEY: process.env.TDX_APP_KEY,
};

const jsonResponse = (status, body) => ({ status, headers: {}, buffer: Buffer.from(typeof body === "string" ? body : JSON.stringify(body)) });
const goodToken = () => jsonResponse(200, { access_token: "fake-token-value", expires_in: 86_400, token_type: "Bearer" });

/** Installs the fake token endpoint; `script` is called once per request and returns a response or throws. */
function setup(t, script) {
  const requests = [];
  globalThis.__tdxAuthTest = {
    respond: async (url, options) => {
      requests.push({ url, method: options?.method });
      return script(requests.length);
    },
  };
  process.env.TDX_CLIENT_ID = "fake-client-id-for-tests";
  process.env.TDX_CLIENT_SECRET = "fake-client-secret-for-tests";
  delete process.env.TDX_APP_ID;
  delete process.env.TDX_APP_KEY;
  t.mock.method(console, "warn", () => {});
  t.mock.timers.enable({ apis: ["Date"], now: 10_000_000 });
  tdxCircuitBreaker.reset();
  t.after(() => {
    tdxCircuitBreaker.reset();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  return requests;
}

// auth.ts keeps a module-level token cache, so the order of these tests matters: every test that
// must reach the token endpoint comes before the one that ends with a valid cached token.

test("no credentials configured: null, and the breaker is not involved", async (t) => {
  const requests = setup(t, () => goodToken());
  delete process.env.TDX_CLIENT_ID;
  assert.equal(await getTdxToken(), null);
  assert.equal(requests.length, 0);
  assert.equal(tdxCircuitBreaker.snapshot().state, "closed");
});

test("a rejected token request (400 invalid_client) opens the breaker, and the next calls do not touch TDX at all", async (t) => {
  const requests = setup(t, () => jsonResponse(400, { error: "invalid_client", error_description: "Invalid client or Invalid client credentials" }));

  assert.equal(await getTdxToken(), null);
  assert.equal(requests.length, 1);
  assert.equal(tdxCircuitBreaker.snapshot().state, "open");
  assert.equal(tdxCircuitBreaker.snapshot().reason, "token_rejected");

  // Every cron tick used to retry the token request; now none reach the network.
  for (let i = 0; i < 5; i++) assert.equal(await getTdxToken(), null);
  assert.equal(requests.length, 1);
});

test("after 15 minutes exactly one probe token request goes out; a second rejection backs off to 30 minutes", async (t) => {
  const requests = setup(t, () => jsonResponse(400, { error: "invalid_client" }));
  assert.equal(await getTdxToken(), null);
  t.mock.timers.tick(15 * MIN - 1);
  assert.equal(await getTdxToken(), null);
  assert.equal(requests.length, 1, "still inside the 15 minute backoff");

  t.mock.timers.tick(1);
  assert.equal(await getTdxToken(), null);
  assert.equal(requests.length, 2, "the probe");
  assert.equal(tdxCircuitBreaker.snapshot().backoffMs, 30 * MIN);

  t.mock.timers.tick(29 * MIN);
  assert.equal(await getTdxToken(), null);
  assert.equal(requests.length, 2, "30 minutes now, not 15");
});

test("a timeout or reset (no HTTP answer at all) is not a rejection: the breaker stays closed and the next tick simply tries again", async (t) => {
  const requests = setup(t, () => {
    throw new Error("socket hang up");
  });
  assert.equal(await getTdxToken(), null);
  assert.equal(tdxCircuitBreaker.snapshot().state, "closed");
  assert.equal(await getTdxToken(), null);
  assert.equal(requests.length, 2);
});

test("a non-JSON 502/429 page from the token endpoint counts as a rejection (the status is what matters)", async (t) => {
  setup(t, () => jsonResponse(429, "<html>Too Many Requests</html>"));
  assert.equal(await getTdxToken(), null);
  assert.equal(tdxCircuitBreaker.snapshot().state, "open");
  assert.equal(tdxCircuitBreaker.snapshot().reason, "rate_limited");
});

test("recovery: a good token after the backoff is returned, and the breaker waits for a real API answer before closing", async (t) => {
  let healthy = false;
  const requests = setup(t, () => (healthy ? goodToken() : jsonResponse(400, { error: "invalid_client" })));
  assert.equal(await getTdxToken(), null);
  healthy = true;
  t.mock.timers.tick(15 * MIN);

  assert.equal(await getTdxToken(), "fake-token-value");
  assert.equal(requests.length, 2);
  assert.equal(tdxCircuitBreaker.snapshot().state, "half_open", "a token proves the credential works, not that the API quota is back");
  assert.equal(tdxCircuitBreaker.isBlocked(), false, "the API call that follows is free to become the probe");
  assert.equal(tdxCircuitBreaker.acquire(), "probe");
  tdxCircuitBreaker.recordSuccess("probe");
  assert.equal(tdxCircuitBreaker.snapshot().state, "closed");
});

test("while the breaker is open even a still-valid cached token is withheld (callers take their degraded path)", async (t) => {
  // The previous test left a valid token in auth.ts's cache.
  const requests = setup(t, () => goodToken());
  assert.equal(await getTdxToken(), "fake-token-value", "valid cache, breaker closed");
  assert.equal(requests.length, 0);

  tdxCircuitBreaker.recordFailure("quota_exceeded", "allowed");
  assert.equal(await getTdxToken(), null);
  assert.equal(requests.length, 0);
});
