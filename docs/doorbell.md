# Doorbell: live view and a chime when someone rings

When someone presses the Nest doorbell:
- the panel lights up, even during night dimming;
- the doorbell's live view fills the screen, with **"Someone's at the door"** across the top;
- a two-note chime plays.

✕ closes it. Nobody touching it closes it after 2 minutes, and a battery doorbell's live view stops after 5 minutes anyway.

It usually arrives 2–5 seconds after the press, and occasionally up to 30.

It only works **while the panel is the app on screen**. A web page can't turn the screen on or bring itself to the front, so keep the screen on (see the end of this page). If Spotify, Claude or Gemini is in front, nothing pops up. A press in the last minute still shows when you come back to the panel.

The research behind this, with sources, is in [research/2026-09-27-doorbell.md](research/2026-09-27-doorbell.md).

## Before you start

- **Doorbell model.** In the Google Home app, open the doorbell → Settings → device information. If it says **Nest Doorbell (wired, 3rd gen)**, this won't work yet: Google doesn't send that model's presses (a known Google bug). The battery doorbell and the older wired ones are fine. You can still use the Google Home alert at the end of this page.
- **Your Google Cloud project ID.** In <https://console.cloud.google.com>, open the project picker at the top and look at the **ID** column (like `home-panel-123456`). Use the project the panel's OAuth client is in. The ID is not the Device Access project ID (`a1b2c3d4-…`) and not the project number. Below it's written `<cloud-id>`.

## One-off setup (about 20 minutes)

### 1. Billing
1. Google Cloud → **Billing**: check the project is linked to your billing account. The free trial's account is fine for now.
2. **Before the free trial ends** (90 days, or when the credit is used), go to **Billing → Account overview → Upgrade**. If you don't, the doorbell alerts stop when the trial ends.
3. The expected cost is **£0**: Pub/Sub's first 10 GiB a month are free, and the panel uses well under that.
4. Optional: **Billing → Budgets & alerts → Create budget**, £1, with email alerts.

### 2. Turn on Pub/Sub
**APIs & Services → Library** → **Cloud Pub/Sub API** → **Enable**.

### 3. The topic (where Google posts the presses)
1. **Pub/Sub → Topics → Create topic**.
2. **Topic ID:** `nest-events`. Untick the option to add a default subscription → **Create**.
3. Open the topic → **Permissions** tab → **Add principal**:
   - **New principals:** `sdm-publisher@googlegroups.com`
   - **Role:** Pub/Sub → **Pub/Sub Publisher**
   - Click **Save**.

   Do this on the topic's own Permissions tab, not on the IAM page.

### 4. Tell Device Access to use it
1. Open <https://console.nest.google.com/device-access> → your **Home panel** project.
2. Next to **Pub/Sub topic**, tap **⋮ → Enable events with PubSub topic**.
3. Paste `projects/<cloud-id>/topics/nest-events` → **Add & Validate**. If it fails, redo step 3.3.

### 5. The panel's subscription
**Pub/Sub → Subscriptions → Create subscription**:

| Field | Value |
|---|---|
| Subscription ID | `panel-doorbell` |
| Topic | `projects/<cloud-id>/topics/nest-events` |
| Delivery type | **Pull** |
| Message retention duration | **10 minutes** |
| Expiration period | **Never expire** (the default deletes it after 31 days unused) |
| Acknowledgement deadline | 10 seconds |
| Everything else | as it is |

Then **Create**, and copy its full name: `projects/<cloud-id>/subscriptions/panel-doorbell`.

Use it for one screen only. Two screens on one subscription would share out the presses between them.

### 6. Google Home app
In the Google Home app, go to the doorbell → **Settings → Notifications**. Turn **Push notifications** on and **Away-only** off. Without these, Google sends nothing to the panel either.

### 7. The panel (in **Chrome** on the tablet, because Google blocks sign-in inside kiosk apps)
1. ⚙ → **Google** → paste the name from step 5 into **Doorbell subscription**. The line under it says if it's the wrong thing, for example the topic.
2. **Sign in with Google** with the account that owns the Nest devices and the Cloud project.
   - On Google's Nest page, keep the doorbell on and allow its events.
   - Click past the "unverified app" warning ([google.md](google.md)).
   - **Make sure every box is ticked** (or tick **Select all**), including *View and manage Pub/Sub*.
3. **Choose camera & thermostat**: tick the doorbell as the camera → **Save & close**.
4. ⚙ → **Test chime**: you should hear a ding-dong. **Test doorbell** shows the pop-up as if someone had rung.
5. ⚙ → **Copy settings**, then in WebView Kiosk ⚙ → **Paste settings**. Then close the Chrome tab, so only one copy of the panel is listening.

### 8. Sound and screen on the tablet
- **WebView Kiosk → Settings → Web Engine → Media Playback Requires User Gesture → Off.** The chime should play without this, but it's a safety net.
- **WebView Kiosk → Settings → Device → Keep Screen On → On.**
- Turn the **media** volume up (press a volume key and use the media slider). The chime uses media volume, not the ringer.
- In a plain Chrome tab the panel says **"Tap once to turn on the doorbell sound"** after each start. The kiosk app and an installed Chrome app don't need that tap.

The checklist in ⚙ has a line, **Doorbell alerts**, that says what's wrong in plain words if something isn't set up.

## Making it louder (without turning the music up)

A web page can't change the tablet's volume, and its sound always plays at the **media** volume, the same one your music uses. So:

- **The panel's chime is made as loud as it can be at any volume.** It uses a bright bell tone, stays near full level instead of fading, and plays three times. Measured against the first version, it's about 9 dB louder, roughly twice as loud to the ear, at the same volume setting.
- **Music gets out of the way.** If Spotify is connected and playing, the panel pauses it while the doorbell rings and carries on when you close the doorbell view.
- **Bluetooth speakers:** the chime waits half a second before playing, so a speaker that has dozed off doesn't swallow the first note.

**Want it louder still, on its own volume?** Android has a separate **alarm** volume. The free app **MacroDroid** can play a doorbell sound on that volume whenever Google Home announces a press, leaving the media volume alone. This isn't tested on your tablet, so check where the sound comes out: on some tablets alarms play on the built-in speaker as well as, or instead of, the Bluetooth one.
1. Set up **the Google Home alert** below, so Google Home tells the tablet about presses. You can set that alert to **Silent** in step 3; MacroDroid still sees it.
2. Android **Settings → Sound → Alarm volume**: turn it up. It's separate from the media volume.
3. In MacroDroid, **Add macro**:
   - **Trigger:** Notification → **Notification received** → application **Home** (Google Home) → text contains your doorbell's name (for example `Front door`).
   - **Action:** Media → **Play/Stop sound** → pick a loud sound, and set its stream to **Alarm** if the option is offered.
   - Give MacroDroid the notification access it asks for, and turn off battery optimisation for it.
4. Press the doorbell to test.

If you have Google Nest speakers, the Google Home app can also make them chime or announce the doorbell: **Doorbell → Settings → Chimes / Announcements** (menu names vary).

## If nothing happens

- **Did Google send anything?** Google Cloud → **Pub/Sub → Topics → nest-events → Metrics**: does *Published message count* go up when you press the bell?
  - If not, recheck steps 3.3, 4, 6 and 7.2. The Nest permissions can also be changed at <https://nestservices.google.com/partnerconnections>.
- **Don't press "Pull" on `panel-doorbell`** in the console: that takes the message away from the panel. To look, make a second subscription (for example `debug`) on the topic, pull from that, then delete it.
- **Messages in the panel's checklist:**
  - "can't find the doorbell subscription": the name is wrong, or the subscription expired. Recreate it with Never expire.
  - "Cloud Pub/Sub API is switched off": step 2.
  - "doesn't allow doorbell alerts": sign in again, ticking every box.
  - "billing is off": step 1.2.

## The Google Home alert (works today, and a backup)

This needs no panel setup. A press shows a banner with a sound over the panel, and tapping it opens the doorbell in the Google Home app (Back returns to the panel).
1. Install **Google Home** on the tablet and sign in.
2. Doorbell → **Settings → Notifications**: **Push notifications** on.
3. Tablet **Settings → Apps → Home → Notifications**: allowed. For the doorbell alerts, set **Alerting**, **Pop on screen** on, and choose a **Sound**. Optionally **Override Do Not Disturb**.
4. In WebView Kiosk, don't use **Lock** (screen pinning): it hides other apps' alerts.

With the panel's own pop-up set up too, you'll get both. To quieten Google Home's on the tablet, set its doorbell alerts to **Silent** in step 3. Don't turn Push off in the Google Home app: the panel needs it.
