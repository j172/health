/**
 * Thin Cloudflare REST API client for the zone config-as-code flow (issue
 * #454). This runs only inside GitHub Actions runners (via
 * cloudflare-zone-plan.yml / cloudflare-zone-apply.yml), never on the
 * production host's own Node process — so, unlike lib/server/net/httpClient.ts,
 * using the global fetch()/undici is fine here (that restriction is specific
 * to the shared host's low virtual-memory cap; a GitHub Actions runner has
 * no such constraint, and several existing scripts/*.mjs already call fetch()
 * directly for the same reason).
 *
 * Every read function here is also used by the (read-only) plan script.
 * Every write function is used ONLY by the apply script, and the apply
 * script is the only thing in this repo that ever calls one.
 */

const API_BASE = "https://api.cloudflare.com/client/v4";

export class CloudflareApiError extends Error {
  constructor(message, { status, body }) {
    super(message);
    this.name = "CloudflareApiError";
    this.status = status;
    this.body = body;
  }
}

function createClient({ apiToken, zoneId }) {
  if (!apiToken) throw new Error("Missing CLOUDFLARE_API_TOKEN");
  if (!zoneId) throw new Error("Missing CLOUDFLARE_ZONE_ID");

  async function request(method, path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      throw new CloudflareApiError(
        `Cloudflare API ${method} ${path} failed with HTTP ${res.status}`,
        { status: res.status, body: json },
      );
    }
    return json.result;
  }

  return {
    // --- reads (used by plan and apply) ---

    async getZoneSettings() {
      const settings = await request("GET", `/zones/${zoneId}/settings`);
      const flat = {};
      for (const s of settings) flat[s.id] = s.value;
      return flat;
    },

    async getTieredCacheSmartTopology() {
      const result = await request("GET", `/zones/${zoneId}/cache/tiered_cache_smart_topology_enable`);
      return result.value;
    },

    async getCrawlerHints() {
      const result = await request("GET", `/zones/${zoneId}/cache/crawler_hints`);
      return result.value === "on";
    },

    async getBotManagement() {
      return request("GET", `/zones/${zoneId}/bot_management`);
    },

    /** @param {string} phase - e.g. "http_request_firewall_custom" */
    async getRulesetPhase(phase) {
      try {
        const ruleset = await request("GET", `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`);
        return ruleset.rules || [];
      } catch (err) {
        // Cloudflare returns 404 when a phase has no entrypoint ruleset yet
        // (nothing has ever been added to it) — that's a legitimate "empty",
        // not an error.
        if (err instanceof CloudflareApiError && err.status === 404) return [];
        throw err;
      }
    },

    // --- writes (used ONLY by the apply script) ---

    /** Narrow, non-destructive: PATCHes one named setting at a time. */
    async patchZoneSetting(settingId, value) {
      return request("PATCH", `/zones/${zoneId}/settings/${settingId}`, { value });
    },

    async setTieredCacheSmartTopology(value) {
      return request("PATCH", `/zones/${zoneId}/cache/tiered_cache_smart_topology_enable`, { value });
    },

    async setCrawlerHints(enabled) {
      return request("PATCH", `/zones/${zoneId}/cache/crawler_hints`, { value: enabled ? "on" : "off" });
    },

    /**
     * bot_management is a single object resource — the API has no partial
     * PATCH, so the caller MUST pass the full merged object (live config
     * overlaid with only the fields this file manages), never a bare
     * subset, or unrelated live fields would be reset to Cloudflare defaults.
     */
    async putBotManagement(fullConfig) {
      return request("PUT", `/zones/${zoneId}/bot_management`, fullConfig);
    },

    /**
     * Replaces an entire ruleset phase's rule list. The caller MUST pass
     * the result of diff.mjs's reconcileManagedRules().nextRuleList, which
     * already preserves every unmanaged live rule — never a bare desired
     * list, or unmanaged live rules (e.g. the SemrushBot/AhrefsBot block)
     * would be silently deleted.
     */
    async putRulesetPhase(phase, rules) {
      return request("PUT", `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`, { rules });
    },
  };
}

export { createClient };
