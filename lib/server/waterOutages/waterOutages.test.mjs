import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { WATER_OUTAGES_SEED, EMERGENCY_WATER_STATIONS_SEED } = await import(
  "./data/waterOutagesSeed.ts"
);
const { DEBRIS_FLOW_SEED } = await import("../moa/data/debrisFlowSeed.ts");
const { fetchLiveWaterOutages } = await import("./fetchWaterOutages.ts");
const { fetchLiveDebrisFlowAlerts } = await import("../moa/fetchDebrisFlowAlerts.ts");
const { fetchLiveInundationSensors } = await import("../wra/fetchInundationSensorsLive.ts");

test("WATER_OUTAGES_SEED has valid schema and coordinates", () => {
  assert.ok(WATER_OUTAGES_SEED.length >= 3);
  for (const outage of WATER_OUTAGES_SEED) {
    assert.ok(outage.outageId, "Missing outageId");
    assert.ok(outage.title, "Missing title");
    assert.ok(outage.county, "Missing county");
    assert.ok(outage.township, "Missing township");
    assert.ok(["planned", "emergency"].includes(outage.outageType));
    assert.ok(["active", "scheduled", "resolved"].includes(outage.status));
    assert.ok(outage.startTime, "Missing startTime");
    assert.ok(outage.endTime, "Missing endTime");
    assert.ok(outage.affectedHouseholds >= 0);
  }
});

test("EMERGENCY_WATER_STATIONS_SEED has valid coordinates and operating hours", () => {
  assert.ok(EMERGENCY_WATER_STATIONS_SEED.length >= 10);
  for (const st of EMERGENCY_WATER_STATIONS_SEED) {
    assert.ok(st.stationId, "Missing stationId");
    assert.ok(st.name, "Missing name");
    assert.ok(st.address, "Missing address");
    assert.ok(st.lat > 21 && st.lat < 26, `Invalid lat: ${st.lat}`);
    assert.ok(st.lng > 119 && st.lng < 123, `Invalid lng: ${st.lng}`);
    assert.ok(st.operatingHours, "Missing operatingHours");
    assert.ok(["water_tank", "water_truck", "hydrant"].includes(st.waterType));
  }
});

test("DEBRIS_FLOW_SEED has valid alert levels and coordinates", () => {
  assert.ok(DEBRIS_FLOW_SEED.length >= 5);
  for (const df of DEBRIS_FLOW_SEED) {
    assert.ok(df.debrisId, "Missing debrisId");
    assert.ok(df.streamCode, "Missing streamCode");
    assert.ok(["yellow", "red"].includes(df.alertLevel));
    assert.ok(df.lat > 21 && df.lat < 26);
    assert.ok(df.lng > 119 && df.lng < 123);
    assert.ok(df.advisory, "Missing advisory");
  }
});

test("fetchLiveWaterOutages returns robust fallback within timeout", async () => {
  const result = await fetchLiveWaterOutages();
  assert.ok(Array.isArray(result.outages));
  assert.ok(Array.isArray(result.waterStations));
  assert.ok(result.outages.length > 0);
  assert.ok(result.waterStations.length > 0);
});

test("fetchLiveDebrisFlowAlerts returns robust fallback within timeout", async () => {
  const result = await fetchLiveDebrisFlowAlerts();
  assert.ok(Array.isArray(result));
  assert.ok(result.length > 0);
});

test("fetchLiveInundationSensors returns sensors with depth in cm", async () => {
  const result = await fetchLiveInundationSensors();
  assert.ok(Array.isArray(result));
  assert.ok(result.length > 0);
  for (const s of result) {
    assert.ok(typeof s.waterDepthCm === "number");
    assert.ok(["normal", "warning", "critical"].includes(s.alertLevel));
  }
});
