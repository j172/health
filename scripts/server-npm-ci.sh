#!/bin/bash
# Runs npm ci server-side. Launched detached (nohup, backgrounded, stdio
# closed) by deploy-ftps.yml's "Trigger node_modules sync on server" step so
# a dropped SSH connection under host load can't interrupt it mid-install —
# confirmed live 2026-08-02: holding one SSH session open for npm ci's ~40s+
# runtime got disconnected mid-run three times, each time deleting
# node_modules/next without reinstalling it and leaving the server unable to
# survive its next restart until manually recovered. Writes its exit code to
# .npm-ci-status so the workflow's "Wait for node_modules sync" step can poll
# for completion via short, cheap SSH calls instead of one long-lived one.
#
# Skip when package-lock.json is unchanged AND next is already installable —
# confirmed live 2026-08-02: re-running npm ci on every deploy (even code-only
# deploys with an identical lockfile) got OOM SIGKILLed (exit 137) under host
# memory pressure, wiped a working node_modules, and left health-web 502 until
# manual recovery. Code-only deploys only need the prebuilt .next3 swap.
#
# --maxsockets=1 --prefer-offline: cheaper peak memory when a real install is
# required. NODE_OPTIONS caps V8 heap so pressure surfaces as a normal error
# rather than a silent host SIGKILL when possible.
set -o pipefail
export PATH=/home/tw123457/.nvm/versions/node/v20.20.2/bin:$PATH
cd /home/tw123457/health_app || exit 1

LOCK_FILE=package-lock.json
LOCK_HASH_FILE=.package-lock.sha256
NEXT_BIN=node_modules/next/dist/bin/next
STATUS_FILE=.npm-ci-status

write_status() {
  echo "$1" > "$STATUS_FILE"
}

if [ ! -f "$LOCK_FILE" ]; then
  echo "missing $LOCK_FILE"
  write_status 1
  exit 1
fi

NEW_HASH="$(sha256sum "$LOCK_FILE" | awk '{print $1}')"
OLD_HASH="$(cat "$LOCK_HASH_FILE" 2>/dev/null || true)"

installed_next_version() {
  node -e '
    const pkg = require("./node_modules/next/package.json");
    process.stdout.write(pkg.version);
  ' 2>/dev/null
}

# Every package.json "dependencies" entry (not devDependencies — this server
# install always runs --omit=dev) must actually exist under node_modules.
# This is the guard that catches a stale/wrong $LOCK_HASH_FILE: a previous
# buggy version of this script recorded a lockfile's hash as "installed"
# without ever running npm ci, so node-cron was silently missing even though
# the hash comparison alone said everything was fine. Checking presence
# directly means that corrupted recorded state can't mask a real gap.
dependencies_present() {
  node -e '
    const fs = require("fs");
    const pkg = require("./package.json");
    const deps = Object.keys(pkg.dependencies || {});
    for (const name of deps) {
      if (!fs.existsSync(`node_modules/${name}/package.json`)) process.exit(1);
    }
    process.exit(0);
  ' 2>/dev/null
}

should_skip_install() {
  if [ ! -f "$NEXT_BIN" ]; then
    return 1
  fi

  # Only skip when a PRIOR successful npm ci recorded this exact lockfile's
  # hash AND every declared dependency is actually present on disk.
  if [ -n "$OLD_HASH" ] && [ "$OLD_HASH" = "$NEW_HASH" ] && dependencies_present; then
    return 0
  fi

  return 1
}

if should_skip_install; then
  echo "package-lock unchanged (or next already matches lock) — skipping npm ci"
  echo "next=$(installed_next_version 2>/dev/null || echo unknown) lock=$NEW_HASH"
  write_status 0
  exit 0
fi

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=512}"
echo "running npm ci (lock=$NEW_HASH old=${OLD_HASH:-none})"
npm ci --omit=dev --maxsockets=1 --prefer-offline --no-audit --no-fund
STATUS=$?
write_status "$STATUS"
if [ "$STATUS" -eq 0 ]; then
  echo "$NEW_HASH" > "$LOCK_HASH_FILE"
fi
exit "$STATUS"
