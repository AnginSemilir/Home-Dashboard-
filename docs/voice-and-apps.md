# Voice, shopping list, Spotify, Claude and Gemini

**The approach:** don't build any voice features. The tablet already has a very good
always-listening assistant, **Gemini ("Hey Google")**. The dashboard's job is to show
information and to offer one-tap buttons into the right apps. Gemini (or Claude) handles
the talking.

| Want | Say / tap | How it works |
|---|---|---|
| Add to shopping list | "Hey Google, add milk to my shopping list" | Gemini adds it to your **Google Keep** list called "Shopping list" |
| See the shopping list | **Shopping** button | Opens Google Keep |
| Music | "Hey Google, play Radio 2 on Spotify" / **Spotify** button | Gemini's Spotify connection / opens Spotify |
| Talk to Claude | **Claude** button | Opens Claude in voice mode (see below) |
| Claude by voice | "Hey Google, open Claude", then tap the voice icon | Gemini opens the app |
| Gemini | "Hey Google…" / **Gemini** button | Opens Gemini listening |
| Leave the panel | **Home** button | Goes to the normal Android home screen |

## 1. Gemini as the tablet's assistant

Google has been removing Google Assistant from Android phones and tablets since
**September 2026**, so "Hey Google" now means Gemini. On the tablet:

1. Update the **Google** app and install/update **Gemini** from the Play Store. Gemini needs
   Android 10+ and at least 2 GB RAM, which every Tab M10 from the last few years has.
2. Settings → Apps → Default apps → **Digital assistant app** → Google/Gemini.
3. Gemini → Settings → **Hey Google & Voice Match**. Turn it on and train your voice. Add
   other household members' voices from their own phones/accounts if you like.
4. Gemini → Settings → turn on **Gemini on lock screen**, and set the tablet's **Screen lock**
   to **None**. Otherwise Gemini asks you to unlock before it will touch Keep or Calendar.
5. Test with the dashboard showing: "Hey Google, what's the weather?"

> Budget tablets don't always hear "Hey Google" with the **screen off**. The tablet guide
> therefore keeps the screen on but dimmed, rather than off, during the day. Test yours.

## 2. Shopping list: Google Keep

Gemini writes shopping items to **Google Keep**. Google removed third-party list apps
(Bring!, AnyList…) from its assistant in 2023, so to add items by voice the list has to
live in Keep.

1. In Google Keep, make sure there is **exactly one** checklist titled **Shopping list**.
   Share it with the rest of the household (⋮ → Collaborator). If there are two lists with
   similar names, Gemini may add to the wrong one.
2. Gemini → Settings → **Apps** (connected apps) → make sure **Google Keep** is on.
3. Test: "Hey Google, add milk to my shopping list". It should appear in Keep on the tablet
   and on everyone's phones. Nest/Google Home speakers add to the same list.
4. The **Shopping** button on the panel opens Keep. Tip: pin the Shopping list note in Keep
   so it's at the top.

*Optional:* to see the list on the panel itself, the unofficial HACS integration
**Google Keep Sync** creates `todo.google_keep_shopping_list`, which you can show with a
core `todo-list` card. It needs a Google "master token" and only picks up changes from Keep
every 15 minutes, which is why it isn't part of the default panel.

## 3. Spotify

1. Install Spotify on the tablet and sign in. You need **Premium** to ask for a specific song.
2. Gemini → Settings → **Apps** → connect **Spotify**.
3. "Hey Google, play Taylor Swift **on Spotify**". Say "on Spotify" unless Spotify is the
   only music app you've connected. Music plays on the tablet's speaker. Use Spotify's
   device picker to send it to another speaker.

The **Spotify** button just opens the app.

## 4. Claude

Install **Claude** (by Anthropic) from the Play Store and sign in.

- **Button:** the **Claude** button opens Claude's *assistant overlay*, the same screen
  Android shows when Claude is set as the assistant. It is designed for talking to Claude.
  Anthropic doesn't publish a "start voice mode" link. This entry point comes from the app
  itself and could change in a future app update. If a Claude update breaks the button,
  change it to open the app normally (the fallback is in the dashboard file, next to the
  button), then tap the **sound-wave** icon to start voice mode.
- **By voice:** "Hey Google, open Claude" opens the app, then tap the sound-wave icon.
  Android only lets one app have a wake word, and that's Gemini.
- **Why not make Claude the default assistant?** You can (Settings → Default apps → Digital
  assistant app → Claude). But then "Hey Google" stops working on the tablet, Claude still
  has no wake word, and Android has been known to reset the choice when Claude updates. For
  a shared wall panel, keep Gemini as the assistant.

### Optional: hands-free Claude that can also control the house

Home Assistant has an official **Anthropic** integration that can use Claude as the
"brain" of Home Assistant's own voice assistant (Assist). A dashboard button with
`tap_action: {action: assist, start_listening: true}` then talks to Claude, and Claude can
also see and control your Home Assistant devices. Things to know first:

- It's billed **per use** on a separate Anthropic API account (console.anthropic.com), not
  your Claude.ai subscription.
- The voice is Home Assistant's text-to-speech (Piper or Home Assistant Cloud), not the Claude
  app's voice.
- In Fully Kiosk the browser blocks the microphone unless Home Assistant is served over
  **HTTPS**. It works without HTTPS in the Home Assistant Companion app.

It's a nice upgrade, but it isn't needed for what you asked for, so it isn't in the default panel.

## 5. Gemini and Home buttons

- **Gemini** starts the Google app's voice-assist entry point (Gemini listening). If
  your tablet opens something else, the dashboard file has a fallback that opens the Gemini
  app instead.
- **Home** sends Android's standard "go to home screen" intent, so you can get to your
  other apps. The tablet guide shows how to get back to the dashboard.

## Test the buttons with ADB (optional, for tinkerers)

With USB debugging on:

```bash
adb shell am start -a android.intent.action.VOICE_ASSIST -n com.anthropic.claude/.mainactivity.AssistantOverlayActivity
adb shell am start -a android.intent.action.VOICE_ASSIST -p com.google.android.googlequicksearchbox
adb shell monkey -p com.google.android.keep -c android.intent.category.LAUNCHER 1
```
