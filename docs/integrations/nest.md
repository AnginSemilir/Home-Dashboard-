# Google Nest: camera live view + thermostat temperature

**Integration:** Home Assistant's built-in **Google Nest** integration, which uses Google's
Smart Device Management (SDM) API. One integration gives you both the camera and the
thermostat.

**Cost:** a one-time, non-refundable **US$5** Google Device Access fee. Google Cloud and
Pub/Sub stay within the free tier for home use.

> "best thermostat" in the brief is assumed to be a **Nest** thermostat, since Nest is the
> Google-home one. If it's actually Hive, tado, Drayton Wiser or similar, add that
> integration instead and point the `thermostat` setting at its `climate.*` entity.
> The panel works the same way.

## Check your devices first (before paying $5)

| Device | Works? | Panel behaviour |
|---|---|---|
| Nest Cam (indoor, wired), Nest Cam with floodlight, Nest Doorbell (wired, 2nd gen) | ✅ WebRTC | Always-live tile |
| Nest Cam (outdoor, battery), Nest Doorbell (battery) | ✅ WebRTC, but Google **stops battery streams after about 5 minutes** | Use the "tap for live" variant (see below) |
| Older Nest Cam Indoor/Outdoor/IQ, Nest Hello (still in the Nest app) | ✅ RTSP | Always-live tile; snapshots also work |
| Nest Cam Indoor (wired, **3rd gen, 2025 "2K"**) | ⚠️ Reported **not exposed** by the API (late 2025). Check before paying | none |
| Nest Doorbell (wired, 3rd gen) | ✅ live view, motion and person; ring events reported broken (2026) | Always-live tile |
| Nest Learning Thermostat **1st/2nd gen** | ❌ Google ended cloud support on 25 Oct 2025 | none |
| Nest Learning Thermostat 3rd gen, Nest Thermostat E | ✅ | Indoor temperature tile |

Find your model in the Google Home app → device → Settings → Device information.

## Setup (about 30 minutes)

Use a **personal @gmail account**, the one that owns your Google Home.
Google Workspace and Advanced Protection accounts are **not** supported, and you can't
change the account afterwards.

1. **Google Cloud project**: <https://console.cloud.google.com> → create a project and note
   its **Project ID**. Enable the **Smart Device Management API** and the **Cloud Pub/Sub API**.
2. **Google Auth Platform**:
   - **Branding**: fill in the app name and the two email fields only. Adding a logo or
     domains makes Google require app verification.
   - **Audience**: User type **External**, add your gmail as a test user, then click
     **Publish app** so the status says **In production**. In "Testing" status, the login
     expires every 7 days.
3. **Credentials** → Create **OAuth client ID** → type **Web application** → Authorized redirect URI
   `https://my.home-assistant.io/redirect/oauth`. Copy the **Client ID** and **Client secret**.
   You can't view the secret again later.
4. **Device Access Console**: <https://console.nest.google.com/device-access>. Accept the terms,
   pay the US$5 and create a project with the OAuth Client ID from step 3. Leave events off
   for now. Note the **Device Access Project ID**.
5. **Pub/Sub** (Google stopped creating this for you in Jan 2025):
   - Create topic `home-assistant-nest`.
   - On the **topic's Permissions tab** (not project IAM), add principal
     `sdm-publisher@googlegroups.com` with the role **Pub/Sub Publisher**.
   - Back in the Device Access Console → your project → ⋮ → **Enable events with PubSub topic** →
     `projects/<cloud-project-id>/topics/home-assistant-nest` → Add & Validate.
6. **Home Assistant** → Settings → Devices & services → Add integration → **Google Nest**.
   - Enter the IDs and credentials from the steps above and sign in with Google.
   - Tick **every** permission (thermostat, camera live stream, camera/doorbell events).
   - Click through the "Google hasn't verified this app" screen (Advanced → Go to …).
   - Choose the topic and let HA create the subscription.
7. Optional but recommended: Google Cloud → Pub/Sub → **Subscriptions**. Edit the one HA
   created and set **Expiration** to *Never expire*. Otherwise it's deleted after 31 days
   without activity, for example if HA is switched off for a month.

## Entities the panel uses

- Camera: `camera.<device name>`, e.g. `camera.front_door`. This goes in the `camera` setting.
- Thermostat: `climate.<device name>`, e.g. `climate.hallway`. This goes in the `thermostat`
  setting. The tile shows `current_temperature`. There is also a
  `sensor.<device name>_temperature`.

The device name is the name you gave it in Google Home, or the room name if you didn't
name it. **Rename devices in Google Home before adding the integration** to get tidy
entity IDs.

## Camera notes

- The dashboard uses `camera_view: live`. This is **required**: WebRTC Nest cameras don't
  provide still snapshots, so the default `auto` view only ever shows a grey placeholder.
- **Battery cameras/doorbells:** in the dashboard's camera card, replace the
  `picture-entity` card with the "tap for live" tile shown in the comment above it.
  Otherwise the live view freezes after 5 minutes and drains the battery.
- The stream comes from Google's cloud, not your local network, so the tablet uses a
  steady 1–2 Mbps of your broadband while the dashboard shows it. Home Assistant renews
  Google's 5-minute stream sessions automatically. If the page is hidden (screen off, or
  another app in front), the HA frontend drops the stream after 60 seconds and restarts it
  (1–3 s) when the dashboard comes back.
- If the image freezes after many hours, a nightly Fully Kiosk "reload start URL" fixes it.
  The optional package includes an automation for this.
- In the Google Home app, if cameras are set to switch off when you're home, the panel will
  show nothing at those times.
