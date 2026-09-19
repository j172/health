#!/usr/bin/env node
/**
 * Local Taiwan-ISP relay for the CDC dengue vector survey sync (issue #269).
 *
 * od.cdc.gov.tw allowlists Taiwan-ISP source IPs only and silently drops
 * every other origin — confirmed against the production host, GitHub Actions
 * runners, and Cloudflare WARP egress alike (.github/workflows/egress-probe.yml).
 * dengue-vector-sync.yml's schedule is paused for the same reason: no CI
 * runner can ever complete this fetch. Until CDC whitelists the prod host's
 * IP (or a hosted Taiwan-ISP relay replaces this), this script is the
 * stopgap — meant to run daily from a machine on a real Taiwan ISP (HiNet,
 * etc.) via a local Task Scheduler job, e.g. around 12:25 Taipei time to
 * land in the same deploy-safe window documented in
 * ops_ingestion_counters_and_deploy_timing.md.
 *
 * It briefly disconnects Cloudflare WARP (if present) so the fetch uses the
 * real ISP egress instead of WARP's tunnel — WARP's split-tunnel exclude
 * list isn't available on this account type ("Invalid account type"), so
 * toggling the whole client is the only option that worked. Always
 * reconnects WARP afterwards, success or failure.
 *
 * Env (loaded from .env.local / .env if not already set):
 *   RSS_SYNC_ADMIN_SECRET (or ADMIN_SECRET)
 *   APP_BASE_URL / HEALTH_BASE_URL (defaults to https://health.j172.tw)
 *   HEALTHCHECKS_URL_DENGUE_VECTOR_SYNC (optional dead-man's-switch ping)
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const BASE_URL =
  process.env.APP_BASE_URL || process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.RSS_SYNC_ADMIN_SECRET || process.env.ADMIN_SECRET;
const HEALTHCHECKS_URL = process.env.HEALTHCHECKS_URL_DENGUE_VECTOR_SYNC || "";
const NATIONAL_CSV_URL = "https://od.cdc.gov.tw/eic/MosIndex_All_last12m.csv";

if (!ADMIN_SECRET) {
  console.error("Missing RSS_SYNC_ADMIN_SECRET (or ADMIN_SECRET) in environment or .env file.");
  process.exit(1);
}

const warpCli = (...args) => {
  try {
    return execFileSync("warp-cli", ["--accept-tos", ...args], {
      encoding: "utf8",
      timeout: 15000,
    });
  } catch (err) {
    console.warn(`[warp-cli ${args.join(" ")}] ${err.message}`);
    return "";
  }
};

const hasWarpCli = () => {
  try {
    execFileSync("warp-cli", ["--version"], { encoding: "utf8", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** `warp-cli connect` returns as soon as it's requested, not once the tunnel
 * is actually up — firing the admin POST immediately after can race a
 * still-reconnecting tunnel and fail with a generic "fetch failed". Poll
 * status instead of a fixed sleep. */
const waitForWarpConnected = async (timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = warpCli("status");
    if (/Status update:\s*Connected/i.test(status)) return true;
    await sleep(1000);
  }
  console.warn("[Dengue Relay] WARP did not report Connected within timeout, proceeding anyway");
  return false;
};

const pingHealthchecks = (suffix) => {
  if (!HEALTHCHECKS_URL) return;
  try {
    execFileSync("curl", ["-fsS", "--max-time", "10", `${HEALTHCHECKS_URL}${suffix}`], {
      stdio: "ignore",
    });
  } catch (err) {
    console.warn(`[healthchecks ping${suffix}] ${err.message}`);
  }
};

async function main() {
  const warpPresent = hasWarpCli();
  if (warpPresent) {
    console.log("[Dengue Relay] Disconnecting WARP for the CDC fetch...");
    warpCli("disconnect");
  }

  let csvText;
  try {
    console.log(`[Dengue Relay] Fetching ${NATIONAL_CSV_URL}...`);
    const res = await fetch(NATIONAL_CSV_URL, {
      headers: { Accept: "text/csv, text/plain, */*" },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      throw new Error(`CDC CSV download failed with status ${res.status}`);
    }
    csvText = await res.text();
    console.log(`[Dengue Relay] Downloaded ${csvText.length} bytes`);
  } finally {
    if (warpPresent) {
      console.log("[Dengue Relay] Reconnecting WARP...");
      warpCli("connect");
      await waitForWarpConnected();
    }
  }

  if (!csvText || !csvText.trim()) {
    throw new Error("CDC CSV download returned an empty body");
  }

  const syncUrl = `${BASE_URL.replace(/\/+$/, "")}/api/admin/dengue-sync`;
  const body = JSON.stringify({ csvText });

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      console.log(`[Dengue Relay] Forwarding CSV to ${syncUrl} (attempt ${attempt}/3)...`);
      const res = await fetch(syncUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-rss-sync-admin-secret": ADMIN_SECRET,
        },
        body,
        signal: AbortSignal.timeout(60000),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(`dengue-sync API error (HTTP ${res.status}): ${JSON.stringify(json)}`);
      }
      console.log(`[Dengue Relay] Success: inserted=${json.result?.inserted ?? "n/a"}`);
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`[Dengue Relay] Attempt ${attempt} failed: ${err.message}`);
      if (attempt < 3) await sleep(3000);
    }
  }
  throw lastErr;
}

main()
  .then(() => {
    pingHealthchecks("");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[Dengue Relay] Failed:", err.message || err);
    pingHealthchecks("/fail");
    process.exit(1);
  });
