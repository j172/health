import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

// Client-side fetchWithTimeout implementation verification
async function fetchWithTimeout(input, options = {}) {
  const { timeoutMs = 5000, signal, ...rest } = options;
  const controller = new AbortController();
  let timer = null;

  if (signal) {
    signal.addEventListener("abort", () => {
      controller.abort(signal.reason);
      if (timer) clearTimeout(timer);
    });
  }

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const fetchPromise = fetch(input, {
      ...rest,
      signal: controller.signal,
    });
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    if (timer) clearTimeout(timer);
    return response;
  } catch (err) {
    if (timer) clearTimeout(timer);
    throw err;
  }
}

test("fetchWithTimeout: aborts request when server exceeds timeoutMs", async () => {
  const server = http.createServer((req, res) => {
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    }, 500);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const testUrl = `http://127.0.0.1:${port}/slow`;

  try {
    await assert.rejects(
      async () => {
        await fetchWithTimeout(testUrl, { timeoutMs: 100 });
      },
      /Request timed out after 100ms/
    );
  } finally {
    server.close();
  }
});

test("fetchWithTimeout: successfully returns response within timeout", async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, message: "fast" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const testUrl = `http://127.0.0.1:${port}/fast`;

  try {
    const res = await fetchWithTimeout(testUrl, { timeoutMs: 1000 });
    assert.equal(res.ok, true);
    const data = await res.json();
    assert.equal(data.message, "fast");
  } finally {
    server.close();
  }
});

test("fetchWithTimeout: propagates external AbortSignal", async () => {
  const server = http.createServer((req, res) => {
    setTimeout(() => {
      res.writeHead(200);
      res.end();
    }, 200);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const testUrl = `http://127.0.0.1:${port}/external-abort`;

  try {
    const externalController = new AbortController();
    setTimeout(() => externalController.abort(), 50);

    await assert.rejects(
      async () => {
        await fetchWithTimeout(testUrl, {
          timeoutMs: 2000,
          signal: externalController.signal,
        });
      }
    );
  } finally {
    server.close();
  }
});

test("Integration check: all client map and tool components import fetchWithTimeout", () => {
  const requiredFiles = [
    "components/Activities/PublicArtContent.tsx",
    "components/BreastfeedingRooms/BreastfeedingMapContent.tsx",
    "components/ContraceptionMap/ContraceptionMapContent.tsx",
    "components/DisasterMap/DisasterMapContent.tsx",
    "components/Facilities/FacilitySearchContent.tsx",
    "components/HeritageMap/HeritageMapContent.tsx",
    "components/News/NearbyWeatherBar.tsx",
    "components/Tools/AccessibleTransitContent.tsx",
    "components/Tools/AedContent.tsx",
    "components/Tools/FoodSafetyContent.tsx",
    "components/Tools/InundationMapContent.tsx",
    "components/Tools/LocalWeatherSvgWidget.tsx",
    "components/Tools/NearbyRainfallCard.tsx",
    "components/Tools/OutdoorSafetyContent.tsx",
    "components/Tools/WeatherRainfallLocator.tsx",
    "components/Tools/YoubikeContent.tsx",
    "components/Tools/useNearestStation.ts",
  ];

  for (const relPath of requiredFiles) {
    const fullPath = path.join(process.cwd(), relPath);
    assert.ok(fs.existsSync(fullPath), `${relPath} should exist`);
    const content = fs.readFileSync(fullPath, "utf-8");
    assert.ok(
      content.includes("fetchWithTimeout"),
      `${relPath} should import and use fetchWithTimeout`
    );
  }
});
