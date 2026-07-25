#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/health"

echo "[1/6] prepare app dir"
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER":"$USER" "$APP_DIR"

echo "[2/6] copy or pull source"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  echo "Please clone repository into $APP_DIR first."
  exit 1
fi

cd "$APP_DIR"

echo "[3/6] install deps"
npm install --legacy-peer-deps

echo "[4/6] build"
npm run build

echo "[5/6] restart pm2"
if pm2 describe health-web >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --only health-web
else
  pm2 start ecosystem.config.cjs --only health-web
fi
pm2 save

echo "[6/6] done"
pm2 status