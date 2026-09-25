# Buttons and voice

## The buttons

| Button | Tap | Press and hold |
|---|---|---|
| **Shopping** | Opens Google Keep (your shopping list) | the same |
| **Spotify** | Opens Spotify | the same |
| **Claude** | Opens Claude's assistant/voice screen | Opens the Claude app normally |
| **Gemini** | Starts Gemini listening, like saying "Hey Google" | Opens the Gemini app |
| **Home** | Goes to the Android home screen | – |

The table is for **WebView Kiosk** (see [tablet.md](tablet.md)). In Chrome, Home shows a "swipe up" reminder, and Claude and Gemini open their apps' normal screens. That's a Chrome restriction on what web pages may open.

**Honest status:** the links were checked in tests, but not on a real M10.
- **Home, Shopping, Spotify and Gemini** use standard Android intents that are very likely to work.
- **Claude's voice screen** uses a part of the Claude app that Anthropic doesn't document (found in the app's manifest). If a tap does nothing or shows an error, press and hold to open Claude normally, then tap its voice button. If a future Claude app update moves it, only the one line for `claude` in `web/js/launcher.js` needs changing.

## Voice: "Hey Google" (Gemini)

The tablet's own assistant does the voice side. The panel doesn't listen.

1. Install/update the **Gemini** app from the Play Store and open it once. On current Android it replaces Google Assistant as the tablet's assistant.
2. Gemini → your profile picture → **Settings → Google Assistant/"Hey Google" & Voice Match** (the wording changes between versions) → turn on **Hey Google** and train your voice. Voice Match on tablets depends on the device; if the M10 doesn't offer it, use the panel's Gemini button instead.
3. Leave the tablet's **Settings → Apps → Default apps → Digital assistant app** set to Google/Gemini.

### Shopping list by voice

"Hey Google, add milk to my shopping list" puts it in a **Google Keep** list, the same list the Shopping button opens. In Gemini this goes through its Google Keep connection (Gemini → Settings → **Apps**: make sure **Google Keep** is on). Items added from a phone, or from a Google/Nest speaker on the same account, land in the same list. In Keep, pin the list so it's at the top.

### Spotify by voice

In Gemini → Settings → **Apps**, turn on **Spotify** and link your account. Then: "Hey Google, play Radio 1 on Spotify", "…play my Discover Weekly", "…pause". If you use Google/Nest speakers, also set Spotify as the default music service in the **Google Home** app → Settings → Music.

### Claude by voice

- "Hey Google, **open Claude**" opens the Claude app. Tap its voice button for a spoken conversation.
- The panel's **Claude** button tries to jump straight to Claude's voice/assistant screen (see above).
- You *could* make Claude the tablet's default assistant (Settings → Apps → Default apps → Digital assistant app), if the Claude app offers that on your version. Then "Hey Google" would no longer start Gemini, so it isn't recommended here. There's currently no separate hands-free wake word for Claude on Android.

### Gemini by voice

"Hey Google, …" works anywhere, including over the panel. The Gemini button does the same without speaking first.

## The car tile

Without Kia data ([kia.md](kia.md)) the car tile says "Kia app · Tap to open" and opens the Kia app. If it opens the Play Store instead, put the right app ID in ⚙ → Panel → **Car app** (the `id=…` part of the app's Play Store link).
