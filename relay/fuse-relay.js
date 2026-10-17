// SPDX-License-Identifier: AGPL-3.0-only
// A tiny relay for the wall panel's Fuse Energy calls: it passes a handful of requests to Fuse and
// lets the panel's page read the answers (browsers only allow that when the site says so, and Fuse's
// interface doesn't). It stores nothing and passes nothing else. Setup: docs/fuse.md.
//
// To deploy: Cloudflare dashboard -> Workers & Pages -> Create -> Create Worker -> Edit code, paste this
// whole file, Deploy. The tests for this file are web/test/unit/fuse-relay.test.js.

const PANEL = 'https://anginsemilir.github.io'; // the page allowed to use this relay
const API = 'https://api.fuseenergy.com';
const WEB = 'https://www.fuseenergy.com';
const OK = [ // the only calls it will pass on
  ['POST', /^\/api\/v3\/auth$/],
  ['POST', /^\/api\/v1\/auth\/refresh$/],
  ['GET', /^\/api\/v2\/customer\/premises$/],
  ['GET', /^\/api\/v1\/premises\/[\w-]+\/chart$/],
];
const SEND = ['authorization', 'device-id', 'content-type', 'accept', 'x-fuse-app-version']; // headers passed to Fuse

export default {
  async fetch(req) {
    const cors = {
      'Access-Control-Allow-Origin': PANEL,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': SEND.join(', '),
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const origin = req.headers.get('Origin');
    if (origin && origin !== PANEL) return new Response('Not allowed', { status: 403 });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(req.url);
    let target;
    if (req.method === 'POST' && url.pathname === '/web/api/trpc/phoneSignIn') target = `${WEB}/api/trpc/phoneSignIn`; // the text message
    else if (OK.some(([method, re]) => method === req.method && re.test(url.pathname))) target = `${API}${url.pathname}${url.search}`;
    else return new Response('Not found', { status: 404, headers: cors });

    const headers = {};
    for (const h of SEND) if (req.headers.get(h)) headers[h] = req.headers.get(h);
    const ua = req.headers.get('User-Agent');
    if (ua) headers['User-Agent'] = ua; // as the browser sent it
    const res = await fetch(target, { method: req.method, headers, body: req.method === 'POST' ? await req.text() : undefined });
    const out = new Response(res.body, res);
    out.headers.delete('set-cookie');
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
