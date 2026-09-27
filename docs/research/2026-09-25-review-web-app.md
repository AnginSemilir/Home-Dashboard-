# Five-lens review of the web app

> Code review findings (all fixed at the time). Kept as a record.

_Workflow: Five-lens adversarial review of the GitHub Pages wall panel, each lens verified by an independent skeptic_

**confirmed:**

### 1. Home Mini staleness is judged by API success, not reading age, so a dead Home Mini shows frozen 'Using now' and cost with no warning

**lens:** time-energy

**real:** True

**severity:** medium

**reasoning:**

Confirmed in the code. source() in web/js/main.js:65-89 sets `lastOk` on every successful fn() and staleCheck (line 88) compares only `Date.now() - lastOk`. The homemini source reruns every 60 s (5 min at night), so a successful call never goes amber, and a failed call sets `{error, stale:true}`, which setDot (ui.js:114) shows as red. `demandAt` is computed at octopus.js:72, but grep shows nothing reads it. renderTiles (ui.js:231-233) shows `st.tele.demandW` however old it is. refreshHomeMini (main.js:121) pushes that value with a fresh `Date.now()`, so the sparkline looks live. The main.js:62-63 comment and docs/troubleshooting.md:7 ('no new Home Mini reading for 15 minutes') both promise a check on data age that the code doesn't have. When the Home Mini stops uploading, the stored telemetry for today still comes back, so the query succeeds. If Kraken returns no rows after the last reading, the value freezes. If it returns null-demand rows, the tile shows '–'. Either way the dot stays green and 'Today so far' / kWh stay frozen. The docs also disagree with the code and with each other: octopus.md:26 says rate limiting gives an amber dot, the code gives red, and troubleshooting.md:20 says red. Medium fits because the status dot exists to catch exactly this, and Home Minis do drop off Wi-Fi.

**fix:**

Let source() judge age by the data itself. Add a `dataAt` option and in staleCheck use `const t = dataAt?.() ?? lastOk; if (st?.ok && staleAfter && Date.now() - t > staleAfter) st.stale = true;`. Call staleCheck() right after a successful run as well. For homemini pass `{ staleAfter: 45 * 60e3, dataAt: () => state.tele?.demandAt ?? lastOk }`: HALF_HOURLY readAt is the bucket start, so a healthy reading can be about 30 min old. In refreshHomeMini, push to the sparkline only when `Date.now() - tele.demandAt < 45 * 60e3`. Change docs/octopus.md:26 to say a red dot on rate limit.

**file:** web/js/main.js

**line:** 88

### 2. 'Today so far' silently drops usage from slots with no rate, and its dot only follows Home Mini, so a wrong £ figure looks healthy

**lens:** time-energy

**real:** True

**severity:** low

**reasoning:**

Confirmed. costToday (octopus.js:79-86) skips any slot no rate covers. updateCost (main.js:113) uses whatever `state.rates` holds. That can be a stale localStorage cache, because refreshRates only assigns after a successful await. The cost tile's dot and tap explanation use only `status.homemini` (ui.js:240, main.js:232). I ran it in node: 19 slots of 0.4 kWh against rates ending before today give exactly the 48p standing charge, both with yesterday's cached Agile rates and with the fixed-tariff case from finding 4. It needs the rates source to be failing across a local-day boundary, or the short boot race after a long power-off when homemini finishes before rates. In the first case the price card already shows red 'Prices unavailable', so the panel does give some signal. Only the £ tile is wrong while its dot is green. It's a real defect, but it depends on another failure or is short-lived, so it's low rather than medium.

**fix:**

Have costToday report unpriced usage, e.g. return `{ p, unpricedKWh }`, or in updateCost: `const priced = (s) => rates.some((r) => r.start <= s.start && s.start < r.end); state.costP = state.tele && state.tele.slots.every((s) => !s.kwh || priced(s)) ? costToday(...) : null;` so the tile shows '–'. Also set the cost tile's dot from the worse of `status.homemini` and `status.rates` (ui.js:240), and use the same pair for the tap mapping (main.js:232).

**file:** web/js/octopus.js

**line:** 83

### 3. Daily re-discovery failure blocks the keyless public rates fetch, even though the cached tariff is still valid

**lens:** time-energy

**real:** True

**severity:** medium

**reasoning:**

Confirmed. refreshRates (main.js:105-107) awaits ensureDiscovered() before octopus.rates(). ensureDiscovered (main.js:97-103) runs only when apiKey and account are set. Once `discovered.at` is over 24 h old it calls discover(), and any error propagates: an invalid or regenerated key ('Octopus rejected the API key'), KT-CT-1199 mapped to 429, parseAccount's 'No active electricity import tariff found', or a GraphQL schema or network error. `discovered.at` only moves on success, so every rates run after that throws before the public REST call. This happens even when `settings.octopus.tariff` is set manually, because octopus.tariff() (octopus.js:108-110) would be enough. When the cached rates run out (by the end of today or tomorrow), renderPrice shows 'Prices unavailable' and the chart shows 'No prices yet'. A short rate limit is covered by the cache. A lasting GraphQL problem (key revoked, schema change, parseAccount throwing) takes out the panel's main feature because of a secondary dependency. Medium is fair.

**fix:**

In refreshRates, carry on with the known tariff: `try { await ensureDiscovered(); } catch (e) { if (!octopus.tariff()) throw e; console.warn('[rates] re-discovery failed; using known tariff', e); }`. Rates run every 15 min, so the extra discovery attempt costs at most 4 calls an hour. Leave refreshHomeMini's behaviour as it is: it needs the key anyway.

**file:** web/js/main.js

**line:** 106

### 4. An open-ended current rate gets a 30-minute end, so non-Agile tariffs never have a 'current' price and their cost excludes all usage

**lens:** time-energy

**real:** True

**severity:** low

**reasoning:**

Confirmed by running it. With `[{24.5, valid_from 2026-07-01T00:00+01:00, valid_to null}, {26, 2026-04-01..2026-07-01}]`, ratesFromOctopus (agile.js:212-214) gives the current rate the range 2026-06-30T23:00Z to 23:30Z. priceSummary returns null and costToday prices nothing (48p standing only). Octopus's REST API returns the current variable or fixed rate with `valid_to: null`, which standingCharge (octopus.js:178) already handles. The agile.js:211 comment says open-ended rates are meant to work, and parseAccount accepts any active tariff, so a user who moves off Agile gets a broken price card and cost tile. Low severity because the panel is built for Agile (README, docs).

**fix:**

Give the last open-ended rate a finite end at or past the requested window, not start+30 min. Don't use Infinity, because state.rates is JSON-cached and Infinity turns into null. Pass the period end in: in Octopus.rates, `return ratesFromOctopus(results, { until: Date.parse(to) })`, and in agile.js:213 `sorted[i].end = sorted[i + 1] ? sorted[i + 1].start : Math.max(sorted[i].start + 30 * 60e3, until ?? 0);`.

**file:** web/js/agile.js

**line:** 21

### 5. Rate limits during Kraken token requests skip the 429 backoff, and the refresh token is thrown away with an immediate second request

**lens:** time-energy

**real:** True

**severity:** low

**reasoning:**

The mapping gap is real. #obtainToken (octopus.js:119-122) treats every GraphQL-level error the same and throws a plain Error, while only graphql() (line 141) maps KT-CT-1199 to HttpError(429). I simulated it: a rate-limited token request produces a plain Error('Too many requests.'), not a 429, so source() backs off at 30 s, 60 s and 2 min instead of starting at 4 min. The finding overstates the cost, though. After the first failure `this.refreshToken` is null, so only that first attempt sends 2 requests (refresh, then API key). Later retries send 1 request each, not 2 (checked: 2, 1, 1). It also only matters when the hourly token renewal is the first request to hit the limit. If telemetry calls hit it first, failures is already at 4 or more and keeps rising. Net effect: about 3-4 extra requests during a rare rate-limit window, and the raw Kraken message shown instead of 'Octopus rate limit reached'. Real but minor.

**fix:**

In #obtainToken, before the fallback: `const err = body?.errors?.[0]; if (/KT-CT-1199|too many requests/i.test(`${err?.extensions?.errorCode || ''} ${err?.message || ''}`)) throw new HttpError(429, 'Octopus rate limit reached');`. Keep the refresh-token-to-API-key fallback for other errors.

**file:** web/js/octopus.js

**line:** 121

### 6. visibilitychange reruns every source straight away, skipping any backoff in progress and overlapping runs already in flight

**lens:** time-energy

**real:** True

**severity:** low

**reasoning:**

Confirmed. main.js:261 calls s.run() for every source whenever the page becomes visible. run() (main.js:67-68) starts with clearTimeout(timer), which cancels any pending 429 or error backoff, and has no in-flight guard. So a homemini run already awaiting fetch overlaps with a new one. That means two telemetry requests, possibly two concurrent #obtainToken calls (not de-duplicated), and two sparkline points. The timer chain does recover afterwards: the older timer's run clears the newer `timer`. Coming back from a dock app (the Spotify or Claude intents) fires visibilitychange in Chrome, and each return during a rate-limit window sends one more GraphQL request (another 429 raises failures further). The effect is modest: one extra request per return. Refreshing on return is intended; skipping the backoff is the defect. Low.

**fix:**

In source(), track `let busy = false, nextAt = 0;`. In run: `if (busy) return; busy = true; try { ... } finally { busy = false; }`, and set `nextAt = Date.now() + delay` next to the setTimeout. Expose `runIfDue: () => { if (!busy && (failures === 0 || Date.now() >= nextAt)) run(); }` and call that from the visibilitychange handler instead of run().

**file:** web/js/main.js

**line:** 261

### 7. The camera's name and flags are fetched once and cached forever, so changing camera, or the Camera name setting, never shows

**lens:** time-energy

**real:** True

**severity:** low

**reasoning:**

Confirmed. refreshNest (main.js:130) fetches the camera only when `!state.camera`. state.camera is saved to wallpanel.cache.v1 (main.js:37) and restored at boot (main.js:28). 'Save & close' (settings-ui.js:205-209) saves settings and reloads without clearing the cache. Picking a new camera (settings-ui.js:135) changes `google.cameraId` and `panel.cameraName`, but renderCamera (ui.js:277) prefers `st.camera?.name`, so the old device's name stays on the card and the live bar forever. Editing 'Camera name' (settings-ui.js:177) never has any effect once a camera has been read. The stream itself uses settings.google.cameraId and connects to the right camera, so this only affects labels. Low.

**fix:**

Store the id alongside the parsed camera and refetch on mismatch. In main.js:130: `if (settings.google.cameraId && state.camera?.id !== settings.google.cameraId) { try { state.camera = { id: settings.google.cameraId, ...parseCamera(await nest.device(settings.google.cameraId)) }; } catch {} }`. In ui.js:277 prefer the user's label: `s.panel.cameraName || st.camera?.name || 'Camera'`.

**file:** web/js/main.js

**line:** 130

### 8. The 30-second 'no video' timeout never fires because the track event arrives before any media

**lens:** google-nest

**real:** True

**severity:** medium

**reasoning:**

This is confirmed. I ran a Playwright Chromium check against an answerer that was closed before sending anything. Both 'track' events fired during setRemoteDescription, with track.muted=true and connectionState 'new', and live was already true when `await pc.setRemoteDescription` returned. So the timer on web/js/nest.js:113 always sees this.live === true and does nothing. I also ran it in the app, with a fake RTCPeerConnection whose SRD dispatches 'track' synchronously as real browsers do. At +31 s the LIVE bar was still visible, there was no "didn't send any video" toast and no StopWebRtcStream. That contradicts docs/google.md:63 and troubleshooting.md:24. The repo tests miss this: the 30 s e2e test fakes SRD so it never fires 'track', and the other camera test fires it in a microtask. Nest's ICE peer is Google's media server, not the camera, so ICE can connect with no video ever arriving. The view then shows LIVE plus a countdown over black video for the full 5 minutes (battery), or until the user closes it (wired, extended every 4 minutes). I rated it medium, not high, because the user can still close the view with ✕ and battery streams still stop at 5 minutes.

**fix:**

In web/js/nest.js:95-101, keep adding the track, setting srcObject and calling play(), but only mark the stream live once media actually arrives: `if (ev.track.kind === 'video') { const go = () => { if (this.live || !this.pc) return; this.live = true; this.onState('live'); }; ev.track.muted ? ev.track.addEventListener('unmute', go, { once: true }) : go(); }`. Also change the e2e fakes in web/test/e2e/panel.test.js so SRD fires 'track' synchronously with a muted track that unmutes later, plus one case where it never unmutes, to cover the 30 s timeout.

**file:** web/js/nest.js

**line:** 95

### 9. Callbacks from an old stream tear down a newer camera session, which keeps running with no way to close it

**lens:** google-nest

**real:** True

**severity:** medium

**reasoning:**

I reproduced this with the repo's mocks in Playwright. I delayed the first GenerateWebRtcStream by 2 s, then tapped camera, tapped ✕, and tapped camera again. Stream 2's bar was visible until stream 1's answer arrived. Then the bar was hidden and the toast read "Camera: The RTCPeerConnection's signalingState is 'closed'." Only one StopWebRtcStream was sent, and stream 2's peer connection was never closed. Here is why. closeCamera sets live=null and calls stop(), which closes the pc while start() is still waiting on Generate. When Generate returns, start() calls SRD on the closed pc (nest.js:111), which throws InvalidStateError. The catch in main.js:168-172 then sets a camera error, shows a toast and calls stream.stop(). That fires stream 1's onState('ended'), and the callback in main.js:154-158 acts on the module-level `live`, which now belongs to stream 2, and sets it to null. Stream 2 is left orphaned: ✕, visibilitychange and night mode can no longer reach it. Even without a reopen, tapping ✕ while the view is still connecting gives a false error toast and a red camera dot.

**fix:**

In main.js openCamera, write `const mine = { state: 'connecting', expanded: true, endsAt: 0 }; live = mine;`. In onState, use `if (live !== mine) return;`. In the try and catch blocks, only update live, status and the toast when `live === mine`, but still call stream.stop(). In LiveStream, add a `stopped` flag set by stop(). In start(), after each await (createOffer, setLocalDescription, the Generate command), check it: if it is set, send StopWebRtcStream for any res.mediaSessionId that just came back and return quietly instead of calling SRD on the closed pc.

**file:** web/js/main.js

**line:** 154

### 10. When ICE fails, the UI shows the stream as ended but LiveStream never stops (peer connection stays open, timers and extends keep running, no StopWebRtcStream)

**lens:** google-nest

**real:** True

**severity:** medium

**reasoning:**

This is confirmed in Playwright. My fake connection reported connectionState 'failed' and dispatched connectionstatechange. The UI went idle, but pc1 was not closed and no Stop was sent. Battery camera: I reopened (stream 2 showed LIVE at 4:57). At the 5-minute mark of stream 1, its timer called stop(), which sent Stop for s1 and fired onState('ended'). That set main.js `live = null`, which hid stream 2's view while stream 2 kept running with no Stop sent. Wired camera: after the failure, ExtendWebRtcStream kept going out for the dead session s1 alongside s2. nest.js:103 only calls onState('ended'), and main.js:158 drops the only reference to the stream. The same clobbering path as the previous finding makes it worse.

**fix:**

In web/js/nest.js:102-104, use `pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'failed' && this.pc === pc) this.stop(); });`. stop() already calls onState('ended') and sends StopWebRtcStream. Make stop() idempotent with `if (this.stopped) return; this.stopped = true;` at the top. Combine this with the `live === mine` guard in main.js from the previous finding.

**file:** web/js/nest.js

**line:** 102

### 11. The camera video element is not muted: the camera's audio plays, and WebView autoplay can be refused

**lens:** google-nest

**real:** True

**severity:** medium

**reasoning:**

This is confirmed. h() uses setAttribute (util.js:39), and in Chromium that leaves video.muted=false and defaultMuted=true. I tested a WebRTC loopback with audio and video, starting the stream after a real tap. With the Chrome default policy (document-user-activation-required), play() succeeded with muted=false, so the far end's audio plays, even 7 s after the tap. With --autoplay-policy=user-gesture-required (the Android WebView default, mediaPlaybackRequiresUserGesture=true), play() succeeded 0.5 s after the tap but was rejected with NotAllowedError 7 s after it. The same case with `v.muted = true` played fine. The offer asks for audio and the mocks list OPUS, so a Nest answer includes an audio track. The code's intent, `muted: true`, is not applied: in Chrome the camera's microphone audio plays from the panel, and in a gesture-requiring WebView a slow Generate (sleeping battery cam) leaves black video. The error is swallowed at nest.js:98.

**fix:**

In web/js/ui.js:40, set the property right after creating the element: `r.video.muted = true; r.video.defaultMuted = true;`. Alternatively, make h() assign known boolean properties (muted, autoplay, playsInline) directly instead of via setAttribute.

**file:** web/js/ui.js

**line:** 40

### 12. The cached camera name is never refreshed and overrides both the newly chosen camera and the 'Camera name' setting

**lens:** google-nest

**real:** True

**severity:** low

**reasoning:**

state.camera is loaded from the cache (main.js:28), saved back on every persist() (main.js:37), and fetched only when it is empty (main.js:130). Nothing clears it, and the cache is not keyed by camera id. renderCamera uses `st.camera?.name || s.panel.cameraName` (ui.js:277). After you pick another camera (settings-ui.js:135 sets panel.cameraName to the new device name) or type a new 'Camera name' and then Save & close, the reloaded panel still shows the old device's name on the card and in the LIVE bar. This only affects the label, so severity is low.

**fix:**

In main.js:130, store the id: `state.camera = { ...parseCamera(d), id: settings.google.cameraId }`, and refetch when `state.camera?.id !== settings.google.cameraId`. In ui.js:277, let the user's setting win: `s.panel.cameraName || st.camera?.name || 'Camera'`.

**file:** web/js/main.js

**line:** 130

### 13. Calendar: an event on two selected calendars is shown twice because the dedupe key includes the calendar ID

**lens:** google-nest

**real:** True

**severity:** low

**reasoning:**

This is confirmed with a node snippet. The same Google event (same id and iCalUID) normalized from two calendars gets the keys 'family@…/evt123' and 'me@…/evt123'. groupDays then returns ['Parents evening', 'Parents evening']. Within one calendar the API never returns duplicate ids (singleEvents=true gives each instance its own id), so the dedupe at calendar.js:45 can never remove anything. Selecting both a shared family calendar and your primary calendar, with events where one is a guest of the other, is a common setup. The effect is cosmetic, but it uses up the limited rows (maxRows 9).

**fix:**

In normalizeEvent (calendar.js:23), keep the calendar-qualified id for rendering. Add a dedupe key: `key: (e.iCalUID || e.id || '') + '|' + (e.originalStartTime?.dateTime || e.originalStartTime?.date || start)`. In groupDays:45, dedupe on x.key instead of x.id, so the first selected calendar's copy wins.

**file:** web/js/calendar.js

**line:** 23

### 14. Calendar: a calendar that keeps failing is hidden while the others have events, but turns the whole card red when they don't

**lens:** google-nest

**real:** True

**severity:** low

**reasoning:**

This is confirmed with a node snippet. With calendars [me, school(404)], a day when 'me' has events returns 1 event with no error, so the source is ok and the status green. A day when 'me' is empty throws '404 Not Found'. main.js then keeps the previous events, because refreshCalendar throws before assigning, and shows the red dot. The condition `!all.length && errors.length` at calendar.js:68 treats a successful but empty calendar as if everything had failed. The intent was clearly 'all calendars failed'. Meanwhile a persistently failing calendar is silently dropped on busy days.

**fix:**

In calendar.js:68, throw only when every calendar failed: `if (errors.length && errors.length === calendars.length) throw errors[0];`. Report partial failures separately, for example by returning `{ events: all, errors }`. main.js should then store the events and set `state.status.calendar = { error: <failing calendar name + reason>, stale: true }` instead of ok.

**file:** web/js/calendar.js

**line:** 68

### 15. The kiosk sign-in guard misses Fully Kiosk, so sign-in lands on Google's disallowed_useragent page

**lens:** google-nest

**real:** True

**severity:** low

**reasoning:**

detectEnv (launcher.js:29) returns 'fully' before it checks the '; wv)' UA marker, and settings-ui.js:124 blocks only 'webview'. Fully Kiosk renders with the Android System WebView, and its default UA carries '; wv)', which is what triggers Google's embedded-WebView OAuth block. Fully is a supported mode in this code (ENV_LABEL, the launcher select, actionFor 'fully'), and its JS interface must be on for the buttons to work. So a Fully user who presses Sign in is sent to Google's 403 disallowed_useragent page instead of getting the in-app 'use Chrome' message. The docs already describe this error and the workaround, and the Android back button usually recovers, so severity is low.

**fix:** In settings-ui.js:124, use `if (/; wv\)/.test(navigator.userAgent) || ['webview', 'fully'].includes(detectEnv())) throw new Error(...)`.

**file:** web/js/settings-ui.js

**line:** 124

### 16. After signing out of Google or deselecting all calendars, the cached calendar events and thermostat reading stay on screen

**lens:** google-nest

**real:** True

**severity:** low

**reasoning:**

This is confirmed by reading the code. Sign out only blanks draft.google.refreshToken (settings-ui.js:155). After Save & close and the reload, google.signedIn is false (google.js:72), so the thermostat and calendar sources are disabled. run() then only sets status to null and returns (main.js:69). state.events and state.thermo still come from the cache (main.js:27,29), and persist() is never called to clear them. renderCalendar (ui.js:165) shows the cached events instead of the 'Sign in to Google' prompt. renderTiles (ui.js:252) shows the last temperature. With a null status, setDot shows no stale or error marker. Once the cached events age out, the card shows 'Nothing planned' instead of the sign-in prompt.

**fix:**

Give source() a `clear` callback and, when `!enabled()`, call it, then persist() and render(). For thermostat use `() => { state.thermo = null; state.camera = null; }`, and for calendar use `() => { state.events = null; }`. Alternatively, clear those cached fields in the Sign out and Save & close handlers when the refresh token or calendars have been removed.

**file:** web/js/main.js

**line:** 69

### 17. Every secret sits in localStorage on the shared anginsemilir.github.io origin, so the owner's other Pages sites can read it

**lens:** security

**real:** True

**severity:** low

**reasoning:**

The mechanism is real. localStorage (and Cache Storage) belong to the origin https://anginsemilir.github.io and the path plays no part. config.js:4/65 stores the Octopus key, the Google client secret and refresh token, and the Kia key there. Any page ever served from that origin shares them: another project site, a future user site, or a CDN script one of them loads. Such a page can read or rewrite the settings (for example, setting the proxy) and can poison the panel's service-worker cache. No README or docs text mentions this. README:29 ('only ever sent to the service they belong to') describes what the panel code sends and ignores what same-origin code can read. The finding overstates severity, though. Exploitation needs two independent things: (a) another page on that origin is compromised or has an XSS bug, and (b) the owner opens it in the same browser profile that holds the settings. WebView Kiosk keeps its own storage, separate from Chrome, and loads only the panel URL, so in practice only the tablet's Chrome copy is exposed. I could not confirm that cumulative-timer really has Pages enabled (the GitHub API for that repo is not reachable from this session), but the risk covers any current or future page on the origin. Real latent exposure, low likelihood: low.

**fix:**

Serve the panel from an origin used for nothing else, e.g. a custom domain via a CNAME on this repo's Pages. Then update the redirect URI in docs/google.md:20 and docs/troubleshooting.md:23, and the Worker's PANEL origin in docs/octopus.md:38. If that isn't done, at least correct README:29 and add a note to docs/tablet.md: never open any other anginsemilir.github.io page in the tablet's Chrome/WebView, and a compromise of any Pages repo on this account exposes the panel's keys.

**file:** web/js/config.js

**line:** 4

### 18. KIA_VIN is passed as a repository variable, so the VIN is printed unmasked in the public Actions log every hour

**lens:** security

**real:** True

**severity:** low

**reasoning:**

kia.yml:66 sets `KIA_VIN: ${{ vars.KIA_VIN }}` in the step env, and docs/kia.md:19 and kia.yml:3 tell users to create it as a Variable. The Actions runner prints each run step's env block in the collapsed step header, with secrets shown as *** and configuration variables in clear text (GitHub's docs warn that variables render unmasked in build output). The repo is public (the API reports visibility: public), so anyone who can see the Actions tab can read the VIN in every hourly run. That breaks the explicit promise at kia.yml:8, tools/kia_fetch.py:12 and docs/kia.md:6. Severity is lower than claimed: KIA_VIN is optional (only for accounts with more than one car), and a VIN is already readable through the windscreen. What leaks is that the GitHub identity is linked to a specific vehicle (make, model, year, plant), and the documented guarantee is broken.

**fix:**

kia.yml:66: change to `KIA_VIN: ${{ secrets.KIA_VIN }}`. In kia.yml:3 and docs/kia.md:17-19, list KIA_VIN as an optional repository secret, not a variable. Tell existing users to delete the variable, and note that old run logs keep the value until they expire or are deleted.

**file:** .github/workflows/kia.yml

**line:** 66

### 19. The public encrypted Kia file leaks whether the car is plugged in and charging, through the ciphertext length

**lens:** security

**real:** True

**severity:** low

**reasoning:**

Confirmed. kia_fetch.py:33 encrypts json.dumps(reading) with no padding, and GCM ciphertext length = plaintext length + 16. With the same other fields, I get 134 bytes (not plugged, not charging), 133 (plugged, not charging) and 132 (plugged and charging). Battery and range digit counts and updated=null (125) also change the length. base64 in the public kia.json gives the exact byte count, and the file is republished hourly. The signal is somewhat confounded (range going from 100 to 99 also subtracts a byte), but over hourly samples an observer can infer charging sessions reasonably well. That breaks the 'useless without the key' claim in docs/kia.md:6 and kia.yml:7. The practical impact is small: a plugged-in state does not reveal a location, and the observer only learns charging patterns. Low.

**fix:**

In tools/kia_fetch.py encrypt_reading, pad to a fixed size before encrypting, e.g. `pt = json.dumps(reading).encode(); if len(pt) > 256: raise ValueError('reading too long'); pt = pt.ljust(256, b' ')`, then encrypt pt. JSON.parse in web/js/kia.js:17 ignores trailing whitespace, so the panel needs no change. Optionally do the same in kia.js encryptReading so the tests match.

**file:** tools/kia_fetch.py

**line:** 33

### 20. 'Sign out of Google' neither revokes the token nor clears cached calendar and thermostat data, which stay on screen

**lens:** security

**real:** True

**severity:** low

**reasoning:**

Confirmed by reading the flow. settings-ui.js:155 only blanks draft.google.refreshToken. After Save & close and the reload, main.js:27-29 restores state.thermo and state.events from 'wallpanel.cache.v1'. renderAll() at main.js:240, and every 30 s at :257, draws them. The calendar and thermostat sources hit `if (!enabled()) { state.status[name] = null; return; }` (main.js:69), which never clears their state. Other sources' persist() calls keep re-saving the stale events and thermo. renderCalendar (ui.js:165) only shows the 'Sign in' message when events is null, so the cached titles and locations stay until groupDays drops them (up to about 2 days). renderTiles (ui.js:251-255) shows the last indoor temperature forever, with a blank status dot (setDot with null). No revoke call is made, so the same token stays valid, including the copy in Chrome's localStorage that docs/google.md has the user create. Someone handing the tablet on who taps Sign out leaves a working token in Chrome at the same URL. Deselecting all calendars leaves stale events on screen the same way.

**fix:**

In the Sign out handler (settings-ui.js:155): if draft.google.refreshToken is set, first `fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: draft.google.refreshToken }) }).catch(() => {})`. The origin is already in connect-src, and a form POST needs no preflight. Then clear refreshToken, scopes, calendars, cameraId and thermostatId. In main.js source() add a `clear` option and change line 69 to `if (!enabled()) { state.status[name] = null; clear?.(); persist(); render(); return; }`. Pass clear: () => { state.events = null; } for calendar and () => { state.thermo = null; state.camera = null; } for thermostat.

**file:** web/js/settings-ui.js

**line:** 155

### 21. CSP connect-src allows https://*.workers.dev, which anyone can register, so the claim that keys can't be sent elsewhere is false

**lens:** security

**real:** True

**severity:** low

**reasoning:**

Confirmed. index.html:10 allows https://*.workers.dev, and any Cloudflare account can create a subdomain there. Octopus.base (octopus.js:99-102) accepts any https host, and #obtainToken (octopus.js:112-118) sends the API key there, as do the Kraken JWTs (line 134). So a proxy value pointing at an attacker's worker exfiltrates the Octopus key and the CSP does not block it, contrary to the comment at index.html:9 ('even a bug can't send your keys elsewhere'). This is a defence-in-depth gap. It only matters with another problem: someone at the panel setting the proxy (a documented accepted exposure), an imported settings blob, or a future code bug. Google tokens never go through the proxy. The secondary point also holds: a proxy on a non-workers.dev host is accepted by octopus.js but blocked by the CSP and shows up as a generic network error, though the docs only describe workers.dev.

**fix:**

Remove `https://*.workers.dev` from connect-src in web/index.html:10 and reword the comment on line 9. In docs/octopus.md, tell anyone who deploys the proxy to add their exact host (e.g. https://octopus-proxy.<name>.workers.dev) to connect-src. Make Octopus.base reject anything the CSP would block, e.g. with a clear 'Proxy host not allowed by the page's security policy' error instead of silently using it.

**file:** web/index.html

**line:** 10

### 22. A stale camera stream's late 'ended'/'timeout' closes the newer stream's view, and the newer stream keeps running with nothing on screen

**lens:** runtime

**real:** True

**severity:** medium

**reasoning:**

Confirmed in the code and with a scratch Playwright run using the repo's mocks. The onState closure (main.js:154-159) and the catch block (main.js:168-173) both act on the module-level `live` without checking which stream it belongs to. nest.js:102-104 reports 'ended' on connectionState 'failed' but never calls stop(), so the failed stream's timers stay armed (nest.js:113, 117, 120). One correction to the reviewer's case (a): in real Chrome the 'track' event fires during setRemoteDescription, so A.live is already true and A's 30 s connect-timeout branch will not fire. A's 5-minute battery stop timer (or, for a wired camera, a failed Extend that calls stop()) triggers the same bug. My repro used track-on-SRD, ICE failure injected on A, and B opened 60 s later. At A's 5-minute mark the LIVE bar disappeared while B's RTCPeerConnection was still 'have-local-offer' (open). Only one StopWebRtcStream had been sent, and B was reclaimed only by its own timer later. Case (b) also reproduced exactly: press ✕ while GenerateWebRtcStream is pending, reopen, then A's late reply arrives. setRemoteDescription on the closed pc throws. The catch calls A.stop(), whose onState('ended') ends B's `live`, and then sets live=null. The UI goes idle, the dot turns red, only session-1 gets StopWebRtcStream, and B's pc stays open. Once live is null, neither ✕ nor visibilitychange can reach B. A battery camera streams invisibly for up to 5 min. A wired camera streams until the 03:30 reload, which is no longer blocked because live is null. It needs an ICE failure or a quick close/reopen race, and the impact is resource and battery waste plus a UI glitch, not data loss. So I rate it medium, not high.

**fix:**

In openCamera, bind the callbacks to their own session object: `const mine = { state: 'connecting', expanded: true, endsAt: 0 }; live = mine;`. In onState, start with `if (live !== mine) return;`. After start() resolves, write only `if (live === mine) live.endsAt = stream.endsAt;`. In the catch, always `await stream.stop()`, but only set status, toast and `live = null` when `live === mine`. In LiveStream, have the connectionstatechange handler call `this.stop()` on 'failed' instead of only onState('ended'). Add a `stopped` flag set in stop() and return early if it is already set, so stop() is idempotent. In start(), after the GenerateWebRtcStream await, if `this.stopped`, set `this.session = res.mediaSessionId`, send StopWebRtcStream for it and return without touching the closed pc.

**file:** web/js/main.js

**line:** 154

### 23. Service worker passes through 5xx/404 responses instead of falling back to cache, so a failed nightly reload leaves the panel dead

**lens:** runtime

**real:** True

**severity:** low

**reasoning:**

sw.js:13-24 falls back to caches.match only when fetch() throws. A resolved non-OK response (503/404/429) is returned to the page unchanged. For the navigation, the kiosk shows the error page. For js/main.js or any import, the module graph fails and #app stays empty. index.html has no inline recovery, and every timer, including scheduleDailyReload, lives in main.js, so nothing reloads the page again. The sw.js comment says the intent is to keep the panel alive during the nightly reload, and the code only covers network errors. The defect is real, but it needs a GitHub Pages error response at the exact moment of the 03:30 reload. Pages deploys are atomic and outages are rare, so the likelihood is low even though the impact (a dead panel until someone reloads it by hand) is high. Rated low.

**fix:**

In the fetch handler, after `const res = await fetch(e.request);`, add `if (!res.ok) { const hit = await caches.match(e.request, { ignoreSearch: true }); if (hit) return hit; }` before returning res. Keep the existing put-on-ok and catch fallback.

**file:** web/sw.js

**line:** 19

### 24. Camera video is not actually muted, so live view plays the camera's audio through the tablet

**lens:** runtime

**real:** True

**severity:** medium

**reasoning:**

h() (util.js:39) calls setAttribute('muted',''). Per the HTML spec the content attribute only reflects defaultMuted, and it sets the muted IDL state only for parser-created elements. I verified in Playwright's Chromium on the real panel: `#cam video` gives {attr: true, prop: false, defaultMuted: true}. The offer requests a recvonly audio transceiver (nest.js:91). Every track, audio included, is added to the MediaStream assigned to video.srcObject (nest.js:96-97), and Nest WebRTC cameras advertise OPUS audio. Chromium's autoplay policy exempts MediaStream sources from the gesture requirement, and the user has just tapped the card anyway. So play() runs unmuted and camera audio comes out of the tablet, which contradicts the explicit `muted: true`.

**fix:**

In ui.js, right after line 40, add `r.video.muted = true;` (optionally `r.video.defaultMuted = true;` as well). Alternatively, special-case boolean media properties in h(), for example `else if (k === 'muted') el.muted = el.defaultMuted = !!v;`.

**file:** web/js/ui.js

**line:** 40

### 25. Night dimming is lifted for ~90-120 s after every automatic 03:30 reload

**lens:** runtime

**real:** True

**severity:** low

**reasoning:**

main.js:198 initialises `lastTouch = Date.now()` at module load. updateNight (main.js:201) requires `Date.now() - lastTouch > 90e3` and runs at boot and then on 30 s ticks (main.js:257, 266). The default reloadAt of 03:30 falls inside the default 22:30-06:30 window, so after each scheduled reload the full dashboard shows undimmed until roughly the third tick, about 90 s later. README.md:21 says it dims 'when nobody's touched it for 90 s', and nobody has touched it. The behaviour is real, but it is a brief bright period, so I rate it low rather than medium.

**fix:**

Don't count an unattended load as a touch: `let lastTouch = nightNow() ? 0 : Date.now();` (nightNow is already defined at main.js:93). Alternatively, set a sessionStorage flag just before the scheduled `location.reload()` and start lastTouch at 0 when that flag is present.

**file:** web/js/main.js

**line:** 198

### 26. Daily re-discovery failure blocks the public Agile price refresh

**lens:** runtime

**real:** True

**severity:** low

**reasoning:**

refreshRates (main.js:105-107) awaits ensureDiscovered() before octopus.rates(). Once discovered.at is older than 24 h, and whenever apiKey and account are set, discovery re-runs the authenticated GraphQL account query (main.js:97-102, octopus.js:148-154). If that call throws (a KT-CT-1199 rate limit mapped to 429 at octopus.js:141, a GraphQL outage, a revoked key, or parseAccount's 'No active ... tariff'), refreshRates throws before the public REST rates call, even though octopus.tariff() already returns the known or overridden tariff (octopus.js:108-110). d.at is not updated on failure, so every retry repeats the discovery. Impact is limited because state.rates keeps its cached values and the current price still shows. The losses are the red dot and tomorrow's prices not loading until GraphQL recovers. Rated low.

**fix:**

In refreshRates, replace the first line with `try { await ensureDiscovered(); } catch (e) { if (!octopus.tariff()) throw e; }` so discovery is best-effort when a tariff is already known.

**file:** web/js/main.js

**line:** 106

### 27. Closing the camera (or switching apps) while it is connecting reports a camera error and leaves a red dot until the next reload

**lens:** runtime

**real:** True

**severity:** low

**reasoning:**

Reproduced with Playwright using a delayed GenerateWebRtcStream mock. closeCamera (main.js:177-182) sets live=null and stream.stop() closes the pc while start() is still awaiting nest.command (nest.js:107). When the reply arrives, setRemoteDescription on the closed pc (nest.js:111) rejects. openCamera's catch (main.js:168-170) then records state.status.camera as an error and toasts "Camera: Failed to execute 'setRemoteDescription' ... signalingState is 'closed'.". #cam .dot became 'dot error'. Nothing clears state.status.camera except a later successful openCamera or a reload. The same happens when visibilitychange→hidden (main.js:262) fires during connecting, for example when a dock button launches an app. StopWebRtcStream is still sent, because A's session is set before the throw, so the only harm is the misleading error. Rated low.

**fix:**

Add `this.stopped = true` in LiveStream.stop(). In start(), right after the GenerateWebRtcStream await, if `this.stopped`, set `this.session = res.mediaSessionId`, call `await this.stop()` so StopWebRtcStream is sent, and return. In openCamera's catch, skip the status and toast when `stream.stopped` was set by closeCamera, i.e. when `live !== mine` (see finding 1's fix).

**file:** web/js/main.js

**line:** 168

### 28. KIA_VIN is passed as a plain repository variable, so the car's VIN is printed in the public Actions log

**lens:** ops-docs

**real:** True

**severity:** low

**reasoning:**

The cited line numbers are wrong: kia.yml has only 81 lines. The content is correct, though. At .github/workflows/kia.yml:66 the step 'Read the last reported battery level and encrypt it' sets `KIA_VIN: ${{ vars.KIA_VIN }}` in its step `env:`. For `run` steps, GitHub Actions prints the evaluated env block in the collapsed header of the step log. Secrets show as `***`. Configuration variables are not masked: GitHub's own docs warn that variables render unmasked in build outputs. Nothing masks the value. So a user who follows docs/kia.md:19 ('under **Variables**, `KIA_VIN`') gets the VIN printed in every hourly run log of this public repo. That breaks the promises at kia.yml:8, docs/kia.md:6 and tools/kia_fetch.py:12 ('prints nothing about the car'). I lowered the severity to low. Only users with several cars on the account set KIA_VIN, and a VIN is quasi-public (it is on the windscreen) and gives no control of the car on its own. It is still a real break of an explicit privacy promise, and the log is tied to the owner's GitHub identity. The alternative fix in the finding does not work as written. An earlier step that runs `::add-mask::` would need the VIN in its own env or script, and that step's header would print it unmasked first.

**fix:**

kia.yml:66: `KIA_VIN: ${{ secrets.KIA_VIN }}`. kia.yml:3: 'Optional secrets: KIA_PIN, KIA_VIN (if the account has more than one car).' docs/kia.md:19: list `KIA_VIN` as an optional repository secret, not under Variables. Do not use the add-mask route.

**file:** .github/workflows/kia.yml

**line:** 145

### 29. When the Kia job stops working, the panel keeps showing the old reading with no warning; docs say the tile falls back to 'Kia app'

**lens:** ops-docs

**real:** True

**severity:** low

**reasoning:**

Confirmed. When the job fails, kia.yml exits at step 59-67 before the publish step (69-81), so the last kia.json stays on kia-data. refreshKia (web/js/main.js:143-145) fetches and decrypts it without error. source() then sets `status = {ok:true}` and resets `lastOk` (main.js:72-74), so the `staleAfter: 6*3600e3` check at main.js:253 can never fire for Kia. tools/kia_fetch.py:49 writes `fetched`, but nothing in web/js reads it. ui.js:262-268 only shows `updated`, and the mocks (web/test/support/mocks.js:116) never include `fetched`, so no test covers this. docs/kia.md:7 says a failing job leaves the tile as a 'Kia app' button. That only holds if the Data URL was never set. Once it is set, main.js:231 never launches the app and ui.js:270 shows '–'. I lowered the severity from medium. The tile still shows 'updated N ago', which is the true age of the car's report, so the data is not passed off as fresh. GitHub also emails failure and disabled-schedule notices by default. The real gap is that the panel gives no dot or explanation, and its own stale detection is dead code for this source. (The cited doc line numbers are also wrong: kia.md is 40 lines. The statements are at kia.md:7 and :36.)

**fix:**

In web/js/main.js refreshKia: `const r = await fetchKia(settings.kia); state.kia = r; if (r.fetched && Date.now() - r.fetched > 3 * 3600e3) throw new Error(`The Kia GitHub job last ran ${Math.round((Date.now() - r.fetched) / 3600e3)} h ago – check Actions`);`. The reading stays on screen, and the tile gets a red dot and a message when tapped. Add an e2e case with `kiaReading: {..., fetched: NOW - 10*3600e3}`. Change docs/kia.md:7 to say that once the panel has a reading, a failing job leaves the last reading on screen with a red dot, not the 'Kia app' button.

**file:** docs/kia.md

**line:** 73

### 30. Local test and preview instructions leave out the Playwright browser download, so `npm run test:e2e` fails on a fresh clone

**lens:** ops-docs

**real:** True

**severity:** low

**reasoning:**

Confirmed by running it. node_modules/playwright and playwright-core 1.56.1 have no scripts, and the lockfile marks only fsevents as having an install script, so `npm install` downloads no browser. With `PLAYWRIGHT_BROWSERS_PATH` pointing at an empty dir, `node --test web/test/e2e/setup.test.js` fails every test with 'browserType.launch: Executable doesn't exist at …/chromium_headless_shell-1194/…'. The process then hangs until killed, because web/test/support/browser.js:16-17 starts the server before launch() throws, and `env` stays undefined, so the server is never closed. `npm run preview` fails the same way, since web/test/preview.js:3 imports chromium. CI only works because of pages.yml:29. The affected docs are README.md:59-62 and docs/customising.md:36. The troubleshooting.md citation is wrong: it only runs `npm run serve` (troubleshooting.md:41-42), which does not use Playwright. Severity stays low: this is dev-only, and Playwright's error prints the fix.

**fix:**

README.md code block: add `npx playwright install chromium   # the browser the tests use (add --with-deps on Linux)` after `npm install`. docs/customising.md:36: mention the same one-off step. Another option is a package.json script, `"pretest:e2e": "playwright install chromium"`. Leave troubleshooting.md unchanged.

**file:** README.md

**line:** 59

### 31. Docs say changing Claude's intent needs only one line in launcher.js, but an e2e test hard-codes the old string, so CI fails and publishing stops

**lens:** ops-docs

**real:** True

**severity:** low

**reasoning:**

Confirmed. docs/voice-and-apps.md:17 says only the one `claude` line in web/js/launcher.js (line 16) needs changing. web/test/e2e/panel.test.js:222-223 (the test starts at :210) deep-compares the recorded navigations against the literal HOME and Claude intent strings. The navigation comes from APPS.claude.special through actionFor (launcher.js:58), so editing launcher.js:16 alone makes the deepEqual fail. pages.yml:44 has `publish: needs: test`, so the fix never deploys. The Gemini entry on the next line already uses `APPS.gemini.special`, and no other test hard-codes the Claude string.

**fix:**

web/test/e2e/panel.test.js:222-223: replace the two literals with `APPS.home.special` and `APPS.claude.special`. Otherwise, change voice-and-apps.md:17 to say the matching line in web/test/e2e/panel.test.js must be updated too.

**file:** web/test/e2e/panel.test.js

**line:** 223

### 32. octopus.md says a rate limit shows an amber dot; the code shows a red one

**lens:** ops-docs

**real:** True

**severity:** low

**reasoning:**

Confirmed. The GraphQL rate limit is thrown as `HttpError(429, 'Octopus rate limit reached')` (web/js/octopus.js:141), and a REST 429 comes through fetchJSON as an HttpError too. main.js:78 always sets `{error, stale:true}` in the catch. setDot (ui.js:114) checks `error` first, so the dot gets class `error`, which is var(--high), red (panel.css:74). troubleshooting.md:20 correctly says 'Home Mini red dot'. docs/octopus.md:26 (not :136) says 'the Home Mini card shows an amber dot'. This is a doc mismatch only.

**fix:** docs/octopus.md:26: '…the panel backs off by itself and the Home Mini card shows a red dot (tap it: "Octopus rate limit reached").'

**file:** docs/octopus.md

**line:** 136

### 33. customising.md says to change price colours with CSS variables, but the chart bars use hard-coded colours

**lens:** ops-docs

**real:** True

**severity:** low

**reasoning:**

Confirmed. docs/customising.md:17 says colours are the `--cheap/--mid/--high/--plunge` variables at the top of web/css/panel.css (lines 17-20). The chart bars are drawn with `fill="${BAND_COLOURS[...]}"` (web/js/chart.js:56), using hex values hard-coded at chart.js:6. No CSS rule targets `.ch-bar` fill, and an SVG presentation attribute only loses to a CSS rule if one exists. So changing `--cheap` recolours the price text (.band-*), the dots and the checklist, but not the chart bars. Minor, but the failure is concrete.

**fix:**

In chart.js:56 emit `class="ch-bar band-${b}${past}"` without a `fill`, and add `.chart-svg .ch-bar.band-cheap{fill:var(--cheap)}` and the matching rules for mid, high and plunge, plus one for none, to panel.css. Alternatively, change customising.md:17 to say the chart's bar colours are `BAND_COLOURS` in web/js/chart.js.

**file:** docs/customising.md

**line:** 17

### 34. In Chrome the car tile always opens the Play Store, but the docs treat that as a sign of a wrong app ID

**lens:** ops-docs

**real:** True

**severity:** low

**reasoning:**

Confirmed. In Chrome mode, actionFor('car','chrome',{pkg}) builds `app = { pkg }` with no `web` (launcher.js:50), so it always returns the Play Store URL (launcher.js:64), whatever the ID is. docs/voice-and-apps.md:47 says 'If it opens the Play Store instead, put the right app ID in ⚙ → Panel → Car app'. That section is not limited to WebView, unlike the table note at :13. The Chrome section of docs/tablet.md:22-25 does not mention the car tile. The settings help at settings-ui.js:186 does not either. So a Chrome user following the doc re-enters a correct ID and still gets the Play Store. Low impact, because the Play Store page has an 'Open' button.

**fix:**

docs/voice-and-apps.md:47: add 'In Chrome the tile always opens the app's Play Store page (tap Open there). Web pages in Chrome can't launch it directly, so the Car app ID only changes what opens in the kiosk app.' Add a matching bullet to the Chrome list in docs/tablet.md:22-25.

**file:** docs/voice-and-apps.md

**line:** 92
