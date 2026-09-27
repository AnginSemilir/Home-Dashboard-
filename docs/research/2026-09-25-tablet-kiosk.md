# Tablet, kiosk apps and screen

> Research for the earlier Home Assistant plan (superseded by the web app on 25 Sep 2026). Kept for reference; many facts still apply.

**Area:** tablet-kiosk

## Recommendation

Run the dashboard in Fully Kiosk Browser with a Fully PLUS licence (one-off EUR 7.90 for each device; the free trial shows a watermark). Leave Fully's Kiosk Mode OFF and do NOT make Fully the default Home app, so Android's HOME intent still lands on the Lenovo launcher (com.tblenovo.launcher). Turn on: Launch on Boot, Keep Screen On, Enable JavaScript Interface (PLUS), Remote Administration (PLUS, which the HA fully_kiosk integration needs), Visual Motion Detection with Exit Screensaver on Motion, and a black, low-brightness screensaver. At night, dim the screen instead of turning it off. App buttons: make them custom:button-card v7 buttons with `tap_action: {action: javascript, javascript: "[[[ fully.startApplication('com.spotify.music') ]]]"}`. Use fully.startIntent('intent:#Intent;...;end') when an app needs an intent action (Home screen, VOICE_COMMAND). This runs on the tablet itself and does not go through the HA server. Guard the call with `typeof fully !== 'undefined'`. A server-side fallback that works on any card: fully_kiosk.start_application or fully_kiosk.load_url. An HA automation presses button.<tablet>_bring_to_foreground after N minutes in another app. Zero-cost alternative: the HA Companion app. It can be the Android Home app (launcher) since mid-2025. Its WebView intercepts `app://<package>` and `intent:` links, so a standard `tap_action: {action: url, url_path: app://com.spotify.music}` launches the app. command_launch_app and command_activity notification commands also work from scripts. The trade-offs: no motion wake, no screensaver, and no brightness scheduling except via notify commands. Either way: keep Gemini as the default digital assistant so 'Hey Google' works (Gemini replaces Assistant on tablets from 4 Sep 2026). Claude buttons open com.anthropic.claude; no voice-mode deep link is documented, so voice mode needs one more tap. Protect the always-plugged battery with Lenovo Battery protection mode (40-60%) or a smart-plug 30-80% automation.

## Facts

- custom:button-card v7.0.1 (bundle banner 'BUTTON-CARD v7.0.1'; package.json 7.0.1, released 2025-11-13) supports a custom `javascript` action: `tap_action: {action: javascript, javascript: "[[[ ...code... ]]]"}`. The code has to be a button-card JS template wrapped in exactly three brackets on each side. Anything else is returned as a plain string and nothing runs. The template runs as `new Function('states','entity','user','hass','variables','html','helpers', "'use strict'; " + code)`, so browser globals such as `fully` or `window` are reachable. The same card also offers `multi-actions` (with `delay` and `wait_completion`), `toast`, and `helpers.runAction(actionObj)`. _(source: scratchpad ha/config/www/community/button-card.js (case"javascript" -> _customActionsCallback -> _getTemplateOrValue regex ^(\[{3,})(.*?)(\]{3,})$ -> _evalTemplate); github.com/custom-cards/button-card master docs/source/config/actions.md ('Example - Using a javascript action'))_
- In the HA frontend, a standard `url` action runs `window.open(sanitizeUrl(actionConfig.url_path))` (src/panels/lovelace/common/handle-action.ts). sanitizeUrl comes from @braintree/sanitize-url 7.1.2. It rejects only the javascript:, data: and vbscript: schemes, so `intent:#Intent;...;end` and `app://pkg` pass through unchanged. It does percent-decode the URL repeatedly with decodeURIComponent, which means %-encoded parts of an intent URI (for example S.browser_fallback_url=https%3A...) are decoded before they reach the browser. button-card's own `url` action hands url_path to this same HA action. _(source: raw.githubusercontent.com/home-assistant/frontend/dev/src/panels/lovelace/common/handle-action.ts; frontend package.json; raw.githubusercontent.com/braintree/sanitize-url/main/src/index.ts + constants.ts)_
- Fully Kiosk JavaScript Interface signatures: fully.startApplication(String packageName); fully.startApplication(String packageName, String action, String url) (null is allowed for the unused arguments from v1.33 on); fully.startIntent(String url); fully.broadcastIntent(String url); fully.bringToForeground(); fully.bringToForeground(long millis); fully.bringToBackground(); fully.isInForeground(); fully.turnScreenOn(); fully.turnScreenOff() / turnScreenOff(boolean keepAlive); fully.forceSleep(); fully.getScreenOn(); fully.getBatteryLevel(); fully.isPlugged(); fully.setScreenBrightness(float level); fully.startScreensaver()/stopScreensaver(); fully.startDaydream(); fully.loadStartUrl(); fully.restartApp(); fully.textToSpeech(text[,locale[,engine,queue]]); fully.showToast(text). _(source: Three independent transcriptions of Fully's 'website integration' docs: github.com/sebsst/fullyKiosK core/class/fullyKiosK.class.php; github.com/Familis-co/node-fully-kiosk packages/core/src/js-interface/types.ts; github.com/M4KProject/m4k_common m4k/fullyInterfaces.ts. fully-kiosk.com itself is blocked from this environment.)_
- Fully only injects the `fully` object when Settings > Advanced Web Settings > 'Enable JavaScript Interface' is on. That setting is a PLUS feature (settings key `websiteIntegration`). Fully warns to enable it only if every website that gets loaded is trusted. _(source: sebsst/fullyKiosK docs ('Advanced Web Settings >> Enable JavaScript Interface'; setBooleanSetting key=websiteIntegration); Familis-co types.ts header; WebSearch snippets quoting fully-kiosk.com ('Enable JavaScript Interface (PLUS)'))_
- Fully has a setting that sends tel:, mailto: and intent: URLs to other apps. Its settings key is `enableUrlOtherApps`, default false, as seen in many exported fully-settings.json files. Search snippets give the UI label as 'Open URL Schemes in Other Apps' (listed alongside 'Enable Back Button' under Web Browsing Settings) or 'Open Other URL Schemes'. The exact label and whether it needs PLUS are not confirmed. _(source: GitHub code search: felipecrs/dahua-vto-on-home-assistant default-settings.json, ptorngren/home-assistant-samples fully-export.json, sebsst docs; WebSearch snippets (fully-kiosk.com, kb.mobilesecuregateway.com))_ **[unverified]**
- Fully's 'Enable Popups' setting (PLUS, key enablePopups, default false) is described as 'support popups (also those which open without user interaction) and open links in new frame'. Nobody has confirmed whether a HA `url` tap_action (window.open) reaches Fully's intent handler when popups are off. The JS interface or fully_kiosk.load_url is the deterministic route. _(source: WebSearch snippet quoting fully-kiosk.com manual; key from sebsst settings list)_ **[unverified]**
- Fully REST API format: http://<tablet-ip>:2323/?cmd=<command>&password=<remote admin password>[&type=json]. Commands include startApplication&package=<pkg>, toForeground, toBackground, loadUrl&url=<url> (also loadURL), loadStartURL, screenOn, screenOff, forceSleep, startScreensaver, stopScreensaver, triggerMotion, restartApp, getScreenshot, getCamshot, textToSpeech&text=, setBooleanSetting&key=&value=, setStringSetting&key=&value=, popFragment. A `startIntent&url=` command appears only in one third-party SDK (Familis-co/node-fully-kiosk) and is unconfirmed. Remote Admin is a PLUS feature. _(source: github.com/cgarwood/python-fullykiosk fullykiosk/__init__.py (sendCommand cmd=..., password=..., type=json); sebsst/fullyKiosK docs command list; Familis-co/node-fully-kiosk src/commands/apps.ts)_
- The HA core `fully_kiosk` integration needs Fully Remote Admin (PLUS), uses port 2323 by default and polls every 30 s. It provides three actions: fully_kiosk.load_url (device_id, url), fully_kiosk.start_application (device_id, application = package name; it cannot pass an intent action or URI) and fully_kiosk.set_config (device_id, key, value; the strings 'true'/'false' go to the bool setter, everything else to the string setter). Entities are named after Fully's deviceName with has_entity_name=True. That gives button.<dev>_bring_to_foreground, button.<dev>_send_to_background, button.<dev>_load_start_url, button.<dev>_restart_browser, button.<dev>_restart_device, button.<dev>_clear_browser_cache, button.<dev>_trigger_motion_activity; switch.<dev>_screen, switch.<dev>_screensaver, switch.<dev>_motion_detection, switch.<dev>_maintenance_mode, switch.<dev>_kiosk_lock; number.<dev>_screensaver_timer (s, 0-86400), number.<dev>_screensaver_brightness (0-255), number.<dev>_screen_off_timer, number.<dev>_screen_brightness (0-255); sensor.<dev>_battery, sensor.<dev>_foreground_app (package name), sensor.<dev>_current_page, sensor.<dev>_battery_temperature; binary_sensor.<dev>_plugged_in, binary_sensor.<dev>_kiosk_mode, binary_sensor.<dev>_device_admin. It also creates a camera entity (only works while Motion detection is on), image.<dev>_screenshot, notify entities (Text to speech, Overlay message) and a media_player. _(source: raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/fully_kiosk/{services.yaml,services.py,const.py,button.py,switch.py,number.py,sensor.py,binary_sensor.py,entity.py,strings.json}; home-assistant.io source/_integrations/fully_kiosk.markdown and source/_actions/fully_kiosk.load_url.markdown)_
- Fully PLUS is a one-off licence per device at EUR 7.90 (Fully Cloud is a separate subscription). Every feature can be trialled free, but PLUS features show a watermark until a licence is bought. PLUS covers at least Remote Admin, the JavaScript Interface, Enable Popups and Motion Detection. Snippets also put screensaver, tabs and scheduled wake/sleep behind PLUS; the exact per-feature split is unconfirmed. _(source: WebSearch snippets: license.fully-kiosk.com/license/single, capterra, HA fully_kiosk docs ('requires the paid Fully Plus license... watermark'))_
- Fully settings keys that matter for a wall panel, taken from real settings exports: launchOnBoot, keepScreenOn, keepScreenOnAdvanced (Android 10+, Fully 1.44+), forceScreenUnlock ('Unlock Screen'), motionDetection, screenOnOnMotion, stopScreensaverOnMotion, motionDetectionAcoustic, motionSensitivity, timeToScreensaverV2, screensaverBrightness, screensaverWallpaperURL (e.g. fully://color#000000), timeToScreenOffV2, screenBrightness, kioskMode, kioskAppWhitelist, disableOtherApps, timeToRegainFocus, runInForeground, urlWhitelist, remoteAdmin, remoteAdminPassword, remoteAdminLan, websiteIntegration, enableUrlOtherApps, enablePopups, webcamAccess, microphoneAccess, forceScreenOrientation. The HA fully_kiosk.set_config action can set any of them, and so can setBooleanSetting / setStringSetting over REST. _(source: GitHub code search results (fully-settings.json exports); M4KProject fullyInterfaces.ts; tzlev-2 fully-kiosk-js types.ts (grouped by UI section))_
- Since mid-2025 the HA Android Companion app can be the device's default Home app (launcher): Settings > Companion app > Device home screen > 'Use as Home app (launcher)', then 'Change home app'. The Home button then returns to HA, and the device boots straight into HA. Other settings: 'Keep screen on' (Settings > Companion app > Other settings), and 'Always show first view on app start'. iOS has a full Kiosk mode (screensaver, kiosk_* notify commands), but it is iOS-only. The Android docs point to the Home app feature as the alternative. _(source: github.com/home-assistant/companion.home-assistant docs/integrations/android-home-app-launcher.md, ios-kiosk-mode.md, android-webview.md (commit 2026-09-22); home-assistant.io blog 2025-07-23-companion-app-for-android ('You can now set the Home Assistant app as your device's default launcher'))_
- The Companion app's WebView intercepts `app://<package>` links, opening them with packageManager.getLaunchIntentForPackage (Play Store listing if the app isn't installed). It also intercepts `intent:` links, which it parses with Intent.parseUri(uri, URI_INTENT_SCHEME) and starts. The official docs show this with weblink cards (`url: "app://com.twitter.android"`). The app declares QUERY_ALL_PACKAGES and SYSTEM_ALERT_WINDOW. One 2024 forum thread reported `tap_action: {action: url, url_path: app://...}` doing nothing, so test on your installed version. _(source: github.com/home-assistant/android main (2026-09-22): app/.../frontend/FrontendViewModel.kt onUrlIntercepted (APP_PREFIX='app://', INTENT_PREFIX='intent:'), common/.../util/ContextExt.kt launchAppOrStore/launchIntentUri/parseExternalIntentUri, app/src/main/AndroidManifest.xml; companion docs android-webview.md 'Links'; community.home-assistant.io/t/754548)_
- Companion notification commands for launching apps: `message: command_launch_app` with data.package_name, and `message: command_activity` with data.intent_action (required), plus optional intent_uri, intent_package_name, intent_class_name, intent_extras ('name:value,name2:value2'), intent_type. There is no category parameter, so a HOME-category intent cannot be sent this way; launch the launcher package with command_launch_app instead. Both commands need the 'Display over other apps' permission, and the first command sends you to grant it. Docs recommend local push for fast, unlimited commands. Other relevant commands: command_screen_on (optionally command: keep_screen_on), command_screen_brightness_level, command_screen_off_timeout, command_webview, command_wake_word_detection. _(source: companion.home-assistant docs/notifications/commands.md; home-assistant/android MessagingManager.kt (processActivityCommand, launchApp, canDrawOverlays checks))_
- Android intent URI grammar, from Intent.parseUri: `intent:[data]#Intent;action=X;category=Y;type=T;launchFlags=0x10000000;package=P;component=P/C;scheme=S;S.key=str;B.key=bool;i.key=int;end`. FLAG_ACTIVITY_NEW_TASK is 0x10000000, CATEGORY_HOME is 'android.intent.category.HOME', ACTION_VOICE_COMMAND is 'android.intent.action.VOICE_COMMAND' (docs warn that 'a matching Activity may not exist') and ACTION_ASSIST is 'android.intent.action.ASSIST'. ACTION_VOICE_ASSIST is @SystemApi/@hide, so don't use it. _(source: raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/main/core/java/android/content/Intent.java (parseUriInternal, constants))_
- Package names: Spotify com.spotify.music; Google Keep com.google.android.keep; Gemini com.google.android.apps.bard; Google app (Assistant/Gemini overlay host) com.google.android.googlequicksearchbox; Claude com.anthropic.claude; Lenovo stock launcher com.tblenovo.launcher (its activity com.android.searchlauncher.SearchLauncher appears in a Lenovo Tab API 30 surfaceflinger dump); Fully Kiosk de.ozerov.fully; HA Companion io.homeassistant.companion.android. _(source: Play Store URLs in search results (…?id=com.google.android.apps.bard, …?id=com.anthropic.claude); sebsst docs Spotify example; androidx/androidx benchmark lenovoTab_api30_surfaceflingerDump*.txt and rajvishwakarma1/Debloat-Lenovo-Tab-M10 via GitHub code search; HA fully_kiosk services.yaml example 'de.ozerov.fully'. Google app package from general knowledge.)_
- Claude for Android needs Android 8.0+. Voice mode starts from the waveform icon in the chat input. The Android home-screen widget's mic button starts DICTATION, not voice mode. The only documented claude:// mobile deep links are claude://code, claude://code/{session-id} and claude://code/new?q=&mode=&repo=&branch=. There is no documented link for a new chat or for voice mode. _(source: support.claude.com articles 9612887 (install), 11101966 (voice mode), 10534883 (Android widget), 14898120 (open mobile app with a link), fetched via WebFetch)_
- Claude can reportedly be chosen as Android's default digital assistant app, so long-press power opens Claude (Android Police, May 2026; anthropics/claude-code issue #41696 on ROLE_ASSISTANT being cleared after reinstall). Claude's help center does not document this. Only one app can be default assistant, and 'Hey Google' needs Google/Gemini to be the default. _(source: WebSearch: androidpolice.com 'I switched from Gemini to Claude for a month on Android'; github.com/anthropics/claude-code/issues/41696 (title only))_ **[unverified]**
- Google is replacing Google Assistant with Gemini on Android phones AND tablets starting 4 September 2026, rolling out over several weeks. Afterwards you cannot switch back. The 'Hey Google' hotword moves over to Gemini. The Gemini app needs 2 GB+ RAM and Android 9+ (some sources say 10+). Android Go devices get Gemini Go. _(source: WebSearch: 9to5google 2026-08-04, seroundtable, searchengineland, businesstoday (Aug 2026), support.google.com/gemini/answer/14579026)_
- Chrome and Android System WebView 139+ (Aug 2025) require Android 10+, so Android 8/9 tablets are stuck on WebView 138 and the HA frontend will eventually break on them. The Lenovo Tab M10 FHD Plus (TB-X606F) ends at Android 10. The Tab M10 HD Gen 2 (TB-X306F) got Android 11 only on the 4 GB/64 GB variant. _(source: WebSearch: 9to5google 2025-06-26, androidauthority; forums.lenovo.com Android upgrade matrix snippets)_
- Lenovo Tab M10 family, from search snippets: M10 HD Gen 2 TB-X306F/X (2020) 10.1in 1280x800, Helio P22T, Android 10 -> 11 (4 GB only). M10 FHD Plus 2nd Gen TB-X606F/X (2020) 10.3in 1920x1200, Helio P22T, Android 9 -> 10, EOL 2022. Tab M10 Gen 3 TB328FU/XU (2022) 10.1in 1920x1200 IPS, Unisoc T610, Android 11 -> 12, 5000 mAh. Tab M10 Plus Gen 3 TB125FU (Helio G80) / TB128FU/XU (Snapdragon 680) (2022) 10.61in 2000x1200 IPS 400 nits, Android 12 -> 13. Tab M10 5G TB360ZU (Jul 2023) 10.61in 2000x1200 90 Hz, Snapdragon 695, 7700 mAh, Android 13. Every one of them has an IPS LCD, not OLED. The successor line is the Tab M11 (2024). _(source: WebSearch snippets: psref.lenovo.com spec PDFs, gsmarena, notebookcheck, devicespecifications, vodafone device guides, Lenovo forums (psref and gsmarena blocked for direct fetch))_ **[unverified]**
- Lenovo tablets have a 'Battery protection mode' (Settings > Battery, under 'Battery optimization' on the M10 Plus Gen 3 with Android 13). With it on, the tablet stops charging at 60% and starts again below 40%. An XDA thread for the TB-125FU also mentions a separate 'Battery maintenance mode'. _(source: WebSearch snippets: pcsupport.lenovo.com HT510061 'How to enable Battery Protection Mode - Smart Tab' (Tab M10 HD); forums.lenovo.com 'Battery-Protection-Mode-40-60'; deviceguides.vodafone.co.uk M10 Plus 3rd Gen Android 13; xdaforums TB-125FU thread title)_ **[unverified]**
- Lenovo Smart Tab M10 bundles (with Smart Charging Station / Google Assistant Ambient Mode, or Alexa Show Mode) supported 'Hey Google' on the lock screen. Whether plain M10 models detect the hotword with the screen OFF is unconfirmed; that needs low-power hotword hardware. Google Entertainment Space and Kids Space are optional overlays on Lenovo's launcher, have nothing to do with a Fully/HA kiosk, and can be disabled. _(source: WebSearch: gearbrain Ambient Mode article; Lenovo support 'tab-m10-hd-2nd-gen-with-smart-charging-station-google-assistant'; Lenovo forum threads on disabling Entertainment Space)_ **[unverified]**
- A Google Home/Keep bug (reported 25 Aug 2026) broke 'add X to my shopping list' via Assistant/Gemini into Google Keep lists. _(source: WebSearch: 9to5google.com/2026/08/25/google-home-keep-integration-broken-due-to-bug/)_ **[unverified]**
- The HA Companion Android app has minSdk 23 (Android 6.0), so it runs on every M10 generation. The latest Fully Kiosk Play build seen is 1.61.3-play (7 Sep 2026, from an AppBrain snippet). _(source: home-assistant/android gradle/libs.versions.toml (androidSdk-min = 23); WebSearch appbrain snippet)_

## Config snippets

```
# Dashboard raw config (top level), custom:button-card v7 templates.
# Inside Fully, this uses the JS Interface. Anywhere else (e.g. the HA Companion app) it falls back to app:// links.
button_card_templates:
  android_app:
    show_state: false
    tap_action:
      action: javascript
      javascript: |
        [[[
          const pkg = variables.pkg;
          if (typeof fully !== 'undefined') {
            fully.startApplication(pkg);
          } else {
            window.open('app://' + pkg);   // only does something inside the HA Companion app
          }
        ]]]
  android_intent:
    show_state: false
    tap_action:
      action: javascript
      javascript: |
        [[[
          if (typeof fully !== 'undefined') {
            fully.startIntent(variables.intent);
          } else {
            window.open(variables.intent);  // HA Companion app parses intent: URIs itself
          }
        ]]]
```

```
# Buttons (e.g. in a horizontal-stack or grid)
- type: custom:button-card
  template: android_app
  name: Spotify
  icon: mdi:spotify
  variables: {pkg: com.spotify.music}
- type: custom:button-card
  template: android_app
  name: Shopping list
  icon: mdi:cart-outline
  variables: {pkg: com.google.android.keep}
- type: custom:button-card
  template: android_app
  name: Claude
  icon: mdi:robot-outline
  variables: {pkg: com.anthropic.claude}   # opens the app; tap the waveform icon for voice mode (no documented voice deep link)
- type: custom:button-card
  template: android_app
  name: Gemini
  icon: mdi:google
  variables: {pkg: com.google.android.apps.bard}
- type: custom:button-card
  template: android_intent
  name: Ask Google
  icon: mdi:microphone
  variables:
    intent: 'intent:#Intent;action=android.intent.action.VOICE_COMMAND;launchFlags=0x10000000;end'   # UNVERIFIED: which UI opens after the Gemini switch; test with adb first
- type: custom:button-card
  template: android_intent
  name: Home screen
  icon: mdi:home-export-outline
  variables:
    intent: 'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.HOME;launchFlags=0x10000000;end'
```

```
# Exact intent URIs (Fully: fully.startIntent(...); Companion: tap_action url_path; both parse with Intent.parseUri)
HOME screen (default launcher):  intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.HOME;launchFlags=0x10000000;end
Lenovo launcher explicitly:      intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.tblenovo.launcher;launchFlags=0x10000000;end   (or fully.startApplication('com.tblenovo.launcher'))
Voice command (Assistant/Gemini): intent:#Intent;action=android.intent.action.VOICE_COMMAND;launchFlags=0x10000000;end
Default assistant (ASSIST):      intent:#Intent;action=android.intent.action.ASSIST;launchFlags=0x10000000;end
Pin to Google app if a chooser appears: intent:#Intent;action=android.intent.action.VOICE_COMMAND;package=com.google.android.googlequicksearchbox;launchFlags=0x10000000;end
Gemini app:   intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.google.android.apps.bard;launchFlags=0x10000000;end
Spotify:      intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.spotify.music;launchFlags=0x10000000;end
Spotify playlist (UNVERIFIED): fully.startApplication('com.spotify.music','android.intent.action.VIEW','spotify:playlist:<PLAYLIST_ID>')
Google Keep:  intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.google.android.keep;launchFlags=0x10000000;end
Claude:       intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.anthropic.claude;launchFlags=0x10000000;end
Companion-only short form: app://com.spotify.music  app://com.google.android.keep  app://com.anthropic.claude  app://com.google.android.apps.bard  app://com.tblenovo.launcher
```

```
# HA Companion app route: standard cards (no custom card needed)
- type: button
  name: Spotify
  icon: mdi:spotify
  tap_action:
    action: url
    url_path: app://com.spotify.music
- type: button
  name: Home screen
  icon: mdi:home-export-outline
  tap_action:
    action: url
    url_path: app://com.tblenovo.launcher   # use this rather than a HOME intent if the Companion app is the Home app
```

```
# HA Companion app route: scripts using notification commands (the tablet needs 'Display over other apps')
script:
  tablet_open_spotify:
    alias: "Tablet: open Spotify"
    sequence:
      - action: notify.mobile_app_lenovo_tab
        data:
          message: command_launch_app
          data:
            package_name: com.spotify.music
  tablet_voice_command:
    alias: "Tablet: start Google/Gemini voice"
    sequence:
      - action: notify.mobile_app_lenovo_tab
        data:
          message: command_activity
          data:
            intent_action: android.intent.action.VOICE_COMMAND
  tablet_home_screen:
    alias: "Tablet: go to Android home screen"
    sequence:
      - action: notify.mobile_app_lenovo_tab
        data:
          message: command_launch_app
          data:
            package_name: com.tblenovo.launcher
```

```
# Fully route through the HA server (works from any standard card: tap_action: {action: perform-action, perform_action: script.xxx})
script:
  tablet_fully_open_keep:
    sequence:
      - action: fully_kiosk.start_application
        data:
          device_id: YOUR_FULLY_DEVICE_ID
          application: com.google.android.keep
  tablet_fully_voice:
    sequence:
      - action: fully_kiosk.load_url          # needs enableUrlOtherApps=true; works per community reports, not confirmed
        data:
          device_id: YOUR_FULLY_DEVICE_ID
          url: "intent:#Intent;action=android.intent.action.VOICE_COMMAND;launchFlags=0x10000000;end"
```

```
# Optional raw REST alternative (configuration.yaml + secrets.yaml). The whole templated URL lives in secrets so the password stays out of config.
# configuration.yaml
rest_command:
  fully_start_app:
    url: !secret fully_start_app_url
  fully_load_url:
    url: !secret fully_load_url_url
# secrets.yaml
fully_start_app_url: "http://192.168.1.50:2323/?cmd=startApplication&package={{ package }}&password=CHANGEME&type=json"
fully_load_url_url: "http://192.168.1.50:2323/?cmd=loadUrl&url={{ url | urlencode }}&password=CHANGEME&type=json"
# usage: action: rest_command.fully_start_app  data: {package: com.spotify.music}
```

```
# Bring Fully back to the dashboard after 10 min in another app (HA 2024.10+ syntax)
automation:
  - alias: "Tablet: return to dashboard"
    triggers:
      - trigger: state
        entity_id: sensor.lenovo_tab_foreground_app
        not_to: ["de.ozerov.fully", "unavailable", "unknown"]
        for: "00:10:00"
    actions:
      - action: button.press
        target:
          entity_id: button.lenovo_tab_bring_to_foreground
```

```
# Night dimming and charge limiting (the Fully integration provides these entities)
automation:
  - alias: "Tablet: dim at night"
    triggers:
      - trigger: time
        at: "22:30:00"
    actions:
      - action: number.set_value
        target: {entity_id: number.lenovo_tab_screen_brightness}
        data: {value: 15}          # 0-255
  - alias: "Tablet charger: hold battery 30-80%"
    triggers:
      - trigger: numeric_state
        entity_id: sensor.lenovo_tab_battery
        below: 30
        id: low
      - trigger: numeric_state
        entity_id: sensor.lenovo_tab_battery
        above: 80
        id: high
    actions:
      - action: "switch.turn_{{ 'on' if trigger.id == 'low' else 'off' }}"
        target: {entity_id: switch.tablet_charger_plug}
```

```
# Set Fully options from HA (keys taken from Fully settings exports)
- action: fully_kiosk.set_config
  data: {device_id: YOUR_FULLY_DEVICE_ID, key: websiteIntegration, value: "true"}
- action: fully_kiosk.set_config
  data: {device_id: YOUR_FULLY_DEVICE_ID, key: enableUrlOtherApps, value: "true"}
- action: fully_kiosk.set_config
  data: {device_id: YOUR_FULLY_DEVICE_ID, key: screensaverWallpaperURL, value: "fully://color#000000"}
```

```
# Test intents before building buttons (USB debugging on, PC with adb)
adb shell am start -a android.intent.action.VOICE_COMMAND
adb shell am start -a android.intent.action.ASSIST
adb shell cmd package resolve-activity --brief -a android.intent.action.VOICE_COMMAND
adb shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME
adb shell monkey -p com.anthropic.claude -c android.intent.category.LAUNCHER 1
```

## Gotchas

- `fully` only exists inside Fully with 'Enable JavaScript Interface' (PLUS) turned on. On a phone or PC dashboard it is undefined, so always guard with `typeof fully !== 'undefined'`. button-card templates run in 'use strict', where an unguarded reference throws a ReferenceError.
- The button-card `javascript:` value must be wrapped in exactly `[[[` and `]]]`. Without them the string is never run and the button silently does nothing.
- Don't turn on Fully's Kiosk Mode, and don't set Fully (or the Companion app) as the default Home app, if you want the 'Android home screen' button. The HOME intent opens whatever the default launcher is, and Fully's Kiosk Mode blocks other apps unless they are in the Kiosk App Whitelist. If HA or Fully must be the launcher, the home button should start com.tblenovo.launcher explicitly.
- Android 10+ blocks apps in the background from starting activities. Launches triggered from the server (fully_kiosk.start_application, REST, Companion notify commands) while another app is in front need the 'Display over other apps' permission for Fully or the HA app. Button-card/JS launches from the dashboard in the foreground are not affected.
- The HA frontend's url action percent-decodes the URL (sanitizeUrl). Keep intent URIs free of %-encoding, or call fully.startIntent from button-card, which skips sanitizeUrl.
- Nobody has confirmed whether a plain HA `url` action (window.open) works in Fully while 'Enable Popups' is off, or whether intent: needs 'Open URL Schemes in Other Apps' (enableUrlOtherApps). Prefer the JS interface or fully_kiosk.* actions.
- Security: once the JS Interface is on, any page loaded in Fully can call fully.*. Set Fully's URL Whitelist to your HA URL only. The Remote Admin password travels in plain HTTP query strings on port 2323, so keep it LAN-only and never port-forward it.
- Motion detection keeps the front camera running: Android's privacy dot stays on, and it costs heat and power. Many devices stop camera motion detection once the screen is actually OFF, so use a black, low-brightness screensaver (screensaverWallpaperURL fully://color#000000) instead of Screen Off. This comes from community reports.
- Skip Fully's acoustic motion detection and in-WebView microphone access if you rely on 'Hey Google'. A mic conflict is possible (unconfirmed).
- 'Hey Google' with the screen fully off depends on hotword DSP hardware, and budget M10 models may only listen while the screen is on (unconfirmed per model). Keeping the panel always on and dimmed avoids the problem.
- Only one app can be the default digital assistant. Keep Gemini (post-4 Sep 2026) as default for 'Hey Google'. Making Claude the default reroutes long-press and ASSIST.
- Claude has no documented deep link into voice mode, and the widget's mic button is dictation, not voice mode. A Claude button opens the app, then one tap on the waveform icon starts voice mode.
- After the Gemini switch, ACTION_VOICE_COMMAND/ASSIST may open the Gemini overlay, the Google app or a chooser. Check with `adb shell cmd package resolve-activity` and add package=com.google.android.googlequicksearchbox if needed.
- The fully_kiosk integration polls every 30 s, so foreground_app, battery and screen state can lag up to 30 s. Entity IDs come from Fully's deviceName, so rename the HA device (e.g. 'Lenovo Tab') before building automations.
- Older M10s on Android 8/9 no longer get WebView updates (Chrome 139+ needs Android 10+). Prefer a Gen 3 / Plus Gen 3 / 5G unit. The TB-X306F 2 GB variant and the TB-X606F stay on Android 10.
- A tablet sitting at 100% charge all the time risks battery swelling in a wall mount. Turn on Lenovo Battery protection mode (40-60%) if your model has it, otherwise put the charger on a smart plug and use a 30-80% automation.
- All M10 models use IPS LCDs, so permanent burn-in is unlikely but temporary image retention can happen. Dim at night, use a screensaver, and move content around slightly if static elements linger.
- The HA Companion app has no screensaver, motion wake or auto-dim on Android (Kiosk mode is iOS-only). With 'Keep screen on' it stays at full brightness unless an automation sends command_screen_brightness_level.
- The Companion app's app:// and intent: interception is confirmed in current source (main, Sep 2026), but a 2024 forum thread saw url-action app:// do nothing. Test on the Play Store build you actually install.
- In-dashboard HA Assist voice (browser microphone) needs a secure context (HTTPS) in both Fully and Chrome. The Companion app's native Assist does not have this limitation. This is a web-platform rule that was not re-checked in this research.
- Keep shopping-list-by-voice was reported broken for Gemini/Assistant in late Aug 2026. Re-test before relying on it.

## Setup steps

- Find the exact model and Android version: Settings > About tablet (model TB-xxx). Install every system update. For stable updates, the Gen 3, Plus Gen 3 (Android 13) or M10 5G are the ones to prefer.
- Android settings: Screen lock = None (or rely on Fully's 'Unlock Screen'). Settings > Battery > Battery protection mode = ON if present. Set the Fully app's battery usage to Unrestricted, and allow 'Display over other apps' for Fully (and for Home Assistant if you use it). Lock the orientation to landscape.
- Keep Gemini as the default digital assistant: Settings > Apps > Default apps > Digital assistant app. Turn on 'Hey Google' / Voice Match in Gemini settings. Test that the hotword works while the screen is on and dimmed.
- Install Fully Kiosk Browser (Play Store de.ozerov.fully, or the APK from fully-kiosk.com) and buy PLUS (EUR 7.90, one-off per device) from Fully's menu or license.fully-kiosk.com.
- In Fully Settings: Start URL = http://<HA-IP>:8123/<your-dashboard> (log in once with a dedicated non-admin HA user). Advanced Web Settings > Enable JavaScript Interface ON. URL Whitelist = your HA URL. Web Browsing Settings > Open URL Schemes in Other Apps ON (only needed for the url/load_url intent route). Device Management > Launch on Boot ON, Keep Screen On ON, Unlock Screen ON. Motion Detection (PLUS) > Enable Visual Motion Detection ON, Exit Screensaver on Motion ON (acoustic OFF). Screensaver: timer about 120 s, brightness 0-10, wallpaper fully://color#000000. Remote Administration (PLUS): enable, set a password, allow from local network. Kiosk Mode: OFF.
- In HA: Settings > Devices & services > Add integration > Fully Kiosk Browser (tablet IP and Remote Admin password). Rename the device to 'Lenovo Tab' so entities come out as button.lenovo_tab_bring_to_foreground, sensor.lenovo_tab_foreground_app, and so on. Note the device_id for the fully_kiosk.* actions.
- Install custom:button-card from HACS (v7.0.1). Add the `button_card_templates` block to the dashboard's raw config, then add the app, voice and home buttons.
- Before wiring buttons, test each intent over adb: `adb shell am start -a android.intent.action.VOICE_COMMAND`, `adb shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME`. Confirm the launcher package really is com.tblenovo.launcher on your unit.
- Add the 'return to dashboard' automation and the night-dim automation. If your model has no Battery protection mode, add a smart plug on the charger with the 30-80% automation.
- Free alternative instead of Fully: install the HA Companion app, sign in as the tablet user, then Settings > Companion app > Device home screen > Use as Home app (launcher) (optional) and Other settings > Keep screen on. Enable local push for the home Wi-Fi. Use `tap_action: {action: url, url_path: app://<package>}` buttons or the command_launch_app scripts.

## Open questions

- Which M10 does the user have (TB-X306F, TB-X606F, TB328FU, TB125FU/TB128FU, TB360ZU)? This decides the Android version, Gemini support, whether Battery protection mode exists, and how the hotword behaves.
- Is the user happy to pay EUR 7.90 for Fully PLUS (motion wake, screensaver, HA integration, JS interface), or do they prefer the free Companion-app route without motion wake or screensaver?
- Is Fully's 'Open URL Schemes in Other Apps' (enableUrlOtherApps) a free or PLUS feature, what is its exact UI label and location, and does a HA url action (window.open) reach it while 'Enable Popups' is off?
- Does the Fully REST API really accept cmd=startIntent&url=...? Only one third-party SDK lists it.
- On a Gemini-migrated tablet (after 4 Sep 2026), what exactly opens for android.intent.action.VOICE_COMMAND and for ASSIST: the Gemini overlay listening, the Gemini app, or a chooser?
- Does the Claude Android app expose any launchable voice-mode activity or shortcut? This could be checked on-device with `adb shell dumpsys shortcut com.anthropic.claude` or `dumpsys package com.anthropic.claude`.
- Does 'Hey Google' work with the screen off on the user's specific M10 model? If not, is always-on-and-dimmed acceptable?
- Is the Companion app's new Compose frontend, with app:// and intent: interception, in the Play Store release the user will install, and does a url tap_action with app:// work there?
