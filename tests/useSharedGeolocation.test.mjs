import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// See tests/useSidebarWidgetData.test.mjs for why hook logic is reimplemented
// here as plain, framework-agnostic functions rather than invoked directly:
// this repo's `node --test` runner has no TS/JSX loader wired up, and
// lib/hooks/useSharedGeolocation.ts is a React hook (calling it outside a
// React render throws "Invalid hook call"). The reimplementation below is
// structurally identical to the shipped module — same timeout-resolution
// algorithm, same session-cache/in-flight-dedup logic, same error-code
// mapping — so the actual *behavior* gets real test coverage, backed up by
// source-text integration checks at the bottom that the shipped file still
// matches this shape.
//
// Context (issue #477, parent #438 §K): the site has ~25 places that each
// call navigator.geolocation directly, and the same "timeout logic doesn't
// wait for the browser's own permission popup to be answered" bug was fixed
// independently in 4 different places (2026-09-09, see
// components/Facilities/useGeolocation.ts's resolveGeolocationTimeout). This
// new shared hook is meant to be the single implementation #478 eventually
// migrates all 25 call sites to — this file verifies it gets the
// permission-timeout race right from the start, reports an explicit
// denied/timeout status instead of silently defaulting to a hardcoded
// coordinate, and caches its result for the browsing session so navigating
// between pages doesn't re-trigger the native permission prompt.

const DECIDED_TIMEOUT_MS = 6000;
const PROMPT_TIMEOUT_MS = 12_000;
const SESSION_KEY = "sharedGeolocation:v1";

async function resolvePermissionAwareTimeout(permissionsApi, decidedTimeoutMs = DECIDED_TIMEOUT_MS, promptTimeoutMs = PROMPT_TIMEOUT_MS) {
  if (!permissionsApi?.query) {
    return { timeoutMs: decidedTimeoutMs, awaitingPermission: false };
  }
  try {
    const status = await permissionsApi.query({ name: "geolocation" });
    return status.state === "prompt"
      ? { timeoutMs: promptTimeoutMs, awaitingPermission: true }
      : { timeoutMs: decidedTimeoutMs, awaitingPermission: false };
  } catch {
    return { timeoutMs: decidedTimeoutMs, awaitingPermission: false };
  }
}

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function createSharedGeolocationController({ geolocation, permissions, storage }) {
  let inFlight = null;

  function readCache() {
    try {
      const raw = storage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.status === "string") return parsed;
    } catch {
      // corrupted cache == no cache
    }
    return null;
  }

  function writeCache(outcome) {
    try {
      storage.setItem(SESSION_KEY, JSON.stringify(outcome));
    } catch {
      // storage write failures must never throw — caching is an optimization
    }
  }

  function requestBrowserLocation(onAwaitingPermission) {
    if (!geolocation) return Promise.resolve({ status: "unsupported" });
    return resolvePermissionAwareTimeout(permissions).then(({ timeoutMs, awaitingPermission }) => {
      onAwaitingPermission(awaitingPermission);
      return new Promise((resolve) => {
        geolocation.getCurrentPosition(
          (pos) => resolve({ status: "success", lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => resolve({ status: err.code === 1 ? "denied" : "timeout" }),
          { timeout: timeoutMs, maximumAge: 0 },
        );
      });
    });
  }

  function resolveSharedLocation({ forceRefresh = false, onAwaitingPermission = () => {} } = {}) {
    if (!forceRefresh) {
      const cached = readCache();
      if (cached) return Promise.resolve(cached);
      if (inFlight) return inFlight;
    }
    const request = requestBrowserLocation(onAwaitingPermission).then((outcome) => {
      writeCache(outcome);
      if (inFlight === request) inFlight = null;
      return outcome;
    });
    inFlight = request;
    return request;
  }

  return { resolveSharedLocation, readCache, writeCache };
}

// --- resolvePermissionAwareTimeout: the permission-popup-timeout-race fix ---

test("resolvePermissionAwareTimeout: Permissions API reporting 'prompt' gets the LONG timeout and awaitingPermission=true (must not regress the 2026-09-09 fix)", async () => {
  const permissions = { query: async () => ({ state: "prompt" }) };
  const result = await resolvePermissionAwareTimeout(permissions);
  assert.equal(result.timeoutMs, PROMPT_TIMEOUT_MS);
  assert.equal(result.awaitingPermission, true);
});

for (const state of ["granted", "denied"]) {
  test(`resolvePermissionAwareTimeout: Permissions API reporting '${state}' gets the SHORT decided timeout and awaitingPermission=false`, async () => {
    const permissions = { query: async () => ({ state }) };
    const result = await resolvePermissionAwareTimeout(permissions);
    assert.equal(result.timeoutMs, DECIDED_TIMEOUT_MS);
    assert.equal(result.awaitingPermission, false);
  });
}

test("resolvePermissionAwareTimeout: falls back to the decided timeout when the Permissions API is unavailable (older Safari)", async () => {
  const result = await resolvePermissionAwareTimeout(undefined);
  assert.equal(result.timeoutMs, DECIDED_TIMEOUT_MS);
  assert.equal(result.awaitingPermission, false);
});

test("resolvePermissionAwareTimeout: falls back to the decided timeout when permissions.query throws", async () => {
  const permissions = { query: async () => { throw new Error("not supported"); } };
  const result = await resolvePermissionAwareTimeout(permissions);
  assert.equal(result.timeoutMs, DECIDED_TIMEOUT_MS);
  assert.equal(result.awaitingPermission, false);
});

// --- resolveSharedLocation: explicit terminal status instead of a silent default ---

test("resolveSharedLocation: a successful fix resolves status=success with coords", async () => {
  const geolocation = {
    getCurrentPosition: (onSuccess) => onSuccess({ coords: { latitude: 24.1, longitude: 120.6 } }),
  };
  const c = createSharedGeolocationController({ geolocation, permissions: undefined, storage: createMemoryStorage() });
  const outcome = await c.resolveSharedLocation();
  assert.deepEqual(outcome, { status: "success", lat: 24.1, lng: 120.6 });
});

test("resolveSharedLocation: PERMISSION_DENIED (code 1) resolves the explicit 'denied' status, not a default coordinate", async () => {
  const geolocation = {
    getCurrentPosition: (_onSuccess, onError) => onError({ code: 1 }),
  };
  const c = createSharedGeolocationController({ geolocation, permissions: undefined, storage: createMemoryStorage() });
  const outcome = await c.resolveSharedLocation();
  assert.equal(outcome.status, "denied");
  assert.equal(outcome.lat, undefined);
  assert.equal(outcome.lng, undefined);
});

test("resolveSharedLocation: TIMEOUT (code 3) resolves the explicit 'timeout' status", async () => {
  const geolocation = {
    getCurrentPosition: (_onSuccess, onError) => onError({ code: 3 }),
  };
  const c = createSharedGeolocationController({ geolocation, permissions: undefined, storage: createMemoryStorage() });
  const outcome = await c.resolveSharedLocation();
  assert.equal(outcome.status, "timeout");
});

test("resolveSharedLocation: POSITION_UNAVAILABLE (code 2) is folded into 'timeout', not 'denied' (only an explicit user refusal is 'denied')", async () => {
  const geolocation = {
    getCurrentPosition: (_onSuccess, onError) => onError({ code: 2 }),
  };
  const c = createSharedGeolocationController({ geolocation, permissions: undefined, storage: createMemoryStorage() });
  const outcome = await c.resolveSharedLocation();
  assert.equal(outcome.status, "timeout");
});

test("resolveSharedLocation: no navigator.geolocation at all resolves 'unsupported' without touching permissions", async () => {
  let permissionsQueried = false;
  const permissions = { query: async () => { permissionsQueried = true; return { state: "granted" }; } };
  const c = createSharedGeolocationController({ geolocation: null, permissions, storage: createMemoryStorage() });
  const outcome = await c.resolveSharedLocation();
  assert.equal(outcome.status, "unsupported");
  assert.equal(permissionsQueried, false);
});

// --- session caching: no repeated permission prompts across "page" mounts ---

test("resolveSharedLocation: a cached session result is reused on a second call WITHOUT calling getCurrentPosition again (no repeated native prompt across pages)", async () => {
  let callCount = 0;
  const geolocation = {
    getCurrentPosition: (onSuccess) => {
      callCount += 1;
      onSuccess({ coords: { latitude: 25.0, longitude: 121.5 } });
    },
  };
  const storage = createMemoryStorage();
  // Simulate page A mounting the hook.
  const pageA = createSharedGeolocationController({ geolocation, permissions: undefined, storage });
  const first = await pageA.resolveSharedLocation();
  assert.equal(first.status, "success");
  assert.equal(callCount, 1);

  // Simulate page B mounting the hook later in the same browsing session —
  // same sessionStorage, a fresh controller instance (new module state, as
  // happens on a full page navigation).
  const pageB = createSharedGeolocationController({ geolocation, permissions: undefined, storage });
  const second = await pageB.resolveSharedLocation();
  assert.deepEqual(second, first, "page B must get the exact cached result");
  assert.equal(callCount, 1, "getCurrentPosition must NOT be called again — this is what prevents a second native permission prompt");
});

test("resolveSharedLocation: a cached DENIED outcome is also reused across pages (denial must not re-prompt either)", async () => {
  let callCount = 0;
  const geolocation = {
    getCurrentPosition: (_onSuccess, onError) => {
      callCount += 1;
      onError({ code: 1 });
    },
  };
  const storage = createMemoryStorage();
  const pageA = createSharedGeolocationController({ geolocation, permissions: undefined, storage });
  await pageA.resolveSharedLocation();
  const pageB = createSharedGeolocationController({ geolocation, permissions: undefined, storage });
  const second = await pageB.resolveSharedLocation();
  assert.equal(second.status, "denied");
  assert.equal(callCount, 1);
});

test("resolveSharedLocation: forceRefresh (explicit user retry) bypasses the cache and is the only path allowed to re-trigger getCurrentPosition", async () => {
  let callCount = 0;
  const geolocation = {
    getCurrentPosition: (onSuccess) => {
      callCount += 1;
      onSuccess({ coords: { latitude: 25.0, longitude: 121.5 } });
    },
  };
  const storage = createMemoryStorage();
  const c = createSharedGeolocationController({ geolocation, permissions: undefined, storage });
  await c.resolveSharedLocation();
  assert.equal(callCount, 1);
  await c.resolveSharedLocation(); // would be cached
  assert.equal(callCount, 1);
  await c.resolveSharedLocation({ forceRefresh: true }); // explicit retry
  assert.equal(callCount, 2, "forceRefresh must bypass the cache and ask again");
});

test("resolveSharedLocation: two concurrent calls (e.g. two widgets on the same page mounting simultaneously) share ONE in-flight request instead of each triggering getCurrentPosition", async () => {
  let callCount = 0;
  let resolvePosition;
  const geolocation = {
    getCurrentPosition: (onSuccess) => {
      callCount += 1;
      resolvePosition = () => onSuccess({ coords: { latitude: 22.6, longitude: 120.3 } });
    },
  };
  const storage = createMemoryStorage();
  const c = createSharedGeolocationController({ geolocation, permissions: undefined, storage });

  const p1 = c.resolveSharedLocation();
  const p2 = c.resolveSharedLocation(); // fires before p1 has resolved/cached anything
  // Let the first request's internal permission-check microtasks run (but
  // not the position callback, which only fires once we call it below).
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(callCount, 1, "a second concurrent caller must not trigger a second getCurrentPosition call");
  resolvePosition();
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.deepEqual(r1, r2);
  assert.equal(r1.status, "success");
});

// --- awaitingPermission: the caller-visible signal for the race-fix ---

test("resolveSharedLocation: invokes onAwaitingPermission(true) while genuinely waiting on an undecided ('prompt') permission, before the outcome resolves", async () => {
  const events = [];
  const permissions = { query: async () => ({ state: "prompt" }) };
  let resolvePosition;
  const geolocation = {
    getCurrentPosition: (onSuccess) => {
      resolvePosition = () => onSuccess({ coords: { latitude: 23.5, longitude: 121.0 } });
    },
  };
  const c = createSharedGeolocationController({ geolocation, permissions, storage: createMemoryStorage() });
  const pending = c.resolveSharedLocation({ onAwaitingPermission: (awaiting) => events.push(awaiting) });
  // Give the permissions.query() microtask a chance to run before the position resolves.
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, [true], "awaitingPermission must fire BEFORE the user answers the native prompt");
  resolvePosition();
  const outcome = await pending;
  assert.equal(outcome.status, "success");
});

test("resolveSharedLocation: invokes onAwaitingPermission(false) when the permission is already decided (granted/denied)", async () => {
  const events = [];
  const permissions = { query: async () => ({ state: "granted" }) };
  const geolocation = {
    getCurrentPosition: (onSuccess) => onSuccess({ coords: { latitude: 23.5, longitude: 121.0 } }),
  };
  const c = createSharedGeolocationController({ geolocation, permissions, storage: createMemoryStorage() });
  await c.resolveSharedLocation({ onAwaitingPermission: (awaiting) => events.push(awaiting) });
  assert.deepEqual(events, [false]);
});

// --- storage resilience ---

test("resolveSharedLocation: a corrupted sessionStorage value is treated as no cache, not a crash", async () => {
  const storage = createMemoryStorage();
  storage.setItem(SESSION_KEY, "{not valid json");
  let callCount = 0;
  const geolocation = {
    getCurrentPosition: (onSuccess) => {
      callCount += 1;
      onSuccess({ coords: { latitude: 25.0, longitude: 121.5 } });
    },
  };
  const c = createSharedGeolocationController({ geolocation, permissions: undefined, storage });
  const outcome = await c.resolveSharedLocation();
  assert.equal(outcome.status, "success");
  assert.equal(callCount, 1);
});

test("resolveSharedLocation: a storage.setItem that throws (private mode / quota) does not reject the outcome", async () => {
  const storage = createMemoryStorage();
  storage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  const geolocation = {
    getCurrentPosition: (onSuccess) => onSuccess({ coords: { latitude: 25.0, longitude: 121.5 } }),
  };
  const c = createSharedGeolocationController({ geolocation, permissions: undefined, storage });
  const outcome = await c.resolveSharedLocation();
  assert.equal(outcome.status, "success");
});

// --- Integration checks against the shipped module ---

test("Integration check: lib/hooks/useSharedGeolocation.ts exists, is a client hook, and exposes the documented shape", () => {
  const fullPath = path.join(process.cwd(), "lib/hooks/useSharedGeolocation.ts");
  assert.ok(fs.existsSync(fullPath), "lib/hooks/useSharedGeolocation.ts should exist");
  const content = fs.readFileSync(fullPath, "utf-8");

  assert.ok(content.startsWith('"use client";'), "must be a client hook");
  assert.ok(content.includes("export function useSharedGeolocation"), "must export the hook");
  assert.ok(content.includes("export async function resolvePermissionAwareTimeout"), "must export the permission-aware timeout resolver");
  assert.ok(content.includes("export function resolveSharedLocation"), "must export the pure location-resolution function");
});

test("Integration check: the permission-popup-timeout-race fix is present (Permissions API 'prompt' gets the long timeout)", () => {
  const content = fs.readFileSync(path.join(process.cwd(), "lib/hooks/useSharedGeolocation.ts"), "utf-8");
  assert.ok(content.includes("DECIDED_TIMEOUT_MS"), "must define the short decided-permission timeout");
  assert.ok(content.includes("PROMPT_TIMEOUT_MS"), "must define the long undecided-permission timeout");
  assert.ok(content.includes('"prompt"'), "must branch on the Permissions API 'prompt' state");
  assert.ok(content.includes("navigator.permissions?.query") || content.includes("navigator.permissions && navigator.permissions.query"), "must probe the Permissions API defensively");
});

test("Integration check: denied/timeout/unsupported are explicit statuses, and the error-code mapping matches (code 1 = denied, everything else = timeout)", () => {
  const content = fs.readFileSync(path.join(process.cwd(), "lib/hooks/useSharedGeolocation.ts"), "utf-8");
  for (const status of ['"denied"', '"timeout"', '"unsupported"', '"success"']) {
    assert.ok(content.includes(status), `must include the explicit status ${status}`);
  }
  assert.ok(content.includes("needsManualSelection"), "must expose needsManualSelection so callers show a manual city/township picker");
  assert.ok(content.includes("err.code === 1"), "must distinguish PERMISSION_DENIED (code 1) from other failure codes");
});

test("Integration check: does NOT silently fall back to a hardcoded default coordinate (the whole point of this hook per #438 §K)", () => {
  const content = fs.readFileSync(path.join(process.cwd(), "lib/hooks/useSharedGeolocation.ts"), "utf-8");
  assert.ok(!content.includes("GEO_DEFAULTS"), "must not reuse the old hook's default-coordinate constant");
  assert.ok(!content.includes("25.033"), "must not hardcode the Taipei 101 default latitude");
  assert.ok(!content.includes("121.5654"), "must not hardcode the Taipei 101 default longitude");
});

test("Integration check: results are cached in sessionStorage so different pages in the same browsing session don't re-trigger the native prompt", () => {
  const content = fs.readFileSync(path.join(process.cwd(), "lib/hooks/useSharedGeolocation.ts"), "utf-8");
  assert.ok(content.includes("sessionStorage"), "must use sessionStorage (per-session, site-wide), not localStorage, for the auto-detected result");
  assert.ok(content.includes("SHARED_GEOLOCATION_SESSION_KEY"), "must expose the cache key as a named constant");
  assert.ok(content.includes("inFlightRequest"), "must de-dupe concurrent requests within a page, not just across pages");
  assert.ok(content.includes("refresh"), "must expose an explicit refresh() escape hatch for a deliberate retry");
});

test("Integration check: does not import from any existing call site / page (this hook must stand on its own, per issue #477)", () => {
  const content = fs.readFileSync(path.join(process.cwd(), "lib/hooks/useSharedGeolocation.ts"), "utf-8");
  assert.ok(!content.includes('from "@/components/'), "must not depend on any existing component or page");
  assert.ok(!content.includes('from "@/app/'), "must not depend on any existing page");
});

// --- `persist: false` (no browser storage at all) — exercised against the REAL shipped module ---
//
// Unlike the controller above (a structurally identical reimplementation), these
// import lib/hooks/useSharedGeolocation.ts itself. It only imports "react", so
// Node's native TS-stripping loader can load it, and resolveSharedLocation is a
// plain function that touches only the `navigator` / `sessionStorage` globals,
// which we stub per test. This is what protects the privacy promise of
// /tools/social-welfare-centers (issue #603: the page must never write browser
// storage), now that the page's geolocation goes through this hook.

function withBrowserGlobals({ geolocation, storage }, fn) {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "navigator", { value: { geolocation }, configurable: true, writable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: storage, configurable: true, writable: true });
  const restore = () => {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
    if (originalSessionStorage) Object.defineProperty(globalThis, "sessionStorage", originalSessionStorage);
    else delete globalThis.sessionStorage;
  };
  return Promise.resolve(fn()).finally(restore);
}

function createSpyStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  const calls = { getItem: 0, setItem: 0, removeItem: 0 };
  return {
    calls,
    snapshot: () => Object.fromEntries(map),
    getItem: (k) => {
      calls.getItem += 1;
      return map.has(k) ? map.get(k) : null;
    },
    setItem: (k, v) => {
      calls.setItem += 1;
      map.set(k, v);
    },
    removeItem: (k) => {
      calls.removeItem += 1;
      map.delete(k);
    },
  };
}

const sharedHookModule = await import("../lib/hooks/useSharedGeolocation.ts");

test("real module: resolveSharedLocation({ persist: false }) never reads, writes or clears sessionStorage — and ignores an existing cached result", async () => {
  const staleCache = JSON.stringify({ status: "success", lat: 1, lng: 2 });
  const storage = createSpyStorage({ [sharedHookModule.SHARED_GEOLOCATION_SESSION_KEY]: staleCache });
  let getCurrentPositionCalls = 0;
  const geolocation = {
    getCurrentPosition: (onSuccess) => {
      getCurrentPositionCalls += 1;
      onSuccess({ coords: { latitude: 24.1, longitude: 120.6 } });
    },
  };
  sharedHookModule.__resetSharedGeolocationModuleStateForTests();
  const outcome = await withBrowserGlobals({ geolocation, storage }, () =>
    sharedHookModule.resolveSharedLocation({ persist: false }),
  );
  assert.deepEqual(outcome, { status: "success", lat: 24.1, lng: 120.6 }, "must use the fresh browser fix, not the stale cache");
  assert.equal(getCurrentPositionCalls, 1);
  assert.deepEqual(storage.calls, { getItem: 0, setItem: 0, removeItem: 0 }, "persist:false must not touch browser storage in any way");
  assert.equal(storage.snapshot()[sharedHookModule.SHARED_GEOLOCATION_SESSION_KEY], staleCache, "the existing cache entry must be left exactly as it was");
});

test("real module: persist:false still reports explicit denied / timeout / unsupported statuses without touching storage", async () => {
  for (const [label, geolocation, expected] of [
    ["denied", { getCurrentPosition: (_ok, onError) => onError({ code: 1 }) }, "denied"],
    ["timeout", { getCurrentPosition: (_ok, onError) => onError({ code: 3 }) }, "timeout"],
    ["unsupported", undefined, "unsupported"],
  ]) {
    const storage = createSpyStorage();
    sharedHookModule.__resetSharedGeolocationModuleStateForTests();
    const outcome = await withBrowserGlobals({ geolocation, storage }, () =>
      sharedHookModule.resolveSharedLocation({ persist: false }),
    );
    assert.equal(outcome.status, expected, label);
    assert.deepEqual(storage.calls, { getItem: 0, setItem: 0, removeItem: 0 }, `${label}: no storage access`);
  }
});

test("real module: the default (persist unset) still caches the outcome in sessionStorage — persist:false must not have changed the shared default", async () => {
  const storage = createSpyStorage();
  const geolocation = {
    getCurrentPosition: (onSuccess) => onSuccess({ coords: { latitude: 25.0, longitude: 121.5 } }),
  };
  sharedHookModule.__resetSharedGeolocationModuleStateForTests();
  await withBrowserGlobals({ geolocation, storage }, () => sharedHookModule.resolveSharedLocation());
  assert.equal(storage.calls.setItem, 1);
  assert.deepEqual(JSON.parse(storage.snapshot()[sharedHookModule.SHARED_GEOLOCATION_SESSION_KEY]), {
    status: "success",
    lat: 25.0,
    lng: 121.5,
  });
});

test("Integration check: useSharedGeolocation exposes `skip` and `persist` options, and persist:false also skips the cache read in run() and the cache clear in refresh()", () => {
  const content = fs.readFileSync(path.join(process.cwd(), "lib/hooks/useSharedGeolocation.ts"), "utf-8");
  assert.ok(/skip\?:\s*boolean/.test(content), "must expose the skip option (deep-link coordinate override, issue #478)");
  assert.ok(/persist\?:\s*boolean/.test(content), "must expose the persist option (no browser storage, issue #603)");
  assert.ok(/if \(persist && !forceRefresh\)/.test(content), "run() must only read the session cache when persist is true");
  assert.ok(/if \(persist\) clearSessionCache\(\);/.test(content), "refresh() must only clear the session cache when persist is true");
  assert.ok(/if \(!persist\) return requestBrowserLocation\(onAwaitingPermission\);/.test(content), "resolveSharedLocation must bypass cache read/write and in-flight sharing when persist is false");
});

test("Integration check: the permission-aware timeout constants are unchanged (persist/skip must not alter timeout semantics)", () => {
  const content = fs.readFileSync(path.join(process.cwd(), "lib/hooks/useSharedGeolocation.ts"), "utf-8");
  assert.ok(/export const DECIDED_TIMEOUT_MS = 6000;/.test(content));
  assert.ok(/export const PROMPT_TIMEOUT_MS = 12_000;/.test(content));
});
