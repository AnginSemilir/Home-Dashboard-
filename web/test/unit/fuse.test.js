// SPDX-License-Identifier: AGPL-3.0-only
// Tests for web/js/fuse.js. The cases for the SMS refusals, the clock-change days and the cost
// breakdown follow yakupafsin/fuse-energy-ha (MIT) and simonsolts/fuse-homeassistant (AGPL-3.0-only);
// see NOTICE. Fuse itself is never contacted: every call goes to a fake fetch.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  Fuse, FuseRefusal, FuseSignedOut, FUSE_APP_VERSION, parseChart, dayTotals, refusalCode,
  normalisePhone, normaliseDateAnswer, explainFuseError, chartSummary, parseRange, isEvenSpread,
} from '../../js/fuse.js';
import { loadSettings } from '../../js/config.js';
import { HttpError } from '../../js/util.js';

const memStore = () => { const m = new Map(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const at = (s) => Date.parse(s);
const KEY = 'wallpanel.fuse.v1';

let calls;
beforeEach(() => { calls = []; });
/** handler(url, opts) → { status, body }; every call is recorded in `calls`. */
function fakeFetch(handler) {
  globalThis.fetch = async (url, opts = {}) => {
    const call = { url, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : undefined };
    calls.push(call);
    const { status = 200, body } = await handler(call);
    return { ok: status < 400, status, statusText: '', headers: { get: () => null }, text: async () => (body === undefined ? '' : JSON.stringify(body)) };
  };
}
const path = (c) => new URL(c.url).pathname;

/** A JWT-shaped access token that expires at `expMs`. */
const jwt = (expMs, tag = 'a') => {
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'RS256' })}.${b64({ exp: Math.floor(expMs / 1000), tag })}.sig`;
};

/** A panel's settings, a storage, and a Fuse using a clock we control and locks that take turns. */
const takeTurns = () => { let queue = Promise.resolve(); return { request: (_name, fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; } }; };
function setup({ now = at('2026-10-17T14:20:00+01:00'), settings, storage = memStore(), locks = takeTurns() } = {}) {
  const s = settings || loadSettings(memStore());
  const clock = { t: now };
  const fuse = new Fuse(s, storage, { locks, now: () => clock.t });
  return { s, storage, fuse, clock, locks };
}
const stored = (storage) => JSON.parse(storage.getItem(KEY));
const SIGNED_IN = (storage, access, refresh = 'r-1', deviceId = 'dev-1') => storage.setItem(KEY, JSON.stringify({ deviceId, access, refresh }));

// ---------- Reading the SMS call's answer ----------

test('refusalCode: a refusal in any of the shapes Fuse (tRPC) uses, and none for a success', () => {
  const premature = { error: { json: { message: 'Too soon', code: -32600, data: { code: 'issue_otp_premature_retry' } } } };
  assert.equal(refusalCode({ result: { data: { error: { errorCode: 'incorrect_phone_number' } } } }), 'incorrect_phone_number');
  assert.equal(refusalCode({ result: { data: { error: { errorCode: 'rate_limited' } } } }), 'rate_limited');
  assert.equal(refusalCode(premature), 'issue_otp_premature_retry');
  assert.equal(refusalCode({ error: { code: -32600, data: { code: 'rate_limited' } } }), 'rate_limited', 'the useful code, not the numeric one');
  assert.equal(refusalCode([premature]), 'issue_otp_premature_retry', 'a batched answer');
  assert.equal(refusalCode({ result: { data: { json: { error: { errorCode: 'nope' } } } } }), 'nope', 'wrapped by superjson');
  assert.equal(refusalCode({ error: 'issue_otp_premature_retry' }), 'issue_otp_premature_retry', 'a bare string');
  // What a working sign-in can look like must never read as a refusal.
  for (const ok of [{ result: { data: {} } }, {}, [], null, 'ok', { result: { data: { success: true } } }, { result: { data: { error: null } } },
    { result: { data: { error: {} } } }, { result: { data: { error: { errorCode: null } } } }, { data: { whatever: 1 } },
    [{ result: { data: {} } }], { result: { data: { json: { sent: true } } } }, { result: { data: { code: 'OK', json: { code: 200 } } } }]) {
    assert.equal(refusalCode(ok), null, JSON.stringify(ok));
  }
});

test('normalisePhone and normaliseDateAnswer: what the user types becomes what Fuse wants', () => {
  assert.equal(normalisePhone('07700 900123'), '+447700900123');
  assert.equal(normalisePhone('+44 7700 900123'), '+447700900123');
  assert.equal(normalisePhone('447700900123'), '+447700900123');
  assert.equal(normalisePhone('0044 7700 900123'), '+447700900123');
  assert.equal(normalisePhone('(07700) 900-123'), '+447700900123');
  assert.equal(normalisePhone('12345'), null);
  assert.equal(normalisePhone(''), null);
  assert.equal(normaliseDateAnswer('1965-03-04'), '1965-03-04');
  assert.equal(normaliseDateAnswer('04/03/1965'), '1965-03-04', 'day first, as a UK user types it');
  assert.equal(normaliseDateAnswer('4.3.1965'), '1965-03-04');
  assert.equal(normaliseDateAnswer('1965/03/04'), '1965-03-04');
  assert.equal(normaliseDateAnswer('31/02/1965'), null, 'not a real date');
  assert.equal(normaliseDateAnswer('04-03-65'), null);
  assert.equal(normaliseDateAnswer(''), null);
});

// ---------- Signing in ----------

/** A Fuse that signs in with the code 123456 (asking for a date of birth first when `dob`). */
function fuseServer({ dob = false, sms = { result: { data: {} } }, smsStatus = 200, initial = { auth_flow_token: 'flow-1', challenge_type: 'PHONE_OTP', data: {} } } = {}) {
  fakeFetch((c) => {
    if (path(c) === '/api/trpc/phoneSignIn') return { status: smsStatus, body: sms };
    if (path(c) !== '/api/v3/auth') return { status: 404, body: {} };
    const { challenge_type: type, data } = c.body;
    if (type === 'INITIAL') return typeof initial === 'function' ? initial(c) : { body: initial };
    if (type === 'PHONE_OTP') {
      if (data.code !== '123456') return { status: 400, body: { status_string: 'invalid_code' } };
      if (dob) return { body: { challenge_type: 'ADDITIONAL_INFO', auth_flow_token: 'flow-2', data: { title: 'Verify your date of birth', subtitle: 'Just to be sure', questions: [{ key: 'DATE_OF_BIRTH', title: 'Date of birth', type: 'DATE' }, { key: 'POSTCODE', title: 'Postcode', type: 'TEXT' }] } } };
      return { body: { challenge_type: 'AUTHORIZED', data: { access_token: 'acc-1', refresh_token: 'ref-1' } } };
    }
    if (type === 'ADDITIONAL_INFO') {
      if (!data.responses.DATE_OF_BIRTH) return { body: { challenge_type: 'ADDITIONAL_INFO', auth_flow_token: 'flow-3', data: { title: 'Again', questions: [{ key: 'DATE_OF_BIRTH', title: 'Date of birth', type: 'DATE' }] } } };
      return { body: { challenge_type: 'AUTHORIZED', data: { access_token: 'acc-1', refresh_token: 'ref-1' } } };
    }
    return { status: 400, body: { status_string: 'unsupported' } };
  });
}

test('sign-in: the four calls in order, with Fuse\'s headers and bodies; the tokens are kept', async () => {
  const { fuse, storage } = setup();
  fuseServer();
  await fuse.startSignIn('07700 900123');
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), ['POST https://api.fuseenergy.com/api/v3/auth', 'POST https://www.fuseenergy.com/api/trpc/phoneSignIn']);
  const [first, sms] = calls;
  assert.deepEqual(first.body, { challenge_type: 'INITIAL', data: { method: 'PHONE', data: { phone_number: '+447700900123', prelude_dispatch_id: null } } });
  assert.equal(first.headers['Content-Type'], 'application/json');
  assert.match(first.headers['Device-Id'], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'a random v4 UUID');
  assert.equal(first.headers.Authorization, undefined, 'nothing to prove yet');
  assert.deepEqual(sms.body, { phone: '+447700900123' });
  assert.equal(sms.headers['x-fuse-app-version'], FUSE_APP_VERSION);
  assert.equal(sms.headers['Device-Id'], undefined, 'the website call carries no device or sign-in');
  assert.equal(sms.headers.Authorization, undefined);
  assert.equal(fuse.signedIn, false, 'not signed in until the code is given');

  const done = await fuse.submitCode('123 456');
  assert.deepEqual(done, { done: true });
  const code = calls[2];
  assert.deepEqual(code.body, { challenge_type: 'PHONE_OTP', data: { code: '123456' } });
  assert.equal(code.headers.Authorization, 'Bearer flow-1');
  assert.equal(code.headers['Device-Id'], first.headers['Device-Id']);
  assert.equal(fuse.signedIn, true);
  assert.deepEqual(stored(storage), { deviceId: first.headers['Device-Id'], access: 'acc-1', refresh: 'ref-1' });
});

test('sign-in: identity questions come back (and again), each answered with the newest flow token', async () => {
  const { fuse, storage } = setup();
  fuseServer({ dob: true });
  await fuse.startSignIn('07700900123');
  const q = await fuse.submitCode('123456');
  assert.equal(q.done, false);
  assert.equal(q.title, 'Verify your date of birth');
  assert.deepEqual(q.questions, [{ key: 'DATE_OF_BIRTH', title: 'Date of birth', kind: 'DATE' }, { key: 'POSTCODE', title: 'Postcode', kind: 'TEXT' }]);
  const again = await fuse.answer({ POSTCODE: 'SW1A 1AA' }); // Fuse asks again
  assert.equal(again.done, false);
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer flow-2');
  assert.deepEqual(calls.at(-1).body, { challenge_type: 'ADDITIONAL_INFO', data: { responses: { POSTCODE: 'SW1A 1AA' } } });
  assert.deepEqual(await fuse.answer({ DATE_OF_BIRTH: '1965-03-04' }), { done: true });
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer flow-3', 'always the newest');
  assert.equal(stored(storage).access, 'acc-1');
});

test('sign-in: Fuse\'s refusals say what to do (inside a 200, as 4xx, or with no body at all)', async () => {
  let { fuse } = setup();
  fuseServer({ sms: { result: { data: { error: { errorCode: 'issue_otp_premature_retry' } } } } });
  await assert.rejects(fuse.startSignIn('07700900123'), (e) => e instanceof FuseRefusal && e.code === 'issue_otp_premature_retry' && /wait a few minutes/.test(e.message));
  fuseServer({ sms: { result: { data: { error: { errorCode: 'incorrect_phone_number' } } } } });
  await assert.rejects(fuse.startSignIn('07700900123'), (e) => e.code === 'incorrect_phone_number' && /doesn't recognise that mobile number/.test(e.message));
  fuseServer({ smsStatus: 400, sms: { error: { code: 'bad_request' } } });
  await assert.rejects(fuse.startSignIn('07700900123'), (e) => e.code === 'bad_request');
  fuseServer({ smsStatus: 400, sms: undefined });
  await assert.rejects(fuse.startSignIn('07700900123'), (e) => e.code === 'http_400', 'an unexplained refusal is never taken for success');
  fuseServer({ smsStatus: 503, sms: {} });
  await assert.rejects(fuse.startSignIn('07700900123'), /website had a problem \(503\)/);
  // The first call refusing, in /api/v3/auth's own words.
  fuseServer({ initial: () => ({ status: 400, body: { status_string: 'unknown_user' } }) });
  await assert.rejects(fuse.startSignIn('07700900123'), (e) => e.code === 'unknown_user');
  fuseServer({ initial: () => ({ status: 503, body: {} }) });
  await assert.rejects(fuse.startSignIn('07700900123'), /Fuse had a problem \(503\)/);
  fuseServer({ initial: { challenge_type: 'PHONE_OTP' } });
  await assert.rejects(fuse.startSignIn('07700900123'), (e) => e.code === 'bad_response');
  // A number that can't be one is turned away without asking Fuse (and never sends an SMS).
  calls = [];
  await assert.rejects(fuse.startSignIn('hello'), (e) => /Check the mobile number/.test(e.message));
  assert.equal(calls.length, 0);
});

test('sign-in: a wrong code, a code before "Send code", and an unknown challenge are plain-words refusals', async () => {
  const { fuse } = setup();
  fuseServer();
  await assert.rejects(fuse.submitCode('123456'), (e) => e.code === 'flow_not_started');
  assert.equal(calls.length, 0);
  await fuse.startSignIn('07700900123');
  await assert.rejects(fuse.submitCode('000000'), (e) => e.code === 'invalid_code' && /isn't right/.test(e.message));
  fakeFetch(() => ({ body: { challenge_type: 'CAPTCHA', data: {} } }));
  await assert.rejects(fuse.submitCode('123456'), (e) => e.code === 'unsupported_challenge');
  fakeFetch(() => ({ body: { challenge_type: 'AUTHORIZED', data: { access_token: 'x' } } }));
  await assert.rejects(fuse.submitCode('123456'), (e) => e.code === 'bad_response');
  assert.equal(fuse.signedIn, false);
});

test('the device ID is made once and kept, even across sign-out; tokens survive a full storage in memory', async () => {
  const { fuse, storage } = setup();
  const id = fuse.deviceId;
  assert.equal(fuse.deviceId, id);
  SIGNED_IN(storage, 'acc', 'ref', id);
  assert.equal(fuse.signedIn, true);
  fuse.signOut();
  assert.equal(fuse.signedIn, false);
  assert.deepEqual(stored(storage), { deviceId: id });
  // A storage that refuses writes: the ID and the sign-in stay for this page.
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
  const b = setup({ storage: full }).fuse;
  const id2 = b.deviceId;
  assert.equal(b.deviceId, id2);
  fuseServer();
  await b.startSignIn('07700900123');
  await b.submitCode('123456');
  assert.equal(b.signedIn, true);
  assert.equal(b.deviceId, id2);
});

// ---------- Staying signed in ----------

const farFuture = at('2026-10-17T14:35:00+01:00');
const DAY = { supplies: [], current_index: {} };

test('a 401: the pair is renewed once, saved BEFORE the retried call uses it, and the old refresh token is never reused', async () => {
  const { fuse, storage, clock } = setup();
  SIGNED_IN(storage, jwt(farFuture, 'old'), 'ref-1');
  const newAccess = jwt(farFuture + 15 * 60e3, 'new');
  let seenAtRetry;
  fakeFetch((c) => {
    if (path(c) === '/api/v1/auth/refresh') return { body: { access_token: newAccess, refresh_token: 'ref-2' } };
    if (c.headers.Authorization === `Bearer ${newAccess}`) { seenAtRetry = stored(storage); return { body: DAY }; }
    return { status: 401, body: {} };
  });
  await fuse.api('/api/v1/premises/p1/chart', { year: 2026, month: 10, day: 17 });
  assert.deepEqual(calls.map(path), ['/api/v1/premises/p1/chart', '/api/v1/auth/refresh', '/api/v1/premises/p1/chart']);
  const refresh = calls[1];
  assert.deepEqual(refresh.body, { refresh_token: 'ref-1', original_request_path: null }, 'both halves: the refresh token in the body…');
  assert.match(refresh.headers.Authorization, /^Bearer /, '…and the outgoing access token in the header');
  assert.equal(refresh.headers['Device-Id'], stored(storage).deviceId);
  assert.equal(seenAtRetry.refresh, 'ref-2', 'saved before the retry was sent');
  assert.equal(seenAtRetry.access, newAccess);
  // Next time it is the NEW refresh token that goes (the old one died at once).
  calls = [];
  clock.t += 31 * 60e3; // the new access token has run out by now
  fakeFetch((c) => (path(c) === '/api/v1/auth/refresh' ? { body: { access_token: jwt(farFuture + 3600e3, 'newer'), refresh_token: 'ref-3' } } : { body: DAY }));
  await fuse.api('/api/v2/customer/premises');
  assert.deepEqual(calls.find((c) => path(c) === '/api/v1/auth/refresh').body.refresh_token, 'ref-2');
});

test('a token about to run out is renewed first (no wasted 401)', async () => {
  const { fuse, storage, clock } = setup();
  SIGNED_IN(storage, jwt(clock.t + 30e3), 'ref-1'); // 30 s left
  const fresh = jwt(clock.t + 15 * 60e3, 'fresh');
  fakeFetch((c) => (path(c) === '/api/v1/auth/refresh' ? { body: { access_token: fresh, refresh_token: 'ref-2' } } : { body: DAY }));
  await fuse.api('/api/v2/customer/premises');
  assert.deepEqual(calls.map(path), ['/api/v1/auth/refresh', '/api/v2/customer/premises']);
  assert.equal(calls[1].headers.Authorization, `Bearer ${fresh}`);
  // A token that isn't a JWT can't be read for its expiry: used as it is, renewed on a 401.
  calls = [];
  SIGNED_IN(storage, 'opaque', 'ref-2');
  await fuse.api('/api/v2/customer/premises');
  assert.deepEqual(calls.map(path), ['/api/v2/customer/premises']);
});

test('two tabs hitting a 401 together renew once; the second sees the first one\'s tokens', async () => {
  const storage = memStore();
  const locks = takeTurns(); // navigator.locks is shared by a browser's tabs
  const a = setup({ storage, locks });
  const b = setup({ storage, locks, settings: a.s, now: a.clock.t });
  SIGNED_IN(storage, 'old-access', 'ref-1');
  const fresh = jwt(farFuture, 'fresh');
  fakeFetch((c) => {
    if (path(c) === '/api/v1/auth/refresh') return { body: { access_token: fresh, refresh_token: 'ref-2' } };
    return c.headers.Authorization === `Bearer ${fresh}` ? { body: DAY } : { status: 401, body: {} };
  });
  await Promise.all([a.fuse.api('/api/v2/customer/premises'), b.fuse.api('/api/v2/customer/premises')]);
  assert.equal(calls.filter((c) => path(c) === '/api/v1/auth/refresh').length, 1);
  assert.equal(stored(storage).refresh, 'ref-2');
  // One tab calling twice at once is the same.
  calls = [];
  SIGNED_IN(storage, 'old-access', 'ref-2');
  await Promise.all([a.fuse.api('/api/v2/customer/premises'), a.fuse.api('/api/v2/customer/premises')]);
  assert.equal(calls.filter((c) => path(c) === '/api/v1/auth/refresh').length, 1);
});

test('Fuse ends the session (the renewal is refused): signed out, device ID kept, and it never sends an SMS by itself', async () => {
  const { fuse, storage } = setup();
  SIGNED_IN(storage, 'old', 'ref-1', 'dev-9');
  fakeFetch((c) => (path(c) === '/api/v1/auth/refresh' ? { status: 401, body: { status_string: 'refresh_failed' } } : { status: 401, body: {} }));
  await assert.rejects(fuse.api('/api/v2/customer/premises'), (e) => e instanceof FuseSignedOut && /Send code to sign in again/.test(e.message));
  assert.deepEqual(stored(storage), { deviceId: 'dev-9' });
  assert.equal(fuse.signedIn, false);
  calls = [];
  await assert.rejects(fuse.api('/api/v2/customer/premises'), FuseSignedOut);
  assert.equal(calls.length, 0, 'signed out: nothing is asked, and no code is requested');
  assert.ok(calls.every((c) => path(c) !== '/api/trpc/phoneSignIn'));
});

test('a renewal that fails for a server or network reason keeps the sign-in for next time', async () => {
  const { fuse, storage } = setup();
  SIGNED_IN(storage, 'old', 'ref-1');
  fakeFetch((c) => (path(c) === '/api/v1/auth/refresh' ? { status: 503, body: {} } : { status: 401, body: {} }));
  await assert.rejects(fuse.api('/api/v2/customer/premises'), (e) => !(e instanceof FuseSignedOut));
  assert.equal(fuse.signedIn, true);
  assert.equal(stored(storage).refresh, 'ref-1');
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(fuse.api('/api/v2/customer/premises'), /didn't answer this browser.*docs\/fuse\.md/);
  assert.equal(fuse.signedIn, true);
  // Refused again straight after a renewal: said so, tokens kept (no loop of renewals).
  calls = [];
  fakeFetch((c) => (path(c) === '/api/v1/auth/refresh' ? { body: { access_token: 'n', refresh_token: 'r2' } } : { status: 401, body: {} }));
  await assert.rejects(fuse.api('/api/v2/customer/premises'), /didn't accept the panel's sign-in/);
  assert.equal(calls.filter((c) => path(c) === '/api/v1/auth/refresh').length, 1);
});

test('where it talks: Fuse directly, or a relay that must be https', () => {
  const { s, fuse } = setup();
  assert.equal(fuse.url('/api/v3/auth'), 'https://api.fuseenergy.com/api/v3/auth');
  assert.equal(fuse.smsUrl(), 'https://www.fuseenergy.com/api/trpc/phoneSignIn');
  s.fuse.proxy = 'https://fuse-relay.me.workers.dev/';
  assert.equal(fuse.url('/api/v3/auth'), 'https://fuse-relay.me.workers.dev/api/v3/auth');
  assert.equal(fuse.smsUrl(), 'https://fuse-relay.me.workers.dev/web/api/trpc/phoneSignIn');
  s.fuse.proxy = 'http://insecure.example';
  assert.throws(() => fuse.url('/x'), /must look like https/);
});

test('no sign-in detail ever travels in a URL', async () => {
  const { fuse, storage } = setup();
  fuseServer();
  await fuse.startSignIn('07700 900123');
  await fuse.submitCode('123456');
  fakeFetch(() => ({ body: [{ premises: { id: 'p-1', address_line_1: '1 High St' } }] }));
  await fuse.premises();
  await fuse.day('p-1', '2026-10-17');
  const secrets = ['7700900123', '07700', 'acc-1', 'ref-1', '123456', 'flow-1', stored(storage).deviceId];
  for (const c of calls) for (const sec of secrets) assert.ok(!c.url.includes(sec), `${sec} in ${c.url}`);
});

// ---------- The data ----------

test('premises and the day\'s chart request', async () => {
  const { fuse, storage } = setup();
  SIGNED_IN(storage, 'acc', 'ref');
  fakeFetch((c) => (path(c) === '/api/v2/customer/premises'
    ? { body: [{ junk: 1 }, { premises: { id: 'p-1', address_line_1: '1 High St' }, supplies: [] }] }
    : { body: { supplies: [] } }));
  assert.deepEqual(await fuse.premises(), { id: 'p-1', name: '1 High St' });
  await fuse.day('p-1', '2026-10-17');
  const chart = calls.at(-1);
  assert.equal(path(chart), '/api/v1/premises/p-1/chart');
  assert.deepEqual(Object.fromEntries(new URL(chart.url).searchParams), { year: '2026', month: '10', day: '17' });
  assert.equal(chart.headers.Authorization, 'Bearer acc');
  assert.equal(chart.headers['Device-Id'], stored(storage).deviceId);
  assert.equal(chart.headers['Content-Type'], undefined, 'a plain GET');
  fakeFetch(() => ({ body: [] }));
  await assert.rejects(fuse.premises(), /no property on this account/);
});

/** A bar as Fuse sends it. */
const bar = (ymd, hour, kwh, pence2dp, { type = 'REALISED', usage, standing } = {}) => {
  const [year, month, day] = ymd.split('-').map(Number);
  const entry = { bar: { index: { year, month, day, hour }, kWh: kwh, money: { amount: pence2dp, currency: 'GBP' }, type } };
  if (usage != null) entry.breakdown = [{ name: 'USAGE', value: { amount: usage }, kWh: kwh }, ...(standing != null ? [{ name: 'STANDING', value: { amount: standing }, kWh: null }] : [])];
  return entry;
};
const chartOf = (supplies, extra = {}) => ({ supplies: Object.entries(supplies).map(([supply_type, bars]) => ({ supply_fid: 'f', supply_type, bars })), ...extra });
const iso = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z';
const NOON = at('2026-10-17T12:00:00+01:00');

test('parseChart: Fuse\'s UK clock hours land on the right instants (BST, GMT)', () => {
  let c = parseChart(chartOf({ ELEC_IMPORT: [bar('2026-07-15', 13, '0.5', '0.12', { usage: '0.12' })] }), '2026-07-15', { now: NOON });
  assert.equal(iso(c.elec[0].start), '2026-07-15T12:00Z', 'BST: 13:00 is 12:00 UTC');
  assert.equal(c.elec[0].end - c.elec[0].start, 3600e3);
  c = parseChart(chartOf({ ELEC_IMPORT: [bar('2026-01-15', 13, '0.5', '0.12', { usage: '0.12' })] }), '2026-01-15', { now: NOON });
  assert.equal(iso(c.elec[0].start), '2026-01-15T13:00Z', 'GMT: 13:00 is 13:00 UTC');
});

test('parseChart: the clock-back day has 25 hours (hour 1 comes twice, the second is GMT)', () => {
  const bars = [0, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map((h) => bar('2026-10-25', h, '0.1', '0.03', { usage: '0.03' }));
  const { elec } = parseChart(chartOf({ ELEC_IMPORT: bars }), '2026-10-25', { now: at('2026-10-26T12:00:00Z') });
  assert.equal(elec.length, 25);
  assert.deepEqual(elec.slice(0, 4).map((h) => iso(h.start)), ['2026-10-24T23:00Z', '2026-10-25T00:00Z', '2026-10-25T01:00Z', '2026-10-25T02:00Z']);
  assert.equal(iso(elec.at(-1).end), '2026-10-26T00:00Z');
  assert.equal(new Set(elec.map((h) => h.start)).size, 25, 'no two bars on one instant');
  assert.ok(elec.every((h, i) => i === 0 || h.start === elec[i - 1].end), 'no gaps');
});

test('parseChart: the clock-forward day has 23 hours, and a bar for the hour that never happens is dropped', () => {
  const hours = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const { elec } = parseChart(chartOf({ ELEC_IMPORT: hours.map((h) => bar('2026-03-29', h, '0.1', '0.03', { usage: '0.03' })) }), '2026-03-29', { now: at('2026-03-30T12:00:00Z') });
  assert.equal(elec.length, 23, 'hour 1 (01:00 GMT to 02:00 BST) does not exist');
  assert.deepEqual(elec.slice(0, 3).map((h) => iso(h.start)), ['2026-03-29T00:00Z', '2026-03-29T01:00Z', '2026-03-29T02:00Z']);
  assert.equal(iso(elec.at(-1).end), '2026-03-29T23:00Z');
});

test('parseChart: electricity, export and gas are kept apart; others, other days, forecasts and junk are left out', () => {
  const body = chartOf({
    ELEC_IMPORT: [
      bar('2026-10-17', 9, '0.4', '0.10', { usage: '0.10' }),
      bar('2026-10-16', 23, '9', '9'), // padding from yesterday
      bar('2026-10-17', 10, '0.4', '0.10', { type: 'FORECASTED', usage: '0.10' }),
      bar('2026-10-17', 11, 'lots', '0.10'), // not a number
      bar('2026-10-17', 12, '0.4', null), // no cost at all
      { bar: null }, null, 'junk', bar('2026-10-17', 13, null, '0.1'),
    ],
    ELEC_EXPORT: [bar('2026-10-17', 9, '0.2', '0.02', { usage: '0.02' })],
    GAS: [bar('2026-10-17', 8, '2.5', '0.20', { usage: '0.19', standing: '0.01' })],
    WATER: [bar('2026-10-17', 8, '1', '1')],
  });
  const c = parseChart(body, '2026-10-17', { now: NOON });
  assert.equal(c.elec.length, 1);
  assert.equal(c.export.length, 1);
  assert.equal(c.gas.length, 1);
  assert.equal(c.elec[0].kwh, 0.4);
  assert.deepEqual(c.has, { elec: true, gas: true, export: true }, 'the supplies the account lists');
  const none = { elec: [], gas: [], export: [], has: { elec: false, gas: false, export: false }, current: null };
  assert.deepEqual(parseChart(null, '2026-10-17'), none);
  assert.deepEqual(parseChart({ supplies: 'x' }, '2026-10-17'), none);
  // A gas supply with nothing realised yet is still a gas supply.
  const quiet = parseChart(chartOf({ ELEC_IMPORT: [bar('2026-10-17', 9, '0.4', '0.10', { usage: '0.10' })], GAS: [bar('2026-10-17', 10, '0', '0', { type: 'FORECASTED' })] }), '2026-10-17', { now: NOON });
  assert.deepEqual([quiet.gas.length, quiet.has.gas], [0, true]);
});

test('parseChart: a repeated hour on an ordinary day isn\'t counted twice', () => {
  const { elec } = parseChart(chartOf({ ELEC_IMPORT: [bar('2026-10-17', 9, '0.4', '0.1', { usage: '0.1' }), bar('2026-10-17', 9, '0.4', '0.1', { usage: '0.1' })] }), '2026-10-17', { now: NOON });
  assert.equal(elec.length, 1);
});

test('parseChart: cost is the sum of the 4-decimal breakdown, not the truncated 2-decimal figure', () => {
  // Fuse's rounded field is the true figure truncated: 0.1086 + 0.0181 = 0.1267 shows as 0.12.
  const { elec } = parseChart(chartOf({ ELEC_IMPORT: [bar('2026-10-17', 9, '0.422', '0.12', { usage: '0.1086', standing: '0.0181' })] }), '2026-10-17', { now: NOON });
  assert.equal(elec[0].pence, 12.67);
  assert.equal(elec[0].standingP, 1.81);
  // A component Fuse adds later (a levy, a discount) is counted without a code change.
  const odd = bar('2026-10-17', 9, '1', '0.50', { usage: '0.30', standing: '0.02' });
  odd.breakdown.push({ name: 'DISCOUNT', value: { amount: '-0.05' }, kWh: null });
  assert.equal(parseChart(chartOf({ ELEC_IMPORT: [odd] }), '2026-10-17', { now: NOON }).elec[0].pence, 27);
  // No breakdown: the rounded figure is the best there is.
  const plain = parseChart(chartOf({ ELEC_IMPORT: [bar('2026-10-17', 9, '1', '0.50')] }), '2026-10-17', { now: NOON }).elec[0];
  assert.equal(plain.pence, 50);
  assert.equal(plain.standingP, 0);
  // A true zero is a real hour, not a missing one.
  assert.equal(parseChart(chartOf({ ELEC_IMPORT: [bar('2026-10-17', 9, '0', '0.00', { usage: '0.0000' })] }), '2026-10-17', { now: NOON }).elec.length, 1);
});

test('parseChart: the hour in progress is marked (by the clock, or by Fuse\'s current_index), and counts', () => {
  const body = chartOf({ ELEC_IMPORT: [bar('2026-10-17', 13, '0.5', '0.12', { usage: '0.11', standing: '0.01' }), bar('2026-10-17', 14, '0.125', '0.04', { usage: '0.03', standing: '0.01' })] },
    { current_index: { year: 2026, month: 10, day: 17, hour: 14 } });
  const now = at('2026-10-17T14:35:00+01:00');
  const c = parseChart(body, '2026-10-17', { now });
  assert.deepEqual(c.elec.map((h) => h.inProgress), [false, true]);
  assert.equal(c.current, c.elec[1].start);
  // The tablet's clock being wrong doesn't hide it: Fuse says which hour is current.
  assert.deepEqual(parseChart(body, '2026-10-17', { now: at('2026-10-17T09:00:00+01:00') }).elec.map((h) => h.inProgress), [false, true]);
  // A day that isn't today has none.
  const yesterday = parseChart(chartOf({ ELEC_IMPORT: [bar('2026-10-16', 13, '0.5', '0.12', { usage: '0.12' })] }, { current_index: { year: 2026, month: 10, day: 17, hour: 14 } }), '2026-10-16', { now });
  assert.equal(yesterday.elec[0].inProgress, false);
  assert.equal(yesterday.current, null);
});

test('dayTotals: kWh, pence, and how far the readings reach (half past, for the hour in progress)', () => {
  const H = (h, kwh, pence, inProgress = false) => ({ start: at('2026-10-17T00:00:00Z') + h * 3600e3, end: at('2026-10-17T00:00:00Z') + (h + 1) * 3600e3, kwh, pence, standingP: 1, inProgress });
  const t = dayTotals([H(8, 0.5, 10), H(9, 0.25, 7), H(10, 0.125, 3.5, true)]);
  assert.equal(t.kwh, 0.875);
  assert.equal(t.pence, 20.5);
  assert.equal(t.hours, 3);
  assert.equal(iso(t.last), '2026-10-17T10:30Z');
  // Standing charge only (no usage yet): money, but no readings.
  const early = dayTotals([H(0, 0, 1.8, true)]);
  assert.deepEqual({ kwh: early.kwh, pence: early.pence, last: early.last }, { kwh: 0, pence: 1.8, last: null });
  assert.deepEqual(dayTotals([]), { kwh: 0, pence: 0, hours: 0, last: null });
  assert.deepEqual(dayTotals(null), { kwh: 0, pence: 0, hours: 0, last: null });
});

test('explainFuseError: plain words for a blocked browser, a refused sign-in, an old app version and a rate limit', () => {
  assert.match(explainFuseError(new TypeError('Failed to fetch')).message, /Fuse didn't answer this browser.*docs\/fuse\.md/);
  assert.match(explainFuseError(new HttpError(401, '401')).message, /Send code to sign in again/);
  assert.match(explainFuseError(new HttpError(426, '426')).message, /FUSE_APP_VERSION/);
  assert.equal(explainFuseError(new HttpError(429, '429')).status, 429);
  const out = new FuseSignedOut();
  assert.equal(explainFuseError(out), out);
  const other = new HttpError(500, 'x');
  assert.equal(explainFuseError(other), other);
});

// ---------- Found by the review ----------

/** Lets a renewal be held open while the test does something else (sign out, sign in) meanwhile. */
function heldRenewal(then) {
  let release;
  const gate = new Promise((r) => { release = r; });
  fakeFetch(async (c) => {
    if (path(c) === '/api/v1/auth/refresh') { await gate; return then(c); }
    return c.headers.Authorization === 'Bearer fresh-acc' ? { body: DAY } : { status: 401, body: {} };
  });
  return { release, wait: () => new Promise((r) => setTimeout(r, 15)) };
}

test('signing out while a renewal is in flight is not undone by its answer', async () => {
  const { fuse, storage } = setup();
  SIGNED_IN(storage, 'old', 'ref-1');
  const held = heldRenewal(() => ({ body: { access_token: 'new', refresh_token: 'ref-2' } }));
  const call = fuse.api('/api/v2/customer/premises').catch((e) => e);
  await held.wait();
  fuse.signOut();
  held.release();
  assert.ok(await call instanceof FuseSignedOut);
  assert.equal(fuse.signedIn, false);
  assert.deepEqual(stored(storage), { deviceId: 'dev-1' }, 'the pair Fuse just rotated is not written back');
});

test('signing in afresh while a renewal is in flight keeps the new sign-in, whatever the old one is told', async () => {
  for (const answer of [() => ({ status: 401, body: { status_string: 'refresh_failed' } }), () => ({ body: { access_token: 'rotated-old', refresh_token: 'ref-old-2' } })]) {
    const { fuse, storage } = setup();
    SIGNED_IN(storage, 'old', 'ref-1');
    const held = heldRenewal(answer);
    const call = fuse.api('/api/v2/customer/premises');
    await held.wait();
    SIGNED_IN(storage, 'fresh-acc', 'fresh-ref'); // what the Settings page saves after "Sign in"
    held.release();
    assert.deepEqual(await call, DAY, 'carries on with the new sign-in');
    assert.deepEqual([stored(storage).access, stored(storage).refresh], ['fresh-acc', 'fresh-ref']);
  }
});

test('only Fuse ending the session signs the panel out: a block, a relay\'s 403 or 404, a 426, a 429 or a server fault keep it', async () => {
  const cases = [
    [400, {}, true], [401, {}, true], [403, { status_string: 'refresh_failed' }, true],
    [403, undefined, false], [403, '<html>blocked</html>', false], [404, {}, false], [408, {}, false], [426, {}, false], [429, {}, false], [500, {}, false], [503, {}, false],
  ];
  for (const [status, body, wipes] of cases) {
    const { fuse, storage } = setup();
    SIGNED_IN(storage, 'old', 'ref-1');
    fakeFetch((c) => (path(c) === '/api/v1/auth/refresh' ? { status, body } : { status: 401, body: {} }));
    const err = await fuse.api('/api/v2/customer/premises').catch((e) => e);
    assert.equal(err instanceof FuseSignedOut, wipes, `${status} ${JSON.stringify(body)}`);
    assert.equal(fuse.signedIn, !wipes, `${status} ${JSON.stringify(body)}`);
  }
});

test('sign-in errors blame the right thing: no code yet means Fuse turned the request away; 426 and 429 say what to do', async () => {
  const run = async (handler, act) => { const { fuse } = setup(); fakeFetch(handler); return act(fuse).then(() => null, (e) => e); };
  const initial = (status, body) => (c) => (path(c) === '/api/v3/auth' ? { status, body } : { body: {} });
  let e = await run(initial(403, undefined), (f) => f.startSignIn('07700900123'));
  assert.equal(e.code, 'http_403');
  assert.match(e.message, /turned the request away \(403\).*docs\/fuse\.md/);
  assert.doesNotMatch(e.message, /code isn't right/);
  e = await run(initial(429, {}), (f) => f.startSignIn('07700900123'));
  assert.match(e.message, /wait a few minutes/);
  e = await run((c) => (path(c) === '/api/trpc/phoneSignIn' ? { status: 429, body: {} } : { body: { auth_flow_token: 'f' } }), (f) => f.startSignIn('07700900123'));
  assert.equal(e.code, 'rate_limited');
  e = await run((c) => (path(c) === '/api/trpc/phoneSignIn' ? { status: 426, body: {} } : { body: { auth_flow_token: 'f' } }), (f) => f.startSignIn('07700900123'));
  assert.match(e.message, /FUSE_APP_VERSION/);
  e = await run((c) => (path(c) === '/api/trpc/phoneSignIn' ? { status: 403, body: undefined } : { body: { auth_flow_token: 'f' } }), (f) => f.startSignIn('07700900123'));
  assert.equal(e.code, 'http_403');
  // With the flow token (the code step), a 403 with no reason does mean the code.
  const { fuse } = setup();
  fakeFetch((c) => (c.body?.challenge_type === 'INITIAL' ? { body: { auth_flow_token: 'f' } } : c.body?.challenge_type === 'PHONE_OTP' ? { status: 403, body: undefined } : { body: {} }));
  await fuse.startSignIn('07700900123');
  e = await fuse.submitCode('123456').then(() => null, (x) => x);
  assert.equal(e.code, 'invalid_code');
});

test('a storage that takes no writes but still reads: the renewed pair in memory wins over the dead one stored', async () => {
  const stuck = { v: JSON.stringify({ deviceId: 'd', access: 'dead-acc', refresh: 'ref-0' }), getItem() { return this.v; }, setItem() { throw new Error('QuotaExceededError'); }, removeItem() {} };
  const { fuse } = setup({ storage: stuck });
  let n = 0, rejectOnce = false;
  fakeFetch((c) => {
    if (path(c) === '/api/v1/auth/refresh') {
      if (c.body.refresh_token !== `ref-${n}`) return { status: 401, body: { status_string: 'refresh_failed' } }; // Fuse killed the old one at once
      n++;
      return { body: { access_token: `acc-${n}`, refresh_token: `ref-${n}` } };
    }
    if (rejectOnce) { rejectOnce = false; return { status: 401, body: {} }; }
    return c.headers.Authorization === `Bearer acc-${n}` ? { body: DAY } : { status: 401, body: {} };
  });
  await fuse.api('/api/v2/customer/premises'); // dead-acc is refused: renewed to acc-1/ref-1, which can't be stored
  rejectOnce = true;
  await fuse.api('/api/v2/customer/premises'); // refused once more: must renew with ref-1, not the stored ref-0
  assert.equal(n, 2);
  assert.equal(fuse.signedIn, true);
});

test('the clock-change hour that comes twice: only the one it really is now is "in progress"', () => {
  const hours = [0, 1, 1, ...Array.from({ length: 22 }, (_, i) => i + 2)];
  const body = chartOf({ ELEC_IMPORT: hours.map((h) => bar('2026-10-25', h, '0.1', '0.03', { usage: '0.03' })) }, { current_index: { year: 2026, month: 10, day: 25, hour: 1 } });
  const flagged = (now) => parseChart(body, '2026-10-25', { now }).elec.filter((h) => h.inProgress).map((h) => iso(h.start));
  assert.deepEqual(flagged(at('2026-10-25T00:30:00Z')), ['2026-10-25T00:00Z'], '00:30 UTC is still the first (BST) 01:30');
  assert.deepEqual(flagged(at('2026-10-25T01:30:00Z')), ['2026-10-25T01:00Z'], '01:30 UTC is the second (GMT) one');
  assert.deepEqual(flagged(at('2026-10-25T05:00:00Z')).length, 1);
});

test('normalisePhone: the trunk 0 written as (0) or after +44 is dropped', () => {
  for (const n of ['+44 (0)7700 900123', '0044 (0)7700 900123', '+44 07700 900123', '4407700900123', '+44 7700 900123']) assert.equal(normalisePhone(n), '+447700900123', n);
});

test('chartSummary: the hour and kWh of every bar and the field names, never IDs or addresses', () => {
  const body = chartOf({
    ELEC_IMPORT: [bar('2026-10-17', 8, '0.422', '0.12', { usage: '0.1086', standing: '0.0181' }), bar('2026-10-17', 9, '0.1', '0.05', { type: 'FORECASTED' })],
    GAS: [bar('2026-10-17', 8, '1.5', '0.10', { usage: '0.09' })],
  }, { current_index: { year: 2026, month: 10, day: 17, hour: 9 }, premises_address: '1 Secret Street', supply_fid_extra: 'abc' });
  body.supplies[0].supply_fid = 'secret-supply-id';
  const text = chartSummary(body, '2026-10-17');
  assert.match(text, /^Fuse's chart for 2026-10-17\n/);
  assert.match(text, /ELEC_IMPORT: 2 bars\n10\.17\.08=0\.422 10\.17\.09=0\.1\?/, 'an unrealised bar is marked');
  assert.match(text, /GAS: 1 bars\n10\.17\.08=1\.5\n/);
  assert.match(text, /first realised bar: money 0\.12, parts \[\["USAGE","0\.1086","0\.422"\],\["STANDING","0\.0181",null\]\]/);
  assert.match(text, /fields: chart\[.*premises_address.*\] supply\[.*supply_fid.*\]/, 'the names of the fields are listed');
  assert.match(text, /current_index: \{"year":2026,"month":10,"day":17,"hour":9\}/);
  assert.ok(!/Secret|secret-supply-id|abc/.test(text), 'no values from outside the numbers');
  assert.equal(chartSummary(null, '2026-10-17').split('\n').length, 3, 'a body that is not a chart still gives a summary');
});

// ---------- Month and year views ----------

/** A coarse bar: a day of a month, or a month of a year (no hour in its index). */
const coarse = (index, kwh, usage, { type = 'REALISED', standing = '0.4735' } = {}) =>
  ({ bar: { index, kWh: String(kwh), money: { amount: '0.00', currency: 'GBP' }, type }, breakdown: [{ name: 'USAGE', value: { amount: String(usage) }, kWh: String(kwh) }, { name: 'STANDING', value: { amount: standing }, kWh: null }] });

test('parseRange (a month): daily bars on the UK calendar, 25 hours long on the clock-change day, padding and forecasts left out', () => {
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const body = chartOf({
    ELEC_IMPORT: [...days.map((d) => coarse({ year: 2026, month: 10, day: d }, 10 + d, 2 + d, { type: d <= 20 ? 'REALISED' : 'FORECASTED' })), coarse({ year: 2026, month: 9, day: 30 }, 99, 99)],
    GAS: days.filter((d) => d <= 20).map((d) => coarse({ year: 2026, month: 10, day: d }, 30, 2)),
  });
  const now = at('2026-10-20T14:00:00+01:00');
  const m = parseRange(body, 'day', { year: 2026, month: 10 }, { now });
  assert.equal(m.elec.length, 20, 'only the realised days');
  assert.equal(m.gas.length, 20);
  assert.equal(m.skipped, 1, 'the bar from September');
  assert.equal(m.elec[0].kwh, 11);
  assert.equal(m.elec[0].pence, 100 * (3 + 0.4735), 'usage plus standing, from the breakdown');
  assert.deepEqual(m.elec.map((d) => d.inProgress).lastIndexOf(true), 19, 'the 20th is today');
  assert.equal(m.elec.filter((d) => d.inProgress).length, 1);
  assert.deepEqual([iso(m.elec[0].start), iso(m.elec[0].end)], ['2026-09-30T23:00Z', '2026-10-01T23:00Z'], 'BST: the 1st starts at 23:00 UTC the day before');
  const clock = parseRange(chartOf({ ELEC_IMPORT: [coarse({ year: 2026, month: 10, day: 25 }, 1, 1)] }), 'day', { year: 2026, month: 10 }, { now: at('2026-10-26T12:00:00Z') }).elec[0];
  assert.equal((clock.end - clock.start) / 3600e3, 25, 'the clock-back day has 25 hours');
  assert.deepEqual(m.has, { elec: true, gas: true, export: false });
});

test('parseRange (a year): monthly bars, with the right edges for BST and GMT months, and bad bars skipped', () => {
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const body = chartOf({
    ELEC_IMPORT: [...months.map((mo) => coarse({ year: 2026, month: mo }, 100 * mo, 20 * mo)), coarse({ year: 2025, month: 12 }, 1, 1), coarse({ year: 2026, month: 13 }, 1, 1), coarse({ year: 2026, month: 3 }, 5, 5)],
  });
  const y = parseRange(body, 'month', { year: 2026 }, { now: at('2026-10-17T12:00:00+01:00') });
  assert.equal(y.elec.length, 12, 'a repeated month is counted once');
  assert.equal(y.skipped, 3, 'last December, month 13, and the repeated March');
  assert.deepEqual(y.elec.map((m) => m.inProgress).indexOf(true), 9, 'October is the month in progress');
  const iso16 = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z';
  assert.deepEqual([iso16(y.elec[0].start), iso16(y.elec[0].end)], ['2026-01-01T00:00Z', '2026-02-01T00:00Z']);
  assert.deepEqual([iso16(y.elec[9].start), iso16(y.elec[9].end)], ['2026-09-30T23:00Z', '2026-11-01T00:00Z'], 'October: starts in BST, ends in GMT');
  assert.equal(iso16(y.elec[11].end), '2027-01-01T00:00Z');
  assert.deepEqual(parseRange(null, 'month', { year: 2026 }).elec, []);
  assert.deepEqual(parseRange({ supplies: 'x' }, 'day', { year: 2026, month: 1 }).skipped, 0);
});

test('isEvenSpread: the same figure hour after hour is Fuse sharing a total out, not readings', () => {
  const hrs = (kwhs, inProgressLast = false) => kwhs.map((kwh, i) => ({ kwh, inProgress: inProgressLast && i === kwhs.length - 1 }));
  const same = (n, v = 0.37) => Array(n).fill(v);
  assert.equal(isEvenSpread(hrs(same(9))), true);
  assert.equal(isEvenSpread(hrs(same(24))), true, 'a whole day');
  assert.equal(isEvenSpread(hrs([2.9, 2.9, 2.9, ...same(6, 0.25)])), false, 'a real morning peak');
  assert.equal(isEvenSpread(hrs(same(6))), false, 'a few quiet hours can repeat by chance');
  assert.equal(isEvenSpread(hrs([...same(8), 0.18], true)), true, 'the hour in progress (half of it so far) is left out');
  assert.equal(isEvenSpread(hrs([...same(7), 0.18], true)), false, 'seven finished hours is too few to say');
  assert.equal(isEvenSpread(hrs([0, 0, 0, 0, 0, 0])), false, 'no usage is not a spread');
  assert.equal(isEvenSpread(hrs([0.371, 0.37, 0.372, 0.37, 0.369])), false, 'real readings differ');
  assert.equal(isEvenSpread(null), false);
});

test('a month and a year are asked for by leaving the day (and the month) out of the chart call', async () => {
  const { fuse, storage } = setup();
  SIGNED_IN(storage, 'acc', 'ref');
  fakeFetch(() => ({ body: { supplies: [] } }));
  await fuse.month('p-1', 2026, 10);
  await fuse.year('p-1', 2026);
  assert.deepEqual(calls.map((c) => Object.fromEntries(new URL(c.url).searchParams)), [{ year: '2026', month: '10' }, { year: '2026' }]);
  assert.ok(calls.every((c) => path(c) === '/api/v1/premises/p-1/chart'));
});

test('chartSummary: a month shows month.day and a year just the month, whatever the title', () => {
  const month = chartSummary(chartOf({ GAS: [coarse({ year: 2026, month: 10, day: 3 }, 20.5, 1.4), coarse({ year: 2026, month: 10, day: 4 }, 22, 1.5, { type: 'FORECASTED' })] }), '2026-10 (this month, a bar per day)');
  assert.match(month, /^Fuse's chart for 2026-10 \(this month, a bar per day\)\n/);
  assert.match(month, /GAS: 2 bars\n10\.03=20\.5 10\.04=22\?/);
  const year = chartSummary(chartOf({ ELEC_IMPORT: [coarse({ year: 2026, month: 1 }, 410, 110), coarse({ year: 2026, month: 2 }, 380, 100)] }), '2026 (this year, a bar per month)');
  assert.match(year, /ELEC_IMPORT: 2 bars\n01=410 02=380/);
});

// ---------- What a real account sent (18 October 2026, 07:xx; the account began on 9 October) ----------

test("a real account's month, year and day: bars from the day the account began, zero days, gas as the day's total spread over 24 hours", () => {
  const now = at('2026-10-18T07:40:00+01:00');
  const gasDays = { 9: 19.091, 10: 24.467, 11: 0, 12: 1.071, 13: 34.830, 14: 17.615, 15: 14.652, 16: 41.577, 17: 9.465, 18: 0 };
  const elecDays = { 9: 0, 10: 14.529, 11: 4.181, 12: 3.702, 13: 9.683, 14: 9.368, 15: 5.891, 16: 8.744, 17: 12.090, 18: 0.721 };
  const days = (kwhOf, usageRate, standing) => Array.from({ length: 23 }, (_, i) => i + 9).map((d) => (d <= 18
    ? coarse({ year: 2026, month: 10, day: d }, kwhOf[d], +(kwhOf[d] * usageRate).toFixed(4), { standing })
    : coarse({ year: 2026, month: 10, day: d }, 8, 0.7, { type: 'FORECASTED' })));
  const month = parseRange(chartOf({ GAS: days(gasDays, 0.085, '0.1100'), ELEC_IMPORT: days(elecDays, 0.247, '0.3400') }, { current_index: { year: 2026, month: 10, day: 18 } }), 'day', { year: 2026, month: 10 }, { now });
  assert.equal(month.gas.length, 10, '9 to 18 October: the days before the account began are simply absent, and the forecasts are left out');
  assert.equal(month.elec.length, 10);
  assert.equal(+month.gas.reduce((t, d) => t + d.kwh, 0).toFixed(3), 162.768, "the year's October figure (162.771) within Fuse's own rounding");
  assert.equal(month.elec[0].kwh, 0, 'the first day: no usage yet, just the standing charge');
  assert.equal(month.elec[0].pence, 34, 'the standing charge is still the day\'s cost');
  assert.equal(month.gas.find((d) => new Date(d.start + 3600e3).getUTCDate() === 11).kwh, 0, 'a day the gas meter did not report');
  assert.equal(month.gas.filter((d) => d.inProgress).length, 1, 'the 18th is the day in progress');

  // The year: one realised month, then forecasts.
  const year = parseRange(chartOf({
    GAS: [coarse({ year: 2026, month: 10 }, 162.771, 13.86, { standing: '1.19' }), coarse({ year: 2026, month: 11 }, 395.262, 33, { type: 'FORECASTED' }), coarse({ year: 2026, month: 12 }, 511.802, 43, { type: 'FORECASTED' })],
    ELEC_IMPORT: [coarse({ year: 2026, month: 10 }, 68.910, 17.02, { standing: '3.49' }), coarse({ year: 2026, month: 11 }, 276.978, 70, { type: 'FORECASTED' })],
  }, { current_index: { year: 2026, month: 10 } }), 'month', { year: 2026 }, { now });
  assert.deepEqual([year.gas.length, year.elec.length], [1, 1], 'October only');
  assert.deepEqual([year.gas[0].kwh, year.elec[0].kwh], [162.771, 68.910]);
  assert.equal(year.gas[0].inProgress, true);
  assert.equal(Math.round(year.gas[0].pence), 1505, 'usage plus standing');

  // The day: gas the same every hour. Yesterday's 24 hours are even; today's 8 so far are too few on their own.
  const hours = (ymd, n, kwh, nowIn) => Array.from({ length: n }, (_, h) => bar(ymd, h, String(kwh), '0.03', { usage: '0.0336', standing: '0.0049', type: 'REALISED' }));
  const yesterday = parseChart(chartOf({ GAS: hours('2026-10-17', 24, 0.394) }), '2026-10-17', { now });
  assert.equal(isEvenSpread(yesterday.gas), true);
  assert.equal(+dayTotals(yesterday.gas).kwh.toFixed(3), 9.456, "the day's total, close to the daily figure (9.465) Fuse gives in the month");
  const today = parseChart(chartOf({ GAS: hours('2026-10-18', 8, 0.428) }, { current_index: { year: 2026, month: 10, day: 18, hour: 7 } }), '2026-10-18', { now });
  assert.equal(isEvenSpread(today.gas), false, "7 finished hours: not enough to call it even on today's own");
  assert.equal(today.gas.filter((h) => h.inProgress).length, 1, 'hour 07 is the hour in progress');
});

// ---------- Period totals: the headline for a day, month or year, with gas estimated for its unreported days ----------

const { gasEstimate, gasForPeriod, periodTotals, periodStarts } = await import('../../js/fuse.js');
/** A daily bar for 2026-10-<d> (BST until the 25th), pence = usage at 8.5p plus 11.8p standing. */
const gday = (d, kwh, tz = '+01:00') => {
  const start = Date.parse(`2026-10-${String(d).padStart(2, '0')}T00:00:00${tz}`);
  return { start, end: start + 864e5, kwh, pence: kwh * 8.5 + 11.8 };
};
// The real account of 18 October: gas arrives late, in lumps.
const REAL_GAS = { 9: 19.091, 10: 24.467, 11: 0, 12: 1.071, 13: 34.830, 14: 17.615, 15: 14.652, 16: 41.577, 17: 9.465, 18: 0 };
const realBars = () => Object.entries(REAL_GAS).map(([d, k]) => gday(+d, k));
const NOW18 = at('2026-10-18T07:40:00+01:00');
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('gasEstimate: the daily average of the week before the missing days; today counts the part of it that has gone', () => {
  const e = gasEstimate(realBars(), { now: NOW18 });
  assert.equal(e.lastReported, gday(17, 0).start, '17 October: the 18th has none yet');
  const weekKwh = 0 + 1.071 + 34.830 + 17.615 + 14.652 + 41.577 + 9.465; // 11th to 17th
  near(e.avg.kwh, weekKwh / 7);
  near(e.avg.pence, (weekKwh * 8.5 + 7 * 11.8) / 7, 1e-9);
  assert.equal(e.avg.days, 7);
  assert.equal(e.trailing.length, 1);
  near(e.trailing[0].weight, (7 + 40 / 60) / 24, 1e-9); // 07:40 of 24 hours
  assert.equal(e.trailing[0].pence, 11.8, "the 18th's own bar: a standing charge only");
});

test('gasEstimate: missing days since the last reading count whole; a young account averages the days it has; nothing reported means no estimate', () => {
  // Last reading on the 12th, now the 15th at noon: the 13th and 14th whole, the 15th half.
  const young = [9, 10, 11, 12].map((d) => gday(d, 10));
  const e = gasEstimate(young, { now: at('2026-10-15T12:00:00+01:00') });
  assert.deepEqual(e.trailing.map((t) => +t.weight.toFixed(3)), [1, 1, 0.5]);
  assert.equal(e.avg.days, 4, 'only 9 to 12 exist: the window starts on the 6th but the account began on the 9th');
  near(e.avg.kwh, 10);
  assert.deepEqual(gasEstimate([gday(9, 0), gday(10, 0)], { now: NOW18 }), { lastReported: null, avg: null, trailing: [] });
  assert.deepEqual(gasEstimate([], { now: NOW18 }), { lastReported: null, avg: null, trailing: [] });
  const today = gasEstimate([...realBars().slice(0, 9), gday(18, 5)], { now: NOW18 });
  assert.deepEqual(today.trailing, [], 'reported for today: nothing to estimate');
});

test('gasEstimate: across the clock change, the 25th is 25 hours and counts as one day', () => {
  const bars = [gday(21, 12), gday(22, 12), gday(23, 12), gday(24, 12)];
  const e = gasEstimate(bars, { now: at('2026-10-26T06:00:00Z') }); // 06:00 on the 26th (GMT)
  assert.deepEqual(e.trailing.map((t) => +t.weight.toFixed(3)), [1, 0.25]);
  assert.equal((e.trailing[0].end - e.trailing[0].start) / 3600e3, 25);
});

test('gasForPeriod: the unreported days come off as Fuse has them and go on as the estimate, only if inside the period', () => {
  const est = gasEstimate(realBars(), { now: NOW18 });
  const reported = { kwh: Object.values(REAL_GAS).reduce((a, b) => a + b, 0), pence: realBars().reduce((t, b) => t + b.pence, 0) };
  const m = gasForPeriod(reported, est, gday(1, 0).start);
  near(m.estKwh, est.avg.kwh * est.trailing[0].weight);
  near(m.kwh, reported.kwh + m.estKwh);
  near(m.pence, reported.pence - 11.8 + est.avg.pence * est.trailing[0].weight, 1e-9);
  assert.equal(m.basedOn, 7);
  const none = gasForPeriod(reported, est, gday(19, 0).start);
  assert.deepEqual([none.kwh, none.estKwh], [reported.kwh, 0], 'a period starting after those days has none of them');
  const noAvg = gasForPeriod({ kwh: 1, pence: 2 }, { avg: null, trailing: [] }, 0);
  assert.deepEqual([noAvg.kwh, noAvg.pence, noAvg.estPence], [1, 2, 0]);
});

const parsed = (bars, elec = []) => ({ elec, gas: bars, export: [], has: { elec: true, gas: true, export: false }, skipped: 0 });
const EL = (d, kwh, pence) => { const g = gday(d, 0); return { start: g.start, end: g.end, kwh, pence }; };
const elecBars = [9, 10, 11, 12, 13, 14, 15, 16, 17].map((d) => EL(d, 10, 300)).concat([EL(18, 0.7, 60)]);

test('periodTotals: day, month and year for both fuels, electricity as Fuse has it (today live), gas estimated for the days not in yet', () => {
  const est = gasEstimate(realBars(), { now: NOW18 });
  const w = est.trailing[0].weight;
  const today = { elec: { kwh: 0.8, pence: 70, hours: 8, last: 0 }, gas: { kwh: 3.4, pence: 40, hours: 8, last: 0 } };
  const month = parsed(realBars(), elecBars);
  const base = { now: NOW18, today, month, prevMonth: parsed([]), fuels: { elec: true, gas: true } };

  const d = periodTotals({ ...base, view: 'D' });
  assert.deepEqual(d.elec, today.elec, "today's own hours");
  near(d.gas.kwh, est.avg.kwh * w);
  near(d.gas.estKwh, d.gas.kwh, 1e-9);

  const m = periodTotals({ ...base, view: 'M' });
  near(m.elec.kwh, 9 * 10 + 0.8, 1e-9);
  near(m.elec.pence, 9 * 300 + 70, 1e-9);
  near(m.gas.kwh, Object.values(REAL_GAS).reduce((a, b) => a + b, 0) + est.avg.kwh * w, 1e-6);
  assert.equal(m.ready, true);

  // The year: the months before this one (none here: the account began in October) and this month.
  const year = { elec: [{ start: periodStarts(NOW18).month, end: periodStarts(NOW18).month + 31 * 864e5, kwh: 68.9, pence: 2052 }], gas: [{ start: periodStarts(NOW18).month, end: periodStarts(NOW18).month + 31 * 864e5, kwh: 162.771, pence: 1506 }], has: { elec: true, gas: true } };
  const y = periodTotals({ ...base, view: 'Y', year });
  near(y.elec.kwh, m.elec.kwh, 1e-9);
  near(y.gas.kwh, 162.771 + est.avg.kwh * w, 1e-6);
  const withEarlier = periodTotals({ ...base, view: 'Y', year: { ...year, elec: [{ start: Date.parse('2026-03-01T00:00:00Z'), end: Date.parse('2026-04-01T00:00:00Z'), kwh: 200, pence: 5000 }, ...year.elec] } });
  near(withEarlier.elec.kwh, m.elec.kwh + 200, 1e-9);
  near(withEarlier.elec.pence, m.elec.pence + 5000, 1e-9);
});

test('periodTotals: only the fuels chosen; real hourly gas counts as it is; what is still loading says so', () => {
  const today = { elec: { kwh: 0.8, pence: 70 }, gas: { kwh: 3.4, pence: 40 } };
  const month = parsed(realBars(), elecBars);
  const common = { now: NOW18, today, month, prevMonth: parsed([]) };
  const g = periodTotals({ ...common, view: 'M', fuels: { elec: false, gas: true } });
  assert.equal(g.elec, null);
  assert.ok(g.gas.kwh > 162);
  const e = periodTotals({ ...common, view: 'M', fuels: { elec: true, gas: false } });
  assert.equal(e.gas, null);
  const hourly = periodTotals({ ...common, view: 'D', fuels: { elec: false, gas: true }, gasHourly: true, month: null });
  assert.deepEqual([hourly.ready, hourly.gas.kwh, hourly.gas.estKwh], [true, 3.4, 0], "real hourly gas needs no month, and isn't estimated");
  const loading = periodTotals({ ...common, view: 'M', fuels: { elec: true, gas: true }, month: null });
  assert.deepEqual([loading.ready, loading.wait], [false, 'month']);
  const noPrev = periodTotals({ ...common, view: 'D', fuels: { elec: false, gas: true }, prevMonth: undefined });
  assert.deepEqual([noPrev.ready, noPrev.wait], [false, 'month'], "last month's bars are waited for (the week before can start there)");
  const skipPrev = periodTotals({ ...common, view: 'D', fuels: { elec: false, gas: true }, prevMonth: null });
  assert.equal(skipPrev.ready, true, 'null: unavailable, go without it');
  const noYear = periodTotals({ ...common, view: 'Y', fuels: { elec: true, gas: true } });
  assert.deepEqual([noYear.ready, noYear.wait], [false, 'year']);
  const early = periodTotals({ ...common, view: 'M', fuels: { elec: false, gas: true }, month: parsed([]) });
  assert.deepEqual([early.ready, early.gas.estKwh], [true, 0], 'no gas at all yet: nothing to estimate from');
});

test('periodStarts: where today, this month and this year began, in UK time', () => {
  const s = periodStarts(at('2026-10-18T07:40:00+01:00'));
  assert.equal(new Date(s.day).toISOString(), '2026-10-17T23:00:00.000Z');
  assert.equal(new Date(s.month).toISOString(), '2026-09-30T23:00:00.000Z');
  assert.equal(new Date(s.year).toISOString(), '2026-01-01T00:00:00.000Z');
});
