# Opening Gemini straight into Live voice (answer: no known way)

> Current (web app). Saved from the research runs so it is not lost with the cloud session.

_Workflow: Find how an Android intent/link can open Gemini straight into voice (Gemini Live), and verify_

**research:**

**gemini live kiosk link:** none known

**gemini live chrome link:** none known

**gemini app launch:**

WebView Kiosk (startActivity): intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;component=com.google.android.apps.bard/com.google.android.apps.bard.shellapp.BardEntryPointActivity;end   (this is the only exported launcher activity; Android also accepts the short form component=com.google.android.apps.bard/.shellapp.BardEntryPointActivity). It opens the normal Gemini home or chat, and Live is one tap away. Chrome installed app: https://gemini.google.com/app. That is the web app, and Google says Live is not available in the web app, so it opens text chat only. The Gemini shell has no BROWSABLE filters, so no intent:// URL with scheme=https can reach the native app from Chrome. Nearest one-utterance route: the existing VOICE_ASSIST link to com.google.android.googlequicksearchbox. Where Gemini has replaced Assistant, it opens the Gemini overlay with the mic listening, and the user says "let's talk Live". Google documents that phrase as "Hey Google, let's talk Live". Saying it into an already-open overlay is my inference and has not been tested.

**evidence:**

RESULT: I found no verified, publicly known intent, deep link, launcher shortcut or URL that opens Gemini directly in Live mode from a third-party app or a web page. Nothing below was tested on a device.

VERIFIED (static analysis of the Gemini APK):
1) Manifest of com.google.android.apps.bard 1.0.795460806, Oct 2025 (github.com/arnodorian1337/gemini-decomp, resources/AndroidManifest.xml):
- The only exported UI entry is shellapp.BardEntryPointActivity. Its filters are MAIN/LAUNCHER plus SEND and SEND_MULTIPLE for text, images and documents.
- There is no VIEW or BROWSABLE filter and no custom scheme.
- There is no VOICE_ASSIST, VOICE_COMMAND or ASSIST filter.
- There is no android.app.shortcuts meta-data and res/xml has no shortcuts file, so there are no static launcher shortcuts.
- The sources have no ShortcutManager calls, so there are no dynamic shortcuts either.
- A March 2026 teardown of 1.0.869192867 (utzcoz blog) lists the same six classes.

2) The home-screen widget does have a "Live" button (strings robin_live_button_label="Live", description "Talk live").
- It fires the Glance action aca.j("liveconv"), which launches widget.RobinWidgetEntryPointActivity with feature=liveconv.
- Sibling buttons use livevideo, livescreen, voiceinput, camera, gallery and filepicker.
- RobinWidgetEntryPointActivity is android:exported="false", so neither the kiosk nor Chrome can call it.
- Its onCreate did not decompile, so the exact AGSA intent it sends was not recovered.

3) The shell is only a trampoline. BardEntryPointActivity sends a signed "googleapp://deeplink/?data=<signed protobuf>" intent, setPackage com.google.android.googlequicksearchbox, then finishes (hossain-khan APK technical reference, Apr 2026). The real Gemini/Live UI lives in the Google app:
- robin.main.MainActivity
- robin.ui.floaty.activity.FloatyActivity

4) SwitchAI (an open-source assistant switcher) can only open those two Google app activities through "su -c am start" (RootChecker.kt). They are not usable without root.

5) Google Help (answer 15274899) lists the ways to reach Live: tap Live in the app, the widget, or say "Hey Google, let's talk Live". It also states that Live is not available in the Gemini web app, which rules out a gemini.google.com Live URL.

NOT YET SHIPPED / GUESSED:
- NerdsChalk, 2026-09-25: the unreleased Google app v17.61.19 contains strings for an "Open Gemini in Live" default-start setting. It is not available to users yet. If it ships, the normal launch link above may open straight into Live with no page change. Treat that as a guess.
- Android Authority / Android Police, Mar 2025: a "Launch Live" option for press-and-hold power button was found in teardowns. It is a gesture setting, not an intent, and I could not confirm it rolled out.
- Signed googleapp://deeplink URIs can be replayed from web pages. Google's own pages used them to launch Assistant (xdavidhu 2019, NDevTK 2024). So in theory someone could extract the widget's liveconv payload from the APK and use it as intent://deeplink/?data=...#Intent;scheme=googleapp;package=com.google.android.googlequicksearchbox;end. This is speculative: I could not extract the payload, and it may be tied to the calling package or break when Google rotates keys.
- VOICE_COMMAND or VOICE_ASSIST aimed at com.google.android.apps.bard will not resolve, because the shell has no such filters. Aimed at the Google app, they open the Gemini overlay mic for a single query, not Live (WakeTalk notes also mark reaching Live this way as unverified).

CONTEXT:
- 9to5Google (Dec 2025): Gemini replaces Google Assistant on Android in 2026, so the existing "Hey Google" VOICE_ASSIST button will likely open Gemini's overlay rather than classic Assistant.
- Research limit: egress was blocked for 9to5google, androidauthority, support.google.com, nerdschalk and APKMirror. Those sources were read through search-result summaries only. GitHub-hosted sources were read in full.

**confidence:** medium

**sources:**

- https://github.com/arnodorian1337/gemini-decomp/blob/main/resources/AndroidManifest.xml
- https://github.com/arnodorian1337/gemini-decomp/blob/main/sources/defpackage/bnx.java
- https://github.com/arnodorian1337/gemini-decomp/blob/main/sources/defpackage/aca.java
- https://github.com/hossain-khan/android-compose-highlight/blob/main/resources/apk-analysis/gemini-technical-reference.html
- https://github.com/utzcoz/utzcoz.github.io/blob/master/_posts/2026-03-06-android-intelligent-os-core-modules.md
- https://github.com/WSTxda/SwitchAI/blob/main/app/src/main/java/com/wstxda/switchai/assistant/GeminiAssistant.kt
- https://github.com/WSTxda/SwitchAI/blob/main/app/src/main/java/com/wstxda/switchai/logic/RootChecker.kt
- https://support.google.com/gemini/answer/15274899?hl=en&co=GENIE.Platform%3DAndroid
- https://support.google.com/gemini/answer/16179553?hl=en&co=GENIE.Platform%3DAndroid
- https://nerdschalk.com/google-app-to-open-gemini-directly-in-live-apk-teardown
- https://www.androidauthority.com/gemini-live-power-button-gesture-apk-3532321/
- https://www.androidpolice.com/gemini-live-quick-launch-gestures/
- https://9to5google.com/2025/07/02/new-gemini-icon-app-update/
- https://9to5google.com/2025/12/19/google-assistant-gemini-2026/
- https://github.com/NDevTK/writeups/blob/main/_posts/2024-08-01-awas.md
- https://github.com/xdavidhu/feed.bugs.xdavidhu.me/blob/master/_posts/2021-10-10-0011.md
- https://github.com/WASIDJ/blog-content/blob/master/post/2026-08-09-gemini-live-screen-off-hyperos.md
- https://github.com/miyaketomoya/WakeTalk/blob/main/docs/requirements.md

**check:**

**gemini live kiosk link:** none known

**gemini live chrome link:** none known

**gemini app launch:**

Two routes, in order of preference.

1) Browsable App Link (works in BOTH WebView Kiosk startActivity AND the Chrome installed app): https://gemini.google.com/app . I verified against Google's live Digital Asset Links that gemini.google.com delegates handle_all_urls to BOTH com.google.android.apps.bard and com.google.android.googlequicksearchbox. So on a device where Android App Links are verified for the Gemini/Google app and "open supported links" is enabled, this https link opens the NATIVE Gemini app (not just the web app). Where App-Link verification is off, it falls back to the web app (text chat only). This is an improvement over the prior finding, which treated https://gemini.google.com/app as web-only. It is the only option that also works from the Chrome installed app, since that context accepts browsable https app links but not component= intents. It opens Gemini home/chat; Live is one tap away.

2) Explicit component intent (WebView Kiosk / startActivity only): intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;component=com.google.android.apps.bard/com.google.android.apps.bard.shellapp.BardEntryPointActivity;end . I re-verified this component name against the live Oct-2025 APK manifest (v1.0.795460806): BardEntryPointActivity is present, exported=true, and is the only exported launcher UI. Short form component=com.google.android.apps.bard/.shellapp.BardEntryPointActivity also works. It will NOT work from the Chrome installed app (component intents are not browsable). It opens Gemini home/chat; Live is one tap away.

No verified link opens Gemini directly in Live. The web app has no Live (Google support states this), and the native app exposes no VIEW/BROWSABLE/VOICE_ASSIST filter and no custom scheme, so nothing reaches a Live surface from outside. The robin Live UI lives in activities that are exported=false (confirmed) and cannot be launched by the kiosk or Chrome without root. Nearest one-utterance route remains the existing "Hey Google" VOICE_ASSIST link to com.google.android.googlequicksearchbox, where the user then says "let's talk Live" into the open overlay (Google documents the phrase "Hey Google, let's talk Live"; saying it into an already-open overlay is inference, untested).

**evidence:**

RE-CHECK RESULT: I independently confirmed the prior finding's core claims against primary/live sources and found one correction worth making (the https App Link route), so I keep it at medium confidence. Nothing was tested on a physical device.

CONFIRMED against live sources this session:
1) Gemini app component name is current, not stale. I fetched the decompiled AndroidManifest for com.google.android.apps.bard v1.0.795460806 (Oct 2025). The only exported UI entry is shellapp.BardEntryPointActivity (exported=true) with MAIN/LAUNCHER plus SEND / SEND_MULTIPLE (text, images, docs) filters. There is NO VIEW filter, NO BROWSABLE, NO custom scheme, NO VOICE_ASSIST/VOICE_COMMAND/ASSIST, and NO android.app.shortcuts meta-data. RobinWidgetEntryPointActivity is exported=false. This matches the prior finding exactly — the component name has not drifted in a 2025-2026 update as of this build.

2) CORRECTION / ADDITION — https App Link can reach the native app. I queried Google's live Digital Asset Links API (digitalassetlinks.googleapis.com statements:list for source https://gemini.google.com). It returns delegate_permission/common.handle_all_urls to BOTH com.google.android.apps.bard AND com.google.android.googlequicksearchbox (multiple signing certs each; also com.google.costar_helper). So a browsable https://gemini.google.com/* link is a candidate Android App Link that, when verification is active on the device, opens the native app rather than the browser. Note the bard v1.0.795460806 manifest itself does not declare an autoVerify VIEW filter for gemini.google.com; static AGSA analysis (below) shows AGSA's AnimatedGatewayActivity carries the gemini.google.com/* and bard.google.com/android URI surface, so on current devices the App Link resolves through the Google app (AGSA) which then presents the native Gemini surface. Either way it lands on chat/home, NOT Live. This corrects the prior finding's assumption that https://gemini.google.com/app is strictly web-only; it can be native. It remains chat-only for Live.

3) AGSA (com.google.android.googlequicksearchbox) exported-activity analysis (taptrap dataset, APK merged 18 Dec 2024, targetSdk 35). Of 229 activities: the Gemini/robin surface entry RobinEntryPointActivity is exported=true (MAIN/LAUNCHER + a DEFAULT/BROWSABLE filter with no action and no data, i.e. not externally URI-matchable). robin main.MainActivity, ui.floaty.activity.FloatyActivity, companion.*, ui.* are all exported=false. HandsFreeActivity (exported) handles VOICE_COMMAND and VOICE_SEARCH_HANDS_FREE — single-query voice, not Live. No exported activity exposes a Live/liveconv entry. This confirms there is no external deep link to Live in the Google app either.

4) Google support (answer 15274899) still lists the only ways to reach Live as: tap Live in the app, the home-screen widget, or "Hey Google, let's talk Live" — and states Live is not available in the Gemini web app. Consistent with the prior finding.

UNCHANGED CAVEATS from prior finding, still true:
- No verified intent/deep link/shortcut/URL opens Gemini directly in Live from a third-party app or web page.
- The saying-"let's talk Live"-into-an-open-overlay route is inference, untested.
- Unreleased Google app teardown strings for an "Open Gemini in Live" default-start setting (NerdsChalk, Sep 2025) are not shipped; treat as a guess.

RESEARCH LIMITS this session: egress proxy blocked direct fetches of gemini.google.com, aiville.com, 9to5google, androidauthority, androidpolice, nerdschalk, apkmirror, reddit and xda; those were seen only via search-result summaries. The manifest, the taptrap AGSA JSON, and the Digital Asset Links API were fetched in full and are the load-bearing sources. I did not modify /home/user/Home-Dashboard-.

**confidence:** medium

**sources:**

- https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://gemini.google.com&relation=delegate_permission/common.handle_all_urls
- https://raw.githubusercontent.com/arnodorian1337/gemini-decomp/main/resources/AndroidManifest.xml
- https://github.com/beerphilipp/taptrap/blob/main/vulnerable_app_detection/results/2025-05-20/output/com.google.android.googlequicksearchbox.json
- https://support.google.com/gemini/answer/15274899?hl=en&co=GENIE.Platform%3DAndroid
- https://github.com/WSTxda/SwitchAI/blob/main/app/src/main/java/com/wstxda/switchai/assistant/GeminiAssistant.kt
- https://developer.android.com/training/app-links/add-applinks
- https://support.google.com/gemini/answer/14554984?hl=en&co=GENIE.Platform%3DAndroid
