# Fix check 2

> Code review findings (all fixed at the time). Kept as a record.

_Workflow: Check each review fix really resolves its finding without regressions, plus an independent regression hunt, each verified by a skeptic_

**unresolved:**

### 1. security-ops-docs

**n:** 30

**resolved:** False

**note:**

Only partly fixed. The deepEqual now uses APPS.home.special and APPS.claude.special, but the fix added panel.test.js:241, a regex that still pins Claude's intent to action=VOICE_ASSIST;component=com.anthropic.claude/. Editing the claude line in any other way still fails CI. See problems.

**confirmed:**

### 1. Every real camera start error is now hidden: no toast, no red dot, the view just closes

**group:** camera

**file:** web/js/main.js

**line:** 211

**kind:** regression

**real:** True

**severity:** high

**reasoning:**

I could not refute this. In web/js/main.js:210-218 the catch block runs `await stream.stop()` before it checks `live === mine`. When start() throws a genuine error, stream.stopped is still false. That covers nest.command rejecting in GenerateWebRtcStream (web/js/nest.js:115), setRemoteDescription rejecting while not stopped (nest.js:123-128), and `!this.RTC` (nest.js:86). So stop() runs to completion and calls `this.onState('ended')` (nest.js:165). At that moment live === mine, so the onState callback (main.js:195-199) sets mine.state = 'ended' and `live = null`. The `if (live === mine)` check at main.js:211 is then always false: state.status.camera is never set and the 'Camera: …' toast never fires. The only case where the guard does its job is the user closing first: closeCamera already set live = null, and there start() usually returns null rather than throwing. I confirmed this in /tmp/claude-0/.../scratchpad/sim.mjs. It runs the real LiveStream with a fake RTCPeerConnection and a nest.command that throws '400 The camera is offline' on GenerateWebRtcStream, plus a copy of openCamera's logic. The result was `{ toasts: [], status: {}, live: null }`. At 621fe1b the toast and status were set before stop(), so this is a regression the fix commit introduced. The impact is that every camera failure is silent: offline camera, 403 permissions, 429 quota, bad answer SDP, no WebRTC. The view closes after 'connecting…' and the dot keeps whatever status it had, green if an earlier session worked. That also defeats the 'tap a red dot to see why' design in main.js:231-234.

**fix:**

In web/js/main.js catch block, decide ownership before stop() fires onState('ended'):
```js
} catch (e) {
  const current = live === mine;
  if (current) {
    state.status.camera = { error: describeError(e), at: Date.now() };
    ui.toast(refs, `Camera: ${describeError(e)}`);
  }
  await stream.stop();
  if (live === mine) live = null;
}
```
(Equivalently, guard on `live === mine && !stream.stopped` before calling stop().) Add an e2e test where executeCommand(GenerateWebRtcStream) returns 400 and assert the 'Camera:' toast and '#cam .dot.error'.

### 2. The new e2e camera tests don't cover the error path or the main.js session guards, which let the regression above through

**group:** camera

**file:** web/test/e2e/panel.test.js

**line:** 198

**kind:** test-gap

**real:** True

**severity:** low

**reasoning:**

This is confirmed by grep. No e2e or unit test makes openCamera's start() fail. The only 'Camera:' and '#cam .dot.error' assertions are negative ones in web/test/e2e/panel.test.js:221-222. The unit tests in web/test/unit/google-nest.test.js exercise LiveStream directly, never main.js's catch path. That gap is why the high-severity regression above passes the suite. In the 'closing while it connects' test (panel.test.js:198-227), the first stream is stopped by closeCamera after live is already null, so its onState('ended') is ignored under both the old `if (!live)` guard and the new `live !== mine` guard. After release, start() takes the stopped branch at nest.js:116-119 and returns null without throwing or calling onState. Reverting either the onState guard or the catch-path guard would therefore not fail this test. Its real discriminator is the StopWebRtcStream count. This is a test gap, not a runtime bug, so low severity.

**fix:**

Add an e2e test in web/test/e2e/panel.test.js that routes smartdevicemanagement executeCommand with a GenerateWebRtcStream body to a 400 error (e.g. {error:{code:400,message:'The camera is offline'}}). After clicking #cam, assert that a '.toast' containing 'Camera:' appears, that '#cam .dot.error' is present, and that '.cam-bar' is hidden. Optionally make fakeCameraRTC's setRemoteDescription throw an InvalidStateError DOMException after close(), so applying an answer to a closed pc shows up.

### 3. A Home Mini that stops before midnight goes back to green the next day, and the cost shows just the standing charge with no warning

**group:** data-runtime

**file:** web/js/main.js

**line:** 71

**kind:** unresolved

**real:** True

**severity:** medium

**reasoning:**

I reproduced this with a scratch Playwright test using the repo's mocks: homeMiniStopsAt = 2026-09-24 21:00 BST. At 23:50 the usage and cost dots are 'dot stale', as intended. At 00:50 the next day, telemetryToday (octopus.js:199-206) only asks for today and gets []. parseTelemetry gives demandAt = null and slots = []. At main.js:71, `dataAt?.() ?? lastOk` then falls back to lastOk, which is just now, so the status is { ok: true } and the usage dot is plain 'dot'. 'Using now' shows '–' with no hint, because the API key is set (ui.js:246). updateCost (main.js:141-142) treats [].every(priced) as true, so 'Today so far' shows '£0.48 / 0.0 kWh used', which is the standing charge only, and its dot is plain too. The same happens if the API returns today's rows with null demand. Any outage that runs past midnight is hidden again from 00:00 until the Home Mini recovers, and a Home Mini that dies in the last 45 minutes before midnight is never flagged at all. That is the silent failure finding n=0 was meant to fix.

**fix:**

In main.js, import startOfDay from './time.js' and change the homemini option at line 310 to `dataAt: () => state.tele?.demandAt ?? (state.tele ? startOfDay(Date.now(), tz) : null)`. A day with no reading then turns amber 45 minutes after midnight. staleCheck already runs every 30 s. Optionally, have homeMiniStaleWhy say 'No Home Mini reading yet today' when demandAt is null.

### 4. The calendar dedupe key uses the raw originalStartTime string, which Google formats in each calendar's time zone

**group:** data-runtime

**file:** web/js/calendar.js

**line:** 25

**kind:** new-bug

**real:** True

**severity:** low

**reasoning:**

calendar.js:25 builds the key from the raw originalStartTime.dateTime string. fetchEvents (calendar.js:65) passes no timeZone parameter, and Google's documented default formats dateTime values in each calendar's own time zone. All instances of a recurring event share one iCalUID, so the key depends on originalStartTime. I checked this with normalizeEvent and groupDays: the same instance from a UTC calendar ('2026-09-25T17:00:00Z') and from a Europe/London calendar ('2026-09-25T18:00:00+01:00') gets two different keys, and groupDays returns 2 events for Today. Non-recurring events and calendars that share a time zone are deduplicated correctly. The remaining case needs two selected calendars with different time zones plus a shared recurring event. That is uncommon, but it is exactly the duplicate finding n=12 was meant to remove.

**fix:**

Normalise the key in calendar.js:25: `key: `${e.iCalUID || e.id || ''}|${e.originalStartTime?.dateTime ? Date.parse(e.originalStartTime.dateTime) : e.originalStartTime?.date || start}``. Alternatively, add `&timeZone=${encodeURIComponent(tz)}` to the events.list URL at calendar.js:65.

### 5. After clear(), a signed-in user with no calendars chosen is told to sign in to Google

**group:** data-runtime

**file:** web/js/ui.js

**line:** 175

**kind:** new-bug

**real:** True

**severity:** low

**reasoning:**

This happens. With google.signedIn true and calendars = [], the calendar source is disabled, clear() sets state.events = null (main.js:318), and renderCalendar (ui.js:175-176) shows 'Sign in to Google in Settings to show your calendar'. My scratch e2e run confirmed that text with a signed-in profile and calendars: []. The checker's 'new-bug' framing is wrong, though. At 621fe1b, a user who has just signed in has events = null and calendars = [] (config.js:23, and Settings does not pick any automatically), so the same misleading text already appeared right after every first sign-in. The fix for n=15 adds a second way in (deselect all, then Save & close) but did not create the state. It is a minor misleading message, not a data error.

**fix:**

Tell the renderer whether the user is signed in. In main.js:52, call `ui.renderCalendar(refs, state.events, now, state.status.calendar, tz, 9, google.signedIn)`. In ui.js:173-176, add a `signedIn` parameter and use `st?.error ? 'Calendar unavailable' : signedIn ? 'Choose calendars in Settings to show them here' : 'Sign in to Google in Settings to show your calendar'`.

### 6. The new e2e regex still hard-codes Claude's intent, so the docs' promise that you only change one line in launcher.js is still false

**group:** security-ops-docs

**file:** web/test/e2e/panel.test.js

**line:** 241

**kind:** unresolved

**real:** True

**severity:** low

**reasoning:**

The fix swapped the literals for APPS.home.special and APPS.claude.special in the deepEqual (panel.test.js:242-249). It also added a guard at panel.test.js:241: `assert.match(nav[1], /^intent:#Intent;action=android\.intent\.action\.VOICE_ASSIST;component=com\.anthropic\.claude\//)`.

The case the docs literally describe still passes. If Claude moves its assistant activity to a new class, the component stays under com.anthropic.claude/ and the regex matches.

The promise in voice-and-apps.md:17 ('only the one line for `claude` in `web/js/launcher.js` needs changing') is unconditional, though. Some realistic one-line edits break the test:
- The package-resolved form that the Gemini line in launcher.js:21 already uses: `action=android.intent.action.VOICE_ASSIST;package=com.anthropic.claude;...`
- A different action (for example ASSIST or VOICE_COMMAND), which is needed if the new activity doesn't declare VOICE_ASSIST.
- Putting component= before action=.

In any of these cases the test fails, the pages.yml test job fails, and `publish` (needs: test) is skipped. The failure is loud in CI and the tablet keeps the old build. It's a partial fix of finding 30, so I rate it low, not medium.

**fix:**

In web/test/e2e/panel.test.js:241, loosen the check to `assert.match(nav[1], /^intent:#Intent;.*;end$/);` or delete it (the deepEqual against APPS.claude.special already checks the wiring). Or change docs/voice-and-apps.md:17 to say the check at web/test/e2e/panel.test.js:241 must also be updated if the new intent doesn't use VOICE_ASSIST with a com.anthropic.claude/ component.

### 7. cspAllows does an exact string match, so proxy addresses the browser's CSP accepts are rejected with 'Add … first'

**group:** security-ops-docs

**file:** web/js/octopus.js

**line:** 96

**kind:** new-bug

**real:** True

**severity:** low

**reasoning:**

web/js/octopus.js:92-97 tests `m[1].trim().split(/\s+/).includes(origin)`. `origin` is the proxy URL with trailing slashes stripped and its case unchanged (line 111). I checked this in the repo's Playwright Chromium with a page CSP of `connect-src 'self' https://api.octopus.energy <token>` and fetch('https://octo.me.workers.dev/v1/graphql/'). Each of these tokens gave status 200 in the browser but cspAllows=false:
- 'octo.me.workers.dev'
- 'https://octo.me.workers.dev/'
- 'https://OCTO.me.workers.dev'

Only the exact 'https://octo.me.workers.dev' gave true, and 'https://other.workers.dev' was correctly blocked.

The trailing-slash case is plausible: copying the worker's address from Chrome's address bar gives 'https://…workers.dev/'. docs/octopus.md step 5 just says to 'add … your worker's address'. The `base` getter then throws 'Add https://… to connect-src in web/index.html first', so rates and the Home Mini fail even though the page's CSP would allow the call.

The message names the exact form to add, so the user can recover, and no test covers this path. I rate it low.

**fix:**

In web/js/octopus.js cspAllows, normalise both sides before comparing: `const norm = (t) => (/^https?:\/\//i.test(t) ? t : `https://${t}`).replace(/\/+$/, '').toLowerCase(); return !!m && m[1].trim().split(/\s+/).some((t) => norm(t) === norm(origin));`

### 8. Sign out revokes the token at Google at once, but Cancel keeps it saved, leaving Google broken while it still shows as signed in

**group:** security-ops-docs

**file:** web/js/settings-ui.js

**line:** 160

**kind:** new-bug

**real:** True

**severity:** low

**reasoning:**

In settings-ui.js:156-170 the Sign out handler POSTs to https://oauth2.googleapis.com/revoke straight away (line 160), but it only clears `draft.google`. `draft` is a deep copy (line 44). Cancel (line 225) just removes the overlay, so `s` and localStorage keep the revoked refreshToken, calendars, cameraId and thermostatId.

When Settings is reopened, checklist() (line 29/34) shows 'Google sign-in ✓', because it only checks that a refresh token is present. The next access-token refresh gets invalid_grant, and google.js:124-125 throws 'Google sign-in expired or was revoked'. Calendar and thermostat go red while the cached data stays on screen. The only way back is a full sign-in again (in Chrome, then Copy/Paste settings when using the kiosk).

The e2e test (resilience.test.js:53) covers only Sign out followed by Save & close. No test covers Sign out followed by Cancel.

The errors that appear are accurate and the revocation was asked for, so the effect is an inconsistent state rather than data loss. I rate it low.

**fix:**

In the Sign out handler (settings-ui.js:164), save the cleared Google fields as well, the same way Sign in saves at once: `const cleared = { refreshToken: '', scopes: '', calendars: [], cameraId: '', thermostatId: '' }; Object.assign(draft.google, cleared); Object.assign(s.google, cleared); save();`. Or move the revoke into Save & close: `if (s.google.refreshToken && !draft.google.refreshToken) revoke(s.google.refreshToken)`, run before `Object.assign(s, draft)`.

### 9. The custom-domain advice leaves out that settings, the Kia key and the Octopus proxy's allowed origin all break

**group:** security-ops-docs

**file:** docs/tablet.md

**line:** 47

**kind:** doc-mismatch

**real:** True

**severity:** medium

**reasoning:**

docs/tablet.md:47 recommends 'give the panel its own domain (GitHub → Settings → Pages → Custom domain) and update the Google redirect URI to match', and nothing else.

What is confirmed:
- The proxy Worker in docs/octopus.md:38 hard-codes `PANEL = 'https://anginsemilir.github.io'` as Access-Control-Allow-Origin, so after the switch every proxied Octopus call fails CORS.
- The new origin has empty localStorage, so the Octopus key, Google details and Kia key must be entered again. The Kia key has to be regenerated and KIA_PANEL_KEY updated, because a GitHub secret can't be read back.

On the tablet it's actually worse than the claim, and I checked it. The fix for finding 22 made sw.js:20 fall back to the cache on `!res.ok`. A navigation request uses redirect mode 'manual', so the Pages 301 to the custom domain comes back as an opaqueredirect (status 0, ok=false), and the service worker serves the cached index.html on the old origin. Updates to sw.js also fail on the redirect, so that service worker never goes away.

I reproduced this with the real web/ app in Chromium: a service worker registered on origin A, then A switched to 301 everything to origin B. After a reload the URL stayed on A and index.html came from the cache. main.js was fetched via the followed redirect from B and blocked by `script-src 'self'`, and #app stayed empty: a blank panel. (If the cross-origin fetch failed CORS instead, the old cached code would run for good.)

So on a tablet that already runs the panel, following the advice gives a permanently blank (or frozen) panel at the kiosk's configured URL. It also doesn't give the separation it promises. Recovery means clearing site data or changing the kiosk URL, plus entering every setting again.

**fix:**

Extend docs/tablet.md:47: 'Before switching, ⚙ → Copy settings. Afterwards, set the kiosk app's URL to the new address and paste the settings there. Update the Google redirect URI (google.md step 1) and PANEL in the Cloudflare worker (octopus.md step 3). Clear the old address's site data.' And in web/sw.js:20, don't treat a redirect as a failure: `if (!res.ok && res.type !== 'opaqueredirect')`, so the browser follows the 301 instead of serving the cached page on the old origin.

### 10. README still gives the old test counts (33 unit, 15 browser); there are now 40 and 21

**group:** security-ops-docs

**file:** README.md

**line:** 47

**kind:** doc-mismatch

**real:** True

**severity:** low

**reasoning:**

README.md:47 says '33 unit tests and 15 browser tests', which matched 621fe1b (unit 7+9+7+10=33; e2e 11+4=15). At HEAD, `npm test` reports '# tests 40', and the e2e files contain 11+6+4=21 `test(` calls (panel, resilience, setup). The fix commit changed README.md in other places but not this line. It's a cosmetic doc mismatch.

**fix:** README.md:47: change to '40 unit tests and 21 browser tests', or drop the exact numbers.

### 11. Camera start failures are now silently swallowed: no toast and no red dot

**group:** fresh-eyes

**file:** web/js/main.js

**line:** 211

**kind:** regression

**real:** True

**severity:** high

**reasoning:**

This is confirmed and happens on every failure. When LiveStream.start() throws, main.js:211 runs `await stream.stop()` first. stop() (nest.js:156-166) sets stopped and calls `this.onState('ended')` synchronously before its first await. The onState callback (main.js:194-199) still sees `live === mine`, sets mine.state = 'ended' and `live = null`. The `if (live === mine)` check at main.js:212 is therefore always false after a start() error, so status.camera never gets the error, no 'Camera: …' toast appears, and the dot stays clear. The Settings checklist item (settings-ui.js:36) keeps showing ✓. I ran the real nest.js in node with main.js's catch logic copied in. With GenerateWebRtcStream throwing '403 The caller does not have permission' there was no toast and status stayed null. With no RTCPeerConnection ('This browser has no WebRTC support') the result was the same. On 621fe1b the error was recorded before stop(), so this is a regression introduced by the fix commit. It covers the most common setup mistake (403 because the camera wasn't ticked in Google's device picker), an offline camera, 429 and timeouts. No test catches it: panel.test.js only asserts the absence of errors in the close-while-connecting case. It is rated high because it removes every diagnostic for a primary feature, and the panel even reports the camera as healthy.

**fix:**

In web/js/main.js openCamera, capture ownership before stop() fires onState('ended'): `} catch (e) { const current = live === mine; await stream.stop(); if (current) { state.status.camera = { error: describeError(e), at: Date.now() }; ui.toast(refs, `Camera: ${describeError(e)}`); live = null; } }`. closeCamera sets live = null before its own stop(), so the no-false-error behaviour for a user close is kept. Add an e2e case where executeCommand GenerateWebRtcStream returns 403 and assert the 'Camera:' toast and '#cam .dot.error'.

### 12. 'Sign out of Google' revokes the token before Save, so Cancel leaves the panel holding a dead token

**group:** fresh-eyes

**file:** web/js/settings-ui.js

**line:** 158

**kind:** new-bug

**real:** True

**severity:** low

**reasoning:**

Confirmed from the code. At settings-ui.js:158-163 the handler POSTs the refresh token to oauth2.googleapis.com/revoke immediately. It then only changes `draft` (a JSON deep copy made at line 44). Cancel (line 225) just removes the overlay, so the saved settings `s` and the running Google client keep the revoked refresh token. After that, token refreshes fail with invalid_grant, and Calendar, thermostat and camera show 'Google sign-in expired or was revoked'. Reopening Settings still shows 'Signed in.' (line 114) and ✓ Google sign-in (checklist line 29/34, `!!s.google.refreshToken`). This contradicts the design note at line 45 that Cancel discards changes. The damage is limited: the user explicitly pressed Sign out, the post-sign-out message tells them to Save & close, and the red-dot message does say to sign in again. The Chrome→kiosk sub-scenario is less convincing, because docs/google.md:69 documents that Sign out cancels access at Google and tells users to clear site data in Chrome instead. The remaining issue is an accidental tap followed by Cancel, which leaves the UI inconsistent and requires a full Chrome sign-in plus Copy/Paste. That makes it low severity.

**fix:**

Make the irreversible part and the local state agree. The simplest option is to apply the sign-out to the live settings right after the revoke in the Sign out handler: `const cleared = { refreshToken: '', scopes: '', calendars: [], cameraId: '', thermostatId: '' }; Object.assign(draft.google, cleared); Object.assign(s.google, cleared); save();`. The alternative is to defer the revoke: store `revokeOnSave = token` in the handler, and in the Save & close handler POST the revoke before save() when `revokeOnSave && draft.google.refreshToken !== revokeOnSave`.

### 13. A Home Mini that stopped before midnight loses its amber 'stale' warning from 00:00 onward

**group:** fresh-eyes

**file:** web/js/main.js

**line:** 71

**kind:** new-bug

**real:** True

**severity:** low

**reasoning:**

Confirmed from the code. telemetryToday (octopus.js:199-206) asks only for local midnight to the next midnight. For a Home Mini that stopped the day before, today's result has no rows with demand, so parseTelemetry returns demandAt: null (octopus.js:70-73). The homemini source passes `dataAt: () => state.tele?.demandAt ?? null` (main.js:309). staleCheck then does `const t = dataAt?.() ?? lastOk` (main.js:71), which falls back to the API call that just succeeded, so st.stale is never set. renderTiles (ui.js:240-257) shows '–' with a plain dot for Using now. Today so far shows the standing charge with '0.0 kWh used' and a clean dot: slots is empty, so `every(priced)` is true and costP is the standing charge. The checklist shows ✓ Home Mini. The original finding 0 (a dead Home Mini gives no warning) is therefore fixed only on the day the device dies. From the next midnight on, which is the steady state of a device that stays dead, there is no warning again. The null fallback is correct for the first ~30 minutes of a healthy day, so the fix must keep that case quiet. This is an incomplete fix rather than a crash, and the '–' value is a weak hint, so it is low severity.

**fix:**

Remember the newest demandAt across days and judge staleness by that. In main.js refreshHomeMini: `if (tele.demandAt) state.lastDemandAt = tele.demandAt;` Add lastDemandAt to state init (`cache.lastDemandAt ?? null`) and to persist(). Change the homemini option to `dataAt: () => state.tele?.demandAt ?? state.lastDemandAt ?? null`. Use state.lastDemandAt in homeMiniStaleWhy as well. Clear it in the source's clear() callback.

### 14. The service-worker fallback on non-ok responses serves a stale cached page instead of following redirects

**group:** fresh-eyes

**file:** web/sw.js

**line:** 20

**kind:** new-bug

**real:** True

**severity:** low

**reasoning:**

Confirmed with a Playwright probe (a scratch local server with a copy of web/sw.js, run under /tmp/claude-0). After the SW controls /app/ and has cached it, the server switches to answering the navigation with a 301 to another origin. With HEAD's sw.js the page stays on the old URL and shows the cached 'OLD PAGE'. With 621fe1b's sw.js the browser follows the redirect to 'NEW DOMAIN'. The cause is that navigation requests use redirect: 'manual', so fetch(e.request) returns an opaqueredirect (status 0, ok false). The new `if (!res.ok)` branch at sw.js:20-23 then returns the cached copy (ignoreSearch). The SW script update fetch would also be redirected, so the SW can't replace itself and the trap persists. The realistic trigger is moving the site to a custom domain, which docs/tablet.md:47 (touched in this commit) recommends for storage isolation. GitHub Pages then 301-redirects the old project URL, and a kiosk still pointed at the old URL stays pinned to the old origin. That old origin is exactly what the custom domain was meant to leave. The page may be frozen, or broken if subresources follow the cross-origin redirect under script-src 'self'. The trigger is rare and optional, so this is low severity.

**fix:**

Fall back to the cache only for real server errors, not for redirects. In web/sw.js replace `if (!res.ok) {` with `if (res.type !== 'opaqueredirect' && (res.status === 404 || res.status >= 500)) {`. Alternatively use `if (res.type === 'basic' && !res.ok) {`.

### 15. The proxy CSP check uses exact string matching, so it rejects proxy entries the browser would allow

**group:** fresh-eyes

**file:** web/js/octopus.js

**line:** 96

**kind:** new-bug

**real:** True

**severity:** low

**reasoning:**

Confirmed in node by importing web/js/octopus.js with a stub document whose CSP meta held different connect-src entries, with Proxy URL 'https://octopus-proxy.me.workers.dev/' (the setting strips the trailing slash). 'https://octopus-proxy.me.workers.dev' passed. 'https://octopus-proxy.me.workers.dev/', 'octopus-proxy.me.workers.dev' and 'https://*.me.workers.dev' all made `get base` throw 'Add https://octopus-proxy.me.workers.dev to connect-src in web/index.html first'. CSP itself allows all three forms: a path ending in '/' matches every path, a scheme-less host inherits https, and '*.' matches subdomains. cspAllows (octopus.js:92-97) compares with `split(/\s+/).includes(origin)`. Because `get base` is used by every Octopus call, public rates, the Home Mini and Connect all fail. The error names an address that the user can already see in index.html apart from the trailing slash, which is confusing. docs/octopus.md:61-62 has the user copy the worker address by hand, and copying from Chrome's address bar adds the trailing '/'. The user can recover by matching the string exactly, so this is low severity.

**fix:**

Normalise the tokens before comparing. In cspAllows: `const want = origin.toLowerCase(); const host = want.replace(/^https:\/\//, ''); return !!m && m[1].trim().split(/\s+/).some((t) => { let x = t.toLowerCase().replace(/\/+$/, ''); if (!/^[a-z][a-z0-9+.-]*:/.test(x)) x = 'https://' + x; if (x === want) return true; const w = /^https:\/\/\*\.(.+)$/.exec(x); return !!w && host.endsWith('.' + w[1]); });`. Alternatively, drop the pre-check and map a fetch TypeError from the proxy, or a 'securitypolicyviolation' event, to the same hint.
