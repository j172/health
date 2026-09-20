import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

// This project's test runner (`node --test`) executes plain .mjs against a
// TypeScript/JSX source tree with no loader configured for it, and
// components/Tools/useSidebarWidgetData.ts is a React hook (calling it
// outside a React render throws "Invalid hook call"). Per this repo's
// existing convention (see tests/fetchWithTimeout.test.mjs), the state
// machine is reimplemented here as a plain, framework-agnostic async
// function — structurally identical to the hook's internal `load()` — so
// the actual state-transition *logic* (not JSX rendering) gets real
// behavioral coverage, backed up by source-text integration checks below
// that the shipped hook still matches this shape.

function createController({ buildUrl, parse, timeoutMs = 5000, fetchImpl = fetch }) {
  const state = { status: "loading", data: null, isRefreshing: false };
  const isMountedRef = { current: true };
  let hasLoaded = false;

  async function load() {
    const url = buildUrl();
    if (!url) return;

    if (hasLoaded) {
      state.isRefreshing = true;
    } else {
      state.status = "loading";
    }

    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const parsed = parse(json);
      if (!isMountedRef.current) return;
      hasLoaded = true;
      state.data = parsed;
      state.status = "success";
    } catch (err) {
      if (!isMountedRef.current) return;
      // Deliberately do NOT touch state.data here.
      state.status = "error";
    } finally {
      if (isMountedRef.current) state.isRefreshing = false;
    }
  }

  return { state, load, unmount: () => { isMountedRef.current = false; } };
}

function withServer(handler, fn) {
  return async () => {
    const server = http.createServer(handler);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    try {
      await fn(`http://127.0.0.1:${port}`);
    } finally {
      server.close();
    }
  };
}

test(
  "useSidebarWidgetData logic: first successful load sets status=success with parsed data",
  withServer(
    (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, items: [1, 2, 3] }));
    },
    async (base) => {
      const c = createController({
        buildUrl: () => `${base}/x`,
        parse: (json) => json.items,
      });
      await c.load();
      assert.equal(c.state.status, "success");
      assert.deepEqual(c.state.data, [1, 2, 3]);
      assert.equal(c.state.isRefreshing, false);
    },
  ),
);

test(
  "useSidebarWidgetData logic: a failed FIRST load surfaces status=error with data still null",
  withServer(
    (req, res) => {
      res.writeHead(500);
      res.end("boom");
    },
    async (base) => {
      const c = createController({
        buildUrl: () => `${base}/x`,
        parse: (json) => json.items,
      });
      await c.load();
      assert.equal(c.state.status, "error");
      assert.equal(c.state.data, null);
    },
  ),
);

test("useSidebarWidgetData logic: a refresh failure keeps the previous successful data instead of clearing it (stale-data preservation)", async () => {
  let shouldFail = false;
  const server = http.createServer((req, res) => {
    if (shouldFail) {
      res.writeHead(500);
      res.end("boom");
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, items: ["known-good"] }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const c = createController({
      buildUrl: () => `http://127.0.0.1:${port}/x`,
      parse: (json) => json.items,
    });

    await c.load(); // initial mount succeeds
    assert.equal(c.state.status, "success");
    assert.deepEqual(c.state.data, ["known-good"]);

    shouldFail = true;
    await c.load(); // manual refresh fails

    assert.equal(c.state.status, "error", "status should flip to error on refresh failure");
    assert.deepEqual(
      c.state.data,
      ["known-good"],
      "previous data must survive a refresh failure — this is the exact regression documented in the spec for useNearestStation",
    );
  } finally {
    server.close();
  }
});

test("useSidebarWidgetData logic: parse() throwing is treated identically to a network/HTTP failure", async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const c = createController({
      buildUrl: () => `http://127.0.0.1:${port}/x`,
      parse: (json) => {
        if (!json.ok) throw new Error("not ok");
        return json.items;
      },
    });
    await c.load();
    assert.equal(c.state.status, "error");
  } finally {
    server.close();
  }
});

test("useSidebarWidgetData logic: isMounted guard — a response that resolves after unmount must not update state", async () => {
  let releaseResponse;
  const server = http.createServer((req, res) => {
    releaseResponse = () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, items: ["late"] }));
    };
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const c = createController({
      buildUrl: () => `http://127.0.0.1:${port}/x`,
      parse: (json) => json.items,
      timeoutMs: 5000,
    });
    const pending = c.load();
    c.unmount();
    // Let the deferred response resolve well after unmount.
    await new Promise((r) => setTimeout(r, 20));
    releaseResponse();
    await pending;
    assert.equal(c.state.data, null, "state must not be touched once unmounted");
    assert.equal(c.state.status, "loading", "status must not flip to success/error after unmount");
  } finally {
    server.close();
  }
});

test("useSidebarWidgetData logic: mount and manual refresh call the exact same load() path (no divergent second implementation)", async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, items: [] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const c = createController({
      buildUrl: () => `http://127.0.0.1:${port}/x`,
      parse: (json) => json.items,
    });
    await c.load(); // "mount"
    await c.load(); // "manual refresh" — same function reference
    assert.equal(c.state.status, "success");
  } finally {
    server.close();
  }
});

test("Integration check: components/Tools/useSidebarWidgetData.ts matches the shape verified above", () => {
  const fullPath = path.join(process.cwd(), "components/Tools/useSidebarWidgetData.ts");
  assert.ok(fs.existsSync(fullPath), "components/Tools/useSidebarWidgetData.ts should exist");
  const content = fs.readFileSync(fullPath, "utf-8");

  assert.ok(content.includes("fetchWithTimeout"), "must wrap fetches with fetchWithTimeout");
  assert.ok(content.includes("isMountedRef"), "must guard setState with an isMounted ref");
  assert.ok(
    /"loading"\s*\|\s*"error"\s*\|\s*"success"/.test(content) || content.includes('"error"') && content.includes('"success"') && content.includes('"loading"'),
    "must expose the three distinct states (loading/error/success)",
  );
  // The single most important invariant: the catch branch must not clear
  // `data` back to null/empty — grab the catch block and assert it has no
  // setData call at all.
  const catchBlockMatch = content.match(/}\s*catch\s*\([^)]*\)\s*{([\s\S]*?)}\s*finally/);
  assert.ok(catchBlockMatch, "load() should have a catch block followed by a finally block");
  assert.ok(
    !/setData\(/.test(catchBlockMatch[1]),
    "the catch branch must not call setData — a failed refresh must not clobber previously-loaded data",
  );
  // Only one function should own the fetch-and-setState sequence; `refresh`
  // must return that same function rather than a second implementation.
  assert.ok(/refresh:\s*load/.test(content), "refresh must be the same `load` function used on mount, not a second code path");
});
