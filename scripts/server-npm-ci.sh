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
# --maxsockets=1 --prefer-offline: confirmed live 2026-08-02, plain `npm ci
# --omit=dev` got OOM SIGKILLed (exit 137) twice under host memory pressure
# (swap ~95% full). Capping concurrent downloads and preferring the local
# npm cache (already warm from earlier successful installs the same day)
# lowers peak memory during install. Not a guaranteed fix for a genuinely
# overloaded host, just a cheaper attempt.
set -o pipefail
export PATH=/home/tw123457/.nvm/versions/node/v20.20.2/bin:$PATH
cd /home/tw123457/health_app || exit 1
npm ci --omit=dev --maxsockets=1 --prefer-offline
echo $? > .npm-ci-status
