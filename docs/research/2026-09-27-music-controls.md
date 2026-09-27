# Music controls: Spotify, Amazon Music and tablet media keys

> Current (web app). Saved from the research runs so it is not lost with the cloud session.

_Workflow: Research whether a static web page can show music controls for Spotify or Amazon Music (and alternatives)_

# Music controls on the home panel: Spotify or Amazon Music

Checked 27 September 2026. The numbers in square brackets point to the sources at the end. Items marked "(unconfirmed)" could not be checked against a first-hand source.

The Spotify / Amazon Music switch in Settings already exists. It was added on 27 September 2026 (repo commit 44a5195, `panel.music` in `web/js/config.js`). Anything below would work from that switch, so no new setting is needed.

---

## 1. The straight answer

**Spotify has an API the panel can use. Amazon Music does not, for a home project.**

(An API is a way for the panel to talk to the service directly.)

Spotify's "Web API" works straight from the panel's web page. No server of your own is needed [S12][S13]. It acts as a **remote control** for Spotify playing somewhere else: the tablet's Spotify app, a speaker, or a phone. The panel could:

- **Show what's playing.** Song or podcast name, artist, album artwork, a progress bar, and which device it is playing on [S4][S23][S28].
- **Play, pause, skip forward, skip back, jump within a song, shuffle and repeat** [S3][S6].
- **Choose the speaker.** A "Play on…" list that moves the music to another device [S4][S5].
- **Start favourite playlists** with buttons such as "Kids' playlist" or "Dinner jazz" [S6].
- **Change the volume, but only on devices that allow it.** Speakers usually do. Phones and tablets usually refuse. This comes from developer reports, not from Spotify (unconfirmed) [S7].

It controls one Spotify account at a time: whichever account signed in on the panel.

**What you would need:**

- **Spotify Premium on the account that registers the panel.** This became compulsory in February–March 2026. If Premium lapses, the controls stop working [S1][S2][S9].
- **A free developer registration** at developer.spotify.com. It is one short form. You create an "app", paste in the panel's web address, and copy a code (the "Client ID") into the panel's Settings. There is no payment and no secret password [S11][S12].
- **A one-off sign-in on the panel, repeated at least every 6 months.** Spotify made sign-ins expire after 6 months in June–July 2026 [S8].
- **Other family members** who want to use their own account must be added by name on the developer page. The limit is 5 people [S1][S9]. Their accounts also need Premium to play, pause or skip [S3]. A free account can probably see what is playing but not control it. That is based on reports only (medium confidence) [S2].

**Limits worth knowing:**

- **The panel does not play music itself.** Spotify's "play inside a web page" feature cannot work in the kiosk app. The kiosk app does not allow the copy-protection that feature needs [S18].
- **It can only control a device that Spotify can currently "see".** A speaker, or the tablet's own Spotify app, that has been idle for a while often drops off the list [S4][S14]. When that happens, the panel falls back to opening the Spotify app, as it does today.
  - The Spotify Android app reportedly has a setting that keeps the tablet reachable: Settings > Devices > "Spotify Connect in background". There is only one source for this (unconfirmed) [S15].
- **Google Nest and Chromecast speakers are awkward.** They usually only appear after someone has cast to them from a phone [S4][S14]. In May 2026 a Spotify bug hid them completely. Spotify said Android app version 9.1.48 fixes it (unconfirmed) [S16].
- **Speakers with Spotify built in are the most dependable.**
- **Signing in inside the kiosk app fails if your Spotify login uses "Continue with Google" or Facebook** [S17]. The fix is to sign in using Chrome, then use the panel's existing "Copy settings" step, as you already do for Google.
- **Spotify changes its developer rules often.** There were changes in November 2024, February 2025, April 2025, February 2026, June 2026 and July 2026 [S25][S11][S10][S1][S8][S19]. A personal project cannot move to Spotify's more stable tier: since May 2025 that needs a registered organisation with 250,000 monthly users [S10]. A future change could break the controls with little warning.

---

## 2. Amazon Music

**There is no Amazon Music API that a home panel can use for controls.**

- **Amazon's Web API is a closed trial for approved companies.** Access goes through an Amazon business contact [A1].
  - In March 2025 Amazon said the waiting list was full [A2].
  - People were still asking when it would open in January 2026 [A3]. I found nothing saying it opened in 2026.
- **Even with access, it has no remote control.** It covers the music catalogue, your library and your recently played list. It cannot control the Amazon Music app or an Echo [A1][A4]. Amazon would also have to approve the finished product [A5].
- **Avoid unofficial tools.** They need your Amazon password or cookies and cannot run from a web page. Some break Amazon's terms of use, which could get the account locked [A6].

**The best the panel can do on its own:**

1. **Open the Amazon Music app.** It already does this (`web/js/launcher.js`).
2. **Playlist buttons.** Each button opens one chosen playlist in the app.
   - Expect to tap Play once in the app. Amazon's own examples show a `do=play` link option that might start playback automatically, but it is untested [A9].
   - On a Prime-only account (not Music Unlimited), most playlists play shuffled with limited skips [A10].

**Going further needs extra equipment:**

- **An Echo plus a Home Assistant server.** Home Assistant is home-automation software that runs on a small computer.
  - Since Home Assistant 2026.6 (June 2026), the panel could show what the Echo is playing, with artwork, and could play, pause, skip and change the volume [A11].
  - It uses an unofficial link to Amazon. That link needs your Amazon password and an authenticator-app code stored on the server, and Amazon could cut it off at any time [A11][A17].
  - With the Home Assistant app also installed on the tablet, it can pause and skip Amazon Music on the tablet itself. It can show what is playing there, about a minute behind [A13].
- **Voice Monkey**, a third-party Alexa service.
  - Panel buttons trigger Alexa routines on an Echo, such as "play my kitchen playlist" or "next song".
  - It only works one way: no song name or artwork comes back.
  - The free plan allows 200 presses a month, then silently stops working [A14].

Both of these are only worth it if you already run Home Assistant or rely on Echos.

---

## 3. Controls for whichever app is playing on the tablet

This is the "works for both" route. A free automation app called **MacroDroid** runs on the tablet. It listens for the panel's buttons and presses the tablet's own play, pause and skip keys. Android sends those keys to whichever music app played last, Spotify or Amazon Music [B1][B3][B16].

- **What you get:** play/pause, next, previous, plus the song title, artist, and whether it is playing [B3][B4].
- **What you don't get:** artwork (not reliably), choosing a speaker, browsing playlists, or controlling music on phones or Echos.
- **Cost:**
  - MacroDroid's free version allows 5 automations, called "macros". This needs 2.
  - A one-off Pro upgrade exists; I did not check the price [B6].
  - Tasker is a paid alternative, reportedly US$3.49, with more setup (unconfirmed) [B11].
- **No accounts:** no Premium, no developer registration, and no sign-in to renew.
- **Fiddliness: moderate, and only once.**
  - Set up two macros.
  - Give MacroDroid permission to read notifications.
  - Stop the tablet closing MacroDroid to save battery [B3][B10][B15].
  - My own estimate is 30–60 minutes with step-by-step instructions.
- **Watch-outs:**
  - If Lenovo's battery saving closes MacroDroid, the buttons stop working until it restarts. The panel would show "helper offline" [B10].
  - If another app, such as YouTube, made sound more recently, Play may go to that app. MacroDroid can probably send commands to the app chosen in Settings instead, which avoids this (to be confirmed in the app) [B5].
  - After the tablet restarts, the chosen app may need opening once [B1].
- **Where it works:** in the kiosk app with no prompt [B8]. As an installed Chrome app, Chrome asks once to allow "Apps on device" [B9].

It is worth it if music usually plays from the tablet itself, if you mostly use Amazon Music, or if you don't have Spotify Premium.

---

## 4. Recommendation

Pick one:

- **Choice A: Spotify remote (needs Premium).**
  - Full Spotify controls with artwork, a speaker picker and playlist buttons.
  - When Settings says Amazon Music, the button opens Amazon Music as it does now, plus Amazon playlist buttons.
  - Upkeep: sign in again twice a year.
- **Choice B: Tablet remote for either app (free).**
  - MacroDroid on the tablet gives play/pause/skip and the song name for Spotify or Amazon Music, whichever is chosen in Settings.
  - It only controls music playing from the tablet.
  - No accounts to keep up.
- **Choice C: Both.**
  - The Spotify remote when Spotify is chosen, and the tablet remote when Amazon Music is chosen.
  - The most complete option, with the most setup.

**My recommendation:** choose A if you have Spotify Premium and play Spotify on speakers around the house. Otherwise choose B. Only add Home Assistant if you already have it running.

Two things that would settle it: do you have Spotify Premium? And where does the music usually play: the tablet, a Nest or Chromecast speaker, an Echo, or phones?

---
---

# Technical appendix (for the implementer)

### A. Spotify Web API from the static page

**Setting.** Reuse `panel.music` and `musicApp()` (`web/js/config.js`, `web/js/launcher.js`). Add a Client ID field and Spotify token storage in localStorage, like the other secrets.

**Registration** [S11][S12][S9]
- Go to developer.spotify.com/dashboard, click Create app and select "Web API". The app stays in Development Mode permanently, because individuals cannot get extended quota since 15 May 2025 [S10].
- Redirect URI: exactly `https://anginsemilir.github.io/Home-Dashboard-/`. Scheme, host, path and trailing slash must all match.
  - HTTPS is mandatory. The implicit grant and http redirects were removed for all apps on 27 Nov 2025 [S11].
  - A 2025 dashboard bug rejected hyphens in paths and was reportedly fixed. Check that the URI saves (unconfirmed) [S26].
- User Management: add each account that will sign in, up to 5. Accounts not on the list get 403 errors [S9].

**Auth: Authorization Code with PKCE, no client secret** [S12]
1. Generate a `code_verifier` and its S256 `code_challenge`. Store the verifier and a `state` value in sessionStorage.
2. Navigate to `https://accounts.spotify.com/authorize?response_type=code&client_id=…&scope=…&redirect_uri=…&code_challenge_method=S256&code_challenge=…&state=…`.
3. On return with `?code=…&state=…`:
   - Check `state`.
   - `POST https://accounts.spotify.com/api/token` as `application/x-www-form-urlencoded` with `grant_type=authorization_code, code, redirect_uri, client_id, code_verifier`.
   - Remove the query string with `history.replaceState`.
4. Refresh: same endpoint with `grant_type=refresh_token, refresh_token, client_id`. No verifier and no redirect_uri [S12][S13].

Spotify's own PKCE example calls both hosts from the browser [S13]. Do not copy it verbatim:
- It is stale: a comment still allows localhost redirects.
- Its `save()` writes `refresh_token` even when the response leaves it out, which stores `undefined`.

Live CORS on accounts.spotify.com and api.spotify.com was not tested from here, because both were blocked.

**Scopes** [S23]: `user-read-playback-state user-read-currently-playing user-modify-playback-state`. Do not request `streaming`; it is only needed for the Web Playback SDK.

**Endpoints** (base `https://api.spotify.com/v1`) [S3][S4][S5][S6][S7]

| Purpose | Call |
|---|---|
| Full state | `GET /me/player?additional_types=episode` (204 = nothing playing) |
| Now playing only | `GET /me/player/currently-playing` |
| Device list | `GET /me/player/devices` (id, is_active, is_restricted, name, type, supports_volume, volume_percent) |
| Move playback | `PUT /me/player` `{"device_ids":[id],"play":true}` |
| Play / preset | `PUT /me/player/play?device_id=…` `{"context_uri":"spotify:playlist:…"}` |
| Pause | `PUT /me/player/pause` |
| Next / previous | `POST /me/player/next`, `POST /me/player/previous` |
| Seek | `PUT /me/player/seek?position_ms=…` |
| Shuffle / repeat | `PUT /me/player/shuffle?state=…`, `PUT /me/player/repeat?state=…` |
| Volume | `PUT /me/player/volume?volume_percent=…` (only if `supports_volume`) |
| Queue | `POST /me/player/queue?uri=…` |

- All command endpoints are Premium-only and return 204 or 202.
- Execution order is not guaranteed, so update the UI optimistically and re-poll 0.5–1 s after a command [S3][S6].
- The player endpoints survived the February 2026 cuts [S22].

**Polling** [S19][S20]
- Every 5–10 s while playing and `document.visibilityState === 'visible'`.
- Every 30–60 s when paused or on a 204.
- Stop while hidden.
- Advance `progress_ms` locally between polls, and re-poll when `duration_ms` runs out.
- On a 429, honour `Retry-After`.
- On a 429 whose body has `"reason":"QUOTA_EXCEEDED"`, back off for hours and show "Spotify paused". Cooldowns of 13–18 h are reported (unconfirmed).
- Polling every 3 s would be about 28,800 calls a day, which is too many. Quota has been shared across all of a developer account's Client IDs since 23 Jul 2026 [S19].

**Tokens**
- Access tokens last 3600 s [S12]. Keep them in localStorage, as the panel does for other secrets.
- Refresh tokens:
  - If a refresh response includes `refresh_token`, save it at once. If it doesn't, keep the old one [S12].
  - Assume rotation revokes the old token immediately. Music Assistant's current code does this; do not rely on a grace period [S21].
  - Allow only one refresh at a time (single-flight).
- Hard expiry: 6 months after consent, and refreshing does not reset it. This applies to new apps since 18 Jun 2026 and to existing apps since 20 Jul 2026. A `400 invalid_grant` means expired: drop the token and show "Reconnect Spotify" [S8].
- WebView Kiosk and the Chrome app have separate storage. Never share one refresh token between them. If you use the existing "sign in using Chrome, then Copy settings" flow (`docs/google.md`, `web/js/settings-ui.js`), delete Chrome's Spotify token after pasting [S17][S21].

**Errors**
- 403 "premium required" on the first command: show "Needs Premium". `GET /me` no longer returns `product` (removed February 2026) [S22].
- 404 "No active device" or "Device not found":
  - Launch Spotify with the existing `launchIntent('com.spotify.music')`.
  - Poll `/devices` and match by name, because device IDs are not stable.
  - Then transfer [S4][S14].
- `is_restricted: true`: that device accepts no commands [S4].
- 403 `VOLUME_CONTROL_DISALLOW`: hide the volume control (reported) [S7].

**CSP** (`web/index.html` line 11)
- `connect-src`: add `https://accounts.spotify.com https://api.spotify.com`.
- `img-src`: currently `'self' data:`. Add `https://i.scdn.co` [S28]. Playlist covers may come from other hosts such as `mosaic.scdn.co` (unconfirmed). Log real image URLs before finalising.

**Other gotchas**
- **Web Playback SDK in WebView Kiosk: not possible.** The kiosk grants only camera and microphone permission, never `PROTECTED_MEDIA_ID`, so EME/Widevine fails [S18].
- **WebView Kiosk URL lists.** The whitelist and blacklist are empty by default. If the owner has set one, allow `accounts.spotify.com` [S27].
- **Spotify Soloist (13 Aug 2026)** is an official Spotify Connect receiver for a Raspberry Pi. It could be a dependable target speaker. Its own WebSocket API is localhost-only, so the panel would still control it through the Web API. Whether it stays listed while idle is untested [S24].

### B. Tablet helper (MacroDroid): the route that works for both apps

**Flow.** The panel calls `fetch('http://127.0.0.1:8765/music?cmd=next&app=amazonmusic&t=TOKEN')`. That fires MacroDroid's "HTTP Server Request" trigger, which runs "Control Media" and then "HTTP Server Response" [B3].

**MacroDroid setup**
- Pre-create macro variables named `cmd`, `t` and `app`. MacroDroid does not create them from the query string. Alternatively, use the trigger's query-params dictionary option [B5].
- Set the trigger's IP allow-list to `127.0.0.1`, because the server also listens on the Wi-Fi. Keep the token check as well [B5].
- In Control Media, target package `com.spotify.music` or `com.amazon.mp3` based on `{v=app}`. That option was seen in a schema file; confirm it in the app. Fall back to "Simulate Media Button" [B3][B5].
- Second macro: a "Media Track Changed" trigger that copies `{track_name}` and `{track_artist}` into global variables [B3].
- Grant MacroDroid Notification Access. Reading other apps' media sessions requires it [B15].
- Set battery use to Unrestricted and lock MacroDroid in the recent-apps view [B10].

**Response**
- Header params: `Access-Control-Allow-Origin: https://anginsemilir.github.io` and `Cache-Control: no-store`.
- The body type can only be plain text or HTML, so parse it with `JSON.parse(await r.text())` [B4][B5].

**Browser side**
- Use GET with no custom headers. That makes it a simple request, so there is no preflight.
- Time out after about 2 s with an AbortController.
- Poll the status every 5–10 s, only while the page is visible.
- If the CORS header is missing, commands can still be sent fire-and-forget with `mode: 'no-cors'`.
- Use `127.0.0.1`, not `localhost`. Pick an uncommon port such as 8765 rather than the default 8080.

**CSP:** add `http://127.0.0.1:8765` to `connect-src`, with the exact scheme, host and port.

**Why it works**
- Loopback addresses are not mixed content [B7].
- Android WebView turns off Local Network Access checks entirely [B8].
- WebView Kiosk permits cleartext traffic [B13].
- In Chrome 142+ there is a one-time prompt. Since Chrome 145 the permission is called "Apps on device" (`loopback-network`). Check it with `navigator.permissions.query({name:'loopback-network'})` [B9].
- The service worker `sw.js` ignores cross-origin requests, so it will not intercept these calls.

**What is not possible**
- An `intent:` link cannot send a media key. WebView Kiosk only starts activities, and intent URIs cannot carry a KeyEvent [B2].
- Home-screen widgets cannot be embedded in a web page [B12].
- A future WebView Kiosk JavaScript bridge for media keys (like its existing battery and brightness bridges) would remove the helper. It does not exist yet; it would be a feature request only [B14].

### C. Amazon Music

**Android package:** `com.amazon.mp3`. Amazon's Digital Asset Links, checked 27 Sep 2026, list it for music.amazon.co.uk and music.amazon.com [A7].

**Button links**
- **WebView Kiosk** (current code, no change needed):
  `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.amazon.mp3;launchFlags=0x10000000;end`
  This needs "Allow Other URL Schemes" switched on. It is off by default, and the panel already requires it [S27].
- **Chrome** (current code):
  `intent://music.amazon.co.uk/#Intent;scheme=https;package=com.amazon.mp3;end`
  Suggested improvement: add `S.browser_fallback_url=https%3A%2F%2Fmusic.amazon.co.uk%2F` before `end`. Chrome only opens BROWSABLE app screens, only after a tap, and uses the fallback URL if the app cannot open [A8].
- **Playlist button** (the same form works in both containers):
  `intent://music.amazon.co.uk/playlists/B01M2AC326#Intent;scheme=https;package=com.amazon.mp3;S.browser_fallback_url=https%3A%2F%2Fmusic.amazon.co.uk%2Fplaylists%2FB01M2AC326;end`
  - Curated playlists use `/playlists/<ASIN>`; your own playlists use `/user-playlists/<id>`.
  - Try adding `?do=play` to the path (untested) [A9].
  - The app's manifest could not be read, so check on the tablet:
    - `adb shell pm get-app-links com.amazon.mp3`
    - `adb shell am start -a android.intent.action.VIEW -d "https://music.amazon.co.uk/playlists/B01M2AC326" com.amazon.mp3`

**Official Web API: not usable.** It lives at `https://api.music.amazon.dev/v1/` and needs a Login with Amazon Bearer token plus `x-api-key` (the Security Profile ID). It is a closed beta with no remote-control endpoints [A1][A4].

**Home Assistant (optional, 2026.6 or later)**
- Controls: `POST /api/services/media_player/media_play_pause`, `media_next_track` and similar.
- State: `GET /api/states/media_player.<echo>` returns `media_title`, `media_artist`, `media_album_name`, `media_image_url`, duration and position [A11].
- Routines: `POST /api/services/button/press` (2026.5 or later), or `alexa_devices.send_text_command` [A12].
- Store a long-lived token in localStorage, created for a restricted user.
- Set CORS allowed origins to `https://anginsemilir.github.io` under Settings > System > Network > HTTP server. On Home Assistant OS the default port has been 80 since 2026.8 [A15].
- Use HTTPS for the WebView. Chrome 142+ may allow http on the local network after its permission prompt; that is not confirmed for WebView [A16].
- Add the Home Assistant origin to both `connect-src` and `img-src`.
- For the tablet's own app: the Companion app's "Media session sensor" updates every minute with "Fast While Charging". `command_media` with `media_package_name: com.amazon.mp3` sends commands [A13].

**Voice Monkey (optional)**
- Call `GET https://api-v3.voicemonkey.io/trigger?token=…&device=…` with `mode:'no-cors'`. Do not POST JSON under no-cors.
- API v2 is expected to be retired by December 2026.
- The free plan allows 200 requests a month, and errors are invisible under no-cors [A14].
- Add `https://api-v3.voicemonkey.io` to `connect-src`.

**Avoid**
- Amazon embed-player iframes: they reportedly play only 30-second previews and have no control API [A18].
- Unofficial scrapers [A6].

### Unconfirmed items (check before relying on them)
- Whether free Spotify accounts can read Now Playing.
- The "Spotify Connect in background" setting.
- The Cast bug and the 9.1.48 fix.
- 403 volume refusals on tablets.
- QUOTA_EXCEEDED cooldown lengths.
- Spotify image hosts other than i.scdn.co.
- Live CORS on the Spotify hosts.
- `?do=play` on Amazon playlist links.
- MacroDroid's free-tier limit, Pro price, and the per-app target in Control Media.
- Tasker's price and whether it supports custom headers.

---

## Sources

**Spotify**
- [S1] https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security
- [S2] https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/ ; https://www.neowin.net/news/spotify-now-requires-premium-accounts-for-developer-mode-api-access/
- [S3] https://developer.spotify.com/documentation/web-api/reference/pause-a-users-playback ; https://developer.spotify.com/documentation/web-api/reference/skip-users-playback-to-next-track
- [S4] https://developer.spotify.com/documentation/web-api/reference/get-a-users-available-devices
- [S5] https://developer.spotify.com/documentation/web-api/reference/transfer-a-users-playback
- [S6] https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback
- [S7] https://developer.spotify.com/documentation/web-api/reference/set-volume-for-users-playback ; https://github.com/thelinmichael/spotify-web-api-node/issues/434
- [S8] https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration ; https://github.com/raywo/MMM-NowPlayingOnSpotify/issues/151
- [S9] https://github.com/Osasuwu/like-current-song/issues/122
- [S10] https://developer.spotify.com/blog/2025-04-15-updating-the-criteria-for-web-api-extended-access
- [S11] https://developer.spotify.com/blog/2025-02-12-increasing-the-security-requirements-for-integrating-with-spotify ; https://developer.spotify.com/blog/2025-10-14-reminder-oauth-migration-27-nov-2025
- [S12] https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow ; https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens ; https://developer.spotify.com/documentation/web-api/concepts/access-token
- [S13] https://raw.githubusercontent.com/spotify/web-api-examples/master/authorization/authorization_code_pkce/public/app.js
- [S14] https://github.com/spotify/web-api/issues/1171 ; https://github.com/spotify/web-api/issues/1559 ; https://github.com/spotify/web-api/issues/787 ; https://github.com/spotify/web-api/issues/635 ; https://community.spotify.com/t5/Spotify-for-Developers/Google-Cast-devices-in-device-list-queries/td-p/5077672
- [S15] https://x.com/SpotifyCares/status/2020544470186414280
- [S16] https://www.androidauthority.com/google-cast-devices-disappearing-from-spotify-connect-3665673/ ; https://9to5google.com/2026/05/11/spotify-is-investigating-why-google-cast-chromecast-devices-wont-show-in-connect/
- [S17] https://raw.githubusercontent.com/spotify/android-auth/master/CHANGELOG.md ; https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/
- [S18] https://github.com/nktnet1/webview-kiosk/blob/main/app/src/main/java/uk/nktnet/webviewkiosk/utils/webview/handlers/handlePermissionRequest.kt ; https://community.spotify.com/t5/Spotify-for-Developers/Webplayback-does-not-work-in-android-webview/td-p/5291412 ; https://developer.spotify.com/documentation/web-playback-sdk
- [S19] https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates ; https://developer.spotify.com/documentation/web-api/references/changes/july-2026
- [S20] https://developer.spotify.com/documentation/web-api/concepts/rate-limits ; https://community.spotify.com/t5/Spotify-for-Developers/Low-number-of-requests-leading-to-429-response/td-p/7338415 ; https://github.com/KJ-11/spotify-playlist-curator/pull/6
- [S21] https://raw.githubusercontent.com/music-assistant/server/dev/music_assistant/providers/spotify/helpers.py
- [S22] https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide ; https://developer.spotify.com/documentation/web-api/references/changes/february-2026 ; https://github.com/ramsayleung/rspotify/issues/550
- [S23] https://developer.spotify.com/documentation/web-api/concepts/scopes
- [S24] https://developer.spotify.com/blog/2026-08-13-introducing-spotify-soloist ; https://github.com/spotify/soloist ; https://developer.spotify.com/documentation/soloist/reference/websocket-api
- [S25] https://techcrunch.com/2024/11/27/spotify-cuts-developer-access-to-several-of-its-recommendation-features/
- [S26] https://github.com/spotipy-dev/spotipy/issues/1186 ; https://community.spotify.com/t5/Spotify-for-Developers/Local-Redirect-URI-does-not-accept-hyphen-minus/td-p/6929053
- [S27] https://github.com/nktnet1/webview-kiosk ; https://github.com/nktnet1/webview-kiosk/blob/main/docs/content/docs/settings/web-browsing.mdx
- [S28] https://developer.spotify.com/documentation/web-api/reference/get-an-album

**Amazon Music**
- [A1] https://developer.amazon.com/docs/music/API_web_overview.html ; https://developer.amazon.com/docs/music/get_started_program-overview.html
- [A2] https://community.amazondeveloper.com/t/how-can-i-access-the-amazon-music-api/9253/2
- [A3] https://community.amazondeveloper.com/t/any-idea-when-the-api-in-closed-beta-will-be-open/25269 ; https://github.com/orgs/music-assistant/discussions/626
- [A4] https://community.amazondeveloper.com/t/controlling-the-amazon-music-player-via-the-api/7805 ; https://developer.amazon.com/docs/music/API_web_player.html
- [A5] https://developer.amazon.com/docs/music/requ_AM-Program-Requirements.html
- [A6] https://www.amazon.com/gp/help/customer/display.html?nodeId=201380010 ; https://raw.githubusercontent.com/Jaffa/amazon-music/master/DEVELOPMENT.md ; https://github.com/AmineSoukara/amazon-music
- [A7] https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://music.amazon.co.uk&relation=delegate_permission/common.handle_all_urls ; https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://music.amazon.com&relation=delegate_permission/common.handle_all_urls
- [A8] https://developer.chrome.com/docs/android/intents
- [A9] https://developer.amazon.com/docs/music/API_web_track.html
- [A10] https://music.amazon.co.uk/playlists/B01M2AC326 ; https://www.amazon.com/gp/help/customer/display.html?nodeId=GKL9M88FFWYHY7T9
- [A11] https://raw.githubusercontent.com/home-assistant/home-assistant.io/current/source/_integrations/alexa_devices.markdown ; https://raw.githubusercontent.com/home-assistant/core/2026.6.0/homeassistant/components/alexa_devices/media_player.py ; https://www.home-assistant.io/blog/2026/06/03/release-20266/
- [A12] https://raw.githubusercontent.com/home-assistant/core/2026.5.0/homeassistant/components/alexa_devices/button.py ; https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/alexa_devices/services.yaml
- [A13] https://raw.githubusercontent.com/home-assistant/companion.home-assistant/master/docs/core/sensors.md ; https://raw.githubusercontent.com/home-assistant/companion.home-assistant/master/docs/notifications/commands.md
- [A14] https://voicemonkey.io/docs/api ; https://voicemonkey.io/pricing ; https://voicemonkey.io/docs/migrating-from-v2 ; https://voicemonkey.io/docs/devices
- [A15] https://raw.githubusercontent.com/home-assistant/home-assistant.io/current/source/_integrations/http.markdown
- [A16] https://developer.chrome.com/blog/local-network-access ; https://developer.chrome.com/release-notes/142
- [A17] https://raw.githubusercontent.com/alandtse/alexa_media_player/dev/README.md
- [A18] https://www.amazonforum.com/s/question/0D54P00007YfzMhSAJ/when-i-embed-a-playlist-on-my-website-only-30-seconds-of-each-track-plays-before-skipping-to-the-next-one

**Tablet helper / Android**
- [B1] https://developer.android.com/media/legacy/media-buttons
- [B2] https://github.com/nktnet1/webview-kiosk/blob/main/app/src/main/java/uk/nktnet/webviewkiosk/utils/openIntentUtils.kt ; https://github.com/aosp-mirror/platform_frameworks_base/blob/main/core/java/android/content/Intent.java
- [B3] https://www.macrodroidforum.com/wiki/index.php/Trigger:_HTTP_Server_Request ; https://wiki.macrodroid.com/wiki/index.php/Action:_HTTP_Server_Response ; https://macrodroidforum.com/wiki/index.php/Action:_Control_Media
- [B4] https://github.com/gpsnmeajp/g2_macrodroid/blob/main/README.md
- [B5] https://github.com/jodydugas-ctrl/mantle-os/blob/main/examples/Mantle_MacroDroid_Schema.yaml ; https://github.com/amanpandey1202/uncensored/blob/main/MACRODROID-SETUP.md
- [B6] https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid
- [B7] https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content ; https://github.com/chromium/chromium/commit/130ee686fa00b617bfc001ceb3bb49782da2cb4e
- [B8] https://github.com/chromium/chromium/blob/main/android_webview/browser/aw_field_trials.cc ; https://github.com/chromium/chromium/blob/main/android_webview/browser/aw_content_browser_client.cc
- [B9] https://developer.chrome.com/blog/local-network-access ; https://developer.chrome.com/release-notes/145 ; https://github.com/GoogleChrome/modern-web-guidance-src/issues/1127 ; https://github.com/chromium/chromium/blob/main/components/browser_ui/strings/android/site_settings.grdp
- [B10] https://dontkillmyapp.com/lenovo
- [B11] https://tasker.joaoapps.com/userguide/en/help/eh_http_request.html ; https://play.google.com/store/apps/details?id=net.dinglisch.android.taskerm&hl=en_US
- [B12] https://developer.android.com/develop/ui/views/appwidgets/overview
- [B13] https://github.com/nktnet1/webview-kiosk/blob/main/app/src/main/res/xml/network_security_config.xml
- [B14] https://github.com/nktnet1/webview-kiosk/blob/main/docs/content/docs/settings/js-scripts.mdx ; https://github.com/nktnet1/webview-kiosk/pull/289
- [B15] https://github.com/aosp-mirror/platform_frameworks_base/blob/main/media/java/android/media/session/MediaSessionManager.java
- [B16] https://developer.spotify.com/documentation/android/tutorials/android-media-notifications ; https://techdetective.com/amazon-music-no-lock-screen-controls/

**Repo facts** (read only, nothing modified): `/home/user/Home-Dashboard-/web/js/launcher.js`, `/home/user/Home-Dashboard-/web/js/config.js`, `/home/user/Home-Dashboard-/web/index.html` (the CSP is on line 11), commit 44a5195.

---

# The researched options in full

### 1. spotify

**research:**

**option:** Spotify Web API player controls from the static GitHub Pages panel (Authorization Code with PKCE, browser-only)

**feasible:** yes

**what the panel could show and do:**

Yes, but the account that owns the Spotify developer app needs Spotify Premium. Since February/March 2026 a development-mode app stops working entirely if its owner does not have Premium (https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security, https://github.com/Osasuwu/like-current-song/issues/122).

WHAT WORKS FROM THE PAGE (no server needed)
- Now playing: track or episode name, artists, album art (served from i.scdn.co), progress and duration, whether it is playing, shuffle and repeat state, and which device is playing (for example "Kitchen speaker" or "Lenovo TB-X606F"). This comes from GET /v1/me/player, or from GET /v1/me/player/currently-playing, which returns 204 when nothing is playing. The page can poll a few times a minute and move the progress bar forward locally between polls.
- Transport controls: play/resume, pause, next, previous, seek, shuffle, repeat and add-to-queue. Volume works only on devices that report supports_volume=true. Phones and tablets usually refuse remote volume changes with 403 VOLUME_CONTROL_DISALLOW (https://github.com/thelinmichael/spotify-web-api-node/issues/434, https://developer.spotify.com/documentation/web-api/reference/set-volume-for-users-playback).
- A "Play on…" device picker: GET /v1/me/player/devices lists devices, and PUT /v1/me/player with {device_ids:[id], play:true} moves playback to one of them (https://developer.spotify.com/documentation/web-api/reference/transfer-a-users-playback).
- Preset buttons such as "Kids playlist" or "Dinner jazz": PUT /v1/me/player/play?device_id=… with a context_uri (https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback).
- A settings switch between Spotify and Amazon Music. When Spotify is not connected, or its token has expired, the panel falls back to today's button that opens the Spotify app.

WHAT IT CANNOT DO RELIABLY
1. Play audio inside the page when running in WebView Kiosk. The Web Playback SDK needs DRM support (EME/Widevine), which the kiosk WebView does not provide. Details are in technical_details.
2. Wake a speaker or the tablet's Spotify app that is idle. Web API commands only reach a device that Spotify currently lists as available:
   - The Spotify app on the same tablet appears as a Connect device while it plays and for a while after. Once the app is backgrounded or killed after a pause, it drops out of the list or stops obeying commands. The long-standing reports are from 2019–2020 (https://github.com/spotify/web-api/issues/1171, https://github.com/spotify/web-api/issues/1559, https://community.spotify.com/t5/Spotify-for-Developers/Spotify-Web-Api-Device-goes-inactive-after-5-seconds-of-pausing/td-p/6521535). The Android app has a setting, Settings > Devices > "Spotify Connect in background", that keeps it available while in the background (https://x.com/SpotifyCares/status/2020544470186414280). Fallback: launch the app with the existing intent or spotify: link, wait until it shows in /devices, then transfer. This puts Spotify in front of the kiosk screen.
   - Google/Nest speakers are Google Cast devices, not native Spotify Connect devices. Spotify's documentation says "some device models are not supported and will not be listed" (https://developer.spotify.com/documentation/web-api/reference/get-a-users-available-devices). Cast devices are discovered only on the local network by a Spotify client, so the Web API usually lists and controls one only after a phone or tablet has started a Cast session on it (https://github.com/spotify/web-api/issues/787, https://community.spotify.com/t5/Spotify-for-Developers/Google-Cast-devices-in-device-list-queries/td-p/5077672). Cast support in Spotify was also broken for many users in 2025–2026. Spotify said Android app 9.1.48, rolling out from the week of 18 May 2026, fixes it (https://www.androidauthority.com/google-cast-devices-disappearing-from-spotify-connect-3665673/, https://9to5google.com/2026/05/11/spotify-is-investigating-why-google-cast-chromecast-devices-wont-show-in-connect/).
   - Phones running Spotify can be controlled while they are the active device.
   - Speakers with built-in Spotify Connect are the most reliable targets.
3. Tell whether the user has Premium from their profile. The product field was removed from GET /me in February 2026 (https://github.com/ramsayleung/rspotify/issues/550). Detect it instead from the 403 "premium required" reply to the first command.

HOUSEHOLD ACCOUNTS
- The panel controls one Spotify account at a time, the one that signed in.
- Other family accounts can each sign in only if the owner adds them to the app's allow-list (5 users maximum).
- Each of those accounts needs Premium to use the controls.

**requirements for owner:**

1. A Spotify Premium subscription on the account that creates the developer app. This is mandatory for development-mode apps from 11 Feb 2026 for new apps and from 9 Mar 2026 for existing ones. If Premium lapses, the app stops working. (https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security, https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/)
   - Playback-control endpoints also require Premium for the listener being controlled (https://developer.spotify.com/documentation/web-api/reference/pause-a-users-playback).
   - Mobile-only plans such as Premium Mini and Spotify Lite are not accepted by the Web Playback SDK, and may not satisfy the Premium check for control either (https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-not-working-with-Spotify-Lite-Premium-Mini/td-p/7269497).
2. One-time app registration at developer.spotify.com/dashboard:
   - Create an app and select "Web API". It stays in Development Mode; that is expected.
   - Add the redirect URI exactly as the page will send it, for example https://anginsemilir.github.io/Home-Dashboard-/ (trailing slash and case must match). HTTPS is mandatory for any redirect that is not a loopback address.
   - Copy the Client ID into the panel settings. It is public by design with PKCE. No client secret is used.
   - Sources: https://developer.spotify.com/blog/2025-02-12-increasing-the-security-requirements-for-integrating-with-spotify, https://community.spotify.com/t5/Spotify-for-Developers/INVALID-CLIENT-Invalid-redirect-URI/td-p/5228936
3. In the dashboard's User Management, add each Spotify account that will sign in to the panel (name and email). The limit is 5 per Client ID. Accounts not on the list can complete the login but then get 403 errors. (https://github.com/Osasuwu/like-current-song/issues/122)
4. Sign in once from the panel and grant these scopes: user-read-playback-state, user-read-currently-playing, user-modify-playback-state. Repeat the sign-in at least every 6 months, because refresh tokens now expire (https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration).
   - WebView Kiosk has a URL whitelist and blacklist (https://github.com/nktnet1/webview-kiosk), so allow navigation to accounts.spotify.com in it.
   - If the Spotify account signs in with "Continue with Google", that step fails inside an Android WebView with Google's disallowed_useragent block (https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/). Use email/password or an email code instead, or sign in on another browser and move the token over (see technical_details).
5. On the tablet, in the Spotify app, turn on Settings > Devices > "Spotify Connect in background" so the tablet stays controllable (https://x.com/SpotifyCares/status/2020544470186414280). It is probably also worth exempting Spotify from Android battery optimisation. That is general Android advice, not something Spotify documents.
6. Extended quota (production mode) is not available to an individual. Since 15 May 2025 Spotify accepts only registered organisations with at least 250k monthly active users, so the panel stays in Development Mode permanently. (https://developer.spotify.com/blog/2025-04-15-updating-the-criteria-for-web-api-extended-access)

**technical details:**

AUTH FLOW (works with a static page and no secret)
- Authorization Code with PKCE is Spotify's recommended flow for single-page apps where a secret cannot be stored (https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow). The implicit grant was removed on 27 Nov 2025, so PKCE is now the only browser-only option (https://developer.spotify.com/blog/2025-10-14-reminder-oauth-migration-27-nov-2025, https://github.com/Spotifyd/spotifyd/issues/1325).
- Spotify's own PKCE example (https://github.com/spotify/web-api-examples/blob/master/authorization/authorization_code_pkce/public/app.js) runs entirely in the browser:
  - It redirects to https://accounts.spotify.com/authorize with response_type=code, client_id, scope, code_challenge_method=S256, code_challenge and redirect_uri. The page should also send state.
  - It calls fetch() POST https://accounts.spotify.com/api/token with Content-Type application/x-www-form-urlencoded and grant_type=authorization_code, code, redirect_uri, client_id, code_verifier.
  - It refreshes with grant_type=refresh_token, refresh_token and client_id (no verifier, no redirect_uri).
  - It calls https://api.spotify.com/v1/me directly, and stores tokens in localStorage.
  - This shows CORS is served on both the token endpoint and api.spotify.com for browser origins.
  - Community reports of CORS failures on /api/token date from 2021–2022 and were intermittent or caused by misconfiguration (https://community.spotify.com/t5/Spotify-for-Developers/token-endpoint-CORS-Error/td-p/5232292). Nothing found indicates a 2025–2026 change.
- Save the code_verifier (sessionStorage or localStorage) before redirecting. The redirect returns to the same page with ?code=…&state=…; exchange the code, then strip the query string with history.replaceState.
- CSP additions:
  - connect-src: https://accounts.spotify.com and https://api.spotify.com
  - img-src: https://i.scdn.co for album art (https://developer.spotify.com/documentation/web-api/reference/get-an-album)

REDIRECT URI RULES
- Must be registered and match exactly: scheme, host, path and trailing slash.
- HTTPS is mandatory unless the address is loopback. Loopback must be a literal IP (http://127.0.0.1 or http://[::1]); "localhost" is rejected.
- Enforced for apps created from 9 Apr 2025, and for all apps from 27 Nov 2025.
- A github.io HTTPS path such as https://anginsemilir.github.io/Home-Dashboard-/ is valid.
- A 2025 dashboard bug rejected hyphens in some paths; Spotify marked it fixed. Test that the hyphenated path saves.
- Sources: https://developer.spotify.com/blog/2025-02-12-increasing-the-security-requirements-for-integrating-with-spotify, https://github.com/spotipy-dev/spotipy/issues/1186, https://community.spotify.com/t5/Spotify-for-Developers/Local-Redirect-URI-does-not-accept-hyphen-minus/td-p/6929053

TOKENS
- Access tokens last 1 hour (expires_in 3600) (https://developer.spotify.com/documentation/web-api/concepts/access-token).
- Refresh-token rotation with PKCE:
  - Older threads describe PKCE refresh tokens as single-use, with a new one returned on every refresh (https://community.spotify.com/t5/Spotify-for-Developers/Spotify-API-PKCE-Refresh-Token-Process/td-p/5235176).
  - The docs say a refresh response may or may not include a refresh_token, and to "continue using the existing token" when it is absent (https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens).
  - 2026 reports conflict. One says rotation happens periodically, the old token works once more, and then gives invalid_grant (https://github.com/davidpit1565/Jarvis/pull/104). Another says custom client IDs get no new refresh_token (https://github.com/music-assistant/support/issues/5797).
  - Handle it defensively:
    - Whenever a response includes refresh_token, save it to localStorage immediately.
    - Allow only one refresh at a time (a single-flight lock).
    - Never let two containers (WebView Kiosk and the Chrome app) share one refresh token.
- Hard lifetime: refresh tokens from both Authorization Code and PKCE expire 6 months after the original consent, and refreshing does not reset that. It applied at once to new apps (announced 18 Jun 2026) and to existing apps from 20 Jul 2026. On expiry the token endpoint returns 400 invalid_grant: discard the token and show "Reconnect Spotify" in settings. (https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration, https://github.com/raywo/MMM-NowPlayingOnSpotify/issues/151)
- Signing in on another device (my inference; test it): the refresh call needs only client_id and refresh_token, so the owner could authorise on a desktop browser at the same GitHub Pages URL and paste or QR the refresh token into the tablet's settings. The desktop page must then stop refreshing, because of rotation.

SCOPES (https://developer.spotify.com/documentation/web-api/concepts/scopes)
- user-read-playback-state: GET /v1/me/player (full state including device, shuffle, repeat, volume) and GET /v1/me/player/devices.
- user-read-currently-playing: GET /v1/me/player/currently-playing.
- user-modify-playback-state: all commands.
- Add additional_types=episode to include podcasts.
- streaming would be needed only for the Web Playback SDK.

WHICH ENDPOINTS NEED PREMIUM
- Every write or command endpoint's reference page says "This API only works for users who have Spotify Premium":
  - PUT /me/player/play, PUT /me/player/pause
  - POST /me/player/next, POST /me/player/previous
  - PUT /me/player/seek, /repeat, /volume, /shuffle
  - PUT /me/player (transfer), POST /me/player/queue
  - Sources: https://developer.spotify.com/documentation/web-api/reference/pause-a-users-playback, https://developer.spotify.com/documentation/web-api/reference/skip-users-playback-to-next-track, https://developer.spotify.com/documentation/web-api/reference/transfer-a-users-playback, https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback
- The read endpoints carry no such note. Since 2026 the app owner must have Premium anyway. Spotify does not say whether allow-listed non-owner users need Premium just to read (https://github.com/afrugalpenguin/spotdash/pull/106).
- Commands return 204 or 202. "The order of execution is not guaranteed" across player calls, so re-poll about 0.5–1 s after a command and update the UI optimistically.

DEVELOPMENT MODE IN 2026
- Up to 5 allow-listed users per Client ID (down from 25).
- 1 Client ID per developer from 11 Feb 2026, raised to 25 on 23 Jul 2026. All development-mode Client IDs on one developer account share a single quota.
- The February 2026 changes removed some endpoint families for development-mode apps: browse, artist top-tracks, batch "get several", other users' profiles and playlists, markets, and per-type library writes (replaced by PUT/DELETE /me/library). Search is capped at 10 results. Some fields were removed, such as track popularity, and product/email/country on /me.
- The player endpoints were not removed.
- Sources: https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide, https://developer.spotify.com/documentation/web-api/references/changes/february-2026, https://github.com/ramsayleung/rspotify/issues/550, https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates, https://developer.spotify.com/documentation/web-api/references/changes/july-2026

CONNECT DEVICES
- GET /v1/me/player/devices returns id, is_active, is_restricted, name, type, supports_volume and volume_percent.
- is_restricted=true means the device accepts no Web API commands.
- Some device models are never listed.
- Device IDs are not guaranteed to be stable, so match devices by name and re-list before a transfer.
- A 404 "Device not found" or "No active device" means the tablet or speaker has gone idle. Fall back to launching the app via intent.
- Sources: https://developer.spotify.com/documentation/web-api/reference/get-a-users-available-devices, https://github.com/spotify/web-api/issues/635

WEB PLAYBACK SDK INSIDE WEBVIEW KIOSK: NO
- The SDK decrypts audio through EME/Widevine and requires Premium. It officially supports mobile browsers, with autoplay and background limits (https://developer.spotify.com/documentation/web-playback-sdk, https://developer.spotify.com/blog/2021-09-13-web-playback-sdk-out-of-beta).
- An Android WebView exposes Widevine only if the host app grants PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID in onPermissionRequest (https://iut-fbleau.fr/docs/android/reference/android/webkit/PermissionRequest.html). Otherwise the SDK fails with "EMEError: No supported keysystem was found" (https://community.spotify.com/t5/Spotify-for-Developers/Webplayback-does-not-work-in-android-webview/td-p/5291412).
- The open-source Webview Kiosk (nktnet1/webview-kiosk) grants only camera and microphone; PROTECTED_MEDIA_ID is treated as unhandled and never granted (https://github.com/nktnet1/webview-kiosk/blob/main/app/src/main/java/uk/nktnet/webviewkiosk/utils/webview/handlers/handlePermissionRequest.kt).
- As an installed Chrome app, the SDK might work, since Chrome for Android ships Widevine. It has had EME failures on some Android Chrome versions (https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-Not-Working-on-Latest-Chrome-Android/td-p/5566302), and needs a user tap before sound (activateElement). It would also be a second player that stops whenever the page reloads or the screen sleeps. Controlling the native Spotify app through Connect is the better design.

RATE LIMITS AND POLLING
- Spotify counts calls in a rolling 30-second window and publishes no numbers. A 429 normally carries Retry-After (https://developer.spotify.com/documentation/web-api/concepts/rate-limits).
- Development mode also has quota buckets with unpublished limits, now per developer account. A 429 whose body has "reason":"QUOTA_EXCEEDED" means quota, not a burst limit (https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates).
- Third parties report 13–18 hour cooldowns after QUOTA_EXCEEDED (https://github.com/KJ-11/spotify-playlist-curator/pull/6). A 2026 community thread reports near-constant 429s for an app polling /v1/me/player every 2–3 s, and Spotify staff enlarging a daily playlist quota 8× (https://community.spotify.com/t5/Spotify-for-Developers/Low-number-of-requests-leading-to-429-response/td-p/7338415).
- Recommended polling:
  - About every 5–10 s while playing and the screen is on.
  - About every 30–60 s when paused or nothing is playing (204).
  - Stop when document.hidden is true or the screen sleeps.
  - Interpolate progress_ms locally and re-poll just after duration_ms runs out.
  - Honour Retry-After.
  - On QUOTA_EXCEEDED, back off for hours and show a "Spotify paused" state rather than retrying.
- Polling every 3 s would be about 28,800 calls a day, which risks the unpublished development-mode quota.

**recent changes:**

- 27 Nov 2024: new apps lost access to recommendations, audio features/analysis, related artists, featured/category playlists and preview URLs. Player endpoints were not affected. (https://techcrunch.com/2024/11/27/spotify-cuts-developer-access-to-several-of-its-recommendation-features/, https://musically.com/2024/11/28/spotify-removes-features-from-web-api-citing-security-issues/)
- 12 Feb 2025, announcement: the implicit grant and HTTP redirect URIs are removed, except loopback IP literals; "localhost" is banned. Enforced for apps created from 9 Apr 2025 and for all apps on 27 Nov 2025. PKCE is now the only browser-only flow and the redirect must be HTTPS. (https://developer.spotify.com/blog/2025-02-12-increasing-the-security-requirements-for-integrating-with-spotify, https://developer.spotify.com/blog/2025-10-14-reminder-oauth-migration-27-nov-2025)
- 15 Apr 2025, announcement: from 15 May 2025, extended quota is granted only to registered organisations with at least 250k MAU, not to individuals (https://developer.spotify.com/blog/2025-04-15-updating-the-criteria-for-web-api-extended-access).
- 6 Feb 2026, announcement: development mode requires the app owner to have Premium, allows 1 Client ID per developer and 5 allow-listed users (down from 25), and a smaller endpoint set. Applied to new apps on 11 Feb 2026 and existing apps on 9 Mar 2026. The February 2026 changelog removed about 15 endpoints and several fields, such as /me product and email and track popularity. The March 2026 changelog restored external_ids. Player endpoints remain. (https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security, https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide, https://developer.spotify.com/documentation/web-api/references/changes/february-2026, https://developer.spotify.com/documentation/web-api/references/changes/march-2026, https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/)
- May 2026: a Spotify bug hid Google Cast, Chromecast and Nest devices from Spotify Connect. Spotify pointed to Android app 9.1.48, rolling out from the week of 18 May 2026, as the fix (https://www.androidauthority.com/google-cast-devices-disappearing-from-spotify-connect-3665673/, https://9to5google.com/2026/05/11/spotify-is-investigating-why-google-cast-chromecast-devices-wont-show-in-connect/).
- 18 Jun 2026, announcement: refresh tokens from Authorization Code and PKCE expire 6 months after consent, and refreshing does not reset the clock. Applied to new apps immediately and existing apps from 20 Jul 2026. (https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration)
- 23 Jul 2026: the development-mode Client ID limit rose from 1 to 25. Quota is now counted per developer account and shared across its Client IDs. Quota 429s carry "reason":"QUOTA_EXCEEDED". (https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates, https://developer.spotify.com/documentation/web-api/references/changes/july-2026)

**risks:**

- Policy churn: Spotify has changed Web API access four times in about 18 months (Nov 2024, Feb/Apr 2025, Feb/Mar 2026, Jun/Jul 2026), each time removing features or adding requirements. A personal development-mode app has no upgrade path, and a future change could break the panel with little notice (https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security, https://developer.spotify.com/blog/2025-04-15-updating-the-criteria-for-web-api-extended-access).
- Premium dependency: if the owner's Premium lapses, the whole integration stops working (https://github.com/Osasuwu/like-current-song/issues/122).
- Re-authentication: the panel needs a new sign-in at least every 6 months, and whenever a rotated refresh token is lost (https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration, https://github.com/davidpit1565/Jarvis/pull/104). Signing in inside the WebView fails for Google-login accounts (https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/).
- Unpublished quotas: aggressive polling can trigger QUOTA_EXCEEDED, reportedly with cooldowns of many hours, and that would also block any other development-mode apps on the same developer account (https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates, https://github.com/KJ-11/spotify-playlist-curator/pull/6).
- Device reachability:
  - The tablet's Spotify app and Nest/Cast speakers often don't appear in /devices when idle, so "press play on the panel with nothing running" is unreliable (https://github.com/spotify/web-api/issues/1171, https://github.com/spotify/web-api/issues/787).
  - Cast support in Spotify had a significant bug in 2026 (https://www.androidauthority.com/google-cast-devices-disappearing-from-spotify-connect-3665673/).
  - Volume cannot be set on phones or tablets (https://github.com/thelinmichael/spotify-web-api-node/issues/434).
- Security of tokens in localStorage:
  - Anyone with physical or dev-tools access to the tablet, or any script injection into the page, could take the refresh token. The scopes are limited to reading and controlling playback, so exposure is limited, but keep the scope list minimal and the CSP strict.
  - Keep the Client ID in settings rather than in the repo if you prefer. It is not secret, but a public one lets strangers try logins; they fail unless allow-listed (https://github.com/Osasuwu/like-current-song/issues/122).
- Two containers (WebView Kiosk and the Chrome app) have separate localStorage. Signing in separately in each is fine. Copying one refresh token into both leads to rotation conflicts and invalid_grant.
- In-page playback (the Web Playback SDK) is not viable in WebView Kiosk (https://github.com/nktnet1/webview-kiosk/blob/main/app/src/main/java/uk/nktnet/webviewkiosk/utils/webview/handlers/handlePermissionRequest.kt, https://community.spotify.com/t5/Spotify-for-Developers/Webplayback-does-not-work-in-android-webview/td-p/5291412).
- Evidence caveat: developer.spotify.com, community.spotify.com, techcrunch.com and similar sites were blocked from direct fetching in this research environment. Claims attributed to them come from search-engine extracts of those pages, cross-checked against GitHub issues and PRs that quote them (fetched directly). Details such as exact rotation behaviour should be verified on the live docs.

**sources:**

- https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security
- https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- https://developer.spotify.com/documentation/web-api/references/changes/february-2026
- https://developer.spotify.com/documentation/web-api/references/changes/march-2026
- https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates
- https://developer.spotify.com/documentation/web-api/references/changes/july-2026
- https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration
- https://developer.spotify.com/blog/2025-04-15-updating-the-criteria-for-web-api-extended-access
- https://developer.spotify.com/blog/2025-02-12-increasing-the-security-requirements-for-integrating-with-spotify
- https://developer.spotify.com/blog/2025-10-14-reminder-oauth-migration-27-nov-2025
- https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- https://developer.spotify.com/documentation/web-api/concepts/rate-limits
- https://developer.spotify.com/documentation/web-api/concepts/scopes
- https://developer.spotify.com/documentation/web-api/concepts/access-token
- https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens
- https://developer.spotify.com/documentation/web-api/reference/pause-a-users-playback
- https://developer.spotify.com/documentation/web-api/reference/skip-users-playback-to-next-track
- https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback
- https://developer.spotify.com/documentation/web-api/reference/transfer-a-users-playback
- https://developer.spotify.com/documentation/web-api/reference/get-a-users-available-devices
- https://developer.spotify.com/documentation/web-api/reference/set-volume-for-users-playback
- https://developer.spotify.com/documentation/web-api/reference/get-an-album
- https://developer.spotify.com/documentation/web-playback-sdk
- https://developer.spotify.com/blog/2021-09-13-web-playback-sdk-out-of-beta
- https://github.com/spotify/web-api-examples/blob/master/authorization/authorization_code_pkce/public/app.js
- https://github.com/Osasuwu/like-current-song/issues/122
- https://github.com/afrugalpenguin/spotdash/pull/106
- https://github.com/ramsayleung/rspotify/issues/550
- https://github.com/raywo/MMM-NowPlayingOnSpotify/issues/151
- https://github.com/davidpit1565/Jarvis/pull/104
- https://github.com/music-assistant/support/issues/5797
- https://github.com/rowkavdev/nowplaying/pull/379
- https://github.com/KJ-11/spotify-playlist-curator/pull/6
- https://github.com/jamiew/spotify-mcp-cloudflare/issues/2
- https://github.com/spotipy-dev/spotipy/issues/1186
- https://github.com/Spotifyd/spotifyd/issues/1325
- https://github.com/spotify/web-api/issues/1171
- https://github.com/spotify/web-api/issues/1559
- https://github.com/spotify/web-api/issues/787
- https://github.com/spotify/web-api/issues/635
- https://github.com/thelinmichael/spotify-web-api-node/issues/434
- https://github.com/fondberg/spotcast
- https://github.com/nktnet1/webview-kiosk
- https://github.com/nktnet1/webview-kiosk/blob/main/app/src/main/java/uk/nktnet/webviewkiosk/utils/webview/handlers/handlePermissionRequest.kt
- https://iut-fbleau.fr/docs/android/reference/android/webkit/PermissionRequest.html
- https://community.spotify.com/t5/Spotify-for-Developers/Webplayback-does-not-work-in-android-webview/td-p/5291412
- https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-Not-Working-on-Latest-Chrome-Android/td-p/5566302
- https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-not-working-with-Spotify-Lite-Premium-Mini/td-p/7269497
- https://community.spotify.com/t5/Spotify-for-Developers/Low-number-of-requests-leading-to-429-response/td-p/7338415
- https://community.spotify.com/t5/Spotify-for-Developers/Spotify-Web-Api-Device-goes-inactive-after-5-seconds-of-pausing/td-p/6521535
- https://community.spotify.com/t5/Spotify-for-Developers/Google-Cast-devices-in-device-list-queries/td-p/5077672
- https://community.spotify.com/t5/Spotify-for-Developers/Spotify-API-PKCE-Refresh-Token-Process/td-p/5235176
- https://community.spotify.com/t5/Spotify-for-Developers/token-endpoint-CORS-Error/td-p/5232292
- https://community.spotify.com/t5/Spotify-for-Developers/Local-Redirect-URI-does-not-accept-hyphen-minus/td-p/6929053
- https://community.spotify.com/t5/Spotify-for-Developers/INVALID-CLIENT-Invalid-redirect-URI/td-p/5228936
- https://x.com/SpotifyCares/status/2020544470186414280
- https://www.androidauthority.com/google-cast-devices-disappearing-from-spotify-connect-3665673/
- https://9to5google.com/2026/05/11/spotify-is-investigating-why-google-cast-chromecast-devices-wont-show-in-connect/
- https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/
- https://techcrunch.com/2024/11/27/spotify-cuts-developer-access-to-several-of-its-recommendation-features/
- https://musically.com/2024/11/28/spotify-removes-features-from-web-api-citing-security-issues/
- https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/

**check:**

**corrections:**

- Allow-listed users and Premium (claim softened): the assessment says Spotify does not say whether allow-listed users other than the owner need Premium just to read. Reports on the 6 Feb 2026 change say only the app owner needs Premium and the other authorised accounts do not (https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/, https://www.neowin.net/news/spotify-now-requires-premium-accounts-for-developer-mode-api-access/; I saw both only through search-engine extracts). The command endpoints still say they work only for Premium users (https://developer.spotify.com/documentation/web-api/reference/pause-a-users-playback). Expected result: a family member on Spotify Free can sign in and see Now Playing, but play, pause, skip and transfer return 403. The assessment's advice that each account needs Premium for the controls still stands. Medium confidence.
- Missing 2026 option: Spotify Soloist, announced 13 Aug 2026 (https://developer.spotify.com/blog/2026-08-13-introducing-spotify-soloist, https://github.com/spotify/soloist). It is an official headless Spotify Connect receiver for a Raspberry Pi or other Linux box. A Premium account is needed to set it up; after that, Free and Premium users can connect. It has a local WebSocket API for playback, events and the queue, but that API has no TLS and no authentication, and Spotify says to bind it to 127.0.0.1 only (https://developer.spotify.com/documentation/soloist/reference/websocket-api, seen via search extract). So the GitHub Pages panel cannot use that API directly. It matters here because a Soloist box wired to a speaker would be a native Connect target for the Web API commands, possibly more dependable than the Nest/Cast speakers or the tablet's backgrounded app. Whether it stays listed in /v1/me/player/devices while idle is untested. Music Assistant's Spotify provider already has a Soloist playback backend (https://raw.githubusercontent.com/music-assistant/server/dev/music_assistant/providers/spotify/provider.py). Apart from this, the only 2026 developer blog posts found were 18 Jun (refresh tokens), 23 Jul (quota) and 13 Aug (Soloist); nothing newer was found for Aug–Sep 2026.
- Spotify's PKCE example is weak evidence of 2026 CORS behaviour and should not be copied as-is. I read the current file (https://raw.githubusercontent.com/spotify/web-api-examples/master/authorization/authorization_code_pkce/public/app.js). The client_id-only refresh (no verifier, no redirect_uri) and the browser fetch to /api/token are as the assessment describes. But the file is stale: its comment still says the redirect 'must be localhost URL and/or HTTPS', which Spotify banned in 2025. Its save() also writes refresh_token to localStorage every time, even when a refresh response leaves the field out, so a response without a rotated token would store 'undefined' and break later refreshes. Keep the existing token when the field is absent, as the refreshing-tokens doc says. I could not test CORS directly: accounts.spotify.com and api.spotify.com were blocked from this environment.
- Refresh-token rotation detail: Music Assistant's current Spotify code (dev branch, fetched Sep 2026) says Spotify returns a refresh_token only when it rotates one, and that rotation revokes the previous token. It saves a rotated token at once and treats invalid_grant as the 6-month expiry or a revocation (https://raw.githubusercontent.com/music-assistant/server/dev/music_assistant/providers/spotify/helpers.py, .../provider.py). The assessment, citing the Jarvis PR, says the old token works once more; do not rely on that grace. Its defensive handling (save immediately, one refresh at a time, never share a token between two containers) is right.
- Sign-in inside the WebView: Facebook login fails there too, not only Google. Spotify's own Android auth library dropped WebView for Custom Tabs 'since Google and Facebook Login no longer support WebViews' (https://raw.githubusercontent.com/spotify/android-auth/master/CHANGELOG.md, v2.0.0). The panel already has a 'sign in in Chrome, then Copy settings into the kiosk app' flow for Google (docs/google.md, web/js/settings-ui.js), and Spotify can reuse it. After pasting, the Chrome copy must delete its Spotify token or stop refreshing it, or rotation will make one of them fail with invalid_grant.
- WebView Kiosk URL lists (nuance): the blacklist and whitelist are optional and empty by default (UserSettings.kt in nktnet1/webview-kiosk at commit 02cf64c, 2026-09-23), and the repo's docs/tablet.md does not set one. So allowing accounts.spotify.com is needed only if the owner has added a list. Confirmed at the same commit: handlePermissionRequest.kt grants only camera and microphone and denies everything else, including PROTECTED_MEDIA_ID (https://github.com/nktnet1/webview-kiosk/blob/main/app/src/main/java/uk/nktnet/webviewkiosk/utils/webview/handlers/handlePermissionRequest.kt). The claim that the Web Playback SDK cannot work in WebView Kiosk stands.
- Repo context: the Spotify / Amazon Music switch in settings already exists. Commit 44a5195 (27 Sep 2026) added it: config.js has panel.music ('spotify' | 'amazonmusic') and launcher.js has MUSIC_APPS. The Spotify controls should hang off that setting rather than add a new one. The current CSP is img-src 'self' data:, so album art needs https://i.scdn.co added, as the assessment says. From memory and unverified: playlist or preset cover images can come from other Spotify image hosts (for example mosaic.scdn.co or *.spotifycdn.com), so check the image URLs before narrowing img-src to i.scdn.co.
- Wording fix: 'Spotify Lite' is an app, not a subscription plan, and the Premium Mini / Lite claim rests on one community thread. The household appears to be UK-based (the code links to music.amazon.co.uk). My unverified belief is that Premium Mini is sold only in some markets, so it is probably irrelevant here. Low confidence; I could not re-check.
- Minor gap in recent_changes: the May 2026 Web API changelog added account_id to GET /me (https://developer.spotify.com/documentation/web-api/references/changes/may-2026, via search extract). It does not matter for playback controls.
- Confirmed (no change needed): (1) From 6 Feb 2026, the app owner needs Premium, each developer gets 1 Client ID and each app 5 users; this applied to new apps from 11 Feb 2026 and existing apps from 9 Mar 2026 (https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security). (2) The 6-month refresh-token lifetime, announced 18 Jun 2026, applies to existing apps from 20 Jul 2026, and refreshing does not reset it (https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration, https://github.com/raywo/MMM-NowPlayingOnSpotify/issues/151). (3) On 23 Jul 2026 the limit went to 25 Client IDs, quota became shared per developer account, and quota 429s carry reason QUOTA_EXCEEDED (https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates). (4) Since May 2025, extended quota requires an organisation with at least 250k MAU. (5) The product, email and country fields are gone from /me (rspotify 0.16.0 marks them 'Spotify has removed this field': https://raw.githubusercontent.com/ramsayleung/rspotify/master/rspotify-model/src/user.rs). (6) The player endpoints (devices, playback state, currently playing, transfer, play, pause, next, previous, seek, repeat, volume, shuffle, queue) and /me/playlists were not removed; only browse, batch 'several', artist top tracks, other users' profiles and playlists, and the per-type library writes were deprecated (https://raw.githubusercontent.com/ramsayleung/rspotify/master/src/clients/base.rs, .../oauth.rs, https://raw.githubusercontent.com/ramsayleung/rspotify/master/CHANGELOG.md).
- Not re-verified, so treat as unconfirmed. The official and news sites (developer.spotify.com, community.spotify.com, x.com, androidauthority, 9to5google) were blocked here, and the web-search budget ran out. Unconfirmed: the Cast/Nest Connect bug and the Android 9.1.48 fix from the week of 18 May 2026; the Android setting Settings > Devices > 'Spotify Connect in background' (the only source is an X post); the 13–18 hour QUOTA_EXCEEDED cooldowns and the '8x quota' staff reply; the 2025 bug that rejected hyphens in redirect URIs; 403 VOLUME_CONTROL_DISALLOW on phones and tablets.

**confidence:** medium

**corrected feasible:** yes

**notes:**

The overall conclusion holds. A browser-only PKCE integration with the Spotify Web API can show Now Playing and send commands (transport, device picker, presets) from the static GitHub Pages panel. It needs the owner on Premium, the app in Development Mode (5 allow-listed users) and a new sign-in at least every 6 months. It cannot play audio inside WebView Kiosk and cannot wake idle devices.

What I verified and how:
- Checked directly: Spotify's PKCE example source; the WebView Kiosk permission handler and default URL settings (commit 2026-09-23); rspotify 0.16 source and changelog (fields and endpoints removed in Feb 2026, player endpoints kept); Spotify's android-auth changelog (Google and Facebook login fail in WebViews); Music Assistant's current Spotify token handling (rotation, invalid_grant, 6-month expiry; it also ships a Soloist backend); the spotify/soloist README; this repo's commit 44a5195 and its CSP.
- Seen only through search-engine extracts: the Feb, Jun and Jul 2026 policy dates and limits, the 250k-MAU rule, and the 13 Aug 2026 Soloist launch. developer.spotify.com was blocked from direct fetching.

Main changes to the assessment:
- Free allow-listed users can probably read Now Playing but not control playback.
- Soloist (Aug 2026) is a new official Connect receiver the assessment missed. Its local WebSocket API is localhost-only with no TLS, so the panel would still control it through the Web API.
- Don't copy Spotify's PKCE example verbatim: it is stale and overwrites refresh_token.
- Rotated refresh tokens appear to be revoked immediately.
- Reuse the panel's existing Chrome sign-in + Copy settings flow, then drop the token in Chrome.
- The Spotify/Amazon Music switch already exists in the repo.

Could not re-check: the Cast bug and app version, the 'Spotify Connect in background' setting, the quota cooldown anecdotes, and live CORS on accounts.spotify.com and api.spotify.com (both blocked here).

Scratch copies of the fetched sources are in /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad/spcheck/. No repo files were modified.

### 2. amazon

**research:**

**option:** Amazon Music (official Web API, Login with Amazon, Alexa routes, unofficial routes, Android app links for com.amazon.mp3)

**feasible:** partly

**what the panel could show and do:**

SHORT ANSWER: There is no public Amazon Music API that a personal web page can use to show what's playing or to play, pause or skip. The panel can reliably do three things: open the Amazon Music app, open a specific playlist in it, and (with an extra service) send play/pause/next to an Echo speaker. It cannot read or control the Amazon Music app playing on the tablet itself.

1) Works now, no API needed (the repo already does this): a Settings choice between Spotify and Amazon Music (commit 44a5195, web/js/launcher.js, APPS.amazonmusic = { pkg: 'com.amazon.mp3', web: 'https://music.amazon.co.uk/' }).
- WebView Kiosk opens the app with a launcher intent: intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.amazon.mp3;launchFlags=0x10000000;end
- Chrome opens it with the https app link: intent://music.amazon.co.uk/#Intent;scheme=https;package=com.amazon.mp3;end
- I checked on 2026-09-27 that music.amazon.co.uk and music.amazon.com both list com.amazon.mp3 as allowed to handle their links (Google Digital Asset Links API; the check returned linked:true).

2) Easy addition: playlist tiles. Each tile would open one playlist in the app, using the same intent:// form in both WebView Kiosk and Chrome:
intent://music.amazon.co.uk/playlists/B01M2AC326#Intent;scheme=https;package=com.amazon.mp3;S.browser_fallback_url=https%3A%2F%2Fmusic.amazon.co.uk%2Fplaylists%2FB01M2AC326;end
- Curated playlists use /playlists/<ASIN> (e.g. Hits UK = B01M2AC326). Your own or community playlists use /user-playlists/<id>.
- Amazon documents no link or URL parameter that starts playback automatically. Expect the playlist page to open and one tap on Play to be needed (not tested on the tablet).

3) No official "now playing" or play/pause for the Amazon Music app on the tablet. A web page's Media Session API only covers media that page plays itself. It cannot see or drive another Android app.

4) Optional, controls an Echo rather than the tablet: Voice Monkey. Panel buttons such as "Play Kitchen playlist", Pause, Next and Volume would each fire an Alexa Routine. The routine does "Play <playlist> from Amazon Music on <Echo>", or a Custom action typed as you would say it ("pause", "next song"). This is one-way: no track title or cover art comes back.

5) Optional, full controls plus now playing for an Echo: Home Assistant. Its core Alexa Devices integration gained a media player in 2026.6. It gives title and artist, play/pause/next/previous/stop/volume, and play_media, which plays a search phrase on a named music provider. The panel would call the Home Assistant REST API. This needs a Home Assistant server and an Echo.

6) Controlling the tablet's own Amazon Music app from the panel needs a native helper. For example, the Home Assistant Companion app's command_media notification command with media_package_name com.amazon.mp3 (play_pause, next and so on). That also needs a Home Assistant server. Tasker is another route, but I did not research it.

**requirements for owner:**

OFFICIAL AMAZON MUSIC WEB API: in practice not available to you.
- It is a closed beta for approved developers; Amazon says to contact your Amazon Business Development representative.
- A moderator reply (March 2025) said the waiting list was full. A developer was still asking when it opens on 6 Jan 2026.
- Even with access you would need: an Amazon Developer account, a Login with Amazon (LWA) security profile, Amazon certification before distributing the product, and a Widevine DRM licence to play audio.

TO OPEN THE APP OR PLAYLIST TILES: nothing extra.
- Amazon Music (com.amazon.mp3) installed on the tablet and signed in.
- To confirm the link hand-off, run on the tablet over adb: adb shell pm get-app-links com.amazon.mp3 (and test with: adb shell am start -a android.intent.action.VIEW -d "https://music.amazon.co.uk/playlists/B01M2AC326" com.amazon.mp3).

VOICE MONKEY ROUTE:
- An Echo or other Alexa device, and the Voice Monkey Alexa skill enabled.
- A Voice Monkey account and API token (app.voicemonkey.io/tokens). The free plan includes routine triggers; paid tiers are Hobby at $76/yr and Ultimate at $142/yr.
- One trigger device per action, each tied to an Alexa Routine built in the Alexa app.
- Store the token in the panel's localStorage, and add https://api-v3.voicemonkey.io to the page's CSP connect-src.

HOME ASSISTANT ROUTE:
- A Home Assistant server (2026.6 or later for the Alexa Devices media player).
- Your Amazon account password plus an authenticator-app one-time code, set as the preferred 2-step verification method (SMS codes do not work).
- A Home Assistant long-lived access token stored in the panel.
- Home Assistant's http "CORS allowed origins" set to https://anginsemilir.github.io.
- Home Assistant reachable over HTTPS, because an https page cannot call an http address.
- To control the tablet's own app: the Home Assistant Companion app on the tablet as well.

**technical details:**

AMAZON MUSIC WEB API (closed beta, docs marked "preview"):
- Base URL: https://api.music.amazon.dev/v1/
- Every call needs two headers: Authorization: Bearer <LWA access token>, and x-api-key: <LWA Security Profile ID, amzn1.application.…>. The Security Profile ID is not the client ID (amzn1.application-oa2-client.…).
- Scopes look like music::profile, music::library, music::library:read and music::catalog; ":read" means read-only.
- Coverage: catalog metadata (albums, tracks, artists, playlists, podcasts), user profile, library, playlists (get, create, update), and the Player API's GET /player/recentlyPlayed. That is history, not "now playing".
- The Playback API (sessions and queue; the service decides what plays next) is for building your own player. Streams are Widevine-encrypted, need a licence, and need X-Amzn-Audio-DrmType and X-Amzn-Audio-Device-Capability headers.
- I found no documented endpoint for remote-controlling the Amazon Music app or an Echo (nothing like Spotify Connect). A 2025 community thread asking exactly this ("Controlling the Amazon Music Player via the API") shows no such feature.
- The older Device API is deprecated; no new apps are being onboarded to it.
- I could not test whether api.music.amazon.dev allows browser (CORS) calls; developer.amazon.com was blocked from my environment.

LOGIN WITH AMAZON FROM A STATIC PAGE:
- The implicit grant is deprecated. New security profiles must use the Authorization Code grant; browser apps use it with PKCE (LWA JS SDK: authorize with pkce:true, then amazon.Login.retrieveToken).
- The page's origin must be listed under Allowed JavaScript Origins.
- Token endpoint: https://api.amazon.com/auth/o2/token. Access tokens last 3600 s. Refresh tokens last until the user removes the app, and each refresh returns a new refresh token.
- All of this is moot unless the Music API beta is granted.

ALEXA:
- Alexa Skills Kit skills can only play their own audio (AudioPlayer). They cannot drive Amazon Music on an Echo.
- The routes that work are Routines:
  - Voice Monkey v3: GET https://api-v3.voicemonkey.io/trigger?token=…&device=… (POST with a JSON body also works). The announce endpoint is /announce with a "speech" field. v3 launched about 27 Apr 2026; api-v2 still works but is expected to be retired by Dec 2026.
  - I did not verify CORS headers. A fire-and-forget fetch(url, {mode:'no-cors'}) needs no CORS, but it returns no status.
  - The Routine's Custom action accepts any phrase you would say, e.g. "pause", "next song".
- Home Assistant Alexa Devices (core since 2025.6; library aioamazondevices 16.3.0 on dev):
  - media_player supports VOLUME_SET/STEP/MUTE, STOP, PLAY_MEDIA, PLAY/PAUSE/NEXT/PREVIOUS (when the device allows), media_title and media_artist.
  - play_media sends a search phrase to a given provider.
  - It polls every 5 minutes, but media state and volume arrive as push events.
  - Amazon applies rate limits.
  - The media_player.py file first appears at tag 2026.6.0 (it is missing at 2026.5.0).
- The panel would call Home Assistant with POST /api/services/media_player/media_play_pause and read GET /api/states/media_player.<echo>.

GOTCHAS:
- intent: links in Chrome only open app screens marked BROWSABLE, need a user tap, and fall back to S.browser_fallback_url.
- Android 12 opens unverified app links in the browser. The explicit package= in the intent:// link avoids relying on verification, but the app must still declare that host and path. I could not read the APK manifest (APK mirror sites were blocked), so check the path on the tablet.
- Other packages also allowed for these domains: com.amazon.mp3.galaxy, com.amazon.music.tv, com.amazon.bueller.music.
- Amazon Music "Embed Player" iframes (music.amazon.co.uk/embed/<id>/…) are reported to play only 30-second previews, and I found no documented JavaScript control API. Using one would also need a frame-src CSP entry.

**recent changes:**

- 2025 to Sept 2026: the Amazon Music Web API is still a closed beta. The docs still say "closed Beta, check back soon" (search index, 2026). A community reply in March 2025 said the waiting list was full. In March 2025 Dev Relations told a Music Assistant contributor that more slots would open mid-2025, but a 6 Jan 2026 thread is still asking when it opens. I found no announcement that it opened in 2026.
- Aug 2025: the Music Assistant maintainers reported that talks with Amazon failed over encrypted (DRM) streams.
- The Device API is deprecated; no new onboarding.
- Login with Amazon now marks the implicit grant as deprecated: Authorization Code (plus PKCE for browser apps) only for new security profiles.
- June 2025: Home Assistant 2025.6 added the core Alexa Devices integration. Its media player (with now-playing and transport controls) shipped in 2026.6.
- The unofficial alexa_media_player add-on had 2FA and login-renewal breakages reported through 2025.
- 4 Nov 2025: Alexa+ was added to the Amazon Music app (Android/iOS). 19 Mar 2026: Alexa+ Early Access began in the UK (free with Prime afterwards). This changes the voice experience only, not developer access.
- About 27 Apr 2026: Voice Monkey launched API v3 (api-v3.voicemonkey.io); v2 is expected to be retired by Dec 2026.
- Checked 27 Sep 2026: music.amazon.co.uk and music.amazon.com asset links still authorize com.amazon.mp3.

**risks:**

- The official route is a dead end for a personal page: the beta is closed, Amazon must certify the product, it needs a Widevine licence, and the Music Program Requirements restrict collecting or using data about users' listening.
- Unofficial Amazon Music scrapers need your Amazon login cookies or password and cannot run in a browser (cookies, CORS). Some also pull Widevine keys, which breaches the Amazon Music Terms of Use §3.3 ("no reverse engineering or circumvention") and could get the account locked. Examples: Jaffa/amazon-music, a Python 2/3-era library that drives the web player's internal JSON API; AmineSoukara/amazon-music, which extracts Widevine keys. Do not use these.
- Alexa unofficial APIs (Home Assistant Alexa Devices, alexa_media_player) copy the Alexa app. Amazon "may cut off access at any time". They need your Amazon password plus an authenticator one-time code stored on the Home Assistant server, and they hit Amazon rate limits and login breakages. The Home Assistant token stored in the tablet's localStorage gives full control of Home Assistant, so a scoped user is advisable.
- Voice Monkey token in localStorage: anyone who can read it can trigger your routines and announcements. It is a third-party cloud dependency; the v2 to v3 migration shows the API can move; no-cors calls give no error feedback; and routine phrasing can misfire.
- The Alexa routes control Echo speakers, not the tablet. The tablet-local route needs Home Assistant plus its Companion app.
- Deep links are undocumented: the playlist path or package filters may change with app updates, and playlists may not auto-play. Test with adb and keep the https fallback.
- Embed iframes: 30-second previews reported, no control API, and they widen the CSP.

**sources:**

- https://developer.amazon.com/docs/music/API_web_overview.html
- https://developer.amazon.com/docs/music/get_started_program-overview.html
- https://developer.amazon.com/docs/music/landing_home.html
- https://developer.amazon.com/docs/music/API_web_LWA.html
- https://developer.amazon.com/docs/music/API_web_player.html
- https://developer.amazon.com/docs/music/API_web_user.html
- https://developer.amazon.com/docs/music/API_web_library.html
- https://developer.amazon.com/docs/music/API_web_playlist.html
- https://developer.amazon.com/docs/music/API_playback_overview.html
- https://developer.amazon.com/docs/music/API_playback_sessions.html
- https://developer.amazon.com/docs/music/playback_overview.html
- https://developer.amazon.com/docs/music/API_browse_overview.html
- https://developer.amazon.com/docs/music/requ_AM-Program-Requirements.html
- https://community.amazondeveloper.com/t/request-for-amazon-music-api-access/24864
- https://community.amazondeveloper.com/t/how-can-i-access-the-amazon-music-api/9253/2
- https://community.amazondeveloper.com/t/any-idea-when-the-api-in-closed-beta-will-be-open/25269
- https://community.amazondeveloper.com/t/controlling-the-amazon-music-player-via-the-api/7805
- https://github.com/orgs/music-assistant/discussions/626
- https://musicapi.com/blog/?post=amazon-music-api-2026-developer-access-endpoints-unified-integration
- https://developer.amazon.com/docs/login-with-amazon/implicit-grant.html
- https://developer.amazon.com/docs/login-with-amazon/authorization-code-grant.html
- https://developer.amazon.com/docs/login-with-amazon/access-token.html
- https://developer.amazon.com/docs/login-with-amazon/refresh-token.html
- https://developer.amazon.com/docs/login-with-amazon/faq.html
- https://developer.amazon.com/en-US/docs/alexa/custom-skills/audioplayer-interface-reference.html
- https://www.amazon.com/gp/help/customer/display.html?nodeId=GLXY7RFX3L5GH2VR
- https://www.amazon.com/gp/help/customer/display.html?nodeId=201380010
- https://voicemonkey.io/docs/api
- https://voicemonkey.io/docs/migrating-from-v2
- https://voicemonkey.io/pricing
- https://raw.githubusercontent.com/home-assistant/home-assistant.io/current/source/_integrations/alexa_devices.markdown
- https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/alexa_devices/media_player.py
- https://raw.githubusercontent.com/home-assistant/core/2026.6.0/homeassistant/components/alexa_devices/media_player.py
- https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/alexa_devices/manifest.json
- https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/alexa_devices/services.yaml
- https://raw.githubusercontent.com/home-assistant/home-assistant.io/current/source/_integrations/http.markdown
- https://github.com/alandtse/alexa_media_player
- https://github.com/alandtse/alexa_media_player/issues/2934
- https://companion.home-assistant.io/docs/notifications/notification-commands/
- https://community.home-assistant.io/t/anyone-use-the-command-media-notifications-in-the-android-app/455359
- https://raw.githubusercontent.com/Jaffa/amazon-music/master/DEVELOPMENT.md
- https://github.com/AmineSoukara/amazon-music
- https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/media_session_api/index.md
- https://developer.chrome.com/docs/android/intents
- https://developer.android.com/training/app-links/verify-android-applinks
- https://www.xda-developers.com/android-12-will-always-open-non-verified-links-in-the-default-browser/
- https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://music.amazon.co.uk&relation=delegate_permission/common.handle_all_urls
- https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://music.amazon.com&relation=delegate_permission/common.handle_all_urls
- https://music.amazon.co.uk/playlists/B01M2AC326
- https://music.amazon.com/user-playlists/5d0b5b97b1eb4d5f926079c0411e5bc5itit
- https://www.amazonforum.com/s/question/0D54P00007YfzMhSAJ/when-i-embed-a-playlist-on-my-website-only-30-seconds-of-each-track-plays-before-skipping-to-the-next-one
- https://www.digitalmusicnews.com/2025/11/04/alexa-plus-amazon-music-app/
- https://techcrunch.com/2026/03/19/amazon-brings-alexa-to-the-uk
- https://www.aboutamazon.co.uk/news/devices/introducing-alexa-in-the-uk-the-next-generation-of-alexa

**check:**

**corrections:**

- Home Assistant route understated (Echo now-playing). The 2026.6 Alexa Devices media player gives more than title and artist. It also exposes album (media_album_name), album-art URL (media_image_url), duration and position, so the panel CAN show cover art through Home Assistant. Showing that art needs the Home Assistant origin added to the page's img-src as well as connect-src. Verified in code: https://raw.githubusercontent.com/home-assistant/core/2026.6.0/homeassistant/components/alexa_devices/media_player.py (the same in dev). The file is missing at 2026.5.0 and present at 2026.6.0, and the release is confirmed at https://www.home-assistant.io/blog/2026/06/03/release-20266/.
- Voice Monkey is not needed on the Home Assistant route. Since 2026.5, Alexa Devices exposes each Alexa Routine as a Button entity (verified: button.py mentions routines at tag 2026.5.0 but not at 2026.4.0; https://raw.githubusercontent.com/home-assistant/core/2026.5.0/homeassistant/components/alexa_devices/button.py). The docs list 'Button - Execute Alexa routines'. The integration also has an alexa_devices.send_text_command service (example: 'Play B.B.C. on TuneIn'). So the panel can POST /api/services/button/press, or send a typed command such as 'play Kitchen playlist from Amazon Music'. Sources: https://raw.githubusercontent.com/home-assistant/home-assistant.io/current/source/_integrations/alexa_devices.markdown and https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/alexa_devices/services.yaml.
- Home Assistant Companion route understated (now-playing for the tablet's own Amazon Music app). Besides command_media control (commands: play, pause, play_pause, next, previous, stop, fast_forward, rewind; https://raw.githubusercontent.com/home-assistant/companion.home-assistant/master/docs/notifications/commands.md), the Android Companion app has a 'Media session sensor'. Its state is the primary session's playback state, and its attributes carry media data for every active session, grouped by package name (so com.amazon.mp3 is included). It needs notification permission. It updates on the 15-minute sensor interval, or every minute with Sensor Update Frequency set to 'Fast Always' or 'Fast While Charging' (a wall panel is always charging). So the tablet's own app CAN be shown as 'now playing' via Home Assistant, but with up to about 1 minute of lag. Source: https://raw.githubusercontent.com/home-assistant/companion.home-assistant/master/docs/core/sensors.md.
- Voice Monkey free plan is capped. The free plan has a budget of 200 API requests per month. Going over returns MONTHLY_QUOTA_EXCEEDED until the next billing period. Hobby allows 15,000 requests a month, Ultimate is unlimited, and the $76 and $142 yearly prices check out. Play/pause/next buttons on a family panel could use up 200 requests quickly. With fetch mode:'no-cors' the panel would never see the quota error, so buttons would silently stop working. Sources: https://voicemonkey.io/docs/api and https://voicemonkey.io/pricing. I saw these only through the search index, because voicemonkey.io was blocked from my environment.
- Voice Monkey v3 device model changed. In v3, the Alexa app shows ONE device, 'Alexa Voice Monkey v3'. Each Routine Trigger is a named event inside it (under 'VM Routines'), not a separate trigger device. You still create one Trigger and one Alexa Routine per action. v2 and v3 tokens are not interchangeable between api-v2 and api-v3. Also, a no-cors fetch can only send CORS-safelisted headers, so a POST with a JSON body would lose its application/json content type. Use the GET query-string form (/trigger?token=…&device=…). Sources: https://voicemonkey.io/docs/devices and https://voicemonkey.io/docs/migrating-from-v2 (via search index). v3 opening on 27 Apr 2026 and v2 being 'expected to be deprecated by December 2026' are both confirmed.
- 'Home Assistant must be HTTPS because an https page cannot call an http address' is outdated for Chrome. Since Chrome 142 (Oct 2025), public sites need a Local Network Access permission prompt to reach LAN addresses. Once the permission is granted, requests Chrome knows are local are exempt from mixed-content blocking. That covers a private IP literal, a .local hostname, or fetch(..., {targetAddressSpace:'local'}). So in Chrome, https://anginsemilir.github.io could call http://192.168.x.x or http://homeassistant.local after the user allows the prompt. In Android WebView the LNA permission is currently granted unconditionally, but I could not confirm that WebView applies the mixed-content exemption: WebView blocks mixed content by default. So HTTPS (for example Nabu Casa or a reverse proxy) is still the safe choice for WebView Kiosk. Sources: https://developer.chrome.com/blog/local-network-access and https://developer.chrome.com/release-notes/142 (via search index); https://blog.openreplay.com/chrome-local-network-access-lna-permission/ for the WebView behaviour.
- Home Assistant HTTP settings moved (2026 change worth noting). CORS allowed origins is now set in the UI under Settings > System > Network > HTTP server, not only in YAML. Since 2026.8, the default port on Home Assistant OS is 80, not 8123 (Container stays 8123). The URL the panel stores must match. Source: https://raw.githubusercontent.com/home-assistant/home-assistant.io/current/source/_integrations/http.markdown.
- The Login with Amazon implicit-grant change is NOT a 2025-2026 change and should come out of recent_changes. LWA already stopped allowing the implicit grant for new security profiles, and existing profiles could use it only until 30 April 2021. PKCE with the Authorization Code grant is required for browser apps. Source: https://developer.amazon.com/docs/login-with-amazon/implicit-grant.html (via search index). Minor extra point: the LWA JS SDK loads from assets.loginwithamazon.com, which the panel's script-src 'self' CSP would block. That is moot without beta access.
- 'A Widevine DRM licence to play audio' is misleading. The Amazon Music Playback docs say streams are Widevine-protected, the client must support Widevine L3 or better, and it must request licence keys from Amazon's licence server (X-Amzn-Audio-DrmType: Widevine). That is a client capability plus per-stream licence requests, not a separate licence the owner buys. Chrome on Android has Widevine L3 or better. Source: https://developer.amazon.com/docs/music/playback_overview.html (via search index). Medium confidence.
- Auto-play deep links: soften 'Amazon documents no link or URL parameter that starts playback'. Amazon's own Web API sample responses (track and player pages) show track deep links of the form https://music.amazon.com/albums/<albumAsin>/?trackAsin=<trackAsin>&do=play. It is not documented as a supported parameter, and I could not confirm the app honours it for /playlists/ links. Worth testing on the tablet: add ?do=play to the playlist intent:// URL. Sources: https://developer.amazon.com/docs/music/API_web_track.html and https://developer.amazon.com/docs/music/API_web_player.html (seen only via search index; low-medium confidence).
- Playlist tile caveat missing: Hits UK (B01M2AC326) is an Amazon Music Unlimited playlist. On a Prime-only account most catalog playlists play in shuffle with skip limits. Only 'All-Access Playlists' play on demand, and All-Access playlists requested on an Echo play shuffled. Sources: https://music.amazon.co.uk/playlists/B01M2AC326 (title: 'Hits UK Playlist on Amazon Music Unlimited') and https://www.amazon.com/gp/help/customer/display.html?nodeId=GKL9M88FFWYHY7T9.
- alexa_media_player citation is off. Issue #2934 (opened 5 Jul 2025, closed, amazon.de) is 'No Alexa devices or entities appear after successful login (2FA OK)'. It is not a 2FA or login-renewal breakage. The project is actively maintained: v5.16.0 and v5.16.1 were released 12-13 Sep 2026. The 'Amazon may cut off access at anytime' quote comes from the alexa_media_player README, not from the core Alexa Devices docs. Sources: https://github.com/alandtse/alexa_media_player/issues/2934, https://github.com/alandtse/alexa_media_player/releases, https://raw.githubusercontent.com/alandtse/alexa_media_player/dev/README.md.
- Minor: the Alexa+ UK status has moved on. Early access began 19 Mar 2026 and was free during the trial. Afterwards it is included with Prime or costs £19.99/month without Prime (https://www.macrumors.com/2026/03/19/amazons-alexa-launches-uk-free-early-access/). A secondary source headlines 'Alexa+ Early Access UK Ends 15 September 2026' (https://smarthomeassistant.co.uk/articles/home-automation/alexa-plus-early-access-uk-ending, unverified; the page was blocked). None of this changes developer access. Also, the 'moderator' in the March 2025 'waiting list full' reply is Marco from Amazon developer relations (https://community.amazondeveloper.com/t/how-can-i-access-the-amazon-music-api/9253/2).

**confidence:** medium

**corrected feasible:** partly

**notes:**

Overall verdict unchanged: 'partly'. There is still no public Amazon Music API that a static page can use for now-playing or transport controls. The Web API is still a closed beta, and I found no 2026 announcement that it has opened. What the panel can do is limited to opening the app or a playlist, plus Echo or tablet control through Home Assistant or Voice Monkey. The corrections mostly make the Home Assistant route stronger:
- Cover art comes back for an Echo.
- Routines can be run without Voice Monkey (2026.5+).
- The Companion app's Media session sensor gives now-playing for the tablet's own app.
- Chrome's Local Network Access rules (Chrome 142+) relax the HTTPS requirement in Chrome, though not reliably in the WebView kiosk.
They also weaken the Voice Monkey free tier (200 requests a month).

Claims I confirmed:
- Repo: commit 44a5195 and web/js/launcher.js with APPS.amazonmusic {pkg:'com.amazon.mp3', web:'https://music.amazon.co.uk/'}. The launch-intent and appLink forms match. The CSP connect-src currently lacks any Amazon, Voice Monkey or Home Assistant host.
- Digital Asset Links (re-run today): music.amazon.co.uk and music.amazon.com list com.amazon.mp3, com.amazon.mp3.galaxy, com.amazon.music.tv and com.amazon.bueller.music. assetlinks:check returned linked:true.
- Home Assistant: Alexa Devices ha_release 2025.6. media_player.py is missing at 2026.5.0 and present at 2026.6.0. Manifest pins aioamazondevices==16.3.0. It polls every 5 minutes with push for media and volume. It needs an authenticator-app OTP as the preferred 2FA method (SMS not supported). Amazon rate limits apply. play_media sends a search phrase to a provider.
- Music Assistant #626: 6 Aug 2025, talks with Amazon failed over encrypted streams. In March 2025 Amazon Dev Relations said the beta was full with more slots expected mid-2025.
- Amazon Music Web API:
  - x-api-key is the Security Profile ID (amzn1.application.…), not the client ID.
  - Scope format is music::category[:read].
  - GET /player/recentlyPlayed exists.
  - The Device API is deprecated with no new onboarding or certification.
  - Access is via your Amazon Business Development representative.
- Program Requirements: certification is required and the use of listening data is restricted.
- Terms of Use §3.3: 'No Reverse Engineering or Circumvention'.
- LWA: 3600 s access tokens. Refresh tokens are valid until the user removes the app, and a refresh returns a new refresh token.
- Chrome intents: BROWSABLE only, a user gesture is required, and S.browser_fallback_url is the fallback.
- Embed player: 30-second previews reported.
- Alexa+ added to the Amazon Music app on 4 Nov 2025.

Limits on this check:
- These hosts were blocked by the egress proxy: developer.amazon.com, community.amazondeveloper.com, voicemonkey.io (including api-v3), developer.chrome.com, companion.home-assistant.io, groups.google.com, music.amazon.*, web.archive.org and api.music.amazon.dev. For those I relied on search-index snippets or GitHub mirrors, so treat them as medium confidence.
- I could not test CORS on api-v3.voicemonkey.io or api.music.amazon.dev.
- I could not confirm whether an explicit package= https intent bypasses Android 12's unverified-link rule. It is moot here because com.amazon.mp3 is verified in the asset links.

Scratch files are in /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad (mp_2026_6.py, mp_dev.py, ad.md, nc.md, sensors.md, http.md). No repo files were modified.

### 3. android

**research:**

**option:**

Controls that work with any music app, run on the tablet itself (Android media keys and "now playing" through a small local helper app). This works the same for Spotify and Amazon Music.

**feasible:** yes

**what the panel could show and do:**

WHAT WORKS: Play/Pause, Next and Previous buttons that control whichever music app is playing on the tablet, whether that's Spotify or Amazon Music. The panel can also show the current track's title and artist and whether it is playing. The existing "open app" button stays as it is and uses the Spotify/Amazon Music setting the panel already has (web/js/launcher.js, web/js/config.js 'music: spotify | amazonmusic'). The same setting can be sent to the helper (e.g. &app=amazonmusic) so it knows which app to open first if nothing is playing.
Media keys are app-agnostic by design. On Android 8+ the system sends a media button to "the last app with a MediaSession that played audio locally". If that session is inactive but has a media-button receiver, Android restarts it (https://developer.android.com/media/legacy/media-buttons). Spotify and Amazon Music both show standard Android media controls (https://developer.spotify.com/documentation/android/tutorials/android-media-notifications, https://techdetective.com/amazon-music-no-lock-screen-controls/).
WHAT IT CANNOT DO: browse or search playlists, choose a Spotify Connect or Echo speaker, or show album art reliably. Media-session art is usually a content:// URI a web page can't load, and the panel's CSP img-src is only 'self' data:. It also can't control a Spotify/Amazon account from off the tablet; that needs the cloud APIs covered in the other options.

THE THREE BRIDGES INVESTIGATED:
(1) intent: link that sends a media key: NO.
- WebView Kiosk turns intent: links into Intent.parseUri(...) and resolveActivity/startActivity with FLAG_ACTIVITY_NEW_TASK (handleExternalSchemeUrl in openIntentUtils.kt). It only ever starts an activity; it never sends a broadcast or a key event.
- Android's intent-URI parser only accepts String/boolean/byte/char/double/float/int/long/short extras (S. B. b. c. d. f. i. l. s.). So the KeyEvent that ACTION_MEDIA_BUTTON needs cannot be written in the link at all.
- Chrome additionally only launches BROWSABLE activities, and only after a user tap.
- The only hack left is launching an exported activity of an automation app (for example a Tasker/MacroDroid shortcut or share target) that then runs a media action. That brings an activity to the front over the panel. In lock-task mode the target app must be on the Lock Task Permitted list. It is one-way (no now-playing) and I have not tested it. Not recommended.
(2) Local helper (MacroDroid or Tasker) reached by fetch() to http://127.0.0.1: YES. This is the recommended route; details below.
(3) Spotify/Amazon Music notification or home-screen widgets: NOT USABLE.
- App widgets are "at-a-glance" views that live on the home screen and are embedded only by a launcher or an app that builds its own AppWidgetHost (https://developer.android.com/develop/ui/views/appwidgets/overview). A web page in a WebView cannot host or embed them.
- The media notification sits in the notification shade, which lock-task (kiosk) mode hides. Neither can be driven from the page.
FUTURE OPTION (does not exist today): WebView Kiosk already offers opt-in JavaScript bridges for the page, such as window.WebviewKioskBatteryInterface and a brightness bridge (docs/content/docs/settings/js-scripts.mdx and createCustomWebview.kt in its repo). A similar "media" bridge could call AudioManager.dispatchMediaKeyEvent(), which has no permission annotation in AOSP. That would need no helper app and no port. The developer is responsive: PR #289 was opened 20 Sep 2026 and merged 22 Sep 2026. Worth a feature request, but don't plan around it.

**requirements for owner:**

RECOMMENDED: MacroDroid (free) in WebView Kiosk
1. Install MacroDroid from the Play Store. The free tier is ad-supported with up to 5 macros. Pro is a one-time purchase for unlimited macros and no ads, with no subscription; older write-ups say US$2.99, so check the current Play price. This setup needs only 2 macros, so the free tier is enough.
2. Macro A, trigger "HTTP Server Request" (a local server, default port 8080, configured in MacroDroid's HTTP Server settings):
   - Check a secret token query parameter first.
   - Use "Control Media" (mode "Simulate Media Button") for play/pause, next or previous, chosen by a cmd= parameter.
   - Finish with "HTTP Server Response": JSON body (state, title, artist) plus these Header Params: Access-Control-Allow-Origin: https://anginsemilir.github.io and Cache-Control: no-store.
3. Macro B, trigger "Media Track Changed": copy {track_name} and {track_artist} into global variables so Macro A can return them.
4. Give MacroDroid Notification Access. Apps can only read other apps' media sessions as an enabled notification listener (MediaSessionManager.getActiveSessions).
5. Set MacroDroid's battery use to Unrestricted, and on the Lenovo lock it in the recent-apps view (dontkillmyapp.com/lenovo).
6. Panel repo (one-line change): in web/index.html (line 11), add http://127.0.0.1:8080 to the CSP connect-src. docs/octopus.md already describes this edit. Store the helper token in localStorage like the other secrets.
7. WebView Kiosk: nothing new. Keep "Allow Other URL Schemes" on (the panel already needs it). Mixed Content Mode can stay at its default "Never Allow", because 127.0.0.1 is not treated as mixed content.
8. If the panel runs as an installed Chrome app instead: accept the one-time Local Network Access prompt, labelled "Apps on device" since Chrome 145. If it was blocked, re-allow it in the site settings.

ALTERNATIVE: Tasker (Play Store US$3.49, 7-day trial from joaoapps). Tasker has had an HTTP server since version 6.2: an "HTTP Request" event on a chosen port plus the "HTTP Response" action. Its "Media Control" action has "Use Notification If Available". More setup, and reading the current track is weaker (see technical details).

NOT NEEDED: no Spotify or Amazon developer account, no Premium, no OAuth, no server.

**technical details:**

HOW IT FITS TOGETHER
Panel (https://anginsemilir.github.io) → fetch('http://127.0.0.1:8080/media?cmd=next&t=TOKEN') → MacroDroid's local HTTP server → Control Media (simulated media key) → Android sends it to the active media session (Spotify or Amazon Music) → HTTP Server Response returns JSON. For status, poll ?cmd=status every 5–10 s, only while document.visibilityState === 'visible', with an AbortController timeout of about 2 s. If the helper doesn't answer, show "helper offline".

BROWSER RULES
- Use GET with query parameters and no custom request headers. That makes it a CORS "simple request": no OPTIONS preflight, which the helper might not answer. Avoid POST with a JSON content type.
- To read the JSON reply, the response must carry Access-Control-Allow-Origin set to the panel's origin or *. MacroDroid documents custom response "Header Params" (magic text allowed) on both the HTTP Server Request trigger and the HTTP Server Response action.
- Commands alone work even without that header: fetch(url, {mode: 'no-cors'}) fires them and just returns an unreadable response.
- Use http://127.0.0.1, not localhost, to avoid name resolution and IPv6 surprises. Loopback addresses count as potentially trustworthy: Chrome stopped mixed-content-blocking http://127.0.0.1 in version 53, and MDN says 127.0.0.0/8 and ::1 are not mixed content. So an https page may call it, and WebView Kiosk's "Never Allow" mixed-content default does not block it.
- CSP: connect-src must list http://127.0.0.1:8080 exactly (scheme + host + port).

LOCAL NETWORK ACCESS (LNA), 2025–2026
- Chrome 142 (released 28 Oct 2025) blocks requests from a public site to a local or loopback address unless the user grants permission. The prompt only works on secure (https) pages, and once granted it also relaxes mixed-content rules for those requests.
- Chrome 145 split the permission into local-network and loopback-network (shown as "Apps on device"). A page can check the state with navigator.permissions.query({name: 'loopback-network'}).
- Chrome 147 extended the rules to WebSockets and WebTransport. The enterprise opt-out policy is due to be removed in Chrome 156.
- The older Private Network Access preflight header (Access-Control-Allow-Private-Network) has been superseded and is not required. It is harmless to send.
- Android WebView: the Chromium intent-to-ship says WebView "doesn't support letting apps grant any new permission types, so the Local Network Access permission is currently unconditionally granted in WebView". So WebView Kiosk shows no prompt today.
- Android's own local-network permission: opt-in on Android 16, enforced on Android 17 for apps targeting API 37 through ACCESS_LOCAL_NETWORK. WebView traffic "will inherit permission state from the host app". Android's docs don't say whether loopback counts. WebView Kiosk (versionName 0.26.21, targetSdk 37 in its repo) added a setting for this in PR #289, merged 22 Sep 2026. None of this applies to the Android 12 Tab M10.

ANDROID SIDE
- Media keys go to the last app whose media session played audio (Android 8+). AudioManager.dispatchMediaKeyEvent needs no permission.
- MacroDroid's Control Media offers three mechanisms (simulated media button, default player, simulated audio/headset button) because devices differ. If one doesn't work on the Lenovo, try another.
- For the track, Media Track Changed provides {track_name}, {track_artist}, {track_album}, {track_duration} and {track_art_uri}.
- MacroDroid's HTTP server is addressed as http://{ip}:{port}/{identifier}?var=value. That means it probably also answers from the Wi-Fi network, so require a token.

TASKER DETAILS
- The HTTP Request event opens a server on the chosen port (1821 is the common example). Reply either with the "Quick Response" field (text/plain only) or with the HTTP Response action keyed by %http_request_id.
- I could not confirm from Tasker's docs whether HTTP Response lets you add arbitrary headers such as Access-Control-Allow-Origin; the docs site was not reachable from here. Commands via no-cors work either way.
- %MTRACK only works for players that broadcast track info. Spotify needs "Device Broadcast Status" turned on, and that broadcast is reported buggy. There is no documented equivalent for Amazon Music. Reading metadata for both apps would likely need the Notification event or the paid AutoNotification plugin.

CLOUD FALLBACK
MacroDroid's Webhook trigger (https://trigger.macrodroid.com/<device-id>/<identifier>?var=val, GET or POST) avoids LNA and the local server entirely: add it to connect-src and call it with no-cors. But it is delivered by Firebase push, needs the internet, can be delayed when the tablet dozes, and can't return the current track. Only useful as a fallback for the Chrome-app route.

**recent changes:**

- 28 Oct 2025, Chrome 142: the Local Network Access permission prompt ships. Public sites calling loopback or LAN addresses now need user permission; a granted permission also relaxes mixed-content rules for those requests. This replaces the older Private Network Access preflight model.
- Early 2026, Chrome 145: the permission is split into loopback-network ("Apps on device") and local-network. Chrome 147 extends it to WebSockets and WebTransport. The temporary enterprise opt-out is scheduled for removal in Chrome 156. Firefox 153+ now enforces a similar rule, which doesn't matter for this tablet.
- Android WebView: still reported as "currently unconditionally granted" for Local Network Access. Android 16 made a local-network permission opt-in; Android 17 enforces ACCESS_LOCAL_NETWORK for apps targeting API 37, and WebView inherits the host app's permission (Android docs updated 13 Jul 2026).
- WebView Kiosk (nktnet1): PR #289 (opened 20 Sep 2026, merged 22 Sep 2026) added a local network access setting for Android 17. The repo head on 23 Sep 2026 is versionName 0.26.21 with targetSdk 37. No effect on Android 12.
- MacroDroid: a recent version added custom header parameters to the HTTP Server Request trigger's response and to the HTTP Server Response action, which makes CORS possible. There is also a new setting to disable the built-in web page. I saw this in release notes via search (APKMirror 5.48.x) but could not open the notes to date them precisely.
- Tasker: its HTTP server (HTTP Request event and HTTP Response action) dates from Tasker 6.2 in 2023. I found no 2025–2026 pricing change: still a one-time purchase with a 7-day trial.

**risks:**

- Helper killed in the background: Lenovo's battery management can stop MacroDroid, and the buttons then fail silently. Mitigate with Unrestricted battery use, locking the app in recents, MacroDroid's foreground notification, and a visible "helper offline" state on the panel.
- The wrong app gets the key: media keys go to whichever app last played audio. If YouTube, a browser, or a WebView chime played more recently, Play goes there. After a reboot, Spotify or Amazon Music may need opening once before a cold Play works. Use the Spotify/Amazon setting to open the chosen app first when the status shows nothing playing.
- Anyone on the Wi-Fi could reach it: the helper's HTTP server very likely listens on the network (port 8080), not just on 127.0.0.1. Anyone there could pause music or read what's playing. Require a random token, return only title/artist, and set Access-Control-Allow-Origin to the panel origin rather than *.
- Chrome-app route: the prompt can be dismissed or blocked, and a block sticks until reset in site settings. Chrome's rules are still changing (the enterprise opt-out is being removed in Chrome 156).
- WebView route: the automatic grant is described as "currently". A future WebView update could start requiring the host app to grant it, which WebView Kiosk could then have to add.
- Polling: every status poll runs a MacroDroid macro. Poll every 5–10 s, only while the page is visible or music is playing, to keep battery and logs down.
- Free-tier limit and closed source: the 5-macro limit is shared with anything else the owner automates.
- Tasker's track variable (%MTRACK) and Spotify's broadcasts are unreliable.
- Album art is not reliably available.
- intent: hacks bring an activity over the panel and need a lock-task allow-list entry. Avoid them.
- Port 8080 is common and could clash with another app. Pick a less common port (e.g. 8765) and update the CSP to match.

**sources:**

- https://github.com/GoogleChrome/modern-web-guidance-src/issues/1127
- https://developer.chrome.com/blog/local-network-access
- https://groups.google.com/a/chromium.org/g/blink-dev/c/cwu_RUmBpzY/m/hk8YuZDWHgAJ
- https://groups.google.com/a/chromium.org/g/blink-dev/c/lRnFRIfzDMU
- https://github.com/dynamsoft-docs/web-twain-docs/blob/master/_articles/faq/chromium-142-local-network-access-issue.md
- https://www.dynamsoft.com/web-twain/docs/faq/chromium-142-local-network-access-issue.html
- https://developer.chrome.com/release-notes/145
- https://chromestatus.com/feature/5068298146414592
- https://piunikaweb.com/2026/02/09/chrome-local-network-permission-explained/
- https://support.beyondidentity.com/hc/en-us/articles/34457691192215-Managing-the-Chrome-v142Local-Network-Access-Prompt
- https://developer.android.com/privacy-and-security/local-network-permission
- https://github.com/nktnet1/webview-kiosk/pull/289
- https://github.com/nktnet1/webview-kiosk
- https://github.com/nktnet1/webview-kiosk/blob/main/app/src/main/java/uk/nktnet/webviewkiosk/utils/openIntentUtils.kt
- https://github.com/nktnet1/webview-kiosk/blob/main/docs/content/docs/settings/web-engine.mdx
- https://github.com/nktnet1/webview-kiosk/blob/main/docs/content/docs/settings/js-scripts.mdx
- https://github.com/aosp-mirror/platform_frameworks_base/blob/main/core/java/android/content/Intent.java
- https://github.com/aosp-mirror/platform_frameworks_base/blob/main/media/java/android/media/AudioManager.java
- https://github.com/aosp-mirror/platform_frameworks_base/blob/main/media/java/android/media/session/MediaSessionManager.java
- https://developer.chrome.com/docs/android/intents
- https://developer.android.com/media/legacy/media-buttons
- https://developer.android.com/develop/ui/views/appwidgets/overview
- https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content
- https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts
- https://chromium.googlesource.com/chromium/src.git/+/130ee686fa00b617bfc001ceb3bb49782da2cb4e
- https://www.macrodroidforum.com/wiki/index.php/Trigger:_HTTP_Server_Request
- https://wiki.macrodroid.com/wiki/index.php/Action:_HTTP_Server_Response
- https://macrodroidforum.com/wiki/index.php/Action:_Control_Media
- https://wiki.macrodroid.com/wiki/index.php?title=Magic_text
- https://macrodroidforum.com/wiki/index.php/Trigger:_Webhook_(URL)
- https://medium.com/@macrodroid/introducing-the-webhook-trigger-a760e2ee140d
- https://www.tapatalk.com/groups/macrodroid/webhook-trigger-delay-t5866.html
- https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid
- https://www.apkmirror.com/apk/arlosoft/macrodroid-device-automation-2/macrodroid-device-automation-2-5-48-12-release/
- https://tasker.joaoapps.com/userguide/en/help/eh_http_request.html
- https://tasker.joaoapps.com/userguide/en/help/ah_http_response.html
- https://tasker.joaoapps.com/userguide/en/help/ah_android_media_control.html
- https://tasker.joaoapps.com/userguide/en/variables.html
- https://joaoapps.com/tasker-6-2/
- https://play.google.com/store/apps/details?id=net.dinglisch.android.taskerm&hl=en_US
- https://joaoapps.com/joaoapps-trials/
- https://developer.spotify.com/documentation/android/tutorials/android-media-notifications
- https://community.spotify.com/t5/Android/Metedatachanged-broadcast-receiver/td-p/678524
- https://techdetective.com/amazon-music-no-lock-screen-controls/
- https://dontkillmyapp.com/lenovo

**check:**

**corrections:**

- Loopback and Android 17 are covered after all. The assessment says Android's docs 'don't say whether loopback counts'. The separate 'Local network definition' page (updated 2026-03-06) lists the covered ranges: 169.254/16, 100.64/10, 10/8, 172.16/12, 192.168/16, IPv6 link-local and directly-connected routes, multicast and broadcast. It defines a local network as one on a broadcast-capable interface such as Wi-Fi or Ethernet. 127.0.0.0/8 and ::1 are not listed, so a fetch to http://127.0.0.1 is very likely outside ACCESS_LOCAL_NETWORK. It is irrelevant on the Android 12 Tab M10 either way. Sources: https://developer.android.com/privacy-and-security/local-network-definition , https://developer.android.com/privacy-and-security/local-network-permission (updated 2026-07-13; confirms Android 16 opt-in via 'adb shell am compat enable RESTRICT_LOCAL_NETWORK', Android 17/SDK 37 enforcement of ACCESS_LOCAL_NETWORK, and WebView 'will inherit permission state from the host app').
- The WebView Local Network Access claim is stronger than 'currently granted'. On Chromium main (VERSION MAJOR=156), WebView switches off the checks entirely: aw_field_trials.cc disables network::features::kLocalNetworkAccessChecks with the comment 'Local Network Access restrictions should not be enforced in WebView'. AwContentBrowserClient::ShouldOverrideLocalNetworkAccessRequestPolicy also returns kForceAllow. So WebView Kiosk gets no prompt and no Local Network Access check at all. Sources: https://github.com/chromium/chromium/blob/main/android_webview/browser/aw_field_trials.cc , https://github.com/chromium/chromium/blob/main/android_webview/browser/aw_content_browser_client.cc , https://github.com/chromium/chromium/blob/main/android_webview/javatests/src/org/chromium/android_webview/test/AwContentsTest.java (testInsecureLocalNetworkAccess).
- Wi-Fi exposure can be closed off, not just protected with a token. MacroDroid's HTTP Server Request trigger appears to have an 'ipAddressWhiteList' option (wildcards allowed) and a 'variableWhiteList' option. Setting the allow-list to 127.0.0.1 would stop other devices on the Wi-Fi from triggering it. Keep the token as well. Evidence that the server does listen on the LAN: a 2026 setup guide drives MacroDroid at http://<phone-ip>:8080/... over LAN/Tailscale. The {http_caller_ip} magic text also allows an If check on the caller. This is secondary evidence only, because the MacroDroid wiki and forum are blocked from this sandbox. Sources: https://github.com/jodydugas-ctrl/mantle-os/blob/main/examples/Mantle_MacroDroid_Schema.yaml (HttpServerTrigger params) , https://github.com/amanpandey1202/uncensored/blob/main/MACRODROID-SETUP.md , https://www.macrodroidforum.com/wiki/index.php/Trigger:_HTTP_Server_Request (search snippet only).
- Setup gap on query parameters: MacroDroid does not create variables from them automatically. The owner must first create macro variables with the same names ('cmd', 't', and 'app' if used) and read them as {v=cmd}. Alternatively, the trigger's 'query params dictionary' option stores them all. Without this, the cmd=/t= logic in step 2 silently gets empty values. Sources (secondary): https://github.com/amanpandey1202/uncensored/blob/main/MACRODROID-SETUP.md ('MacroDroid HTTP Server does not create variables... first create a macro variable with that exact name') , https://github.com/jodydugas-ctrl/mantle-os/blob/main/examples/Mantle_MacroDroid_Schema.yaml (queryParamsDictionaryName).
- Response format detail: the HTTP Server Response action offers only 'Plain text' or 'HTML' as the content type, plus a response code and custom headerParams. The trigger itself can also send an immediate response with headerParams. So 'JSON body' actually means JSON text served as text/plain. fetch().json() still parses it, or the owner can add a Content-Type header param. Header params that carry Access-Control-Allow-Origin are confirmed working in practice: a 2026 WebView-based app polls MacroDroid at http://127.0.0.1:8080 for JSON and sends music controls, and it notes 'The HTTP Server Response must include the Access-Control-Allow-Origin header'. Sources: https://github.com/gpsnmeajp/g2_macrodroid/blob/main/README.md , https://github.com/jodydugas-ctrl/mantle-os/blob/main/examples/Mantle_MacroDroid_Schema.yaml (HttpServerResponseAction).
- The 'wrong app gets the key' risk can probably be reduced. MacroDroid's Control Media action appears to have a target-app option (m_packageName / m_applicationName) and a 'send media player commands' mode, alongside 'simulate media button'. The owner could use two Control Media actions in If branches on {v=app}, one for com.spotify.music and one for com.amazon.mp3 (the package names already in web/js/launcher.js). That steers commands to the app chosen in the panel's setting instead of whichever app played last. The assessment's names for the three modes ('default player', 'simulated audio/headset button') could not be checked against the wiki. Treat this as plausible and confirm it in the app. Source (secondary): https://github.com/jodydugas-ctrl/mantle-os/blob/main/examples/Mantle_MacroDroid_Schema.yaml (ControlMediaAction).
- Minor fixes on WebView Kiosk (all confirmed from its repo): v0.26.21 is a published GitHub release dated 23 Sep 2026, not just the repo head. PR #289 'feat: allow local network access setting for android 17 (API 37+)' was opened 20 Sep and merged 22 Sep 2026, and the manifest now declares ACCESS_LOCAL_NETWORK. The brightness bridge is window.WebviewKioskBrightnessInterface; there are also NFC and Blob interfaces, and none handle media. 'Allow Other URL Schemes' defaults to false. In lock-task mode openPackage() also needs Android P+ and the 'lock task feature HOME' device-owner setting, not just the Lock Task Permitted list. The app's network_security_config sets cleartextTrafficPermitted="true". That matters because WebView obeys Android's cleartext policy, so http://127.0.0.1 is not blocked by it (the assessment didn't mention this; it is a prerequisite that is already met). Sources: https://github.com/nktnet1/webview-kiosk/releases , https://github.com/nktnet1/webview-kiosk/pull/289 , https://github.com/nktnet1/webview-kiosk/blob/main/app/build.gradle.kts , https://github.com/nktnet1/webview-kiosk/blob/main/app/src/main/res/xml/network_security_config.xml , https://github.com/nktnet1/webview-kiosk/blob/main/app/src/main/java/uk/nktnet/webviewkiosk/utils/openIntentUtils.kt , https://github.com/nktnet1/webview-kiosk/blob/main/docs/content/docs/settings/web-browsing.mdx , https://github.com/nktnet1/webview-kiosk/blob/main/app/src/main/java/uk/nktnet/webviewkiosk/utils/createCustomWebview.kt.
- Chrome Local Network Access naming nuance. The old single permission name that remains as an alias is 'local-network-access', which maps to both 'local-network' and 'loopback-network'. The explainer issue's wording ('old local-network permission will remain as an alias') is off. navigator.permissions.query({name:'loopback-network'}) is valid; Chromium's own tests use it. The 'Apps on device' label is confirmed as the loopback-network permission title in Chromium's Android and desktop site-settings strings. kLocalNetworkAccessChecks, plus its WebSockets and WebTransport variants, are enabled by default with no Android exclusion, so the installed-Chrome-app route does get the prompt. Sources: https://github.com/chromium/chromium/blob/main/components/permissions/contexts/local_network_access_compat_permission_context.h , https://github.com/chromium/chromium/blob/main/components/browser_ui/strings/android/site_settings.grdp , https://github.com/chromium/chromium/blob/main/services/network/public/cpp/features.cc , https://github.com/GoogleChrome/modern-web-guidance-src/issues/1127 (opened 29 Jul 2026; confirms 142 / 145 split / 147 WebSockets+WebTransport / 156 opt-out removal).
- Media-button routing: the quoted rule is correct, but the page is the legacy doc (last updated 2024-01-05). It also says that if the last session has no media-button receiver, the event is discarded. Cold-start Play after a reboot therefore depends on the app, which supports the assessment's advice to open the chosen app first. Source: https://developer.android.com/media/legacy/media-buttons.
- The MDN mixed-content page has moved to https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content . It still states that loopback content such as http://127.0.0.1/ and http://localhost/ counts as secure and is not mixed content. Source: https://github.com/mdn/content/blob/main/files/en-us/web/security/defenses/mixed_content/index.md . The Chrome 53 claim is consistent with Chromium commit 130ee686 'Stop blocking http://127.0.0.1/ as mixed content' at Cr-Commit-Position #401363 (mid-2016, the M53 cycle): https://github.com/chromium/chromium/commit/130ee686fa00b617bfc001ceb3bb49782da2cb4e
- 'Firefox 153+ enforces a similar rule': the version number could not be verified. The current Firefox source (159.0a1) has network.lna.enabled=true and network.lna.blocking=true by default. It is irrelevant to this tablet. Source: https://github.com/mozilla-firefox/firefox/blob/main/modules/libpref/init/StaticPrefList.yaml

**confidence:** medium

**corrected feasible:** yes

**notes:**

No correction changes the verdict: the approach still works, and several corrections make it safer or more precise.

Confirmed from primary sources (AOSP, Chromium and WebView Kiosk source code):
- WebView Kiosk's intent: handling only ever starts an activity: parseUri, then resolveActivity, then openPackage with FLAG_ACTIVITY_NEW_TASK. It never sends a broadcast.
- Intent.parseUri accepts only the S/B/b/c/d/f/i/l/s extra types, so a KeyEvent can't go in the link.
- Chrome adds CATEGORY_BROWSABLE and clears the component on intent links (ExternalNavigationHandler.java).
- AudioManager.dispatchMediaKeyEvent has no permission annotation.
- getActiveSessions needs MEDIA_CONTENT_CONTROL or an enabled notification listener.
- WebView Kiosk's Mixed Content default is 'Never Allow'; the JS bridges exist; PR #289 is merged; v0.26.21 targets SDK 37.
- Chrome LNA: the 142/145/147/156 timeline, the 'Apps on device' label and the loopback-network permission name.
- WebView has no LNA enforcement.
- Loopback is not mixed content.
- The panel repo facts hold: CSP on web/index.html line 11 with img-src 'self' data:; music: spotify | amazonmusic in config.js; launcher.js package names com.spotify.music and com.amazon.mp3; sw.js ignores cross-origin requests, so a helper fetch is not intercepted.
- Amazon Music does expose a MediaSession/MediaBrowser, per third-party code that talks to com.amazon.mp3's 'BROWSER_ROOT' (https://github.com/BimmerGestalt/AAIdrive/blob/main/app/src/main/java/me/hufman/androidautoidrive/music/MusicBrowser.kt).

Not re-verified because this sandbox's egress proxy blocked the sites (macrodroidforum.com, wiki.macrodroid.com, play.google.com, apkmirror, tasker.joaoapps.com, joaoapps.com, developer.chrome.com, chromestatus, groups.google.com, developer.spotify.com, techdetective.com, dontkillmyapp.com, medium.com), and the web-search budget was used up:
- MacroDroid: the free-tier 5-macro limit, the Pro price and whether it is one-time, the 5.48.12 release date, and the 'disable built-in web page' setting.
- Tasker: the $3.49 price, 6.2 as the version that added the HTTP server, whether HTTP Response supports custom headers, and the %MTRACK caveats.
- The exact Chrome 142 stable date (28 Oct 2025 matches my understanding of the release schedule).
- The Lenovo battery-killing guidance.

The MacroDroid details that were checked (HTTP server URL form, default port 8080, header params, Media Track Changed with {track_name}/{track_artist}, and the webhook URL form trigger.macrodroid.com/<device-id>/<id>) are corroborated only by third-party GitHub repos. That is why confidence is medium, not high.

Most useful additions for the owner:
1. Set the MacroDroid trigger's IP allow-list to 127.0.0.1.
2. Pre-create macro variables named cmd, t and app.
3. Target Control Media at the chosen app's package.
4. Treat the reply as text/plain JSON.

No files in /home/user/Home-Dashboard- were modified. Scratch downloads are in /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad (e.g. openIntentUtils.kt, Intent.java, AudioManager.java, MSM.java, mantle_schema.yaml, g2_macrodroid.md, net_features.cc, aw_cbc.cc).
