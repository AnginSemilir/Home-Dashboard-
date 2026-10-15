# The panel showed no Bright usage while the Bright app had data (15 Oct 2026)

**What happened:** in Bright mode the panel showed "Waiting for Bright…", an empty "Usage today" chart and "–" in the usage and Yesterday tiles, while the Bright app on the phone showed data. The user had pressed Connect on the panel ("Bright connected").

**Done:** two agents worked in parallel. One researched the Glowmarkt API, the API behind Bright. The other reproduced 32 scenarios against the panel in Chromium, using the repo's fake Glowmarkt. The fixes are listed at the end.

## Conclusion

"Waiting for Bright…" appeared only when today **and** yesterday had no rows **and** there was no error. That happens in three ways:

1. **Bright not saved on the panel.** Connect only tested the details; they were kept only by **Save & close**. Connect then Cancel left the source disabled forever, and nothing ever asked Bright. This reproduces the photo exactly (scenario B3).
2. **The first request still in flight.** This lasts at most 20 s, then it times out with an error.
3. **Bright answered with no rows for yesterday or today.** Causes: Bright running more than a day behind (common, see below); an empty answer; the panel reading the wrong one of several electricity resources; or unparseable timestamps. The panel counted that as success, kept a green dot, and never turned amber.

None of these said anything when tapped. Errors (wrong password, a block, a timeout, 4xx/5xx) all showed "Usage unavailable (tap for why)", so the photo ruled them out.

## Glowmarkt API facts (with sources)

### 1. /readings response shape and timestamp units (confirmed)

GET /resource/{id}/readings returns JSON with status ("OK"), name, resourceTypeId, resourceId, classifier, units (e.g. "kWh"), a query object echoing from/to/period, and data. data is an array of [epochSeconds, value] pairs, so timestamps are UNIX seconds, not milliseconds; the spec example is 1549481709. Every independent client multiplies by 1000 or uses fromtimestamp: pyglowmarkt, the Rust glowmarkt crate (data typed (i64, f64), from_unix_timestamp), WBPAI JS (Number(ts)*1000), glowbridge and NJWILKS (2026). The timestamp is the START of the half hour (Glow staff on forum thread 179). Other endpoints differ: /current gives data [[ts, value]] with units W; /last-time and /first-time give data {lastTs|firstTs} in epoch seconds; /catchup gives data {valid: true}; /daily-consumption-log uses ISO strings. bright.js parseReadings (Number(ts)*1000) matches the readings shape.

Sources: https://raw.githubusercontent.com/api-evangelist/hildebrand/main/openapi/hildebrand-resource-api-openapi.yml; https://raw.githubusercontent.com/api-evangelist/hildebrand/main/review.yml; https://raw.githubusercontent.com/cybermaggedon/pyglowmarkt/master/glowmarkt/glowmarkt.py; https://static.crates.io/crates/glowmarkt/glowmarkt-0.6.0.crate (src/api.rs ReadingsResponse, src/lib.rs readings()); https://raw.githubusercontent.com/SMOLYNEUX78/WBPAI/main/backend/glow-api-handler.js; https://raw.githubusercontent.com/NJWILKS/hildebrand-glow-ha/main/custom_components/hildebrand_glow/api.py; https://forum.glowmarkt.com/index.php?p=/discussion/179/home-glow-ihd-cad-bookmark-30m-reading-alignment-against-timestamp (search snippet only)

### 1. nulls=1 and missing data (likely)

Spec: 'When this parameter is set to 1, any missing values from a time series resource will return as null instead of zero.' Without it, periods with no data come back as 0. The API pads the requested window with placeholder rows rather than returning an empty array. Evidence: NJWILKS (Sep 2026) skips 'delayed zero-placeholder days'; jlaflin uses /last-time to avoid importing 'stale future DCC hours'; the Medium/Version 1 client walks back 10-day windows until a window is ALL zeros ('we're out of data'); and a forum user found the nulls parameter showed the meter had stopped. So with nulls=1, a normal DCC delay should give [ts, null] rows, not data: []. The panel then shows 'no readings yet today' / £standing / 0.0 kWh, not 'Waiting for Bright…'.

Sources: https://raw.githubusercontent.com/api-evangelist/hildebrand/main/openapi/hildebrand-resource-api-openapi.yml; https://github.com/NJWILKS/hildebrand-glow-ha/pull/4; https://raw.githubusercontent.com/jlaflin/ha-glowmarkt/main/README.md; https://raw.githubusercontent.com/codingcozy/cozy-coder/main/_posts/2024-06-30-TrackingelectricityusagethroughanAPI.md (mirror of medium.com/version-1/tracking-electricity-usage-via-an-api-d5a8b8d458fd); https://raw.githubusercontent.com/cybermaggedon/pyglowmarkt/master/glowmarkt/glowmarkt.py (comment: nulls=1 gives None instead of zero)

### 1. offset parameter (confirmed)

offset is in minutes, defaults to 0, and has the opposite sign to the UTC offset: the spec says 'BST (UTC+1) you should specify an offset of -60', and New York is +300. Data is stored in UTC. With offset≠0, from/to are read as local wall-clock time and the returned epoch values are shifted wall-clock buckets. jlaflin decodes them that way, and the Rust crate warns 'The Glowmarkt API behaves strangely in the presence of non-UTC timezones'. pyglowmarkt, Rust, NJWILKS and glowbridge all send offset=0 with UTC from/to. bright.js does the same (offset 0, glowTime = UTC ISO without zone), which is the safe choice.

Sources: https://raw.githubusercontent.com/api-evangelist/hildebrand/main/openapi/hildebrand-resource-api-openapi.yml; https://raw.githubusercontent.com/jlaflin/ha-glowmarkt/main/custom_components/glowmarkt/glow_api.py; https://static.crates.io/crates/glowmarkt/glowmarkt-0.6.0.crate (src/lib.rs doc comment on readings()); https://raw.githubusercontent.com/cybermaggedon/pyglowmarkt/master/glowmarkt/glowmarkt.py

### 1. Max range per period and from/to alignment (likely)

Maximum span per call: PT30M 10 days, PT1H 31 days, P1D 31 days, P1W 6 weeks, P1M/P1Y 366 days (Rust max_days_for_period; the 10-day and 31-day limits also appear in search snippets of the 2026 Bright PDF). The format is yyyy-mm-ddThh:mm:ss, and the docs' examples use to=...T23:59:59, but that is not required. Unaligned and even slightly future 'to' values are accepted: WBPAI sends to=now with seconds at PT30M; the Medium client uses now+1 minute; jlaflin's tests use to=10:15:30; Rust passes raw times. No source reports an error or empty result for an unaligned 'to'. When 'to' is exactly on a boundary, a bucket starting AT 'to' can come back; NJWILKS drops it, and bright.js already does (r.start < to). The panel's window (yesterday 00:00 local to now, about 38 h) is well inside 10 days.

Sources: https://static.crates.io/crates/glowmarkt/glowmarkt-0.6.0.crate (src/lib.rs max_days_for_period, split_periods); https://raw.githubusercontent.com/SMOLYNEUX78/WBPAI/main/backend/glow-api-handler.js; https://raw.githubusercontent.com/codingcozy/cozy-coder/main/_posts/2024-06-30-TrackingelectricityusagethroughanAPI.md; https://raw.githubusercontent.com/jlaflin/ha-glowmarkt/main/tests/test_glow_api.py; https://raw.githubusercontent.com/NJWILKS/hildebrand-glow-ha/main/custom_components/hildebrand_glow/api.py; https://docs.glowmarkt.com/GlowmarktAPIDataRetrievalDocumentationIndividualUserForBright.pdf (search snippet only; host blocked)

### 1. A 200 response that carries no readings (likely)

A forum user (thread 569, 2025) found the server cut their query's 'to' back to 2025-10-01T23:59:59 and returned no newer data. A reply blamed a password change or LAPSED CONSENT ('you have to periodically sign in to give consent to have Glow read your meters'). The User System spec has per-MPxN consent renewal and revocation endpoints. A newer client (NJWILKS 2026) treats any readings body whose status != 'OK' as an error rather than as 'no data', which implies a 200 can carry a non-OK status. bright.js ignores both body.status and body.query.to.

Sources: https://forum.glowmarkt.com/index.php?p=%2Fdiscussion%2F569%2Fglowmarkt-api (search snippet only; host blocked); https://raw.githubusercontent.com/api-evangelist/hildebrand/main/review.yml (consentModel); https://raw.githubusercontent.com/NJWILKS/hildebrand-glow-ha/main/custom_components/hildebrand_glow/api.py

### 2. How far behind DCC data runs, and what /catchup does (confirmed)

By default 'the DCC is set to send data once per 24 hours' (Glowmarkt staff, forum thread 144), so same-day PT30M values are often 0 or null unless catchup is used. Spec for /catchup: 'trigger an asynchronous request to get the latest consumption readings from the DCC up to the last complete half hour… make this request once on the change of the half hour (preferably with a random delay of up to 2 minutes)'. Staff say no more than once per 30 minutes. It returns {data:{valid:true}}; valid:false can happen (jlaflin logs it). Best case is about 30 minutes behind (HandyHat README). Real-world reports: 'several hours behind' even with catchup (jlaflin README, 2026); 'often by many hours' and sometimes over a day (HandyHat #335, #311, where 'the entire current day is blank'); previous-day gaps filling in later; multi-day DCC backfills or revisions (glowbridge uses a 7-day revision window and a 1.5 h finalisation lag). The Bright app suffers the same delay (#335).

Sources: https://forum.glowmarkt.com/index.php?p=%2Fdiscussion%2F144%2Fonly-getting-periodic-up-to-date-data (search snippet only); https://raw.githubusercontent.com/api-evangelist/hildebrand/main/openapi/hildebrand-resource-api-openapi.yml; https://raw.githubusercontent.com/HandyHat/ha-hildebrandglow-dcc/main/README.md; https://github.com/HandyHat/ha-hildebrandglow-dcc/issues/335; https://github.com/HandyHat/ha-hildebrandglow-dcc/issues/311; https://raw.githubusercontent.com/jlaflin/ha-glowmarkt/main/README.md; https://raw.githubusercontent.com/jlaflin/ha-glowmarkt/main/custom_components/glowmarkt/history.py; https://raw.githubusercontent.com/BWeesy/gubbins/main/glowbridge/glowbridge.py

### 2. SMETS1 vs SMETS2 (likely)

Bright gives half-hourly data free for SMETS2 and E&A SMETS1 meters after verification (store listing). The HandyHat README says the DCC route covers all SMETS2 and only some SMETS1 meters. The DCC's own SMETS1 documents describe the Trilliant SMETS1 architecture as reaching devices once per day, so day-behind data is expected there. I found no Hildebrand statement on SMETS1 catchup latency.

Sources: https://play.google.com/store/apps/details?id=uk.co.hildebrand.brightionic&hl=en_GB (search snippet); https://raw.githubusercontent.com/HandyHat/ha-hildebrandglow-dcc/main/README.md; https://www.smartdcc.co.uk/media/e3slth4z/conclusion-to-the-dcc-consultation-on-smets1-supporting-requirements-v10.pdf (search snippet)

### 2. Does the app show the same data as the API? (unclear)

The Bright app uses the same platform and the same applicationId (b0f1b774-…, 'published for individual Bright users'). jlaflin says integrations use 'the same underlying Glow data that the Bright app is using'. I found no evidence of a separate app-only data source for DCC-only accounts. But the app shows history going back months, and users report it lagging by a day while integrations see a blank current day (#311). So 'the app shows data' does not prove today's or yesterday's half hours exist. Whether the app calls catchup when opened, or caches data on the phone, is undocumented.

Sources: https://raw.githubusercontent.com/api-evangelist/hildebrand/main/review.yml; https://raw.githubusercontent.com/jlaflin/ha-glowmarkt/main/README.md; https://github.com/HandyHat/ha-hildebrandglow-dcc/issues/311

### 3. Virtual entities and where resources are listed (confirmed)

GET /virtualentity returns an array of VEs {veId, veTypeId, name, ownerId, applicationId, active, resources}. The inline resources hold only {resourceId, resourceTypeId} in the spec and the Rust struct; the Medium example also had 'name', and jlaflin's test fixture has only resourceId. Classifier and baseUnit come only from GET /virtualentity/{id}/resources ('a resource list of the full resource docs'), which pyglowmarkt, HandyHat, NJWILKS and jlaflin all call. bright.js falls back to that call when the inline list has no classifier. The panel's Playwright mock puts classifier inline, so the tests never exercise that fallback. The DCC VE is typically named 'DCC Sourced' (HandyHat sensor names, jlaflin examples). Accounts can hold several VEs: one per site (NJWILKS multi-site), and the Medium author saw several, indexing entities[1].

Sources: https://raw.githubusercontent.com/api-evangelist/hildebrand/main/openapi/hildebrand-virtual-entity-api-openapi.yml; https://static.crates.io/crates/glowmarkt/glowmarkt-0.6.0.crate (src/api.rs VirtualEntity/ResourceInfo); https://raw.githubusercontent.com/jlaflin/ha-glowmarkt/main/tests/test_glow_api.py; https://raw.githubusercontent.com/codingcozy/cozy-coder/main/_posts/2024-06-30-TrackingelectricityusagethroughanAPI.md; https://raw.githubusercontent.com/HandyHat/ha-hildebrandglow-dcc/main/custom_components/hildebrandglow_dcc/sensor.py; https://raw.githubusercontent.com/NJWILKS/hildebrand-glow-ha/main/README.md

### 3. Classifiers, and duplicate electricity.consumption resources (likely)

The exact classifiers are electricity.consumption, electricity.consumption.cost, electricity.export, electricity.import.reactive, electricity.export.reactive, gas.consumption and gas.consumption.cost. A 2026 integration (cjw85/jlaflin ha-glowmarkt, Jul 2026) ranks several electricity.consumption resources within one VE. It prefers names or descriptions containing 'dcc' or 'profile read' (e.g. 'electricity consumption DCC SM profile reads') over 'adhoc electricity consumption', and skips the meter if there is a tie. That implies some accounts list more than one consumption resource, only one of which carries the DCC half-hourly profile (inferred from their fixtures; not confirmed against a live account). bright.js pickResources takes the first match in API order.

Sources: https://raw.githubusercontent.com/api-evangelist/hildebrand/main/review.yml; https://raw.githubusercontent.com/jlaflin/ha-glowmarkt/main/custom_components/glowmarkt/mapping.py; https://raw.githubusercontent.com/jlaflin/ha-glowmarkt/main/tests/test_mapping.py; https://raw.githubusercontent.com/jlaflin/ha-glowmarkt/main/custom_components/glowmarkt/const.py

### 4. CORS (unclear)

No official statement either way. Indirect evidence suggests browsers are allowed. A static browser page (murkle/utils glowmarkt.html, Jun 2023) calls /auth, /virtualentity, /resources, /readings and /current with XMLHttpRequest and the custom token and applicationId headers, which needs a successful preflight. Hildebrand's own web app at glowmarkt.com is cross-origin to api.glowmarkt.com. Other web projects (lfinance Supabase function, WBPAI) call it server-side, which proves nothing. I could not test it: api.glowmarkt.com is refused by the proxy here. A CORS block reaches bright.js as a TypeError, which shows as 'Bright didn't answer this browser', not 'Waiting for Bright…'.

Sources: https://raw.githubusercontent.com/murkle/utils/master/glowmarkt.html; https://github.com/murkle/utils/commits/master/glowmarkt.html; https://raw.githubusercontent.com/jacobsscoots/lfinance/main/supabase/functions/bright-sync-readings/index.ts

### 5. Auth (confirmed)

POST /auth with header applicationId and body {username, password} returns {valid, token (JWT), exp, accountId, name, functionalGroupAccounts, userGroups…}. exp is UNIX SECONDS ('Timestamp of token expiry date', example 1509010921; the Rust crate parses it with time::serde::timestamp). Tokens last 7 days: the PDF is quoted as 'JWT valid for 7 days', and a sample JWT has exp-iat = 604800. Rust models both a valid:false body and an {error:{message}} body, so a 200 with valid:false is possible. pyglowmarkt, jlaflin and glowbridge all check valid/token after a 200. A password change logs out every token (forum thread 76, snippet), which then gives 401 on data calls. bright.js handles all of these: it treats !valid or a missing token as refused, accepts exp in seconds or ms, and renews on 401.

Sources: https://raw.githubusercontent.com/api-evangelist/hildebrand/main/openapi/hildebrand-auth-api-openapi.yml; https://raw.githubusercontent.com/api-evangelist/hildebrand/main/review.yml; https://static.crates.io/crates/glowmarkt/glowmarkt-0.6.0.crate (src/api.rs AuthResponse); https://raw.githubusercontent.com/murkle/utils/master/glowmarkt.html (sample JWT iat 1536134910 / exp 1536739710); https://raw.githubusercontent.com/BWeesy/gubbins/main/glowbridge/glowbridge.py; https://forum.glowmarkt.com/index.php?p=%2Fdiscussion%2F76%2Fgetting-logged-out-of-api (search snippet only)

### 6. Changes in 2025–2026, rate limits, versions (likely)

Still /api/v0-1. The Swagger specs harvested in Jul 2026 are Resource System 1.5.0, Virtual Entity 1.3.0 and User System 1.0.5. The '/v2/' Swagger paths are byte-identical static mounts, not a new API version. The Bright PDF is v1.8 (updated 9 Apr 2026) and the organisation PDF was updated 17 Apr 2026; I could not see their changelogs. Endpoints worth knowing: /resource/{id}/last-time, /first-time, /daily-consumption-log, and per-MPxN consent renewal and revocation. Incidents: on 1 Oct 2025 a price-change event left a subset of customers' DCC schedules stopped until Glow fixed it and backfilled (forum 519); some users were also told to change passwords. No published rate limits. 2026 clients (NJWILKS, glowbridge) handle 429 with Retry-After, and integration authors say not to poll faster than every 5 minutes. Hildebrand's own HA integration (HandyHat) is marked abandoned; maintained 2026 alternatives are jlaflin/cjw85 ha-glowmarkt and NJWILKS hildebrand-glow-ha.

Sources: https://raw.githubusercontent.com/api-evangelist/hildebrand/main/review.yml; https://forum.glowmarkt.com/index.php?p=%2Fdiscussion%2F519%2Fno-data-since-01-00-2-10-2025 (search snippet only); https://raw.githubusercontent.com/NJWILKS/hildebrand-glow-ha/main/custom_components/hildebrand_glow/api.py; https://raw.githubusercontent.com/jonandel/ha-hildebrandglow-dcc/main/README.md; https://raw.githubusercontent.com/jlaflin/ha-glowmarkt/main/CHANGELOG.md

## Ways the panel could get no readings (from the research)

- MOST LIKELY: Bright was never configured on the panel. Settings say source 'bright' but bright.username or bright.password is empty, so enabled() = useBright() && bright.configured is false. source('bright') then sets state.status.bright = null, clears brightSlots, and returns WITHOUT ever calling Glowmarkt (main.js l.302-306, l.857-860). ui.renderBright shows exactly '–' / 'Waiting for Bright…', an empty chart with 'Readings due', 'Using now – Waiting for Bright' and 'Yesterday –', and no error ever appears. This also happens if the user pressed Connect (it writes only to the settings draft) and then left with Cancel or reloaded instead of 'Save & close'. Check: the ⚙ checklist shows 'Electricity usage (Bright)' as todo.
- Glowmarkt answers 200 but with no data rows, and the panel treats that as success. Bright.readings() passes body.data straight to parseReadings, which turns a missing or empty data array into [] silently; it never checks body.status === 'OK' (NJWILKS 2026 treats non-OK as an error) or body.query.to. Known case: with lapsed per-meter consent or verification (for example re-verification after a supplier switch, or the 2025 password-change episode), the server cuts 'to' back to the date access ended (forum thread 569: 'to date squashed to 2025-10-01T23:59:59'). Our from=yesterday 00:00 is then later than the cut-back 'to', so no rows come back, while the phone app still shows older history. Result: status ok, green dot, checklist ✓, and 'Waiting for Bright…' forever.
- With no readings the panel can never go amber. The 'bright' source's staleCheck uses dataAt?.() ?? lastOk. brightDataAt() returns null when there are no readings, so it falls back to lastOk and a 200-with-nothing never turns stale or amber. renderBright also shows the same 'Waiting for Bright…' for 'not set up' (status null), 'first run in progress' (undefined) and 'answered with nothing' (ok), so the user can't tell them apart on the main screen.
- Wrong resource chosen. pickResources()/discover() takes the FIRST VE and the FIRST resource whose classifier is 'electricity.consumption', in API order. 2026 accounts can list duplicates within one VE, e.g. 'adhoc electricity consumption' next to 'electricity consumption DCC SM profile reads' (cjw85/jlaflin ha-glowmarkt rank these and prefer 'dcc'/'profile read'). Accounts can also have several VEs (multi-site, or a Glow CAD VE). If the panel locks onto a non-DCC or empty resource, it caches it in settings.bright.discovered for 24 h (ensureBrightFound) and keeps reading it. If that resource answers with no rows, the screen is exactly the reported one; if it answers with null rows, the card shows '£0.47' or '0.0 kWh' with 'no readings yet today' instead. A fix would rank by resource name/description ('DCC', 'profile read') and log which resourceId and name was chosen.
- Normal DCC delay explains a blank TODAY, but not a blank YESTERDAY, and not '–'. Without catchup the DCC delivers once per 24 h; even with catchup, data can lag several hours to over a day (HandyHat #311/#335, jlaflin README). bright.js asks for nulls=1, which per the spec pads missing slots with null rows, so a delay should render 'no readings yet today', a '£' standing charge or 0.0 kWh, and a Yesterday value. The reported screen ('–', Yesterday '–') therefore points to cases 1–4 above, not lag. Small exception: if Glowmarkt ever omits padding for a resource with no data at all, lag of more than a day would look the same.
- The tests don't use the real response shape. The Playwright mock (web/test/support/mocks.js) returns classifier inline in GET /virtualentity and a readings body without status or query. The real API lists only {resourceId, resourceTypeId} (perhaps name) inline, so production always takes the per-VE GET /virtualentity/{id}/resources path, which no test covers. Real bodies also carry status/query/units that the panel ignores. A regression in the fallback or in body handling would not be caught.
- Minor, ruled out as the cause. Unaligned 'to' (e.g. 13:17:33) is accepted by Glowmarkt; several clients send now-with-seconds or now+1 min. Timestamps are seconds, and parseReadings multiplies by 1000 correctly; an ms/s mix-up would empty the slots, but no client or spec shows ms for readings. exp is in seconds, and token() handles both units. CORS or network failures surface as an error ('Bright didn't answer this browser'), and 401/429 also surface as errors, so none of these can produce 'Waiting for Bright…'.
- Diagnosis to suggest to the user. (1) Open ⚙ and read the 'Electricity usage (Bright)' line: todo means type the email and password, press Connect, then 'Save & close'; ✓ means Bright answered but returned nothing. (2) In the Bright app, confirm that yesterday's and today's half-hour bars exist (not just older history), and that verification or consent hasn't lapsed since the Octopus to Fuse switch. (3) If it's ✓, look at the browser devtools for the readings call: compare response.query.to, response.status and data length, and check which resourceId and name was picked.

## Reproduction (Chromium, the repo's fake Glowmarkt, now = Thu 15 Oct 2026 14:17)

| Scenario | Matches the photo | ⚙ checklist | Tap |
|---|---|---|---|
| A control: healthy Bright | no | ✓ Electricity usage (Bright) · 26.64p a kWh + 47.35p a day / ○ Live usage (Glow display) · optional: needs a Glow display/CAD; note 'Connected: meter found (half-hourly readings; live usage needs a Glow display).' | nothing on card, chart or either tile |
| B1 Bright email and password not in the panel (bright.configured false) | yes | ○ Electricity usage (Bright) · 26.64p a kWh + 47.35p a day / ○ Live usage (Glow display) · optional: needs a Glow display/CAD; Bright note 'Not connected yet.' | nothing on card, chart or either tile (status.bright is null) |
| B2 email typed, password empty | yes | ○ Electricity usage (Bright) · 26.64p a kWh + 47.35p a day / ○ Live usage (Glow display) · optional…; 'Not connected yet.' | nothing |
| B3 typed email+password, pressed Connect ('Bright connected'), then Cancel instead of Save & close | yes | ○ Electricity usage (Bright) · 26.64p a kWh + 47.35p a day / ○ Live usage…; 'Not connected yet.' (when ⚙ is opened again) | nothing |
| B4 control: typed email+password, Save & close without pressing Connect | no | ✓ Electricity usage (Bright) · 26.64p a kWh + 47.35p a day / ○ Live usage… | nothing |
| C first refresh still in flight (Glowmarkt slow or hanging) | yes | … Electricity usage (Bright) · 26.64p a kWh + 47.35p a day · checked after Save & close / ○ Live usage…; 'Not connected yet.' After the timeout: ✗ Electricity usage (Bright) · Timed out | While in flight: nothing. After the 20 s timeout: toast 'Timed out' on card, chart and both tiles |
| C3 sign-in fine, only readings slow | yes | Once it fails: ✗ Electricity usage (Bright) · Timed out; note 'Connected: meter found…' | Nothing while in flight; 'Timed out' after 20 s |
| D status ok, but Glowmarkt readings return data: [] | yes | ✓ Electricity usage (Bright) · 26.64p a kWh + 47.35p a day / ○ Live usage (Glow display) · optional: needs a Glow display/CAD; 'Connected: meter found (half-hourly readings; live usage needs a Glow display).' | nothing |
| D2 same as D, five hours later | yes | ✓ Electricity usage (Bright) · 26.64p a kWh + 47.35p a day / ○ Live usage…; 'Connected: meter found…' | nothing |
| E1 readings all null for yesterday and today (Bright 2+ days behind, nulls=1) | no | ✓ Electricity usage (Bright) · 26.64p a kWh + 47.35p a day / ○ Live usage…; 'Connected: meter found…' | nothing (silent, but the card is not blank) |
| E2 Bright 2+ days behind, with the missing half hours left out (no null rows) | yes | ✓ Electricity usage (Bright) · 26.64p a kWh + 47.35p a day / ○ Live usage…; 'Connected: meter found…' | nothing |
| E3 Bright behind, with zeros instead of nulls | no | ✓ Electricity usage (Bright) · … / ○ Live usage… | nothing |
| F1 timestamps in milliseconds instead of seconds | yes | ✓ Electricity usage (Bright) · 26.64p a kWh + 47.35p a day / ○ Live usage…; 'Connected: meter found…' | nothing |
| F2 timestamps as ISO strings | yes | ✓ Electricity usage (Bright) · … / ○ Live usage…; 'Connected: meter found…' | nothing |
| G1 two virtual entities; the first one's electricity.consumption has no data | yes | ✓ Electricity usage (Bright) · 26.64p a kWh + 47.35p a day / ○ Live usage…; 'Connected: meter found…' | nothing |
| G2 two virtual entities; the first one is all null | no | ✓ Electricity usage (Bright) · … / ○ Live usage… | nothing (silent, but the card is not blank) |
| G3 two virtual entities; the first one's readings return 404 | no | ✗ Electricity usage (Bright) · 404 Not found / ○ Live usage… | toast '404 Not found' |
| H1 discovery saved for a different account | no | ✓ Electricity usage (Bright) · … / ○ Live usage… | nothing |
| H2 old saved discovery (no user field) for another meter, with the account lookup failing | no | ✗ Electricity usage (Bright) · 404 Not found / ○ Live usage…; note still says 'Connected: meter found…' | toast '404 Not found' |
| H3 discovery saved for this account (under 24 h old) but pointing at an empty resource | yes | ✓ Electricity usage (Bright) · … / ○ Live usage…; 'Connected: meter found…' | nothing |
| I1 readings 'to' not on a half hour; Glowmarkt rejects it | no | ✗ Electricity usage (Bright) · 400 Invalid time range / ○ Live usage… | toast '400 Invalid time range' |
| I2 readings 'to' not on a half hour; Glowmarkt answers 200 with no data | yes | ✓ Electricity usage (Bright) · … / ○ Live usage…; 'Connected: meter found…' | nothing |
| J describeError returns '' (thrown value whose String() is empty, e.g. []) | yes | ✓ Electricity usage (Bright) · 26.64p a kWh + 47.35p a day (misleading ✓) / ○ Live usage…; 'Not connected yet.' | toast 'No new readings from Bright for a few hours. The Bright app shows the same.' on card, chart and both tiles |
| J2/J3 describeError with a falsy value or an empty-message Error | no | ✗ Electricity usage (Bright) · Unknown error (J2) / · Error (J3) | toast 'Unknown error' (J2) or 'Error' (J3) |
| K1 readings 200 with no 'data' key | yes | ✓ Electricity usage (Bright) · … / ○ Live usage…; 'Connected: meter found…' | nothing |
| K2 readings 200 with an empty body | yes | ✓ Electricity usage (Bright) · … / ○ Live usage…; 'Connected: meter found…' | nothing |
| L1 wrong password | no | ✗ Electricity usage (Bright) · Bright didn't accept the email and password (⚙ → Electricity). They're the ones you use in the Bright app. | toast with the same 'didn't accept the email and password' text |
| L2 Glowmarkt blocked in this browser (CORS) | no | ✗ Electricity usage (Bright) · Bright didn't answer this browser. If the weather works, Bright is blocking web pages: docs/bright.md has the free 5-minute fix. | toast with the same text |
| L3 Glowmarkt 503 | no | ✗ Electricity usage (Bright) · 503 Service unavailable | toast '503 Service unavailable' |
| L4 account has no electricity resource | no | ✗ Electricity usage (Bright) · Bright has no electricity readings for this account yet. Open the Bright app and finish connecting your meter. | toast with the same text |

### States that stayed blank and silent

- Bright email and/or password not saved in this browser's panel settings (bright.configured false), so the 'bright' source is disabled (status null), Glowmarkt is never called, and it stays this way. Covers: never typed (B1); email only (B2); typed and pressed Connect ('Bright connected') but then Cancel, because Connect does not save and only Save & close does (B3); or typed in a different browser or kiosk app from the one the wall panel runs in. The only hint anywhere is a hollow ○ beside 'Electricity usage (Bright)' in ⚙ and 'Not connected yet.'
- First refresh still in flight (C, C3). Temporary: each hung Glowmarkt request lasts up to 20 s, then the panel turns red with 'Timed out'. ⚙ shows '…' and 'checked after Save & close'
- Status ok but the readings response has no rows inside yesterday 00:00 to now: 'data': [] (D), no 'data' key (K1), or an empty 200 body (K2). ⚙ shows ✓ and 'Connected: meter found'. It never turns amber, even after 5 hours (D2)
- Bright so far behind that it leaves out (rather than nulls) every half hour for yesterday and today (E2). Identical to the empty-data case
- Timestamps not in epoch seconds: milliseconds (F1) or ISO strings (F2). Every row is dropped by parseReadings or by readings()' from/to filter, and ⚙ shows ✓
- Discovery chose the wrong resource: the account has two virtual entities and the first one's electricity.consumption returns no rows, while the real meter's resource in the second one is never asked (G1). Or a discovery saved for this same user less than 24 h ago points at a resource with no rows (H3)
- Glowmarkt answering the panel's unaligned 'to' (e.g. to=2026-10-15T13:17:00) with 200 and no rows (I2). This server behaviour is assumed, not confirmed

## Sites the network proxy refused (not routed around)

- api.glowmarkt.com (curl CONNECT 403 from the egress proxy; could not test CORS, auth or readings directly)
- docs.glowmarkt.com (curl CONNECT 403; WebFetch DNS ENOTFOUND), so the official Bright PDF v1.8 (Apr 2026) was read only through search snippets and API Evangelist's quotes
- www.smartme.co.uk (mirror of the Bright PDF; curl CONNECT 403; WebFetch DNS ENOTFOUND)
- forum.glowmarkt.com (WebFetch DNS ENOTFOUND; curl refused); forum threads 76, 144, 179, 519 and 569 were read only through search snippets
- community.home-assistant.io (WebFetch DNS ENOTFOUND; curl refused)
- community.openhab.org (curl refused)
- docs.rs (WebFetch DNS ENOTFOUND; curl refused); used the crate tarball from static.crates.io instead
- crates.io API (403)
- medium.com (WebFetch DNS ENOTFOUND); used a GitHub-hosted mirror of the article
- murkle.github.io (curl CONNECT 403); read the HTML source on raw.githubusercontent.com instead
- glowmarkt.com, shop.glowmarkt.com, support.hildebrand.co.uk, www.reddit.com (curl refused)
- www.npmjs.com (403)
- gh api against repositories not attached to this session (session refused: 'GitHub access to this repository is not enabled'); used raw.githubusercontent.com and GitHub code search instead

## What was changed (commit after this note)

- **Connect saves at once.** A successful Connect saves the Bright details and the energy choice, so Cancel can't lose them. After that, Cancel reloads the panel so it starts reading.
- **Never blank without a reason.** The card says one of these:
  - "Bright isn't set up on this panel yet" (with what to do)
  - "Asking Bright…"
  - "Usage unavailable (tap for why)"
  - "No readings for today yet · Bright's newest: …"

  A tap always explains. When Bright never answered with readings, the stale check counts that as no data, so the dot turns amber.
- **When Bright is behind:** the panel looks back over the week before, at most once an hour.
  - The chart and the day tile show the newest day Bright has, with its date.
  - "Last half hour" is never days old.
  - Nothing for over a week is an error, with what to check.
- **The right meter:** every place (virtual entity) is asked for its full resource list. Then every `electricity.consumption` resource is ranked: DCC or "profile reads" first, "adhoc" last. With more than one, a small daily-totals call picks the one with the newest readings. The ⚙ note names the meter.
- **Sturdier reading:** times in seconds, milliseconds or ISO are all read, and junk rows are skipped. An answer whose `status` isn't OK is an error.
- **Tests:** the fake Glowmarkt now matches the real one: IDs only in the place list, full resources from a separate call, `status`/`query` in readings, daily totals, accounts with two places or an "adhoc" resource, and an empty-answer mode.

## Review of the fix, and what changed after it

An independent review ran three angles (dates and times, what you see and tap, requests and security), with a second agent trying to refute each finding. Confirmed, and fixed in the next commit:

- **The probe beat the ranking.** A one-off "adhoc" resource with a read today won over the DCC profile, which normally runs a day behind. Now the rank decides. The newest reading only picks between equals, and a lower rank is used only when nothing better has any reading in 10 days.
- **One failing place stopped discovery.** One place whose `/resources` call fails (an old place, say) no longer stops discovery. It's skipped, and only blamed if no meter is found. A failed lookup with a saved meter is retried hourly, not at every refresh.
- **Connect saved too much.** It saved the source and unit rate, so Cancel couldn't undo switching back to Octopus. Now it saves only the sign-in and "use Bright". Cancel keeps the source the page shows.
- **The card blamed Bright for the panel's own failures.** It said "Bright is N hours behind" when the panel's own requests were failing. It now says "Usage unavailable (tap for why)".
- **A tap on the usage tile talked about a stopped Glow display.** It now explains Bright's lag, which is what the tile shows.
- **The checklist contradicted Connect.** After Connect it showed the old error; it now shows the Connect result.
- **The checklist's "newest reading" was frozen text.** It is now worked out when shown, so it stays right after midnight.
- **A new day didn't reset the look-back memo.** The look-back is now keyed by its window as well.
- **ISO times without a zone were read as local time.** They are now read as UTC (only a fallback; Bright sends seconds).

Rejected by the verifiers:
- "Last half hour" showing yesterday's half hour without a date: it is up to about 2 days old. It was already like that before the change, and the card now dates it.
- The midnight memo gap: it is the same as the look-back finding above.
