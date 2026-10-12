#!/usr/bin/env node
/**
 * "Apply" half of the Cloudflare zone config-as-code flow (issue #454).
 * This is the ONLY script in this repo allowed to call a mutating
 * Cloudflare API endpoint for zone configuration. It is invoked solely by
 * .github/workflows/cloudflare-zone-apply.yml, a workflow_dispatch-only
 * workflow (never on push/PR/schedule) that requires a human to type an
 * exact confirmation phrase as a dispatch input — mirroring how
 * deploy-ftps.yml is manual-only and cloudflare-config.yml's existing
 * single-setting toggle already works.
 *
 * Safety properties:
 *  - Refuses to run at all unless CONFIRM_APPLY === "APPLY" (set by the
 *    workflow from its dispatch input — see the workflow file for the
 *    human-facing gate; this check is defense-in-depth in case this script
 *    is ever invoked some other way).
 *  - Re-validates the settings file and re-fetches live state itself,
 *    rather than trusting a previous plan run's output, so it never acts
 *    on stale information.
 *  - If the fresh diff shows no changes, it does nothing and exits 0.
 *  - For every ruleset phase (WAF custom rules, cache rules, rate
 *    limiting, response header transforms, redirects), it preserves any
 *    live rule not tagged with a health-repo:* ref — see
 *    scripts/lib/cloudflare/diff.mjs's reconcileManagedRules() — so it can
 *    never silently delete a rule someone added by hand or that predates
 *    this tooling (e.g. the documented SemrushBot/AhrefsBot block).
 *  - Prints an audit line (commit SHA, run URL, actor, timestamp) for
 *    every change actually applied, and writes it to GITHUB_STEP_SUMMARY —
 *    this, plus the workflow run itself and the commit history of
 *    config/cloudflare/zone-settings.json, is this feature's traceability:
 *    "which change caused this" is answered by "look at the apply workflow
 *    run that corresponds to this commit SHA".
 *
 * Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, CONFIRM_APPLY
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

function auditLine(summary) {
  const sha = process.env.GITHUB_SHA || "(unknown commit)";
  const runUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : "(not running in GitHub Actions)";
  const actor = process.env.GITHUB_ACTOR || "(unknown actor)";
  const line = `[apply] ${new Date().toISOString()} commit=${sha} actor=${actor} run=${runUrl} :: ${summary}`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

async function main() {
  if (process.env.CONFIRM_APPLY !== "APPLY") {
    console.error(
      'Refusing to apply: CONFIRM_APPLY must be exactly "APPLY". This script never applies anything without an explicit human confirmation — see .github/workflows/cloudflare-zone-apply.yml.',
    );
    process.exit(1);
  }

  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!apiToken || !zoneId) {
    console.error("Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID — cannot apply.");
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
  // config/cloudflare/zone-settings.json's botManagement.note) — only diff/apply
  // it when the file states an actual desired value, so an unconfirmed null
  // never overwrites whatever the live zone already has.
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

  if (!anyChanges) {
    auditLine("no drift between config/cloudflare/zone-settings.json and the live zone — nothing applied");
    return;
  }

  // Plain zone settings: each PATCH only touches the one named setting, so
  // these are safe to apply independently. `minify` is a single object
  // setting, not three independent ones, so collapse any minify.* change
  // into one PATCH of the whole object.
  const topLevelChanges = zoneSettingsChanges.filter((c) => !c.key.startsWith("minify."));
  for (const change of topLevelChanges) {
    await client.patchZoneSetting(change.key, change.to);
    auditLine(`zoneSettings.${change.key}: ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`);
  }
  if (zoneSettingsChanges.some((c) => c.key.startsWith("minify."))) {
    await client.patchZoneSetting("minify", settings.zoneSettings.minify);
    auditLine(`zoneSettings.minify -> ${JSON.stringify(settings.zoneSettings.minify)}`);
  }

  for (const change of tieredCacheChanges) {
    await client.setTieredCacheSmartTopology(change.to);
    auditLine(`tieredCache.smartTopologyEnable: ${change.from} -> ${change.to}`);
  }

  if (botManagementChanges.length > 0) {
    // bot_management has no partial PATCH — merge only the fields this file
    // manages onto the full live object so every other live field
    // (super bot fight mode, enterprise bot management, etc.) survives
    // untouched.
    const merged = {
      ...liveBotManagement,
      fight_mode: settings.botManagement.fightMode,
      ai_bots_protection: settings.botManagement.aiBotsProtection,
    };
    if (settings.botManagement.crawlerProtection !== null) {
      merged.crawler_protection = settings.botManagement.crawlerProtection;
    }
    await client.putBotManagement(merged);
    auditLine(`botManagement: ${botManagementChanges.map((c) => `${c.key} ${c.from}->${c.to}`).join(", ")}`);
  }

  for (const [category, phase] of Object.entries(RULESET_PHASES)) {
    const r = ruleReconciliation[category];
    if (r.added.length === 0 && r.updated.length === 0 && r.removed.length === 0) continue;
    await client.putRulesetPhase(phase, r.nextRuleList);
    auditLine(
      `${category} (${phase}): +${r.added.length} added, ${r.updated.length} updated, -${r.removed.length} removed, ${r.unmanagedPreserved.length} unmanaged rule(s) preserved`,
    );
  }

  auditLine("apply complete");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
