# The tablet: Lenovo Tab M10 + Fully Kiosk Browser

## 1. Which M10 do you have?

Settings → About tablet shows the model (TB-…). It matters for the Android version and
for how many screen pixels the browser has, which sets how the dashboard fits.

| Model | Screen | Latest Android | Panel layout |
|---|---|---|---|
| Tab M10 Plus (3rd gen) TB125FU / TB128FU | 2000×1200 | 13 | Full layout ✅ |
| Tab M10 5G TB360ZU | 2000×1200 | 13–14 | Full layout ✅ |
| Tab M10 (3rd gen) TB328FU | 1920×1200 | 12 | Full layout ✅ |
| Tab M10 FHD Plus (2nd gen) TB-X606F | 1920×1200 | 10 | Full layout ✅ (old Android, see note) |
| Tab M10 HD (2nd gen) TB-X306F | 1280×800 | 10–11 | Compact layout (automatic) |

> **Older models on Android 10/11** still run Home Assistant and Fully Kiosk. However,
> the current Claude app may need Android 12 or newer (reports conflict). Try installing
> Claude from the Play Store before relying on the Claude button.

The dashboard is laid out for a browser area of **1280×800** (what a 1920×1200 or 2000×1200
tablet gives at normal display size). Below 700 px high, it switches automatically to a
compact version of the tiles. If something is cut off on your tablet, go to Android
Settings → Display → **Display size** and choose one step smaller.

## 2. Android settings

- **System updates**: install everything, and update **Android System WebView** and
  **Chrome** in the Play Store (the dashboard runs in WebView).
- **Screen lock**: *None* (Settings → Security). It's a wall panel, and Gemini won't read
  your list or calendar from a locked screen.
- **Battery protection** (Settings → Battery, on newer M10s under *Battery optimization*):
  **ON**. This holds the battery at about 40–60% instead of 100%, 24/7. A permanently full
  lithium battery in a warm wall mount can swell. If your model doesn't have this, see
  [the smart-plug option](#6-battery-care-if-your-m10-has-no-battery-protection) below.
- **Display**: landscape, auto-rotate off. Dark theme on (easier on the eyes at night).
- **Default apps** → Digital assistant app: **Google / Gemini**. See [voice](voice-and-apps.md).
- **Home app**: leave it as Lenovo's launcher. Don't make Fully Kiosk the home app,
  otherwise the panel's **Home** button can't take you to your apps.

## 3. Fully Kiosk Browser (recommended)

Install **Fully Kiosk Browser** from the Play Store and buy **PLUS** (€7.90 once, from
Fully's menu). The free version works but shows a watermark on PLUS features, and the
buttons, motion wake and Home Assistant integration all need PLUS.

In Fully's **Settings** (names are from Fully 1.6x; the section a setting sits in can
differ slightly between versions):

| Section | Setting | Value |
|---|---|---|
| Web Content | **Start URL** | `http://homeassistant.local:8123/wall-panel/home`. If that name doesn't resolve on your network, use the HA box's IP, e.g. `http://192.168.1.20:8123/wall-panel/home` |
| Web Content | Autoplay videos | ON (for the camera) |
| Advanced Web Settings | **Enable JavaScript Interface** | ON (the app buttons use it) |
| Web Content | URL whitelist | `http://homeassistant.local:8123/*` (so only your HA can use the JavaScript interface) |
| Device Management | **Launch on boot** | ON |
| Device Management | **Keep screen on** | ON |
| Device Management | Unlock screen | ON |
| Screensaver | Screensaver timer | 120 s |
| Screensaver | Screensaver wallpaper URL | `fully://color#000000` (black) |
| Screensaver | Screensaver brightness | 0–5 |
| Motion Detection | **Enable visual motion detection** | ON (uses the front camera) |
| Motion Detection | Exit screensaver on motion | ON |
| Motion Detection | Acoustic motion detection | **OFF** (leave the microphone to "Hey Google") |
| Remote Administration | Enable remote admin (from local network) | ON, with a password (needed for the HA integration) |
| Kiosk Mode | Enable kiosk mode | **OFF** (it would block the buttons from opening other apps) |

Log in to Home Assistant **once** in Fully with the `panel` user from
[the Home Assistant guide](home-assistant.md#5-a-user-for-the-tablet). Fully remembers the login.

**Why a screensaver instead of screen-off?** A black screensaver at near-zero brightness
looks off. But the camera-based motion wake keeps working, and "Hey Google" keeps
listening (on many budget tablets it doesn't with the screen truly off).

### Connect Fully to Home Assistant (for the optional automations)

Settings → Devices & services → **Add integration → Fully Kiosk Browser**. Enter the tablet's
IP address and the remote admin password. Then open the new device and **rename it to
`Wall panel`**, and say yes to renaming its entities too. The
[extras package](../homeassistant/packages/wall_panel.yaml) expects entity IDs like
`button.wall_panel_load_start_url`.

## 4. Getting around

- **Leave the panel:** tap **Home**. You're on the normal Android home screen with your apps.
- **Back to the panel:** tap the Fully Kiosk icon. With the extras package installed, the
  panel also comes back by itself after 10 minutes in another app. Music keeps playing.
- **Edit the dashboard on the tablet:** open the start URL with `?disable_km` on the end to
  show Home Assistant's menus.
- **Fully's own settings:** swipe in from the left edge of the screen to open Fully's menu, then Settings.

## 5. Free alternative: the Home Assistant Companion app

If you'd rather not buy Fully PLUS, install the **Home Assistant** app, log in as `panel`,
and open the dashboard in it (Settings → Companion app → Other settings → **Keep screen
on**). The app buttons work: the Companion app hands the buttons' `intent:` links to
Android. You lose motion wake, the screensaver and the Fully automations. The screen stays
at full brightness unless you add a brightness automation (the Companion app's
`command_screen_brightness_level` notification).

## 6. Battery care if your M10 has no battery protection

Plug the charger into a **smart plug** that Home Assistant can switch. Name the plug's
switch `switch.wall_panel_charger`. The extras package then keeps the battery between 30%
and 80%, using the battery level Fully Kiosk reports. If the plug is missing, the
automation does nothing.

## 7. Mounting

- A landscape wall bracket or recessed mount with a **right-angle USB-C** cable. Run power
  to a socket or a USB wall plate, and use a good 10 W+ adapter.
- Put it where someone standing in front of it is within 1–2 m of the front camera (motion
  wake) and away from direct sun (heat and glare).
- The M10 has an IPS LCD, so permanent burn-in isn't a real risk. The night screensaver
  also avoids temporary image retention.
