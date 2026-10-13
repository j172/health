import test from "node:test";
import assert from "node:assert/strict";

import {
  cacheRuleToCloudflare,
  wafCustomRuleToCloudflare,
  rateLimitingRuleToCloudflare,
  responseHeaderTransformRuleToCloudflare,
  redirectRuleToCloudflare,
  mapDesiredManagedRulesToCloudflare,
  RULESET_PHASES,
} from "./mapRules.mjs";

test("cacheRuleToCloudflare: maps eligible_for_cache with respect_origin TTLs", () => {
  const cf = cacheRuleToCloudflare({
    ref: "health-repo:x",
    description: "d",
    expression: "true",
    action: "eligible_for_cache",
    edgeTtlMode: "respect_origin",
    browserTtlMode: "respect_origin",
    enabled: true,
  });
  assert.equal(cf.action, "set_cache_settings");
  assert.equal(cf.action_parameters.cache, true);
  assert.deepEqual(cf.action_parameters.edge_ttl, { mode: "respect_origin" });
});

test("cacheRuleToCloudflare: bypass_cache sets cache=false", () => {
  const cf = cacheRuleToCloudflare({
    ref: "health-repo:x",
    description: "d",
    expression: "true",
    action: "bypass_cache",
    enabled: true,
  });
  assert.equal(cf.action_parameters.cache, false);
});

test("wafCustomRuleToCloudflare: passes action through unchanged", () => {
  const cf = wafCustomRuleToCloudflare({
    ref: "health-repo:x",
    description: "d",
    expression: "cf.threat_score ge 15",
    action: "block",
    enabled: true,
  });
  assert.equal(cf.action, "block");
  assert.equal(cf.expression, "cf.threat_score ge 15");
});

test("rateLimitingRuleToCloudflare: builds the ratelimit object", () => {
  const cf = rateLimitingRuleToCloudflare({
    ref: "health-repo:x",
    description: "d",
    expression: "true",
    requestsPerPeriod: 30,
    periodSeconds: 10,
    mitigationTimeoutSeconds: 60,
    action: "managed_challenge",
    enabled: true,
  });
  assert.equal(cf.ratelimit.requests_per_period, 30);
  assert.equal(cf.ratelimit.period, 10);
  assert.equal(cf.ratelimit.mitigation_timeout, 60);
});

test("rateLimitingRuleToCloudflare: carries adoptsLiveRuleId through when present (diff.mjs needs it on the mapped shape it actually reconciles against), omits it entirely when absent", () => {
  const withSentinel = rateLimitingRuleToCloudflare({
    ref: "health-repo:x",
    description: "d",
    expression: "true",
    requestsPerPeriod: 30,
    periodSeconds: 10,
    mitigationTimeoutSeconds: 60,
    action: "block",
    enabled: true,
    adoptsLiveRuleId: "live-id-123",
  });
  assert.equal(withSentinel.adoptsLiveRuleId, "live-id-123");

  const without = rateLimitingRuleToCloudflare({
    ref: "health-repo:x",
    description: "d",
    expression: "true",
    requestsPerPeriod: 30,
    periodSeconds: 10,
    mitigationTimeoutSeconds: 60,
    action: "block",
    enabled: true,
  });
  assert.ok(!("adoptsLiveRuleId" in without));
});

test("responseHeaderTransformRuleToCloudflare: builds set + remove header operations", () => {
  const cf = responseHeaderTransformRuleToCloudflare({
    ref: "health-repo:x",
    description: "d",
    expression: "true",
    setStatic: { "X-Frame-Options": "SAMEORIGIN" },
    remove: ["Server"],
    enabled: true,
  });
  assert.deepEqual(cf.action_parameters.headers, [
    { name: "X-Frame-Options", operation: "set", value: "SAMEORIGIN" },
    { name: "Server", operation: "remove" },
  ]);
});

test("redirectRuleToCloudflare: builds a dynamic redirect action", () => {
  const cf = redirectRuleToCloudflare({
    ref: "health-repo:x",
    description: "d",
    expression: "true",
    targetUrlExpression: 'concat("https://health.j172.tw", http.request.uri.path)',
    statusCode: 301,
    preserveQueryString: true,
    enabled: true,
  });
  assert.equal(cf.action, "redirect");
  assert.equal(cf.action_parameters.from_value.status_code, 301);
});

test("mapDesiredManagedRulesToCloudflare: covers every RULESET_PHASES key", () => {
  const managedRules = {
    cacheRules: [],
    wafCustomRules: [],
    rateLimitingRules: [],
    responseHeaderTransformRules: [],
    redirectRules: [],
  };
  const mapped = mapDesiredManagedRulesToCloudflare(managedRules);
  assert.deepEqual(Object.keys(mapped).sort(), Object.keys(RULESET_PHASES).sort());
});
