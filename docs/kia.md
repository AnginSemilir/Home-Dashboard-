# Kia e-Niro battery (optional, experimental)

Kia's servers don't let web pages read your car directly, so the panel can't do this by itself. Instead, a free **GitHub Action** in this repository logs in to Kia **once an hour**. It reads the battery level the car last reported (it **doesn't wake the car**), encrypts it, and publishes the encrypted file. The panel downloads and decrypts it.

- **Free:** GitHub Actions is free for public repositories.
- **Private:** the file is public but encrypted (AES-256-GCM) and always the same size, so even its length gives nothing away. Only the tablet and the GitHub secret have the key. The workflow's logs, which are also public, print nothing about the car or the account.
- **Experimental:** Kia sometimes blocks logins from data-centre addresses like GitHub's, or asks for a one-time code. If that happens before the first reading, the car tile stays as a "Kia app" button. If it happens later, the last reading stays on the tile with a red dot (tap it for the reason). Nothing else on the panel is affected.

## Set up (10 minutes)

1. **Make a key.** On the panel: ⚙ → **Kia battery** → **Generate a new key**. Copy the key it shows (and keep the Settings screen open).
2. **Add the secrets.** On GitHub: this repository → **Settings → Secrets and variables → Actions → New repository secret**, three times:
   - `KIA_USERNAME`: your Kia app email address
   - `KIA_PASSWORD`: your Kia app password
   - `KIA_PANEL_KEY`: the key from step 1

   Optional, also as **secrets**:
   - `KIA_PIN`: your Kia app PIN (not usually needed to read the battery)
   - `KIA_VIN`: only if your Kia account has more than one car. Use a secret, not a variable: variables are printed in the public logs.
3. **Run it once.** **Actions → Kia battery (optional) → Run workflow**. After about a minute it should be green ✓.

   It creates a branch called `kia-data` holding one file, `kia.json`.
4. **Point the panel at it.** Back in ⚙ → Kia battery → **Data URL**:
   `https://raw.githubusercontent.com/AnginSemilir/Home-Dashboard-/kia-data/kia.json`

   Then **Save & close**. Within a minute the car tile shows the battery %, the range and "updated … ago".

"Updated" is when **the car** last sent its status to Kia (usually when it's driven, charging or finishes charging), not when the job ran. The job runs at 23 minutes past each hour; GitHub sometimes runs scheduled jobs a little late.

## If it fails

- **Red ✗ in Actions, "Kia fetch failed: …"**: open the run to see the (sanitised) reason.
  - **Login rejected, or "wants a one-time code"**: Kia increasingly needs a *refresh token* instead of a password for third-party tools. The [hyundai_kia_connect_api](https://github.com/Hyundai-Kia-Connect/hyundai_kia_connect_api) project (the library this uses) explains how to get one for Europe. Put that token in `KIA_PASSWORD` instead of your password.
  - **Blocked / forbidden / timeouts every time**: Kia is blocking GitHub's servers. There's no free fix for that from GitHub, so turn the job off (below).
- **Red dot on the car tile, "The Kia GitHub job last ran … h ago"**: the job has stopped publishing (it failed, or GitHub paused it). The tile keeps the last reading. Check the Actions tab.
- **Panel shows a red dot on the car with "Kia key does not match"**: the key in ⚙ must be the same as the `KIA_PANEL_KEY` secret. Generate a new one and update both.
- **GitHub emails "scheduled workflow disabled"**: GitHub pauses scheduled jobs in public repositories after 60 days with no commits. Actions → Kia battery → **Enable workflow**.

## Turn it off

Actions → Kia battery (optional) → ⋯ → **Disable workflow**, and clear the Data URL in ⚙. You can also delete the `kia-data` branch and the secrets.
