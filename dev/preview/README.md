# Dashboard preview harness (for developing the dashboard, not needed to use it)

A throwaway Home Assistant 2026.9 with **fake entities that use the real integrations'
entity IDs**: Octopus (BottlecapDave), Nest camera/thermostat, Met.no weather, Google
Calendar and Kia. It renders `homeassistant/dashboard/wall-panel.yaml` exactly as the tablet
would, so you can change the layout and screenshot it without real devices.

```bash
cd dev/preview
./setup.sh          # once: venv + Home Assistant + the six HACS cards + login user
./run.sh            # (re)start HA with the current dashboard file
node screenshot.js shot 1280x800@1.5 960x600@2   # needs Playwright + Chromium
```

Log in at <http://127.0.0.1:8123> with `panel` / `panelpass123`, or let `screenshot.js`
log in for you. The screenshot script prints any card errors, and whether the layout
overflows the screen, as JSON.

- `config/custom_components/panel_mock/`: tiny integration that creates the fake sensors,
  the Octopus rate events (a realistic Agile price curve for today and tomorrow), a
  camera that serves a still image, a thermostat, a weather entity with forecasts, and a
  calendar with events today.
- `config/mock_entities.yaml`: the fake entities and their IDs. Change these to match your
  own IDs if you want to preview with your settings block.
- Requirements: [uv](https://docs.astral.sh/uv/) 0.9 or newer (fetches Python 3.14),
  `curl`, and Node with Playwright for screenshots.
