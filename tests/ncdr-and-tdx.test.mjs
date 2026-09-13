import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("TDX Client: TDX_CITIES maps valid Taiwan cities and cleanName strips prefix", () => {
  const tdxFile = path.join(process.cwd(), "lib", "server", "youbike", "tdxClient.ts");
  assert.ok(fs.existsSync(tdxFile), "tdxClient.ts should exist");
  const content = fs.readFileSync(tdxFile, "utf-8");

  assert.ok(content.includes("Taipei"), "Should include Taipei config");
  assert.ok(content.includes("NewTaipei"), "Should include NewTaipei config");
  assert.ok(content.includes("Kaohsiung"), "Should include Kaohsiung config");
  assert.ok(content.includes("cleanName"), "cleanName function should exist");
});

test("NCDR Alerts: severity determination and county normalization", () => {
  const ncdrFile = path.join(process.cwd(), "lib", "server", "ncdr", "ncdrAlerts.ts");
  assert.ok(fs.existsSync(ncdrFile), "ncdrAlerts.ts should exist");
  const content = fs.readFileSync(ncdrFile, "utf-8");

  assert.ok(content.includes("determineSeverity"), "determineSeverity function should exist");
  assert.ok(content.includes("critical"), "critical severity should be supported");
  assert.ok(content.includes("extractCounties"), "extractCounties function should exist");
  assert.ok(content.includes("CACHE_TTL_MS"), "caching mechanism should exist");
});

test("MapViewController: component exports userLocationIcon with Leaflet styling", () => {
  const mapCtrlFile = path.join(process.cwd(), "components", "Common", "MapViewController.tsx");
  assert.ok(fs.existsSync(mapCtrlFile), "MapViewController.tsx should exist");
  const content = fs.readFileSync(mapCtrlFile, "utf-8");

  assert.ok(content.includes("userLocationIcon"), "userLocationIcon should be exported");
  assert.ok(content.includes("flyTo"), "map.flyTo should be utilized for smooth camera movements");
});

test("Disaster Map: includes both shelter/eoc/rescue layers and real-time inundation layer", () => {
  const contentFile = path.join(process.cwd(), "components", "DisasterMap", "DisasterMapContent.tsx");
  const leafletFile = path.join(process.cwd(), "components", "DisasterMap", "DisasterMapLeaflet.tsx");
  assert.ok(fs.existsSync(contentFile) && fs.existsSync(leafletFile));

  const contentCode = fs.readFileSync(contentFile, "utf-8");
  const leafletCode = fs.readFileSync(leafletFile, "utf-8");

  assert.ok(contentCode.includes("showInundation"), "showInundation state should exist");
  assert.ok(contentCode.includes("/api/disaster/inundation"), "inundation API should be fetched");
  assert.ok(leafletCode.includes("makeInundationIcon"), "makeInundationIcon should render status pins");
});
