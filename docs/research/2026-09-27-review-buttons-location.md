# Review: music/AI/Assistant buttons and location-based day and night (incl. WebView Kiosk and Chrome location behaviour)

> Current. Note: its "Theme setting is back against the owner's request" finding predates the owner asking for the switch back; the location findings were fixed.

_Workflow: Adversarially review the music/AI/Assistant buttons and location-based day/night commits_

**confirmed:**

### 1. The cached tablet position is never refreshed on failure, never expires and is never cleared, so an old place overrides the weather location forever

**severity:** medium

**file:** web/js/main.js

**line:** 346

**scenario:**

refreshPlace() does `if (!p) return;`, so a refused, turned-off or timed-out location leaves state.place (loaded from localStorage 'wallpanel.cache.v1') untouched. sun() prefers state.place over the weather location without any condition, and the stored `at` timestamp is never checked. Example: the owner allows location once while setting up, later turns location off or revokes it (or it stops answering), then moves house and updates the weather location in Settings. The panel keeps switching light and dark at the old place's sunrise and sunset indefinitely. Across the UK that can be 30–40 minutes off in winter, and a tablet set up while travelling can be off by hours. Nothing on screen shows this and there is no way to clear it short of Android 'Clear data'. It also goes against the privacy page: after the owner refuses location, the rounded position is still kept on the tablet.

**fix:**

When locate() reports PERMISSION_DENIED, clear state.place and persist. Make locate() tell a denial apart from a timeout. Ignore a place older than N days (use `at`), for example 7–30 days, and fall back to the weather location. Optionally clear state.place when the weather location is changed in Settings.

**lens:** code

**verdict:**

**real:** True

**reason:**

I tried to refute this and couldn't. At HEAD, web/js/main.js line 37 loads `state.place` from the 'wallpanel.cache.v1' cache. `refreshPlace()` (lines 343-349) runs `const p = await locate(); if (!p) return; state.place = p; persist();`. In web/js/sun.js, `locate()` resolves null in every failure case: a denial, a timeout, location being unavailable, and the 35s guard. So a refusal and a timeout look the same to the caller, and neither clears the stored place. `sun()` (main.js lines 329-331) uses `state.place` whenever it is set, with no condition and no check of its `at` timestamp. Nothing else clears it: I grepped for state.place, removeItem and the cache key. `persist()` always writes `place: state.place` back, and saving a new weather location in Settings leaves the place alone. So once a position has been stored, it is used for the theme's sunrise and sunset for as long as that browser's storage lasts. If location is later turned off or refused, the stored place is still used and the weather location never is. That contradicts the commit message ("If location is off or refused, the weather location is used, as before"), docs/customising.md line 6 and docs/tablet.md line 14. The scenario needs a stored position and then location being turned off or refused, often together with a move, so it is an edge case. It is still a real mismatch between the code and the documented behaviour. There is nothing on screen and no in-app way to clear the place.

### 2. docs/voice-and-apps.md still says the Gemini button starts listening; that is now the Assistant button, and the Gemini option only opens the app

**severity:** low

**file:** docs/voice-and-apps.md

**line:** 47

**scenario:**

Line 47 says '"Hey Google, …" works anywhere … The Gemini button does the same without speaking first.' Line 24 says 'if the M10 doesn't offer [Voice Match], use the panel's Gemini button instead.' After 82be300 there is no Gemini button by default (the AI button defaults to Claude). With AI set to Gemini, a tap opens the Gemini app normally: APPS.gemini has no `special`, so a plain launchIntent is used, and the table on line 9 of the same file says so. An owner without Voice Match who follows line 24 picks Gemini for the AI button and gets the app, not listening. The listening pop-up is the Assistant button. README.md:58 ('the Claude, Gemini and Home buttons') and voice-and-apps.md:42 ('The panel's Claude button') also still use the old button names.

**fix:**

Lines 24 and 47: say 'the panel's Assistant button'. README.md:58: 'the AI (Claude), Assistant and Home buttons'. voice-and-apps.md:42: 'the AI button (set to Claude)'.

**lens:** code

**verdict:**

**real:** True

**reason:**

Confirmed at HEAD (4194152). In web/js/launcher.js, APPS.gemini has only pkg and web, with no `special`. So when the AI button is set to Gemini, a tap opens the Gemini app normally and does not start listening. The listening VOICE_ASSIST intent belongs to APPS.assistant, which ui.js:29 always renders as the "Assistant" button. assistantApp() also defaults to 'claude', so there is no Gemini button unless the owner picks it.

Three lines in docs/voice-and-apps.md still describe the old buttons, although the table at the top of the same file (lines 9-10) was updated:
- Line 24 says "use the panel's Gemini button instead" as the fallback when there is no Voice Match.
- Line 47 says "The Gemini button does the same without speaking first."
- Line 42 still says "The panel's **Claude** button".

README.md:60 (the finding said 58; it has shifted) still says "the Claude, Gemini and Home buttons".

Commit 82be300 did not touch any docs. The later commits (4fcb629, 1e46b4a) updated only the table and line 13. An owner without Voice Match who follows line 24 and sets the AI button to Gemini would get the Gemini app, not a listening pop-up. This is a real but low-severity documentation mismatch.

### 3. HEAD commit 1e46b4a puts the Theme setting back in Settings, against the owner's explicit request

**severity:** high

**file:** web/js/settings-ui.js

**line:** 255

**scenario:**

HEAD has moved past the three commits the task names. A newer commit, 1e46b4a (15:12, "Theme switch is back"), puts ⚙ → Panel → Theme back (Auto / Always light / Always dark). The owner's words were "this shouldn't be in the settings at all." The commit also restores DEFAULTS.panel.theme (config.js:44), so loadSettings merges any saved panel.theme again, and applyTheme uses `THEME_PIN || settings.panel.theme` (main.js:353). An old saved 'dark' or 'light' from before 4fcb629 is honoured again, so the panel can stay fixed and never follow the sun. README.md:27, docs/customising.md:6 and docs/tablet.md:14 now describe the setting too.

**fix:**

Revert 1e46b4a. Keep 4fcb629's approach: no DEFAULTS.panel.theme, no Theme select, and ?theme=light|dark only as a test/screenshot pin. If today's times are useful, show them as a read-only status line in the setup checklist (for example "Light 06:53–18:52, from the tablet's location"), not as a control.

**lens:** location

**verdict:**

**real:** True

**reason:**

The finding holds up. I checked it against the repo and it matches. HEAD is 4194152, and 1e46b4a (15:12, "Theme switch is back: Auto…, Always light, Always dark") sits between it and 4fcb629. That commit:
- adds field('Theme', select(draft.panel, 'theme', [auto, light, dark])) to ⚙ → Panel in web/js/settings-ui.js at line 255;
- puts DEFAULTS.panel.theme = 'auto' back in web/js/config.js at line 44;
- changes applyTheme to themeFor(THEME_PIN || settings.panel.theme, …) in web/js/main.js;
- changes THEME_PIN to return null when there is no ?theme=, so the setting decides the theme;
- rewrites README.md:27, docs/customising.md:6 and docs/tablet.md step 4 to describe the Theme setting;
- changes the e2e test so it now requires the Theme select and 'Always dark' to exist and work. Before, it checked that the setting was absent.

I also ran loadSettings against a saved {panel:{theme:'dark'}}. It returns 'dark', because merge keeps keys that exist in DEFAULTS. So a value saved before 4fcb629 is honoured again (the old default was 'auto'). The owner said "day and night mode should be controlled automatically based on my GPS location… this shouldn't be in the settings at all." Nothing in the repo or docs records a later request from the owner to bring the switch back. The last commit, 4194152, only adds research notes. So HEAD has a user-facing Theme control with manual overrides, which contradicts an explicit requirement. That makes this real, and high severity is fair.

### 4. The panel asks for location on every start, including the automatic 03:30 reload, so a prompt can appear every night

**severity:** high

**file:** web/js/main.js

**line:** 454

**scenario:**

refreshPlace() is called at every boot with no user gesture, and nothing is remembered about earlier outcomes.

(a) WebView Kiosk: handleGeolocationRequest.kt shows a native AlertDialog ("Permission request … Allow / Deny", with "Remember my choice" unticked) on every request unless the origin was saved with that box ticked. It calls callback.invoke(origin, true, false) (retain=false), so WebView itself never remembers. If the owner taps Allow without ticking the box, the dialog comes back at every start. At 03:30 it appears over the dimmed night overlay and stays lit until someone taps it. Unanswered dialogs pile up on later reloads.

(b) Chrome app: the Android prompt offers "Allow while visiting the site" / "Allow this time" / "Never allow" (permission_dialog.cc; GEOLOCATION is in GetTypesWithTemporaryGrants). "Allow this time" lasts at most 16 h (kOneTimePermissionMaximumLifetime), so after it lapses the next 03:30 reload prompts again. If the prompt is left unanswered and the page reloads, that counts as an ignore. Chrome embargoes the site for 7 days after 4 ignores or 3 dismissals (PermissionDecisionAutoBlocker; 1 or 2 with quiet UI, which geolocation can get), then starts prompting again. The result is a weekly cycle of overnight prompts.

(c) If Allow Location is on in WebView Kiosk but the Android permission isn't granted, a "Permission blocked … Close" dialog appears at every start instead.

**fix:**

Gate the request.

1) Query first: `const st = await navigator.permissions?.query({name:'geolocation'}).then(s=>s.state, ()=>null)`. If 'denied', skip. This covers WebView Kiosk's default (setGeolocationEnabled(false) makes AwPermissionManager return DENIED) and Chrome's Never allow and embargo. If 'granted', locate silently.

2) If 'prompt', never ask on the automatic nightly reload. The AUTO_RELOAD sessionStorage flag is already read at startup; expose it. In WebView Kiosk this state is permanent, because retain=false keeps AwBrowserContext.getGeolocationPermission at ASK, so don't gate only on 'granted'.

3) Remember the last outcome in localStorage, e.g. {at, outcome:'ok'|'denied'|'noanswer'}. After 'denied' or 'noanswer', don't ask again automatically. After 'ok', re-locate at most weekly: a wall tablet doesn't move, and state.place is already kept.

4) Add a unit/e2e case for a prompt that is never answered.

**lens:** location

**verdict:**

**real:** True

**reason:**

I tried to refute this and couldn't. The mechanism holds, though it only fires in some setups, so medium severity fits better than high.

Code (same at 4fcb629 and at HEAD 4194152):
- `boot()` in web/js/main.js:454 calls `refreshPlace()` on every start, with no conditions.
- `refreshPlace()` calls `locate()` in web/js/sun.js:52, which calls `navigator.geolocation.getCurrentPosition` directly.
- Nothing in web/js checks `navigator.permissions` or remembers an earlier answer.
- The AUTO_RELOAD flag (main.js:364-366) only resets `lastTouch`.
- `maximumAge` (12 h) cannot stop a permission prompt.
- `scheduleDailyReload` reloads the page at `settings.panel.reloadAt` (config.js default '03:30'), so a request happens every night.

WebView Kiosk (nktnet1, commit 02cf64c, read in the scratchpad clone):
- `handleGeolocationRequest.kt` shows an AlertDialog, "Permission request … Allow / Deny", with a "Remember my choice" checkbox that starts unticked.
- Allow calls `callback.invoke(origin, true, false)`, so WebView keeps nothing. The site is saved only if the box was ticked.
- Chromium `AwContents.onGeolocationPermissionsShowPrompt` skips the prompt only for a retained origin, so every page load, including the 03:30 reload, shows the dialog again.
- WebView Kiosk has no `onGeolocationPermissionsHidePrompt`, so a reload does not close an open dialog. The dialogs can pile up as the report says.
- If Allow Location is on but the Android location permission isn't granted, a "Permission blocked … Close" dialog appears at every start, as in (c). The setting's switch and its "Request … Permission" button are separate controls, so this state is easy to end up in.

Chrome (the report's sources, which I found as local copies in the scratchpad):
- GEOLOCATION is in `GetTypesWithTemporaryGrants`.
- `kOneTimePermissionMaximumLifetime` is used for one-time grants.
- `PermissionDecisionAutoBlocker` values: 3 dismissals or 4 ignores, 1 or 2 with the quiet UI, and a 7-day embargo.

What limits it:
- WebView Kiosk has Allow Location off by default, and in that case `AwContents` denies silently with no dialog.
- docs/tablet.md step 4 doesn't say to turn Allow Location on, so an owner who follows the docs exactly sees no prompt. The location feature then does nothing.
- An owner who ticks "Remember my choice", or picks Chrome's "Allow while visiting the site", is asked only once.

Even so, the owner explicitly wants this location feature, and it only works in WebView Kiosk once Allow Location is on. Once it is on, the docs just say "If it asks to use your location, allow it" and never mention ticking the box. Tapping Allow alone brings the native dialog back every night over the dimmed panel, and it stays until someone taps it. The page does nothing to prevent this.

### 5. Recommended WebView Kiosk setup never uses the tablet's location; docs say "if it asks, allow it", but by default it never asks

**severity:** medium

**file:** docs/tablet.md

**line:** 14

**scenario:**

WebView Kiosk's Device → Allow Location defaults to false (UserSettings.kt allowLocation default false; device.mdx "Default: false"). It calls setGeolocationEnabled(userSettings.allowLocation) (createCustomWebview.kt:277). AwContents.onGeolocationPermissionsShowPrompt then denies at once when geolocation is disabled. getCurrentPosition fails with PERMISSION_DENIED, no prompt appears, and the panel quietly uses the weather location. So the owner's "based on my GPS location" never takes effect in the recommended kiosk, and nothing on screen says why. Step 4 ("If it asks to use your location, allow it") describes a prompt that never appears. Even with Allow Location on, the Android permission must also be granted with the "Request Coarse/Fine Location Permission" button in that setting. Otherwise the "Permission blocked" dialog appears at every start.

**fix:**

Rewrite step 4 for WebView Kiosk. (1) ⚙ → Device → Allow Location: On. (2) Tap "Request Coarse Location Permission" and allow it in Android (approximate is plenty). (3) Back on the panel, when "Permission request" appears, tick "Remember my choice" and then tap Allow. It can be reviewed later under Web Browsing → Manage Site Permissions. Also add a read-only line to the setup checklist (not a setting): "Sunrise/sunset: from the tablet's location" or "…from the weather location (location is off in the kiosk app / refused / no fix)". To show the reason, locate() must return it (see the error-code finding).

**lens:** location

**verdict:**

**real:** True

**reason:**

The finding holds up. I checked it against WebView Kiosk's source (nktnet1/webview-kiosk HEAD, v0.26.21) and Chromium's AwContents.java.

1. **Location is off by default in the kiosk.** UserSettings.kt:506-511 sets `allowLocation` to `false`, and docs/settings/device.mdx says "Default: false". The setting has been in the app since 2025-10-10 (commit b9a1a8dd), so the current Play Store and F-Droid builds have it.
2. **Off means the page is refused without a prompt.** createCustomWebview.kt:277 calls `setGeolocationEnabled(userSettings.allowLocation)`. In Chromium's AwContents.onGeolocationPermissionsShowPrompt (lines 4257-4264), a WebView with geolocation disabled calls `invokeGeolocationCallback(false)` straight away. The app's WebChromeClient callback never runs, so no dialog appears.
3. **The panel then falls back quietly.** `locate()` in web/js/sun.js resolves `null` on the error callback, `refreshPlace()` returns early, and `state.place` is never set. `sun()` in main.js then uses the weather location.

Result: if the owner follows docs/tablet.md step 4 ("If it asks to use your location, allow it") in the recommended kiosk, nothing ever asks, and the tablet's own location is never used. That misses the owner's explicit request ("based on my GPS location").

The finding's second scenario also holds. handleGeolocationRequest.kt requires both `allowLocation` and the Android location permission. If Allow Location is on but the permission hasn't been granted, the "Permission blocked" dialog appears. The dialog can't remember a choice, and the panel calls `locate()` at every start, so it comes back each start. The "Remember my choice" box exists only in the Allow/Deny dialog. So the three steps in the suggested fix match the real UI: turn on Allow Location, tap "Request Coarse Location Permission", then tick Remember and tap Allow.

Two things soften it:
- At the reviewed commit 4fcb629, nothing on screen explains the fallback. The later HEAD commit 1e46b4a adds a Settings line: "at the weather location (allow location access for the tablet's own)". It still doesn't say how to turn location on in the kiosk.
- In practice the weather location is probably home, so sunrise and sunset would differ by only about a minute.

Even so, the docs describe a prompt the recommended app never shows, and the requested behaviour doesn't happen in the recommended setup.

### 6. Docs say "the browser asks once: tap Allow", which is wrong in both environments

**severity:** medium

**file:** docs/customising.md

**line:** 6

**scenario:**

In WebView Kiosk it asks on every start unless "Remember my choice" is ticked, and by default it never asks. In the Chrome app the buttons are "Allow while visiting the site" (lasts) and "Allow this time" (at most 16 h, so the prompt returns after a nightly reload). An owner who reads "tap Allow" may tap "Allow this time" and get re-prompted. In Chrome, if the tablet's Android Location switch is off, a request made without a user gesture from a site that isn't the default search engine is refused silently. CanShowLocationSettingsDialog needs a gesture, so no "turn on location" dialog appears, and the panel quietly falls back. README.md:27 ("allow it when asked") has the same gap.

**fix:**

Chrome: "tap Allow while visiting the site (not Allow this time)". WebView Kiosk: "tick Remember my choice, then Allow". Add: keep Android Settings → Location on, with Google Location Accuracy / Wi-Fi scanning on. On this Wi-Fi tablet the fix comes from Wi-Fi, not GPS. Tell the owner that if they chose Never allow, they can reset it in Chrome → Site settings → Location.

**lens:** location

**verdict:**

**real:** True

**reason:**

I tried to refute this and couldn't. docs/customising.md:6 (at 4fcb629 and at HEAD) says "the browser asks once: tap **Allow**", and the code comment in web/js/main.js refreshPlace() makes the same assumption. README.md ("allow it when asked") and docs/tablet.md step 4 ("If it asks to use your location, allow it") have the same gap.

1) WebView Kiosk (the recommended app). I checked the nktnet1/webview-kiosk source, latest commit 2026-09-23.
- UserSettings.allowLocation defaults to false. createCustomWebview.kt calls setGeolocationEnabled(userSettings.allowLocation), and handleGeolocationRequest.kt refuses the request unless allowLocation is on and the app holds the Android location permission. So on a default install the panel's location request is never offered, and the owner has to turn on Settings → Device → Allow location and grant the permission. No doc says this.
- Once it is enabled, the prompt is an AlertDialog with a "Remember my choice" checkbox, unticked by default. "Allow" calls callback.invoke(origin, true, false), so retain is false, and the choice is saved only if the box is ticked.
- boot() calls refreshPlace() → locate() on every page load, including the automatic 03:30 reload. So an owner who just taps Allow gets the dialog again after every reload. It stays on the wall panel until someone taps it, and the panel falls back to the weather location after the 35 s guard.

2) Chrome.
- The Android permission strings are "Allow while visiting the site" and "Allow this time", so there is no plain "Allow" button, and the one-time choice doesn't last.
- In geolocation_permission_context_android.cc, when Android's Location switch is off, IsLocationAccessPossible() is true only if CanShowLocationSettingsDialog() is. That returns false when the site isn't the default search engine and there is no user gesture. The request is then denied without any prompt. The panel's locate() runs at boot with no gesture, so it silently falls back.

Minor detail I did not verify: the exact 16 h lifetime of a one-time grant. The main claim does not depend on it.

Impact: in the default recommended setup, the owner's main requirement (day and night from the tablet's location) quietly never uses the location, and the docs send the owner the wrong way.

### 7. locate() throws away the error code, so denied, timed out and unavailable all look the same

**severity:** medium

**file:** web/js/sun.js

**line:** 63

**scenario:**

The error callback is `() => finish(null)`, and the guard also resolves null. The caller can't tell PERMISSION_DENIED (1) from POSITION_UNAVAILABLE (2), TIMEOUT (3), or no answer at all (a prompt left up, or a WebView that never calls back). So it can't back off after a refusal, can't avoid re-prompting at 03:30, and can't tell the owner in the checklist why the weather location is being used.

**fix:**

Resolve a result object instead, e.g. {place} | {error:'denied'|'unavailable'|'timeout'|'noanswer'|'unsupported'}, mapping err.code 1/2/3. Record it in localStorage with a timestamp for the backoff in refreshPlace(), and update the unit test (sun.test.js) to check the reason.

**lens:** location

**verdict:**

**real:** True

**reason:**

I could not refute it. The facts hold and the harm shows up on the tablet's main browser. In web/js/sun.js (lines 55-68, unchanged from 4fcb629 to HEAD), locate() handles every failure the same way: the error callback is `() => finish(null)`, the 35 s guard resolves null, and a thrown error resolves null. The unit test (sun.test.js line 52) confirms that code 1 (PERMISSION_DENIED) comes back as plain null. refreshPlace() in main.js calls locate() on every start and has no backoff or memory of earlier failures. The page restarts every night at reloadAt '03:30' (config.js line 37, scheduleDailyReload).

I read WebView Kiosk's source (nktnet1/webview-kiosk, utils/webview/handlers/handleGeolocationRequest.kt) to see whether re-prompting really happens there. It does:
- **Deny is never remembered.** Tapping Deny calls `callback.invoke(origin, false, false)` (retain=false), and "Remember my choice" is saved only for Allow. After a refusal, the "Permission request" dialog comes back at every start, including the 03:30 reload.
- **The default setting shows a dialog every time.** When the kiosk's allowLocation setting is off, which is the default (UserSettings.kt: false), every request opens a "Permission blocked" AlertDialog. The page gets no reply until someone taps Close.

So the "re-prompting at 03:30" scenario is real on WebView Kiosk. The docs' claim that "the browser asks once" is true only for Chrome, which remembers a denial.

Some caveats that make it a weaker finding:
- **The root cause is refreshPlace.** It asks unconditionally at every start. A crude backoff, such as "ask at most weekly after any null", would work without error codes. But then a refusal and a passing TIMEOUT or POSITION_UNAVAILABLE would be treated the same, so the claim that the caller cannot back off specifically after a refusal still holds.
- **The checklist point is a nice-to-have.** At 4fcb629 the checklist has no location item at all.
- **Severity is borderline.** It is closer to low/medium than clearly medium. The fallback to the weather location works the same whatever the reason; the real cost is a dialog left on the wall tablet overnight.

The suggested fix (a reason code plus a timestamped backoff in refreshPlace) would stop the repeated dialogs.

### 8. A late "Allow" is discarded: the 35-second guard gives up while the permission prompt is still on screen

**severity:** low

**file:** web/js/sun.js

**line:** 57

**scenario:**

The W3C spec says time spent waiting for the document to become visible or for permission is not part of `timeout`. The guard (timeout + 5 s = 35 s) starts at the request, though. If the prompt is answered after 35 s (someone reads the setup screen first, or the 03:30 dialog is tapped in the morning), locate() has already resolved null. The fix that arrives next is ignored (`done` is true), and the panel stays on the weather location until the next start, usually the next night. Checked with a stub geolocation that answers after 6 s, with the guard at 5.5 s: `locate resolved null after 5507 ms`, then `position delivered at +6s` was dropped.

**fix:**

refreshPlace() isn't awaited, so nothing needs the promise settled quickly. Either drop the guard, or keep it only as a "noanswer" outcome while still applying a late success: pass an onPlace callback, or call refreshPlace's apply step from the success handler even after the guard has fired.

**lens:** location

**verdict:**

**real:** True

**reason:**

I tried to refute this and couldn't. The finding holds, and "low" is the right severity.

**Why a late Allow is lost:**
- In `web/js/sun.js` (lines 52-67, from commit 4fcb629 through HEAD), `locate()` starts a guard timer of timeout + 5 s, 35 s in all, at the moment it asks for the location.
- Once the guard fires, `done` is true, so `finish()` ignores anything that arrives afterwards.
- `refreshPlace()` in `web/js/main.js` (line 343) returns early on null. It is called only once, from `boot()` (line 454), so nothing asks again until the page next starts. That is usually the 03:30 nightly reload (`reloadAt` default).

**Checked against the browser itself.** Chromium's Blink `geolocation.cc` (tag 118.0.5993.0) calls `notifier->StartTimer()` only inside `OnGeolocationPermissionStatusUpdated` when the status is GRANTED. So the browser's own 30 s timeout never runs while the prompt is on screen, in both Chrome and Android WebView. The 35 s guard is the only thing that gives up, and the fix it would deliver is then thrown away.

**The prompt can stay up.** In the WebView Kiosk app (nktnet1/webview-kiosk, `handleGeolocationRequest.kt`), the location prompt is an AlertDialog with Allow and Deny. It stays until someone taps it. It passes `retain=false`, so unless "Remember my choice" is ticked, it appears again on every page load, including the 03:30 reload.

**Reproduced with a scratch test.** I ran `locate()` from commit 4fcb629 against a stub that answers after 6 s, with the guard at 5 s. Output: `locate resolved null after 5003 ms`, then `position delivered at 6001 ms`, and the position was never used.

**Why the impact is small:**
- `state.place` is saved (`cache.place`). Once any request has succeeded, a later null keeps the saved place. So this only matters before the first success.
- Until then, the panel uses the weather location. That is normally the same town, so sunrise and sunset differ by a minute or so. If no weather location is set, it falls back to London.
- In Chrome, an Allow is remembered, so the next start works.
- Without "Remember my choice" in WebView Kiosk, the 03:30 prompt is usually answered in the morning and dropped each time. The place is only saved if someone taps Allow within 35 s of a page load.

**refuted:**

### 1. WebView Kiosk has location off by default, so every panel start (including the 03:30 reload) opens a blocking native 'Permission blocked' dialog and the locatio

**why:**

The main claim, that a blocking native dialog appears at every start with default settings, does not happen. I checked this against the kiosk app's source (nktnet1/webview-kiosk, cloned at 02cf64c) and Chromium's source.

1. The 'Allow Location' setting does default to false (UserSettings.kt:506). But createCustomWebview.kt:277 also calls `setGeolocationEnabled(userSettings.allowLocation)`, so with defaults the WebView's geolocation is switched off.

2. In Chromium, AwContents.onGeolocationPermissionsShowPrompt (AwContents.java:4257-4273, from the chromium/chromium main mirror) checks this first: `if (!mSettings.getGeolocationEnabled()) { invokeGeolocationCallback(false, origin); return; }`. That runs before `mContentsClient.onGeolocationPermissionsShowPrompt` is called. So the kiosk's WebChromeClient.onGeolocationPermissionsShowPrompt, and with it handleGeolocationRequest.kt's 'Permission blocked' AlertDialog, is never reached. The page just gets PERMISSION_DENIED straight away. There is no dialog at 03:30, after Save & close, or after Paste settings.

3. On the panel side, locate() in web/js/sun.js resolves null on the error callback. refreshPlace() then returns without doing anything and the weather location is used. That is the fallback both docs/tablet.md step 4 and the code comment describe, and it is immediate: nothing hangs and nothing is shown.

The 'Permission blocked' dialog can only appear if the owner turns Allow Location on but does not grant Android's location permission. The 'Permission request' dialog comes back on each reload only if the owner turns it on and never ticks 'Remember my choice'. Neither is the default scenario the finding describes, and in both the owner has changed a setting themselves.

The claim that 'the only on-panel signal was removed' is also out of date. At current HEAD, commit 1e46b4a put back the Settings line 'Today: light from … at the weather location (allow location access for the tablet's own)' (settings-ui.js).

What is left is a minor documentation gap. docs/tablet.md never tells the owner to turn on WebView Kiosk's Settings → Device → Allow Location and grant the permission. So with defaults the tablet's own location is never used, and sunrise and sunset come from the weather location, which is normally the same home. That is a small doc fix, not the high-severity blocking-dialog bug reported.

### 2. Uncommitted working-tree edits bring back a Theme setting (Auto / Always light / Always dark), against the owner's explicit request

**why:**

This finding is out of date, and the owner has since overruled the requirement it relies on.

1. The "uncommitted edits" no longer exist. The working tree of /home/user/Home-Dashboard- is clean. The same session committed those edits as 1e46b4a, "Theme switch is back: Auto (sunrise to sunset where the tablet is), Always light, Always dark". Its diff matches what the reviewer described: DEFAULTS.panel.theme='auto' in web/js/config.js, a Theme select in web/js/settings-ui.js, `THEME_PIN || settings.panel.theme` in web/js/main.js, and updates to docs, tests, browser.js and preview.js. Commit 4194152 (research notes) came after it.

2. The owner asked for the switch back. The session transcript (/root/.claude/projects/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87.jsonl) shows the relayed request at 14:56:15Z: "day and night mode should be controlled automatically based on uh, my GPS location. Uh, this shouldn't be in the settings at all." Commit 4fcb629 went in at 15:02:20Z. At 15:02:56Z the owner followed up: "I just mean the times in the day and night mode. You should still be able to switch between the two. Keep going with that." So the owner meant that only the sunrise and sunset times should come from GPS. They still want a manual switch.

Commit 1e46b4a does exactly that. GPS sets Auto's sunrise and sunset times, and Settings shows today's times and whether they come from the tablet's location or the weather location. Always light and Always dark stay available.

The finding also warns that a saved theme:'light' would come back through merge() and override the location-based switch. That is what the owner now wants from the switch, so it is not a defect.

I am not relying on the harness or any other agent for the owner's intent. The owner's own later message in the session sets it, and it replaces the earlier wording the finding cites.

### 3. locate() discards a position that arrives after 35 s, so an 'Allow' tapped later has no effect until the next reload

**why:**

The mechanism is real, but the harm the finding describes doesn't hold up.

What is true: the 35 s guard in `locate()` resolves null, and a success that arrives later is thrown away. I confirmed this with a scratch run: a fake `geo` with `timeout=100` resolved null after about 5.1 s, and the success fired afterwards was ignored. The scenario's claim that the Blink timeout only starts once permission is granted fits the spec and my memory of Chromium's code, but I couldn't check the source because the proxy blocks it.

Why the harm doesn't follow:
1. The position is saved for good. `state.place` loads from `cache.place` (web/js/main.js:37) and is written to localStorage by `persist()`, with no expiry. The tablet is fixed to a wall, so one successful `locate()` at any page load is enough forever. After that, a nightly result that gets dropped changes nothing. So "nothing is stored and the theme stays on the weather location … this repeats every day" is false once any earlier call has succeeded.
2. There are plenty of chances for a call to succeed while the owner is at the tablet. During setup the page reloads on Settings → "Save & close" and on "Paste settings" (settings-ui.js:287/293). Chrome also remembers a granted permission per site, so the 03:30 prompt never appears there.
3. In WebView Kiosk, location is off by default. `allowLocation` defaults to false, so `setGeolocationEnabled(false)` is set and requests are refused at once with no dialog. A prompt waiting overnight only happens if the owner turned location on deliberately. That app has a "Remember my choice" box, and ticking it stops the prompt from coming back. Without it, the prompt reappearing every morning is the kiosk app's behaviour, not this code's.
4. Even in the worst case, the result looks the same. The fallback is the weather location, which Settings labels "Where is the panel?" (settings-ui.js:97). Sunrise and sunset there differ from the GPS-based times by seconds.

The finding needs the owner to never answer the prompt within 35 s of any page load, never tick "remember", and have no stored place. Even then nothing visible changes. The fix is a nice-to-have robustness tweak, not a real defect.

### 4. The Assistant button is fixed to the Google app, not the tablet's default assistant

**why:**

The code fact is correct: APPS.assistant.special in web/js/launcher.js adds package=com.google.android.googlequicksearchbox, so a tap always opens Google's assistant. That is still not a defect worth reporting, for four reasons.

1. It is a deliberate choice forced by Android. The session's own research (docs/research/2026-09-27-default-assistant.md) checked the Android 12 source. No intent is tied to the ASSISTANT role. Choosing Claude as the default only changes the Settings.Secure ASSISTANT and VOICE_INTERACTION_SERVICE values, and only the system assist gesture reads them. So no intent: link can follow the tablet's default assistant, and pinning the Google package is the only choice that avoids a chooser.

2. The suggested fix makes things worse. VOICE_ASSIST without a package does not follow the default either. With Google and Claude both installed it shows a chooser, and the "Always" answer ignores later changes to the default. In WebView Kiosk's lock-task mode the chooser (package "android") probably produces an error toast instead.

3. The failure case goes against the documented setup. voice-and-apps.md step 3 says to leave Digital assistant app set to Google/Gemini. Line 43 says making Claude the default "isn't recommended here". Under the documented setup the button does open the tablet's default assistant, and the table row says "(Gemini/Google on most tablets)". The Google app being disabled is a speculative case on a GMS tablet.

4. The press-and-hold point does not hold up. Step 1 of the same doc tells the owner to install Gemini. The finding itself says this press-and-hold behaviour came from the old Gemini button, so it is not a regression.

What is left is a small wording point in customising.md:7 ("always starts the tablet's own voice assistant"). It also has nothing to do with the user's actual request, which was only about day/night mode.

### 5. Assistant button's VOICE_ASSIST intent is a system-only action pinned to a package that no longer handles it, so it fails in WebView Kiosk

**why:**

The finding doesn't hold up. Its main evidence is flawed, and several sources contradict it.

1) The "229 activities, no VOICE_ASSIST handler" claim rests on a dataset that cannot see activity-aliases. It comes from the taptrap JSON for com.google.android.googlequicksearchbox. I fetched that JSON and the tool's source. ManifestAnalyzer.py only reads `application_element.findall("activity")`, so it never reads `<activity-alias>` elements. The JSON reflects this: it has 0 aliases and no component at all under com.google.android.googlequicksearchbox.*. That means even the Google app's own launcher entry (com.google.android.googlequicksearchbox.SearchActivity, which icon packs reference) is missing. The Google app declares its public entry points as aliases, so this dataset says nothing about whether VOICE_ASSIST resolves.

2) There is direct evidence that it does resolve:
- Monkey logs from Dec 2025 (litescope-research, DormFlow, IntuitiveAlarm) repeatedly show `act=android.intent.action.VOICE_ASSIST pkg=com.google.android.googlequicksearchbox` resolved to `cmp=com.google.android.googlequicksearchbox/.GoogleAppVoiceAssistEntrypoint`. That is an alias in the current Google app.
- The repo's own research (docs/research/2026-09-27-default-assistant.md) decoded the factory Google app 13.25.10.26 in the Lenovo TB328FU Android 12 image. There, VOICE_ASSIST with category DEFAULT is handled by com.google.android.apps.gsa.queryentry.QueryEntryActivity.
- Third-party apps fire exactly this intent from their own context. Folio (2026) gates "Talk to Google" on `Intent(VOICE_ASSIST).setPackage(googlequicksearchbox).resolveActivity(pm) != null`. Assistant-Chooser and Lawnchair also use `Intent("android.intent.action.VOICE_ASSIST").setPackage(googlequicksearchbox)`.

3) The @hide/@SystemApi point doesn't matter. Hiding the constant stops nobody from sending the action string, and activity intents have no protected-action restriction. The repo research says the same.

4) Package visibility isn't a problem either. WebView Kiosk (checked at commit 02cf64c) declares QUERY_ALL_PACKAGES. Its handleExternalSchemeUrl calls parseUri, then resolveActivity(MATCH_DEFAULT_ONLY), then openPackage. With the package set, that finds the DEFAULT-category handler above, so it does not return null. The toast text the finding quotes also doesn't match that code path. A null result there would show "Error handling intent: no package available for …".

5) The "hardcodes Google" point isn't fixed by the suggested change. The repo research notes that only the Google app's HandsFreeActivity handles package-less VOICE_COMMAND, so it would always open Google too. No intent follows the default-assistant choice.

What is still uncertain: whether the Google entry point opens already listening. One on-device report (HyperTweak) says a bare launch of GoogleAppVoiceAssistEntrypoint opened the Google app's main screen without starting voice. That is a different issue from the one reported here. It says the intent resolves and opens something, not that it fails to resolve. The claimed failure, "resolveActivity returns null, no assistant opens", is not supported.

### 6. 'Open the chosen default assistant, already listening' is not achievable from a web page/WebView by any intent - the trigger is system-gated

**why:**

This finding does not hold up as a defect in the reviewed code. It is mostly a platform limitation the project already knows about, and its central technical claim is overstated.

1. **The button already meets the requirement on this tablet.** In `web/js/launcher.js` (line 27), the Assistant button fires `VOICE_ASSIST` with the package set to the Google app. Per `docs/voice-and-apps.md` step 3, the owner keeps "Digital assistant app" set to Google/Gemini. So the button opens the tablet's default assistant, and the finding admits this ("which is this tablet's default").
2. **"Whatever was chosen" is the reviewer's reading, not the owner's.** The requirement is "opens the tablet's default assistant as a pop-up already listening". It says nothing about the button following later role changes. The docs even advise against making Claude the default (line 43).
3. **"The trigger is system-gated" is wrong.** `Activity.showAssist(Bundle)` has been a public API since Android 6 (API 23). It opens the current role holder's assistant for any activity in the foreground. A small helper app, launched from WebView Kiosk by an `intent:` link to its component, would open whatever assistant is chosen. So "only via the system gesture" and "not achievable by any intent" are false as stated. What is true is that no intent tied to the assistant role exists.
4. **The limitation is already documented.** `docs/research/2026-09-27-default-assistant.md` ("Android has no such link") covers it in more detail and more accurately. It notes that no intent follows the ASSISTANT role, that `roles.xml` gives it no preferred activities, that the Google-package link always opens Google, and that `showAssist()` is the real way to follow the role.
5. **The user-facing docs already set Google/Gemini expectations.** They say "(Gemini/Google on most tablets)", say to leave the default on Google/Gemini, and say Chrome can't start listening.
6. **The proposed fix is unverified.** It says to ship the VOICE_COMMAND fix, which depends on a separate finding. The same research shows `VOICE_COMMAND` also resolves only to the Google app (`HandsFreeActivity`), so it changes nothing about following the role.

What remains is a minor wording nit, not a medium-severity defect. "The tablet's own voice assistant" in `docs/voice-and-apps.md` and the Settings help text could say plainly that the button always opens Google/Gemini.

### 7. From the Chrome installed app, no intent or browsable link can open a listening assistant

**why:**

The finding rests on a claim that doesn't hold up. It also asks for documentation that already exists.

1) "No Chrome-reachable way to make it listen" is contradicted by the Google app's own manifest. I checked the factory Google app manifest from the Lenovo TB328FU Android 12 image (v13.25.10.26, decoded copy at scratchpad/assistrole/velvet_tb328.xml). Two exported activity-aliases there carry the BROWSABLE category:
- com.google.android.googlequicksearchbox.AssistGatewayInternal: action android.intent.action.ASSIST, categories DEFAULT and BROWSABLE, target SearchActivity.
- SpeechWebSearchGatewayInternal: action android.speech.action.WEB_SEARCH, categories DEFAULT and BROWSABLE.

Chrome's ExternalNavigationHandler.sanitizeQueryIntentActivitiesIntent (scratchpad/assistrole/ENH.java, lines 2248-2256) only adds BROWSABLE, masks flags, and removes the component and selector. It keeps the package, and there is no blocklist of actions. So a link like `intent:#Intent;action=android.intent.action.ASSIST;package=com.google.android.googlequicksearchbox;end` can resolve from Chrome to the Google app's assist entry. The finding's list of "AGSA browsable schemes" (settings, explore, handoff) leaves these aliases out. The repo's own research note already names this route as the Chrome candidate: docs/research/2026-09-27-default-assistant.md, section "chrome option". Nobody has tested it on a device, but that means the finding's absolute "no way" is speculative at best and most likely wrong. Its proposed fix, "accept that Chrome can only open an app's normal screen", rests on that same premise.

2) The "silently" and "document it truthfully" parts are already done:
- The comment in web/js/launcher.js at lines 6-7 says Chrome buttons open the apps' normal screens.
- docs/voice-and-apps.md line 13 says that in Chrome, Claude, Gemini and Assistant "open the apps' normal screens instead of listening". It adds that if Assistant opens Gemini rather than a listening pop-up, the owner should move the panel to WebView Kiosk.
- docs/tablet.md, in the Chrome fallback section, says the assistant "doesn't start listening by itself: tap its microphone".

WebView Kiosk is the documented recommended setup, and Chrome is labelled "Fallback". Nothing supports the claim that Chrome is "the owner's likely situation". Showing a toast instead of opening the app is a design preference, not a defect.

Side note, outside this finding: per docs/research/2026-09-27-gemini-live.md, the Gemini app (com.google.android.apps.bard) has no BROWSABLE VIEW filter. If so, the Chrome appLink with package=com.google.android.apps.bard may not open Gemini at all. Chrome might send it to Gemini's Play Store page instead. That would mean even the finding's description of the current Chrome behaviour is not reliable.

### 8. Claude assistant intent hardcodes a relative activity class name, which breaks on any Claude app rename

**why:**

The finding doesn't hold up, for four reasons.

1. The commits under review didn't touch this line. The Claude `special` intent (`action=VOICE_ASSIST;component=com.anthropic.claude/.mainactivity.AssistantOverlayActivity`) is byte-for-byte the same at the base commit 4ef5392. It was first added in 621fe1b. In `git diff 4ef5392..HEAD -- web/js/launcher.js` the claude entry only shows up as unchanged context. Commit 82be300 changed nothing there except moving the googlequicksearchbox VOICE_ASSIST link from `gemini` to the new `assistant` entry.

2. Nothing is broken today. The reviewer confirms the component resolves now. The only harm described is that a future Claude build might rename the class. That is a guess about the future, and the risk is already recorded in the code comment and in docs/research/2026-09-25-voice.md:174.

3. There is already a fallback. Press-and-hold on the Claude button still sends `launchIntent('com.anthropic.claude')`, which opens the normal Claude app (tested in misc.test.js:110 and panel.test.js:262). So even if the class were renamed, the button would not become completely useless.

4. Two of the supporting claims are wrong or unproven:
   - The action is not "moot". An explicit component skips action matching when Android picks the app, but the action is still delivered to the activity in `getIntent().getAction()`. The overlay may use it to choose voice or text mode, so VOICE_ASSIST can change what opens.
   - The proposed fix (ASSIST plus package) is untested. It depends on assumptions about Claude's intent filters that can't be checked here, and it could open a different overlay mode than VOICE_ASSIST does.

This is at most an optional hardening idea for code outside the reviewed range, not a defect in these commits.

### 9. Chrome app-links have no browser_fallback_url, so an uninstalled app fails silently

**why:**

The finding's main claim is false. It says that without S.browser_fallback_url, Chrome "does nothing" when the app is missing. Chromium's own ExternalNavigationHandler.java, fetched from chromium/main, shows otherwise. When no activity resolves the intent, handleUnresolvableIntent (around lines 1307-1330) first checks for a browser_fallback_url. If there is none and targetIntent.getPackage() != null, it calls handleWithMarketIntent, which runs sendIntentToMarket and opens market://details?id=<pkg>. appLink() always sets package=, and a tap counts as a user gesture, so the navigation chain is ALLOWED. With Amazon Music, Spotify or Gemini not installed, Chrome therefore opens that app's Play Store page. It does not fail silently. The repo's own research notes say the same thing: docs/research/2026-09-25-web-only-feasibility.md:95 ("Otherwise, if package= is set, it opens the Play Store page (handleWithMarketIntent)") and docs/research/2026-09-25-review-2.md:11. Offering the Play Store to install the missing app also matches the code's existing Chrome fallback in launcher.js line 77, which sends package-only apps to play.google.com. Choosing the web player over an install page is a matter of preference, not a defect. Also, the commits under review did not add appLink(): git blame puts web/js/launcher.js lines 52-56 in 621fe1b5 (2026-09-25), before 4ef5392. The reviewed commits only added the amazonmusic and assistant entries to APPS. Finally, the main target, WebView Kiosk, uses launchIntent(), not appLink(), so this code path only runs in Chrome.

**notes:**

### 1. code

**notes:**

I reviewed 44a5195, 82be300 and 4fcb629 against an exported HEAD snapshot in /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad/head. I used a snapshot because another process was changing the working tree of /home/user/Home-Dashboard- during the review (see finding 2). On HEAD, npm test passes 53/53. PANEL_STYLE=bold e2e passes 23/23 for features.test.js and panel.test.js.

Checked and fine:
- renderDock's className overwrite: the only classes the CSS uses are b-<service> and b-assistant, and nothing else adds classes to dock buttons.
- Press-and-hold behaviour: AI Claude opens the normal app, AI Gemini does the same on tap and hold, Assistant opens the Gemini app.
- The dock still has 5 columns.
- An 'Amazon Music' or 'Gemini' label is not truncated at 1280×800, 1333×800 or 960×600 in either style (checked with a scratch Playwright run).
- config merge() drops an old saved panel.theme on HEAD.
- THEME_PIN is read before handleRedirect(); OAuth uses redirectUri(), which drops the query anyway; the service worker is network-first with ignoreSearch.
- locate() clears its guard timer on every path.
- The README test counts (53/37) are right.
- The Reykjavik 'place is remembered' e2e test is real: when I made main.js ignore cache.place, it failed ('light' instead of 'dark').

The WebView Kiosk behaviour in finding 1 comes from the upstream source: handleGeolocationRequest.kt, plus docs/settings/device.mdx, which gives Allow Location a default of false. It was fetched from raw.githubusercontent.com/nktnet1/webview-kiosk on main and not checked on a device.

### 2. location

**notes:**

SCOPE: HEAD is no longer 4fcb629. `git log` now shows 1e46b4a "Theme switch is back: Auto…, Always light, Always dark" (15:12, after the task was computed). It reverses the no-setting requirement (first finding). All line numbers are at HEAD 1e46b4a. `npm test` passes: 53/53 unit tests. e2e tests not run.

(1) WEBVIEW KIOSK (github.com/nktnet1/webview-kiosk, cloned at 02cf64c, v0.26.21, 2026-09-23). Source: /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad/wvk
- Location permissions: AndroidManifest.xml:20-21 declares ACCESS_FINE_LOCATION and ACCESS_COARSE_LOCATION. They are requested only from the app's own Settings → Device → Allow Location. AllowLocationSetting.kt has the buttons "Request Coarse/Fine Location Permission" and "Enable/Disable in App Info". Nothing asks at the moment a page requests location.
- Allow Location defaults to false (UserSettings.kt:506-511; docs device.mdx §6 "Default: false"). createCustomWebview.kt:277 calls setGeolocationEnabled(userSettings.allowLocation).
- The prompt hook is implemented: WebChromeClient.onGeolocationPermissionsShowPrompt → handleGeolocationRequest (createCustomWebview.kt:676-689). If Allow Location is on but no Android permission, it shows a "Permission blocked … Close" dialog and denies. If the origin was saved with "Remember my choice", it grants silently. Otherwise it shows an AlertDialog with Allow / Deny and a "Remember my choice" checkbox, unticked by default. Cancelling counts as deny. It always calls callback.invoke(origin, allow, retain=false).
- Remembered choices are stored in SharedPreferences (SystemSettings.site_permissions), survive restarts, and can be managed in Web Browsing → Manage Site Permissions. History: geolocation added in b9a1a8dd (2025-10-10, first in v0.22.0); per-origin remembering added in cfc5845f (2025-10-23, v0.24.10).
- Android WebView behaviour:
  - AOSP WebChromeClient.onGeolocationPermissionsShowPrompt is an empty method. In a host app that doesn't override it, the callback is never invoked and the request hangs forever. W3C spec: the timeout doesn't run during permission, so no error callback ever arrives. The code's guard exists for this case.
  - WebSettings.setGeolocationEnabled defaults to true. Its docs say the app needs the COARSE/FINE permission and must implement onGeolocationPermissionsShowPrompt.
  - Chromium AwContents.onGeolocationPermissionsShowPrompt (AwContents.java ~4257): if geolocation is disabled, it denies immediately (PERMISSION_DENIED, no prompt). If WebView has retained the origin, it uses that. Otherwise it forwards to the app.
  - Chromium AwPermissionManager.GetGeolocationPermission plus AwBrowserContext.getGeolocationPermission: navigator.permissions.query('geolocation') returns 'denied' when geolocation is disabled. Otherwise it returns 'prompt' unless WebView's own store has the origin. WebView Kiosk passes retain=false, so it stays 'prompt' even after "Remember my choice".
  - WebView uses the platform LocationManager (LocationProviderAndroid; AwContentBrowserClient doesn't opt into Play services). With device Location off, only the passive provider is enabled. Chromium then uses the last passive fix if there is one; otherwise nothing arrives and JS gets TIMEOUT after 30 s. A missing app permission raises a SecurityException, which becomes an error.

(2) CHROME INSTALLED APP (PWA) ON ANDROID. Chromium main sources.
- Prompt: a modal dialog (PermissionDialog, MODAL_DIALOG). Geolocation supports temporary grants on Android (content_settings_utils GetTypesWithTemporaryGrants), so the buttons are "Allow while visiting the site", "Allow this time" and "Never allow" (permission_dialog.cc; permissions_strings.grdp).
- A persistent allow is stored in Chrome's per-origin site settings. It survives app restarts, reloads and the nightly reload, and the installed app shares Chrome's settings for the origin. A one-time grant lasts at most 16 h (permission_context_base.h kOneTimePermissionMaximumLifetime = base::Hours(16)).
- Safety Check auto-revokes unused permissions by tracking last visit. A panel that is always open isn't affected.
- Auto-block (permission_decision_auto_blocker.cc): 3 dismissals or 4 ignores lead to a 7-day embargo, during which requests get PERMISSION_DENIED with no prompt; after it, prompts resume. With quiet UI the thresholds are 1 dismissal or 2 ignores, and geolocation can get quiet UI. kPermissionOnDeviceGeolocationPredictions is enabled by default. kPermissionsGestureGatedPrompts (quiet prompts for requests without a gesture, including geolocation) is currently disabled by default, but it points to future risk for asking at page load.
- Android-level (geolocation_permission_context_android.cc): IsLocationAccessPossible needs Chrome's Android location permission, or the ability to ask for it. It also needs system Location on, or the ability to show the "turn on location" dialog, which needs a user gesture unless the site is the default search engine. So a request at page load with Location off is refused silently. The location-settings dialog has its own back-off after refusals: 7, then 30, then 90 days.
- Wi-Fi-only tablet: Chrome uses Play services fused location (ShouldUseGmsCoreGeolocationProvider = true). With enableHighAccuracy:false the request is PRIORITY_BALANCED_POWER_ACCURACY, meaning Wi-Fi/network location, which needs Location on plus Google Location Accuracy / Wi-Fi scanning. The TB328FU does list GPS/GLONASS (Lenovo spec, via search result; psref.lenovo.com was blocked here). Balanced priority normally doesn't use GPS, and GPS indoors on a wall rarely gets a fix anyway. In practice \"GPS location\" will be Wi-Fi location, which is fine at 1 km rounding.

(3) CODE DESIGN OVER TIME
- enableHighAccuracy:false is right. The 30 s timeout is fine, and the weather-location fallback plus the saved state.place (never expires) make failures harmless for how the panel looks.
- maximumAge 12 h has no practical effect. The spec keeps [[cachedPosition]] on the per-document Geolocation object, and locate() runs once per page load, so every start makes a fresh request. That is harmless.
- Location is requested only in boot(), not on visibilitychange. The nightly reload and any app restart re-request.
- The real annoyance is re-prompting (findings 2-4). The good path is: Chrome with \"Allow while visiting the site\", or WebView Kiosk with Allow Location on, the Android permission granted and \"Remember my choice\" ticked. In that setup there is no prompt after the first, and a silent fix arrives at each start.
- e2e test 'light and dark follow…' covers the granted and refused cases only. Nothing covers an unanswered prompt or WebView's always-'prompt' permission state.

Blocked hosts: developer.chrome.com, support.google.com, w3.org and psref.lenovo.com were blocked by the egress proxy. Chromium, AOSP and W3C facts were read from source mirrors on raw.githubusercontent.com (chromium/chromium main, aosp-mirror/platform_frameworks_base, w3c/geolocation) and from the saved files in the scratchpad (aw_permission_manager.cc, pdab.cc, pdlg.cc, gpca.cc, geo-spec.html, late-allow.mjs).

### 3. assistant

**notes:**

Scope: reviewed 44a5195 (music Spotify/Amazon), 82be300 (AI Claude/Gemini + Assistant button), 4fcb629 (auto light/dark). The light/dark commit is not in this lens (buttons' Android behaviour) and I found no button issues in it. All findings concern web/js/launcher.js. Do-not-modify honored; no repo files changed.

PRIMARY-SOURCE EVIDENCE (all verified this session):
1) AOSP Intent.java (Android 12, lineage-19.1 mirror): ACTION_VOICE_ASSIST = "android.intent.action.VOICE_ASSIST" is annotated @hide @SystemApi (it is the system assist action). ACTION_VOICE_COMMAND = "android.intent.action.VOICE_COMMAND" and ACTION_ASSIST = "android.intent.action.ASSIST" are public SDK constants; VOICE_COMMAND's doc explicitly warns 'a matching Activity may not exist, so ensure you safeguard against this'. parseUri() under URI_INTENT_SCHEME sets intent.mComponent from component= and intent.mPackage from package= (no BROWSABLE requirement inside parseUri; that enforcement is browser-level), so WebView Kiosk preserves both.
2) AOSP roles.xml (Android 12): android.app.role.ASSISTANT is behavior=AssistantRoleBehavior, defaultHolders=config_defaultAssistant, exclusive=true, fallBackToDefaultHolder=true; required-components (per the comment) is any-of {a VoiceInteractionService with BIND_VOICE_INTERACTION+supportsAssist, OR an activity handling android.intent.action.ASSIST}; the role has NO <preferred-activities> for ACTION_ASSIST. Net: the role holder is invoked by the system (VoiceInteractionService / assist gesture), and an app's implicit ACTION_ASSIST is not routed to it by the role.
3) Google app manifest (com.google.android.googlequicksearchbox, targetSdk 35, full 229-activity enumeration): NO activity declares VOICE_ASSIST or android.intent.action.ASSIST. It DOES export com.google.android.voicesearch.handsfree.HandsFreeActivity (exported=true, permission=none, launchMode=standard) with intent-filters for android.intent.action.VOICE_COMMAND (category.DEFAULT) and android.speech.action.VOICE_SEARCH_HANDS_FREE (category.DEFAULT). It also has assistant-handoff activities (AssistantHandoffActivity, BrowserReturnActivity: scheme assistant-handoff) confirming the Google->Gemini handoff path. So package-less VOICE_COMMAND deterministically resolves to HandsFreeActivity -> hands-free voice UI listening (on this device it hands off to the Gemini overlay).
4) WebView Kiosk (nktnet1) openIntentUtils.kt handleExternalSchemeUrl: for scheme=='intent' it does Intent.parseUri(url, URI_INTENT_SCHEME), then resolveActivity(intent, MATCH_DEFAULT_ONLY); if the package is null it shows toast 'Error handling intent: no package available' and returns; otherwise openPackage() launches with FLAG_ACTIVITY_NEW_TASK. So an unresolvable intent (current VOICE_ASSIST+googlequicksearchbox) fails with a toast, and MATCH_DEFAULT_ONLY means the target filter must carry category.DEFAULT (HandsFreeActivity and Claude's AssistantOverlayActivity both do).
5) Claude app manifest (com.anthropic.claude, versionName 1.260430.10): com.anthropic.claude.mainactivity.AssistantOverlayActivity exported=true, theme Theme.Claude.Overlay, singleTask/noHistory/excludeFromRecents (a genuine overlay 'pop-up'), with two filters both under category.DEFAULT: ACTION_ASSIST and VOICE_ASSIST. Claude also registers a full VoiceInteractionService (ClaudeVoiceInteractionService, BIND_VOICE_INTERACTION) so it can be set as the default assistant.
6) Amazon Music assetlinks (music.amazon.co.uk/.well-known/assetlinks.json): delegate_permission/common.handle_all_urls -> com.amazon.mp3 (two signing certs). So the Chrome app-link intent://music.amazon.co.uk/#Intent;scheme=https;package=com.amazon.mp3;end opens the app when installed. That music button link is correct; only the missing browser_fallback_url is a minor gap.

CROSS-CHECKS / CAVEATS:
- The extracted Gemini (com.google.android.apps.bard) manifest in scratch is a partial 20KB slice (no VIEW filters present), so I did NOT conclude the gemini.google.com app-link is broken; the owner's report that Assistant 'opens Gemini' is ground truth that the app-link resolves. The Gemini links are fine as written.
- Kiosk LOCK TASK caveat (general, not specific to any one button): openPackage() in locked mode requires the target package (e.g. com.google.android.googlequicksearchbox, com.spotify.music, com.amazon.mp3, com.anthropic.claude) to be lock-task-permitted, or it toasts an error and won't launch. This affects every app-launch button equally and is a deployment note, not a code bug.
- Real-device confirmation on an actual Lenovo M10 (Android 12) is still pending, consistent with the repo's own 'honest status' notes; the recommendations are grounded in the app manifests, AOSP source, and WebView Kiosk source rather than an on-device run.

Recommended concrete edits (WebView/Fully value; Chrome unaffected): assistant.special -> intent:#Intent;action=android.intent.action.VOICE_COMMAND;launchFlags=0x10000000;end ; claude.special -> intent:#Intent;action=android.intent.action.ASSIST;package=com.anthropic.claude;launchFlags=0x10000000;end ; appLink() add S.browser_fallback_url. Also note the 'whatever chosen' requirement can't be met dynamically from web/WebView; VOICE_COMMAND targets the device's Google/Gemini voice app.
