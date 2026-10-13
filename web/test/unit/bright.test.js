import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Bright, BRIGHT_APP_ID, parseReadings, parseCurrent, pickResources, glowTime, usageBetween, fixedCost } from '../../js/bright.js';
import { loadSettings } from '../../js/config.js';

const memStore = () => { const m = new Map(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const at = (s) => Date.parse(s);

test('parseReadings: Bright\'s seconds become half hours; missing ones stay missing (not 0)', () => {
  const t = at('2026-10-13T23:00:00Z') / 1000;
  const r = parseReadings({ data: [[t + 1800, null], [t, 0.25], [t + 3600, '0']], units: 'kWh' });
  assert.deepEqual(r.map((x) => [x.start, x.kwh]), [[t * 1000, 0.25], [(t + 1800) * 1000, null], [(t + 3600) * 1000, 0]]);
  assert.equal(r[0].end - r[0].start, 1800e3);
  assert.deepEqual(parseReadings(null), []);
});

test('parseCurrent: watts (or kW) from a Glow display; nothing without one', () => {
  assert.deepEqual(parseCurrent({ data: [[1760000000, 742]], units: 'W' }), { w: 742, at: 1760000000000 });
  assert.deepEqual(parseCurrent({ data: [[1760000000, 0.5]], units: 'kW' }), { w: 500, at: 1760000000000 });
  assert.equal(parseCurrent({ data: [], units: 'W' }), null);
  assert.equal(parseCurrent({}), null);
});

test('pickResources: the electricity readings, whichever order they come in', () => {
  const list = [{ veId: 'v', resources: [{ resourceId: 'g', classifier: 'gas.consumption' }, { resourceId: 'c', classifier: 'electricity.consumption.cost' }, { resourceId: 'e', classifier: 'electricity.consumption' }] }];
  assert.deepEqual(pickResources(list), { ve: 'v', consumption: 'e', cost: 'c' });
  assert.equal(pickResources([{ veId: 'v', resources: [{ resourceId: 'g', classifier: 'gas.consumption' }] }]), null);
});

test('glowTime: UTC without a zone, as Bright wants', () => {
  assert.equal(glowTime(at('2026-10-14T00:00:00+01:00')), '2026-10-13T23:00:00');
});

test('usageBetween and fixedCost: today so far on a fixed price', () => {
  const d = at('2026-10-14T00:00:00+01:00');
  const slots = [{ start: d - 1800e3, end: d, kwh: 9 }, { start: d, end: d + 1800e3, kwh: 0.5 }, { start: d + 1800e3, end: d + 3600e3, kwh: 0.25 }, { start: d + 3600e3, end: d + 5400e3, kwh: null }];
  const u = usageBetween(slots, d, d + 864e5);
  assert.deepEqual(u, { kwh: 0.75, slots: 2, last: d + 3600e3 });
  assert.equal(fixedCost(u.kwh, { unitRate: 26.64, standing: 47.35 }), 0.75 * 26.64 + 47.35);
  assert.equal(fixedCost(2, {}), 0);
});

// ---------- The client against a fake fetch ----------
let calls;
beforeEach(() => { calls = []; });
function fakeFetch(handler) {
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    const { status = 200, body } = await handler(url, opts);
    return { ok: status < 400, status, statusText: '', headers: { get: () => null }, text: async () => JSON.stringify(body) };
  };
}
function setup() {
  const s = loadSettings(memStore());
  Object.assign(s.bright, { username: 'sam@example.com', password: 'pw' });
  const storage = memStore();
  return { s, storage, b: new Bright(s, storage) };
}

test('Bright: signs in once a week, sends the app ID and token, and renews a refused token once', async () => {
  const { s, storage, b } = setup();
  let token = 'tok-1';
  fakeFetch((url, opts) => {
    if (url.endsWith('/auth')) return { body: { valid: true, token, exp: Math.floor(Date.now() / 1000) + 7 * 86400 } };
    if (opts.headers.token !== token) return { status: 401, body: { error: 'bad token' } };
    return { body: [{ veId: 've', resources: [{ resourceId: 'e', classifier: 'electricity.consumption' }] }] };
  });
  await b.api('virtualentity');
  await b.api('virtualentity');
  assert.equal(calls.filter((c) => c.url.endsWith('/auth')).length, 1, 'one sign-in for both');
  const auth = calls[0];
  assert.equal(auth.url, 'https://api.glowmarkt.com/api/v0-1/auth');
  assert.equal(auth.opts.method, 'POST');
  assert.equal(auth.opts.headers.applicationId, BRIGHT_APP_ID);
  assert.deepEqual(JSON.parse(auth.opts.body), { username: 'sam@example.com', password: 'pw' });
  assert.equal(calls[1].opts.headers.token, 'tok-1');
  assert.ok(!calls[1].url.includes('pw'), 'the password is never in a URL');
  // A new Bright with the same storage reuses the sign-in.
  calls.length = 0;
  await new Bright(s, storage).api('virtualentity');
  assert.equal(calls.length, 1);
  // Bright refuses a sign-in saved days ago: sign in again, once.
  token = 'tok-2';
  calls.length = 0;
  const later = new Bright(s, storage);
  await later.api('virtualentity');
  assert.deepEqual(calls.map((c) => c.url.split('/').pop()), ['virtualentity', 'auth', 'virtualentity']);
  // Refused straight after signing in: signing in again wouldn't help, so it doesn't.
  token = 'tok-3';
  calls.length = 0;
  await assert.rejects(later.api('virtualentity'), /accepted the sign-in but won't share this meter's readings/);
  assert.deepEqual(calls.map((c) => c.url.split('/').pop()), ['virtualentity']);
  // Another account: its own sign-in.
  s.bright.username = 'other@example.com';
  calls.length = 0;
  await b.api('virtualentity');
  assert.equal(calls[0].url.split('/').pop(), 'auth');
});

test('Bright: a refused password isn\'t tried again for hours, unless it\'s changed', async () => {
  const { s, b } = setup();
  fakeFetch((url, opts) => {
    if (url.endsWith('/auth')) return JSON.parse(opts.body).password === 'right' ? { body: { valid: true, token: 't', exp: Math.floor(Date.now() / 1000) + 7 * 86400 } } : { status: 401, body: { valid: false } };
    return { body: [] };
  });
  for (let i = 0; i < 3; i++) await assert.rejects(b.api('virtualentity'), /didn't accept the email and password/);
  assert.equal(calls.length, 1, 'one sign-in, then no more');
  await assert.rejects(b.token(Date.now() + 7 * 3600e3));
  assert.equal(calls.length, 2, 'tried again a few hours later');
  s.bright.password = 'right';
  await b.api('virtualentity');
  assert.deepEqual(calls.slice(2).map((c) => c.url.split('/').pop()), ['auth', 'virtualentity'], 'a changed password is tried at once');
});

test('Bright: the sign-in is kept in memory when storage is full', async () => {
  const { s } = setup();
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
  const b = new Bright(s, full);
  fakeFetch((url) => (url.endsWith('/auth') ? { body: { valid: true, token: 't', exp: Math.floor(Date.now() / 1000) + 7 * 86400 } } : { body: [] }));
  for (let i = 0; i < 4; i++) await b.api('virtualentity');
  assert.equal(calls.filter((c) => c.url.endsWith('/auth')).length, 1);
});

test('Bright: a sign-in refused with 403 is dropped, and forget() clears it everywhere', async () => {
  const { s, storage } = setup();
  storage.setItem('wallpanel.bright.v1', JSON.stringify({ token: 'old', exp: Date.now() + 5 * 864e5, user: 'sam@example.com' }));
  fakeFetch((url, opts) => {
    if (url.endsWith('/auth')) return { status: 401, body: { valid: false } }; // the password was changed too
    return opts.headers.token === 'old' ? { status: 403, body: {} } : { body: [] };
  });
  const b = new Bright(s, storage);
  await assert.rejects(b.api('virtualentity'), /didn't accept/);
  assert.equal(storage.getItem('wallpanel.bright.v1'), null, 'the refused sign-in is gone, so a fixed password can work');
  fakeFetch((url) => (url.endsWith('/auth') ? { body: { valid: true, token: 'new', exp: Math.floor(Date.now() / 1000) + 7 * 86400 } } : { body: [] }));
  s.bright.password = 'fixed';
  await b.api('virtualentity');
  assert.equal(JSON.parse(storage.getItem('wallpanel.bright.v1')).token, 'new');
  b.forget();
  assert.equal(storage.getItem('wallpanel.bright.v1'), null);
  calls.length = 0;
  await b.api('virtualentity');
  assert.equal(calls[0].url.split('/').pop(), 'auth', 'nothing left in memory either');
});

test('Bright: plain words for a wrong password and for a browser that\'s blocked', async () => {
  const { b } = setup();
  fakeFetch(() => ({ status: 401, body: { valid: false } }));
  await assert.rejects(b.discover(), /didn't accept the email and password/);
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(setup().b.discover(), /Bright didn't answer this browser.*docs\/bright\.md/);
});

test('Bright: finds the meter, checks for a Glow display, and asks for readings in UTC', async () => {
  const { b } = setup();
  const now = at('2026-10-14T09:41:00+01:00');
  fakeFetch((url) => {
    if (url.endsWith('/auth')) return { body: { valid: true, token: 't', exp: Math.floor(now / 1000) + 86400 * 7 } };
    if (url.endsWith('/virtualentity')) return { body: [{ veId: 've-1' }] };
    if (url.includes('/virtualentity/ve-1/resources')) return { body: { resources: [{ resourceId: 'e', classifier: 'electricity.consumption' }] } };
    if (url.includes('/current')) return { body: { data: [], units: 'W' } };
    if (url.includes('/readings')) return { body: { data: [[at('2026-10-13T23:00:00Z') / 1000, 0.3], [at('2026-10-13T23:30:00Z') / 1000, null]], units: 'kWh' } };
    return { status: 404, body: {} };
  });
  const d = await b.discover(now);
  assert.deepEqual({ ...d, at: 0 }, { ve: 've-1', consumption: 'e', cost: '', live: false, at: 0, user: 'sam@example.com' });
  const r = await b.readings('e', at('2026-10-13T00:00:00+01:00'), now);
  const q = new URL(calls.at(-1).url);
  assert.equal(q.pathname, '/api/v0-1/resource/e/readings');
  assert.deepEqual(Object.fromEntries(q.searchParams), { from: '2026-10-12T23:00:00', to: '2026-10-14T08:41:00', period: 'PT30M', offset: '0', function: 'sum', nulls: '1' });
  assert.deepEqual(r.map((x) => x.kwh), [0.3, null]);
});

test('Bright: an optional relay replaces the address, and must be https', async () => {
  const { s, b } = setup();
  s.bright.proxy = 'https://bright-relay.me.workers.dev/';
  assert.equal(b.base, 'https://bright-relay.me.workers.dev/api/v0-1');
  s.bright.proxy = 'http://insecure.example';
  assert.throws(() => b.base, /must look like https/);
});
