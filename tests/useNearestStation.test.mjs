import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

// See tests/useSidebarWidgetData.test.mjs for why hook logic is
// reimplemented as a plain async function rather than invoked directly
// (this .mjs test runner has no React renderer / TS-JSX loader wired up).
//
// This file specifically targets the regression described in
// docs/specs/sidebar-widgets-unified-error-state-refactor.md §1 item 2:
// useNearestStation used to unconditionally run
// `setResolved({ lat, lng, station: null })` on ANY fetch failure —
// including a refresh failure after a station had already been resolved
// successfully — silently wiping out real, already-displayed data.

function createNearestStationController({ endpoint, fetchImpl = fetch }) {
  const state = { station: null, hasError: false, status: "loading" };
  let hasLoaded = false;

  async function load(lat, lng) {
    try {
      const res = await fetchImpl(`${endpoint}?lat=${lat}&lng=${lng}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const station = json?.station ?? null;
      hasLoaded = true;
      state.station = station;
      state.status = "success";
      state.hasError = false;
    } catch (err) {
      // The fix: do NOT overwrite state.station here.
      state.status = "error";
      state.hasError = true;
    }
  }

  return { state, load };
}

test("useNearestStation logic: a successful initial fetch resolves the station", async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ station: { siteId: "A1", siteName: "測站A" } }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const c = createNearestStationController({ endpoint: `http://127.0.0.1:${port}/api/aqi/nearest` });
    await c.load(25.03, 121.56);
    assert.equal(c.state.station.siteId, "A1");
    assert.equal(c.state.hasError, false);
  } finally {
    server.close();
  }
});

test("useNearestStation logic: a refresh failure after a successful fetch PRESERVES the last known-good station (regression fixed by this refactor)", async () => {
  let failNext = false;
  const server = http.createServer((req, res) => {
    if (failNext) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ station: null }));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ station: { siteId: "GOOD", siteName: "已知良好測站" } }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const c = createNearestStationController({ endpoint: `http://127.0.0.1:${port}/api/aqi/nearest` });

    await c.load(25.03, 121.56);
    assert.equal(c.state.station.siteId, "GOOD");

    failNext = true;
    await c.load(25.03, 121.56); // simulate a manual "refresh" click failing

    assert.equal(
      c.state.station?.siteId,
      "GOOD",
      "station must still be the last known-good value, NOT null, after a refresh failure",
    );
    assert.equal(c.state.hasError, true, "the failure must still be surfaced via a flag");
  } finally {
    server.close();
  }
});

test("Integration check: components/Tools/useNearestStation.ts no longer unconditionally nulls out the station on fetch failure, and exposes hasError", () => {
  const fullPath = path.join(process.cwd(), "components/Tools/useNearestStation.ts");
  assert.ok(fs.existsSync(fullPath), "components/Tools/useNearestStation.ts should exist");
  const content = fs.readFileSync(fullPath, "utf-8");

  assert.ok(
    !content.includes("setResolved({ lat: location.lat, lng: location.lng, station: null })"),
    "the old unconditional station-nulling bug must be gone",
  );
  assert.ok(content.includes("hasError"), "must expose a hasError flag so callers can distinguish failure from a genuine empty result");
  assert.ok(
    content.includes("useSidebarWidgetData"),
    "should be built on the shared fetch/state hook rather than a bespoke useEffect",
  );
});

test("Integration check: AqiSidebarWidget/UvSidebarWidget no longer force hasData={true} (which masked failures with hardcoded placeholder data)", () => {
  for (const relPath of ["components/Tools/AqiSidebarWidget.tsx", "components/Tools/UvSidebarWidget.tsx"]) {
    const fullPath = path.join(process.cwd(), relPath);
    assert.ok(fs.existsSync(fullPath), `${relPath} should exist`);
    const content = fs.readFileSync(fullPath, "utf-8");
    assert.ok(!content.includes("hasData={true}"), `${relPath} must not unconditionally force hasData={true}`);
    assert.ok(content.includes("hasError"), `${relPath} must read the hasError flag from useNearestStation`);
  }
});

test("Integration check: app/api/aqi/nearest/route.ts and app/api/uv/nearest/route.ts return a 5xx status on DB error instead of masking it as 200 {station: null}", () => {
  for (const relPath of ["app/api/aqi/nearest/route.ts", "app/api/uv/nearest/route.ts"]) {
    const fullPath = path.join(process.cwd(), relPath);
    assert.ok(fs.existsSync(fullPath), `${relPath} should exist`);
    const content = fs.readFileSync(fullPath, "utf-8");
    const catchBlockMatch = content.match(/}\s*catch\s*\([^)]*\)\s*{([\s\S]*?)\n\s*}/);
    assert.ok(catchBlockMatch, `${relPath} should have a catch block around the DB query`);
    assert.ok(
      /status:\s*500/.test(catchBlockMatch[1]),
      `${relPath}'s catch block must return a 5xx status, matching the pattern in app/api/water-outages/route.ts`,
    );
  }
});
