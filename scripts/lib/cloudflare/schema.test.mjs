import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseZoneSettingsFile } from "./schema.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SETTINGS_FILE = path.join(REPO_ROOT, "config", "cloudflare", "zone-settings.json");

function loadBaselineRaw() {
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
}

test("parseZoneSettingsFile: the actual repo baseline file validates cleanly", () => {
  const raw = loadBaselineRaw();
  const parsed = parseZoneSettingsFile(raw);
  assert.equal(parsed._meta.zone, "j172.tw");
  assert.equal(parsed._meta.primaryHost, "health.j172.tw");
});

test("parseZoneSettingsFile: rejects a missing required field", () => {
  const raw = loadBaselineRaw();
  delete raw.zoneSettings.ssl;
  assert.throws(() => parseZoneSettingsFile(raw), /failed schema validation/);
});

test("parseZoneSettingsFile: rejects an invalid enum value", () => {
  const raw = loadBaselineRaw();
  raw.zoneSettings.ssl = "not-a-real-mode";
  assert.throws(() => parseZoneSettingsFile(raw), /failed schema validation/);
});

test("parseZoneSettingsFile: rejects a managed rule ref not prefixed health-repo:", () => {
  const raw = loadBaselineRaw();
  raw.managedRules.wafCustomRules[0].ref = "some-other-ref";
  assert.throws(() => parseZoneSettingsFile(raw), /failed schema validation/);
});

test("parseZoneSettingsFile: rejects duplicate refs within the same rule list", () => {
  const raw = loadBaselineRaw();
  const [first] = raw.managedRules.cacheRules;
  raw.managedRules.cacheRules.push({ ...first, ref: first.ref });
  assert.throws(() => parseZoneSettingsFile(raw), /duplicate ref/);
});

test("parseZoneSettingsFile: allows the same ref to repeat across different rule lists", () => {
  const raw = loadBaselineRaw();
  // cacheRules and wafCustomRules are reconciled against different live
  // Cloudflare ruleset phases, so reusing a ref across categories is fine —
  // only within-category duplicates are ambiguous.
  raw.managedRules.wafCustomRules[0].ref = raw.managedRules.cacheRules[0].ref;
  assert.doesNotThrow(() => parseZoneSettingsFile(raw));
});

test("parseZoneSettingsFile: documentedUnmanagedRules carries the known SemrushBot/AhrefsBot block", () => {
  const raw = loadBaselineRaw();
  const parsed = parseZoneSettingsFile(raw);
  const known = parsed.documentedUnmanagedRules.find(
    (r) => r.liveRuleId === "375d8e07c0c442caba42a540eb3b9069",
  );
  assert.ok(known, "expected the documented SemrushBot/AhrefsBot WAF rule to be present");
  assert.equal(known.phase, "http_request_firewall_custom");
});
