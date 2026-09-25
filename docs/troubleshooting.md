# Troubleshooting

## The dashboard

| Symptom | Fix |
|---|---|
| A card says **"Custom element doesn't exist: …"** | The card isn't installed. Download it in HACS. Or the tablet has the old files cached: clear Fully's browser cache (Fully's settings, or the **Clear browser cache** button on the Fully device in Home Assistant), then reload. |
| Home Assistant's header/sidebar still show | Install **Kiosk Mode** from HACS and reload. Kiosk Mode needs updating alongside Home Assistant (e.g. HA 2026.6+ needs Kiosk Mode 14+). |
| Layout is cut off or scrolls | The browser area is smaller than 1280×800. Android Settings → Display → **Display size** → one step smaller. Also check Fully isn't showing Android's status/navigation bars: turn on Fully's fullscreen option. |
| Layout broke after a Home Assistant update | Update all six HACS cards first. **layout-card** hasn't had an update since Oct 2025. If a future HA release breaks it, the rest of the panel's cards still work in HA's standard "Sections" view, so ask your favourite LLM to convert the file. |
| Chart or price says "Waiting for prices…" | Octopus rates haven't loaded. Settings → Entities → search `current_day_rates`. If the entity is **disabled**, enable it. Otherwise wait 15 minutes after setting up the integration. |
| Chart has no bars after midnight | Normal before about 4pm. Tomorrow's Agile prices aren't published until 4–8pm. |
| Tablet gets sluggish after days on | Install the [extras package](../homeassistant/packages/wall_panel.yaml): its nightly refresh clears memory that slowly builds up in the chart card. |

## Camera

| Symptom | Fix |
|---|---|
| Grey placeholder picture | The card needs `camera_view: live` (the dashboard already has it). Tap the tile: if the live view works there but not on the tile, update **Android System WebView**. |
| Freezes after about 5 minutes | Battery-powered Nest camera. Google won't keep battery streams alive, so use the "tap for live" tile (see the comment in the dashboard file). |
| Black after hours of running | Nightly refresh (extras package), or Fully menu → Reload. |
| No camera entity at all | Check your model is supported ([Nest guide](integrations/nest.md#check-your-devices-first-before-paying-5)) and that you ticked the camera permissions when linking Google. |

## Buttons

| Symptom | Fix |
|---|---|
| No button opens anything (Fully) | Fully → Settings → Advanced Web Settings → **Enable JavaScript Interface** (needs PLUS). If you set a URL whitelist, it must include your Home Assistant address. |
| No button opens anything (Companion app) | Update the Home Assistant app. On first use Android may ask to allow **Display over other apps**. Allow it. |
| **Claude** does nothing or opens the wrong screen | A Claude update may have renamed its voice screen. **Press and hold** the button to open Claude normally, then tap the sound-wave icon. To make that the tap behaviour, delete the `intent:` line under the Claude button in the dashboard file. |
| **Gemini** opens the wrong thing | Press and hold to open the Gemini app. Or change the Gemini button's `intent:` to `intent:#Intent;action=android.intent.action.VOICE_COMMAND;launchFlags=0x10000000;end` (see the ADB test below). |
| **Home** just reloads the panel | Fully (or the HA app) has been set as Android's Home app. Settings → Apps → Default apps → **Home app** → Lenovo's launcher. |
| An app button says the app isn't installed | Install it from the Play Store on the tablet: Google Keep, Spotify, Claude, Gemini. |

Test what an intent opens on your tablet (USB debugging on):

```bash
adb shell cmd package resolve-activity --brief -a android.intent.action.VOICE_ASSIST -p com.google.android.googlequicksearchbox
adb shell cmd package resolve-activity --brief -a android.intent.action.VOICE_COMMAND
adb shell am start -a android.intent.action.VOICE_ASSIST -n com.anthropic.claude/.mainactivity.AssistantOverlayActivity
```

## Voice

| Symptom | Fix |
|---|---|
| "Hey Google" doesn't respond | Gemini → Settings → Hey Google & Voice Match: on and trained. Screen lock set to **None**. Turn off Fully's *acoustic* motion detection. Test with the screen on: many budget tablets don't listen with the screen fully off. |
| "Add … to my shopping list" goes to the wrong list | Keep exactly **one** Keep note called "Shopping list". Or say "…to my shopping list in Google Keep". |
| Spotify: "I can't play that" | Connect Spotify in Gemini's apps settings. A specific song needs Spotify Premium. |

## Integrations

| Symptom | Fix |
|---|---|
| Octopus: `Too many requests` in the log | Too many API calls per hour. Raise the gas Home Mini refresh interval (Integration → Reconfigure). |
| Octopus: "Using now" stuck | Check live usage in the Octopus app. If that's stuck too, unplug the Home Mini for 10 seconds. |
| Nest/Calendar stopped after a week | Your Google OAuth app is still in "Testing". Google Auth Platform → Audience → **Publish app**, then re-link. |
| Kia: unavailable or login failed | Kia changed something. HACS → update **Kia Uvo** → restart → integration → Reconfigure → re-authenticate. |
