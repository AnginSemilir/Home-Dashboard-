# Electricity and gas from the Fuse app

On Fuse Energy? The panel can show the same usage the Fuse app does: **electricity and gas, today so far**, in pounds and kWh, hour by hour. Fuse has no public interface, so the panel signs in the way the Fuse app does (your mobile number and a text-message code) and reads the same hourly chart. It is unofficial, and Fuse can change it without notice.

The research behind this, with sources, is in [research/2026-10-17-fuse-api.md](research/2026-10-17-fuse-api.md). The panel's Fuse code is based on two community projects, [yakupafsin/fuse-energy-ha](https://github.com/yakupafsin/fuse-energy-ha) and [simonsolts/fuse-homeassistant](https://github.com/simonsolts/fuse-homeassistant): see [NOTICE](../NOTICE).

## What you see

- **Today so far**, in the big box: what today's electricity and gas have cost, with the kWh of each beside it. This counts what Fuse's app counts: the usage so far, plus the standing charge for the hours so far. Under it: how far the readings reach, and the electricity and gas amounts that add up to the total.
- **The chart**, with **D**, **M** and **Y** buttons: **D** is today by the hour, **M** this month by the day, **Y** this year by the month. Tap a bar for its kWh and cost. The paler bar is the one still in progress (the hour, day or month so far).
  - By default it shows **a row of bars for electricity and a row for gas**. Each has its own scale, because a day of gas is many times a day of electricity.
  - **Stacked** puts both on one plot in **pounds**: the electricity at the bottom of each bar and the gas on top, so the height is what that hour, day or month cost altogether. Tap **Stacked** again to go back. The choice (and D, M or Y) is remembered on the tablet.
  - **If Fuse doesn't give gas hour by hour** (see below), the **D** view leaves the gas graph out and says *gas isn't hourly*, and there is no Stacked button for the day. **M** and **Y** still show gas, from Fuse's daily and monthly figures.
  - The month and the year are fetched only when you choose them (and again, at most, every half hour). They are not part of the minute-by-minute refresh.
- **Electricity** and **Gas** (tiles): today's cost and kWh, and what yesterday cost.

**Gas is once a day.** Fuse's hourly gas bars are the day's total shared out evenly, so the panel doesn't draw them or count today's gas until Fuse has it; yesterday's gas total is real, and the month and year views use the daily and monthly totals.

**It isn't live.** Fuse doesn't give a "using right now" figure, so the panel doesn't show one. The panel's data is usually **about an hour behind**: the hour in progress gets its reading at half past. **Gas can be later still**, sometimes a day: the gas meter reports less often to save its battery. When that happens the card says how far each fuel has got, and tapping the card or a tile explains. The Fuse app shows the same.

For live watts you need a **Glow display** on the meter (about £70, any supplier). The panel supports one through Bright: see [bright.md](bright.md#live-usage-a-glow-display).

## Set up (about 2 minutes)

1. On the panel: ⚙ → **Electricity** → **Usage comes from**: *Fuse app*.
2. Type the **mobile number** on your Fuse account → **Send code**. Fuse texts you a six-digit code. The panel never asks for a code by itself: only this button does.
3. Type the code → **Sign in**.
4. If Fuse asks who you are (usually your date of birth), answer → **Continue**.
5. It says *Fuse connected and saved*. Press **Cancel** or **Save & close**: the panel reloads and shows your usage.

If you press **Send code** again straight away, Fuse says to wait a few minutes. Wait, then try once.

Your mobile number and the sign-in are stored only on this tablet and go only to Fuse (or to your own relay, below). The sign-in is kept apart from the settings.

**Only one browser at a time.** Fuse ends a sign-in that is used in two places, so **Copy settings** doesn't carry the Fuse sign-in. If you move the panel to another app, sign in again there with a new code.

## If Fuse ends the session

Sometimes Fuse signs the panel out (it does this to its own app too). The panel then says so on the card, in the tap message and in ⚙'s checklist (**✗ Electricity and gas (Fuse)**). It does **not** ask for a new text by itself. ⚙ → Electricity → **Send code** signs you in again.

## If Fuse is blocked in the browser

A web page can only read another site's data if that site allows it (CORS). Whether Fuse allows web pages wasn't known when this was written: Fuse's own website doesn't call its app's interface from the browser, so it may well not. If **Send code** says *"Fuse didn't answer this browser"* while the weather works, Fuse is blocking it. The free fix is a tiny relay on Cloudflare that adds the "allowed" header, and nothing else. It takes about 5 minutes:

1. Sign up at <https://dash.cloudflare.com/sign-up> (free plan).
2. **Workers & Pages → Create → Create Worker**. Name it `fuse-relay` → **Deploy** → **Edit code**.
3. Open [relay/fuse-relay.js](../relay/fuse-relay.js) on GitHub, press the **Copy raw file** button (two squares, top right of the file), go back to Cloudflare's editor, select everything there, paste, then **Deploy**. The file is tested (`web/test/unit/fuse-relay.test.js`): it only passes the five calls the panel makes, only for your panel's page, and keeps Fuse's cookies and your other headers out of it.
4. Copy the worker's address (like `https://fuse-relay.yourname.workers.dev`).
5. On the panel: ⚙ → Electricity → **Relay URL** → paste the address → **Send code**.

Nothing needs editing in the repository: the panel's security list (`connect-src` in `web/index.html`) already allows any `https://….workers.dev` address, so **your own address never has to be written anywhere public**. That matters for this relay in particular, because anyone who knew its address could use it to have Fuse text arbitrary phone numbers. (A relay on your own domain, not workers.dev, does need adding to that `connect-src` line.)

The relay passes only those five calls. (The page check stops other websites, not other programs: keep the worker's address to yourself, as you would a password. Never put it in the repository or share a screenshot of it.) Your number, the code and the sign-in go via Cloudflare to Fuse, as they would from your browser. Cloudflare's free plan allows 100,000 requests a day; the panel uses a few hundred.

If Fuse refuses the relay as well (an error mentioning 403), tell Claude: some sites turn away cloud servers.

## Troubleshooting

- **"Fuse wants you to wait a few minutes before asking for another code":** Fuse limits how often it texts. Wait, then press **Send code** once.
- **"That code isn't right":** the code runs out after a few minutes, and a new **Send code** makes the old one stop working. Use the newest text.
- **"Fuse wants a newer app version":** Fuse turned away the version number the panel sends. The number is `FUSE_APP_VERSION` in `web/js/fuse.js`. The current one is in [yakupafsin's const.py](https://github.com/yakupafsin/fuse-energy-ha/blob/main/custom_components/fuse_energy/const.py) (`WEB_APP_VERSION`); tell Claude to update it.
- **The card says "No usage for today yet":** Fuse is behind. It shows what it has, and the chart shows the newest day. Tapping says how far each fuel has got.
- **Gas is the same figure every hour:** that is how Fuse sends it. Gas meters report about once a day, so Fuse takes the day's gas total and shares it out evenly over 24 bars (on one account, 0.394 kWh in every hour of a day whose total was 9.465 kWh). Today's hours are only an estimate until the meter has reported. So when eight or more finished hours of today or yesterday are identical, the panel drops the hourly gas graph, doesn't count today's gas in *Today so far*, and says *Gas comes once a day* with yesterday's real total; the M and Y views show gas from Fuse's daily and monthly totals. ⚙ → Electricity → **Show what Fuse sent (for troubleshooting)** lists every bar's kWh exactly as Fuse sent it, for today, yesterday, this month and this year (numbers and field names only: no address, IDs or tokens).
- **The M or Y view looks nearly empty:** Fuse only has the days and months since your account began, so the first days of the month (or the months before you joined) have no bars. If it says "Couldn't load…" or "Fuse sent no daily figures", press **Show what Fuse sent** and send Claude the text.
- **Gas shows "–" all day:** the gas meter may report only about once a day. Check the Fuse app: if it shows the same, that's Fuse.
- **The figures differ from the Fuse app by a penny or two:** the panel adds up Fuse's own four-decimal figures hour by hour, then rounds. The app may round at a different point.
- **The clock change (the last Sunday of October):** Fuse numbers its bars by the UK clock, so one hour appears twice that day. The panel handles it; it has been tested against made-up data, not a real clock-change day. Tell Claude if the day looks wrong.

## Going back

⚙ → Electricity → **Usage comes from**: *Octopus* or *Bright*. Their details are kept. **Sign out of Fuse** removes the Fuse sign-in from the tablet.
