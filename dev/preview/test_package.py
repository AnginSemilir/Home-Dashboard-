"""Exercise homeassistant/packages/wall_panel.yaml against the preview instance.

Run ./run.sh first (it copies the package in), then: .venv/bin/python test_package.py
Checks the automations loaded, then drives each one with fake devices and asserts the result.
"""

import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8123"
TOKEN = json.loads(subprocess.check_output([str(Path(__file__).with_name("gettoken.sh"))]))["access_token"]
failures = []


def api(method, path, body=None):
    req = urllib.request.Request(
        BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b"null")


def state(entity_id):
    return api("GET", f"/api/states/{entity_id}")


def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f"  ({detail})" if detail else ""))
    if not cond:
        failures.append(name)


def call(domain, service, data):
    api("POST", f"/api/services/{domain}/{service}", data)
    time.sleep(1.5)


# 1. All five automations loaded and are on.
autos = {s["attributes"].get("id"): s for s in api("GET", "/api/states") if s["entity_id"].startswith("automation.")}
for aid in ["wall_panel_nightly_refresh", "wall_panel_back_to_dashboard", "wall_panel_brightness_schedule",
            "wall_panel_wake_on_doorbell", "wall_panel_charger"]:
    check(f"automation {aid} loaded", aid in autos and autos[aid]["state"] == "on")
by_id = {aid: s["entity_id"] for aid, s in autos.items()}

# 2. Nightly refresh presses "Load start URL".
before = state("button.wall_panel_load_start_url")["attributes"]["presses"]
call("automation", "trigger", {"entity_id": by_id["wall_panel_nightly_refresh"]})
after = state("button.wall_panel_load_start_url")["attributes"]["presses"]
check("nightly refresh presses load_start_url", after == before + 1, f"{before}->{after}")

# 3. Plain motion must NOT wake the panel; a person or a doorbell ring must.
call("switch", "turn_on", {"entity_id": "switch.wall_panel_screensaver"})
call("panel_mock", "fire_event", {"entity_id": "event.front_door_motion", "event_type": "camera_motion"})
check("plain motion leaves screensaver on", state("switch.wall_panel_screensaver")["state"] == "on")
fg = state("button.wall_panel_bring_to_foreground")["attributes"]["presses"]
call("panel_mock", "fire_event", {"entity_id": "event.front_door_motion", "event_type": "camera_person"})
check("person turns screensaver off", state("switch.wall_panel_screensaver")["state"] == "off")
check("person brings Fully to foreground",
      state("button.wall_panel_bring_to_foreground")["attributes"]["presses"] == fg + 1)
call("switch", "turn_on", {"entity_id": "switch.wall_panel_screensaver"})
call("panel_mock", "fire_event", {"entity_id": "event.front_door_chime", "event_type": "ring"})
check("doorbell ring turns screensaver off", state("switch.wall_panel_screensaver")["state"] == "off")

# 4. Charger plug follows the battery level (30% on / 80% off).
for level, want in [(50, None), (25, "on"), (60, None), (85, "off")]:
    if want == "off":
        call("switch", "turn_on", {"entity_id": "switch.wall_panel_charger"})
    if want == "on":
        call("switch", "turn_off", {"entity_id": "switch.wall_panel_charger"})
    api("POST", "/api/states/sensor.wall_panel_battery", {"state": str(level), "attributes": {"unit_of_measurement": "%"}})
    time.sleep(1.5)
    if want:
        got = state("switch.wall_panel_charger")["state"]
        check(f"battery {level}% -> charger {want}", got == want, got)

# 5. Brightness schedule runs without template errors (a manual run takes the 'day' branch).
call("number", "set_value", {"entity_id": "number.wall_panel_screen_brightness", "value": 5})
call("automation", "trigger", {"entity_id": by_id["wall_panel_brightness_schedule"]})
check("brightness schedule sets day brightness",
      float(state("number.wall_panel_screen_brightness")["state"]) == 180,
      state("number.wall_panel_screen_brightness")["state"])

print("\nAll package checks passed." if not failures else f"\n{len(failures)} FAILED: {failures}")
sys.exit(1 if failures else 0)
