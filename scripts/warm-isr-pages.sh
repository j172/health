#!/usr/bin/env bash
# Runs ON the production host (deploy-ftps.yml pipes it over SSH), reading
# URL paths one per line on stdin — see scripts/list-warm-paths.mjs and
# app/api/admin/revalidate-paths/route.ts for why.
#
# Pass 1 requests each path once to trigger ISR regeneration from the real
# database. It is spaced out deliberately: a request that hits a stale entry
# returns immediately and regenerates in the background, so firing ~150 of
# them back-to-back would pile up concurrent regenerations inside a
# next-server capped at a 768MB heap on a host with a 20-entry-process limit.
# Pass 2 reports which paths are still stale or erroring. Paths that are still
# stale/erroring after pass 2 get ONE retry (re-request, wait, re-check) before
# being reported, so a transient miss does not read as a stuck page. The final
# lines this script prints are the contract deploy-ftps.yml parses to emit
# `::warning::` annotations:
#   FAILED <http-code> <path>
#   STILL-STALE <path>
#   warm summary: ok=<n> still_stale=<n> failed=<n>
set -uo pipefail

BASE_URL="${WARM_BASE_URL:-http://127.0.0.1:3000}"
SPACING="${WARM_SPACING_SECONDS:-1.5}"
SETTLE="${WARM_SETTLE_SECONDS:-20}"

mapfile -t PATHS
echo "warming ${#PATHS[@]} paths against ${BASE_URL}"

for p in "${PATHS[@]}"; do
  [ -z "$p" ] && continue
  curl -s -o /dev/null --max-time 60 "${BASE_URL}${p}" || true
  sleep "$SPACING"
done

sleep "$SETTLE"

# Checks every path in the given list and records the verdicts in the globals
# CHECK_OK / CHECK_STALE_PATHS / CHECK_FAILED_LINES, so both passes share one
# definition of "ok", "still stale" and "failed".
check_paths() {
  CHECK_OK=0
  CHECK_STALE_PATHS=()
  CHECK_FAILED_LINES=()
  CHECK_FAILED_PATHS=()
  local p out code cache
  for p in "$@"; do
    [ -z "$p" ] && continue
    out="$(curl -s -o /dev/null -D - --max-time 60 -w '__HTTP_CODE__%{http_code}' "${BASE_URL}${p}" || true)"
    code="${out##*__HTTP_CODE__}"
    cache="$(printf '%s' "$out" | tr -d '\r' | awk 'tolower($1) == "x-nextjs-cache:" { print $2 }')"
    if [ "$code" != "200" ]; then
      CHECK_FAILED_LINES+=("FAILED ${code} ${p}")
      CHECK_FAILED_PATHS+=("$p")
    elif [ "$cache" = "STALE" ]; then
      CHECK_STALE_PATHS+=("$p")
    else
      CHECK_OK=$((CHECK_OK + 1))
    fi
    sleep 0.3
  done
}

check_paths "${PATHS[@]}"
ok=$CHECK_OK

# Paths that were not healthy on the first check. Only these are retried.
RETRY_PATHS=("${CHECK_STALE_PATHS[@]}" "${CHECK_FAILED_PATHS[@]}")

if [ "${#RETRY_PATHS[@]}" -gt 0 ]; then
  echo "retrying ${#RETRY_PATHS[@]} path(s) that were still stale or failing after the first check"
  for p in "${RETRY_PATHS[@]}"; do
    echo "RETRY ${p}"
    curl -s -o /dev/null --max-time 60 "${BASE_URL}${p}" || true
    sleep "$SPACING"
  done
  sleep "$SETTLE"
  check_paths "${RETRY_PATHS[@]}"
  ok=$((ok + CHECK_OK))
fi

stale=${#CHECK_STALE_PATHS[@]}
failed=${#CHECK_FAILED_LINES[@]}

for p in "${CHECK_STALE_PATHS[@]}"; do
  echo "STILL-STALE ${p}"
done
for line in "${CHECK_FAILED_LINES[@]}"; do
  echo "$line"
done

echo "warm summary: ok=${ok} still_stale=${stale} failed=${failed}"
