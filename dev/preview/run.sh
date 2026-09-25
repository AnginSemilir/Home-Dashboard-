#!/usr/bin/env bash
# (Re)start the preview Home Assistant on http://127.0.0.1:8123 (user: panel / panelpass123).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p config/dashboards
cp ../../homeassistant/dashboard/wall-panel.yaml config/dashboards/wall_panel.yaml
cp ../../homeassistant/packages/wall_panel.yaml config/packages/wall_panel.yaml 2>/dev/null || true

if [ -f ha.pid ] && kill "$(cat ha.pid)" 2>/dev/null; then sleep 4; fi
PATH="$PWD/.venv/bin:$PATH" nohup .venv/bin/hass -c config > ha.log 2>&1 &
echo $! > ha.pid
printf "Starting Home Assistant"
for _ in $(seq 1 120); do
  curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8123/manifest.json 2>/dev/null | grep -q 200 && break
  printf "."; sleep 3
done
sleep 10  # let integrations finish loading
echo " up: http://127.0.0.1:8123/wall-panel/home  (pid $(cat ha.pid), log ha.log)"
