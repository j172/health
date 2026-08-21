#!/usr/bin/env node
/**
 * Unified facility-geocode batch runner for GitHub Actions — calls
 * /api/admin/facilities-geocode-batch (lib/server/facilities/geocodeBatch.ts)
 * repeatedly over an SSH loopback until either provider's daily budget is
 * exhausted, there's nothing left to do, or ROUNDS is reached. Mirrors
 * scripts/gha-og-external-backfill.mjs's SSH-loopback transport (HawkHost
 * disables TCP forwarding, so calls run as remote curl against the app
 * host's own 127.0.0.1:3000 rather than a tunnel).
 *
 * Env:
 *   RSS_SYNC_ADMIN_SECRET
 *   SSH_HOST SSH_PORT SSH_USER SSH_KEY_FILE
 *   GEOCODE_BATCH_ROUNDS (default 30)
 */
import { createSshLoopback, shellQuote } from "./lib/ssh-loopback.mjs";

const SECRET = process.env.RSS_SYNC_ADMIN_SECRET || "";
const SSH_HOST = process.env.SSH_HOST || "";
const SSH_PORT = process.env.SSH_PORT || "22";
const SSH_USER = process.env.SSH_USER || "";
const SSH_KEY_FILE = process.env.SSH_KEY_FILE || "";
const ROUNDS = Math.min(
  100,
  Math.max(1, Number(process.env.GEOCODE_BATCH_ROUNDS || 30)),
);

if (!SECRET) {
  console.error("Missing RSS_SYNC_ADMIN_SECRET");
  process.exit(1);
}
if (!SSH_HOST || !SSH_USER || !SSH_KEY_FILE) {
  console.error("Missing SSH_HOST, SSH_USER, or SSH_KEY_FILE");
  process.exit(1);
}

const ssh = createSshLoopback({
  keyFile: SSH_KEY_FILE,
  host: SSH_HOST,
  port: SSH_PORT,
  user: SSH_USER,
});

const callBatch = () => {
  const remote = [
    "curl -sS --max-time 90",
    "-X POST http://127.0.0.1:3000/api/admin/facilities-geocode-batch",
    '-H "content-type: application/json"',
    `-H ${shellQuote(`x-rss-sync-admin-secret: ${SECRET}`)}`,
    "-d {}",
  ].join(" ");

  const result = ssh.call(remote);

  if (result.error) throw result.error;
  const out = (result.stdout || "").trim();
  const lines = out.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
  const text = lines.length ? lines[lines.length - 1] : out;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `ssh curl non-json exit=${result.status}: ${(result.stderr || "").slice(0, 200)} | ${text.slice(0, 200)}`,
    );
  }
  return json;
};

const main = async () => {
  let totalGeocoded = 0;
  let totalFailed = 0;

  try {
    for (let round = 1; round <= ROUNDS; round += 1) {
      const response = callBatch();
      if (!response.ok) {
        console.error(`round ${round}: API error`, response);
        process.exitCode = 1;
        return;
      }
      const s = response.summary;
      console.log(
        `round ${round}: attempted=${s.totalAttempted} geocoded=${s.totalGeocoded} failed=${s.totalFailed} locked=${s.locked} reset=${s.resetPerformed} opencage_exhausted=${s.budgetExhausted?.opencage} nominatim_exhausted=${s.budgetExhausted?.nominatim} reason=${s.reason ?? ""}`,
      );
      totalGeocoded += s.totalGeocoded ?? 0;
      totalFailed += s.totalFailed ?? 0;

      if (s.locked) {
        console.log("another run holds the lock — stopping this invocation");
        break;
      }
      if (s.budgetExhausted?.opencage && s.budgetExhausted?.nominatim) {
        console.log(
          "both providers' daily budget exhausted — stopping until tomorrow",
        );
        break;
      }
      if ((s.totalAttempted ?? 0) === 0) {
        console.log("nothing left to geocode — stopping");
        break;
      }
    }

    console.log(JSON.stringify({ totalGeocoded, totalFailed }));
  } finally {
    ssh.close();
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
