# Plan: electricity and gas usage from the Fuse app (for the implementing session)

**Status:** agreed with the user on 17 Oct 2026; not started.

**What the user asked for:**
- "Go with yakupafsin if it checks out." It does.
- Include gas and electricity.
- Remove current usage if we can't get live readings. We can't.
- Include today so far.

**Read first:**
- [docs/research/2026-10-17-fuse-api.md](../research/2026-10-17-fuse-api.md): the protocol spec. It is the only source to build from.
- [docs/research/2026-10-15-bright-blank-panel.md](../research/2026-10-15-bright-blank-panel.md): lessons from Bright mode. Never blank without saying why, and a tap always explains.
- `web/js/bright.js` and the Bright parts of `web/js/main.js`, `web/js/ui.js` and `web/js/settings-ui.js`. Fuse mode follows the same patterns.

## Ground rules (must not be broken)

**Secrets**
- Never commit any secret: the Fuse tokens, the Device-Id, the phone number, or anyone's real data.
- They live only in the tablet's localStorage. Never ask the user to paste them in chat.
- Don't commit the user's Cloud project ID either.

**Licence**
- **No code copied** from yakupafsin, simonsolts or LionZXY. Write fresh JavaScript from the protocol facts in the research note. (Issue #13 there is an open AGPL dispute.)
- Credit them as a courtesy in `docs/fuse.md` and at the top of `web/js/fuse.js`: "Fuse API behaviour as documented by yakupafsin/fuse-energy-ha, simonsolts/fuse-homeassistant and LionZXY/FuseEnergyApi; no code copied."

**Behaviour**
- **Never send an SMS by itself.** Only the user's tap on "Send code" may call phoneSignIn. When the session ends, say so and wait.
- **Don't route around the egress proxy** (fuseenergy.com is blocked here). Test against mocks. The real check happens on the tablet.
- **Keep Octopus and Bright modes working exactly as now.** Fuse is a third choice under ⚙ → Electricity → *Usage comes from*.

**Process**
- No build step: plain ES modules, matching the surrounding code's style, comment density and plain-English messages.
- Commit messages end with the attribution lines that the session's system reminder gives. Don't put model names anywhere else in commits, code or docs.
- Push with `git push -u origin claude/lenovo-m10-home-dashboard-wwqe4q`, retrying after 2, 4, 8 and 16 s on network errors. No PR. Never push `parked/octopus-robust-lookup`.
- Before every push, run all of these and get them clean:
  - `npm test`
  - `PANEL_STYLE=bold npm run test:e2e`
  - `PANEL_STYLE=ambient npm run test:e2e`
- Don't end a turn with uncommitted or unpushed work.
- The user prefers proportionate checking: tests plus one quick independent review (one Agent) before the final push.
- Save any new research to `docs/research/` and add it to its README.

## What the user will see (Fuse mode)

The layout stays the same: the big card with the chart, then four tiles.

**1. Big card, "Today so far"**
- **Big figure:** electricity plus gas in £, including both standing charges.
- **Chips:** `⚡ 6.2 kWh` and `🔥 18.4 kWh`, in the fuel colours. Leave out a fuel's chip if it isn't supplied.
- **Sub line 1:**
  - Normally: `readings to 14:30 · Fuse is about an hour behind`.
  - If gas is further behind: `electricity to 14:30, gas to 06:00`.
  - Use "Usage unavailable (tap for why)" instead of the lag wording when the panel's own requests are failing (the Bright lesson).
- **Sub line 2:** `Electricity £1.85 · Gas £1.12`.

**2. Chart, "Usage today · kWh per hour"**
- Two rows, Electricity over Gas, sharing the time axis (00:00–24:00). Each row has its own y-scale and a label, so a 3 kWh gas hour doesn't flatten the electricity bars. Don't use two y-axes in one plot.
- The hour in progress gets a lighter or hatched bar, labelled "so far" in its tap tip.
- Keep the "now" marker, and the "Readings due" box from the newest reading up to now.
- Before today's first reading, show the newest day Fuse has, dated (reuse `dayWords`).
- Tapping a bar gives `Electricity 13:00–14:00 · 0.42 kWh · 11p` (with "so far" for the hour in progress).
- Load the `dataviz` skill before drawing.

**3. Tile 1: "Electricity"** (replaces "Using now"; there is no live figure from Fuse)
- Today's £ and `6.2 kWh today`.
- Extra line: `Yesterday £2.40`.

**4. Tile 3: "Gas"** (replaces "Today so far" / "Yesterday")
- Today's £ and `18.4 kWh today`.
- Extra line: `Yesterday £1.30`.
- If no gas usage has been reported today yet, show `–` with "No gas readings yet today (Fuse sends gas later)", and still show yesterday.

**Other tiles and buttons**
- Car and Indoor are unchanged.
- The Agile-only buttons on the card (average prices, usage by hour) are hidden, as in Bright mode: add `.src-fuse` next to the `.src-bright` rules in both CSS files.

**Status and taps**
These follow Bright's `explainBright` pattern. A tap is never silent while the card is empty or stale.

| State | Card says | Tap says |
|---|---|---|
| Not signed in | "Fuse isn't connected on this panel yet" / "⚙ → Electricity → Send code" | how to connect |
| First request in progress | "Asking Fuse…" | |
| Fuse ended the sign-in (refresh got a 4xx) | "Fuse signed the panel out" / "⚙ → Electricity → Send code to sign in again" | |
| Blocked browser (fetch TypeError) | "Usage unavailable (tap for why)" | "Fuse didn't answer this browser… docs/fuse.md has the free 5-minute relay" |
| HTTP 426 | | "Fuse wants a newer app version: update `FUSE_APP_VERSION` in web/js/fuse.js" |
| HTTP 429 | | "Fuse asked the panel to slow down" (back off at least 15 min) |
| No readings for today yet | Fuse's newest hour, dated | |

## Steps

### Step 1. `web/js/fuse.js`: the client (pure, unit-tested)

**Constants**
- `FUSE_API = 'https://api.fuseenergy.com'`
- `FUSE_WEB = 'https://www.fuseenergy.com'`
- `FUSE_APP_VERSION = '0.5.388'`
- Storage key `wallpanel.fuse.v1` holding `{ deviceId, access, refresh, phone }`.

**`class Fuse { constructor(settings, storage = localStorage) }`**
- `deviceId`: created once with `crypto.randomUUID()` and kept, even across sign-out.
- `get base()` / `get webBase()`:
  - Direct hosts, or the relay from `settings.fuse.proxy`, as `https://name.workers.dev`.
  - Relay layout: `${relay}/api/...` maps to api.fuseenergy.com, and `${relay}/web/api/trpc/phoneSignIn` maps to www.
  - Must be https, and must pass `cspAllows` (copy the check from `Bright.base`).
- `startSignIn(phone)`: the research note's call 1 (INITIAL) then call 2 (phoneSignIn). Returns the flow token.
  - Look through the whole 200 body for tRPC refusals: `errorCode`, `error.code`, `code`, `message`.
  - Map them to plain words. `incorrect_phone_number` → "Fuse doesn't recognise that number". `issue_otp_premature_retry` → "Fuse wants you to wait a few minutes before asking for another code".
- `submitCode(flowToken, code)`: call 3. Returns either `{ done: true }` (tokens saved) or `{ questions, flowToken }` (ADDITIONAL_INFO).
- `answer(flowToken, responses)`: call 4. It can be asked again, so loop until AUTHORIZED.
- `signOut()`: drop the tokens and keep the deviceId.
- `api(path, params)`:
  - Bearer the access token.
  - If the JWT `exp` (base64url-decode the middle part, inside try) is under 60 s away, refresh first.
  - On a 401, refresh once and retry once.
  - Refresh runs single-flight, inside `navigator.locks.request('wallpanel-fuse-refresh', …)` when available. After getting the lock, re-read storage: if the tokens changed, another tab already refreshed.
  - **Save the new pair before using it.**
  - A 4xx from refresh means drop the tokens and throw a `FuseSignedOut` error.
- `premises()`: returns `{ id, name }` from `/api/v2/customer/premises`, the first premises.
- `day(premisesId, ymd)`: returns `parseChart(body, ymd, tz)`.

**`parseChart(body, ymd, tz)`** returns `{ elec: Hour[], gas: Hour[], export: Hour[], current }`, where `Hour = { start, end, kwh, pence, standingP, inProgress }`.
- Count `REALISED` bars only, and drop bars from other days.
- kWh comes from a string.
- Pence is `100 × Σ breakdown[].value.amount`; fall back to `money.amount` only when there is no breakdown.
- `standingP` is the STANDING component.
- `inProgress` means the bar's index equals `current_index`.
- Map each UK hour to UTC ms with the repo's time helpers (`web/js/time.js`).
- **October clock change:** a second hour 1 is the GMT one.
- **Spring forward:** there is no hour 1; accept 23 bars.

**`dayTotals(hours)`** returns `{ kwh, pence, last }`, where `last` is the end of the newest hour with kWh > 0, or of the hour in progress.

**`explainFuseError(e)`** gives plain words for TypeError (blocked), 401/403, 426 and 429, like `explainBrightError`.

**Unit tests:** `web/test/unit/fuse.test.js`, with a fake fetch as in `bright.test.js`. Cover:
- the request order and exact bodies and headers of all four sign-in calls;
- refusals inside a 200;
- invalid code (4xx);
- the ADDITIONAL_INFO loop, with the DATE answer formatted `YYYY-MM-DD`;
- refresh rotation: the new pair saved before the retried call, and the old refresh token never reused;
- refresh on JWT expiry;
- refresh 4xx → signed out, with no SMS sent;
- parseChart:
  - BST and GMT days, 25 Oct 2026 (25 bars), 29 Mar 2026 (23 bars);
  - neighbouring-day padding dropped, FORECASTED ignored;
  - string kWh, breakdown sum versus truncated money;
  - in-progress flag;
- relay mapping and the https/CSP check;
- the password-free rule: no token or phone number in any URL.

### Step 2. Settings and the security policy

**`web/js/config.js`**
- `energy.source` gains `'fuse'`.
- Add `fuse: { phone: '', proxy: '', premisesId: '', premisesName: '' }`.
- Tokens live in `wallpanel.fuse.v1`, never in settings.
- `exportSettings` must not carry the tokens. They rotate, so two browsers would sign each other out. Moving apps means signing in again; say so in the export message and in docs.

**`web/index.html`**
- Add `https://api.fuseenergy.com https://www.fuseenergy.com` to `connect-src`.

**`web/js/settings-ui.js`, Electricity section**
- Third option: `Fuse app: electricity and gas, hourly (about an hour behind)`.
- Fuse fields:
  - Mobile number, then **Send code**, which calls `startSignIn`.
  - Code box, then **Sign in**.
  - When ADDITIONAL_INFO comes back, render Fuse's `questions[]`: `<input type=date>` for `DATE`, text otherwise. Then **Continue**.
  - On success, call `premises()`. Then **save at once** (like Bright's Connect): `s.fuse`, plus `energy.source = 'fuse'`. Show "Fuse connected and saved". Cancel then reloads.
  - **Sign out of Fuse**.
  - Relay URL (only if needed), pointing to docs/fuse.md.
- Errors appear beside the button, in plain words.
- **Checklist line:** "Electricity and gas (Fuse)". Give its state and detail: the newest reading, worked out when shown (as for Bright), or why it failed.

### Step 3. `web/js/main.js`: the data source

- `const fuse = new Fuse(settings); const useFuse = () => settings.energy.source === 'fuse';`
- Turn off the other usage sources in Fuse mode: `rates` and `homemini` (they already check `!useBright()`; extend to "Octopus only"), and `bright` and `brightlive`.
- `source('fuse', refreshFuse, () => (nightNow() ? 30 : 15) * 60e3, { staleAfter: 3 * 3600e3, dataAt: fuseDataAt, enabled: () => useFuse() && fuse.signedIn, clear })`.
- **`refreshFuse()`**
  - Fetch today on every run.
  - Fetch yesterday on the first run, after midnight, and every 2 hours (Fuse revises recent hours).
  - Save the premises ID if it's missing.
  - `state.fuseDays = { [ymd]: parsed }`, cached, keeping only today and yesterday.
- **`fuseView(now)`** returns, for the renderers:
  - today and yesterday totals per fuel;
  - the total £;
  - the newest reading per fuel;
  - the day the chart shows;
  - status;
  - whether the panel is signed in.
- **`explainFuse()`**: the tap texts from the table above.
- `renderAll`:
  - `useFuse() ? ui.renderFuse(refs, fv, now, tz) : …`
  - `renderTiles(…, bv, fv)`.
- Tile, card and chart taps in Fuse mode call `explainFuse()` and `ui.showFuseTip`.
- `nothingSetUp` also checks `settings.fuse.phone`.

### Step 4. `web/js/ui.js`, `web/js/chart.js` and CSS: the look

- `renderFuse(r, v, now, tz)`: adds `.src-fuse`. It draws the card and chart described above.
- `renderFuseTiles(r, v, now, tz)`: the two tiles above.
- `chart.js`: add `renderFuseDay({ elec, gas, now, dayStart, dayEnd, width, height, fs, tz })`. It draws two rows, each with its own y-scale (reuse `kwhStep`), hourly bars, an in-progress style, the now marker, a readings-due box and tap targets (`data-fuel/start/end/kwh/pence/so-far`).
- CSS, in both `bold.css` and `ambient.css`, dark and light:
  - `--use` (electricity) already exists.
  - Add `--gas` (warm amber or orange) with a contrast check against both themes.
  - `.src-fuse` hides the Agile buttons.
  - Style the in-progress bar.
- Check by eye: screenshots at 1280×800, 1333×800 and 960×600 in both styles, with no overflow and no console errors.

### Step 5. Mocks and browser tests

**`web/test/support/mocks.js`:** a Fuse route for both hosts. It checks:
- the `Device-Id` header;
- the `x-fuse-app-version` header on phoneSignIn;
- Bearer tokens that rotate on refresh, where the old refresh token gets a 4xx afterwards.

Chart data is generated from a `usedKwh`-style function per fuel, with REALISED up to `fuseUntil` (default: now minus 40 min, plus a climbing hour in progress), FORECASTED after, and breakdown components with STANDING.

Fail flags:
- `fuse-blocked` (abort, as CORS);
- `fuse-sms-wait` (200 with `issue_otp_premature_retry`);
- `fuse-dob` (ADDITIONAL_INFO);
- `fuse-signed-out` (refresh 4xx);
- `fuse-426`;
- `fuse-no-gas-today`.

Thread the options through `openPanel`.

**`web/test/e2e/fuse.test.js`:**
1. Sign-in in Settings: Send code, code, DOB question, "Fuse connected and saved". Cancel still leaves Fuse working.
2. The card shows today's total £, both chips, both sub lines and the readings time. The two-row chart shows the correct number of bars. The tap tip is right. There is no "Using now" tile; the Electricity and Gas tiles show today and yesterday.
3. Gas not reported yet today: the Gas tile wording, and the card's split readings time.
4. The access token expires mid-run: refreshed once, the retried call succeeds, and the new pair is saved.
5. Fuse signs the panel out: the card wording, the tap, and the checklist. **No SMS call was made.**
6. Blocked browser: the card and tap wording point to docs/fuse.md. With a relay URL set (and allowed by CSP in the test), calls go to the relay.
7. The SMS rate-limit wording appears beside Send code.
8. In Fuse mode, nothing calls Octopus or Bright. Octopus and Bright modes are unchanged (the existing suites still pass).
9. No CSP violations and no console errors.

### Step 6. Docs

**`docs/fuse.md`** (in the style of docs/bright.md):
- What you see, and how far behind it is (about an hour; gas can be a day).
- Set-up: ⚙ → Electricity → Fuse → mobile number → Send code → code → maybe date of birth → done.
- Privacy: the number and the tokens stay on the tablet and go only to Fuse or your own relay.
- Only one browser at a time: signing in elsewhere signs this one out.
- **The relay**, a Cloudflare Worker, about 5 minutes:
  - It forwards `/api/v3/auth`, `/api/v1/auth/refresh`, `/api/v2/customer/premises`, `/api/v1/premises/*/chart` to api.fuseenergy.com, and `/web/api/trpc/phoneSignIn` to www.fuseenergy.com/api/trpc/phoneSignIn. Nothing else (allowlist).
  - It passes `authorization, device-id, content-type, accept, x-fuse-app-version`.
  - It answers OPTIONS, and sets `Access-Control-Allow-Origin: https://anginsemilir.github.io`.
  - After that, the worker's address must be added to `connect-src` in web/index.html. The user can just tell Claude the address and Claude adds it.
- Troubleshooting:
  - Wait-before-new-code.
  - Signed out.
  - "Wants a newer app version": bump `FUSE_APP_VERSION`. Read the current value from the Fuse website's scripts, or from yakupafsin's const.py.
  - Unofficial and can break without notice.
- Credits, as above.

**Also update:**
- `README.md`: a features-table row, and the test counts.
- `web/privacy.html`: a Fuse entry.
- `docs/research/README.md`: index the new notes.

### Step 7. Check, review, publish
1. Run all three suites in both styles; everything passes.
2. Run the new tests against the code from before the change (`git stash` the `web/js` changes) to confirm each fails there.
3. Do one independent review: Agent, general-purpose. Its brief: read the diff and this plan; check token handling (never leaked, never in URLs, rotation safe across tabs), the never-auto-SMS rule, time handling and the wording.
4. Fix what it confirms, re-run the suites, commit, and push.
5. Watch the run: `gh api repos/AnginSemilir/Home-Dashboard-/actions/runs?head_sha=<sha>`. Read logs with `mcp__github__get_job_logs` if it fails.
6. Tell the user in plain words what changed and what to do on the tablet.

### Step 8. On the tablet, with the user (can't be done from the cloud)
1. ⚙ → Electricity → Fuse → mobile number → **Send code**.
   - If it says Fuse didn't answer this browser (CORS), the user sets up the relay from docs/fuse.md and sends Claude the worker's address. Claude adds it to `connect-src` and pushes. Then the user pastes the address into Relay URL.
2. Sign in, answering the date of birth if asked. Check that the card's figures match the Fuse app for today.
3. Confirm what gas really does for this household: hourly, or a day behind. Adjust the wording if needed.
4. Watch over the next days for:
   - how often Fuse ends the session (a new SMS needed);
   - the clock change on **Sun 25 Oct 2026**, which is the first real check of the 25-bar day;
   - any 426 or 429.

## Out of scope (say so if asked)
- **Live watts.** Fuse has no live feed. Live use needs a Glow display or CAD on the meter (about £70), whoever the supplier is. The panel's Bright mode already supports one.
- **Half-hourly bars.** These might come from the 2024 `billing-readings` endpoint, but no 2026 project uses it. Try it only as a later, separate experiment.
- **Export (solar).** It is parsed but not shown.
- **Moving the "when you use electricity" and average-price pop-ups to Fuse data.** These could come later.
