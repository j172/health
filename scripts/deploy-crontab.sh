#!/usr/bin/env bash
# Installs scripts/health-app.crontab on the production host as a managed
# block inside the user's crontab, without touching any other app's entries
# (this shared account also runs a blog and a second site, bid.j172.tw, with
# their own unrelated cron lines). Safe to run on every deploy — it replaces
# only the block between the BEGIN/END markers, appending it if absent.
#
# Required env vars:
#   SSH_HOST, SSH_PORT, SSH_USER   — connection details
#   SSH_PRIVATE_KEY                — PEM-format private key content
#   OPS_KEY                        — substituted for __OPS_KEY__
set -euo pipefail

: "${SSH_HOST:?Missing SSH_HOST}"
: "${SSH_PORT:?Missing SSH_PORT}"
: "${SSH_USER:?Missing SSH_USER}"
: "${SSH_PRIVATE_KEY:?Missing SSH_PRIVATE_KEY}"
: "${OPS_KEY:?Missing OPS_KEY}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRONTAB_SOURCE="$SCRIPT_DIR/health-app.crontab"

KEY_FILE="$(mktemp)"
BLOCK_FILE="$(mktemp)"
cleanup() { rm -f "$KEY_FILE" "$BLOCK_FILE"; }
trap cleanup EXIT

printf '%s\n' "$SSH_PRIVATE_KEY" > "$KEY_FILE"
chmod 600 "$KEY_FILE"

sed \
  -e "s/__OPS_KEY__/${OPS_KEY}/g" \
  "$CRONTAB_SOURCE" > "$BLOCK_FILE"

# ssh and scp take the port flag under different letters (-p vs -P) — sharing
# one array between them silently broke scp: it read -p (preserve
# timestamps, no argument) plus a stray "22" positional arg, so this upload
# has been failing on every deploy since this script was introduced.
SSH_OPTS=(-i "$KEY_FILE" -p "$SSH_PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
SCP_OPTS=(-i "$KEY_FILE" -P "$SSH_PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)

scp "${SCP_OPTS[@]}" "$BLOCK_FILE" "$SSH_USER@$SSH_HOST:/tmp/health-app-cron-block.txt"

# shellcheck disable=SC2087
ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" bash -s <<'REMOTE'
set -euo pipefail
BEGIN_MARK="# BEGIN health-app managed cron"
END_MARK="# END health-app managed cron"
BLOCK_FILE="/tmp/health-app-cron-block.txt"

CURRENT="$(crontab -l 2>/dev/null || true)"

STRIPPED="$(printf '%s\n' "$CURRENT" | awk -v b="$BEGIN_MARK" -v e="$END_MARK" '
  $0==b {skip=1}
  skip && $0==e {skip=0; next}
  skip {next}
  {print}
')"

{ printf '%s\n' "$STRIPPED"; cat "$BLOCK_FILE"; } | crontab -

rm -f "$BLOCK_FILE"
echo "Crontab updated:"
crontab -l
REMOTE
