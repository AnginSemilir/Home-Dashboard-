# Opening "the default assistant" from a link (answer: Android has no such link)

> Current (web app). Saved from the research runs so it is not lost with the cloud session.

_Workflow: Find how an intent link can open the Android default (role) assistant without a chooser, and verify_

**research:**

**best kiosk link:**

none reliable. No intent is tied to the ASSISTANT role, so no intent: URL can follow the Settings choice. The closest option is intent:#Intent;action=android.intent.action.VOICE_ASSIST;launchFlags=0x10000000;end with no package. Google and Claude both handle it at equal priority, so Android shows a chooser until the owner taps "Always". After that it opens the app they picked every time, whatever Settings > Default apps > Digital assistant app says later.

**behaviour if default is google:**

The link without a package resolves the same way whatever the role says. On the factory Google app 13.25.10.26 in the Lenovo Tab M10 Gen 3 (TB328FU) Android 12 image, the Google app handles VOICE_ASSIST only in com.google.android.apps.gsa.queryentry.QueryEntryActivity (categories DEFAULT and SEARCH_WIDGET, no priority). Claude's AssistantOverlayActivity also matches VOICE_ASSIST at priority 0. With both installed, the system chooser appears. After "Always > Google" it opens Google directly. If Claude is not installed and nothing else handles VOICE_ASSIST, it opens Google directly. That means Gemini or Google Assistant, whichever the Google app is set to: the Gemini app (com.google.android.apps.bard) declares no ASSIST, VOICE_ASSIST or VOICE_COMMAND filter and only works through the Google app, so "Gemini as assistant" means the Google app holds the role. Today's link with package=com.google.android.googlequicksearchbox always opens Google with no chooser.

**behaviour if default is claude:**

Nothing changes in how the intent resolves. Making Claude the role holder only makes VoiceInteractionManagerService write Settings.Secure.ASSISTANT and VOICE_INTERACTION_SERVICE (set to ClaudeVoiceInteractionService). Only the system assist gesture (KEYCODE_ASSIST or long-press home) reads those settings. So the link without a package still shows the Google/Claude chooser, or goes to whichever app was set with "Always". If "Always > Google" was chosen earlier, the button opens Google even though Claude is the default. The link intent:#Intent;action=android.intent.action.VOICE_ASSIST;package=com.anthropic.claude;launchFlags=0x10000000;end opens com.anthropic.claude/.mainactivity.AssistantOverlayActivity directly, which also handles ACTION_ASSIST. Today's link with the Google package opens Google even when Claude is the default.

**behaviour if no default or none:**

Choosing "None" sets Settings.Secure.ASSISTANT to "" but does not change how intents resolve. The link behaves exactly as above: a chooser, the app remembered with "Always", or the only handler. It does not respect "None". If no app handles VOICE_ASSIST at all, WebView Kiosk's resolveActivity returns null and it shows the toast "Error handling intent: no package available for ...".

**chooser risk:**

Android shows the system chooser (ResolverActivity, with "Just once" and "Always") whenever two or more activities match with equal priority and no preferred activity is saved. That is PackageManagerService.chooseBestActivity: first findPreferredActivityNotLocked, then the resolver. Google and Claude are both at priority 0 for VOICE_ASSIST. The Google app is a priv-app (product/priv-app/Velvet) but its factory filter declares no priority, and ComponentResolver.adjustPriority stops updates from raising a priority above the system-image filter. Claude is not privileged, so its priority is capped at 0.

How to avoid it: tap "Always" once on the app that matches the Settings choice.

Caveats:
1. "Always" is a fixed PackageManager preference, not linked to the role. After changing the Digital assistant app, clear it under Settings > Apps > (chosen app) > Open by default > Clear defaults, then choose again.
2. PackageManagerService drops the preference when the set of VOICE_ASSIST handlers changes (log: "Result set changed, dropping preferred activity"). Installing another assistant app, or an update that adds or renames a handler, brings the chooser back.
3. In WebView Kiosk's lock-task (device-owner) mode, handleExternalSchemeUrl calls resolveActivity first. An ambiguous result points to the resolver in package "android", and openPackage then checks dpm.isLockTaskPermitted("android"). That is probably false, so the owner likely gets an error toast instead of a chooser. Set "Always" while the kiosk is unlocked, and add the chosen assistant package to the lock-task allowlist.

ACTION_ASSIST without a package is worse. The Google app has AssistGatewayInternal plus EnterOpaActivityFromAssist, which ships disabled and can be enabled at runtime, so Google may appear twice. Claude's AssistantOverlayActivity matches too, and so does any other assistant with an ASSIST activity: the Assistant-Chooser source launches ChatGPT's AssistantActivity with ACTION_ASSIST. Samsung GMS images pre-set ASSIST to the Google app's .SearchActivity through preferred-apps/google.xml, which also ignores the role. The Lenovo TB328FU image's google.xml has no ASSIST entry.

**chrome option:**

None that follows the role, and none that can reach Claude. Chrome cleans every intent: URL before using it (ExternalNavigationHandler.sanitizeQueryIntentActivitiesIntent): it adds CATEGORY_BROWSABLE and removes the component and selector.
- Neither Google's VOICE_ASSIST activity (QueryEntryActivity) nor Claude's ASSIST or VOICE_ASSIST filters are BROWSABLE, so VOICE_ASSIST cannot resolve from Chrome at all.
- Only the Google app's alias com.google.android.googlequicksearchbox.AssistGatewayInternal (ASSIST + DEFAULT + BROWSABLE) could match intent:#Intent;action=android.intent.action.ASSIST;S.browser_fallback_url=...;end. That would always open Google, never Claude. I have not tested it inside a Chrome installed-app window.
- No https app link means "the assistant".

**alternatives:**

Why no intent works (AOSP android12-release, unchanged in main):
- In PermissionController roles.xml, the android.app.role.ASSISTANT role has no <preferred-activities>. Only DIALER, SMS and HOME have them. ASSIST and VOICE_INTERACTION appear only inside a comment describing qualification.
- AssistantRoleBehavior.grant() and revoke() are empty.
- VoiceInteractionManagerService's onRoleHoldersChanged only writes Settings.Secure ASSISTANT and VOICE_INTERACTION_SERVICE (the service if supportsAssist, otherwise the ACTION_ASSIST activity). Holding the role never makes an app the preferred handler for ASSIST, VOICE_ASSIST, VOICE_COMMAND or SEARCH_LONG_PRESS.
- Only the system gesture honours the role: KEYCODE_ASSIST or long-press home goes to PhoneWindowManager.launchAssistAction, then SearchManager.launchAssist, then SystemUI AssistManager. That path either shows the voice-interaction session or starts ACTION_ASSIST with the explicit component from Settings. SearchManager.launchAssist is a hidden @SystemApi, and ISearchManager.launchAssist is on no hidden-API allowlist, so ordinary apps cannot call it.
- The system's own KEYCODE_VOICE_ASSIST handler and the power-menu voice-assist item fire ACTION_VOICE_ASSIST without a package, which can show a chooser.
- AOSP's Accessibility Menu "Assistant" button fires ACTION_VOICE_COMMAND without a package. Only the Google app's HandsFreeActivity handles that; Claude does not declare it, so it always opens Google.
- SEARCH_LONG_PRESS always opens Google (SearchLongPressGatewayInternal).
- ACTION_VOICE_ASSIST itself is @hide/@SystemApi, but apps can still send the string.

How other apps do it:
- Lawnchair's OpenAssistantHandler reads Settings.Secure "assistant", which is @Readable in Android 12. If that names an activity, it starts ACTION_ASSIST with that component. If it names a service, it sends ACTION_VOICE_COMMAND without a package, so a Claude voice-interaction service would still open Google.
- Assistant-Chooser hard-codes an intent for each package.
- Nova is closed source and its "Assistant" action is undocumented.
So following the role needs native code.

Options, best first:
(a) Truly follows the role: a tiny helper activity, or a Tasker/Automate task started from its shortcut. It reads Settings.Secure.getString(cr, "assistant"), takes the package from ComponentName.unflattenFromString, and starts ACTION_VOICE_ASSIST (falling back to ACTION_ASSIST) with setPackage(pkg). If the setting is empty ("None"), it opens Settings.ACTION_VOICE_INPUT_SETTINGS. The kiosk button then points at the helper with intent:#Intent;component=<helper>/<activity>;launchFlags=0x10000000;end.
(b) Exactly matches the gesture, including "None": inject `input keyevent KEYCODE_ASSIST` (219) through ADB, Shizuku or root, for example from Tasker. This needs elevated access that WebView Kiosk does not have.
(c) Simplest reliable link: a dashboard setting for the assistant package, emitting intent:#Intent;action=android.intent.action.VOICE_ASSIST;package=<pkg>;launchFlags=0x10000000;end with com.google.android.googlequicksearchbox (Google or Gemini) or com.anthropic.claude. No chooser, but it must be changed by hand to match Settings.
(d) The package-less VOICE_ASSIST link plus "Always", with the caveats in chooser_risk.

Local evidence (scratchpad/assistrole): velvet_tb328.xml (decoded Google app manifest from the TB328FU dump), tb328_google.xml, pref_samsung_*.xml, msft-mirror-aosp_* roles.xml copies, and fb12_*.java framework sources.

**confidence:** high

**sources:**

- https://android.googlesource.com/platform/packages/modules/Permission/+/refs/heads/android12-release/PermissionController/res/xml/roles.xml (read via mirror github.com/msft-mirror-aosp/platform.packages.modules.Permission android12-release and main: ASSISTANT role has no preferred-activities)
- https://android.googlesource.com/platform/packages/modules/Permission/+/refs/heads/android12-release/PermissionController/src/com/android/permissioncontroller/role/model/AssistantRoleBehavior.java (qualification via VoiceInteractionService or ACTION_ASSIST activity; grant/revoke empty)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/services/voiceinteraction/java/com/android/server/voiceinteraction/VoiceInteractionManagerService.java (onRoleHoldersChanged writes only Settings.Secure ASSISTANT/VOICE_INTERACTION_SERVICE)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/services/core/java/com/android/server/policy/PhoneWindowManager.java (launchAssistAction -> SearchManager.launchAssist; launchVoiceAssist -> ACTION_VOICE_ASSIST with no package)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/packages/SystemUI/src/com/android/systemui/assist/AssistManager.java (startAssistActivity sets explicit assist component)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/core/java/android/app/SearchManager.java and services/core/java/com/android/server/search/SearchManagerService.java (launchAssist is hidden @SystemApi)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/boot/hiddenapi/ (ISearchManager.launchAssist not in any max-target/unsupported list)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/services/core/java/com/android/server/pm/PackageManagerService.java (chooseBestActivity; findPreferredActivityNotLocked 'Result set changed, dropping preferred activity')
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/services/core/java/com/android/server/pm/ComponentResolver.java (adjustPriority: non-privileged capped at 0; updates capped to system-image filter)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/core/java/android/content/Intent.java (ACTION_ASSIST public; ACTION_VOICE_ASSIST @hide @SystemApi; ACTION_VOICE_COMMAND; ACTION_SEARCH_LONG_PRESS)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/core/java/com/android/internal/policy/PhoneFallbackEventHandler.java (VOICE_COMMAND / SEARCH_LONG_PRESS with no package)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/core/java/android/provider/Settings.java (Secure.ASSISTANT is @Readable)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/packages/SystemUI/accessibility/accessibilitymenu/src/com/android/systemui/accessibility/accessibilitymenu/AccessibilityMenuService.java (Assistant button = ACTION_VOICE_COMMAND with no package)
- https://gitlab.com/Android-Dumps/lenovo/TB328FU (Lenovo Tab M10 Gen 3, Android 12 SP1A; product/priv-app/Velvet/Velvet.apk = Google app 13.25.10.26 manifest decoded; product/etc/preferred-apps/google.xml has no ASSIST entry)
- https://github.com/sm6150-Samsung/samsung_r1q_dump/blob/HEAD/system/system/etc/preferred-apps/google.xml (Samsung GMS image pre-sets ASSIST -> googlequicksearchbox/.SearchActivity)
- https://github.com/arnodorian1337/gemini-decomp/blob/HEAD/resources/AndroidManifest.xml (Gemini app com.google.android.apps.bard 1.0.795460806: no assist filters; queries googlequicksearchbox)
- Decoded com.anthropic.claude 1.260430.10 manifest at /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad/claude-manifest.xml (from an earlier step of this session: AssistantOverlayActivity handles ASSIST and VOICE_ASSIST with DEFAULT only; ClaudeVoiceInteractionService, ClaudeRecognitionService)
- https://github.com/LawnchairLauncher/lawnchair/blob/16-dev/lawnchair/src/app/lawnchair/gestures/handlers/OpenAssistantHandler.kt
- https://github.com/Ayaanh001/Assistant-Chooser/blob/master/app/src/main/java/com/hussain/assistantchooser/data/AppLauncher.kt
- https://source.chromium.org/chromium/chromium/src/+/main:components/external_intents/android/java/src/org/chromium/components/external_intents/ExternalNavigationHandler.java (sanitizeQueryIntentActivitiesIntent adds BROWSABLE, strips component/selector)
- https://github.com/nktnet1/webview-kiosk/blob/02cf64c/app/src/main/java/uk/nktnet/webviewkiosk/utils/openIntentUtils.kt (handleExternalSchemeUrl: parseUri, then resolveActivity, then openPackage with lock-task checks)

**check:**

**best kiosk link:**

None reliable with the apps on the tablet today. The finding holds: no intent is tied to the ASSISTANT role, so no intent: URL follows the Settings choice.

The one supported way to open "the assistant, whatever had been chosen" is native code calling the public API Activity.showAssist(Bundle) (API 23+). It calls the same VoiceInteractionManagerService.showSessionForActiveService that the system assist gesture uses. A web page cannot call it, and neither WebView Kiosk nor Chrome exposes it. So the real answer is a tiny helper app (see alternatives). The kiosk button would then be intent:#Intent;component=<helper.package>/<.OpenAssistantActivity>;launchFlags=0x10000000;end.

Without a helper, the closest link is still intent:#Intent;action=android.intent.action.VOICE_ASSIST;launchFlags=0x10000000;end with no package. With Google and Claude both installed it shows a chooser until "Always" is tapped. After that it keeps opening the app picked there, whatever Settings > Default apps > Digital assistant app says later.

Today's link has package=com.google.android.googlequicksearchbox, so it always opens Google.

**behaviour if default is google:**

Confirmed against the source. A link without a package resolves the same way whatever the role holder is. On the factory Google app in the TB328FU image (13.25.10.26, product/priv-app/Velvet), VOICE_ASSIST is handled only by com.google.android.apps.gsa.queryentry.QueryEntryActivity. Its filter has categories DEFAULT and SEARCH_WIDGET and no priority. Claude's AssistantOverlayActivity also handles VOICE_ASSIST at priority 0. So:
- Both installed and no saved preference: the system chooser appears.
- After "Always > Google": opens Google directly.
- Claude not installed: opens Google directly.

Caveat: I have not confirmed that QueryEntryActivity opens the Gemini overlay rather than the older Google voice or search entry. So "Gemini or Assistant, whichever the Google app is set to" is likely but not verified. Google's help text only says Gemini is chosen inside the Google app once the Google app is the Digital assistant app.

The Gemini app (com.google.android.apps.bard 1.0.795460806) declares no ASSIST, VOICE_ASSIST or VOICE_COMMAND filter, so Gemini as the assistant still means the Google app holds the role.

With a showAssist() helper: it opens the Google app's GsaVoiceInteractionService session, the same overlay as the assist gesture.

Today's link, with the Google package set, always opens QueryEntryActivity with no chooser.

**behaviour if default is claude:**

Confirmed. Nothing changes in how intents resolve. When the role changes, VoiceInteractionManagerService's RoleObserver only writes two settings, Settings.Secure.ASSISTANT and VOICE_INTERACTION_SERVICE:
- If Claude's service declares supportsAssist and a recognitionService, both are set to com.anthropic.claude/.bell.assist.ClaudeVoiceInteractionService. The manifest ships ClaudeVoiceInteractionService, a session service and ClaudeRecognitionService, so this is likely. I could not read its voice_interaction_service.xml.
- Otherwise ASSISTANT is set to the ACTION_ASSIST activity .mainactivity.AssistantOverlayActivity and VOICE_INTERACTION_SERVICE to "".
- AssistantRoleBehavior.grant() and revoke() are empty, and the role has no <preferred-activities>.

So the link without a package still shows the Google/Claude chooser, or opens whatever "Always" saved. If "Always > Google" was chosen earlier, the button opens Google even with Claude as the default.

intent:#Intent;action=android.intent.action.VOICE_ASSIST;package=com.anthropic.claude;launchFlags=0x10000000;end opens AssistantOverlayActivity directly.

A showAssist() helper opens Claude's voice-interaction session, as the gesture does. If Claude's service does not declare supportsAssist, showAssist() returns false. The helper then falls back to the ASSISTANT activity component (AssistantOverlayActivity via ACTION_ASSIST), which is what SystemUI's AssistManager.startAssistActivity does.

Today's Google-package link opens Google even when Claude is the default.

**behaviour if no default or none:**

Confirmed. Choosing "None" empties the role. RoleObserver then sets ASSISTANT and VOICE_INTERACTION_SERVICE to "". switchImplementationIfNeededLocked sets mImpl to null, and AssistUtils.getAssistComponentForUser returns null, so the system gesture does nothing.

Intent resolution is not affected. The link without a package still gives a chooser, the app saved with "Always", or the only handler, so it does not respect "None". If no app handles VOICE_ASSIST at all, WebView Kiosk's handleExternalSchemeUrl gets null from resolveActivity. It then shows the toast "Error handling intent: no package available for ...". WebView Kiosk has QUERY_ALL_PACKAGES, so the null is not a package-visibility effect.

A showAssist() helper matches "None" correctly. showSessionForActiveService returns false when mImpl is null, so the helper can do nothing, show a message, or open Settings.ACTION_VOICE_INPUT_SETTINGS.

**chooser risk:**

Confirmed in the Android 12 PackageManagerService.chooseBestActivity:
- If the top two matches differ in priority, preferredOrder or isDefault, the first one wins.
- Otherwise findPreferredActivityNotLocked runs, and if nothing is saved the system shows ResolverActivity in package "android", with "Just once" and "Always".

Google's QueryEntryActivity and Claude's AssistantOverlayActivity both match VOICE_ASSIST with DEFAULT at priority 0. ComponentResolver.adjustPriority caps a non-privileged app at 0. It also caps an update of a privileged system app at the factory filter's priority, and at 0 for new activities or mismatched actions. So a Play Store update of either app cannot break the tie.

To avoid the chooser, tap "Always" once on the app that matches the Settings choice. Or put the package in the link, as today's link does, which never shows a chooser.

Caveats:
1. "Always" is a fixed PackageManager preference, not linked to the role. After changing the Digital assistant app, clear it under Settings > Apps > (that app) > Open by default > Clear defaults, then choose again.
2. The preference is dropped when the set of handlers grows or changes. The log line is "Result set changed, dropping preferred activity". If a handler is only removed, the preference is kept (the isSuperset branch). So installing another VOICE_ASSIST app, or an update that renames or moves the handler, brings the chooser back.
3. In WebView Kiosk's lock-task mode, handleExternalSchemeUrl uses the package from resolveActivity. For an ambiguous intent that is the resolver in "android", and openPackage checks dpm.isLockTaskPermitted("android"). Unless that is allowlisted, the owner gets the toast "Error: android is not lock task permitted in settings." instead of a chooser. Set "Always" while the kiosk is unlocked, and allowlist the assistant package, plus any helper.

ACTION_ASSIST without a package is worse:
- The Google app has AssistGatewayInternal, plus EnterOpaActivityFromAssist, which ships disabled and can be enabled at runtime.
- Claude's AssistantOverlayActivity also matches.
- Samsung GMS images pre-set ASSIST to the Google app's .SearchActivity in preferred-apps/google.xml, again ignoring the role. The TB328FU google.xml has no ASSIST or VOICE entry.

A showAssist() helper never shows a chooser.

**chrome option:**

None that follows the role. The finding was wrong that Chrome cannot reach Claude at all.

Chrome's ExternalNavigationHandler.sanitizeQueryIntentActivitiesIntent adds CATEGORY_BROWSABLE, clears the component and selector, and masks the flags. It keeps the package. So:
1. VOICE_ASSIST cannot resolve from Chrome. Neither QueryEntryActivity nor Claude's filters are BROWSABLE.
2. The Google app's com.google.android.googlequicksearchbox.AssistGatewayInternal (ASSIST + DEFAULT + BROWSABLE) can match intent:#Intent;action=android.intent.action.ASSIST;package=com.google.android.googlequicksearchbox;S.browser_fallback_url=...;end. That always opens Google. Not tested inside a Chrome installed-app window.
3. Claude can be reached as the normal app, not the assistant overlay, through its verified App Link. The manifest has autoVerify VIEW + BROWSABLE for https://claude.ai with paths /new and /chat. So https://claude.ai/new opens a new chat in the Claude app, but this is a fixed choice, not the role holder.
4. A showAssist() helper can be reached from Chrome only if it declares a BROWSABLE https App Link on a domain the owner controls (with assetlinks.json), because only https app links work in the installed-app window.

**alternatives:**

Why no intent works. Confirmed in AOSP android12-release, and the same in main:
- The ASSISTANT role in roles.xml has no <preferred-activities>. Only DIALER, SMS and HOME have them.
- AssistantRoleBehavior.grant() and revoke() are empty.
- RoleObserver only writes the Settings.Secure ASSISTANT and VOICE_INTERACTION_SERVICE values.
- The gesture (KEYCODE_ASSIST or long-press home) goes PhoneWindowManager.launchAssistAction, then SearchManager.launchAssist (@SystemApi, hidden), then SystemUI AssistManager. That shows the voice-interaction session, or starts ACTION_ASSIST with the explicit component from the ASSISTANT setting.
- PhoneWindowManager.launchVoiceAssist (the power-menu voice-assist item) sends VOICE_ASSIST with no package. The Accessibility Menu sends VOICE_COMMAND with no package, which only the Google app's HandsFreeActivity handles. SEARCH_LONG_PRESS goes to Google.
- A real-world report fits this: Lawnchair issue #5918 says its "open assistant" gesture opened Bixby while Google Assistant was the default. Its handler sends VOICE_COMMAND with no package when the default is a service.

New finding: there is a public API that follows the role. Activity.showAssist(Bundle), API 23+, is documented as "Ask to have the current assistant shown to the user". In Android 12, ActivityClientController.showAssistFromActivity:
- checks that the caller is the top, visible activity (nowVisible),
- clears the calling identity,
- calls AssistUtils.showSessionForActiveService(args, SHOW_SOURCE_APPLICATION, ...).

That reaches VoiceInteractionManagerService, which shows the session of the VOICE_INTERACTION_SERVICE set from the role. SystemUI's gesture calls the same method with SHOW_SOURCE_ASSIST_GESTURE. showAssist returns false when there is no service, which is the case for "None" or an assistant that only has an activity. Real uses: the AOSP Car KitchenSink CarAssistantFragment ("Assistant app is not available" when it returns false), XenonLauncher's TRIGGER_ASSISTANT, and secretary_app's VoiceCommandActivity.

Options, best first:
(a) Follows the role, public API. A tiny helper app with a translucent activity that:
- calls showAssist(Bundle()) once its window is showing, for example in onWindowFocusChanged(true) or onEnterAnimationComplete. Calling it in onResume can fail the nowVisible check ("is not visible"); this is untested on the device.
- if it returns false, reads Settings.Secure.getString(cr, "assistant"). That key is @Readable, and its value is a flattenToShortString component. If it names an activity, the helper starts ACTION_ASSIST with that component. If it is empty ("None"), the helper shows a message or opens Settings.ACTION_VOICE_INPUT_SETTINGS.
- then finishes.
The kiosk button uses intent:#Intent;component=<helper>/<activity>;launchFlags=0x10000000;end. In lock-task mode, allowlist the helper and the assistant packages. Another route is a feature request to WebView Kiosk: it already adds JS interfaces (Battery, Brightness, NFC), and its MainActivity is the top visible activity, so an exposed showAssist() would work there.
(b) Follows the role with no coding, as a Tasker or Automate task. Read the "assistant" secure setting, take the package with unflattenFromString, then start VOICE_ASSIST with setPackage(pkg), falling back to ACTION_ASSIST. Weaker than (a): it opens the app's VOICE_ASSIST activity rather than the assistant session.
(c) Exact gesture, including "None": `input keyevent 219` (KEYCODE_ASSIST) through ADB, Shizuku or root.
(d) Unsupported hack. Android 12's SearchManagerService.launchAssist has no permission check. A helper could call ServiceManager.getService("search") (@UnsupportedAppUsage) and send raw Binder transaction 6 with descriptor "android.app.ISearchManager", (int userId, Bundle). That reproduces the gesture exactly, but it relies on hidden APIs and is untested.
(e) A dashboard setting for the assistant package: VOICE_ASSIST with package=com.google.android.googlequicksearchbox or com.anthropic.claude. No chooser, but it must be changed by hand to match Settings.
(f) The link without a package plus "Always", with the caveats in chooser_risk.

**confidence:** high

**sources:**

- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/core/java/android/app/Activity.java (showAssist(Bundle): public, 'Ask to have the current assistant shown'; read via mirror raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/android12-release because android.googlesource.com is blocked by this sandbox's proxy)
- https://developer.android.com/reference/android/app/Activity#showAssist(android.os.Bundle)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/services/core/java/com/android/server/wm/ActivityClientController.java (showAssistFromActivity: top + nowVisible check, clearCallingIdentity, AssistUtils.showSessionForActiveService SHOW_SOURCE_APPLICATION)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/services/core/java/com/android/server/wm/ActivityRecord.java (onWindowsVisible sets nowVisible)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/services/voiceinteraction/java/com/android/server/voiceinteraction/VoiceInteractionManagerService.java (showSessionForActiveService returns false if mImpl null; switchImplementationIfNeededLocked sets null impl for empty setting; RoleObserver writes only ASSISTANT/VOICE_INTERACTION_SERVICE)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/services/voiceinteraction/java/com/android/server/voiceinteraction/VoiceInteractionManagerServiceImpl.java (showSessionLocked)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/packages/SystemUI/src/com/android/systemui/assist/AssistManager.java (gesture: startVoiceInteractor -> showSessionForActiveService SHOW_SOURCE_ASSIST_GESTURE; startAssistActivity sets explicit component)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/core/java/com/android/internal/app/AssistUtils.java (getAssistComponentForUser reads Settings.Secure.ASSISTANT)
- https://android.googlesource.com/platform/packages/modules/Permission/+/refs/heads/android12-release/PermissionController/res/xml/roles.xml (ASSISTANT role: no preferred-activities; only DIALER/SMS/HOME have them)
- https://android.googlesource.com/platform/packages/modules/Permission/+/refs/heads/android12-release/PermissionController/src/com/android/permissioncontroller/role/model/AssistantRoleBehavior.java (grant/revoke empty)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/services/core/java/com/android/server/pm/PackageManagerService.java (chooseBestActivity; findPreferredActivityNotLocked sameSet/isSuperset, 'Result set changed, dropping preferred activity')
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/services/core/java/com/android/server/pm/ComponentResolver.java (adjustPriority caps)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/services/core/java/com/android/server/policy/PhoneWindowManager.java (launchAssistAction -> SearchManager.launchAssist; launchVoiceAssist -> VOICE_ASSIST with no package)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/core/java/android/content/Intent.java (ACTION_VOICE_ASSIST @hide @SystemApi; ACTION_ASSIST public)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/core/java/android/app/SearchManager.java, core/java/android/app/ISearchManager.aidl and services/core/java/com/android/server/search/SearchManagerService.java (launchAssist @SystemApi; server side has no permission check in android12)
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/core/java/android/provider/Settings.java (Secure.ASSISTANT @Readable)
- https://android.googlesource.com/platform/packages/services/Car/+/refs/heads/master/tests/EmbeddedKitchenSinkApp/src/com/google/android/car/kitchensink/assistant/CarAssistantFragment.java (getActivity().showAssist(null), toast when false)
- https://github.com/Dinico414/XenonLauncher/blob/HEAD/app/src/main/java/com/xenonware/launcher/MainActivity.kt (TRIGGER_ASSISTANT -> showAssist(Bundle()))
- https://github.com/OtaYuduki0408/secretary_app/blob/HEAD/android_app/app/src/main/java/com/example/secretary_app/VoiceCommandActivity.kt (helper activity calling showAssist(null))
- https://github.com/LawnchairLauncher/lawnchair/blob/16-dev/lawnchair/src/app/lawnchair/gestures/handlers/OpenAssistantHandler.kt
- https://github.com/LawnchairLauncher/lawnchair/issues/5918 (assistant gesture opened Bixby while Google Assistant was default)
- https://source.chromium.org/chromium/chromium/src/+/main:components/external_intents/android/java/src/org/chromium/components/external_intents/ExternalNavigationHandler.java (sanitizeQueryIntentActivitiesIntent)
- https://github.com/nktnet1/webview-kiosk/blob/02cf64c/app/src/main/java/uk/nktnet/webviewkiosk/utils/openIntentUtils.kt and app/src/main/AndroidManifest.xml (resolveActivity -> openPackage lock-task checks; QUERY_ALL_PACKAGES)
- https://gitlab.com/Android-Dumps/lenovo/TB328FU (product/priv-app/Velvet = Google app 13.25.10.26: QueryEntryActivity VOICE_ASSIST no priority; AssistGatewayInternal ASSIST+BROWSABLE; preferred-apps google.xml has no ASSIST entry)
- https://github.com/arnodorian1337/gemini-decomp/blob/HEAD/resources/AndroidManifest.xml (Gemini 1.0.795460806: no assist filters)
- https://support.google.com/gemini/answer/14554984 (Google app must be the Digital assistant app to use Gemini; seen via search snippet, page blocked by proxy)
- Local: /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad/claude-manifest.xml (Claude 1.260430.10: AssistantOverlayActivity ASSIST+VOICE_ASSIST DEFAULT only; ClaudeVoiceInteractionService; claude.ai autoVerify app link incl. /new) and scratchpad/assistrole/fb12_*.java (downloaded framework sources)
