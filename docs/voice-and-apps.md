# Buttons and voice

## The buttons

| Button | Tap | Press and hold |
|---|---|---|
| **Camera** ("Front door") | Live view, full screen. Tap the picture to shrink it to a corner; ✕ to stop | – |
| **Spotify** | Opens Spotify | the same |
| **Claude** | Opens Claude's assistant/voice screen | Opens the Claude app normally |
| **Gemini** | Starts Gemini listening, like saying "Hey Google" | Opens the Gemini app |
| **Home** | Goes to the Android home screen | – |

The table is for **WebView Kiosk** (see [tablet.md](tablet.md)). In Chrome, Home shows a "swipe up" reminder, and Claude and Gemini open their apps' normal screens. That's a Chrome restriction on what web pages may open.

**Honest status:** the links were checked in tests, but not on a real M10.
- **Home, Spotify and Gemini** use standard Android intents that are very likely to work.
- **Claude's voice screen** uses a part of the Claude app that Anthropic doesn't document (found in the app's manifest). If a tap does nothing or shows an error, press and hold to open Claude normally, then tap its voice button. If a future Claude app update moves it, only the one line for `claude` in `web/js/launcher.js` needs changing.

## Voice: "Hey Google" (Gemini)

The tablet's own assistant does the voice side. The panel doesn't listen.

1. Install/update the **Gemini** app from the Play Store and open it once. On current Android it replaces Google Assistant as the tablet's assistant.
2. Gemini → your profile picture → **Settings → Google Assistant/"Hey Google" & Voice Match** (the wording changes between versions) → turn on **Hey Google** and train your voice. Voice Match on tablets depends on the device; if the M10 doesn't offer it, use the panel's Gemini button instead.
3. Leave the tablet's **Settings → Apps → Default apps → Digital assistant app** set to Google/Gemini.

### The shopping list

The list under the calendar is a **Google Tasks** list (set up in [google.md](google.md); choose it in ⚙ → **Choose shopping list**). On the panel, tap an item to tick it off (**Undo** is in the message that pops up) or **+** to add one. It's the same list in the Google Tasks app and in Gmail/Calendar's side panel, so anyone signed in to that Google account can add to it from their phone.

By voice: in Gemini → Settings → **Apps**, make sure **Google Tasks** is on, then say **"Hey Google, add milk to my Shopping list in Google Tasks"**. Saying "in Google Tasks" matters: without it, Gemini may put it in Google Keep instead. The panel shows new items within 2 minutes.

Honest status: tested against a fake Google Tasks, not the real one. Google/Nest speakers still send "add to my shopping list" to Google Keep, and Keep has no API a web page can read, so items added that way won't show on the panel.

### Spotify by voice

In Gemini → Settings → **Apps**, turn on **Spotify** and link your account. Then: "Hey Google, play Radio 1 on Spotify", "…play my Discover Weekly", "…pause". If you use Google/Nest speakers, also set Spotify as the default music service in the **Google Home** app → Settings → Music.

### Claude by voice

- "Hey Google, **open Claude**" opens the Claude app. Tap its voice button for a spoken conversation.
- The panel's **Claude** button tries to jump straight to Claude's voice/assistant screen (see above).
- You *could* make Claude the tablet's default assistant (Settings → Apps → Default apps → Digital assistant app), if the Claude app offers that on your version. Then "Hey Google" would no longer start Gemini, so it isn't recommended here. There's currently no separate hands-free wake word for Claude on Android.

### Gemini by voice

"Hey Google, …" works anywhere, including over the panel. The Gemini button does the same without speaking first.

## The car tile

Without Kia data ([kia.md](kia.md)) the car tile says "Kia app · Tap to open" and opens the Kia app. In the kiosk app, if it opens the wrong app or nothing, put the right app ID in ⚙ → Panel → **Car app** (the `id=…` part of the app's Play Store link). In Chrome the tile always opens the app's Play Store page (tap **Open** there), because web pages in Chrome can't launch it directly.
