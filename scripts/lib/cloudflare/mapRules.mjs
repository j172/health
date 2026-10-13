/**
 * Converts between this repo's zone-settings.json rule shape (flat, our own
 * field names) and the Cloudflare Rulesets API's rule object shape
 * (`ref`/`expression`/`action`/`action_parameters`). Isolating this mapping
 * here keeps scripts/lib/cloudflare/diff.mjs's reconciliation logic free of
 * Cloudflare-specific field names, and lets the mapping itself be unit
 * tested (scripts/lib/cloudflare/mapRules.test.mjs) independently of any
 * network call.
 *
 * ⚠️ Confirmed against Cloudflare's docs during issue #454 (2026-10):
 * phase names (http_request_cache_settings, http_request_firewall_custom,
 * http_ratelimit, http_response_headers_transform, http_request_dynamic_redirect)
 * and the top-level rule fields (ref/expression/action/action_parameters).
 * NOT independently verified against this zone's actual live rules: the
 * exact action_parameters shape for cache rules (edge_ttl/browser_ttl mode)
 * and rate limiting rules (characteristics/period/requests_per_period).
 * The plan workflow's first real run against the live zone is what confirms
 * or corrects these — read its diff output carefully before ever applying.
 */

export const RULESET_PHASES = {
  cacheRules: "http_request_cache_settings",
  wafCustomRules: "http_request_firewall_custom",
  rateLimitingRules: "http_ratelimit",
  responseHeaderTransformRules: "http_response_headers_transform",
  redirectRules: "http_request_dynamic_redirect",
};

export function cacheRuleToCloudflare(rule) {
  const actionParameters = { cache: rule.action === "eligible_for_cache" };
  if (rule.edgeTtlMode === "respect_origin") actionParameters.edge_ttl = { mode: "respect_origin" };
  if (rule.browserTtlMode === "respect_origin") actionParameters.browser_ttl = { mode: "respect_origin" };
  return {
    ref: rule.ref,
    description: rule.description,
    expression: rule.expression,
    action: "set_cache_settings",
    action_parameters: actionParameters,
    enabled: rule.enabled,
  };
}

export function wafCustomRuleToCloudflare(rule) {
  return {
    ref: rule.ref,
    description: rule.description,
    expression: rule.expression,
    action: rule.action,
    enabled: rule.enabled,
  };
}

export function rateLimitingRuleToCloudflare(rule) {
  return {
    ref: rule.ref,
    description: rule.description,
    expression: rule.expression,
    action: rule.action,
    ratelimit: {
      characteristics: ["cf.colo.id", "ip.src"],
      period: rule.periodSeconds,
      requests_per_period: rule.requestsPerPeriod,
      mitigation_timeout: rule.mitigationTimeoutSeconds,
    },
    enabled: rule.enabled,
    // Not a real Cloudflare API field — carried through only so
    // reconcileManagedRules() in diff.mjs (which operates on this
    // already-mapped shape, not the raw zone-settings.json rule) can see it.
    // diff.mjs strips it back out before building the rule list that
    // actually gets PUT to Cloudflare.
    ...(rule.adoptsLiveRuleId ? { adoptsLiveRuleId: rule.adoptsLiveRuleId } : {}),
  };
}

export function responseHeaderTransformRuleToCloudflare(rule) {
  const headers = [];
  for (const [name, value] of Object.entries(rule.setStatic || {})) {
    headers.push({ name, operation: "set", value });
  }
  for (const name of rule.remove || []) {
    headers.push({ name, operation: "remove" });
  }
  return {
    ref: rule.ref,
    description: rule.description,
    expression: rule.expression,
    action: "rewrite",
    action_parameters: { headers },
    enabled: rule.enabled,
  };
}

export function redirectRuleToCloudflare(rule) {
  return {
    ref: rule.ref,
    description: rule.description,
    expression: rule.expression,
    action: "redirect",
    action_parameters: {
      from_value: {
        target_url: { expression: rule.targetUrlExpression },
        status_code: rule.statusCode,
        preserve_query_string: rule.preserveQueryString ?? true,
      },
    },
    enabled: rule.enabled,
  };
}

export const RULE_MAPPERS = {
  cacheRules: cacheRuleToCloudflare,
  wafCustomRules: wafCustomRuleToCloudflare,
  rateLimitingRules: rateLimitingRuleToCloudflare,
  responseHeaderTransformRules: responseHeaderTransformRuleToCloudflare,
  redirectRules: redirectRuleToCloudflare,
};

/** Maps every rule in zone-settings.json's managedRules to Cloudflare's shape, keyed by phase. */
export function mapDesiredManagedRulesToCloudflare(managedRules) {
  const byPhase = {};
  for (const [category, rules] of Object.entries(managedRules)) {
    const mapper = RULE_MAPPERS[category];
    byPhase[category] = rules.map(mapper);
  }
  return byPhase;
}
