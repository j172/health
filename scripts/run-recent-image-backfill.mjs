/**
 * Controlled recent-news card-image backfill.
 *
 * Implements the "Controlled batch runner" section of
 * docs/specs/recent-news-image-backfill.md. Every bound in here is from that
 * spec, and the point of the script is that it cannot be talked into a bigger
 * run: it never clears caches, never reassigns existing images, never touches
 * the historical backlog, and always stops after MAX_ROUNDS.
 *
 * Usage:
 *   RSS_SYNC_ADMIN_SECRET=<secret> node scripts/run-recent-image-backfill.mjs
 *
 * Options:
 *   --dry-run        print the plan and the first request, then exit
 *   --interval=<s>   override the between-round wait (default 600s; for testing)
 */

import fs from "node:fs";
import path from "node:path";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
}

loadEnv();

// --- Spec-mandated bounds. Do not widen these without changing the spec. ---
const NEWER_THAN_HOURS = 24;
const LIMIT_PER_ROUND = 5;
const MAX_ROUNDS = 6;
const DEFAULT_INTERVAL_SECONDS = 600;
const MAX_CONSECUTIVE_FAILURES = 2;

const intervalArg = process.argv.find((a) => a.startsWith("--interval="));
const INTERVAL_SECONDS = intervalArg ? Number(intervalArg.split("=")[1]) : DEFAULT_INTERVAL_SECONDS;
const DRY_RUN = process.argv.includes("--dry-run");

const baseUrl = (process.env.APP_BASE_URL || "https://health.j172.tw").replace(/\/$/, "");
const adminSecret = process.env.RSS_SYNC_ADMIN_SECRET || process.env.ADMIN_SECRET || "";

if (!adminSecret) {
  console.error("Missing RSS_SYNC_ADMIN_SECRET (the x-rss-sync-admin-secret value).");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One round. Returns a discriminated result rather than throwing, so the caller
 * can tell a provider cooldown (fine, keep going) from a transport failure
 * (counts toward the stop condition).
 */
async function runRound(round) {
  const body = { limit: LIMIT_PER_ROUND, newerThanHours: NEWER_THAN_HOURS };
  let response;

  try {
    response = await fetch(`${baseUrl}/api/admin/news-images`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-rss-sync-admin-secret": adminSecret },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return { kind: "transport-error", detail: error instanceof Error ? error.message : String(error) };
  }

  if (response.status >= 500) {
    return { kind: "server-error", detail: `HTTP ${response.status}` };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { kind: "invalid-json", detail: `HTTP ${response.status} with an unparseable body` };
  }

  if (!response.ok || payload?.ok !== true || !payload?.summary) {
    return { kind: "unexpected", detail: `HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 200)}` };
  }

  const { summary } = payload;
  console.log(
    `  round ${round}: assigned=${summary.assigned} skipped=${summary.skipped} failed=${summary.failed}` +
      `${summary.locked ? " [lock held elsewhere]" : ""}${summary.rateLimited ? " [provider rate-limited]" : ""}`,
  );
  if (summary.reason) console.log(`    reason: ${summary.reason}`);
  for (const error of summary.errors ?? []) console.log(`    error: ${error}`);

  return { kind: "ok", summary };
}

async function main() {
  console.log("Recent news image backfill (controlled)");
  console.log(`  target      ${baseUrl}/api/admin/news-images`);
  console.log(`  window      articles created in the last ${NEWER_THAN_HOURS}h`);
  console.log(`  per round   ${LIMIT_PER_ROUND}`);
  console.log(`  rounds      ${MAX_ROUNDS} max, ${INTERVAL_SECONDS}s apart`);
  console.log("  never       clearCache / clearCardImages / --reassign\n");

  if (DRY_RUN) {
    console.log("--dry-run: would POST", JSON.stringify({ limit: LIMIT_PER_ROUND, newerThanHours: NEWER_THAN_HOURS }));
    return;
  }

  const totals = { assigned: 0, failed: 0, skipped: 0, lockedRounds: 0, rateLimitedRounds: 0 };
  const rateLimitReasons = [];
  let consecutiveFailures = 0;
  let stoppedBy = `the ${MAX_ROUNDS}-round cap`;
  let roundsRun = 0;

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    roundsRun = round;
    const result = await runRound(round);

    if (result.kind !== "ok") {
      consecutiveFailures += 1;
      console.log(`  round ${round}: ${result.kind} — ${result.detail}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        stoppedBy = `${MAX_CONSECUTIVE_FAILURES} consecutive failures (last: ${result.kind})`;
        break;
      }
    } else {
      consecutiveFailures = 0;
      const { summary } = result;
      totals.assigned += summary.assigned ?? 0;
      totals.failed += summary.failed ?? 0;
      totals.skipped += summary.skipped ?? 0;
      if (summary.locked) totals.lockedRounds += 1;
      if (summary.rateLimited) {
        totals.rateLimitedRounds += 1;
        if (summary.reason) rateLimitReasons.push(summary.reason);
      }
    }

    // A lock-skipped round still waits the normal interval, per the spec.
    if (round < MAX_ROUNDS) {
      console.log(`  waiting ${INTERVAL_SECONDS}s...\n`);
      await sleep(INTERVAL_SECONDS * 1000);
    }
  }

  console.log("\n--- Result ---");
  console.log(`  rounds run          ${roundsRun}/${MAX_ROUNDS}`);
  console.log(`  assigned            ${totals.assigned}`);
  console.log(`  failed              ${totals.failed}`);
  console.log(`  skipped             ${totals.skipped}`);
  console.log(`  lock-skipped rounds ${totals.lockedRounds}`);
  console.log(`  rate-limited rounds ${totals.rateLimitedRounds}`);
  for (const reason of rateLimitReasons) console.log(`    ${reason}`);
  console.log(`  stopped by          ${stoppedBy}`);
}

main().catch((error) => {
  console.error("Backfill runner failed:", error);
  process.exit(1);
});
