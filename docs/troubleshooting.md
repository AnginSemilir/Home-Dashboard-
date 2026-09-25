# Troubleshooting

## The dots

Each card has a small dot in its corner when something's wrong:

- **Amber:** the data is older than it should be (for example, the Home Mini hasn't sent a new reading for 45 minutes: tap for when it last did). The card still shows the last good values.
- **Red:** the last attempt failed. **Tap the card** to see why.

The panel retries by itself, waiting longer each time (30 seconds up to 15 minutes), so a short internet or service outage fixes itself. The ⚙ Settings screen's **setup checklist** shows ✓ (working), ✗ (failing, with the reason), … (set up, checked after Save & close) or ○ (not set up) for every part.

## Common problems

| What you see | Why | Fix |
|---|---|---|
| The URL shows a GitHub 404 page | GitHub Pages isn't on yet | Settings → Pages → Source: **GitHub Actions**, then Actions → Test and publish → Re-run |
| Octopus ✗ "Network error (… blocked a browser request)", weather ✓ | Octopus blocks this browser | The proxy in [octopus.md](octopus.md#if-octopus-is-blocked) |
| Octopus ✗ "Add https://… to connect-src in web/index.html first" | The proxy's address isn't on the page's allowed list | Step 5 of the proxy instructions in [octopus.md](octopus.md#if-octopus-is-blocked) |
| Today so far shows "–" | Some of today's usage has no known price yet (e.g. prices couldn't be fetched) | It fills in once prices load; see the price card's dot |
| Calendar red dot, "Couldn't read "…"" | One chosen calendar failed (removed or unshared); the others still show | ⚙ → Choose calendars again |
| Octopus ✗ "Octopus rejected the API key" | Key or account number mistyped | Copy them again from the Octopus website |
| Home Mini "not found" after Connect | Home Mini not paired, or on a different account | Check the Octopus app shows live usage |
| Using now: amber dot, "No new Home Mini reading since …" | The Home Mini has stopped reporting | Check it's plugged in and on Wi-Fi; the Octopus app will show the same gap |
| Home Mini red dot, "Octopus rate limit reached" | Too many Octopus requests this hour | It backs off by itself. Raise ⚙ → Octopus → Home Mini refresh to 90–120 s |
| Google ✗ "sign in again" | The Google app is still in *Testing* (7-day limit), or access was removed | [google.md](google.md) step 1.6, then sign in again in Chrome and Copy/Paste settings |
| `disallowed_useragent` when signing in | Google blocks sign-in inside kiosk apps | Sign in in Chrome, then copy settings across ([google.md](google.md), step 3) |
| `redirect_uri_mismatch` | OAuth client's redirect URI differs | Must be exactly `https://anginsemilir.github.io/Home-Dashboard-/` |
| Camera: "The camera didn't send any video" | Battery camera asleep or offline, or poor Wi-Fi at the camera | Tap again; check it in the Google Home app |
| Camera card says "Set up Nest in Settings" | No camera chosen | ⚙ → Choose camera & thermostat |
| Chart says "prices from ~4pm" | Tomorrow's Agile prices aren't published yet | Normal; they appear after about 4pm |
| A button does nothing | Its app isn't installed, or Chrome restrictions | See [voice-and-apps.md](voice-and-apps.md); in Chrome, Home can't work |
| Screen turns off | Wake lock lost when another app was in front | Kiosk app's keep-screen-on setting; longest Android screen timeout |
| Kia ✗ | See [kia.md](kia.md#if-it-fails) | |

## Starting again

- **Reload:** ⚙ → Save & close (or the kiosk app's reload). The panel also reloads itself every night at 03:30.
- **Clear everything on this tablet:** Android Settings → Apps → WebView Kiosk (or Chrome) → Storage → Clear data. Or in Chrome, the site's settings → Clear & reset. You'll need to type the settings in again, or paste them from another browser with **Copy/Paste settings**.
- **Revoke Google access:** <https://myaccount.google.com/permissions>.
- **Revoke the Octopus key:** regenerate it on the Octopus API access page (the old one stops working).

## Checking a change on a computer

```sh
npm install
npm run serve     # then open http://127.0.0.1:8080/Home-Dashboard-/
```

The page works on a computer too, but Google sign-in only accepts the redirect address you registered (your GitHub Pages URL). Buttons just say what they'd open on the tablet.
