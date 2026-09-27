# Home Assistant Companion app as the kiosk

> Research for the earlier Home Assistant plan (superseded by the web app on 25 Sep 2026). Kept for reference; many facts still apply.

<details><summary>The question asked</summary>

Research task (read-only; do not edit any files). Today is 2026-09-25. A Lenovo Tab M10 wall panel will show a Home Assistant 2026.9 dashboard in the FREE Home Assistant Companion app for Android (not Fully Kiosk). Home Assistant itself may run on the same tablet (http://127.0.0.1:8123). I need exact, source-verified facts to replace Fully Kiosk features with Companion-app equivalents:
1. Companion app settings for a wall panel: 'Keep screen on', 'Always show first view on app start', autoplay video, full-screen / hide status & navigation bars (is there a fullscreen/immersive option?), 'Device home screen / Use as Home app (launcher)', auto-start on boot (does the app launch itself after reboot? any 'start on boot' option?), exact menu paths.
2. Notification commands (docs: companion.home-assistant.io/docs/notifications/notification-commands, source in github.com/home-assistant/android MessagingManager / notification commands): exact names and data for command_screen_on (keep_screen_on option?), command_screen_brightness_level, command_screen_off_timeout, command_webview (open a dashboard path; does it reload/bring app to front?), command_launch_app, command_activity, and required Android permissions (Write system settings, Display over other apps). Do they work with local push when HA is on the same device (local push over websocket to 127.0.0.1)? 
3. Companion sensors useful here: battery level (entity id pattern sensor.<device>_battery_level), charger type / is charging, screen on/interactive (sensor or binary_sensor.<device>_interactive?), last used app / current app ('sensor.<device>_last_used_app' — is there such a sensor and what does it report?), light sensor, and update intervals. Entity id naming = device name set in the app.
4. Can a dashboard button in the Companion app open an entity's more-info dialog directly via URL/navigate (e.g. `?more-info-entity-id=camera.x` query param in HA frontend 2026 — verify in home-assistant/frontend source), and can command_webview open such a URL to pop up the camera live view when the doorbell rings?
5. Confirm (in source) the Companion app WebView's handling of `intent:` and `app://` URLs from dashboard url actions / window.open (FrontendViewModel or WebViewActivity shouldOverrideUrlLoading / onCreateWindow), including whether window.open from JavaScript (as used by custom:button-card javascript actions) reaches the same handler.
6. Microphone for HA Assist in the Companion app works without HTTPS (native Assist) — confirm.

Tools: load WebSearch via ToolSearch ("select:WebSearch"); most sites are blocked for WebFetch but raw.githubusercontent.com works via Bash curl (e.g. https://raw.githubusercontent.com/home-assistant/companion.home-assistant/master/docs/... and https://raw.githubusercontent.com/home-assistant/android/main/...) and `git clone --depth 1 https://github.com/home-assistant/android` works. HA frontend source: https://raw.githubusercontent.com/home-assistant/frontend/dev/src/... Mark each claim VERIFIED (read in source/docs) or UNVERIFIED. Final report under ~900 words with exact YAML snippets for: night dimming, doorbell wake + show camera, bring the panel back to the foreground after N minutes in another app (if possible), and a 30-80% charger automation using the Companion battery sensor.

</details>

I checked everything against the Companion app release tag **2026.9.0** (`home-assistant/android`), the companion docs repo (`master`, `docs/notifications/commands.md`), frontend tag **20260826.7** (the one HA 2026.9 ships) and core `mobile_app/notify.py`. Nothing was tested on a device.

In 2026.9.0, `WebViewActivity` is a deprecated stub that only redirects old shortcuts. The dashboard now runs in `LaunchActivity`, `FrontendScreen` and `FrontendViewModel`. The docs file is `commands.md`, not `notification-commands.md`.

## 1. App settings (Settings > Companion app)
- **Other settings** (all VERIFIED in `preferences.xml` and `strings.xml`):
  - **Fullscreen** ("Put application in full screen"). It hides the status and navigation bars (immersive; swipe shows them briefly) and hides them again whenever the app gets focus back.
  - Screen orientation.
  - **Keep screen on** ("Do not lock screen when dashboard is active"). It only works while the dashboard is on screen.
  - Pinch to zoom.
  - **Autoplay videos**.
  - **Always show first view when opening app**. When the app goes to the background it navigates back to the default dashboard, except from settings or add-on pages.
- **Device home screen > "Allow as home app"**, then **"Change home app"**. The docs call the toggle "Use as Home app (launcher)", but the app's label is "Allow as home app". VERIFIED.
- **Start on boot:** there is no such option. VERIFIED: the boot receivers only start the websocket and the sensors. The app opens itself after a reboot only if it is set as the home app (docs: "The device opens Home Assistant automatically after restarting").
- **Sensor update frequency** has three choices: Normal (15 min), Fast while charging (1 min while charging) and Fast always (1 min). The app must be restarted after changing it. VERIFIED.
- **Server row settings:** **Persistent connection** (Never / While screen on / On home network / Always) and **"Remotely control app & device"** (on by default). Commands are ignored if that one is off. VERIFIED.

## 2. Notification commands (VERIFIED in `MessagingManager.kt` at 2026.9.0)
- **`command_screen_on`**
  - Holds a full wake lock that turns the screen on and releases it straight away; the screen then turns off after the normal Android timeout.
  - `command: keep_screen_on` switches Keep screen on ON. Any other `command` value switches it OFF. Leaving out `command` leaves the setting unchanged.
  - It does not unlock a lock screen.
- **`command_screen_brightness_level`**: `command` 0–255 (out-of-range values are clamped). **`command_screen_off_timeout`**: `command` in ms. **`command_auto_screen_brightness`**: `turn_on` or `turn_off`. All three need **Modify system settings** (`Settings.System.canWrite`).
- **`command_webview`**: `command` is either a path or `entityId:<entity_id>`.
  - It starts a new app window in front of other apps, so the dashboard loads fresh. It does not wake the screen, so send `command_screen_on` first.
  - With `entityId:`, HA ≥2025.6 loads the default dashboard with `?more-info-entity-id=` added.
- **`command_launch_app`**: `package_name`. If the app isn't installed it opens the Play Store.
- **`command_activity`**: `intent_action`, `intent_uri`, `intent_package_name`, `intent_class_name`, `intent_extras`, `intent_type`.
- `command_webview`, `command_launch_app` and `command_activity` need **Display over other apps**. The first time one is sent while the app is in front, it opens the permission screen.
- **There are no `kiosk_*` commands on Android** — those are iOS only. VERIFIED.
- **Local push over 127.0.0.1:** nothing in the code blocks it (VERIFIED code path, not tested).
  - Local push runs if Persistent connection is not Never **and** the tablet has an active network with internet capability, so Wi-Fi must stay connected even though HA is local.
  - "On home network" also needs the home-network check to pass, so set **Always**.
  - The Play Store version defaults to **Never**.
  - Core sends by local push when that connection is up; otherwise it falls back to the cloud push relay.

## 3. Sensors
Entity IDs follow `<domain>.<device name>_<sensor name>`.

| Entity | Notes | Status |
|---|---|---|
| `sensor.<dev>_battery_level` | On by default | VERIFIED |
| `binary_sensor.<dev>_is_charging` | Updates when the charger is plugged or unplugged | VERIFIED |
| `sensor.<dev>_charger_type` | `ac` / `usb` / `wireless` / `dock` / `none`; updates on plug/unplug | VERIFIED |
| `binary_sensor.<dev>_interactive` | Updates instantly on screen on/off | VERIFIED |
| `sensor.<dev>_light_sensor` | lx; updates on the sensor interval | VERIFIED |
| `sensor.<dev>_last_used_app` | See below | VERIFIED |
| `sensor.<dev>_app_importance` | `foreground`, `service`, etc. | VERIFIED |

- `last_used_app` exists. Its state is the package name of the app with the most recent use (read from usage stats), with a `Label` attribute. It needs **Usage access** and only updates on the sensor interval.
- The HA app's package name is `io.homeassistant.companion.android`.
- Battery level updates only on the sensor interval or when another sensor updates, so use **Fast always**.
- The exact entity IDs are an assumption: they come from the sensor names ("Battery level", "Is charging", "Light sensor", …) and I didn't check them in core.

## 4. More-info deep link
- Frontend 20260826.7 reads `more-info-entity-id` (plus an optional `more-info-view`: `info`, `history`, `settings`, `related`, `add_to` or `details`). It checks when the page loads **and** on every in-app navigation and back/forward. VERIFIED.
- So a `navigate` action to `/lovelace/0?more-info-entity-id=camera.x` should open the dialog. That follows from the code; I didn't test it.
- `command_webview` with `entityId:camera.x` does this natively. VERIFIED.

## 5. `intent:` / `app://`
- The dashboard's `url` action calls `window.open(sanitizeUrl(url))`. `sanitizeUrl` blocks only `javascript:`, `data:` and `vbscript:`, but it also **decodes %-escapes**. VERIFIED.
- In the app, the web view's link handler (`HAWebViewClient`) sends every link to one function (`FrontendViewModel.onUrlIntercepted`), which routes it like this. VERIFIED:
  - `app://pkg` opens the app, or its Play Store page if missing.
  - `intent:` URIs are parsed (with a safety filter) and launched, falling back to the Play Store if the target package is missing.
  - Links to other sites open in the external browser.
  - Links to your HA server stay in the web view.
- There is no handler for new windows, and nothing turns on multi-window or automatic pop-up opening. VERIFIED: code search found zero hits.
- **UNVERIFIED:** that `window.open` from a tap (including button-card javascript) reaches that handler. This relies on standard Android web view behaviour: with multi-window off, the URL opens in the same view and goes through the handler. A `window.open` that isn't triggered by a tap is probably blocked as a pop-up.

## 6. Assist
- When the app reports `hasAssist`, the frontend hands off to the app's native Assist (`assist/show`), which records with the app's own microphone code. No HTTPS is needed. VERIFIED.
- Also, `http://127.0.0.1` counts as a secure origin anyway (general web rule; UNVERIFIED here).

## YAML (device name `lenovo_tab_m10`)
```yaml
# Night dimming
- alias: Panel night
  triggers: [{trigger: time, at: "22:30:00"}]
  actions:
    - action: notify.mobile_app_lenovo_tab_m10
      data: {message: command_auto_screen_brightness, data: {command: turn_off}}
    - action: notify.mobile_app_lenovo_tab_m10
      data: {message: command_screen_brightness_level, data: {command: 8}}
    # optional: allow the screen to turn off
    - action: notify.mobile_app_lenovo_tab_m10
      data: {message: command_screen_on, data: {command: allow_sleep}}  # any value except keep_screen_on turns Keep screen on OFF
    - action: notify.mobile_app_lenovo_tab_m10
      data: {message: command_screen_off_timeout, data: {command: 60000}}
- alias: Panel morning
  triggers: [{trigger: time, at: "06:30:00"}]
  actions:
    - action: notify.mobile_app_lenovo_tab_m10
      data: {message: command_screen_brightness_level, data: {command: 160}}
    - action: notify.mobile_app_lenovo_tab_m10
      data: {message: command_screen_on, data: {command: keep_screen_on}}

# Doorbell: wake + camera
- alias: Doorbell to panel
  triggers: [{trigger: state, entity_id: binary_sensor.doorbell, to: "on"}]
  actions:
    - action: notify.mobile_app_lenovo_tab_m10
      data: {message: command_screen_on}
    - action: notify.mobile_app_lenovo_tab_m10
      data: {message: command_webview, data: {command: "entityId:camera.front_door"}}

# Return to the dashboard after 5 min in another app (needs App importance sensor + Fast always)
- alias: Panel back to front
  triggers:
    - trigger: template
      value_template: "{{ states('sensor.lenovo_tab_m10_app_importance') not in ['foreground','unknown','unavailable'] }}"
      for: "00:05:00"
  conditions: [{condition: state, entity_id: binary_sensor.lenovo_tab_m10_interactive, state: "on"}]
  actions:
    - action: notify.mobile_app_lenovo_tab_m10
      data: {message: command_webview, data: {command: /lovelace/0}}

# Charger 30–80 %
- alias: Panel charger 30-80
  triggers:
    - {trigger: numeric_state, entity_id: sensor.lenovo_tab_m10_battery_level, below: 30, id: "on"}
    - {trigger: numeric_state, entity_id: sensor.lenovo_tab_m10_battery_level, above: 80, id: "off"}
  actions:
    - action: "switch.turn_{{ trigger.id }}"
      target: {entity_id: switch.panel_charger}
```

**Caveats:**
- The "back to front" automation is an approach I designed, not something documented. `app_importance` only updates on the sensor interval, and I'm assuming "foreground" means the dashboard is on screen.
- Each `command_webview` opens a new app window. Repeated calls may pile up windows (hidden from Recents); I didn't test this.
- If HA runs on the tablet, the charger plug must be controlled locally, and ideally it should power up ON after an outage. Otherwise a dead battery also stops HA.
- The lock screen should be set to None, because the dashboard only shows over the lock screen when the app opens it internally (per a manifest comment).
