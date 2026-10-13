# Electricity usage from Bright (any supplier)

Left Octopus? The Octopus Home Mini only reports to Octopus, so it stops being useful after a switch, and Agile prices no longer apply. The panel can instead read your smart meter through Hildebrand's free **Bright** app, whoever supplies you (Fuse, for example). Bright gets the meter's readings through the national smart meter network (the DCC), so a switch doesn't affect it.

The research behind this, with sources, is in [research/2026-10-13-usage-after-octopus.md](research/2026-10-13-usage-after-octopus.md).

## What you see

- **Today so far**, in the big box: what today's electricity has cost (kWh × your unit rate + the day's standing charge), with the kWh beside it and when the newest reading is from.
- **Usage today**, the chart: a bar for each half hour since midnight. Tap a bar for its kWh and the average power over that half hour.
- **Last half hour** (tile): the newest half hour's average power, and which half hour it was. With a Glow display (below) this tile becomes **Using now**, live.
- **Yesterday** (tile): what yesterday cost, and its kWh.

Bright is usually **about half an hour behind**, sometimes longer. The panel asks Bright to fetch the newest half hours from your meter every half hour (as often as Hildebrand asks apps to), and refreshes every 10 minutes (every 30 at night).

The average-prices and "when you use electricity" buttons are about Agile prices, so they don't show in this mode.

## Set up (about 10 minutes, mostly in the Bright app)

1. Install **Bright** on your phone, create an account, and connect your smart meter. Bright asks you to confirm your details (verification). Wait until Bright shows your half-hourly use; that can take a day or so.
2. On the panel: ⚙ → **Electricity** → **Usage comes from**: *Bright app*.
3. Type your **Bright email** and **password** → **Connect**. It should say *Bright connected*.
4. Type your **unit rate** and **standing charge**, both in pence and including VAT. They're in your supplier's app or on your bill (Fuse: tariff details). Without a unit rate the panel shows kWh instead of pounds.
5. **Save & close**.

The checklist in ⚙ has a line, **Electricity usage (Bright)**, that says what's wrong if something isn't working.

Your Bright email and password are stored only on this tablet and are sent only to Bright (or to your own relay, below). The panel keeps Bright's sign-in for a week at a time and signs in again by itself. If Bright refuses the password (say you changed it in the Bright app), the panel waits a few hours before trying it again, so it doesn't keep knocking: type the new one in ⚙ → Electricity and press **Connect**, which always checks it straight away.

## Live usage: a Glow display

Bright alone can't tell what you're using right now: the meter network only gives half hours. Hildebrand's **Glow Display/CAD** joins your meter directly and sends live readings every few seconds, with any supplier.

- About **£69.99**. In October 2026 it was sold out, with a £15 deposit or a free waiting list on [shop.glowmarkt.com](https://shop.glowmarkt.com).
- Set it up with the same Bright account. Hildebrand connects it to your meter, which can take a few hours.
- The panel notices it within a few hours (or straight away: ⚙ → Electricity → **Connect**). The tile then says **Using now** with live watts and a sparkline of the last hour, and the checklist shows **Live usage (Glow display)** ✓.
- If the display stops sending (unplugged, or off the Wi-Fi), the tile goes back to **Last half hour**, the checklist says when its last reading was, and the panel asks less and less often. A display that stays off for a day is switched off on the panel, and switched back on when it reappears.

## If Bright is blocked in the browser

A web page can only read another site's data if that site allows it (CORS). Whether Bright allows web pages wasn't known when this was written. If the checklist shows **✗ Electricity usage (Bright)** with *"Bright didn't answer this browser"* while the weather works, Bright is blocking it. The free fix is a tiny relay on Cloudflare that only adds the "allowed" header. It takes about 5 minutes:

1. Sign up at <https://dash.cloudflare.com/sign-up> (free plan).
2. **Workers & Pages → Create → Create Worker**. Name it `bright-relay` → **Deploy** → **Edit code**.
3. Replace the code with this, then **Deploy**:

   ```js
   // Forwards /api/v0-1/… to Bright (api.glowmarkt.com) and lets your panel's page read the answer.
   const PANEL = 'https://anginsemilir.github.io';
   export default {
     async fetch(req) {
       const cors = {
         'Access-Control-Allow-Origin': PANEL,
         'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
         'Access-Control-Allow-Headers': 'applicationid, token, content-type',
         'Access-Control-Max-Age': '86400',
       };
       if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
       const url = new URL(req.url);
       if (!url.pathname.startsWith('/api/v0-1/') || !['GET', 'POST'].includes(req.method)) return new Response('Not found', { status: 404 });
       const headers = { 'content-type': 'application/json', applicationId: req.headers.get('applicationid') || '' };
       if (req.headers.get('token')) headers.token = req.headers.get('token');
       const res = await fetch(`https://api.glowmarkt.com${url.pathname}${url.search}`, {
         method: req.method, headers, body: req.method === 'POST' ? await req.text() : undefined,
       });
       const out = new Response(res.body, res);
       for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
       return out;
     },
   };
   ```
4. Copy the worker's address (like `https://bright-relay.yourname.workers.dev`).
5. Allow the panel to talk to it. On GitHub, open `web/index.html` → ✏️ edit. In the `Content-Security-Policy` line, after `https://api.glowmarkt.com`, add a space and your worker's address, then **Commit changes**. (This list is why the panel can't send your details anywhere you haven't named.) After a few minutes the updated page is live.
6. On the panel: ⚙ → Electricity → **Relay URL** → paste → **Connect** → **Save & close**.

The relay only passes requests through: your Bright sign-in goes via Cloudflare to Bright, as your browser would send it. Cloudflare's free plan allows 100,000 requests a day; the panel uses a few hundred.

## Going back to Octopus

⚙ → Electricity → **Usage comes from**: *Octopus*. The Octopus details are kept, so everything comes back as it was.
