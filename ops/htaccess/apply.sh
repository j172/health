#!/bin/bash
# 把 ops/htaccess/health.j172.tw.htaccess 安裝到正式主機的 vhost（~/health.j172.tw/.htaccess）。
# 流程：備份 → 安裝 → 健康檢查（首頁與 /news/<id> 必須是 200）→ 失敗自動還原。
# 用法：ops/htaccess/apply.sh [--check-path /news/1389409]
# .htaccess 沒有隨 deploy-ftps.yml 部署（主機手動管理），這個 repo 內的檔案是唯一的真相來源。
set -euo pipefail
SSH_KEY="${SSH_KEY:-.ssh/health_host_id_rsa}"
HOST="${HOST:-tw123457@103.21.221.12}"
CHECK="${2:-/news/1389409}"
SRC="$(dirname "$0")/health.j172.tw.htaccess"
[ -f "$SRC" ] || { echo "missing $SRC"; exit 1; }
SSH=(ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15 "$HOST")
STAMP=$(date -u +%Y%m%d%H%M%S)
scp -i "$SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$SRC" "$HOST:/tmp/health.htaccess.$STAMP" >/dev/null
"${SSH[@]}" "set -e; HT=\$HOME/health.j172.tw/.htaccess; cp \$HT \$HT.bak-\$STAMP 2>/dev/null || cp \$HT \$HT.bak-$STAMP; cp /tmp/health.htaccess.$STAMP \$HT; echo installed; sleep 2;
  ok=1; for p in / $CHECK; do c=\$(curl -sk -o /dev/null -m 20 -w '%{http_code}' --resolve health.j172.tw:443:103.21.221.12 \"https://health.j172.tw\$p?cb=\$RANDOM\"); echo \"check \$p -> \$c\"; [ \"\$c\" = 200 ] || ok=0; done;
  if [ \$ok = 1 ]; then echo OK; else cp \$HT.bak-$STAMP \$HT; echo 'ROLLED BACK'; exit 2; fi"
