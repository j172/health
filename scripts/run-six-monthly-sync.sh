#!/usr/bin/env bash
# Refreshes the facility/drug/geocoding data sources that don't change often
# enough to justify hourly polling (unlike RSS/AQI). Run every 6 months by
# the "Six-monthly facility/drug data sync" GitHub Actions workflow
# (.github/workflows/six-monthly-sync.yml); can also be run by hand:
#
#   ADMIN_SECRET=<x-rss-sync-admin-secret value> bash scripts/run-six-monthly-sync.sh
#
# What this does NOT cover:
# - The MOHW long-term-care/health-check facility CSVs (ltcpap.mohw.gov.tw) —
#   that source is unreachable from both the production host and GitHub
#   Actions runners (IP-range block), so it can only be synced by running
#   scripts/import-mohw-facilities.mjs from a regular residential/office
#   network by hand. This script only backfills geocoding for whatever was
#   last imported that way.
# - The MOHW LTC contracted-service registry (also ltcpap.mohw.gov.tw, same
#   IP-range block) — run scripts/import-mohw-ltc-contracted.mjs by hand too.
#   It already ships lat/lng, so no geocoding combo is needed for it here.
# - The MOHW disability/elder welfare institution directories — these live on
#   opendata.mohw.gov.tw, the same mohw.gov.tw apex domain as ltcpap above and
#   confirmed unreachable from this host the same way, so run scripts/import-
#   mohw-disability-welfare.mjs and scripts/import-mohw-elder-welfare.mjs by
#   hand too. Unlike the LTC registry these have no coordinates, so their
#   (facility_type, source_key) pairs ARE still in this script's geocoding
#   COMBOS below.
# - The TFDA food nutrition/operator databases — those are large enough
#   (226k+ / 825k+ rows) that fetch/unzip/parse runs directly as separate
#   steps in the six-monthly-sync.yml workflow (scripts/import-tfda-food-
#   nutrition.mjs, scripts/import-tfda-food-operators.mjs), not through this
#   script, since they need Node + adm-zip rather than just curl.
set -euo pipefail

BASE_URL="${HEALTH_BASE_URL:-https://health.j172.tw}"
: "${ADMIN_SECRET:?Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value)}"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

log "Triggering facilities-sync (nhi_hospital, nhi_pharmacy, tfda_pharmacy, mol_labor_checkup, mol_occupational_injury, nhi_home_healthcare, hakka_dtst20230600002)..."
curl -fsS -X POST "$BASE_URL/api/admin/facilities-sync" -H "x-rss-sync-admin-secret: $ADMIN_SECRET"
echo

log "Triggering facilities-hours-sync (NHI weekly service hours)..."
curl -fsS -X POST "$BASE_URL/api/admin/facilities-hours-sync" -H "x-rss-sync-admin-secret: $ADMIN_SECRET"
echo

log "Running drugs-sync (TFDA drug appearance database)..."
curl -fsS -X POST "$BASE_URL/api/admin/drugs-sync" -H "x-rss-sync-admin-secret: $ADMIN_SECRET"
echo

log "Triggering drugs-ingredients-sync (TFDA drug ingredients database, 125k+ rows)..."
curl -fsS -X POST "$BASE_URL/api/admin/drugs-ingredients-sync" -H "x-rss-sync-admin-secret: $ADMIN_SECRET"
echo

# facilities-sync, facilities-hours-sync, and drugs-ingredients-sync respond
# immediately (202) and finish in the background — give the tens-of-
# thousands-of-rows upserts time to land before geocoding starts looking for
# newly-missing coordinates.
log "Waiting 5 minutes for background facility upserts to finish..."
sleep 300

# (facility_type, source_key) pairs that need geocoding. nhi_home_healthcare
# and mohw_ltc_contracted (imported separately, see below) ship their own
# lat/lng and are deliberately excluded.
COMBOS=(
  "health_check mol_labor_checkup"
  "health_check mol_occupational_injury"
  "health_check mohw_hpa_facility"
  "clinic nhi_hospital"
  "pharmacy nhi_pharmacy"
  "pharmacy tfda_pharmacy"
  "long_term_care mohw_ltc_full"
  "disability_welfare mohw_disability_welfare"
  "elder_welfare mohw_elder_welfare"
  "hakka_community hakka_dtst20230600002"
)

for combo in "${COMBOS[@]}"; do
  read -r facility_type source_key <<< "$combo"
  log "Geocoding $facility_type / $source_key..."
  while :; do
    response=$(curl -fsS -X POST "$BASE_URL/api/admin/facilities-geocode" \
      -H "x-rss-sync-admin-secret: $ADMIN_SECRET" \
      -H "Content-Type: application/json" \
      -d "{\"facilityType\":\"$facility_type\",\"sourceKey\":\"$source_key\",\"limit\":30}")
    echo "  $response"
    attempted=$(echo "$response" | grep -o '"attempted":[0-9]*' | grep -o '[0-9]*' || echo "0")
    [ -z "$attempted" ] && attempted=0
    [ "$attempted" -eq 0 ] && break
    sleep 2
  done
done

log "Six-monthly sync complete."
