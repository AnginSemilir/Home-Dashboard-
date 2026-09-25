#!/usr/bin/env bash
# One-off setup for the preview harness: a throwaway Home Assistant with fake entities
# that use the same entity IDs as the real integrations, plus the dashboard's HACS cards.
set -euo pipefail
cd "$(dirname "$0")"

HA_VERSION="${HA_VERSION:-2026.9.3}"

# Home Assistant 2026.9 needs Python >= 3.14.2; uv fetches one if the system lacks it.
command -v uv >/dev/null || { echo "Install uv first: https://docs.astral.sh/uv/"; exit 1; }
[ -d .venv ] || uv venv -p 3.14 .venv
uv pip install -p .venv "homeassistant==${HA_VERSION}" home-assistant-frontend \
  ha-ffmpeg hassil home-assistant-intents aiohasupervisor PyTurboJPEG

# Custom cards, same versions the dashboard was tested with (see ../../docs/dashboard.md).
W=config/www/community
mkdir -p "$W"
fetch() { curl -fsSL -o "$W/$2" "$1"; echo "  $2"; }
echo "Downloading cards:"
fetch https://github.com/NemesisRE/kiosk-mode/releases/download/v14.2.1/kiosk-mode.js kiosk-mode.js
fetch https://raw.githubusercontent.com/thomasloven/lovelace-layout-card/v2.4.7/layout-card.js layout-card.js
fetch https://github.com/custom-cards/button-card/releases/download/v7.0.1/button-card.js button-card.js
fetch https://github.com/RomRider/apexcharts-card/releases/download/v2.2.3/apexcharts-card.js apexcharts-card.js
fetch https://github.com/pkissling/clock-weather-card/releases/download/v2.9.5/clock-weather-card.js clock-weather-card.js
fetch https://github.com/alexpfau/calendar-card-pro/releases/download/v4.2.0/calendar-card-pro.js calendar-card-pro.js

# Fake camera frame.
.venv/bin/python make_camera_image.py config/camera.jpg

# Login user + skip onboarding.
mkdir -p config/.storage
[ -f config/.storage/auth_provider.homeassistant ] || .venv/bin/hass --script auth -c config add panel panelpass123
cat > config/.storage/onboarding <<'EOF'
{"version": 4, "minor_version": 1, "key": "onboarding", "data": {"done": ["user", "core_config", "analytics", "integration"]}}
EOF
echo "Setup done. Now run ./run.sh"
