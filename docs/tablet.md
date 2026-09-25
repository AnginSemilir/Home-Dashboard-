# The tablet: Lenovo Tab M10 (3rd gen, TB328)

The panel is a web page, so the tablet only needs something that shows it full screen and keeps the screen on.

## Recommended: WebView Kiosk (free, open source)

It's on **F-Droid** and the **Play Store** (search "WebView Kiosk"; developer nktnet1). Of the free options, it's the one that passes the panel's `intent:` links through to Android, so **all five buttons work**, including **Home** and Claude's voice screen.

1. Install it and open it.
2. Set the **URL / home page** to `https://anginsemilir.github.io/Home-Dashboard-/`
3. In its settings, turn on **keep screen on** and full screen / immersive mode if offered.

   Leave "set as default launcher / home app" **off**. Otherwise the panel's Home button would bring you straight back to the panel.
4. The panel opens its Settings screen with a checklist. Set up weather and Octopus there. Do Google in Chrome ([google.md](google.md), step 3), then copy the settings across.

Menu names differ between versions of the app. If a setting described here isn't there, look for the nearest equivalent.

## Fallback: Chrome as an app

In Chrome, open the URL → ⋮ → **Add to Home screen → Install**. It opens full screen with its own icon.

What's different in Chrome:
- **Home** can't be done by a web page in Chrome. The button shows a reminder to swipe up from the bottom edge instead.
- **Claude** opens the Claude app on a new chat (tap its voice button); press-and-hold does the same.
- **Gemini**, **Spotify** and **Shopping** open their apps.
- The **car** tile (without Kia data) opens the Kia app's Play Store page; tap **Open** there.
- Keep-screen-on uses the browser's Wake Lock, which works while the panel is in front.

The panel detects where it's running and picks the right kind of link. You can force it in ⚙ → Panel → **App buttons mode**.

## Android settings for a wall tablet

- **Display → Screen timeout**: the longest available. The kiosk app or Wake Lock keeps it on while the panel is showing. This setting matters when you're in another app.
- **Battery**: turn on Lenovo's **battery protection** (Settings → Battery; it may be called *Protection mode* or *Conservation mode*). It stops charging at about 60% so a tablet that's always plugged in lasts for years.
- **Security → Screen lock: None**, so tapping the wall panel doesn't ask for a PIN.
- **Google account**: for a shared wall panel, you can make the tablet's own Android account a household one, separate from your personal phone account. The panel's Google sign-in (Nest/Calendar) is separate from the tablet's Android account either way.
- **Start after a power cut** (optional): the free app **MacroDroid** can do "Device boot → Launch app: WebView Kiosk".
- **Brightness**: the panel dims itself to near-black from 22:30 to 06:30 (tap to wake for 5 minutes). Adaptive brightness helps too.

## Screen sizes

It's laid out for the M10's 1280×800 screen in landscape, and also tested at 1333×800 and 960×600.

## Keeping the keys safe

- **Anyone at the wall can open ⚙.** It shows your settings (keys are hidden, but **Copy settings** reveals them). For a family wall that's usually fine. If visitors use the tablet unsupervised, bear it in mind.
- **Browser storage is shared by every page on `anginsemilir.github.io`.** If you ever publish another GitHub Pages site from this GitHub account, pages on it could read the panel's settings in the same browser. So on the tablet, don't open other `anginsemilir.github.io` pages in the browser that holds the panel's settings (the kiosk app only ever opens the panel). For complete separation, give the panel its own domain (GitHub → Settings → Pages → Custom domain). That's a new address, so:
  1. **Before** switching, ⚙ → **Copy settings** (the new address starts with empty settings).
  2. Switch the domain, set the kiosk app's URL to the new address, then ⚙ → **Paste settings** there.
  3. Change the Google OAuth client's redirect URI to the new address ([google.md](google.md) step 1.5) and sign in again.
  4. If you use the Octopus proxy, change `PANEL` in the worker to the new address ([octopus.md](octopus.md#if-octopus-is-blocked)).
  5. If you use the Kia job, your key comes across with the pasted settings; nothing else changes.
