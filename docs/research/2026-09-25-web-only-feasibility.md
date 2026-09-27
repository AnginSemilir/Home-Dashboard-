# Can one web page do it all? (Octopus, Google, Kia from the browser)

> Current: the research behind the switch to the GitHub Pages web app.

<details><summary>The question asked</summary>

Research task (read-only; do not edit repo files; scratch work only under /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad/webonly/). Today is 2026-09-25. We are considering replacing Home Assistant with a single static web page hosted on GitHub Pages (https://<user>.github.io/<repo>/), opened on a Lenovo Tab M10 (3rd gen, TB328, Android 12) as a full-screen dashboard. The page calls cloud APIs directly from the browser; secrets (API keys, OAuth tokens) are typed in once on the tablet and stored in localStorage (never in the public repo). Google Nest SDM + OAuth in-browser is already confirmed feasible (google/device-access-sample-web-app does code exchange with client_secret, refresh tokens, SDM calls and WebRTC in the browser). I need the remaining unknowns answered with evidence:

1. OCTOPUS ENERGY from a browser (CORS):
   a. Public REST `https://api.octopus.energy/v1/products/AGILE-24-10-01/electricity-tariffs/E-1R-AGILE-24-10-01-<REGION>/standard-unit-rates/` — does it send Access-Control-Allow-Origin for arbitrary origins? Also account endpoint `/v1/accounts/<id>/` (Basic auth with API key) to discover the tariff code/region, and `/v1/electricity-meter-points/<mpan>/meters/<serial>/consumption/` — CORS?
   b. GraphQL `https://api.octopus.energy/v1/graphql/` (obtainKrakenToken with APIKey; then `smartMeterTelemetry(deviceId: ..., grouping: TEN_SECONDS|ONE_MINUTE...)` for the Home Mini; and how to find the Home Mini deviceId via the `account { electricityAgreements { meterPoint { meters { smartDevices { deviceId }}}}}` query) — does it allow cross-origin browser requests (preflight with Authorization/Content-Type)? Exact query shapes from BottlecapDave's integration (custom_components/octopus_energy/api_client/__init__.py on raw.githubusercontent.com/BottlecapDave/HomeAssistant-OctopusEnergy/develop/...) — copy the exact GraphQL query strings for token, smart device id discovery, and smartMeterTelemetry.
   Evidence: search GitHub for client-side web apps/bookmarklets/PWAs that fetch api.octopus.energy (REST and GraphQL) directly from the browser (e.g. search terms: "api.octopus.energy" fetch javascript, "smartMeterTelemetry" javascript, "obtainKrakenToken" javascript browser), forum posts about CORS errors with the Octopus API. If you can find the actual response headers (e.g. in an issue or a curl output someone posted), quote them. Note: this sandbox's proxy blocks api.octopus.energy directly, so rely on published evidence.
2. KIA e-Niro battery without a server: is there any browser-callable path (almost certainly not: unofficial API, custom auth, no CORS)? Evaluate a free GitHub Actions scheduled workflow (cron every 30 min) that runs the Python library hyundai_kia_connect_api with credentials in GitHub Actions secrets and publishes only the battery % — privately. Options: encrypt the JSON with a key the tablet knows (WebCrypto AES-GCM) and commit/publish it to the Pages site; or a private gist read with a fine-grained token. Check: GitHub Actions cron minimum interval and reliability (delays/skips), free minutes for public vs private repos, scheduled workflows auto-disabled after 60 days of repo inactivity (and how to avoid it), whether Kia EU login from GitHub's cloud IPs is likely blocked (the library's EU login WAF issue Aug 2026). Give a verdict.
3. LAUNCHING ANDROID APPS FROM A WEB PAGE on Android 12, in Chrome (tab or installed PWA) — precise rules: Chrome's intent:// handling (requires BROWSABLE; package= fallback to Play Store; user-gesture requirement), and concrete URLs that work to open: Spotify (spotify: scheme / open.spotify.com), Google Keep (keep.google.com app link? intent://keep.google.com#Intent;scheme=https;package=com.google.android.keep;end), Claude app (claude.ai/new app link / claude:// scheme — which BROWSABLE activities does com.anthropic.claude expose; any path that opens voice mode), Gemini (gemini.google.com/app link to com.google.android.apps.bard; any googleassistant:// or intent that starts voice), and the Android HOME screen (confirm impossible from Chrome). Also: which free Android kiosk/web-wrapper browsers can show a GitHub Pages site full-screen AND launch apps/intents or return to home: Fully Kiosk free tier (is 'Enable JavaScript Interface' PLUS-only? is 'Open URL schemes in other apps' free?), and open-source options (e.g. 'WallPanel', 'Kiosk' apps on F-Droid, 'Hermit', 'Native Alpha', any 'WebView kiosk' with a JS bridge) — are they maintained in 2026?
4. KEEPING IT ON SCREEN from a web page: Screen Wake Lock API support in Chrome Android (HTTPS required; released on visibility change), PWA manifest display: fullscreen, whether an installed PWA can auto-start on boot (no — alternatives: free MacroDroid 'on boot launch app'), and Android 'Stay awake' developer option.
5. Microphone/voice: can a page trigger Gemini? (probably only via link to the Gemini app). OK to be brief.

Tools: load WebSearch via ToolSearch ("select:WebSearch"); most sites are blocked for WebFetch, but raw.githubusercontent.com works via Bash curl and `git clone --depth 1` from github.com works. Mark each claim VERIFIED (primary source/code) or UNVERIFIED. Final report under ~1000 words with a feasibility table (item → browser-direct? → evidence → fallback).

</details>

I couldn't test anything live: the sandbox blocks api.octopus.energy, the Kia servers and fully-kiosk.com. Every claim below comes from source code, official docs or GitHub issues. VERIFIED means I read the primary source; UNVERIFIED means inference or secondary sources only.

## 1. Octopus Energy from the browser

**a. REST** is very likely fine from a github.io page, including authenticated calls.
- **Public unit rates:** VERIFIED in code. Several GitHub Pages sites call `…/standard-unit-rates/` with a plain `fetch()` and no proxy (`smalley1992.github.io/script.js`, `jackthorley.github.io/js/main.js`, `1ulk.github.io/hanchu-agile.js`). `spallavi-stack/shubha-pm-portfolio/projects/sunnysideup/calculator.js` says Octopus's headers, "checked via curl… return `Access-Control-Allow-Origin: *`". That is someone else's report; I did not see the raw headers myself.
- **Basic-auth `/v1/accounts/<id>/` and `/consumption/`:** strong evidence, but the preflight headers themselves are UNVERIFIED.
  - `rahbut/octopus-compare` is live at octopus.purle.net and describes itself as a "fully client-side web app". Its `webapp/src/api.ts` sends `Authorization: Basic btoa(key+':')` and `Content-Type: application/json` directly, and `vite.config.ts` has no proxy. That request forces a CORS preflight (a permission check the browser sends first), so the preflight must be succeeding.
  - Its design brief says the API "returns `Access-Control-Allow-Origin: *`".
  - `Chronickle/SolarBatteriesAnalysis` is hosted on Azure Static Web Apps and makes the same calls in production. It only uses a proxy in the dev server.
  - One dissent: `javorszky/uk-energy-backtest/brief.md` says "browsers can't call Octopus directly — no permissive CORS headers". Nobody else I found agrees. Test this first.

**b. GraphQL** has the same status: strong evidence, preflight not directly observed.
- `octopus-compare` runs `obtainKrakenToken` and then sends `Authorization: JWT <token>` from the browser.
- Chronickle runs `obtainKrakenToken` and `smartMeterTelemetry` from the browser in production.
- `rorypearson26/octopus-visual` does the same from a `"use client"` file.

Exact query strings from BottlecapDave's `develop` branch, `api_client/__init__.py` (Python's `{{ }}` shown as `{ }`):
```graphql
mutation { obtainKrakenToken(input: { APIKey: "{api_key}" }) { token refreshToken refreshExpiresIn } }
mutation { obtainKrakenToken(input: { refreshToken: "{refresh_token}" }) { token refreshToken refreshExpiresIn } }
```
Device discovery, trimmed from `account_query` (lines 51–127):
```graphql
query { account(accountNumber: "{account_id}") { electricityAgreements(active: true) { meterPoint { mpan
  meters(includeInactive: false) { serialNumber smartImportElectricityMeter { deviceId } smartExportElectricityMeter { deviceId } }
  agreements(includeInactive: true) { validFrom validTo tariff { ... on TariffType { productCode tariffCode } } } } } } }
```
Telemetry query (lines 129–142). It is sent with the header `Authorization: JWT <token>` (line 1480):
```graphql
query { smartMeterTelemetry(deviceId: "{device_id}" grouping: HALF_HOURLY start: "{period_from}" end: "{period_to}")
  { readAt consumption consumptionDelta demand export } }
```
- BottlecapDave uses `HALF_HOURLY` grouping.
- The `smartDevices { deviceId }` path you mentioned is from a different project, `soothill/octopus-home-mini/pkg/octopus/client.go`. It also uses `grouping: TEN_SECONDS`.
- Rate limit: 100 calls per hour, shared with the Octopus app (BottlecapDave docs). Polling telemetry more than about once a minute will hit it.

## 2. Kia e-Niro battery

**No browser path** (UNVERIFIED). There's no sign of CORS support. The login requires a registered device ID and signed request headers, and goes through a login server that has a web firewall in front of it.

**Login status as of Sept 2026** (VERIFIED from PRs):
- Since 11 Aug 2026 the firewall has blocked the old EU login with "classified as an abusing request".
- PR #1277, merged 15 Aug, switched Kia/Hyundai EU password login to a different login flow (the one Kia's current app uses) and was live-tested.
- `kia_uvo#1888` (Hyundai EU) is still open, and a related fix (PR #1322) was merged on 21 Sep.
- `kia_uvo#1829` is an unresolved report ("Anyone banned from Kia servers?"): the Kia app failed on the user's home Wi-Fi but worked on mobile data, which suggests IP-level blocking.

**Would it work from GitHub's cloud IPs?** Unknown (UNVERIFIED). No reports either way, and datacenter IPs are exactly what this kind of firewall targets.

**GitHub Actions facts** (VERIFIED from github/docs):
- The shortest cron interval is 5 minutes.
- Scheduled runs "can be delayed during periods of high loads… start of every hour… some queued jobs may be dropped". Use an off-hour minute such as `17,47 * * * *`.
- The 60-day auto-disable only applies "in a public repository".
- Minutes are free for public repos. Private repos get 2,000 minutes a month on GitHub Free.
- Pages on GitHub Free only works from public repos.

**Budget:** a run every 30 minutes is about 1,440 runs a month, which fits in 2,000 minutes if each job bills as 1 minute (per-job rounding UNVERIFIED).

**Verdict: feasible but fragile.** Suggested design:
1. Put the workflow in a private repo. That avoids the 60-day disable.
2. Save the Kia token between runs, so it doesn't do a fresh login 48 times a day.
3. Read cached state only; never force-refresh the car.
4. Encrypt `{soc, ts}` with AES-256-GCM, using a key held only by the tablet and an Actions secret.
5. Publish it to a secret gist, or push it to the public Pages repo.
6. The tablet reads it from `api.github.com/gists/<id>`. That API sends `Access-Control-Allow-Origin: *` and allows the `Authorization` header (VERIFIED, GitHub CORS docs), so no token is needed.

Run it once by hand first. If the first login fails from GitHub, fall back to Termux on the tablet itself, using your home IP.

## 3. Launching apps from a page (Chrome, Android 12)

**Chrome's rules** (VERIFIED from Chrome docs and Chromium `ExternalNavigationHandler.java`):
- Chrome adds the BROWSABLE category to every intent and strips any explicit component (`sanitizeQueryIntentActivitiesIntent`). So only BROWSABLE activities can be opened from a web page.
- A navigation started without a user gesture gets a prompt instead of launching (`REQUIRES_PROMPT`).
- If nothing can handle the intent, Chrome goes to `S.browser_fallback_url` if one is given. Otherwise, if `package=` is set, it opens the Play Store page (`handleWithMarketIntent`). For an installed app without a BROWSABLE entry point, that page still shows an "Open" button, so it costs one extra tap.

**Per-app status:**
- **Spotify:** `spotify:` links or `intent://open.spotify.com/...#Intent;scheme=https;package=com.spotify.music;end`. Widely used, but I didn't check Spotify's app manifest (UNVERIFIED).
- **Keep:** `intent://keep.google.com#Intent;scheme=https;package=com.google.android.keep;end` is UNVERIFIED. Its likely fallback is the Play Store page.
- **Claude:** VERIFIED from a decompiled v1.260430 manifest, and claude.ai's app-link verification file lists `com.anthropic.claude`.
  - BROWSABLE entry points: `https://claude.ai` with paths `/`, `/new`, `/chat*`, `/project/`, `/code*`, plus the `claude:` scheme.
  - The Help Center documents only `claude://code…` links, and those need Claude Code access.
  - The voice/assistant screen (`AssistantOverlayActivity`, which handles ASSIST/VOICE_ASSIST) is not BROWSABLE. **A web page cannot open Claude voice mode.**
- **Gemini:** `intent://gemini.google.com/app#Intent;scheme=https;package=com.google.android.apps.bard;end` is common in the wild (UNVERIFIED). The ASSIST and VOICE_COMMAND intents are not BROWSABLE, so **no voice start from Chrome.**
- **Home screen:** impossible from Chrome. The launcher's HOME entry isn't BROWSABLE, so the intent can't be resolved (my reading of the Chromium code).

**Kiosk wrappers:**
- **Fully Kiosk:**
  - "Enable JavaScript Interface" is a paid PLUS feature (VERIFIED: labelled "(PLUS)" in `thomasloven/hass-browser_mod`).
  - Its JavaScript API includes `fully.startApplication(pkg)` and `fully.startIntent(url)`.
  - Whether "Open URL Schemes in Other Apps" is free is UNVERIFIED (their site is blocked). The free tier reportedly shows a watermark on PLUS features.
- **WebView Kiosk** (nktnet1, updated 24 Sep 2026, on F-Droid and Play), VERIFIED from code:
  - It can be set as the default launcher, so it effectively is the home screen.
  - With "allow other URL schemes" on, it runs `intent:` links through `Intent.parseUri` without adding BROWSABLE. That means non-browsable intents like HOME, ASSIST or an explicit `component=` can launch.
  - Its JavaScript bridge only exposes battery and brightness.
- **FreeKiosk** (MIT licence, updated today): kiosk, external-app and boot modes; no web-page intent handling found.
- **WallPanel:** the original is archived; a fork, "WallPanel PRO" (alx-uta), is active.
- **Native Alpha:** active (updated Sept 2026).

## 4. Keeping it on screen
- **Wake Lock:** Chrome 84+ on Android (VERIFIED from MDN compatibility data). It needs HTTPS and a visible page, and it is released when the page is hidden, so re-request it on `visibilitychange`.
- **Fullscreen:** `display: "fullscreen"` in the web app manifest is supported (VERIFIED, MDN).
- **Boot start:** a PWA can't auto-start on boot. MacroDroid's free tier (5 macros) has a "Device Boot" trigger plus a "Launch app" action (secondary sources).
- **Stay awake:** Android's "Stay awake" developer option only keeps the screen on while charging. That's fine for a docked tablet.

## 5. Voice
A page can only link into the Gemini or Claude apps, not start their voice modes. Alternatives:
- The browser's built-in speech recognition (`webkitSpeechRecognition`) works inside the page in Chrome.
- A kiosk wrapper can fire the ASSIST intent, which opens the default assistant (UNVERIFIED).

## Feasibility table
| Item | Direct from browser? | Evidence | Fallback |
|---|---|---|---|
| Octopus unit rates | Yes | Several github.io sites call it directly (code) | none needed |
| Octopus account/consumption (Basic auth) | Very likely | octopus-compare and Chronickle in production, no proxy | Cloudflare Worker proxy |
| Octopus GraphQL (token, telemetry) | Very likely | Same apps; polling capped by 100 calls/hr | Same proxy |
| Kia battery | No | Unofficial API, firewall, signed headers | Private GitHub Actions job → encrypted gist; Termux on the tablet |
| Open Spotify/Gemini/Claude chat | Yes, needs a tap | Chromium code; Claude manifest | Play Store "Open" page |
| Claude/Gemini voice, home screen | No | Those entry points aren't BROWSABLE | WebView Kiosk as launcher; Fully PLUS `startIntent` |
| Screen on, fullscreen | Yes | MDN | "Stay awake" option; kiosk app keep-screen-on |
| Start on boot | No | — | MacroDroid; kiosk app boot option |

Sources: [Chrome Android Intents](https://developer.chrome.com/docs/android/intents), [kia_uvo#1632](https://github.com/Hyundai-Kia-Connect/kia_uvo/issues/1632), [kia_uvo#1829](https://github.com/Hyundai-Kia-Connect/kia_uvo/issues/1829), [kia_uvo#1888](https://github.com/Hyundai-Kia-Connect/kia_uvo/issues/1888), [PR #1277](https://github.com/Hyundai-Kia-Connect/hyundai_kia_connect_api/pull/1277), [PR #1322](https://github.com/Hyundai-Kia-Connect/hyundai_kia_connect_api/pull/1322), [Claude mobile links](https://support.claude.com/en/articles/14898120-open-the-claude-mobile-app-with-a-link), [Fully PLUS](https://license.fully-kiosk.com/license/single), [SharpTools KB](https://help.sharptools.io/article/20-how-to-link-to-android-or-ios-apps-from-the-sharptools-web-dashboard), [MacroDroid Device Boot](https://macrodroidforum.com/wiki/index.php/Trigger:_Device_Boot), plus raw files from github/docs, mdn/content, chromium/chromium, BottlecapDave, rahbut/octopus-compare, Chronickle, nktnet1/webview-kiosk and GitBubble/claude-coca.
