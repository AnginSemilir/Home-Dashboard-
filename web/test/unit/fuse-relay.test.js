// SPDX-License-Identifier: AGPL-3.0-only
// The relay a user deploys on Cloudflare (relay/fuse-relay.js), run here against a fake Fuse: it must do
// what the panel needs (answer the browser's pre-check, map the text-message call to the website, add the
// "allowed" header, pass the answers through) and nothing else.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import relay from '../../../relay/fuse-relay.js';
import { Fuse } from '../../js/fuse.js';
import { loadSettings } from '../../js/config.js';

const PANEL = 'https://anginsemilir.github.io';
const RELAY = 'https://fuse-relay.example.workers.dev';
let sent;
beforeEach(() => {
  sent = [];
  globalThis.fetch = async (url, opts = {}) => {
    sent.push({ url, method: opts.method, headers: opts.headers, body: opts.body });
    return new Response(JSON.stringify({ ok: true }), { status: 201, headers: { 'content-type': 'application/json', 'set-cookie': 'session=abc; Path=/', 'x-fuse': 'yes' } });
  };
});
const ask = (path, { method = 'GET', headers = {}, body, origin = PANEL } = {}) =>
  relay.fetch(new Request(`${RELAY}${path}`, { method, headers: { ...(origin ? { Origin: origin } : {}), ...headers }, body }));

test('the browser\'s pre-check is answered, for the page it serves and nobody else', async () => {
  const ok = await ask('/api/v3/auth', { method: 'OPTIONS' });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), PANEL);
  for (const h of ['authorization', 'device-id', 'content-type', 'accept', 'x-fuse-app-version']) assert.match(ok.headers.get('access-control-allow-headers'), new RegExp(h));
  assert.match(ok.headers.get('access-control-allow-methods'), /POST/);
  assert.equal(sent.length, 0, 'nothing was passed on');
  const other = await ask('/api/v3/auth', { method: 'OPTIONS', origin: 'https://evil.example' });
  assert.equal(other.status, 403);
});

test('the text-message call goes to Fuse\'s website; the rest go to the mobile API; answers get the "allowed" header', async () => {
  let r = await ask('/web/api/trpc/phoneSignIn', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-fuse-app-version': '0.5.388' }, body: '{"phone":"+447700900123"}' });
  assert.equal(sent[0].url, 'https://www.fuseenergy.com/api/trpc/phoneSignIn');
  assert.equal(sent[0].body, '{"phone":"+447700900123"}');
  assert.equal(sent[0].headers['x-fuse-app-version'], '0.5.388');
  assert.equal(r.headers.get('access-control-allow-origin'), PANEL);
  assert.equal(r.status, 201, 'status passes through');
  assert.deepEqual(await r.json(), { ok: true });

  r = await ask('/api/v3/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Device-Id': 'dev-1', Authorization: 'Bearer flow-1' }, body: '{"challenge_type":"PHONE_OTP"}' });
  assert.equal(sent[1].url, 'https://api.fuseenergy.com/api/v3/auth');
  assert.deepEqual([sent[1].headers['device-id'], sent[1].headers.authorization, sent[1].headers['content-type']], ['dev-1', 'Bearer flow-1', 'application/json']);
  assert.equal(sent[1].body, '{"challenge_type":"PHONE_OTP"}');

  await ask('/api/v1/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(sent[2].url, 'https://api.fuseenergy.com/api/v1/auth/refresh');
  await ask('/api/v2/customer/premises', { headers: { Authorization: 'Bearer a', 'Device-Id': 'd' } });
  assert.equal(sent[3].url, 'https://api.fuseenergy.com/api/v2/customer/premises');
  assert.equal(sent[3].body, undefined, 'a GET has no body');
  await ask('/api/v1/premises/0a1b2c3d-4e5f-6789-abcd-ef0123456789/chart?year=2026&month=10&day=17', { headers: { Authorization: 'Bearer a' } });
  assert.equal(sent[4].url, 'https://api.fuseenergy.com/api/v1/premises/0a1b2c3d-4e5f-6789-abcd-ef0123456789/chart?year=2026&month=10&day=17');
});

test('nothing else is passed on, and what Fuse sets or the browser sends beyond the list stays behind', async () => {
  for (const [method, path] of [['GET', '/api/v3/auth'], ['POST', '/api/v2/customer/premises'], ['POST', '/api/v1/premises/p/chart'], ['GET', '/api/v1/other'],
    ['POST', '/web/api/trpc/other'], ['GET', '/web/api/trpc/phoneSignIn'], ['GET', '/api/v1/premises/../../secret/chart'], ['GET', '/'], ['POST', '/api/v3/auth/extra']]) {
    const r = await ask(path, { method, body: method === 'POST' ? '{}' : undefined });
    assert.equal(r.status, 404, `${method} ${path}`);
    assert.equal(r.headers.get('access-control-allow-origin'), PANEL, 'the refusal can be read too');
  }
  assert.equal(sent.length, 0);
  const r = await ask('/api/v2/customer/premises', { headers: { Authorization: 'Bearer a', Cookie: 'mine=1', 'X-Other': 'no', 'User-Agent': 'TestBrowser/1' } });
  assert.equal(sent[0].headers.cookie, undefined);
  assert.equal(sent[0].headers['x-other'], undefined);
  assert.equal(sent[0].headers['User-Agent'], 'TestBrowser/1');
  assert.equal(r.headers.get('set-cookie'), null, 'Fuse\'s cookies are not handed to the page');
  assert.equal(r.headers.get('x-fuse'), 'yes');
});

test('the panel\'s own client talks to it end to end: every address and header it uses is one the relay passes', async () => {
  const settings = loadSettings({ getItem: () => null, setItem() {} });
  settings.fuse.proxy = RELAY;
  const store = new Map();
  const fuse = new Fuse(settings, { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, { locks: null });
  // The client's fetch goes to the relay; the relay's goes to a fake Fuse, which answers as Fuse does.
  const toFuse = [];
  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).startsWith(RELAY)) {
      const h = new Headers(opts.headers);
      h.set('Origin', PANEL);
      const inner = globalThis.fetch;
      globalThis.fetch = async (u, o = {}) => {
        toFuse.push({ url: u, headers: o.headers, body: o.body });
        const body = u.endsWith('/api/v3/auth')
          ? JSON.parse(o.body).challenge_type === 'INITIAL' ? { auth_flow_token: 'flow' } : { challenge_type: 'AUTHORIZED', data: { access_token: 'acc', refresh_token: 'ref' } }
          : u.endsWith('/phoneSignIn') ? { result: { data: {} } } : u.endsWith('/premises') ? [{ premises: { id: 'prem-1', address_line_1: 'x' } }] : { supplies: [] };
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      };
      try { return await relay.fetch(new Request(url, { method: opts.method, headers: h, body: opts.body })); } finally { globalThis.fetch = inner; }
    }
    throw new Error(`unexpected ${url}`);
  };
  await fuse.startSignIn('07700900123');
  await fuse.submitCode('123456');
  assert.deepEqual(await fuse.premises(), { id: 'prem-1', name: 'x' });
  await fuse.day('prem-1', '2026-10-17');
  assert.deepEqual(toFuse.map((c) => new URL(c.url).pathname), ['/api/v3/auth', '/api/trpc/phoneSignIn', '/api/v3/auth', '/api/v2/customer/premises', '/api/v1/premises/prem-1/chart']);
  assert.equal(new URL(toFuse[1].url).host, 'www.fuseenergy.com');
  assert.ok(toFuse.slice(2).every((c) => c.headers.authorization), 'the sign-in token reached Fuse');
});
