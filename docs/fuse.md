# Electricity and gas from the Fuse app

On Fuse Energy? The panel can show the same usage the Fuse app does: **electricity and gas, today so far**, in pounds and kWh, hour by hour. Fuse has no public interface, so the panel signs in the way the Fuse app does (your mobile number and a text-message code) and reads the same hourly chart. It is unofficial, and Fuse can change it without notice.

The research behind this, with sources, is in [research/2026-10-17-fuse-api.md](research/2026-10-17-fuse-api.md). The panel's Fuse code is based on two community projects, [yakupafsin/fuse-energy-ha](https://github.com/yakupafsin/fuse-energy-ha) and [simonsolts/fuse-homeassistant](https://github.com/simonsolts/fuse-homeassistant): see [NOTICE](../NOTICE).

## What you see

- **Today so far**, in the big box: what today's electricity and gas have cost, with the kWh of each beside it. This counts what Fuse's app counts: the usage so far, plus the standing charge for the hours so far. Under it: how far the readings reach, and the electricity and gas amounts that add up to the total.
- **Usage today**, the chart: a row of bars for electricity and a row for gas, an hour per bar. Each has its own scale, because a gas hour is much bigger than an electricity hour. Tap a bar for its kWh and cost. The paler bar is the **hour in progress**: Fuse keeps topping it up.
- **Electricity** and **Gas** (tiles): today's cost and kWh, and what yesterday cost.

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
3. Replace the code with this, then **Deploy**:

   ```js
   // Passes the few calls the wall panel makes to Fuse, and lets the panel's page read the answers.
   const PANEL = 'https://anginsemilir.github.io';
   const API = 'https://api.fuseenergy.com';
   const WEB = 'https://www.fuseenergy.com';
   const OK = [ // the only calls it will pass on
     ['POST', /^\/api\/v3\/auth$/],
     ['POST', /^\/api\/v1\/auth\/refresh$/],
     ['GET', /^\/api\/v2\/customer\/premises$/],
     ['GET', /^\/api\/v1\/premises\/[\w-]+\/chart$/],
   ];
   export default {
     async fetch(req) {
       const cors = {
         'Access-Control-Allow-Origin': PANEL,
         'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
         'Access-Control-Allow-Headers': 'authorization, device-id, content-type, accept, x-fuse-app-version',
         'Access-Control-Max-Age': '86400',
         Vary: 'Origin',
       };
       const origin = req.headers.get('Origin');
       if (origin && origin !== PANEL) return new Response('Not allowed', { status: 403 });
       if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
       const url = new URL(req.url);
       let target;
       if (req.method === 'POST' && url.pathname === '/web/api/trpc/phoneSignIn') target = `${WEB}/api/trpc/phoneSignIn`; // the text message
       else if (OK.some(([m, re]) => m === req.method && re.test(url.pathname))) target = `${API}${url.pathname}${url.search}`;
       else return new Response('Not found', { status: 404, headers: cors });
       const headers = {};
       for (const h of ['authorization', 'device-id', 'content-type', 'accept', 'x-fuse-app-version']) {
         if (req.headers.get(h)) headers[h] = req.headers.get(h);
       }
       const res = await fetch(target, { method: req.method, headers, body: req.method === 'POST' ? await req.text() : undefined });
       const out = new Response(res.body, res);
       for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
       return out;
     },
   };
   ```
4. Copy the worker's address (like `https://fuse-relay.yourname.workers.dev`).
5. Allow the panel to talk to it. On GitHub, open `web/index.html` → ✏️ edit. In the `Content-Security-Policy` line, after `https://www.fuseenergy.com`, add a space and your worker's address, then **Commit changes**. (Or tell Claude the address and it does this.) After a few minutes the updated page is live.
6. On the panel: ⚙ → Electricity → **Relay URL** → paste → **Send code**.

The relay only passes those five calls through, and only for your panel's page. (The page check stops other websites, not other programs: keep the worker's address to yourself, as you would a password.) Your number, the code and the sign-in go via Cloudflare to Fuse, as they would from your browser. Cloudflare's free plan allows 100,000 requests a day; the panel uses a few hundred.

If Fuse refuses the relay as well (an error mentioning 403), tell Claude: some sites turn away cloud servers.

## Troubleshooting

- **"Fuse wants you to wait a few minutes before asking for another code":** Fuse limits how often it texts. Wait, then press **Send code** once.
- **"That code isn't right":** the code runs out after a few minutes, and a new **Send code** makes the old one stop working. Use the newest text.
- **"Fuse wants a newer app version":** Fuse turned away the version number the panel sends. The number is `FUSE_APP_VERSION` in `web/js/fuse.js`. The current one is in [yakupafsin's const.py](https://github.com/yakupafsin/fuse-energy-ha/blob/main/custom_components/fuse_energy/const.py) (`WEB_APP_VERSION`); tell Claude to update it.
- **The card says "No usage for today yet":** Fuse is behind. It shows what it has, and the chart shows the newest day. Tapping says how far each fuel has got.
- **Gas shows "–" all day:** the gas meter may report only about once a day. Check the Fuse app: if it shows the same, that's Fuse.
- **The figures differ from the Fuse app by a penny or two:** the panel adds up Fuse's own four-decimal figures hour by hour, then rounds. The app may round at a different point.
- **The clock change (the last Sunday of October):** Fuse numbers its bars by the UK clock, so one hour appears twice that day. The panel handles it; it has been tested against made-up data, not a real clock-change day. Tell Claude if the day looks wrong.

## Going back

⚙ → Electricity → **Usage comes from**: *Octopus* or *Bright*. Their details are kept. **Sign out of Fuse** removes the Fuse sign-in from the tablet.
