# Could Android widgets alone do it?

> Research for the earlier Home Assistant plan (superseded by the web app on 25 Sep 2026). Kept for reference; many facts still apply.

<details><summary>The question asked</summary>

Research task (read-only, no file edits). Today is 2026-09-25. A UK user wants a wall-mounted Lenovo Tab M10 (Android) home panel showing: Google Nest camera live view; Octopus Energy live usage from an Octopus Home Mini; the current Octopus Agile price plus the rest of today's prices; indoor temperature from a Nest thermostat; today's Google Calendar events; outside weather; optionally Kia e-Niro battery %; plus shortcuts to Google Keep (shopping list), Spotify, Claude (voice mode), Gemini and the Android home screen.

The main plan uses Home Assistant on an always-on box. I need to know whether a ZERO-EXTRA-HARDWARE alternative is viable: an Android launcher home screen made purely of official app WIDGETS (plus app shortcut icons), kept on screen with a launcher/"always on" setup. For each item, find out whether an official Android home-screen widget exists in 2026 and what it shows:
1. Google Home app widgets: is there a live camera widget or camera-snapshot widget for Nest cams? A thermostat widget (current temperature)? ("Google Home favorites widget", "Google Home camera widget Android")
2. Octopus Energy app (UK) widgets: Agile prices widget? live usage (Home Mini) widget? Also third-party apps with Agile widgets (e.g. "Octopus Agile widget Android", "Agile Predict", "Octopus Compare", "Energy Stats UK", "Octoprice").
3. Google Calendar widget (agenda/today) — yes presumably; confirm.
4. Weather widget (Google weather / Pixel weather not on Lenovo; Met Office app widget; BBC Weather widget).
5. Kia app (com.kia.oneapp.eu or Kia Connect) widget showing battery %?
6. Launchers suitable for a wall panel with a big widget grid and no app drawer clutter (Nova Launcher status 2026, Lenovo's own launcher, "Smart Launcher"), and keeping the screen on (Android "Stay awake while charging" developer option) — and whether "Hey Google" works over a launcher.
7. Any turnkey wall-panel app that aggregates these without a server (e.g. "Hubitat"? no; "Google Home Panel"/"Hub Mode" on non-Pixel tablets in 2026 — did Google bring Pixel Tablet Hub Mode to other Android tablets?).

Tools: load WebSearch via ToolSearch ("select:WebSearch"); most sites are blocked for WebFetch but search snippets are fine; raw.githubusercontent.com works via curl. Be concrete and mark each claim VERIFIED (primary/official source) or UNVERIFIED. Finish with a verdict table: item → widget available? (yes/partial/no) → quality/caveats, and an overall verdict on whether the widget-only approach meets the brief and what it would miss compared with a Home Assistant dashboard. Keep the final report under ~700 words.

</details>

I looked up every item. A home screen made only of widgets covers about two-thirds of the brief, but it fails on the two main items: the live Nest camera view and live Home Mini usage. It works as a stopgap. It does not replace the Home Assistant dashboard.

"Verified" means an official page or the developer's own store listing, usually read through search snippets because most of these sites blocked direct fetching. "Unverified" means press, forums, or my own inference.

**1. Google Home widgets**
- **Cameras:** The Favorites widget (Android 12 or later) can hold a camera tile, but tapping it only opens the app. It shows no live view or snapshot (verified, Google help page 14887882 and 9to5google). The updates in May and September 2026 made the widget respond faster and pause while the screen is off. They did not add camera previews (verified, 9to5google 27 May and 16 Sep 2026).
- **Live camera outside a widget:** The Favorites tab inside the Google Home app streams live camera tiles. Google says live view stops after 12 hours on wired cameras and after 5 minutes on battery ones (verified, Google help page 10065055).
- **Thermostat:** The widget shows thermostat and sensor temperatures, and tapping opens the app (verified). It refreshes about every 30 minutes (verified, 2024 docs).

**2. Octopus**
- **Official Octopus Energy app:** I found no evidence of a home-screen widget (unverified absence). Live Home Mini usage, updating about every 10 seconds, is only inside the app (verified, octopus.energy).
- **Octopus Watch (Smarthound):** £1.99, plus a subscription of £1.79 a month or £11.99 a year. It has Android widgets for current and upcoming prices (verified, developer listing). Home Mini live data came in v5.1 as a subscription feature (verified). Whether the widget itself shows live usage is unverified.
- **OctoDash:** Resizable widgets showing current Agile prices, with 9 colour themes, plus today's and tomorrow's rates in the app (verified, Play listing). A chart of the whole day inside the widget is unverified.
- **Live usage in any widget:** Android refuses automatic widget refresh intervals under 30 minutes (verified, Android developer docs). Apps can force faster updates, but a widget will never feel live the way a dashboard does.
- I did not find Android widgets from Octoprice, Octopus Compare or Energy Stats (Octopus Compare is iOS).

**3. Google Calendar:** Yes. The Schedule (agenda) and Month widgets are official (verified, Calendar help page 10249848).

**4. Weather:** The Met Office app has adjustable-transparency widgets (verified, metoffice.gov.uk). BBC Weather has resizable widgets (unverified, based on older listings). The Google Weather widget is essentially Pixel-only (unverified).

**5. Kia e-Niro:** The new Kia App (com.kia.oneapp.eu) replaces Kia Connect and "provides a widget for the home screen" (verified-ish, Kia UK / dealer page). Owners report logouts, a useless widget as a result (seen on iOS), and the e-Niro's charge level going missing (unverified, forums). Treat battery % as best-effort.

**6. Launcher, staying awake, "Hey Google"**
- **Nova Launcher:** Now owned by Instabridge (January 2026) and showing ads, with reports of ads even in paid Prime (verified, novalauncher.com and Android Authority). Not recommended.
- **Smart Launcher 6.6:** Supports a separate landscape "dashboard" layout and widget stacking (verified, smartlauncher.net). It's the best fit. Lenovo's own launcher does support widgets, but I didn't check its layout options.
- **Keeping the screen on:** The "Stay awake" developer option keeps the screen on while charging (verified).
- **"Hey Google":** Gemini replaces Assistant on Android tablets from 4 September 2026, and "Hey Google" remains the wake word (verified via 9to5google, citing Google). Whether it wakes reliably over a launcher on a budget Lenovo is unverified.
- **Shortcut widgets:** Keep has a Single note widget where you can tick items but not add them. Spotify, Gemini (including a Live shortcut) and Claude all have official Android widgets. Claude's widget offers new chat, voice dictation and photo (verified, support.claude.com). One-tap full voice mode is unverified.

**7. Turnkey panel options**
- **Hub Mode / home panel:** Hub Mode is Pixel Tablet only. The newer "hub mode" lock-screen widget page is Pixel / Android 15–16 only. The Google Home "home panel" needs Android 14 or later (verified). Tab M10 models seem to stop at Android 11–13 (unverified), so none of these reach your tablet.
- **DAKboard:** A cloud service with no home server. It does Calendar and weather, and its External Data / Fetch block could pull the public Agile price feed (verified). It cannot show Nest cameras.

| Item | Widget? | Caveats |
|---|---|---|
| Nest cam live | **No** | Tile only opens the app. Live view needs the Google Home app in the foreground. |
| Nest indoor temp | **Partial** | Favorites widget, about 30-minute refresh, small tiles |
| Home Mini live usage | **No/Partial** | In-app only. Octopus Watch subscription; widget refresh isn't live. |
| Agile now + today | **Yes (third-party)** | Octopus Watch or OctoDash. Full-day chart in a widget unverified. |
| Calendar today | **Yes** | Schedule widget |
| Weather | **Yes** | Met Office or BBC |
| Kia battery % | **Partial** | Kia App widget is flaky and uses cached data |
| Keep, Spotify, Gemini, Claude | **Yes** | Keep: tick only. Claude: dictation, not guaranteed voice mode. |
| Always-on, launcher | **Yes** | Stay awake plus Smart Launcher. Avoid Nova. |

**Overall:** A widget-only setup costs nothing extra (about £2–14 a year for Octopus Watch). It covers calendar, weather, Agile price, thermostat temperature, Keep, Spotify and the AI shortcuts. Compared with a Home Assistant dashboard it misses:
- An always-visible camera view (one tap into the app at best).
- Live Home Mini power.
- Reliable refresh: each widget updates on its own schedule, often 30 minutes.
- A consistent, readable layout on a 10-inch screen.
- Colour-coded Agile charts and alerts.
- Automations.
- A dependable Kia reading.
- Screen dimming at night or when someone walks up.

The closest no-server hybrid is to keep the Google Home app's Favorites tab open for camera and thermostat, with one Octopus Watch or OctoDash widget. You'd lose the widget page while that app is open, though. The HA dashboard is still the right choice if the camera and live usage matter.

Sources:
- [Google Home Favorites widget help](https://support.google.com/googlenest/answer/14887882?hl=en&co=GENIE.Platform%3DAndroid)
- [9to5google: Favorites widget launch, Oct 2024](https://9to5google.com/2024/10/15/google-home-favorites-widget-launch/)
- [9to5google: Google Home update, 27 May 2026](https://9to5google.com/2026/05/27/google-home-camera-automation-more/)
- [9to5google: battery-efficient widget, 16 Sep 2026](https://9to5google.com/2026/09/16/google-home-widget-battery/)
- [Google help: watch live video in Google Home](https://support.google.com/googlehome/answer/10065055?hl=en)
- [Google help: home panel on Android](https://support.google.com/googlehome/answer/10065792?hl=en)
- [Octopus Home Mini FAQ](https://octopus.energy/octopus-home-mini-faq/)
- [Octopus Watch on Google Play](https://play.google.com/store/apps/details?id=uk.smarthound.octopus_energy_watch_edition&hl=en_GB)
- [Octopus Watch live data docs](https://wiki.smarthound.uk/octopus-watch/livedata/)
- [OctoDash on Google Play](https://play.google.com/store/apps/details?id=com.octodash.app&hl=en_GB)
- [Android developers: advanced widgets](https://developer.android.com/develop/ui/views/appwidgets/advanced)
- [Google Calendar home screen help](https://support.google.com/calendar/answer/10249848?hl=en&co=GENIE.Platform%3DAndroid)
- [Met Office Android app accessibility statement](https://www.metoffice.gov.uk/policies/accessibility-weather-app-android)
- [Kia UK: Kia App](https://www.kia.com/uk/electric-hybrid-cars/technology/kia-app/)
- [Kia Owners Club: new Kia App problems](https://www.kiaownersclub.co.uk/threads/a-new-kia-app-problems.82859/)
- [Nova Launcher: "Nova is here to stay"](https://novalauncher.com/nova-is-here-to-stay/)
- [Android Authority: Nova Launcher ads](https://www.androidauthority.com/nova-launcher-acquisition-ads-update-3633871/)
- [Smart Launcher 2025 wrap-up and 6.6](https://www.smartlauncher.net/blog/2025wrapupsl66)
- [9to5google: Gemini replaces Assistant in 2026](https://9to5google.com/2025/12/19/google-assistant-gemini-2026/)
- [Claude widget on Android](https://support.claude.com/en/articles/10534883-use-the-claude-widget-on-android)
- [Gemini widget help](https://support.google.com/gemini/answer/16179553?hl=en&co=GENIE.Platform%3DAndroid)
- [Google Keep home screen help](https://support.google.com/keep/answer/13302793?hl=en)
- [Spotify Android widget](https://support.spotify.com/us/article/spotify-android-widget/)
- [DAKboard External Data / Fetch](https://dakboard.freshdesk.com/support/solutions/articles/35000062047-external-data-fetch-formatting-options)
- [Pixel Tablet Hub Mode setup](https://support.google.com/googlepixeltablet/answer/13554839?hl=en)
