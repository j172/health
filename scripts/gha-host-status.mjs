#!/usr/bin/env node
/**
 * Read-only production-host status snapshot, run from GitHub Actions over the
 * same SSH transport the sync jobs use (workflow_dispatch only — see
 * .github/workflows/host-status.yml). Exists so the daily observation notes on
 * #481 (Node 24 rollout) and #455 (AI-crawler allow + load mitigation) can be
 * produced without anyone holding an SSH key locally.
 *
 * Reports, per PM2 app: interpreter path, the interpreter the live process is
 * really executing (/proc/<pid>/exe), uptime, RSS, restart count; plus the
 * account's total process count (the LVE NPROC-style ceiling that bites this
 * host), the load average, and which Node versions are installed (rollback
 * path for #481). It never prints environment variables or secrets and runs
 * no mutating command.
 *
 * Env: SSH_HOST SSH_PORT SSH_USER SSH_KEY_FILE
 */
import { createSshLoopback } from "./lib/ssh-loopback.mjs";

const { SSH_HOST = "", SSH_PORT = "22", SSH_USER = "", SSH_KEY_FILE = "" } = process.env;
if (!SSH_HOST || !SSH_USER || !SSH_KEY_FILE) {
  console.error("Missing SSH_HOST, SSH_USER, or SSH_KEY_FILE");
  process.exit(1);
}

const ssh = createSshLoopback({ keyFile: SSH_KEY_FILE, host: SSH_HOST, port: SSH_PORT, user: SSH_USER });

// nvm provides pm2 on a non-login shell only after sourcing it.
const NVM = 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1;';

function run(label, cmd) {
  const r = ssh.call(`${NVM} ${cmd}`);
  const out = (r.stdout || "").trim();
  if (r.status !== 0) console.log(`[${label}] exit=${r.status} ${((r.stderr || "") + "").trim().slice(0, 300)}`);
  return out;
}

try {
  console.log("=== PM2 apps ===");
  let apps = [];
  try {
    apps = JSON.parse(run("pm2 jlist", "pm2 jlist 2>/dev/null") || "[]");
  } catch {
    console.log("could not parse pm2 jlist output");
  }
  for (const app of apps) {
    const pid = app.pid;
    const env = app.pm2_env || {};
    let liveExe = "n/a";
    let ps = "n/a";
    if (pid) {
      liveExe = run("exe", `readlink /proc/${Number(pid)}/exe`) || "n/a";
      ps = run("ps", `ps -o etime=,rss= -p ${Number(pid)}`).replace(/\s+/g, " ") || "n/a";
    }
    console.log(
      JSON.stringify({
        name: app.name,
        status: env.status,
        pid,
        configuredInterpreter: env.exec_interpreter,
        liveExe,
        uptime_and_rssKB: ps,
        restarts: env.restart_time,
      }),
    );
  }

  console.log("\n=== account process count (all of this user's processes) ===");
  console.log(run("nproc", 'ps -u "$(id -un)" --no-headers | wc -l'));

  console.log("\n=== load average ===");
  console.log(run("loadavg", "cat /proc/loadavg"));

  console.log("\n=== installed node versions (rollback path) ===");
  console.log(run("nvm ls", 'ls "$HOME/.nvm/versions/node" 2>/dev/null'));
  console.log("default alias:", run("alias", 'cat "$HOME/.nvm/alias/default" 2>/dev/null'));
} finally {
  ssh.close();
}
