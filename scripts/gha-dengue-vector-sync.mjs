#!/usr/bin/env node
/**
 * Daily sync runner for the CDC (疾病管制署) dengue mosquito vector survey
 * dataset (issue #269) — calls /api/admin/dengue-sync once over an SSH
 * loopback, same transport as scripts/gha-disaster-points-sync.mjs
 * (HawkHost disables TCP forwarding, so calls run as remote curl against the
 * app host's own 127.0.0.1:3000 rather than a tunnel). The CDC CSV download
 * and dedupe-to-latest-per-village happen inside the app process
 * (lib/server/dengue/ingestDengueVectorSurvey.ts), not on this runner.
 *
 * Env:
 *   RSS_SYNC_ADMIN_SECRET
 *   SSH_HOST SSH_PORT SSH_USER SSH_KEY_FILE
 */
import { createSshLoopback, shellQuote } from "./lib/ssh-loopback.mjs";

const SECRET = process.env.RSS_SYNC_ADMIN_SECRET || "";
const SSH_HOST = process.env.SSH_HOST || "";
const SSH_PORT = process.env.SSH_PORT || "22";
const SSH_USER = process.env.SSH_USER || "";
const SSH_KEY_FILE = process.env.SSH_KEY_FILE || "";

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

const main = async () => {
  try {
    const remote = [
      "curl -sS --max-time 120",
      "-X POST http://127.0.0.1:3000/api/admin/dengue-sync",
      '-H "content-type: application/json"',
      `-H ${shellQuote(`x-rss-sync-admin-secret: ${SECRET}`)}`,
      "-d {}",
    ].join(" ");

    const result = ssh.call(remote);

    if (result.error) throw result.error;
    if (result.status === 255) {
      console.warn(
        "Host SSH / LVE process limit saturated (exit 255). Exiting gracefully (exit 0) to allow host recovery.",
      );
      return;
    }

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

    if (!json.ok) {
      console.error("dengue-sync API error", json);
      process.exitCode = 1;
      return;
    }

    console.log(`dengue_vector_surveys inserted=${json.result?.inserted ?? "n/a"}`);
  } finally {
    ssh.close();
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
