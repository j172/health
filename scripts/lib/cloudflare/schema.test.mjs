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

// ---------------------------------------------------------------------------
// issue #455: 3-category AI-crawler fields (ai_search/ai_user/ai_training)
// and the new non-browser rate-limiting rule.
// ---------------------------------------------------------------------------

test("parseZoneSettingsFile: the repo baseline allows all 3 AI-crawler categories (issue #455)", () => {
  const raw = loadBaselineRaw();
  const parsed = parseZoneSettingsFile(raw);
  assert.equal(parsed.botManagement.aiSearch, "disabled", "Search category must be allowed (not blocked)");
  assert.equal(parsed.botManagement.aiUser, "disabled", "Agent category must be allowed (not blocked)");
  assert.equal(parsed.botManagement.aiTraining, "disabled", "Training category must be allowed (not blocked)");
  assert.equal(
    parsed.botManagement.aiBotsProtection,
    "disabled",
    "the legacy single-toggle field must also be disabled, not left blocking behind the new per-category fields",
  );
});

test("parseZoneSettingsFile: aiSearch/aiUser reject 'disallow' (only aiTraining's API field documents that value)", () => {
  const raw = loadBaselineRaw();
  raw.botManagement.aiSearch = "disallow";
  assert.throws(() => parseZoneSettingsFile(raw), /failed schema validation/);
});

test("parseZoneSettingsFile: aiTraining accepts 'disallow'", () => {
  const raw = loadBaselineRaw();
  raw.botManagement.aiTraining = "disallow";
  assert.doesNotThrow(() => parseZoneSettingsFile(raw));
});

test("parseZoneSettingsFile: aiSearch/aiUser/aiTraining accept null (genuinely unconfirmed, matching the crawlerProtection convention)", () => {
  const raw = loadBaselineRaw();
  raw.botManagement.aiSearch = null;
  raw.botManagement.aiUser = null;
  raw.botManagement.aiTraining = null;
  assert.doesNotThrow(() => parseZoneSettingsFile(raw));
});

test("parseZoneSettingsFile: the repo baseline has a health-repo:limit-bot-traffic rate-limiting rule targeting cf.client.bot (issue #455)", () => {
  const raw = loadBaselineRaw();
  const parsed = parseZoneSettingsFile(raw);
  const rule = parsed.managedRules.rateLimitingRules.find((r) => r.ref === "health-repo:limit-bot-traffic");
  assert.ok(rule, "expected a health-repo:limit-bot-traffic rate-limiting rule");
  assert.equal(rule.expression, "cf.client.bot");
  assert.equal(rule.enabled, true);
  // Must not be a challenge action — a legitimate crawler can't solve a JS
  // challenge, so challenging bot traffic would defeat the point of #455's
  // AI-crawler unblock.
  assert.ok(
    rule.action === "block" || rule.action === "log",
    "action must not be managed_challenge/js_challenge for bot traffic",
  );
});

test("parseZoneSettingsFile: a managed rule's optional note field validates and round-trips", () => {
  const raw = loadBaselineRaw();
  raw.managedRules.rateLimitingRules[0].note = "test note";
  const parsed = parseZoneSettingsFile(raw);
  assert.equal(parsed.managedRules.rateLimitingRules[0].note, "test note");
});
