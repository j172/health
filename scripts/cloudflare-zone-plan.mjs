#!/usr/bin/env node
/**
 * "Plan" half of the Cloudflare zone config-as-code flow (issue #454):
 * reads config/cloudflare/zone-settings.json, fetches the zone's actual
 * live configuration, and prints a diff. This NEVER calls a mutating
 * Cloudflare endpoint — see scripts/cloudflare-zone-apply.mjs for that,
 * which is a separate script gated behind an explicit manual trigger
 * (.github/workflows/cloudflare-zone-apply.yml), the same split
 * deploy-ftps.yml already uses between "build" and the manual-only deploy.
 *
 * Exit code is 0 for "ran successfully, here's the diff" — drift between
 * the file and the live zone is the expected, normal case this script
 * exists to report, not a failure. It exits non-zero only on an actual
 * error: missing credentials, an invalid settings file, or a Cloudflare
 * API error.
 *
 * Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseZoneSettingsFile } from "./lib/cloudflare/schema.mjs";
import { createClient } from "./lib/cloudflare/api.mjs";
import { diffFlatSettings, reconcileAllManagedRules, hasAnyChanges } from "./lib/cloudflare/diff.mjs";
import { RULESET_PHASES, mapDesiredManagedRulesToCloudflare } from "./lib/cloudflare/mapRules.mjs";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SETTINGS_FILE = path.join(REPO_ROOT, "config", "cloudflare", "zone-settings.json");

function formatValue(v) {
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

function renderFlatChanges(title, changes) {
  const lines = [`### ${title}`];
  if (changes.length === 0) {
    lines.push("- no drift");
  } else {
    for (const c of changes) {
      lines.push(`- \`${c.key}\`: \`${formatValue(c.from)}\` → \`${formatValue(c.to)}\``);
    }
  }
  return lines;
}

function renderRuleReconciliation(title, r) {
  const lines = [`### ${title}`];
  if (r.added.length === 0 && r.updated.length === 0 && r.removed.length === 0) {
    lines.push("- no drift");
  }
  for (const rule of r.added) lines.push(`- ➕ add \`${rule.ref}\` — ${rule.description}`);
  for (const u of r.updated) lines.push(`- ✏️ update \`${u.ref}\``);
  for (const rule of r.removed) lines.push(`- ➖ remove \`${rule.ref}\` (no longer in zone-settings.json)`);
  if (r.unmanagedPreserved.length > 0) {
    lines.push(
      `- (${r.unmanagedPreserved.length} unmanaged live rule(s) in this phase are left untouched: ${r.unmanagedPreserved
        .map((rule) => rule.ref || rule.id || rule.description || "unlabeled")
        .join(", ")})`,
    );
  }
  return lines;
}

async function main() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!apiToken || !zoneId) {
    console.error("Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID — cannot plan.");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  const settings = parseZoneSettingsFile(raw);

  const client = createClient({ apiToken, zoneId });

  const [liveZoneSettings, liveTieredCache, liveBotManagement, ...liveRuleLists] =
    await Promise.all([
      client.getZoneSettings(),
      client.getTieredCacheSmartTopology(),
      client.getBotManagement(),
      ...Object.values(RULESET_PHASES).map((phase) => client.getRulesetPhase(phase)),
    ]);

  const liveRulesByCategory = {};
  Object.keys(RULESET_PHASES).forEach((category, i) => {
    liveRulesByCategory[category] = liveRuleLists[i];
  });

  const zoneSettingsChanges = diffFlatSettings(settings.zoneSettings, liveZoneSettings);
  const tieredCacheChanges = diffFlatSettings(
    { smartTopologyEnable: settings.tieredCache.smartTopologyEnable },
    { smartTopologyEnable: liveTieredCache },
  );
  // crawlerProtection: null means "unconfirmed, not managed by this file" (see
  // config/cloudflare/zone-settings.json's botManagement.note) — only diff it
  // when the file states an actual desired value, matching cloudflare-zone-apply.mjs
  // so apply never acts on drift the plan didn't also report.
  const botManagementDesired = {
    fightMode: settings.botManagement.fightMode,
    aiBotsProtection: settings.botManagement.aiBotsProtection,
  };
  const botManagementLive = {
    fightMode: liveBotManagement.fight_mode,
    aiBotsProtection: liveBotManagement.ai_bots_protection,
  };
  if (settings.botManagement.crawlerProtection !== null) {
    botManagementDesired.crawlerProtection = settings.botManagement.crawlerProtection;
    botManagementLive.crawlerProtection = liveBotManagement.crawler_protection ?? null;
  }
  // issue #455: same "only diff when the file states an actual desired
  // value" rule as crawlerProtection above, applied to the 3 AI-crawler
  // category fields.
  if (settings.botManagement.aiSearch !== null) {
    botManagementDesired.aiSearch = settings.botManagement.aiSearch;
    botManagementLive.aiSearch = liveBotManagement.ai_search ?? null;
  }
  if (settings.botManagement.aiUser !== null) {
    botManagementDesired.aiUser = settings.botManagement.aiUser;
    botManagementLive.aiUser = liveBotManagement.ai_user ?? null;
  }
  if (settings.botManagement.aiTraining !== null) {
    botManagementDesired.aiTraining = settings.botManagement.aiTraining;
    botManagementLive.aiTraining = liveBotManagement.ai_training ?? null;
  }
  const botManagementChanges = diffFlatSettings(botManagementDesired, botManagementLive);

  const desiredRulesByPhase = mapDesiredManagedRulesToCloudflare(settings.managedRules);
  const ruleReconciliation = reconcileAllManagedRules(desiredRulesByPhase, liveRulesByCategory);

  const anyChanges = hasAnyChanges({
    flatSettingsChanges: [
      ...zoneSettingsChanges,
      ...tieredCacheChanges,
      ...botManagementChanges,
    ],
    ruleReconciliation,
  });

  const reportLines = [
    "# Cloudflare zone config plan",
    "",
    `Zone: \`${settings._meta.zone}\` (primary host: \`${settings._meta.primaryHost}\`)`,
    `Settings file captured: ${settings._meta.capturedAt}, verifiedAgainstLiveZone: ${settings._meta.verifiedAgainstLiveZone}`,
    "",
    `Crawler Hints: dashboard-managed, not plan/apply-managed (see config/cloudflare/zone-settings.json's crawlerHints.note) — desired value \`${settings.crawlerHints.enabled}\`, verify manually in Caching > Configuration.`,
    "",
    ...renderFlatChanges("Zone settings", zoneSettingsChanges),
    "",
    ...renderFlatChanges("Tiered cache", tieredCacheChanges),
    "",
    ...renderFlatChanges("Bot management", botManagementChanges),
    "",
    ...renderRuleReconciliation("Cache rules", ruleReconciliation.cacheRules),
    "",
    ...renderRuleReconciliation("WAF custom rules", ruleReconciliation.wafCustomRules),
    "",
    ...renderRuleReconciliation("Rate limiting rules", ruleReconciliation.rateLimitingRules),
    "",
    ...renderRuleReconciliation("Response header transform rules", ruleReconciliation.responseHeaderTransformRules),
    "",
    ...renderRuleReconciliation("Redirect rules", ruleReconciliation.redirectRules),
    "",
    anyChanges
      ? "**Drift detected.** This plan did NOT change anything. Review every line above, then run the apply workflow manually if it's correct."
      : "No drift — the live zone already matches config/cloudflare/zone-settings.json.",
  ];

  const report = reportLines.join("\n");
  console.log(report);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
