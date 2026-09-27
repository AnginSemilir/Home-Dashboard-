# Review: Spotify controls (security, runtime, docs)

> Current. All confirmed findings were fixed in commits a3a6f73 and 71e4e88.

_Workflow: Adversarially review the Spotify controls commit (security, correctness, UX/docs)_

**confirmed:**

### 1. Copy settings disconnects at once, so pressing it again (for example after the clipboard did not carry over) exports text with no Spotify token and the sign-in 

**severity:** medium

**file:** web/js/settings-ui.js

**line:** 315

**scenario:**

The first Copy settings press in Chrome reads the token with exportSpotify(), puts it into the clipboard (or into the box on fallback), and calls disconnect() at once. In WebView Kiosk, Paste then fails because clipboard.readText() is often refused in WebViews; docs/google.md already expects the clipboard not to carry over. The user goes back to Chrome and taps Copy settings again. Now sp is null, and the new text, which replaces the clipboard or box contents, has no spotifyToken. The kiosk imports settings without Spotify, and Chrome no longer has it either. The user has to Connect Spotify again, which for Google/Facebook-login accounts must be done in Chrome, followed by another careful copy. The same thing happens if anyone at the wall taps Copy settings (docs/tablet.md notes that anyone can open ⚙). Related: Paste settings always replaces this browser's working token with whatever is in the text (line 327), so pasting an older saved copy puts back a token that rotation has revoked, and the next refresh disconnects.

**fix:**

Don't lose the token on a repeat Copy. Keep the moved token for the life of the settings overlay (in memory or sessionStorage) and include it in every later Copy, or disconnect only after an explicit 'I've pasted it in the other app' confirmation. On Paste, avoid replacing a local token that currently works with an imported one without asking, or at least say that the pasted sign-in replaced this browser's.

**lens:** security

**verdict:**

**real:** True

**reason:**

The main mechanism is real, and I confirmed it by running it. In web/js/settings-ui.js (lines 310-316), Copy settings calls exportSpotify() and then calls ctx.spotify.disconnect() right away. That empties localStorage 'wallpanel.spotify.v1'. A second Copy press finds sp === null and writes settings text with no spotifyToken, and that text replaces the clipboard (or the box, when the clipboard is refused). The second message doesn't mention Spotify, so nothing warns the user.

Test: I wrote a scratch Playwright test at /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad/copytwice.test.js. It uses the repo's openPanel with spotify:true and a refused clipboard.writeText. Results:
- First copy: spotifyToken 'sp-rt-1'.
- Second copy: spotifyToken undefined.
- localStorage after both presses: null.

So after two presses, no browser has the refresh token and neither does the copied text. The research this commit is based on (docs/research/2026-09-27-music-controls.md, lines 197 and 624) says to drop Chrome's token after the paste, not at the copy. The code drops it at the copy, and that change is what opens this gap.

Where the finding overreaches:
1. The WebView trigger is weak. The documented flow (docs/tablet.md step 3, docs/google.md 3.5) is to paste into the box by hand. Android's system clipboard carries over between apps, so a refused readText() doesn't lose anything unless the user goes back and presses Copy again. Still, pressing Copy again or redoing the steps is plausible.
2. The impact is recoverable and isn't a security problem. The user reconnects Spotify in Chrome, and Spotify usually approves again without asking, then copies once more. Low severity, not medium.
3. The related Paste claim (an old saved copy replacing a working token) is speculative. The UI says to paste only into the other app, and importSpotify only overwrites when the text actually contains a token.

Verdict: real, but low-severity data loss in the user flow, not a security hole.

### 2. A Spotify callback whose state is no longer in sessionStorage is taken by Google's handler and shown as a Google sign-in failure, and it deletes any pending Goo

**severity:** low

**file:** web/js/main.js

**line:** 529

**scenario:**

spotify.handleRedirect returns null whenever sessionStorage has no Spotify state, without cleaning the URL. google.handleRedirect then treats any ?code= or ?error= as its own. It removes 'wallpanel.oauth.state', cleans the URL, and the toast says 'Google sign-in: sign-in state did not match; please try again' or 'Google sign-in: access_denied'. This happens when the state has already been used or was lost: pressing Back in Chrome returns to accounts.spotify.com/authorize, which redirects again with a new code and the old state; or the kiosk WebView is recreated during Spotify's login, so its sessionStorage is gone. No code is exchanged with the wrong provider, because both handlers check state before exchanging. However, the user who was connecting Spotify sees a Google error, and a Google sign-in that was in progress loses its state.

**fix:**

Mark the Spotify flow in the redirect itself: add a query marker to redirect_uri, which then has to be registered with Spotify, or give Spotify's state a recognisable prefix such as 'sp.' + random. When a callback carries Spotify's marker but its state does not match, Spotify's handler should clean the URL and report 'Spotify: sign-in expired, try again', so Google's handler never sees it. Alternatively, make Google's handler ignore a state that is not in its own digit-dash format.

**lens:** security

**verdict:**

**real:** True

**reason:**

The finding is real. I reproduced it, but the effect is a misleading message, not a security problem.

**Why it happens.** In `web/js/spotify.js` (around line 100), `handleRedirect` returns null whenever sessionStorage has no Spotify state or the state does not match. It returns without cleaning the URL. `main.js:529-530` then calls `google.handleRedirect()`. In `web/js/google.js` (around line 140), that handler treats any `?code` or `?error` as its own. It removes `wallpanel.oauth.state` and cleans the URL. It then returns 'error: sign-in state did not match; please try again' for a code, or 'error: <error>' for an error. `main.js` shows that as the toast "Google sign-in: …".

**Scratch test.** I wrote a Node script that imports the real modules with in-memory storage. The steps were:
- Build a Spotify authorize URL.
- Consume its state with a first callback.
- Put a fake pending Google state in sessionStorage.
- Replay the callback with the same old state and a new code.

Results:
- The Spotify handler returned null.
- The Google handler returned 'error: sign-in state did not match; please try again'.
- `wallpanel.oauth.state` was deleted.
- The same callback with `?error=access_denied` gave the Google error 'access_denied'.

**When a user would hit it.** The scenario is concrete. The panel's `replaceState` only rewrites the callback entry, so after connecting in Chrome, pressing Back returns to Spotify's consent page. If Spotify redirects again, or the user taps Agree again, the callback arrives with the old, already-used state. The docs send some users to Chrome to connect, and Chrome has a Back button. Kiosk use without a Back button is less exposed.

**Limits on impact:**
- No code is sent to the wrong provider, because both handlers check state before exchanging. Google's refresh token and settings are not touched, and Settings does not open.
- The URL is still cleaned, so the code does not stay in the address bar.
- Deleting the pending Google state has little practical effect. That state belongs to a Google sign-in started in the same tab. Since the tab is now arriving from Spotify, that Google sign-in was already abandoned, and Google's own handler clears its state on any callback anyway.

So the real harm is that a user connecting Spotify sees a Google sign-in error. It is correctly rated low and is a UX or attribution problem, not a security vulnerability. The suggested fix is reasonable: give Spotify's state a recognisable prefix, or have Google's handler ignore state that is not in its own digit-dash format.

### 3. A touch tap on the music button opens the Spotify controls and closes them again straight away (ghost click on the backdrop)

**severity:** high

**file:** web/js/ui.js

**line:** 218

**scenario:**

pressable() runs onTap on pointerup (ui.js:43), so launch() calls openMusic() and the full-screen .music-sheet backdrop (z-index 65) appears under the finger. On a touch screen Chromium then sends the compatibility mousedown, mouseup and click events. It hit-tests them after pointerup, so they land on #music itself. The backdrop handler at ui.js:218 (e.target === m.sheet) then calls musicClose(). I checked this with Playwright using hasTouch and locator.tap(): the click went to 'music' and the sheet was closed afterwards. It happened in bold and ambient, at 1280x800, 800x1280 and 1024x600. So on the wall tablet the controls can't be opened by tapping. music.test.js only uses mouse click(), which targets the common ancestor (the button), so the tests pass.

**fix:**

Only close from the backdrop when the gesture also started there. Record downOnBackdrop = e.target === m.sheet in a pointerdown listener on m.sheet, and close on click only when it's true. I tested this patch with a touch tap: the sheet stays open, and a tap on the backdrop still closes it. Another fix is to have pressable() run the tap action from 'click' and ignore that click after a hold. Also add an e2e case with a hasTouch context and btn.tap().

**lens:** behaviour

**verdict:**

**real:** True

**reason:**

Reproduced; I couldn't refute it. pressable() (web/js/ui.js:34-45) runs onTap on 'pointerup'. launch('music') then calls openMusic(), which removes .hidden from the full-screen .music-sheet (id="music", position: fixed, inset: 0, z-index: 65, in both bold.css:466 and ambient.css:547). On a touch tap, Blink runs the tap's compatibility mousedown, mouseup and click hit-test after the pointerup and touchend handlers have run. So those events land on the sheet, and the backdrop handler at ui.js:218 (e.target === m.sheet) calls musicClose().

Scratch runs in the scratchpad reused the repo's openPanel and mocks, with a hasTouch context and spotify: true. Log from btn.tap(): pointerdown, touchstart and pointerup on .d-label (open=false), then touchend with open=true, then mousedown, mouseup and click (pointerType touch), all targeted at #music. The sheet was closed afterwards. This happened in bold and ambient, at 1280x800 and 800x1280, and in bold at 1024x600. A raw CDP Input.dispatchTouchEvent start/end gave the same result.

I also tried CDP Input.synthesizeTapGesture. There the sheet stayed open, but that proves nothing: in headless Chromium this path produced no mouse or click events at all, not even when tapping the backdrop. The mechanism doesn't depend on Playwright. GestureTap is always handled after the touchend and pointerup that come before it, and the tablet's WebView (Chrome 139 per UA.webview) is older than the Chromium 141 used here.

Mouse click() isn't affected, because mouseup is hit-tested before the pointerup handler changes the DOM, so click goes to the button. That is why music.test.js passes.

The proposed fix works. I simulated it by recording pointerdown-on-backdrop and swallowing backdrop clicks that didn't start there. With it, a touch tap on the button keeps the sheet open, a touch tap on the backdrop still closes it, and a mouse click still opens it, in both styles. Severity high is fair, because on the touch-only wall tablet the new controls can't be opened by tapping.

### 4. The 'Spotify sign-in has ended (6 months)' message is never shown when a background poll finds the expiry

**severity:** medium

**file:** web/js/ui.js

**line:** 264

**scenario:**

A poll gets 400 invalid_grant. accessToken() calls setTokens(null) and then throws. source() stores status.spotify.error and calls renderMusic(). Because spotifyReady() is now false, ui.renderMusic returns at line 264, before the musicSay(st.error) at line 281. Settings doesn't show it either: in checklist(), exportSpotify() is now null, so the row shows 'todo · tap Connect Spotify' and never reads status.spotify.error. About 30 s later the backoff run finds enabled() false and sets status to null, so the reason is gone for good. In my test with fail 'spotify-expired', neither the panel nor Settings ever contained 'has ended'. The only visible change is that the music button quietly opens the app instead of the controls. docs/spotify.md promises this message. If the sheet is open when this happens, it stays open with stale content, because the same early return skips it.

**fix:**

Keep a marker when the sign-in ends, for example setTokens({ ended: Date.now() }) instead of removing the tokens, or a separate key. Show it: on a music-button tap, toast the 'sign-in has ended… Connect Spotify again' text, show it on the Settings checklist row, and close the sheet if one is open. Clear the marker when a new connection is made.

**lens:** behaviour

**verdict:**

**real:** True

**reason:**

The finding holds. I confirmed it by reading the code and running a scratch Playwright test against the repo's mocks with fail 'spotify-expired'.

How it happens: when refreshing the token fails with 400 invalid_grant, spotify.js:141-143 deletes the stored tokens (setTokens(null)) and then throws the 'has ended' error. source() in main.js:106-117 saves that error in state.status.spotify and calls render, which here is renderMusic. By then spotifyReady() is false, because spotify.connected needs a refreshToken. So ui.renderMusic returns early at ui.js:264, and the only place the error is shown, musicSay(st.error) at ui.js:281, is never reached. On the next backoff run, enabled() is false, so state.status.spotify is set to null and the error is gone.

The Settings checklist (settings-ui.js:44-45) doesn't show it either. It now sees exportSpotify() as null, so it marks the row 'todo' with 'tap Connect Spotify' and never reads status.spotify.error.

Scratch test results:
1. Poll with the sheet closed: 'has ended' appears nowhere in the page text, the toast, the sheet message or any title attribute. Settings shows 'Spotify controls (optional, needs Premium) · tap Connect Spotify' and 'Not connected.'. Tapping the music button no longer opens the controls.
2. Sheet open, then the access token is expired so the poll refreshes: the sheet stays open with stale content ('Here Comes the Sun', 'Playing on Kitchen speaker') and an empty message line. Pressing Pause then shows "Spotify isn't connected: ⚙ → Spotify → Connect Spotify", not the 'has ended' reason.

docs/spotify.md lists the message '"The Spotify sign-in has ended…" (and ⚙ says Not connected)' in its troubleshooting table, but the panel never shows it for a poll-detected expiry. The existing e2e test (music.test.js:125-132) only checks that the tokens are removed and that Settings says 'Not connected.', so it misses this.

The message can only appear in a narrow case: a user command from an already-open sheet happens to be the call that does the refresh. The softening factor is that Settings still says 'Not connected.', so medium severity is reasonable.

### 5. Rate limits: Retry-After is ignored, QUOTA_EXCEEDED retries every 15 min at most, and opening the controls or pressing a button skips the back-off

**severity:** medium

**file:** web/js/main.js

**line:** 327

**scenario:**

A 429 sets failures to at least 4 in source(), so it retries after 4, 8, 15, 15… minutes. The research note says to honour Retry-After and to back off for hours on QUOTA_EXCEEDED, because 13–18 h cooldowns are reported and the quota is shared across the developer account. fetchJSON never reads headers. Also, openMusic() calls sources.spotify.run() and loadMusicDevices(), and musicCmd() calls run() 800 ms after every command. None of them check failures or nextAt. Test: GET /me/player returning 429 QUOTA_EXCEEDED, then 3 open + Play + close cycles during the back-off. That sent 6 extra GET /me/player, 3 GET /devices and 3 PUT /play. Each one may lengthen the penalty.

**fix:**

In source(), read a longer back-off for QUOTA_EXCEEDED (hours) and Retry-After when available. That means fetchJSON needs to attach res.headers.get('retry-after') to HttpError, if Spotify exposes the header. Add a sources.spotify.runIfDue(), or a 'blockedUntil' check, and use it from openMusic and the post-command re-poll. While blocked, have musicCmd refuse at once with the 'paused for a while' message and send nothing.

**lens:** behaviour

**verdict:**

**real:** True

**reason:**

I tried to refute this and couldn't. The code and a live test both confirm it.

1) The back-off is capped at 15 minutes. In main.js source() (lines 110-121), a 429 sets failures = max(failures, 4). backoffMs in util.js:58 is min(15 min, 30 s * 2^(n-1)). That gives waits of 4, 8, 15, 15... minutes, whatever the reason. Nothing reads error.reason for QUOTA_EXCEEDED, although explainSpotifyError already detects it to choose the message. The research note (docs/research/2026-09-27-music-controls.md, lines 186-187 and 519-520) says to "honour Retry-After" and, on QUOTA_EXCEEDED, "back off for hours ... rather than retrying". The code does neither.

2) Retry-After is never read. fetchJSON (util.js:12-28) builds HttpError from status, message and body only, never from res.headers. One caveat: whether a browser can read Retry-After depends on Spotify exposing it through CORS (Access-Control-Expose-Headers). The finding already hedges on this, so this part of the fix may be moot. That does not affect the rest.

3) Opening the controls and pressing buttons skip the back-off. openMusic() (main.js:327) calls sources.spotify.run(), not the existing runIfDue(), and run() never checks failures or nextAt. It also calls loadMusicDevices() with no guard. musicCmd sends the command straight away and then calls run() again after 800 ms (line 364). Each of these failed runs also adds to failures and resets the timer.

Test I ran: a scratch Playwright test, same harness, PANEL_STYLE=bold. Every api.spotify.com call returned 429 with reason QUOTA_EXCEEDED. I did 3 cycles of open, Play, close. During the back-off the panel sent 6 GET /me/player, 3 GET /me/player/devices and 3 PUT /me/player/play. The pop-up showed "Spotify has paused the panel's access for a while... It will try again later" and still sent the Play command each time. The counts match the finding exactly.

Two limits on the finding: the claim that each extra call may lengthen the penalty is not confirmed (the research note marks the 13-18 h cooldowns as unconfirmed too). Retry-After may not be readable through CORS. Neither undoes the main points: the code ignores guidance written for this feature, and user actions skip the back-off completely.

Note on the repo: I briefly added web/test/e2e/zz-scratch-quota.test.js and deleted it straight after the run. The uncommitted changes now in web/test/e2e/music.test.js and web/test/support/browser.js (a touchscreen test and a `touch` option) are not mine; they have a 16:05 timestamp from another process, and I left them alone.

### 6. Polls every 3 s all day if Spotify keeps reporting 'playing' with progress stuck at the end of the track

**severity:** low

**file:** web/js/main.js

**line:** 311

**scenario:**

musicInterval() returns max(3 s, left + 1.5 s). If GET /me/player keeps returning is_playing:true with progress_ms at or near duration_ms, left stays at about 0. That can happen when a Connect device drops off mid-play, or with a frozen, stale player state. The panel then polls every 3 s whenever it's daytime and visible. That is the ~28,800 calls a day the research warns can trigger QUOTA_EXCEEDED. Mock test with progress 184800 of 185000: 6 GET /me/player in 16 s, against 1 for a mid-track state. Plausible rather than observed against real Spotify.

**fix:**

Only allow the short end-of-track interval once per track. If the next poll returns the same item with the same or a lower progress, fall back to 20–60 s, for example by remembering the last (title, progress) and growing the delay.

**lens:** behaviour

**verdict:**

**real:** True

**reason:**

The code mechanism is confirmed. I couldn't refute it, only put a limit on how often it would happen. In web/js/main.js:305-314, musicInterval() returns max(3 s, min(20 s, left + 1.5 s)) whenever state.music.playing is true. Right after each poll, musicPosition() uses the fresh `at`, so `left` is just duration - progress_ms. Nothing records that the previous poll already came back at the end of the same track, so the "short poll at track end" repeats forever. The comment says it should happen "at the end of each track".

Scratch Playwright run (scratchpad/stuck.test.js, using the repo's own mocks, clock fixed, daytime, sheet closed), counting GET /me/player in 16 s after load:
- progress 184800 of 185000: 5 calls, one every 3 s
- progress 175000: 1 call (every 11.5 s)
- progress 61000: 0 calls (every 20 s)

So only a state stuck within about 1.5 s of the end, or past it, triggers the 3 s loop. A progress value frozen mid-track only gives the normal 20 s rate. That rules out the "frozen progress" half of the scenario unless it happens to freeze in the last 1.5 s.

The "device drops off, state still says playing" half is more believable, but not proven:
- There are public reports of /me/player keeping is_playing:true after a pause or stop (spotify/web-api#821).
- progress_ms appears to be worked out on Spotify's side from the last timestamp. If so, any stale "playing" state would run on to or past duration_ms. musicPosition caps it at the track length, so left=0 and the panel polls every 3 s for as long as Spotify keeps that stale state.

The panel's 429 handling doesn't stop this. backoffMs gives about 4 min after a 429, then the 3 s loop starts again.

I couldn't test against real Spotify (community.spotify.com and the API are blocked here). How long a stale state lasts is unknown, so "all day" is the worst case. This is a real, low-severity weakness that depends on how Spotify behaves. The suggested fix is cheap: allow the short end-of-track re-poll only once per track, then fall back to 20–60 s.

### 7. The music button keeps showing the last song as 'playing' for as long as polls fail (offline, or a 429 quota lock of hours)

**severity:** low

**file:** web/js/main.js

**line:** 567

**scenario:**

The spotify source has no staleAfter, and on errors it keeps state.music. The dock keeps .np and .playing with that title and artist, and nothing on the button signals an error. During a 13–18 h QUOTA_EXCEEDED or a network outage, the panel claims a song is playing long after it stopped. The progress bar stays at the end in the sheet.

**fix:**

Once the extrapolated position passes the duration and the last successful poll is older than a minute or so, or after N failures or any 429, drop the 'playing' state (e.g. show 'Paused ·' or clear np), or add a stale marker to the button.

**lens:** behaviour

**verdict:**

**real:** True

**reason:**

I couldn't refute this one. I confirmed it from the code and by running it. `refreshMusic()` (web/js/main.js:297) sets `state.music = await spotify.player()`. When that call fails it throws before the assignment, so the last good reading stays in place. The `source()` failure branch (main.js:107-113) only updates `state.status.spotify`. The spotify source (main.js:567) has no `staleAfter` and no `dataAt`. Its `clear()` only runs when `enabled()` turns false: a disconnect, or an ended sign-in, which removes the tokens. A network outage or a 429 leaves it connected, so nothing is cleared. `state.music` isn't saved in `persist()`, so only the nightly reload wipes it. `ui.renderMusic` (web/js/ui.js:260-270) sets the dock's `.np` and `.playing` from `m.playing` alone and never reads `st`. `renderDock` only rewrites `className` when the chosen music app changes. The dock button has no status dot, and the CSS adds 'Paused · ' only when `.playing` is absent (bold.css:460, ambient.css:540). So nothing on the button shows an error. I ran a scratch Playwright test using the repo's mocks with `clock: 'install'`. After the first good poll, every api.spotify.com call returned 429 `QUOTA_EXCEEDED`, and I ran the clock forward 12 hours (50 polls, all failing, backing off to 15 min). The dock button still had class `b-music b-spotify np playing has-art`, with label 'Here Comes the Sun' and sub 'The Beatles', and no 'Paused' prefix. When I opened the sheet, the progress read 3:05 / 3:05 (clamped at the end) and the main button still said 'Pause'. The sheet does show 'Spotify has paused the panel's access for a while…' in `.ms-msg`. So the error only appears if someone opens the controls. The research doc (docs/research/2026-09-27-music-controls.md:187 and 520) recommends showing a 'Spotify paused' state on `QUOTA_EXCEEDED`, and the dock doesn't do that. The same thing happens in a network outage, and it can last up to 15 more minutes after the connection comes back because of the backoff. The impact is a misleading display, not a functional break, so low severity fits.

### 8. Token writes aren't compare-and-set: Disconnect or Copy settings can be undone, and a stale refresh can wipe a fresh sign-in

**severity:** low

**file:** web/js/spotify.js

**line:** 138

**scenario:**

The refresh IIFE always writes the new tokens when it finishes, and on invalid_grant it always calls setTokens(null). Reproduced in node. (1) With a refresh in flight, disconnect() runs from Settings Disconnect or from Copy settings: when the refresh lands, connected goes back to true with rt-1. For Copy settings this is worse: the copied rt-0 has been rotated and is dead, so the other browser gets invalid_grant, while this browser is still connected. (2) Two pages share storage and refresh at the same moment: A saves rt-A, B's older token gets invalid_grant, and B wipes rt-A (stored RT becomes null). A reload during an in-flight refresh (the nightly reload, Save & close, Paste) likewise loses the rotated token. All the windows are narrow, since a refresh happens about hourly.

**fix:**

Before writing, re-read storage and only write, or only clear on invalid_grant, if tokens().refreshToken still equals the t.refreshToken the refresh used. If it has changed, return or use the stored tokens instead.

**lens:** behaviour

**verdict:**

**real:** True

**reason:**

The mechanism is real and I reproduced it, but the timing windows are very narrow, so low severity is right. In the reviewed commit (spotify.js is unchanged at HEAD), the refresh in accessToken() captures `t` before its fetch. When the fetch returns, it always calls setTokens({refreshToken: tok.refresh_token || t.refreshToken, ...}) (line 138). On a 400 invalid_grant it always calls setTokens(null) (line 142). Neither path re-reads storage first, and nothing guards across tabs: no BroadcastChannel, storage listener or navigator.locks.

I ran a node script (scratchpad/race.mjs) with an in-memory store and a fake token endpoint that revokes the old refresh token as soon as it rotates. That is what docs/research/2026-09-27-music-controls.md line 194 tells the code to assume. Results:
- **(1) Disconnect during a refresh:** connected goes false, then back to true with rt-1 when the refresh lands. This one does not depend on rotation: without a new token, `|| t.refreshToken` writes rt-0 back.
- **(1b) Copy settings during a refresh:** the copied rt-0 is dead on the server, while this browser stays connected with rt-1. That is the opposite of what the Copy message tells the user.
- **(2) Two Spotify instances on one storage refreshing together:** A gets at-1 and stores rt-1. B gets invalid_grant and wipes storage (stored becomes null) while rt-1 is still valid on the server. If B reads storage after A's write, all is fine.

Caveats:
- **Disconnect and Copy:** the user has to click within the ~0.2 s (at most 20 s on timeout) of a refresh that happens about once an hour.
- **Copy right after connecting:** docs/spotify.md says to connect in Chrome, then copy. Right after sign-in the access token is good for an hour, so the usual flow has no window.
- **Two tabs:** this needs two panel tabs in the same browser storage, which is unusual. The kiosk WebView and Chrome have separate storage.
- **"Stale refresh wipes a fresh sign-in":** this only happens across tabs. Within one page, sign-in is a navigation, and handleRedirect runs before polling starts (main.js 529 vs 567).
- **Reload during a refresh losing the rotated token:** true, but it isn't a compare-and-set problem, and the proposed fix doesn't cover it.

Still, the core defect is concrete. Unconditional token writes can silently undo a Disconnect or the Copy handoff, and in the two-tab case wipe a valid token. The suggested fix is cheap and correct: re-read storage and write, or clear, only if the stored refresh token still equals t.refreshToken.

### 9. The controls pop-up (z-index 65) stays above the night overlay (z-index 60) until the 2-minute auto-close

**severity:** low

**file:** web/css/bold.css

**line:** 466

**scenario:**

At night the overlay appears on the 30 s updateNight tick once lastTouch is more than 90 s old. The sheet closes only when refs.music.touched is more than 120 s old. Depending on where the tick falls, a bright pop-up can sit on top of the black night screen for up to about 30 s. Same stacking in ambient.css:547. It's also still polling, though at 5 min then. In my run the overlap was close to 0 s because of the tick phase, but the ordering allows up to 30 s.

**fix:**

In updateNight(), call closeMusic() when the overlay is shown. Alternatively, give .night a higher z-index than .music-sheet, or use the same idle threshold for both.

**lens:** behaviour

**verdict:**

**real:** True

**reason:**

I tried to refute this and couldn't. It holds at bd2afbb, and nothing after that commit fixes it.

**The code**
- In both style sheets the pop-up (`.music-sheet`) is at z-index 65 and the night screen (`.night`) is at 60. See web/css/bold.css:466 vs 530 and web/css/ambient.css:547 vs 611. They sit side by side in the same root, so the pop-up is drawn on top.
- `updateNight()` (main.js:518) only runs on the 30 s interval. It shows the night screen when `now - lastTouch > 90e3`. It never checks whether the music pop-up is open and never closes it.
- The pop-up only closes on the 1 s tick, once `refs.music.touched` is more than 120 s old (main.js:623).
- Opening the pop-up sets both `lastTouch` and `touched` at about the same moment. So the night screen appears on the first 30 s tick after about 90 s idle, and the pop-up stays above it until about 121 s. That gap ranges from 0 to 30 s depending on where the tick falls.
- Every other overlay stays below the night screen or keeps it away: the full-screen camera is at z-index 40, and night mode waits while the camera is live (`!live`). The pop-up is the odd one out, which points to an oversight rather than a deliberate choice.

**Experiment**
I extracted bd2afbb into the scratchpad and ran a Playwright test with the fake clock at 22:40, Spotify connected. It opens the pop-up and then steps time forward 1 s at a time, checking what is on top at the centre of the screen. I varied when the tap falls relative to the 30 s tick:

| Styles tested | Tap offset | Night screen shown | Pop-up closed | Pop-up above night screen |
|---|---|---|---|---|
| bold and ambient | 2 s | 118 s | 121 s | 3 s |
| bold and ambient | 15 s | 105 s | 121 s | 16 s |
| bold and ambient | 28 s | 92 s | 121 s | 29 s |

In every case the element at screen centre was inside `#music` while `#night` was showing. The computed z-index values were 60 for the night screen and 65 for the pop-up.

**Later commits**
a3a6f73, HEAD, and the uncommitted working-tree edits don't touch this: both style sheets still have z-index 65, and `updateNight` still doesn't close the pop-up.

**One detail in the finding is overstated.** At night the dark theme is active, so the card itself is dark (rgb(19,21,25) in bold). It isn't bright, but its light text and play button still show up clearly on the black night screen. The note about polling is also right: `musicInterval` drops to 5 minutes once the night conditions are met, even with the pop-up open.

It's a real but low-severity visual problem.

### 10. An error line in the pop-up stays after Spotify recovers

**severity:** low

**file:** web/js/ui.js

**line:** 281

**scenario:**

renderMusic sets ms-msg from st.error when the line is empty, but never clears it when the status is ok again. Example: a transient 'Network error' or a 429 'slow down' during one 4 s poll. The next poll succeeds and shows fresh data, but the red error text stays until the sheet is reopened or a button is pressed. Also, openMusic() blanks the line and then renderMusic() writes the previous poll's error back, even though a fresh run() is about to happen.

**fix:**

Track whether the message came from the status, e.g. M.msg.dataset.src = 'status', and clear it in renderMusic when st?.ok. Keep messages from commands as they are.

**lens:** behaviour

**verdict:**

**real:** True

**reason:**

The main claim is real, and I confirmed it in a browser. The second claim is weaker.

**Code at bd2afbb (unchanged at HEAD).**
- `renderMusic` in `web/js/ui.js:291` only writes the status error when the line is empty: `if (st?.error && !M.msg.textContent) musicSay(r, st.error, true);`.
- It has no branch that clears the line when `st.ok`.
- The only places that clear `ms-msg` are `openMusic()` (`ui.js:238`) and `musicCmd` (`main.js` `musicSay(refs, '')`).
- The `source()` wrapper in `main.js` sets `state.status.spotify = {ok:true}` after a good poll and calls `render: renderMusic`. That render leaves the red line in place.

**Browser test.** I wrote a Playwright test in the scratchpad (`stale-msg.test.js`) using the repo's `openPanel` with `spotify: true`, plus an extra route that returns 503 for `GET /me/player` while a flag is on. Steps and results:
1. Opened the pop-up and turned the failure on. After about 4.4 s the line showed "503 Service unavailable" with class `bad`.
2. Turned the failure off and changed the mock's track name.
3. After the 30 s backoff, the next poll succeeded and the title showed the new track ("Fresh Track After Recovery").
4. Five seconds and another 4 s poll later, `.ms-msg` still said "503 Service unavailable" with class `ms-msg bad`, while the card showed fresh data.

**How long it lasts in practice.** The pop-up closes itself 120 s after the last touch on the card. So the stale red line normally lasts up to about 90 s after recovery. It lasts longer if someone keeps touching the card without pressing a button, since the buttons call `musicSay('')`. Low severity is right.

**The `openMusic` claim.** It's true that `openMusic` blanks the line and `renderMusic` then writes the last poll's error back. But at that moment the error is still the latest status, so showing it is arguably correct. It only becomes wrong because of the main bug, when the next run succeeds and the line stays.

The suggested fix is sound: remember that the line came from the status and clear it once `st.ok`.

### 11. If Spotify's sign-in state is missing, the redirect falls through to Google's handler and shows a misleading 'Google sign-in' error

**severity:** low

**file:** web/js/main.js

**line:** 529

**scenario:**

spotify.handleRedirect returns null when sessionStorage has no Spotify state. That happens if the return lands in another tab, or if sessionStorage was cleared. google.handleRedirect then sees ?code=… with no Google state and returns 'error: sign-in state did not match'. The toast reads 'Google sign-in: sign-in state did not match…' after a Spotify connect attempt, and Spotify isn't connected.

**fix:**

Keep the Spotify state and verifier in localStorage with a short expiry, not sessionStorage. Alternatively, use a recognisable state prefix (e.g. 'sp.') so an unmatched Spotify return gets a Spotify-specific message, and Google's handler ignores states it doesn't own.

**lens:** behaviour

**verdict:**

**real:** True

**reason:**

I couldn't refute this. The code path holds, and I reproduced it. At bd2afbb, web/js/main.js lines 529-540 call spotify.handleRedirect first, then google.handleRedirect(). Any non-'signed-in' result from Google becomes the toast `Google sign-in: ${result.slice(7)}`.

- **Spotify side:** Spotify.handleRedirect (web/js/spotify.js) returns null when sessionStorage has no Spotify STATE. It also leaves the URL alone in that case.
- **Google side:** Google.handleRedirect (web/js/google.js) then sees ?code= and finds no 'wallpanel.oauth.state'. It returns 'error: sign-in state did not match; please try again'.

A scratch script (scratchpad/exp.mjs) imports the real modules and chains them the way main.js does. It starts Spotify's authUrl in one session store and returns with ?code=c1&state=<spotify state> into an empty one. The result: spRes=null, gRes='error: sign-in state did not match; please try again', toast 'Google sign-in: sign-in state did not match; please try again', connected=false. No test covers this case. The unit tests only check that Spotify returns null for a foreign state, not what Google does afterwards.

Mitigation: normally the state is there. Connect Spotify uses location.assign in the same tab, and sessionStorage survives same-tab navigation. So this needs an edge case:
- The return lands in a different tab, for example when Spotify's passwordless email-link login opens in a new tab.
- The browser or session restarted during sign-in.
- Back is pressed to the Spotify page after a successful connect, and Spotify redirects again with the already-used state.

Losing the connection in those cases is expected, because the state check is CSRF protection. The actual defect is only the label. A Spotify attempt is reported as a Google sign-in failure, which is confusing, especially for someone who never set up Google. That makes it real but low severity, as reported.

### 12. When the 6-month sign-in ends, the panel goes quiet instead of saying so; the doc promises a message nobody will see

**severity:** medium

**file:** web/js/spotify.js

**line:** 141

**scenario:**

After 6 months, or after access is removed on spotify.com, the refresh returns 400 invalid_grant. accessToken() deletes the tokens (line 142) and throws 'The Spotify sign-in has ended…'. The source records that error, but renderMusic returns at `if (!ready) return` (ui.js:264) because spotifyReady() is now false. On the next run, enabled() is false, so the status and state are cleared (main.js:567). What the owner actually sees: the music button goes back to plain 'Spotify', and a tap now opens the Spotify app instead of the controls. No toast, no red dot, no text anywhere. I checked this with Playwright (fail: spotify-expired, WebView user agent): the page text never contains 'sign-in has ended', and tapping the button navigates to the Spotify launch intent. docs/spotify.md:60 lists 'The Spotify sign-in has ended…' under 'What you see', but that message only appears if a control is tapped at the exact moment the refresh fails.

**fix:**

Keep a small 'ended' marker (for example wallpanel.spotify.v1 = { ended: <date>, reason }) instead of removing everything. While the marker is there and a Client ID is set: (1) a tap on the music button opens the pop-up (or shows a toast) with 'Spotify's sign-in has ended (Spotify ends them after 6 months). ⚙ → Spotify → Connect Spotify'; (2) the checklist shows it as bad ('sign-in ended on 12 March: tap Connect Spotify'), not todo. Add an e2e assertion that the message is visible. Alternatively, change the doc row to describe what actually happens ('the music button just opens Spotify again, and ⚙ says Not connected').

**lens:** docs-ux

**verdict:**

**real:** True

**reason:**

The finding holds. I checked it against the code at bd2afbb and ran it in Playwright on an extracted copy of that commit (bold style).

How it happens:
1. The background source (main.js:567, which polls at least every 60 s and also once at boot) is almost always what triggers the token refresh.
2. The refresh gets a 400 invalid_grant. accessToken() then calls setTokens(null) and throws "The Spotify sign-in has ended…" (spotify.js ~141).
3. source() stores that error in state.status.spotify and calls renderMusic. By then spotifyReady() is false, so ui.renderMusic resets the dock button to the plain label and returns at `if (!ready) return` (ui.js:264). It never reaches musicSay.
4. On the next run, enabled() is false, so the status is set to null.
5. No toast, dot or title shows the error anywhere on the panel.

Playwright results (fail: spotify-expired):
- **Webview user agent, sign-in ending during a poll:** body text never contains "has ended", the toast stays hidden, and the dock button reads "Spotify". Tapping it goes to the Spotify launcher intent (package=com.spotify.music) and the controls don't open.
- **Controls open when a poll finds the ended sign-in:** the controls stay open with the old track, the message line is empty, and the dock reads "Spotify".
- **Access token due and a control tapped at that moment:** this is the only case where "The Spotify sign-in has ended…" appears.

So the message in docs/spotify.md:60's "What you see" column is effectively never shown. The commit's "plain-words errors: … sign-in ended after 6 months" claim is also not met for this case. The existing e2e test ("after the sign-in ends: plain explanations") only checks that the button says "Spotify" and that ⚙ says "Not connected.", so it doesn't catch this.

Mitigation, which is why this is closer to low than medium: the doc row does add "(and ⚙ says *Not connected*)". In Settings, the Spotify section says "Not connected." and the checklist shows the Spotify row as todo with "tap Connect Spotify". So an owner who opens ⚙ can find out what happened, but the panel itself never says so.

### 13. Nothing-playing state makes the biggest button a guaranteed error

**severity:** medium

**file:** web/js/ui.js

**line:** 267

**scenario:**

When GET /me/player returns 204 (no active device), the pop-up shows 'Nothing playing' with the large Play button and Previous/Next all enabled, plus an empty progress track (screenshot sheet-bold-light-960x600-idle.png). With no active device, PUT /me/player/play without a device_id always returns 404 NO_ACTIVE_DEVICE, so the most prominent control always gives a red 'Nothing is ready to play…'. The e2e test 'nothing playing anywhere' encodes this. The owner has to learn that the small chips under 'Play on' are the real action.

**fix:**

In the idle state (m == null): hide the progress row and the transport buttons (or disable them), and make the 'Play on' chips the call to action. Or make Play smart: with exactly one listed device, or a remembered last device, call transfer(id, true) instead of play(). Update the e2e test to match.

**lens:** docs-ux

**verdict:**

**real:** True

**reason:**

The finding holds up. I couldn't refute it; the one weak spot is the word "guaranteed".

Evidence, from bd2afbb and still true at HEAD:
- When `GET /me/player` returns 204, `spotify.player()` gives null, so `m` is null.
- In that state `renderMusic` in `web/js/ui.js` (around lines 263-293) shows "Nothing playing", an empty progress row and enabled buttons. The only line that disables the transport buttons is `for (const b of [M.play, M.prev, M.next]) b.disabled = !!m?.device?.restricted;`, which leaves them enabled when `m` is null.
- It also sets `M.sheet.classList.toggle('idle', !m)`, but no rule in `bold.css` or `ambient.css` uses `.music-sheet.idle`. That looks like an idle style that was planned and never written.
- In `musicCmd` (`main.js`, around lines 334-364), Play calls `spotify.play()` with no `device_id`. With no active device, Spotify returns 404 NO_ACTIVE_DEVICE, shown as the red "Nothing is ready to play. Choose where to play, or open Spotify on the tablet." The research notes (lines 201-204 and 540) say the same: pressing play with nothing running is unreliable.
- The e2e test 'nothing playing anywhere' (`web/test/e2e/music.test.js`, lines 118-131) clicks Play, expects the red message, then uses a 'Kitchen speaker' chip to start music. So this behaviour is built into the test.
- The screenshot `scratchpad/shots/sheet-bold-light-960x600-idle.png` shows the large filled black Play button and the empty progress track in the idle state. The small "Play on" chips sit below the divider.
- The pop-up's own subtitle ("Choose where to play below, or open Spotify") and `docs/spotify.md` line 46 ("choose where to play under Play on") both say the chips are the real action. The most prominent button is effectively a dead end that turns red.

Caveats that soften it but don't refute it:
1. It isn't strictly guaranteed. `state.music` is also null before the first successful player check and after failed checks such as a 429. The run loop only sets it on success. In those cases a device may be active and Play could work, so a fix that hides the controls whenever `m` is null would also hide them in that short window.
2. The error message does tell the user what to do, and it reloads the device list. So the owner isn't stuck, just shown an avoidable error.

Overall this is a real but modest UX defect. It would sit between low and medium; medium is defensible for a panel whose owner has Premium and will use these controls.

### 14. Other real Spotify refusals come through raw: 'Restriction violated', bare 403s

**severity:** low

**file:** web/js/spotify.js

**line:** 48

**scenario:**

Spotify's common player refusal is 403 {error:{message:'Player command failed: Restriction violated', reason:'UNKNOWN'}}. It happens, for example, when you pause something that was already paused from a phone within the last 4 s, or skip during an advert or in a DJ session. I mocked this on /me/player/pause and the pop-up showed '403 Player command failed: Restriction violated' in red. The Aug 2026 community reports also describe dev-mode 403s with no useful body. Over HTTP/2 the statusText is empty, so fetchJSON builds the message '403 ' and the owner sees just '403'.

**fix:**

In explainSpotifyError, map /restriction violated/ to 'Spotify didn't allow that just now (it may already be paused, or this can't be skipped).' Map any other 403 with no recognised message to 'Spotify refused. Check the account is under User Management (docs/spotify.md step 4) and that the app's owner has Premium.' Add unit cases for both.

**lens:** docs-ux

**verdict:**

**real:** True

**reason:**

The finding holds for the main case: Spotify's common "Restriction violated" refusal reaches the owner as raw text. At bd2afbb (spotify.js is unchanged at HEAD), explainSpotifyError (web/js/spotify.js:48-59) only rewrites these: PREMIUM_REQUIRED, NO_ACTIVE_DEVICE, "not registered", VOLUME_CONTROL_DISALLOW and 429. Anything else is returned unchanged. musicCmd (web/js/main.js) then shows describeError(e), which is just e.message, in red through ui.musicSay.

I ran a scratch script that calls the real Spotify.pause() with fetch stubbed:
- A 403 with body {error:{message:'Player command failed: Restriction violated', reason:'UNKNOWN'}} is shown as "403 Player command failed: Restriction violated".
- A 403 with an empty body, or a plain-text body, and an empty statusText (as over HTTP/2) is shown as "403 " (fetchJSON falls back to res.statusText).

The situation is easy to reach. The toggle picks pause or play from the cached state.music.playing, which is polled every 4 s while the controls are open. So pausing something already paused from a phone sends a pause to a paused player, which is the classic Restriction-violated case. The player's actions.disallows is never read, so skip during an advert is not blocked either. The red message also stays after the refresh: renderMusic never clears it.

Nothing in docs/spotify.md, the tests or the research notes mentions Restriction violated. The user says they have Premium, so the Premium mapping won't apply to them and this is the refusal they are most likely to see.

Weaker parts:
- The "Aug 2026 community reports" of 403s with no body are not backed by anything in the repo. The research notes only say that accounts not on the list get 403s, and the usual body for that ("user may not be registered") is already mapped.
- It is only a wording problem (the message is raw, not wrong), so low severity is right.

### 15. A passing error stays in red while the pop-up is open

**severity:** low

**file:** web/js/ui.js

**line:** 281

**scenario:**

renderMusic sets the message from st.error only when the line is empty, and never clears it when a later poll succeeds. One network blip or 502 while the pop-up is open (it polls every 4 s) leaves 'Network error (offline, or the service blocked a browser request)' in red for up to 2 minutes, while the song, progress and buttons underneath are all working again. It reads as still broken.

**fix:**

Remember whether the current message came from the poll status (for example M.msg.dataset.src = 'status'), and clear it in renderMusic when st?.ok. Messages that came from commands stay until the next command.

**lens:** docs-ux

**verdict:**

**real:** True

**reason:**

I couldn't refute this. At bd2afbb, renderMusic (web/js/ui.js around line 291) runs `if (st?.error && !M.msg.textContent) musicSay(r, st.error, true);`. Nothing in renderMusic clears the message when st becomes {ok:true}. The line is cleared only by openMusic, by musicCmd calling musicSay('') when a button is pressed, or by closing the pop-up. The panel closes it by itself after 120 s with no touch (main.js setInterval). spotify.api() retries only on a 401, so a single network failure sets status.spotify.error. HEAD (8467ff3) doesn't change this code; its only ui.js changes are to the tap/close handling.

I ran a scratch Playwright test against a copy of bd2afbb, with the same mocks as the e2e suite. With the pop-up open, I aborted one GET /me/player. The red 'Network error (offline, or the service blocked a browser request)' appeared after about 3.3 s. I then changed the track on the mock. The next polls succeeded: 3 GETs, and the title updated to 'Something Else' in both the pop-up and the dock. The message was still showing, still with the `bad` class, and a screenshot shows it in red under working controls.

One detail in the finding is off. After a failure the source backs off 30 s (backoffMs(1)), so the pop-up does not keep polling every 4 s straight away. That doesn't change the conclusion: once polls succeed again, the stale red line stays until someone presses a button, closes the pop-up, or the 2-minute idle close fires. Low severity, as reported.

### 16. Small wording issues in the docs and privacy page

**severity:** low

**file:** docs/spotify.md

**line:** 66

**scenario:**

Line 66 and privacy.html give the path as 'spotify.com → Account → Apps'. The current path is Account → Security and privacy → Manage apps (spotify.com/account/apps), with a 'Remove access' button. Line 42 says 'Spotify changes it every time it's used'. Spotify's refresh-token doc and the research say a new refresh token may or may not come back, so 'can change' is accurate. Line 38 lists Apple alongside Google and Facebook as login buttons that fail in the kiosk. Only Google and Facebook are sourced (Spotify's android-auth changelog). privacy.html 'Where your data is kept' names Google and Octopus tokens but not that the Spotify sign-in goes only to Spotify, or that the Copy settings text now carries it.

**fix:**

Use 'spotify.com/account/apps (Account → Security and privacy → Manage apps) → Home panel → Remove access'. Change the wording to 'Spotify can replace it when it's used'. Make it 'Google or Facebook (and possibly Apple)'. In privacy.html add '…and the Spotify sign-in only to Spotify. Copy settings includes it, so paste it only into the other app.'

**lens:** docs-ux

**verdict:**

**real:** True

**reason:**

Partly real, and minor. Two of the four points are factual errors. The other two are weak.

I checked the reviewed commit bd2afbb (git show bd2afbb:...). Nothing relevant changed in these lines since then: HEAD's only privacy.html change is an unrelated Pub/Sub line.

Holds up:
1. "Spotify changes it every time it's used" (docs/spotify.md:42, and the same comment at web/js/settings-ui.js:316) is wrong. Spotify's refresh-token doc, cited in the research at docs/research/2026-09-27-music-controls.md:463 and :623, says a new refresh token may or may not come back. The research also cites Music Assistant saying Spotify returns one only when it rotates. The code itself allows for this at web/js/spotify.js:138 (`refreshToken: tok.refresh_token || t.refreshToken`). The practical advice ("only one browser can keep it") is still right, because a rotation revokes the old token. So "can change when it's used" is the accurate wording.
2. The removal path "spotify.com → Account → Apps" (docs/spotify.md:66, web/privacy.html:49) is loose. Current help pages (howtogeek, makeuseof, Spotify community) give Account → Security and privacy → Manage apps (spotify.com/account/apps), with a "Remove Access" button. A user can still find it, but no "Apps" item exists by that name.

Weak or not a defect:
3. Apple: it's true the research only sources Google and Facebook (android-auth changelog, research :624). But web reports on Sign in with Apple inside webviews are mixed, not clearly working. Either way, the doc's workaround (connect in Chrome, then copy) works for an Apple-login user, so the over-claim does no harm.
4. privacy.html "Where your data is kept" already says in general terms: "The panel sends each one only to the service it belongs to". That covers the Spotify token, and Google and Octopus are only examples. The page never mentioned Copy settings for the Google tokens either. The Copy settings section in the app already warns (settings-ui.js:314): "The text contains your keys, so paste it straight into the other app and nowhere else." Adding Spotify would be nice to have, not a fix for an error.

Net: a real but low-severity wording finding. Only items 1 and 2 are worth changing.

**refuted:**

### 1. Token refresh overwrites or wipes the stored sign-in without checking it is still the one it used: Disconnect is undone, and a second tab erases a good token

**why:**

The code does lack a compare-and-set, but the scenarios need timing and setups that the panel's real use almost never produces. The effects are visible and easy to recover from, and nothing here is a security exposure. This is a narrow robustness edge case, not a medium security bug.

What checks out: in web/js/spotify.js, accessToken() reads `t` once. Line 138 writes the refresh result unconditionally, and line 142 clears the token on invalid_grant. `refreshing` only serialises calls within one instance. I reproduced both mechanics in the scratchpad (race.mjs) with a fake fetch that revokes on rotation. Two instances sharing storage left the store at null while rt-1 was live. disconnect() during an in-flight refresh ended with connected=true.

Why it doesn't hold up as stated:

(1) The refresh window is tiny and rare. A refresh runs only when a poll finds the access token within 60 s of its 1-hour expiry, or after a 401. It lasts one round trip, at most the 20 s fetchJSON timeout. Opening settings or tapping Disconnect doesn't start a Spotify call (openSettings never touches the token). So a Disconnect tap has to land by chance in a sub-second window that comes about once an hour.

(2) The Copy-settings version doesn't fit the documented flow. docs/spotify.md says to connect in Chrome and then copy, and right after connecting the access token is fresh for about 59 minutes, so no refresh is in flight. Also, if a refresh finishes between exportSpotify() and disconnect(), the copied rt-0 is stale anyway, and the proposed compare-and-set would not fix that.

(3) Two panel tabs in one browser profile isn't a supported setup. The app is a single kiosk page, and the documented flow leaves Chrome disconnected after Copy. On Android only one tab is visible at a time, and musicInterval polls hidden tabs every 5 minutes (browsers also throttle or freeze them). So two refreshes almost never overlap.

(4) The damage depends on Spotify revoking the old token the instant it rotates, which the research doc (docs/research/2026-09-27-music-controls.md) says is unconfirmed. One report says the old token works once more, and another says custom client IDs get no new refresh token at all. In either case, (a) cannot happen.

(5) The effects are not a security problem. Disconnect only deletes the token locally and never revokes it at Spotify (docs/spotify.md sends people to spotify.com → Apps for that), so bringing the local token back gives no one new access. The panel visibly shows its controls again after Save & close, and the user can tap Disconnect again. The two-tab case just means reconnecting. There is no attacker path.

Hardening with a compare-and-set or navigator.locks would be reasonable, but this is at most a low-severity robustness note.

### 2. The privacy page presents Disconnect Spotify as removing access, but it only forgets the token locally, and copies made by Copy settings stay valid

**why:**

The facts in the finding are right, but the security harm is speculative and the wording can be defended.

What is true: `disconnect()` in web/js/spotify.js only calls `setTokens(null)`, which removes the localStorage entry. Spotify has no revocation call. Google's Sign out does POST to oauth2.googleapis.com/revoke (settings-ui.js around line 214). Copy settings puts the refresh token into the copied JSON as `spotifyToken`.

Why this isn't a real issue:

1. **The wording fits the page.** The privacy page is about what the panel accesses. "Disconnect Spotify" does stop the panel from reaching Spotify, and the Spotify sign-in can only live in one browser, so there is no second copy of the panel still using it. The same section already uses "removing access" in this local sense: its "Everything: clear this site's data" line doesn't revoke Google either. The page also names the account-side option (spotify.com → Account → Apps) in the same line, and docs/spotify.md spells out the difference.

2. **The attack depends on unconfirmed Spotify behaviour.** `importSpotify` stores only the refresh token, so the first API call on the pasted side refreshes straight away. The research says rotation revokes the old token immediately, and older PKCE reports say every refresh returns a new token. If either holds, the clipboard copy stops working the first time the kiosk uses it. The attack needs the opposite: the unconfirmed, conflicting 2026 report that custom client IDs never get a rotated token.

3. **The leftover copy isn't caused by the wording.** It is a secret the owner exported on purpose, and the UI warns "The text contains your keys, so paste it straight into the other app and nowhere else". The same text also holds the Google refresh token and the Octopus key. Rewording the Disconnect line wouldn't make that copy stop working.

4. **The impact is small.** The scopes are only user-read-playback-state, user-read-currently-playing and user-modify-playback-state. Someone would need the owner's clipboard history on the household tablet, and could then only see and control playback.

5. **The message in settings-ui.js makes no claim about the Spotify side.** The "Disconnected." message the fix targets reads in full "Disconnected. Save & close to hide the controls."

At most this is optional doc polish (for example, adding "on this tablet"), not a security defect.

### 3. A lagging or in-flight poll overwrites the optimistic play/pause, so the button shows the wrong state for about 4 s

**why:**

The code works the way the finding says, but the 4 s wrong state it describes only happens under a delay the reviewer assumed, not one anyone measured. In web/js/main.js, musicCmd changes the captured m optimistically, calls renderMusic, then does one sources.spotify.run() 800 ms later. refreshMusic replaces state.music with whatever Spotify returns (`state.music = await spotify.player()`), and with the sheet open musicInterval() puts the next poll 4 s later. So if GET /me/player still says is_playing=true about 0.9–1.1 s after the 204 (800 ms plus the GET's round trip), the button flips back until the next poll. The reviewer's numbers (Play at 247 ms, Pause at 864 ms, Play at 4976 ms) fit that timing.

Why I don't accept it as a bug:
(1) Every harmful case in the finding comes from a mock set to apply the pause 1.5 s after the 204. Nothing measured or cited shows Spotify commonly takes longer than about 1 s to show a command.
(2) The finding misreads docs/research/2026-09-27-music-controls.md (lines 178 and 487). That note says the order in which commands execute is not guaranteed, and recommends updating the UI optimistically and re-polling 0.5–1 s after a command. It does not say state reads commonly lag past that. The code follows the recommendation exactly (800 ms).
(3) Home Assistant's production Spotify integration (homeassistant/components/spotify/media_player.py) does the same thing: after pause, play or next it sleeps AFTER_REQUEST_SLEEP = 1 s, then refreshes once and trusts the result. It doesn't even update optimistically. So one re-poll at about 1 s is the accepted practice for this API, not an oversight.
(4) The in-flight-poll variant doesn't depend on Spotify's delay, but it doesn't give 4 s either. A GET started before the command, say the one openMusic starts, lands within its round trip and shows the old state. The 800 ms re-poll then corrects it, so the wrong state lasts about 1 s. The busy guard only skips the re-poll if another poll is already running at that moment, and that poll was sent at about the same time anyway.
(5) The other examples are weaker. Next/previous has no optimistic change, so a late re-poll only means the old title stays a little longer; the button never points the wrong way. For volume, renderMusic doesn't move the slider while it has focus (`document.activeElement !== M.vol`) or within 1.5 s of a touch, so a stale volume reading usually doesn't snap it back.
(6) When the design shows Spotify's own reading after re-polling, that is deliberate: the comment says "shows the change straight away, then checks with Spotify". The worst outcome is a pause sent to an already-paused player, which Spotify rejects. The panel shows an error and the next poll corrects it; nothing is lost.

So there is a real robustness gap for unusually slow devices, but the medium-severity 4 s claim rests on an assumed delay. I checked this by reading the code, the research note and Home Assistant's source; I did not reproduce the delay against real Spotify.

### 4. Each Spotify poll rewrites the whole panel cache to localStorage (every 4 s with the controls open, every 20 s or less while music plays)

**why:**

The code does what the finding describes, but the claimed harm doesn't hold up. It is a negligible micro-optimisation with no visible effect on behaviour.

What is true: in bd2afbb, source() in web/js/main.js calls persist() after every run (line 118). The 'spotify' source (line 567) uses it too. persist() calls saveCache() (web/js/config.js:91), which runs JSON.stringify and localStorage.setItem on the whole cache with no dedup. refreshMusic only changes state.music, which is not cached, so these writes gain nothing. musicInterval gives 4 s while the sheet is open (it closes itself after 2 min idle). While something plays it gives at most 20 s, and down to 3 s near the end of a track. Before this commit the most frequent writer was homemini, every 30 s or more.

Why it is not a real defect:
(1) Measured cost is tiny. I built a representative cache in scratch/bench.mjs: 96 rate slots, 48 tele slots, 240 demand points, 30 events, 7-day weather, a shopping list and so on. It is about 21 KB and takes about 0.16 ms to stringify in node. A 5–10x slower tablet would spend roughly 1–2 ms every 4–20 s, well under 0.1% of the main thread.
(2) Each poll also runs renderMusic (DOM work), and a 1 s ticker already redraws the clock and the music progress bar. Both cost more than this write.
(3) Chromium batches localStorage writes before they reach disk. To my knowledge there is a default delay of a few seconds and a limit of about 60 commits per hour. I recalled these numbers and did not check them. If that holds, the extra setItem calls don't add flash writes beyond what homemini's 30 s writes already cause.

The finding offers no failure, stall or user-visible effect, only "for no benefit". A persist:false option would be a harmless tidy-up, but this is not a behaviour bug.

### 5. The real 2026 'owner needs Premium' 403 doesn't match, so a raw developer message is shown on every check

**why:**

The mechanics are right, but the harm is overstated and mostly hypothetical for this user.

What I confirmed:
- The 403 body is real. spotipy#1233, spotify_to_tidal#184 and spotDL#2634 all show "Active premium subscription required for the owner of the app. When the subscription status changes, it can take a few hours before requests are allowed again." There is no reason field (spotipy prints "reason: None").
- `/premium required/i` does not match that text. I ran explainSpotifyError on that body from a scratch script. It returns the error unchanged, so the music sheet (renderMusic → musicSay in ui.js) shows it in red as "403 Active premium subscription required for the owner of the app. When the subscription status changes, it can take a few hours before requests are allowed again."
- The .ms-msg CSS doesn't cut it off, so the full sentence shows.

Why it isn't a real defect:
1. It isn't a "raw developer message". It is Spotify's own plain English, and it gives the actual cause (the app owner needs Premium) and the few-hours delay. Only a "403 " prefix is added. Matching `/premium/i`, the fix's first option, would swap it for the existing "Spotify only lets Premium accounts use the controls". That text points to the connected account and loses the delay hint, so it would be worse.
2. The user says they have Spotify Premium. Their own account creates the developer app (step 1), so "the owner of the app" is them. The owner-Premium 403 can then only come from edge cases: Premium lapsing, a plan change, or Spotify-side glitches. Even then, Spotify's text says what is wrong.
3. The docs table row "Connect a Premium account" is tied to a different message, and it never appears for this error, so it can't mislead here. The doc's intro already says "With Spotify Premium" and "The controls need Premium."

Possible polish, not a defect: a troubleshooting row for the owner message, and a note in step 1 that the account creating the app must have Premium.

### 6. Pop-up tap targets are small for a wall panel, and tiny at 960x600

**why:**

The measurements are accurate, but they don't show a defect. I ran a scratch Playwright script (scratchpad/measure.mjs) with openPanel spotify:true, pop-up open, and got the same numbers. Bold at 1280x800: close 39, prev/next 48, play 66, Open Spotify 147x34, chips 169-177 x 37, volume input 29 tall. Bold at 960x600: close 29, prev/next 36, Open Spotify 111x25, chips 28. Ambient is close to both. The conclusion goes further than the evidence.

1. "Tiny at 960x600" compares CSS pixels, not physical size. The layout scales with the screen height (--fs = 1.875vh), so 960x600 is the same layout at 3/4 size. On this project's devices, 960x600 is the same 10.1" screen at a higher pixel ratio: the TB-X306F is 1280x800 at DPR 1.33 (docs/research/2026-09-25-review-2.md:7), or the TB328 with a larger display size. The target TB328 is 1920x1200 at DPR 1.5, which gives 1280x800. Either way the close button is 39 device px at 149 ppi or 58.5 device px at 224 ppi, both about 6.6 mm. So targets, and text, are physically the same size at both viewports. They only get smaller on a physically smaller tablet, which the project doesn't target.

2. At the main 1280x800 size, the pop-up's secondary targets match or beat the panel's existing ones, measured the same way. The gear is 36 (Bold) and 37 (Ambient), the shopping-list + is 38 and 35, and the camera close is about 37 (bold.css:192, 384, 430). The pop-up's close is 39 and 37. The pop-up just follows the house style, so this is an app-wide design preference, not something this commit got wrong.

3. The controls people use most meet the Android guidance. Prev/next are 48 CSS px, which equals 48 dp in Chrome on Android, and play is 66. Everything passes WCAG 2.5.8 with a wide margin, as the finding itself says.

4. The smaller targets all have larger alternatives:
   - Close: a tap anywhere on the large backdrop also closes the pop-up (ui.js:225-229), and it closes by itself after 2 minutes idle (main.js:623).
   - Open Spotify: holding the dock button does the same.
   - Chips: they are 169+ px wide pills.
   - Volume: in Chrome a tap anywhere on the 386 px-wide slider moves it, so thumb size hardly matters.

One true minor point: at 960x600, the pop-up's "Playing on" line (10.7 px), times (10.1 px) and the dock artist line (9.7 px) go below the bold.css header's own "small print never goes below 11px" rule, which other small text keeps with max(11px, ...). It's a nit, not a medium, and physically it's the same size as at 1280x800.

Overall: accurate numbers, overstated conclusion, and consistent with the app's existing design. Not a real medium defect.

### 7. Quota detection depends on the 429 body shape, and the panel keeps retrying through a many-hour cooldown

**why:**

This finding doesn't hold up. Checked against HEAD bd2afbb; the later commits don't touch spotify.js or main.js.

1. **Body shape.** A real quota 429 is detected correctly. A captured response in Waynting/GuessSong's CHANGELOG shows the headers and body verbatim: `HTTP/2 429`, `retry-after: 52531`, `{"error":{"status":429,"message":"Too many requests","reason":"QUOTA_EXCEEDED"}}`. Several other 2026 codebases and notes also read or quote the reason as `error.reason`: Retune, crmne/spotifast, deadair, arhunsaday/spoton, infomiho/cadence (which cites Spotify's 23 Jul 2026 blog post) and aalomrani/it-stings. I ran a scratch test (scratchpad/quota.mjs) calling `explainSpotifyError` with the captured body. It returns "Spotify has paused the panel's access for a while…", the right message. Only the made-up top-level shape `{"reason":"QUOTA_EXCEEDED"}` gives "slow down". The reviewer's only source for that shape is KJ-11/spotify-playlist-curator#6. There it appears in a log line that prints the first 300 characters of the raw response text. Per a fetch of the PR's changed files (the raw diff was blocked here), that PR's own detection code reads `body?.error?.reason`.

2. **Retry-After is never read.** A browser app can't read it. Several independent projects note that api.spotify.com sends no Access-Control-Expose-Headers, so `res.headers.get('Retry-After')` is always null in a browser: ollisulopuisto/spotify-triage, sasha351/trackTackle, roukmoute/spotify-car-kids-remote and Lanthanum89/spotify-stats-app. A static GitHub Pages panel cannot honour it, and `fetchJSON` has no headers to pass on.

3. **Retrying every 4, 8, then 15 minutes.** This is true (`backoffMs` 4→4 min, 5→8 min, then capped at 15 min), but it isn't a defect. The panel can't see the cooldown length, and reported lengths vary a lot: about 6 h (22,633 s), 13.6 h and 14.6 h. A fixed "several hours" or "next morning" pause would often leave the controls dead long after Spotify allows calls again. A 15-minute probe costs about 4 refused GETs an hour, and nothing I found shows that refused calls extend the cooldown. GuessSong reports the window is rolling and that Retry-After resolved to a fixed clock time (19:53 UTC). After that incident GuessSong kept the 15-minute value as its probe interval ("COOLDOWN_PROBE_SECONDS"), so one refused request every 15 minutes re-checks the quota.

4. **The wording.** For the real body, the pop-up says "paused … for a while … It will try again later". docs/spotify.md:62 says "Too many requests in a day / It tries again later by itself". Both are vague but accurate. Adding "for up to a day" would be optional polish, not a bug.

The research note's suggestion ("back off for hours") is a design preference, and its own sources list the cooldown lengths as unconfirmed.

### 8. Setup steps miss 2026 dashboard details a first-time owner will hit

**why:**

The finding doesn't hold up. The doc is accurate, and none of the four gaps leaves an owner stuck. docs/spotify.md is unchanged between bd2afbb and HEAD.

(a) Email verification. Spotify's dashboard does sometimes ask you to verify your email before "Create app" works. It says so itself, with a Verify button. So a first-time owner gets told what to do and doesn't need the doc. It also only happens to accounts whose email isn't verified yet.

(b) Adding your own account. Step 4 already covers this. It says to add "the Spotify account(s) that will be connected on the panel", and that includes your own. The idea that the owner has to add themselves is also doubtful. Home Assistant's current Spotify guide only asks you to add extra accounts under User Management, which suggests the owner is allowed automatically. Either way, following step 4 as written works. If step 4 is skipped, spotify.js shows a message that points back to step 4: "This Spotify account isn't allowed to use your Spotify app yet: add it under User Management…". The troubleshooting table has a matching row.

(c) Email and delay. The doc already asks for each account's name and email, and the dashboard's form asks for the Spotify email address. The 5 to 15 minute delay comes from Spotify community posts in 2021. It is temporary, and the existing troubleshooting row still sends the owner back to the right step.

(d) "INVALID_CLIENT: Invalid client". This would appear if the Client ID were mistyped, but that is an edge case. The doc says to copy the ID, and the settings input trims spaces (settings-ui.js line 74). The message itself names the client as the problem, so the fix is clear without a table row.

Overall these are optional polish suggestions, not a doc defect. Several sub-claims are weakly sourced: the delay rests on community posts only, (b) on one hobby project's guide, and the claim that Google/Facebook accounts "often differ" has no source at all.

### 9. Accessibility: the active speaker isn't announced, the dock button's label hides what it does, and the dialog isn't modal

**why:**

Most of the reported facts are accurate, but the main claim is wrong and the rest is polish with no real impact on this product. Checked at bd2afbb in web/js/ui.js and main.js.

1) Main claim is wrong. The finding says "a screen reader can't tell which one is playing". renderMusic writes a line inside the dialog: `${m.playing ? 'Playing on' : 'On'} ${m.device.name}` (.ms-device). So the dialog reads out "Here Comes the Sun, The Beatles, Playing on Kitchen speaker". music.test.js checks this line (lines 60 and 82: /Playing on Kitchen speaker/, 'Playing on Lenovo TB328FU'). Adding aria-pressed to the chips would only repeat what the dialog already says.

2) The dialog behaviour is as described: no aria-modal, no focus move, no inert, no Escape handler. But this is a touch-only kiosk page on a wall-mounted Lenovo tablet with no keyboard, so Escape and focus-trapping change nothing for the actual user. The finding also doesn't match the rest of the app. `git grep` finds no aria-modal, inert, Escape handling or other role=dialog anywhere in web/. The camera live view (a full-screen overlay) and Settings have none of these either. The music sheet is the only overlay with role=dialog and an aria-label, so it is the most accessible overlay in the app, not a step backwards.

3) The dock button's accessible name is "title artist". That is true: the icon SVGs are aria-hidden and the img has alt=''. But it is the same text a sighted user sees, and the button sits in a fixed dock position. Putting "hold to open Spotify" into an aria-label is not a standard pattern, and nothing in the repo makes screen readers a target: the README and docs never mention accessibility.

4) The one concrete UX nit is real but minor. On an is_restricted active device, Play/Prev/Next are greyed out with no text saying why. Spotify devices that report is_restricted are uncommon. This is a small wording improvement, not a defect.

Overall this is a set of speculative a11y hardening suggestions for a single-owner touch wall panel, and its core factual claim is contradicted by the code and tests.

**notes:**

### 1. security

**notes:**

I reviewed HEAD bd2afbb with a security and token-handling lens and made no repo changes. The only file written is a scratch script, /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad/race.test.mjs. It runs web/js/spotify.js against a fake fetch that revokes on rotation, and it reproduced both parts of finding 1: with two tabs the store ends at null while rt-2 is still live, and after disconnect() an in-flight refresh sets connected back to true.

Checked and found sound:
- PKCE: the verifier is 64 random bytes as base64url (86 characters) with an S256 challenge, which matches the RFC 7636 vector in the tests. State is 16 random bytes. Verifier and state live in sessionStorage and are removed on the first matching callback, so each is used once. A callback is exchanged only when its state matches exactly, which covers CSRF.
- Redirect order: Spotify's handler runs first and cleans the URL synchronously with replaceState before the await, so Google's handler sees an empty location.search and neither flow can exchange the other's code. The only interplay is the misattributed stale callback in finding 3.
- sw.js already skips caching any URL containing 'code='. The page sends no referrer, and no token goes into a URL, log or toast; console.warn prints error bodies, which contain no tokens.
- Tokens: they sit in their own localStorage key, 'wallpanel.spotify.v1'. merge() drops the unknown top-level spotifyToken, so a pasted token never ends up in the settings or back in a later export.
- XSS: every Spotify string (title, artist, device name, error text) goes through textContent or h() text nodes. Device IDs are used only as data-id attributes and in JSON request bodies. safeImg (`^https://[\w.-]+\.(scdn\.co|spotifycdn\.com)/`) can't be tricked with userinfo or with look-alike hosts such as scdn.co.evil. It matches the CSP, and no Spotify URL is used in CSS.
- CSP: connect-src adds only accounts.spotify.com and api.spotify.com. The img-src wildcards (*.scdn.co, *.spotifycdn.com) allow only image loads from Spotify's CDN. That is broader than i.scdn.co, but it gives no script or exfiltration route, so I don't count it as a defect.
- Refresh: a response with no refresh_token keeps the old one. Within one tab only one refresh runs at a time, and concurrent 401 retries join it.

Not reported because the behaviour predates this commit: accessing sessionStorage or localStorage when storage is blocked throws during boot, as Google's handler already did; and Google's error param is shown in a toast without a state check (as text, so it is not XSS).

### 2. behaviour

**notes:**

I ran npm test (59/59 pass) and PANEL_STYLE=bold on web/test/e2e/music.test.js (6/6 pass). The scratch experiments are in /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad (touch.mjs, touch2.mjs, fixcheck.mjs, expired.mjs, races.mjs, vol.mjs, night.mjs, race-disconnect.mjs). No repo files were modified.

Confirmed by experiment:
- Touch tap opens then closes the sheet: Playwright hasTouch, in both styles and at 4 viewports. A fix that only closes when pointerdown started on the backdrop works.
- The sign-in-ended message is never shown.
- 429 back-off is bypassed by opening the sheet and pressing buttons: 6 extra polls, 3 device lists and 3 commands in 3 cycles.
- Optimistic pause flips back at 864 ms and corrects only at about 5 s.
- 3 s polling when progress is stuck at the end: 6 polls in 16 s against 1.
- Token re-written after Disconnect, and wiped by a stale concurrent invalid_grant (node).

Checked and not an issue:
- Volume slider with touch: taps don't focus it, and it follows remote volume changes.
- 204/202 empty bodies: parsePlayer(null) gives null, and commands resolve.
- The enabled() switch after a music-app change: Save & close reloads.
- merge() drops the spotifyToken key, so it isn't saved into settings.
- .hidden uses !important, so the sheet really hides.
- Hold on the music button launches the app, and no tap follows.
- No timer or listener leaks: one debounce timer, and one 800 ms timeout per command.

Notes:
- The frozen Date in openPanel's 'fixed' clock means the 2-minute auto-close and the slider's 1.5 s guard can't be exercised by the existing e2e tests.
- The commit message says polls happen 'at the end of each track', but the code caps it at 20 s while playing (about 3 per minute). That is within the research guidance, so it's not reported as a bug.

### 3. docs-ux

**notes:**

I didn't modify any repo files. All scratch work is in /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad/:
- music-shots.mjs: 64 screenshots and measurements (shots/results.json): bold and ambient × light and dark × 1280x800 and 960x600 × playing, idle, long titles with 5 speakers, and the Premium error.
- fonts.mjs: font sizes, accessibility snapshot and the Escape check.
- expired.mjs: what the owner sees for real Spotify error bodies.
- settings.mjs: the Settings section (shots/settings-spotify.png).
Screenshots worth opening: shots/sheet-bold-light-1280x800-playing.png, sheet-bold-dark-960x600-long.png, sheet-bold-light-960x600-idle.png, owner-not-premium.png.

Tests: npm test passes (59). music.test.js passes in Bold, and in Ambient with the dark theme.

What checks out against Spotify's 2026 behaviour:
- PKCE with no secret. The scopes are the minimum needed.
- The redirect is exactly https://anginsemilir.github.io/Home-Dashboard-/, and Settings shows it.
- Spotify's redirect is handled before Google's and only claims a return whose state matches.
- CSP: connect-src allows accounts and api.spotify.com; img-src allows *.scdn.co and *.spotifycdn.com, and safeImg uses the same hosts.
- Error bodies match the real ones for PREMIUM_REQUIRED ('Player command failed: Premium required'), NO_ACTIVE_DEVICE, VOLUME_CONTROL_DISALLOW and 'Check settings on developer.spotify.com/dashboard, the user may not be registered.'
- invalid_grant and invalid_client on refresh clear the sign-in. Rotated refresh tokens are saved at once, and a response without one keeps the old one.
- Polling is modest: roughly 1.5k–4k calls a day, 4 s only while the pop-up is open, and it closes itself after 2 min.
- The pop-up fits without overflow at both sizes in both styles and themes. Long titles clamp to 2 lines; artist and device names get ellipses. The active speaker is clearly marked in both themes. Error red is legible in light and dark.
- 5 users, 6 months, Premium for commands, the Create app fields, the Web API tick box and the User Management tab name all match current sources.

Sources:
- 'Active premium subscription required for the owner of the app…': github.com/spotipy-dev/spotipy/issues/1233 and github.com/spotify2tidal/spotify_to_tidal/issues/184.
- QUOTA_EXCEEDED: github.com/KJ-11/spotify-playlist-curator/pull/6 and github.com/jamiew/spotify-mcp-cloudflare/issues/2.
- Email verification before Create app, and the ~15-minute delay after adding a user: community.spotify.com threads, seen only in search results.
- Add your own account under User Management: raw.githubusercontent.com/afrugalpenguin/spotdash/main/docs/spotify-setup.md (Sep 2026).
- Manage apps path: howtogeek and makeuseof.
- developer.spotify.com and community.spotify.com were blocked here, so dashboard wording is confirmed only through search results and third-party guides.

Unverified:
- Whether the app owner is automatically allowed without being added to User Management.
- The exact placement of QUOTA_EXCEEDED in the 429 body.
- Whether Apple login fails in WebView.

Optional extras, not raised as findings:
- docs/spotify.md could suggest turning on the tablet Spotify app's Settings → Devices → 'Spotify Connect in background' so the tablet stays under Play on (the research marks this unconfirmed).
- Settings shows 'Disconnect Spotify' even when not connected.
- A network failure during the code exchange toasts 'Spotify: Failed to fetch'; describeError isn't used there.
- The device list isn't refreshed while the pop-up stays open.
- Spotify's design guidelines ask for Spotify attribution (logo) next to its metadata and art. 'Open Spotify' uses a generic note icon. This isn't enforced for a personal dev-mode app.
