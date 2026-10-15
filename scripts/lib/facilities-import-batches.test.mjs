import test from "node:test";
import assert from "node:assert/strict";
import { submitFacilityBatches } from "./facilities-import-batches.mjs";

// Issue #677: the residential-network import scripts POST facility records to
// /api/admin/facilities-import. The production host sometimes answers a batch with a
// transient HTML 502/504 (see docs/domains/11-hosting-ops-incidents.md), which aborted
// whole runs before; this helper retries those with back-off. Network and sleep are
// injected so none of this touches the real host.

const SECRET = "test-secret-value-9f3a";
const BASE = "https://health.example.test";

const records = (n) => Array.from({ length: n }, (_, i) => ({ sourceId: `id-${i}`, name: `n${i}` }));

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}
function htmlResponse(status) {
  return { ok: false, status, text: async () => "<html><body>Bad Gateway</body></html>" };
}

function makeHarness(responders) {
  const calls = [];
  const sleeps = [];
  let i = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const next = responders[Math.min(i++, responders.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  };
  const sleepImpl = async (ms) => {
    sleeps.push(ms);
  };
  return { calls, sleeps, fetchImpl, sleepImpl };
}

const base = (h, extra = {}) => ({
  baseUrl: BASE,
  adminSecret: SECRET,
  fetchImpl: h.fetchImpl,
  sleepImpl: h.sleepImpl,
  log: () => {},
  ...extra,
});

test("submitFacilityBatches: a 1,687-row snapshot goes out as ONE request carrying the clean flag", async () => {
  const h = makeHarness([jsonResponse({ ok: true, fetched: 1687, inserted: 1687, updated: 0, deleted: 5 })]);
  const out = await submitFacilityBatches(base(h, { records: records(1687), cleanFacilityType: "police_station" }));
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, `${BASE}/api/admin/facilities-import`);
  assert.equal(h.calls[0].init.method, "POST");
  assert.equal(h.calls[0].init.headers["x-rss-sync-admin-secret"], SECRET);
  assert.equal(h.calls[0].init.headers["content-type"], "application/json");
  assert.equal(h.calls[0].body.records.length, 1687);
  assert.equal(h.calls[0].body.cleanFacilityType, "police_station");
  assert.deepEqual(out, { batches: 1, inserted: 1687, updated: 0, deleted: 5 });
});

test("submitFacilityBatches: with several batches only the first one deletes the old snapshot", async () => {
  const h = makeHarness([jsonResponse({ ok: true, inserted: 2, updated: 0, deleted: 3 }), jsonResponse({ ok: true, inserted: 1, updated: 1 })]);
  const out = await submitFacilityBatches(base(h, { records: records(5), batchSize: 3, cleanFacilityType: "police_station" }));
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].body.cleanFacilityType, "police_station");
  assert.equal(h.calls[1].body.cleanFacilityType, undefined);
  assert.deepEqual(h.calls.map((c) => c.body.records.length), [3, 2]);
  assert.deepEqual(out, { batches: 2, inserted: 3, updated: 1, deleted: 3 });
});

test("submitFacilityBatches: no clean flag when none is asked for", async () => {
  const h = makeHarness([jsonResponse({ ok: true, inserted: 1, updated: 0 })]);
  await submitFacilityBatches(base(h, { records: records(1) }));
  assert.equal("cleanFacilityType" in h.calls[0].body, false);
});

test("submitFacilityBatches: a transient HTML 502 is retried with exponential back-off, then succeeds", async () => {
  const h = makeHarness([htmlResponse(502), htmlResponse(504), jsonResponse({ ok: true, inserted: 1, updated: 0 })]);
  const out = await submitFacilityBatches(base(h, { records: records(1) }));
  assert.equal(h.calls.length, 3);
  assert.deepEqual(h.sleeps, [2000, 4000]);
  assert.equal(out.inserted, 1);
});

test("submitFacilityBatches: a network error is retried too", async () => {
  const h = makeHarness([new Error("socket hang up"), jsonResponse({ ok: true, inserted: 1, updated: 0 })]);
  await submitFacilityBatches(base(h, { records: records(1) }));
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.sleeps, [2000]);
});

test("submitFacilityBatches: gives up after maxRetries and the error never contains the admin secret", async () => {
  const h = makeHarness([htmlResponse(502)]);
  await assert.rejects(
    submitFacilityBatches(base(h, { records: records(1), maxRetries: 2 })),
    (err) => {
      assert.match(err.message, /HTTP 502/);
      assert.ok(!err.message.includes(SECRET));
      return true;
    },
  );
  assert.equal(h.calls.length, 3, "1 try + 2 retries");
});

test("submitFacilityBatches: an application-level failure (JSON ok:false) is NOT retried", async () => {
  const h = makeHarness([jsonResponse({ ok: false, error: "Missing or empty 'records' array" }, 400)]);
  await assert.rejects(submitFacilityBatches(base(h, { records: records(1) })), /Import batch failed: HTTP 400/);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.sleeps, []);
});

test("submitFacilityBatches: refuses an empty record list (nothing to import is a mistake, not a success)", async () => {
  const h = makeHarness([jsonResponse({ ok: true })]);
  await assert.rejects(submitFacilityBatches(base(h, { records: [] })), /no records/i);
  assert.equal(h.calls.length, 0);
});

test("submitFacilityBatches: refuses to run without an admin secret", async () => {
  const h = makeHarness([jsonResponse({ ok: true })]);
  await assert.rejects(submitFacilityBatches({ ...base(h, { records: records(1) }), adminSecret: "" }), /admin secret/i);
  assert.equal(h.calls.length, 0);
});
