# Nest camera and thermostat

> Research for the earlier Home Assistant plan (superseded by the web app on 25 Sep 2026). Kept for reference; many facts still apply.

**Area:** Google Nest camera live view (plus Nest thermostat) on the Home Assistant wall-panel dashboard

## Recommendation

Use the official Home Assistant Google Nest integration, which runs on the SDM API. It costs a one-time, non-refundable US$5 Device Access fee and needs a free Google Cloud project with an OAuth "Web application" client and a Pub/Sub topic you create yourself. That one integration gives you both the camera (camera.<name>) and the thermostat (climate.<name>, sensor.<name>_temperature). All current-generation Nest cams and doorbells stream over WebRTC. For those cameras, put a built-in picture-entity card on the dashboard with camera_view: live. HA renews Google's 5-minute stream session automatically, about 30 seconds before it expires. The HA page closes the stream 60 seconds after it becomes hidden and reopens it when it is visible again. Pair that with a Fully Kiosk screen-off timer and motion-to-wake, so the stream only runs while someone is looking at the panel. Do not use camera_view: auto for WebRTC Nest cams. They have no snapshot API, so HA serves a static placeholder image and the tile never shows a picture. For battery cams and doorbells, do not keep a permanently live tile. Google hard-stops their streams after 5 minutes and ignores extend requests while on battery. Use a tap-to-open tile instead, and optionally have an automation wake the screen and show the camera on a person or doorbell event. The Advanced Camera Card (HACS, live_provider: ha) is an optional nicer front end. go2rtc and AlexxIT WebRTC Camera are not needed, because HA already plays Nest WebRTC natively (HA 2024.11+). Before paying the $5, confirm the exact camera model. The 2025 "2K" Nest Cam Indoor (3rd gen) was reported in October 2025 as not appearing in SDM. The Doorbell (wired, 3rd gen) does appear, but in 2026 its chime events are reported as not being delivered.

## Facts

- The HA Nest integration uses the Smart Device Management (SDM) API plus Google Cloud Pub/Sub (iot_class cloud_push). Platforms: camera, climate, event, sensor. The SDM API requires a one-time US$5 fee, which is non-refundable. Google Workspace accounts and Advanced Protection Program accounts are not supported; use a consumer account such as gmail. Once a Google account is tied to the Device Access project it cannot be changed. _(source: https://raw.githubusercontent.com/home-assistant/home-assistant.io/current/source/_integrations/nest.markdown)_
- Setup order per HA docs (current): 1) Create a Google Cloud project, note the Project ID, and enable 'Smart Device Management API' and 'Cloud Pub/Sub API'. 2) Google Auth Platform > Branding: set App name, support email and developer email only (extra fields trigger verification). Audience: set user type External, add your gmail as a test user, then Publish app so it is 'In production' (in Testing mode tokens expire every 7 days). 3) Credentials > Create OAuth client ID of type 'Web application' with Authorized redirect URI https://my.home-assistant.io/redirect/oauth. 4) Device Access Console (console.nest.google.com/device-access): accept the ToS, pay US$5, create a project, enter the OAuth client ID, leave events off for now, and note the Device Access Project ID. 5) Pub/Sub: create a topic (e.g. home-assistant-nest; full name projects/<cloud-project-id>/topics/home-assistant-nest). On the topic's Permissions tab, add principal sdm-publisher@googlegroups.com with role 'Pub/Sub Publisher' (on the topic, not project IAM). Then in the Device Access Console choose '...' > 'Enable events with PubSub topic' > Add & Validate. 6) In HA: Settings > Devices & services > Add Integration > Nest. Enter the IDs and credentials, sign in with Google, tick all permissions (thermostat, camera livestream, camera/doorbell events), click through the 'Google hasn't verified this app' warning (Advanced > Go to ...), select the topic, and let HA create the subscription. _(source: https://raw.githubusercontent.com/home-assistant/home-assistant.io/current/source/_integrations/nest.markdown)_
- As of Jan 23 2025, Google no longer hosts Pub/Sub topics for new Device Access projects, so you must create the topic in your own Cloud project. HA docs say to use the latest HA version for this flow. _(source: https://raw.githubusercontent.com/home-assistant/home-assistant.io/current/source/_integrations/nest.markdown)_
- Camera entity naming: the entity has has_entity_name=True and name=None, so entity_id = camera.<device name>. The device name is the Nest custom name if set, otherwise the Google Home room name(s) joined, otherwise the model type ('Camera', 'Doorbell', 'Thermostat', 'Display'). Examples: a camera named 'Front Yard' becomes camera.front_yard; an unnamed thermostat in room 'Hallway' becomes climate.hallway. _(source: https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/nest/device_info.py and camera.py)_
- Stream type by model (HA docs table). WebRTC: Nest Cam (indoor, wired), Nest Cam (outdoor, battery), Nest Cam with floodlight, Nest Doorbell (battery), Nest Doorbell (wired, 2nd gen). RTSP (served to the browser as HLS, supports recording and snapshots): Nest Cam Indoor, Nest Cam IQ Indoor/Outdoor, Nest Cam Outdoor (1st-gen era), Nest Doorbell (wired, 1st gen / Hello), Nest Hub Max. Moving an older cam into the Google Home app converts it from RTSP to WebRTC and loses snapshots. _(source: https://raw.githubusercontent.com/home-assistant/home-assistant.io/current/source/_integrations/nest.markdown)_
- WebRTC Nest cameras do not support snapshots. NestWebRTCEntity.async_camera_image() always returns the bundled placeholder.png (content_type image/png). A dashboard card with camera_view auto (the default, which refreshes a still every 10 s) therefore shows only the placeholder, so camera_view: live is required. For WebRTC cams, camera.snapshot and record actions are not supported. _(source: https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/nest/camera.py ; https://raw.githubusercontent.com/home-assistant/frontend/dev/src/panels/lovelace/components/hui-image.ts)_
- HA renews Nest streams automatically. StreamRefresh schedules extend_stream() (WebRTC) or extend_rtsp_stream() (RTSP) at expires_at minus 30 s. On API errors it backs off from 1 min, multiplying by 1.5, up to a 10 min maximum. Each frontend client gets its own WebRTC session (keyed by session_id), which is stopped when the client closes it. The integration ignores ICE candidates because the streams are Nest cloud-based. _(source: https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/nest/camera.py)_
- Google SDM live-stream sessions last 5 minutes and can be extended with ExtendWebRtcStream / ExtendRtspStream. WebRTC extension works only on wire-powered cameras. On battery power the extend request is ignored, so battery cam and battery doorbell streams stop after about 5 minutes. _(source: https://developers.google.com/nest/device-access/traits/device/camera-live-stream (via search snippet); HA docs say live view is 'not recommended for battery-powered cameras')_ **[unverified]**
- HA frontend WebRTC player (ha-web-rtc-player): when document.hidden becomes true it tears down the peer connection after HIDDEN_CLEANUP_DELAY = 60000 ms, and restarts WebRTC when the page is visible again. If RTCPeerConnection is missing it shows 'WebRTC is not supported in this browser'. Dashboard cards render <ha-camera-stream muted>, so autoplay is not blocked by audio-autoplay policies. If a WebRTC stream has no video it falls back to HLS or MJPEG. _(source: https://raw.githubusercontent.com/home-assistant/frontend/dev/src/components/ha-web-rtc-player.ts ; ha-camera-stream.ts ; hui-image.ts)_
- picture-entity and picture-glance cards accept camera_view ('auto' default or 'live'), camera_image, aspect_ratio, fit_mode (cover/contain/fill), show_name, show_state and tap_action. HA docs say a Picture Glance card with camera_view: live shows the Nest WebRTC live stream. _(source: https://raw.githubusercontent.com/home-assistant/home-assistant.io/current/source/_dashboards/picture-entity.markdown ; picture-glance.markdown ; nest.markdown)_
- The go2rtc integration is part of default_config and is set up automatically on HA OS and HA Container (since 2024.11). It provides WebRTC for RTSP cameras. Nest WebRTC cams do not need it because the Nest integration answers the browser's WebRTC offer itself. _(source: https://raw.githubusercontent.com/home-assistant/home-assistant.io/current/source/_integrations/go2rtc.markdown ; core nest camera.py (async_handle_async_webrtc_offer))_
- Advanced Camera Card (formerly Frigate Card, HACS default, type custom:advanced-camera-card): live_provider 'ha' uses HA's native WebRTC/HLS streams and works with Nest. Useful live options: auto_play (default [selected, visible]), auto_pause (default []; 'hidden' pauses when the browser or tab is hidden), lazy_unload (default []; 'hidden' unloads the stream), preload, and show_image_during_load (default true, which for Nest WebRTC shows only the placeholder). _(source: https://raw.githubusercontent.com/dermotduffy/advanced-camera-card/main/docs/configuration/cameras/live-provider.md ; docs/configuration/live.md)_
- go2rtc warns that the Nest API gives a stream link for only 5 minutes, and that a hass:// WebRTC source must not be used with Frigate. For standalone use there is a native go2rtc 'nest:' source (client_id, client_secret, refresh_token, project_id, device_id) that supports extension. This is only relevant if you want recording or NVR, not for a dashboard. _(source: https://raw.githubusercontent.com/AlexxIT/go2rtc/master/internal/hass/README.md ; internal/nest/README.md)_
- Nest event entities: event.<device>_motion (event_types camera_motion, camera_person, camera_sound) and, for doorbells, event.<device>_chime (event_type ring). Device triggers fire nest_event with type e.g. doorbell_chime, plus attachment.image and attachment.video URLs (/api/nest/event_media/<device_id>/<event_id>[/thumbnail]) for models with media support. Which events are published depends on Google Home app notification settings (Push must be on, and 'Seen' Motion/Person enabled). _(source: https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/nest/event.py ; strings.json ; nest.markdown)_
- Nest thermostat climate entity: climate.<device name>. Attributes: current_temperature (°C from the Temperature trait), current_humidity, temperature (setpoint), hvac_action (heating/cooling/idle/off), preset_mode (eco/none), hvac_modes from device. min_temp 10, max_temp 32. Sensors: sensor.<device name>_temperature (rounded to 0.1 °C, device_class temperature), sensor.<device name>_humidity (int %), and sensor.<device name>_fan_timer_timeout (only if a fan timer is supported). Needs the permission 'Allow Home Assistant to access and control your thermostat'. _(source: https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/nest/climate.py ; sensor.py ; nest.markdown)_
- The SDM API does not expose extra Nest temperature sensors. It reports only the temperature of the currently active sensor. Nest Heat Link hot water control is also not in SDM; the unofficial HACS 'nest_legacy' integration supports it. _(source: nest.markdown (Known limitations) ; https://raw.githubusercontent.com/tronikos/nest_legacy/main/README.md)_
- Nest Learning Thermostat 1st and 2nd gen lost app and cloud support on 25 Oct 2025 and were unpaired from the Nest/Home apps, so they will not appear in SDM. The UK has had no newer Nest thermostat model; the 4th gen, which supports Matter, is not sold in Europe. _(source: https://support.google.com/googlehome/answer/16233096 (via search) ; tomsguide / 9to5google coverage)_ **[unverified]**
- SDM rate limits: devices.executeCommand limit is 5 QPM per project, per user, per device, and 10 QPM per project per user at method level. devices.get is 10 QPM. Generating or extending streams are commands, so one always-on panel stream (about 1 extend per 4.5 min) is well within limits. _(source: https://developers.google.com/nest/device-access/project/limits (via search snippet))_ **[unverified]**
- 2025 Nest camera generation: HA core issue #153982 (Oct 2025) reports that the Nest Cam Indoor (wired, 3rd gen) does not show up in the Nest integration because it is not supported by the API; current status unknown. The Nest Doorbell (wired, 3rd gen) does show up. Motion and person events work, but chime events are not delivered (Google-side bug; HA core issue #177196, upstream status reset July 2026). Nest Cam Outdoor (wired, 2nd gen) SDM support was not confirmed. _(source: https://github.com/home-assistant/core/issues/153982 ; https://github.com/home-assistant/core/issues/177196 ; https://community.home-assistant.io/t/nest-doorbell-wired-3rd-gen-no-chime-press-events-via-sdm-confirmed-google-side-bug-not-ha/1018641 (all via search snippets))_ **[unverified]**
- Recent regression: HA frontend issue #54150 (Sept 2026) reports intermittent fully black Fully Kiosk / Android WebView on Core 2026.9.1 and 2026.9.2 after screensaver wake cycles, fixed by rolling back to 2026.8.3. Separately, frontend #27750 reports newly added Nest (WebRTC) cams showing black on the dashboard while working in more-info. _(source: https://github.com/home-assistant/frontend/issues/54150 ; https://github.com/home-assistant/frontend/issues/27750 (via search snippets))_ **[unverified]**
- The HA Companion app for Android has a Settings > Companion App 'Autoplay video' option (for more-info video). The Fully Kiosk HA integration needs the Fully PLUS licence (€7.90 one-time per device) for Remote Admin. It exposes switch.<tablet>_screen, switch.<tablet>_screensaver, switch.<tablet>_motion_detection, button.<tablet>_load_start_url, button.<tablet>_bring_to_foreground, button.<tablet>_restart_browser, button.<tablet>_trigger_motion_activity, and actions fully_kiosk.load_url (device_id, url), fully_kiosk.start_application (device_id, application) and fully_kiosk.set_config (device_id, key, value). _(source: https://raw.githubusercontent.com/home-assistant/companion.home-assistant/master/docs/integrations/android-webview.md ; https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/fully_kiosk/{switch,button}.py, strings.json, services.yaml ; licence price via search)_
- The Nest Pub/Sub subscription HA creates uses a short message retention (reported as 15 min), so the June 2024 Pub/Sub retention billing change does not apply and normal use stays within the free tier. Google deletes subscriptions after 31 days of inactivity by default; HA docs suggest editing the subscription to never expire. _(source: nest.markdown (troubleshooting) ; community.home-assistant.io/t/nest-charge-for-retaining-unacknowledged/681684 (via search))_ **[unverified]**
- Integration requirement pinned in HA core manifest: google-nest-sdm==9.2.1. Dependencies: ffmpeg, http, application_credentials. Codeowner: @allenporter. _(source: https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/nest/manifest.json)_

## Config snippets

```
# 1) Always-on live tile for a WIRED WebRTC Nest cam (built-in card, no HACS)
type: picture-entity
entity: camera.front_door        # camera.<Nest custom name or room name>
camera_view: live                # REQUIRED for WebRTC Nest cams; 'auto' only shows a placeholder PNG
show_name: false
show_state: false
aspect_ratio: "16:9"
fit_mode: cover
tap_action:
  action: more-info              # opens the larger live view
```

```
# 2) Same, with a status overlay (picture-glance)
type: picture-glance
title: Front door
camera_image: camera.front_door
camera_view: live
entities:
  - entity: event.front_door_motion
  - entity: event.front_door_chime   # doorbells only
```

```
# 3) BATTERY cam/doorbell: do NOT stream continuously (5-min hard cap). Use a tap-to-view tile instead
type: tile
entity: camera.back_garden
name: Back garden (tap for live)
tap_action:
  action: more-info
```

```
# 4) Optional nicer card (HACS: dermotduffy/advanced-camera-card)
type: custom:advanced-camera-card
cameras:
  - camera_entity: camera.front_door
    live_provider: ha            # native HA WebRTC, works with Nest
live:
  auto_play: [selected, visible]
  auto_pause: [hidden]
  lazy_unload: [hidden]          # free the SDM session when the panel is hidden or the screen is off
  show_image_during_load: false  # Nest WebRTC 'image' is only a placeholder
```

```
# 5) Nest thermostat on the same dashboard
type: thermostat
entity: climate.hallway          # climate.<thermostat name/room>
---
type: tile
entity: sensor.hallway_temperature
name: Indoor
---
# template use: {{ state_attr('climate.hallway', 'current_temperature') }}   /   {{ state_attr('climate.hallway', 'hvac_action') }}
```

```
# 6) Wake the wall panel and show the camera on doorbell ring / person (needs Fully Kiosk PLUS + fully_kiosk integration)
alias: Panel - show door camera on ring or person
triggers:
  - trigger: state
    entity_id: event.front_door_chime
    not_from: [unavailable, unknown]
  - trigger: state
    entity_id: event.front_door_motion
    not_from: [unavailable, unknown]
conditions:
  - condition: template
    value_template: "{{ trigger.to_state.attributes.event_type in ['ring', 'camera_person'] }}"
actions:
  - action: switch.turn_on
    target:
      entity_id: switch.wall_panel_screen
  - action: fully_kiosk.load_url
    data:
      device_id: YOUR_FULLY_DEVICE_ID
      url: "http://homeassistant.local:8123/dashboard-panel/camera"
mode: single
```

```
# 7) Google Cloud Pub/Sub values used during setup
# Topic ID:   home-assistant-nest
# Topic Name: projects/<cloud-project-id>/topics/home-assistant-nest
# Principal:  sdm-publisher@googlegroups.com  -> role 'Pub/Sub Publisher' (on the TOPIC's Permissions tab)
# OAuth client type: Web application; Authorized redirect URI: https://my.home-assistant.io/redirect/oauth
```

## Gotchas

- camera_view must be 'live' for WebRTC Nest cams. Those cams have no snapshot API, so HA returns a placeholder PNG and the default 'auto' tile never shows a picture. This is a common cause of 'black or blank Nest tile but works when tapped' reports.
- Battery-powered Nest Cam and Nest Doorbell (battery): Google ignores ExtendWebRtcStream on battery, so a live tile freezes after about 5 minutes, and constant streaming drains the battery. Use tap-to-view and an event-triggered pop-up instead. UNVERIFIED: whether a battery cam kept on its charger counts as 'wired' for extension.
- The stream goes through Google's cloud, not the local network, even though HA docs call it 'direct browser to camera'. The Nest integration ignores ICE candidates. The panel needs internet access and uses continuous download bandwidth while live (bitrate UNVERIFIED, likely 1–2 Mbps).
- A 24/7 live tile keeps one SDM session open, which HA extends about every 4.5 min. Let the page become hidden (Fully Kiosk screen-off timer or scheduled screen off at night) so the HA frontend drops the stream after 60 s and re-creates it on wake (about 1–3 s delay). UNVERIFIED: whether Fully's screensaver overlay, as opposed to a real screen-off, marks the WebView as hidden.
- If an extend call fails, HA backs off and retries the extend but does not rebuild the browser session. A long-running tile can freeze until the page is reloaded or hidden and shown again. Schedule a nightly Fully 'Load start URL' or 'Restart browser' as a safety net.
- Snapshots and clips: WebRTC cams give no still images, so camera.snapshot, recording, and notification snapshots are unavailable. Newer doorbells and battery cams give only 'clip preview' mp4/gif on events. Older cams moved into the Google Home app switch from RTSP to WebRTC and lose snapshots, and HA reports event media is sometimes not published after migration.
- 2025 '2K' Nest generation: Nest Cam Indoor (wired, 3rd gen) was reported in Oct 2025 as not exposed by SDM (HA issue #153982); current status UNVERIFIED. Doorbell (wired, 3rd gen) works for live view, motion and person, but chime events are not delivered (Google bug, 2026). Check the model before paying the non-refundable $5.
- OAuth consent screen must be set to 'In production'. In 'Testing' the token expires every 7 days and you must re-authenticate. Do not fill optional branding fields (logo, domains), or Google will require app verification (Error 403 access_denied).
- The Google account used must be a consumer (gmail) account and a member of the Google Home that holds the devices. Workspace and Advanced Protection accounts fail. The account bound to the Device Access project cannot be changed later.
- The Pub/Sub publisher role must be granted on the topic itself (sdm-publisher@googlegroups.com), not in project IAM. Pub/Sub subscriptions are auto-deleted after 31 days of inactivity; edit the subscription to 'never expire' to avoid a broken integration after downtime.
- Google Home app camera settings matter. If cameras are scheduled or set by presence to switch off when you are home, the dashboard stream will fail at those times. Push notifications and 'Seen' Motion/Person must be enabled for event entities to fire.
- Entity IDs come from the Nest custom name or room. An unnamed thermostat and camera in the same room get the same base name, and HA adds a _2 suffix. Rename devices in Google Home first, or rename entities in HA before building the dashboard.
- Android WebView on the Lenovo M10: update 'Android System WebView' (and Chrome) from the Play Store. The HA frontend 2026.9.1 and 2026.9.2 have an open Fully Kiosk black-WebView regression (frontend #54150); if affected, stay on 2026.8.x or apply the fixed release. There are older reports of Lenovo Tab + Fully 'render process unresponsive' issues.
- Only the active Nest temperature sensor is reported. Nest Heat Link hot-water control (UK) is not in SDM. Nest Learning Thermostat 1st and 2nd gen stopped cloud support on 25 Oct 2025 and cannot be added.
- Legacy RTSP Nest cams (IQ, Nest Cam Indoor/Outdoor 1st gen, Hello) still in the old Nest app: their streams are flaky (HA forces available=True for this reason). They can use camera_view auto (snapshots via stream) or live (HLS, or WebRTC via go2rtc). Enable LL-HLS or 'Preload stream' for lower latency.
- Do not route Nest through go2rtc's hass:// source into Frigate. The 5-minute expiry can exhaust RAM, per go2rtc docs. AlexxIT's WebRTC Camera custom card is unnecessary for Nest since HA 2024.11.

## Setup steps

- Identify the exact camera model(s) in the Google Home app (Settings > device > Device information), for example 'Nest Cam (indoor, wired)', 'Nest Doorbell (battery)' or 'Nest Cam Indoor (wired, 3rd gen)'. Also note whether each is battery or wired, and the thermostat model and generation. Rename devices in Google Home to the names you want as entity IDs (for example 'Front Door', 'Hallway').
- Make sure you are signed in with the consumer Google account that owns the Google Home. Use a private browser window to avoid account mix-ups.
- Google Cloud Console: create a project and copy its Project ID. Enable 'Smart Device Management API' and 'Cloud Pub/Sub API'.
- Google Auth Platform: in Branding, set App name, user support email and developer contact email only. In Audience, choose External, add your gmail as a test user, then click 'Publish app' so the status is 'In production'.
- Credentials: create an OAuth client ID of type 'Web application' with Authorized redirect URI https://my.home-assistant.io/redirect/oauth. Copy the Client ID and Client Secret.
- Device Access Console (console.nest.google.com/device-access): accept the terms and pay the one-time US$5 fee. Create a project using the OAuth Client ID, leave events off, and copy the Device Access Project ID.
- Pub/Sub: create a topic 'home-assistant-nest'. On the topic's Permissions tab, add principal sdm-publisher@googlegroups.com with role 'Pub/Sub Publisher'. In the Device Access Console, open the project and choose '...' > 'Enable events with PubSub topic', enter projects/<cloud-project-id>/topics/home-assistant-nest, then Add & Validate.
- Home Assistant (latest version): Settings > Devices & services > Add Integration > Google Nest. Enter the Cloud Project ID, OAuth credentials and Device Access Project ID. Sign in with Google and tick all devices and permissions (thermostat, camera livestream, camera and doorbell events), accept the 'unverified app' warning, choose the topic, and let HA create the subscription.
- Optional: in Google Cloud Pub/Sub > Subscriptions, edit the HA subscription so its expiration is 'Never expire'.
- In the Google Home app, check camera notification settings: Push on, and 'Seen' Motion/Person on (required for event entities and pop-up automations). Check that cameras are not scheduled to turn off when you are home if you want the panel to always show them.
- On the Lenovo M10, update Android System WebView and Chrome from the Play Store. In Fully Kiosk, set the start URL to the HA dashboard, enable 'Autoplay Videos' (Web Content Settings), and set a screen-off timer and camera motion-to-wake. Buy Fully PLUS (€7.90) if you want the HA fully_kiosk integration for wake and pop-up automations.

## Open questions

- Which Nest camera or doorbell model(s) does the user own, and are they wired or battery? This decides whether an always-live tile is possible (wired WebRTC) or a tap-to-view approach is needed (battery). It also decides whether SDM supports the device at all if it is a 2025 3rd-gen Indoor or 2nd-gen Outdoor cam.
- Is the SDM support gap for the Nest Cam Indoor (wired, 3rd gen) and Nest Cam Outdoor (wired, 2nd gen) (2025 2K models) resolved as of Sept 2026? Unverified: the Google supported-devices page and the GitHub issue could not be fetched.
- Which thermostat is it? 'best thermostat' is presumed to be 'Nest thermostat'. If it is a Nest Learning Thermostat 2nd gen (UK), it lost cloud support on 25 Oct 2025 and will not appear in SDM. If it is actually another brand (e.g. Hive, tado, Drayton Wiser), a different integration is needed.
- Unverified: does Fully Kiosk's screensaver, as opposed to a real screen-off, trigger document.hidden so that HA drops the Nest stream? This affects whether the stream stays open overnight.
- Unverified: how many concurrent SDM WebRTC sessions does one Nest cam allow (for example, panel plus a phone viewing at the same time)?
- Does the user want HA OS on separate hardware at all? This area assumes the Home Assistant architecture. Without HA, the only free camera option is launching the Google Home app from a button, because there is no embeddable live widget.
