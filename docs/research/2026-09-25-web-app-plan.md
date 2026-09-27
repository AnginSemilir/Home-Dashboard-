# The web-app plan (as agreed)

> Current: the plan the web app was built from.

## Context

**What you asked for:** a wall-mounted Lenovo Tab M10 (3rd gen, TB328, Android 12) panel with:
- Nest camera (battery-powered)
- Octopus Home Mini live usage
- Agile price now and for the rest of the day
- Nest thermostat temperature
- today's Google Calendar
- weather
- Kia e-Niro battery (optional)
- buttons, some also usable by voice, for the shopping list, Spotify, Claude voice, Gemini and the home screen

**Your constraints:** free, no lost functionality. You asked: *"Do we need Home Assistant? Can't we do this with a GitHub page?"*

**Answer: no, we don't need Home Assistant.** A single web page on GitHub Pages, running on the tablet, can talk to Google, Octopus and the weather service directly. There's no server and nothing else to keep switched on. The evidence:

- **Nest camera + thermostat + Google sign-in in a browser:** confirmed in Google's official sample web app (`google/device-access-sample-web-app`). It does the sign-in, the token refresh, Nest API calls and the **live WebRTC camera stream** entirely client-side. Google Calendar uses the same sign-in.
- **Octopus:**
  - Several live GitHub Pages sites call the Agile rates API straight from the page.
  - Open-source browser-only apps (`rahbut/octopus-compare`, `Chronickle/SolarBatteriesAnalysis`) call the authenticated account API and the GraphQL API, including `smartMeterTelemetry` (Home Mini), with no proxy.
  - One report disagrees, so this is the **first thing tested on the tablet**. There's a free fallback (below).
- **Weather:** Open-Meteo is free, needs no key, and works straight from the page.
- **Your repo is public**, so GitHub Pages is free: `https://anginsemilir.github.io/Home-Dashboard-/`.

**v1** (the Home Assistant version, commit `46756f4`) is removed from the main tree but stays in git history. The lessons from its review that carry over (guard every missing value, handle DST, don't over-claim untested features, keep secrets off the public repo) are applied here.

## What works, and how

| Item | Status | How |
|---|---|---|
| Nest camera (battery) | ✅ | Card shows "Front door, tap for live". A tap starts a WebRTC stream straight from Google (Google stops battery streams after 5 min) |
| Nest thermostat temperature | ✅ | Nest API, every 5 min |
| Google Calendar (today, tomorrow) | ✅ | Calendar API, same Google sign-in (one consent screen covers Nest + Calendar) |
| Weather + forecast | ✅ | Open-Meteo (can use the Met Office UK model) |
| Agile price now + rest of day + tomorrow (after ~4pm) | ✅ (verify CORS on device) | Octopus REST. The page finds your tariff and region from your account |
| Home Mini live usage | ✅ (verify CORS on device) | Octopus GraphQL `smartMeterTelemetry`, every 60 s (Octopus allows 100 calls/hour) |
| Shopping list, Spotify, Claude voice, Gemini voice, Home buttons | ✅ in WebView Kiosk | Android `intent:` links (see "Tablet") |
| Kia battery | ⚠️ optional experiment | Free GitHub Actions job every 30 min reads the car's last-uploaded battery % and publishes it **encrypted**; only the tablet has the key. Kia may block GitHub's servers; if so, the tile becomes an "Open Kia app" button |
| Screen always on, full screen | ✅ | Kiosk app's keep-screen-on (or Screen Wake Lock in Chrome) |
| Night dimming | ✅ | Near-black overlay 22:30–06:30, tap to wake (plus the kiosk app's brightness setting if available) |

**Cost:** £0, plus Google's unavoidable one-off **US$5** Nest Device Access fee (any app needs it to read Nest devices).

**Secrets never touch the repo.** The site is public, so anyone opening the URL just sees an empty "set me up" screen. You type the Octopus API key, account number, and Google client ID and secret once into the page's Settings screen on the tablet, and they're stored only in that browser.

## Tablet

- **Recommended: WebView Kiosk** (free, open source, on F-Droid and Play; updated Sept 2026). It shows the page full screen and keeps the screen on. It passes `intent:` links straight to Android, so:
  - **Home** can go to the Android home screen.
  - **Claude** can open Claude's assistant/voice screen (untested on a device, like before; press-and-hold opens the normal app).
  - **Gemini** can start voice.
  - Don't set it as the default launcher, or Home would bounce back to the panel.
- **Fallback: Chrome → Install app** (full screen). In Chrome, Home isn't possible (use the swipe gesture). Claude opens a new chat (tap the voice icon). Gemini opens the Gemini app. The page detects which browser it's in and uses the right kind of link.
- **Also on the tablet:**
  - "Hey Google" (Gemini) stays the voice assistant.
  - Lenovo battery protection on.
  - Screen lock none, with a household Google account.
  - Optional MacroDroid "on boot → open the kiosk app".

## Design

- **Static site in `web/`, no build step:** plain HTML, CSS and ES modules, easy for you or an LLM to edit. Deployed by `.github/workflows/pages.yml`. You enable it once: repo Settings → Pages → Source: **GitHub Actions**.
- **Modules:**
  - `settings.js`: settings screen and localStorage.
  - `google.js`: OAuth code flow through Nest's partner-connection page; scopes `sdm.service` + `calendar.readonly`; refresh token; auto-refresh.
  - `nest.js`: thermostat and WebRTC camera.
  - `calendar.js`
  - `octopus.js`: account discovery, rates, Home Mini.
  - `weather.js`
  - `kia.js`: fetch and decrypt the Action's reading.
  - `launcher.js`: kiosk vs Chrome links.
  - `chart.js`: SVG bars, no library.
  - `ui.js`: layout.
- **Layout:** the same look as the 1280×800 design you saw. The camera becomes a tap-for-live card. It also fits 1333×800 and 960×600.
- **Robustness:**
  - Each data source updates on its own and backs off on errors, showing a small "stale" marker instead of breaking the page.
  - Screen wake lock re-acquired.
  - Nightly reload at 03:30.
  - Camera stream always stopped after 5 min or when closed.
  - Correct half-hour maths on clock-change days.
- **Octopus fallback if a browser can't call it:** a 15-line free Cloudflare Worker proxy, documented but not deployed unless needed.

## Work items

1. `web/`: the app, with a first-run **Setup checklist** screen (✓/✗ per data source, and the Google sign-in button).
2. `.github/workflows/pages.yml` (deploy). Also `kia.yml` (optional, off until you add the Kia secrets): cron every 30 min at off-peak minutes; cached data only, never wakes the car; encrypted `{battery %, time}` → a secret gist.
3. Docs:
   - `README.md`: overview, the table above, costs, setup order.
   - `docs/google.md`:
     - Cloud project, the Nest and Calendar APIs.
     - OAuth "Web application" client with the Pages URL as redirect.
     - **Publish app** so sign-in doesn't expire in 7 days.
     - $5 Device Access.
     - **Save the client secret.**
     - Supported cameras.
   - `docs/octopus.md`
   - `docs/tablet.md`: WebView Kiosk settings, Chrome fallback, battery, household account.
   - `docs/voice-and-apps.md`: Gemini, the Keep list, Spotify, Claude, with honest "untested on device" notes.
   - `docs/kia.md` (optional Action)
   - `docs/customising.md`
   - `docs/troubleshooting.md`
4. Remove `homeassistant/` and `dev/preview/`, and link commit `46756f4` for anyone wanting the Home Assistant version.
5. Tests in `web/test/`, described in Verification.

## Verification

- **`node --test` unit tests:**
  - Agile slots: current slot, rest of day, cheapest ahead, tomorrow's slots missing before 4pm, **46/50-slot clock-change days**, London time.
  - Price colours.
  - Octopus/Google response parsing.
  - Token expiry.
  - Calendar "today" logic (all-day and multi-day events, finished events hidden).
  - Kia decrypt.
  - Link choice per browser.
- **Playwright browser tests, every API call faked with realistic data:**
  - Setup flow.
  - Google redirect → code exchange → refresh.
  - Every tile renders; API errors → stale marker.
  - Slot and midnight rollover.
  - Night overlay.
  - Camera tap sends a correct `GenerateWebRtcStream` request and stops after 5 min.
  - Buttons produce the expected `intent:` links in kiosk mode and Chrome mode.
  - Screenshots at 1280×800 / 1333×800 / 960×600, with **no overflow and no console errors**. I look at each one.
- Secret scan of the repo. Adversarial review pass (as before), then fix, re-test and push to `claude/lenovo-m10-home-dashboard-wwqe4q`.
- **Things only you can confirm on the tablet** (the setup checklist shows them):
  - Octopus calls allowed from the page.
  - Real Google sign-in and camera stream.
  - What Claude, Gemini and Home open in WebView Kiosk.
  - Whether the Kia Action can log in from GitHub.
