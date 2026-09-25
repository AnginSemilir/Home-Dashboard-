# Google Calendar: today's events

**Integration:** Home Assistant's built-in **Google Calendar** integration (free).
**Card:** [Calendar Card Pro](https://github.com/alexpfau/calendar-card-pro) (HACS, free).

If you set up Nest first, you can **reuse the same Google Cloud project and OAuth client**.
Just enable the Calendar API in it (step 1) and skip steps 2–4.

## Setup

1. <https://console.cloud.google.com> → your project → enable the **Google Calendar API**.
2. **Google Auth Platform → Branding**: app name "Home Assistant", your email. Audience:
   **External**. Under Audience click **Publish app**; otherwise the login expires every 7 days.
3. **Clients → Create client** → **Web application** → Authorized redirect URI
   `https://my.home-assistant.io/redirect/oauth`. Copy the Client ID and secret.
4. Home Assistant → Settings → Devices & services → Add integration → **Google Calendar**.
   Paste the Client ID and secret, sign in, click through "Google hasn't verified this app"
   (Advanced → Go to …) and **Link account**. You can set calendar access to *read-only* in
   the integration's options.
5. Settings → Entities → filter `calendar.`:
   - Your main calendar is named after your email address, e.g.
     `calendar.yourname_gmail_com`. Rename it to something short like `calendar.sam`.
   - Shared calendars (e.g. "Family") appear as their own entities.
   - Disable ones you don't want (Birthdays, Holidays…).
6. Put the calendar's entity ID in the `calendar` setting at the top of the dashboard. To show
   more than one calendar, see [Optional tweaks](../dashboard.md#optional-tweaks).

## Notes

- The integration polls Google every **15 minutes**, so new events can take that long to
  appear. The card refreshes on the same schedule.
- Only calendars in *your* Google calendar list are available. To show a partner's calendar,
  have them share it with your Google account, then reload the integration.
- The card shows **today and tomorrow** (`days_to_show: 2`), hides events that have already
  finished, and shows all-day events as badges. Set `days_to_show: 1` for today only.
