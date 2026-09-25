# Google: Nest camera, thermostat and Calendar

One Google sign-in covers all three. You create your own small "app" in Google Cloud, so the panel talks to Google as you, with nothing in between. It takes about 30 minutes, once.

You need a computer (easier) or the tablet, and the Google account that owns your Nest devices.

## 1. Google Cloud project (free)

1. Go to <https://console.cloud.google.com/>, and create a project (top bar → project picker → **New project**). Call it `Home panel`.
2. **APIs & Services → Library**. Search for and **Enable** both of these:
   - **Smart Device Management API**
   - **Google Calendar API**
3. **Google Auth Platform** (older consoles: **OAuth consent screen**) → **Get started**:
   - App name `Home panel`, your email as the support and contact address.
   - Audience: **External**.
4. **Audience → Test users → Add users**: add your Google account (the one that owns the Nest devices).
5. **Clients** (older consoles: **Credentials → Create credentials → OAuth client ID**):
   - Application type: **Web application**.
   - Name: `Home panel`.
   - **Authorised redirect URIs → Add URI**: `https://anginsemilir.github.io/Home-Dashboard-/`
     (exactly this, including the `/` at the end; the panel's Settings screen shows the exact value to copy).
   - **Create**, then copy the **Client ID** and the **Client secret**.

     **Save the client secret somewhere now.** Google only shows it in full once.
6. **Publish the app**: **Audience → Publish app → Confirm**.

   While an app is in "Testing", Google signs you out of it every 7 days, so the panel would stop after a week. When published, you'll see a "Google hasn't verified this app" warning when you sign in. That's expected for a personal app: click **Advanced → Go to Home panel (unsafe)**. It's your own app; nobody else uses it.

   (If you only want Calendar and not Nest, you can stop here and skip step 2.)

## 2. Nest Device Access (US$5, one-off)

1. Go to <https://console.nest.google.com/device-access>, accept the terms and pay the **US$5** fee.
2. **Create project**:
   - Name: `Home panel`.
   - **OAuth client ID**: paste the client ID from step 1.5.
   - **Events**: leave off. The panel doesn't need them.
3. Copy the **Project ID** (a long code like `a1b2c3d4-…`).

## 3. Sign in from the panel, in Chrome on the tablet

Google refuses sign-ins inside kiosk apps (you'd see `disallowed_useragent`), so do this one step in **Chrome**, then move the settings across.

1. In Chrome on the tablet, open `https://anginsemilir.github.io/Home-Dashboard-/`, then the ⚙ (top right of the clock card).

   If you've already set up weather/Octopus in the kiosk app, first use **Copy settings** there and **Paste settings** in Chrome, so nothing is lost.
2. Under **Google**, paste the **client ID**, **client secret** and **Device Access project ID**.
3. **Sign in with Google**:
   - Pick the account that owns the Nest devices.
   - Google's "partner connection" page lists your homes and devices. **Switch on the thermostat and the camera**, and allow Calendar.
   - Click past the "unverified app" warning (above).
4. You're sent back to the panel with "Signed in to Google" and Settings open. Then:
   - **Choose camera & thermostat**: tick the camera and the thermostat.
   - **Choose calendars**: tick the ones to show (family, bins, school…).
   - Tick or untick **Battery-powered camera** under Panel.
   - **Save & close.**
5. Move it all into the kiosk app: ⚙ → **Copy settings** in Chrome, then in WebView Kiosk ⚙ → paste into the box → **Paste settings**. (If the clipboard doesn't carry over, the text appears in the box to copy by hand.) The copied text contains your keys, so paste it only into the panel.

## Which cameras work

The live view uses WebRTC, which Google offers for the newer Nest devices: **Nest Cam (battery)**, **Nest Doorbell (battery)**, **Nest Cam (wired, 2nd gen)**, **Nest Cam with floodlight** and **Nest Doorbell (wired, 2nd gen)**. Older cameras (Nest Cam IQ, Nest Cam Indoor/Outdoor) only offer RTSP streams, which a web page can't play. The thermostat part works either way.

A battery camera sleeps. After you tap it may take a few seconds to show video. If nothing arrives within 30 seconds, the panel stops and says so. Google cuts battery streams at 5 minutes, so the panel stops them then too (the countdown is at the top right of the live view).

## Is it safe to keep the client secret on the tablet?

For a personal panel, yes. Google's own sample web app for Nest works the same way. The secret only works together with your redirect address (your GitHub Pages site) and your own Google sign-in. It never leaves the tablet except to go to Google. To revoke everything at once: <https://myaccount.google.com/permissions> → Home panel → Remove access, or delete the OAuth client in Cloud Console.

## If Google stops working

- **"Google sign-in expired or was revoked: sign in again"**: the app is still in Testing (step 1.6), or you removed access. Publish it, then Sign in again (in Chrome, then Copy/Paste settings).
- **`redirect_uri_mismatch`**: the redirect URI in the OAuth client must match what the panel's Settings screen shows, character for character.
- **`disallowed_useragent`**: you tried to sign in inside the kiosk app. Use Chrome (step 3).
- **Thermostat or camera missing from "Choose camera & thermostat"**: you didn't switch them on in the partner connection page. Sign in again and switch them on, or change it at <https://nestservices.google.com/partnerconnections>.
