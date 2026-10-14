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
# Pass 2 reports which paths are still stale or erroring.
set -uo pipefail

BASE_URL="${WARM_BASE_URL:-http://127.0.0.1:3000}"
SPACING="${WARM_SPACING_SECONDS:-1.5}"

mapfile -t PATHS
echo "warming ${#PATHS[@]} paths against ${BASE_URL}"

for p in "${PATHS[@]}"; do
  [ -z "$p" ] && continue
  curl -s -o /dev/null --max-time 60 "${BASE_URL}${p}" || true
  sleep "$SPACING"
done

sleep 20

ok=0
stale=0
failed=0
for p in "${PATHS[@]}"; do
  [ -z "$p" ] && continue
  out="$(curl -s -o /dev/null -D - --max-time 60 -w '__HTTP_CODE__%{http_code}' "${BASE_URL}${p}" || true)"
  code="${out##*__HTTP_CODE__}"
  cache="$(printf '%s' "$out" | tr -d '\r' | awk 'tolower($1) == "x-nextjs-cache:" { print $2 }')"
  if [ "$code" != "200" ]; then
    failed=$((failed + 1))
    echo "FAILED ${code} ${p}"
  elif [ "$cache" = "STALE" ]; then
    stale=$((stale + 1))
    echo "STILL-STALE ${p}"
  else
    ok=$((ok + 1))
  fi
  sleep 0.3
done

echo "warm summary: ok=${ok} still_stale=${stale} failed=${failed}"
