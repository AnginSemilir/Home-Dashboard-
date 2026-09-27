# Spotify controls (optional)

With **Spotify Premium**, the music button shows what's playing (artwork, song and artist). A tap opens the controls:
- play/pause, previous and next;
- a progress bar;
- volume, on speakers that allow it;
- **Play on**: move the music to another speaker, phone or the tablet.

Press and hold the button to open the Spotify app itself.

The panel is a remote control: it controls Spotify playing somewhere else. It doesn't play music itself.

Spotify's rules (2026), in short:
- The controls need **Premium**.
- The panel's "app" on Spotify's developer site stays in development mode, so up to 5 Spotify accounts can use it.
- A sign-in lasts at most **6 months**, then you connect again.

The research behind this is in [research/2026-09-27-music-controls.md](research/2026-09-27-music-controls.md).

## One-off setup (about 10 minutes)

1. Go to <https://developer.spotify.com/dashboard> and log in with your Spotify account. Accept the developer terms if asked.
2. **Create app**:
   - **App name:** `Home panel`
   - **App description:** `Wall panel remote`
   - **Website:** leave empty.
   - **Redirect URIs:** `https://anginsemilir.github.io/Home-Dashboard-/`, then **Add**. It must match exactly, including the `/` at the end. The panel's Settings shows the exact address to copy.
   - **Which API/SDKs are you planning to use?** Tick **Web API**.
   - Tick the terms, then **Save**.
3. In the app's **Settings → Basic Information**, copy the **Client ID**. There's no secret to copy: the panel doesn't need one.
4. **User Management** (in the app's Settings): add the Spotify account(s) that will be connected on the panel, with their name and email. It's limited to 5. If the panel later says the account "isn't allowed to use your Spotify app yet", this is the step to check.
5. On the panel:
   1. ⚙ → Panel → **Music button**: *Spotify*.
   2. ⚙ → **Spotify** → paste the **Client ID** → **Connect Spotify**.
   3. Log in to Spotify and tap **Agree**.
   4. You're sent back to the panel, and it says "Spotify connected".

**In WebView Kiosk:** if you log in to Spotify with **Continue with Google / Facebook / Apple**, those buttons don't work inside kiosk apps. Instead:
1. Connect in **Chrome** on the tablet.
2. Use ⚙ → **Copy settings** there, then **Paste settings** in WebView Kiosk.

The Spotify sign-in *moves* with the copy. Spotify changes it every time it's used, so only one browser can keep it, and Chrome lets go of it.

## Using it

- **Nothing playing:** the button just says *Spotify*. Tap it and choose where to play under **Play on**, or tap **Open Spotify**.
- **Speakers:** a speaker only shows under **Play on** while Spotify can see it.
  - Speakers with Spotify built in (Spotify Connect) are the most dependable.
  - Google Nest and Chromecast speakers usually only appear after someone has cast to them from a phone.
  - The tablet itself appears while its Spotify app is open.
- **Volume:** the slider only shows for devices that let Spotify change their volume. Phones and tablets usually don't.
- **The controls close by themselves** after 2 minutes.

## If something goes wrong

| What you see | Why | Fix |
|---|---|---|
| "Spotify only lets Premium accounts use the controls" | The connected account isn't Premium | Connect a Premium account |
| "This Spotify account isn't allowed to use your Spotify app yet" | It isn't under User Management | Step 4 above |
| "The Spotify sign-in has ended…" (and ⚙ says *Not connected*) | Spotify ends sign-ins after 6 months, or access was removed | ⚙ → Spotify → **Connect Spotify** again |
| "Nothing is ready to play" | No speaker or app is active on your account | Pick one under **Play on**, or open Spotify on the tablet |
| "Spotify has paused the panel's access for a while" | Too many requests in a day | It tries again later by itself |
| `INVALID_CLIENT: Invalid redirect URI` on Spotify's page | The redirect URI in step 2 doesn't match | Copy it exactly from the panel's Settings |
| Spotify's login page is blank or its Google button does nothing, in the kiosk app | Kiosk apps can't do Google/Facebook/Apple logins | Connect in Chrome and copy the settings across (above) |

To remove the panel's access: ⚙ → **Disconnect Spotify**. To cut it off from Spotify's side, go to spotify.com → Account → **Apps** → *Home panel* → Remove access.
