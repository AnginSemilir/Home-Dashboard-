# Octopus: Agile prices and Home Mini

## Set up

1. Get your **API key**: <https://octopus.energy/dashboard/new/accounts/personal-details/api-access> (it starts `sk_live_`). Your **account number** is on the same site and your bills (`A-` followed by 8 characters).
2. On the panel: ⚙ → **Octopus Energy** → paste both → **Connect**.

   The panel finds your Agile tariff and region, your meter and your Home Mini, and shows them under the fields ("Found: tariff E-1R-AGILE-24-10-01-C (region C) … Home Mini yes").
3. **Save & close.** In the setup checklist, **Octopus Agile prices** and **Octopus Home Mini** should both turn ✓ within a minute.

Only want prices? You don't need the key: type your tariff code into **Tariff code** instead. Live usage and "£ so far today" need the key.

## What you see

- **Agile price now**: this half hour's price, when it ends, the next price, and the cheapest slot still to come (including tomorrow's once published).
- **Chart**: from an hour ago to 24 hours ahead. Octopus publishes tomorrow's prices at about 4pm; before that, the chart says "prices from ~4pm".
- **Using now**: live demand from the Home Mini (refreshed every 60 s), with a sparkline of the last hour.
- **Today so far**: the cost since midnight (half-hour usage × each half-hour's price + the daily standing charge) and the kWh used.

Colours: green below 15p, amber, red from 25p, **blue at or below 0p** (plunge pricing: you're paid to use power). Change the thresholds in ⚙ → Panel.

> Octopus's Agile prices change every **half hour**. There isn't a 15-minute Agile price.

## Limits

Octopus allows about **100 API requests an hour** per account. The panel uses about 60 an hour for the Home Mini at the default 60-second refresh (every 5 minutes at night), plus 4 an hour for prices. If you also use other apps that read your Octopus data through the API, raise **Home Mini refresh** to 90 or 120 seconds. If the limit is hit, the panel backs off by itself and the Home Mini card shows an amber dot.

## If Octopus is blocked

Websites can only call another site's API if that API allows it (CORS). Octopus's API is widely used from web pages, but if the setup checklist shows **✗ Octopus** with "Network error (offline, or the service blocked a browser request)" while the weather works, your browser is being blocked. The free fix is a tiny proxy on Cloudflare that only adds the "allowed" header. It takes about 5 minutes:

1. Sign up at <https://dash.cloudflare.com/sign-up> (free plan).
2. **Workers & Pages → Create → Create Worker**. Name it `octopus-proxy` → **Deploy** → **Edit code**.
3. Replace the code with this, then **Deploy**:

   ```js
   // Forwards /v1/… to api.octopus.energy and lets your panel's page read the answer.
   const PANEL = 'https://anginsemilir.github.io';
   export default {
     async fetch(req) {
       const cors = {
         'Access-Control-Allow-Origin': PANEL,
         'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
         'Access-Control-Allow-Headers': 'authorization, content-type',
         'Access-Control-Max-Age': '86400',
       };
       if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
       const url = new URL(req.url);
       if (!url.pathname.startsWith('/v1/') || !['GET', 'POST'].includes(req.method)) return new Response('Not found', { status: 404 });
       const headers = { 'content-type': req.headers.get('content-type') || 'application/json' };
       if (req.headers.get('authorization')) headers.authorization = req.headers.get('authorization');
       const res = await fetch(`https://api.octopus.energy${url.pathname}${url.search}`, {
         method: req.method, headers, body: req.method === 'POST' ? await req.text() : undefined,
       });
       const out = new Response(res.body, res);
       for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
       return out;
     },
   };
   ```
4. Copy the worker's address (like `https://octopus-proxy.yourname.workers.dev`), then on the panel: ⚙ → Octopus → **Proxy URL** → paste → **Connect** → **Save & close**.

The worker only passes requests through. Your API key goes via Cloudflare to Octopus, the same way your browser would send it to Octopus directly. Cloudflare's free plan allows 100,000 requests a day; the panel uses about 1,600.
