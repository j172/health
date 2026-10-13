/**
 * zod schema for config/cloudflare/zone-settings.json — the version-controlled
 * description of this site's Cloudflare zone configuration (issue #454).
 *
 * This validates *shape*, not live correctness: it catches typos, wrong
 * enum values, duplicate `ref`s, and structurally malformed rules before
 * they ever reach the Cloudflare API, the same role
 * lib/server/validation/importSchema.ts plays for upstream open-data rows.
 * It intentionally does not (and cannot) confirm the file matches the real
 * zone — that is what the plan workflow's live diff is for.
 */
import { z } from "zod";

const onOff = z.enum(["on", "off"]);

const managedRuleRef = z
  .string()
  .regex(
    /^health-repo:[a-z0-9-]+$/,
    'ref must look like "health-repo:<kebab-case-slug>" so the apply script can tell this repo\'s managed rules apart from unrelated live rules (e.g. the documented SemrushBot/AhrefsBot block) when merging a ruleset phase',
  );

const cacheRuleSchema = z.object({
  ref: managedRuleRef,
  description: z.string().min(1),
  expression: z.string().min(1),
  action: z.enum(["eligible_for_cache", "bypass_cache"]),
  edgeTtlMode: z.literal("respect_origin").optional(),
  browserTtlMode: z.literal("respect_origin").optional(),
  enabled: z.boolean(),
  note: z.string().optional(),
});

const wafCustomRuleSchema = z.object({
  ref: managedRuleRef,
  description: z.string().min(1),
  expression: z.string().min(1),
  action: z.enum(["block", "managed_challenge", "js_challenge", "skip", "log"]),
  enabled: z.boolean(),
  note: z.string().optional(),
});

const rateLimitingRuleSchema = z.object({
  ref: managedRuleRef,
  description: z.string().min(1),
  expression: z.string().min(1),
  requestsPerPeriod: z.number().int().positive(),
  periodSeconds: z.number().int().positive(),
  mitigationTimeoutSeconds: z.number().int().positive(),
  action: z.enum(["block", "managed_challenge", "js_challenge", "log"]),
  enabled: z.boolean(),
  note: z.string().optional(),
  // issue #455: explicitly names one specific live unmanaged rule's
  // Cloudflare-assigned id this managed rule takes over — see
  // reconcileManagedRules() in diff.mjs for the safety property (an
  // allowlist of exactly one id, never a blanket "replace unmanaged rules"
  // switch). Only meaningful for rateLimitingRules today, since that's the
  // phase with a confirmed-live free-plan rule cap forcing consolidation,
  // but not restricted to it structurally in case another phase hits the
  // same wall later.
  adoptsLiveRuleId: z.string().min(1).optional(),
});

const responseHeaderTransformRuleSchema = z.object({
  ref: managedRuleRef,
  description: z.string().min(1),
  expression: z.string().min(1),
  setStatic: z.record(z.string(), z.string()).optional(),
  remove: z.array(z.string()).optional(),
  enabled: z.boolean(),
  note: z.string().optional(),
});

const redirectRuleSchema = z.object({
  ref: managedRuleRef,
  description: z.string().min(1),
  expression: z.string().min(1),
  targetUrlExpression: z.string().min(1),
  statusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]),
  preserveQueryString: z.boolean().optional(),
  enabled: z.boolean(),
  note: z.string().optional(),
});

const documentedUnmanagedRuleSchema = z.object({
  phase: z.enum([
    "http_request_cache_settings",
    "http_request_firewall_custom",
    "http_ratelimit",
    "http_response_headers_transform",
    "http_request_dynamic_redirect",
  ]),
  liveRuleId: z.string().min(1),
  description: z.string().min(1),
  note: z.string().min(1),
});

export const zoneSettingsFileSchema = z.object({
  _meta: z.object({
    zone: z.string().min(1),
    primaryHost: z.string().min(1),
    capturedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    capturedBy: z.string().min(1),
    verifiedAgainstLiveZone: z.boolean(),
    verificationNote: z.string().min(1),
    sharedZoneWarning: z.string().min(1),
    sourceDocs: z.array(z.string().min(1)).min(1),
  }),
  zoneSettings: z.object({
    ssl: z.enum(["off", "flexible", "full", "strict"]),
    always_use_https: onOff,
    automatic_https_rewrites: onOff,
    min_tls_version: z.enum(["1.0", "1.1", "1.2", "1.3"]),
    opportunistic_encryption: onOff,
    // "zrt" = TLS 1.3 enabled with 0-RTT (zero round trip) early data allowed —
    // a third state Cloudflare's API supports alongside plain on/off, confirmed
    // live on this zone during issue #454's first plan run (2026-10-12).
    tls_1_3: z.enum(["on", "off", "zrt"]),
    http3: onOff,
    "0rtt": onOff,
    websockets: onOff,
    brotli: onOff,
    early_hints: onOff,
    rocket_loader: z.enum(["on", "off", "manual"]),
    minify: z.object({ css: onOff, html: onOff, js: onOff }),
  }),
  tieredCache: z.object({
    smartTopologyEnable: onOff,
    note: z.string().optional(),
  }),
  crawlerHints: z.object({
    enabled: z.boolean(),
    note: z.string().optional(),
  }),
  botManagement: z.object({
    fightMode: z.boolean(),
    // Legacy single-toggle field — Cloudflare confirms it still exists
    // alongside the three category fields below (2026-07-01 AI traffic
    // options changelog: the category controls "replace" the single
    // toggle), but does not mark it deprecated in the API schema. Kept
    // here so the apply script can explicitly set it rather than leave an
    // ambiguous stale value.
    aiBotsProtection: z.enum(["block", "disabled", "only_on_ad_pages"]),
    // issue #455 (2.0 §T): Cloudflare's 2026-07-01 Search/Agent/Training
    // AI-crawler category model (free-plan-available), confirmed against
    // Cloudflare's live API docs for PUT /zones/{id}/bot_management —
    // field names ai_search/ai_user/ai_training. "disabled" = not
    // blocked (allowed) for that category.
    aiSearch: z.enum(["disabled", "block", "only_on_ad_pages"]).nullable(),
    aiUser: z.enum(["disabled", "block", "only_on_ad_pages"]).nullable(),
    // ai_training is the only one of the three with a documented
    // "disallow" value in addition to "disabled"/"block"/"only_on_ad_pages".
    aiTraining: z.enum(["disabled", "disallow", "block", "only_on_ad_pages"]).nullable(),
    crawlerProtection: z.enum(["enabled", "disabled"]).nullable(),
    note: z.string().optional(),
  }),
  managedRules: z.object({
    cacheRules: z.array(cacheRuleSchema),
    wafCustomRules: z.array(wafCustomRuleSchema),
    rateLimitingRules: z.array(rateLimitingRuleSchema),
    responseHeaderTransformRules: z.array(responseHeaderTransformRuleSchema),
    redirectRules: z.array(redirectRuleSchema),
  }),
  documentedUnmanagedRules: z.array(documentedUnmanagedRuleSchema),
});

/**
 * Parses and validates raw JSON (already `JSON.parse`d) against the schema,
 * then runs the cross-field checks zod's object shape can't express alone:
 * every managed rule's `ref` must be unique within its own rule list (a
 * duplicate would make the merge-by-ref reconciliation in
 * scripts/lib/cloudflare/diff.mjs silently pick one and drop the other).
 *
 * Throws a single descriptive Error on failure, matching
 * lib/server/validation/importSchema.ts's convention: surface the problem
 * loudly rather than let a malformed settings file reach the Cloudflare API.
 */
export function parseZoneSettingsFile(raw) {
  const result = zoneSettingsFileSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`config/cloudflare/zone-settings.json failed schema validation: ${issues}`);
  }

  const data = result.data;
  for (const [listName, list] of Object.entries(data.managedRules)) {
    const refs = list.map((rule) => rule.ref);
    const duplicates = refs.filter((ref, index) => refs.indexOf(ref) !== index);
    if (duplicates.length > 0) {
      throw new Error(
        `config/cloudflare/zone-settings.json: duplicate ref(s) in managedRules.${listName}: ${[...new Set(duplicates)].join(", ")}`,
      );
    }
  }

  return data;
}
