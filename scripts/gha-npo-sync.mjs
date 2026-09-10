#!/usr/bin/env node
/**
 * scripts/gha-npo-sync.mjs
 *
 * Runs NPO Center organization address & website synchronization over SSH loopback
 * against the app host's /api/admin/npo-sync endpoint.
 *
 * Env:
 *   RSS_SYNC_ADMIN_SECRET
 *   SSH_HOST SSH_PORT SSH_USER SSH_KEY_FILE
 *   NPO_START_PAGE (default 1)
 *   NPO_ROUNDS (default 3, 2 pages per round = 6 pages per run)
 */

import { createSshLoopback, shellQuote } from "./lib/ssh-loopback.mjs";

const SECRET = process.env.RSS_SYNC_ADMIN_SECRET || "";
const SSH_HOST = process.env.SSH_HOST || "";
const SSH_PORT = process.env.SSH_PORT || "22";
const SSH_USER = process.env.SSH_USER || "";
const SSH_KEY_FILE = process.env.SSH_KEY_FILE || "";

const START_PAGE = Math.max(1, Number(process.env.NPO_START_PAGE || 1));
const ROUNDS = Math.min(10, Math.max(1, Number(process.env.NPO_ROUNDS || 3)));
const PAGES_PER_ROUND = 2;

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

async function main() {
  console.log("==============================================================");
  console.log(`[NPO Sync GHA] Starting crawl from page ${START_PAGE}, rounds: ${ROUNDS}`);
  console.log("==============================================================");

  let currentPage = START_PAGE;
  let totalProcessed = 0;
  let totalInserted = 0;
  let totalEnriched = 0;

  try {
    for (let round = 1; round <= ROUNDS; round++) {
      console.log(`\n--- Round ${round}/${ROUNDS}: Fetching pages ${currentPage}..${currentPage + PAGES_PER_ROUND - 1} ---`);

      const payload = JSON.stringify({
        startPage: currentPage,
        maxPages: PAGES_PER_ROUND,
      });

      const remoteCmd = [
        "curl -sS --max-time 120",
        "-X POST http://127.0.0.1:3000/api/admin/npo-sync",
        '-H "content-type: application/json"',
        `-H ${shellQuote(`x-rss-sync-admin-secret: ${SECRET}`)}`,
        `-d ${shellQuote(payload)}`,
      ].join(" ");

      const result = ssh.call(remoteCmd, { retries: 2, retryDelayMs: 3000 });
      if (result.error) throw result.error;

      const out = (result.stdout || "").trim();
      let resData = null;
      try {
        const lines = out.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
        const lastLine = lines.length ? lines[lines.length - 1] : out;
        resData = JSON.parse(lastLine);
      } catch {
        console.warn(`Round ${round} non-JSON response: ${out.slice(0, 300)}`);
      }

      if (resData && resData.ok) {
        console.log(
          `✓ Round ${round} success: processed=${resData.totalProcessed}, inserted=${resData.totalInserted}, enriched=${resData.totalEnriched} (Total platform pages: ${resData.totalPages})`,
        );
        totalProcessed += resData.totalProcessed;
        totalInserted += resData.totalInserted;
        totalEnriched += resData.totalEnriched;
        currentPage += PAGES_PER_ROUND;

        if (currentPage > resData.totalPages) {
          console.log(`Reached end of platform pages (${resData.totalPages}). Finishing.`);
          break;
        }
      } else {
        console.warn(`Round ${round} returned error or unexpected response:`, resData);
        currentPage += PAGES_PER_ROUND;
      }
    }

    console.log("\n==============================================================");
    console.log(`🎉 [NPO Sync GHA] Finished! Total: ${totalProcessed}, Inserted: ${totalInserted}, Enriched: ${totalEnriched}`);
    console.log("==============================================================");
  } finally {
    ssh.close();
  }
}

main().catch((err) => {
  console.error("NPO Sync GHA Failed:", err);
  process.exit(1);
});
