# Google API 403 errors: formats, causes, what to tell the owner

> Current (web app). Saved from the research runs so it is not lost with the cloud session.

_Workflow: Adversarially review the Google 403 explanation fix and research why Tasks can stay "disabled" after enabling_

**confirmed:**

### 1. 'Wait a minute' is shorter than Google's propagation time and contradicts the new docs

**severity:** low

**file:** web/js/google.js

**line:** 40

**scenario:**

The owner enables the Tasks API, waits one minute as the message says, and taps Choose shopping list again. Enabling often takes several minutes to take effect (Google's own text: 'wait a few minutes for the action to propagate'). The panel shows the same 'switched off … wait a minute' message again, and the owner reads that as a failure. docs/troubleshooting.md in the same commit says 'wait up to 5 minutes', so the in-app instructions and the docs disagree. This is the question the owner is asking right now.

**fix:**

Say 'wait a few minutes (up to 5)', to match docs/troubleshooting.md. Optionally add: 'If it still says this after 10 minutes, you enabled it in a different project than N.'

**lens:** code

**verdict:**

**real:** True

**reason:**

The finding holds up. In web/js/google.js line 40, explainGoogleError builds the new message "…Turn it on (… → Enable), wait a minute, then try again." It replaces Google's original error text completely: HttpError's message is the new string, and describeError in util.js just shows e.message. So Google's own standard SERVICE_DISABLED advice ("If you enabled this API recently, wait a few minutes for the action to propagate…") no longer reaches the owner. The same commit's docs say something different. docs/troubleshooting.md:32 says "Enable, then wait up to 5 minutes and try again. Still failing? You probably enabled it in a different project". docs/google.md:73 says "It can take a few minutes to start working". The commit message itself says "Docs: wait a few minutes after enabling". So within one commit, the in-app text says one minute and the docs say a few minutes, up to 5. The in-app message also has no "if it still fails, check the project" fallback, which the troubleshooting row has. That gap is exactly what the owner is running into now ("shall I wait a few mins more?"). It only affects wording, not function, so it is correctly rated low severity. But it is a real, checkable inconsistency in the code under review, not speculation, and the suggested fix (match the docs' "a few minutes (up to 5)", plus a different-project hint) is right.

### 2. The new 'switched off' message hides the project number Google sends and says 'wait a minute' when Google says 'a few minutes'

**severity:** medium

**file:** web/js/google.js

**line:** 40

**scenario:**

A real SERVICE_DISABLED body names the consumer project in four places. A verbatim Calendar capture (MikeAthie/forgegraph logs/qa/run-91eef327…-detail.json) has message "Google Calendar API has not been used in project 702951723813 before or it is disabled. … If you enabled this API recently, wait a few minutes for the action to propagate to our systems and retry.", plus metadata {consumer: "projects/702951723813", containerInfo: "702951723813", activationUrl: "https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=702951723813"}. explainGoogleError swaps all of that for "The Google Tasks API is switched off in your Google Cloud project. … wait a minute, then try again." The number now appears only inside the link's href. This owner enabled Tasks in a project the picker calls "API" and still gets the 403. The number was the only thing on screen that let them check whether "API" is project N. The new text also says to wait less time than Google's own message ("a few minutes") and than docs/troubleshooting.md ("up to 5 minutes"). That leaves the owner asking the question they asked: wait longer, or is something else wrong?

**fix:**

Keep the project in the message: take meta.containerInfo, or meta.consumer with 'projects/' stripped, or /in project (\S+) before/ from the message. For example: "The Google Tasks API is off in Google Cloud project 123456 (the one your OAuth client belongs to). Turn it on, then allow up to 5 minutes. Still failing after that? It was switched on in a different project: use the link, which opens project 123456." Match docs/troubleshooting.md's wording on the wait time.

**lens:** formats

**verdict:**

**real:** True

**reason:**

Mostly confirmed. The project-number half is weaker than stated, but the wait-time half holds.

I ran explainGoogleError on a realistic SERVICE_DISABLED body (Google's full message, plus consumer, containerInfo and activationUrl in the metadata, as sent). Scratch script: /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad/exp.mjs.
- Before: "403 Google Tasks API has not been used in project 702951723813 before or it is disabled. Enable it by visiting …?project=702951723813 then retry. If you enabled this API recently, wait a few minutes for the action to propagate to our systems and retry."
- After: "The Google Tasks API is switched off in your Google Cloud project. Turn it on (…→ Enable), wait a minute, then try again."
- The number no longer appears in the message (includes(N) === false).

Settings path (web/js/settings-ui.js:78, say(describeError(e), true, e?.link)):
- Only e.message is shown as text. The number survives only in the link's href, which does open project N.
- That softens the "hides the project" claim: tapping the link lands on the right project.

Panel card path (web/js/main.js:105, state.status[name] = { error: describeError(e) }):
- The link is dropped entirely, so there the project is gone completely.

Wait-time wording:
- The message hardcodes "wait a minute" (web/js/google.js:40).
- Google's own text says "wait a few minutes".
- The same commit's docs say "up to 5 minutes" (docs/troubleshooting.md:32) and "a few minutes" (docs/google.md:73).
- The rewrite also drops Google's "If you enabled this API recently…" caveat. It now states flatly that the API is "switched off", even for an owner whose console shows Enabled and who is only waiting for the change to take effect. That is this user's exact situation and question ("shall I wait a few mins more?").

So the commit made the in-app message both less informative than Google's and inconsistent with its own docs, on the very information the owner needs. It is a wording/UX defect rather than a crash, but it is concrete and verified. Unit tests pass (52/52), and they don't check the wait wording or the project number.

### 3. 'Leave every box ticked' assumes Google's consent checkboxes start ticked; newly requested permissions can start unticked

**severity:** medium

**file:** web/js/google.js

**line:** 51

**scenario:**

Once the Tasks API works, the next hurdle is a sign-in without Tasks, which HEAD's hasTasks pre-check reports. The owner signs in again through the Nest partner-connection page. Google's granular consent screen then lists Calendar and Tasks as checkboxes, and reports (google/google-api-javascript-client#754, Google's granular-permissions guide) say non-sign-in permissions start unticked. An owner who follows 'leave every box ticked' literally presses Continue without ticking Tasks. The token comes back without /auth/tasks, the post-sign-in toast says Tasks wasn't allowed, and the same instruction sends them round again. The same wording is in settings-ui.js:190 ('leave the Tasks box ticked'), main.js:398 ('leave every box ticked') and docs/troubleshooting.md:33. I couldn't open Google's page directly (egress blocked), so how the boxes start is from secondary sources.

**fix:**

Use wording that is correct either way: "make sure every box is ticked (or tick Select all) on Google's screen" in google.js:51, settings-ui.js:190, main.js:398 and docs/troubleshooting.md:33. docs/google.md:59/74 ('allow Calendar and Tasks') could say the same.

**lens:** scenario

**verdict:**

**real:** True

**reason:**

The finding holds up. HEAD (9854f10) adds the new instruction in every place it cites. In web/js/google.js:51 the explainGoogleError message for insufficient scopes says "leave every box ticked on Google's screen". web/js/settings-ui.js:190, the new hasTasks pre-check, says "leave the Tasks box ticked". web/js/main.js:398, the post-sign-in missingScopes toast, says "sign in again and leave every box ticked". docs/troubleshooting.md:33 says "leave every box ticked" and gives the cause as "Tasks was unticked on Google's screen". All of this assumes Google shows the boxes already ticked.

The panel asks for three permissions that are not part of basic sign-in (sdm.service, calendar.readonly and tasks; see authUrl in google.js). Google shows its per-permission checkbox screen whenever an app asks for more than one of those, so this panel gets it. I could not open Google's own page because the network blocked it. The secondary sources say these boxes start unticked:
- google/google-api-javascript-client#754 is titled "Permissions are always unticked in the new consent screen" and says the new prompt has all the requested permissions unchecked by default.
- jpassing.com (2022) says only the sign-in permissions (openid, email) are pre-ticked, while others such as cloud-platform start unticked.
- CloudSponge says Google wants people to tick each permission deliberately, and that most people don't realize they need to.

That matches the scenario the reviewer describes. The owner is told their sign-in lacks Tasks and does exactly what the message says: they leave the boxes alone and press Continue. The token comes back without /auth/tasks, and the toast sends them round again with the same wrong instruction. This is worst on a repeat sign-in, where the Tasks permission being added is the one most likely to start unticked. Many users would probably work out that they need to tick the box, and the fix is only a wording change, so medium severity may be generous. Still, the new text in HEAD gives an incorrect instruction on exactly the path this owner is on. The troubleshooting cause ("Tasks was unticked") also misstates what happened. The older docs/google.md wording ("allow Calendar and Tasks") was neutral and did not have this problem. Wording that is right either way, such as "make sure every box is ticked (or tick Select all)", would fix it.

**refuted:**

### 1. The rewritten 'API switched off' message drops the project number, and the fallback link names no project

**why:**

The facts are right, but the harm described does not happen where it matters.

What is true: the rewritten message at web/js/google.js:40 no longer shows the project number N. The fallback link at line 46 (https://console.cloud.google.com/apis/library/<service>) has no ?project=.

Why the harm does not follow:

1. **The owner's case, Settings → Choose shopping list.** Google's current SERVICE_DISABLED error puts metadata.activationUrl (…/apis/api/tasks.googleapis.com/overview?project=N) in its ErrorInfo. The repo's own fixtures use this shape, in mocks.js 'tasks-off' and in the unit-test serviceDisabled(). explainGoogleError uses that URL as the link, and settings-ui.js shows it as "Turn on the Google Tasks API" next to the message. The e2e test checks the href ends in ?project=123. So an owner who enabled the API in the wrong project taps the link and lands in the right project, on its Enable button. The finding's claim that "nothing tells them to switch projects" does not hold here. The commit also added a troubleshooting row saying: "Still failing? You probably enabled it in a different project: the one whose Credentials lists your panel's client ID."

2. **The panel-card path (toast with no link).** The shopping source runs only when a list is already chosen (main.js:426 needs google.hasTasks && shoppingList.id). Choosing a list calls listTaskLists, which only works when the Tasks API is on in the project that holds the OAuth client. So the card can only hit SERVICE_DISABLED if the API is later turned off or the owner switches to a client in another project. The same applies to the Calendar and Nest pickers. That is an edge case, not the "enabled it in the wrong project" situation in this conversation.

3. **The fallback link.** It is used only when activationUrl is missing or not a Google console host. That is a defensive branch for an older or odd error shape, not what Google sends for this API today.

Net: showing N in the text, or adding ?project= to the fallback link, would be a small UX improvement. It is not a defect that sends this owner to the wrong project. The unit tests pass (52/52).

### 2. Console link opens inside the kiosk WebView, where Google blocks sign-in, stranding the panel

**why:**

The finding's main claim is that the panel gets stranded. That does not hold for the kiosk app the repo documents. Part of the premise is right: in the kiosk, the new link from settings-ui.js line 57 opens in place of the panel. I cloned the source of WebView Kiosk (nktnet1/webview-kiosk, the app docs/tablet.md recommends). It has no multi-window support, so the link replaces the panel, and Google's sign-in would likely refuse the console there. But the app does not leave the owner stuck:
- Back navigation is allowed by default (allowBackwardsNavigation = true). The Android back button or gesture runs WebViewNavigation.goBack, which returns to the panel's page in the kiosk's own history.
- Holding back opens the kiosk control panel by default. Its default actions include NAVIGATION, HOME and REFRESH, and HOME loads the panel URL.
- The address bar, with back and home, shows by default while the kiosk is unlocked (HIDDEN_WHEN_LOCKED).
- Fully Kiosk (the other kiosk the panel detects) also goes back by default.

"No way back until the kiosk app is restarted" is therefore false. The point about the daily reload is also wrong: once the page is replaced, the panel's JavaScript is gone, so nothing reloads.

The scenario is also unlikely. The docs say to do all Google setup in Chrome, then copy the settings into the kiosk. The only other point that holds up is a small usability one, not a bug in this code: the link is useless inside a WebView. Even there, the error text still gives the manual steps (APIs & Services → Library → Enable). In Chrome, where the owner is told to do this, target=_blank opens a new tab or custom tab and works as intended.

### 3. Without activationUrl, the fallback link opens no particular project even when the error names one

**why:**

The finding describes the code correctly but not a defect anyone would hit. The fallback in web/js/google.js line 46 does build https://console.cloud.google.com/apis/library/<service> with no ?project=. The unit test in web/test/unit/google-nest.test.js checks this on purpose, and all 13 tests pass. But the fallback only runs when Google's 403 has no usable ErrorInfo.metadata.activationUrl. Google's current SERVICE_DISABLED responses from www.googleapis.com and smartdevicemanagement.googleapis.com do include it, as https://console.developers.google.com/apis/api/<svc>/overview?project=N. The reviewer's own "real Calendar capture" (case 1 in scratchpad/probe.mjs) has it, and running the probe shows the code links it with ?project=702951723813. The owner's Tasks 403 today would have the same shape, so they would get a link to the right project. The project-less shapes the reviewer relies on are: the example written into error_reason.proto (it illustrates the ErrorInfo format and is not a real response); old python-client traces that show only errors[], of unknown date; and a made-up case where activationUrl points at a non-Google host, which is deliberately refused as a safety measure. The claim that this is "exactly the enabled-in-the-wrong-project trap the owner is in" is also a guess: the owner's picker showing a project named "API" says nothing about which project they are in. At most, reading the project from meta.consumer or the message text is extra hardening for a path current Google responses don't reach. It is a small UX suggestion, not a bug in this commit.

### 4. The wording check can override a different ErrorInfo reason that Google sent

**why:**

The finding doesn't hold up as a defect. In web/js/google.js, explainGoogleError does treat the reasons and the message wording as alternatives: a match on /has not been used in project|API .*is disabled|it is disabled/i leads to the "switched off" message whatever the ErrorInfo reason says. That much is accurate. But the reviewer admits no real Tasks, Calendar or SDM 403 triggers the misclassification, and every example they probed passes through unchanged. Their two sample reasons don't apply either. The panel never calls MCP servers. Tasks, Calendar and SDM don't need billing, and Google's usual BILLING_DISABLED wording ("This API method requires billing to be enabled...", "Billing is disabled for project...") contains neither "it is disabled" nor "API ... is disabled". The owner's actual error, "Google Tasks API has not been used in project N before or it is disabled", arrives with reason SERVICE_DISABLED and the older accessNotConfigured, so it is classified correctly with or without the wording check. The unit tests pass (52/52) and cover that body, the older message-only body and the pass-through cases. Even in the made-up case, the only harm would be a slightly wrong hint with a link to Google's own console page for enabling the API. The suggested change is defensive hardening against an error body nobody has seen, so the finding is speculative rather than a real bug.

### 5. The new 'switched off' message leaves out the project number and Google's 'wait a few minutes' advice, and contradicts a console that says Enabled

**why:**

The facts in the finding are accurate, but they don't add up to a medium defect in the owner's case. I ran explainGoogleError from web/js/google.js on a real-shaped SERVICE_DISABLED body (project 987654321098). The visible text is indeed "The Google Tasks API is switched off in your Google Cloud project. Turn it on (…), wait a minute, then try again." It has no project number and says "a minute" rather than "a few minutes".

The finding's main harm is that the owner can't tell whether the project named "API" is the right one. That doesn't hold up. On the owner's exact path (Settings → Choose shopping list), settings-ui.js:78 passes e.link to say(). say() puts a "Turn on the Google Tasks API" link right beside the message. That link is Google's own activationUrl, ending in ?project=987654321098, so it opens the Tasks API page of the exact project Google means. That page settles the question better than a bare number would. If it says Enabled, the owner is in the right project and only needs to wait. If it offers Enable, they turned it on in a different project. docs/troubleshooting.md, changed in this same commit, points the owner to that link and says it opens the right project. The e2e test in features.test.js checks the link's href (?project=123) and target. So the project is named, as a link rather than as digits.

The other claim is that "wait a minute" makes the owner give up too soon, and that "switched off" contradicts a console saying Enabled. That is speculative wording criticism. The message still tells the owner to wait and try again. Retrying costs nothing and shows the same instruction again. The docs this commit touched say "a few minutes" (google.md) and "up to 5 minutes" (troubleshooting.md). So the most that holds is a small wording mismatch: the in-app "a minute" is shorter than the docs' "a few minutes". That is a copy nit, not a defect that stops the owner fixing the problem. The panel-card toast shows the same text without the link, but that path isn't the finding's scenario. In the owner's case the panel doesn't call Tasks at all, because no list is chosen yet (main.js:426).

### 6. The fallback 'Turn on' link opens the Library in whichever project the console last had selected, not the error's project

**why:**

The code does what the finding says: web/js/google.js line 46 builds the fallback link with no ?project=. But the case that triggers it doesn't happen with real Google responses, so the finding is speculative.

1. When Google's Tasks and Calendar endpoints refuse a call because the API is switched off (a SERVICE_DISABLED 403), the error they send today includes an activationUrl in its details. That URL is on console.developers.google.com and already ends in ?project=<number>. The fixture in the unit test (web/test/unit/google-nest.test.js:75-80) and the e2e mock (web/test/support/mocks.js:194) are built on that shape. In both, the code keeps Google's own link, which points at the right project. The e2e test checks for exactly that href.

2. The fallback only runs in two defensive, made-up cases:
   - an activationUrl on a host that isn't Google's console. That can only come from a forged or tampered response, and the metadata.consumer in that same response would be no more trustworthy.
   - an "older" error with only a message, which the unit test itself labels 'bare'. That shape has no ErrorInfo at all, so there is no metadata.consumer to read.
   The finding's scratch case, an ErrorInfo with consumer but no activationUrl, is also something Google's current API frontend doesn't send.

3. The link without a project is a deliberate, tested choice. The unit test at line 99 asserts the plain library URL ("the plain library page is"). Falling back to a safe generic link is reasonable defensive behaviour, not a regression. The error text and docs/troubleshooting.md also tell the owner how to find the right project: the one whose Credentials page lists their client ID.

4. It doesn't affect the owner's actual situation. If Tasks is still off in the OAuth client's project after propagation, Google's real 403 carries an activationUrl with that project number. The panel then shows the correct link.

Unit tests pass (52/52). Adding ?project= from consumer or from the message text would be a small hardening, not a fix for a reachable bug.

**notes:**

### 1. code

**notes:**

I reviewed HEAD 9854f10 without changing any files. `npm test` passes 52/52 and `PANEL_STYLE=bold npm run test:e2e` passes 34/34.

**What I checked and found no defect in**
- **Odd error bodies:** I ran `explainGoogleError` in scratch against null, strings, arrays, `error: null`, `error: 'x'`, `error: []`, details or errors containing null and numbers, `metadata: null`, non-string `serviceTitle` and a `javascript:` `activationUrl`. None of them throw.
- **Other 403s:** Nest's 403 "The caller does not have permission", other 403s, token-endpoint errors (where `error` is a string), 404s and TypeErrors are all returned unchanged. Calendar rate-limit and dailyLimit 403s don't match either branch.
- **Link safety:** a link is only offered when it is https and the host is exactly console.cloud.google.com or console.developers.google.com, so a look-alike such as console.cloud.google.com.evil.com is rejected. The link is built with `setAttribute` and a text node, so there is no XSS.
- **401 retry:** I tested it in scratch. A 401 followed by success works. A 401 followed by a 403 is explained. A 401 followed by a second 401 is thrown unchanged.
- **Other code paths:** `main.js` still checks `status === 429` on the new HttpError, and nothing else depends on the old message text. The toast (z-index 80) sits above Settings (70), so the sign-in toast is visible. `say()` sets the text, then appends the link, and the next click's `'Working…'` clears the link.
- **Checklist change:** it looks correct. The only new risk is a TypeError if `scopes` were null, which `loadSettings` / `importSettings` defaults prevent in practice.

**Test gap:** the 401-retry path was restructured but has no unit or e2e test, before or after this commit.

**Answer to the owner ("shall I wait a few mins more?"):** Yes. Google says enabling can take a few minutes to take effect, usually up to about 5, occasionally longer. There's no need to sign in again, because whether the API is enabled isn't part of the sign-in; just tap Choose shopping list again. If it still fails after about 10 minutes:
1. Compare the number N in "has not been used in project N" with the Project number of the project named "API" (Cloud console → the project's Dashboard / Project info, or IAM & Admin → Settings).
2. If they differ, the API was enabled in the wrong project. Enable the Google Tasks API in project N, which is the project whose APIs & Services → Credentials lists the panel's OAuth client ID. The link in Google's own message, console.developers.google.com/apis/api/tasks.googleapis.com/overview?project=N, goes straight there.

The owner is still seeing the old bare message, so the panel they're using doesn't have this commit yet (the Panel version line at the bottom of Settings shows which version is loaded).

### 2. formats

**notes:**

Verdict for this lens: the patterns in explainGoogleError match what Google actually sends. Every field name, reason string, host and service name checks out against real response bodies:
- Real SERVICE_DISABLED body on www.googleapis.com (Calendar, verbatim capture: MikeAthie/forgegraph and SaCH-PRO/KEYFLOWOS on GitHub). It has error.errors[0] = {domain:'usageLimits', reason:'accessNotConfigured', extendedHelp:'https://console.developers.google.com'} and error.details[0]['@type'] = 'type.googleapis.com/google.rpc.ErrorInfo' with reason 'SERVICE_DISABLED'. metadata holds serviceTitle 'Google Calendar API', containerInfo, activationUrl 'https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=N', consumer 'projects/N' and service 'calendar-json.googleapis.com'. After that come google.rpc.LocalizedMessage and google.rpc.Help details. So the endsWith('google.rpc.ErrorInfo') match, the reason match, the metadata.service lookup, 'calendar-json.googleapis.com' and the activationUrl host console.developers.google.com (which is in CONSOLE_HOSTS) are all correct.
- ESF/One Platform APIs such as SDM leave out errors[] (the cloudcode-pa capture in lbjlaq/Antigravity-Manager#3049, and my live unauthenticated probe of smartdevicemanagement.googleapis.com). The ErrorInfo path still catches them.
- Service names confirmed by live unauthenticated probes from this sandbox: www.googleapis.com/tasks/v1 reports metadata.service 'tasks.googleapis.com' (method 'google.apps.tasks.data.v1.TaskListService.List') and includes both errors[] and details[]. SDM reports 'smartdevicemanagement.googleapis.com'.
- ACCESS_TOKEN_SCOPE_INSUFFICIENT: message 'Request had insufficient authentication scopes.', errors[].reason 'insufficientPermissions' (domain 'global'), ErrorInfo reason ACCESS_TOKEN_SCOPE_INSUFFICIENT with metadata {service:'calendar-json.googleapis.com', method:'calendar.v3.…'}. This comes from 2026 captures documented in B0yko/booking-truth docs/sandbox-fidelity.md and matches googleapis error_reason.proto. Both the reason and the text match.
- Nothing slips past or gets matched wrongly among the cases named: API_KEY_SERVICE_BLOCKED, USER_PROJECT_DENIED, CONSUMER_INVALID, CONSUMER_SUSPENDED, BILLING_DISABLED and SDM's own 'The caller does not have permission' all come back unchanged (scratch/probe.mjs). Old errors[]-only bodies are caught through 'accessNotConfigured'.
- Small test-fixture detail, not a bug: the unit test's scopeMissing uses method 'google.tasks.v1.TasksService.ListTaskLists', but live Tasks reports 'google.apps.tasks.data.v1.TaskListService.List'. The code never reads method.
- One real variant (julien040/anyquery README) says 'Google Tasks API has not been used in project before or it is disabled' with activationUrl '…/tasks.googleapis.com/overview' and no project at all. The code handles it, but the link can't point at a project.
- npm test: 52/52 pass.

Advice for the owner ('shall I wait a few mins more?'): Google's own message says 'If you enabled this API recently, wait a few minutes for the action to propagate to our systems and retry.' It usually works within about 5 minutes. If it still fails after about 10 minutes, the likeliest cause is that it was switched on in a different project. The project that matters is project N in the error, which is the project that owns the OAuth client ID pasted into the panel. It is not necessarily the project the console picker shows (here, 'API'). To check, open https://console.developers.google.com/apis/api/tasks.googleapis.com/overview?project=N with N taken from the error, or tap the new 'Turn on the Google Tasks API' link. If that page offers an Enable button, it was enabled elsewhere; enable it there. You can also compare N with the Project number on the 'API' project's Dashboard, and check that its APIs & Services → Credentials page lists the panel's client ID. No new sign-in is needed after enabling an API. If the error then changes to 'insufficient authentication scopes', sign in again with Tasks ticked.

Files: /home/user/Home-Dashboard-/web/js/google.js (lines 13-54), scratch harness /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad/probe.mjs, proto reference /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad/error_reason.proto.

### 3. scenario

**notes:**

ANSWER FOR THE OWNER, most likely cause first.

1) The API was enabled in a different Cloud project from the one the panel's OAuth client belongs to. This is most likely because the console shows Enabled, yet the error persists, and the project is called "API" rather than "Home panel".
   Why the project matters: the number N in "has not been used in project N" is always the Cloud project that owns the OAuth client ID pasted into the panel. The panel's requests can't change that. I searched web/js: Google calls send only `Authorization: Bearer …`, with no x-goog-user-project header, no quota-project header and no ?key=.
   How to tell:
   (a) The client ID in the panel looks like N-xxxx.apps.googleusercontent.com. The digits before the first '-' are the project number.
   (b) In the Cloud console, select the "API" project and read its number on the Dashboard/Welcome page's Project info card, or under ☰ → IAM & Admin → Settings. If it isn't N, it's the wrong project.
   (c) Quickest: open https://console.developers.google.com/apis/api/tasks.googleapis.com/overview?project=N (the link in Google's error). The console switches to project N and shows its name. If there is an Enable button, press it.
   (d) The right project must also list Smart Device Management API and Google Calendar API under APIs & Services → Enabled APIs & services, because Nest and Calendar already work.
   "API Project" was also the name Google gave auto-created default projects in the old APIs console (project ID api-project-<number>). A picker reading "API…" may therefore be an old project, not the one holding the client. Also check the console's Google account (avatar, top right): a project owned by another of the owner's accounts looks identical.

2) Propagation delay. Google's own error text says: "If you enabled this API recently, wait a few minutes for the action to propagate to our systems and retry." It is usually well under 5 minutes. If the project number matches N and it still fails after about 15 minutes, stop waiting and check the account and project again (and if you like, Disable then Enable once more).

3) Device Access project vs Cloud project. The Device Access project ID (a UUID from console.nest.google.com, pasted into the panel as "Device Access project ID") is not a Cloud project. No APIs are enabled there, and it is never the N in the error. All three APIs (SDM, Calendar, Tasks) must be on in the Cloud project that owns the OAuth client.

4) Cached tokens are not the cause. Google checks whether the API is on for every request, based on the project behind the token's client. Nothing about it is stored in the access token. In any case, Settings → Choose shopping list builds a fresh Google object on each press (settings-ui.js:50, draftGoogle), so each press gets a new access token. No re-sign-in and no settings re-copy are needed just because the API was enabled. Pressing Choose shopping list again is enough.

5) The owner's panel is still running the old build. The message they quote ("403 … has not been used … or it is disabled") is the pre-HEAD wording. origin's default branch (claude/lenovo-m10-home-dashboard-wwqe4q) is at 9854f10, and Pages publishes after CI passes. sw.js fetches the network first with no-cache, so reloading the page in Chrome picks up the new build. The new message's "Turn on the Google Tasks API" link opens project N directly, which is the easiest way into the right project.

WHAT COMES NEXT, once the API error clears:
- Before HEAD, Choose shopping list called Google without checking the sign-in. Google appears to check the token's scope before checking whether the API is on: reports show gcloud credentials first getting "insufficient authentication scopes", and only after scopes are added "API has not been used in project 764086051850". So getting SERVICE_DISABLED suggests the token already had the Tasks scope. That is likely but not verified.
- Definitive checks: with HEAD, the Settings checklist shows "Shopping list (Google Tasks) · sign in to Google again to allow it", and Choose shopping list says the sign-in doesn't allow Tasks without asking Google. Alternatively, myaccount.google.com/connections → Home panel lists whether Google Tasks is granted.
- If a new sign-in is needed: authUrl sends all three scopes with prompt=consent (the consent screen always shows) and include_granted_scopes=true (earlier grants are kept).
- The Nest Partner Connection Manager passes extra scopes through to Google's consent. Home Assistant's Nest integration requests .../auth/pubsub through the same nestservices.google.com/partnerconnections/{project}/auth URL (checked in its const.py), and the panel's calendar.readonly already arrives that way.
- On Google's screen, tick Tasks or Select all (see finding 2). HEAD's post-sign-in toast names any part Google didn't grant.

OTHER NOTES
- npm test: 52/52 pass on HEAD. I didn't run the e2e suite. I modified no files; the scratch script is at /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad/explain.mjs.
- developers.google.com, docs.cloud.google.com and jpassing.com were blocked by the egress proxy. Claims about Google's behaviour therefore come from Google's own error text, search-result summaries and GitHub sources, not from Google's pages directly.
- The client-ID-prefix = project-number rule is widely documented (e.g. jpassing.com 2025, 'Given an OAuth Client ID, how to find the corresponding Google Cloud project') and holds for clients created in the Cloud console.
