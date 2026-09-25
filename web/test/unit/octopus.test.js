import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Octopus, parseAccount, parseTelemetry, costToday, productFromTariff, regionFromTariff } from '../../js/octopus.js';
import { loadSettings } from '../../js/config.js';
import { HttpError } from '../../js/util.js';

const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('tariff helpers', () => {
  assert.equal(productFromTariff('E-1R-AGILE-24-10-01-C'), 'AGILE-24-10-01');
  assert.equal(regionFromTariff('E-1R-AGILE-24-10-01-C'), 'C');
  assert.throws(() => productFromTariff('AGILE'));
});

const account = (agreements, direction = 'IMPORT', deviceId = 'dev-1') => ({
  account: { electricityAgreements: [{ meterPoint: { mpan: '190', direction, meters: [{ serialNumber: 'S1', smartImportElectricityMeter: deviceId ? { deviceId } : null }], agreements } }] },
});

test('parseAccount picks the active import agreement and the Home Mini device', () => {
  const now = Date.parse('2026-09-25T09:00:00Z');
  const d = parseAccount(account([
    { validFrom: '2024-01-01T00:00:00Z', validTo: '2025-01-01T00:00:00Z', tariff: { tariffCode: 'E-1R-OLD-C', productCode: 'OLD' } },
    { validFrom: '2025-01-01T00:00:00Z', validTo: null, tariff: { tariffCode: 'E-1R-AGILE-24-10-01-C', productCode: 'AGILE-24-10-01' } },
  ]), now);
  assert.deepEqual({ ...d, at: 0 }, { tariff: 'E-1R-AGILE-24-10-01-C', product: 'AGILE-24-10-01', mpan: '190', serial: 'S1', deviceId: 'dev-1', at: 0 });
  assert.throws(() => parseAccount(account([{ validFrom: '2025-01-01T00:00:00Z', validTo: null, tariff: { tariffCode: 'E-1R-OUT-C' } }], 'EXPORT'), now), /No active/);
  assert.equal(parseAccount(account([{ validFrom: null, validTo: null, tariff: { tariffCode: 'E-1R-AGILE-24-10-01-C' } }], 'IMPORT', null), now).deviceId, '');
});

test('parseTelemetry and costToday', () => {
  const t = parseTelemetry([
    { readAt: '2026-09-25T00:30:00+01:00', consumptionDelta: 300, demand: 400 },
    { readAt: '2026-09-25T00:00:00+01:00', consumptionDelta: 200, demand: 350 },
    { readAt: '2026-09-25T01:00:00+01:00', consumptionDelta: null, demand: null },
  ]);
  assert.equal(t.todayKWh, 0.5);
  assert.equal(t.demandW, 400, 'newest half hour with a demand figure');
  assert.equal(t.demandAt, Date.parse('2026-09-25T00:30:00+01:00'));
  assert.equal(t.slots.length, 3);
  const rates = [{ start: Date.parse('2026-09-24T23:00:00Z'), end: Date.parse('2026-09-24T23:30:00Z'), p: 10 }, { start: Date.parse('2026-09-24T23:30:00Z'), end: Date.parse('2026-09-25T00:00:00Z'), p: 20 }];
  assert.equal(costToday(t.slots, rates, 45), 45 + 0.2 * 10 + 0.3 * 20);
});

let calls;
beforeEach(() => { calls = []; });
function fakeFetch(handler) {
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    const { status = 200, body } = await handler(url, opts);
    return { ok: status < 400, status, statusText: '', text: async () => JSON.stringify(body) };
  };
}
const jwt = (exp) => `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`;

test('Octopus client: token, account (plain token) and telemetry (JWT prefix)', async () => {
  const s = loadSettings(memStore());
  Object.assign(s.octopus, { account: 'A-1', apiKey: 'sk_x', discovered: { deviceId: 'dev-1' } });
  fakeFetch((url, opts) => {
    const q = JSON.parse(opts.body || '{}').query || '';
    if (q.includes('obtainKrakenToken')) return { body: { data: { obtainKrakenToken: { token: jwt(Date.now() / 1000 + 3600), refreshToken: 'r', refreshExpiresIn: 1 } } } };
    if (q.includes('smartMeterTelemetry')) return { body: { data: { smartMeterTelemetry: [{ readAt: '2026-09-25T09:30:00Z', consumptionDelta: 100, demand: 512 }] } } };
    return { body: { data: account([{ validFrom: null, validTo: null, tariff: { tariffCode: 'E-1R-AGILE-24-10-01-C' } }]) } };
  });
  const o = new Octopus(s);
  const d = await o.discover();
  assert.equal(d.tariff, 'E-1R-AGILE-24-10-01-C');
  assert.match(calls[0].opts.body, /APIKey: \\"sk_x\\"/);
  assert.equal(calls[1].opts.headers.Authorization.startsWith('JWT '), false);
  const tele = await o.telemetryToday(Date.parse('2026-09-25T09:40:00Z'));
  assert.equal(tele.demandW, 512);
  assert.ok(calls[2].opts.headers.Authorization.startsWith('JWT '));
  assert.match(calls[2].opts.body, /grouping: HALF_HOURLY start: \\"2026-09-24T23:00:00.000Z\\"/);
  assert.equal(calls.filter((c) => /obtainKrakenToken/.test(c.opts.body)).length, 1, 'token reused');
});

test('Octopus client: rate limit becomes HttpError 429', async () => {
  const s = loadSettings(memStore());
  Object.assign(s.octopus, { account: 'A-1', apiKey: 'sk_x', discovered: { deviceId: 'd' } });
  fakeFetch((url, opts) => {
    const q = JSON.parse(opts.body || '{}').query || '';
    if (q.includes('obtainKrakenToken')) return { body: { data: { obtainKrakenToken: { token: jwt(Date.now() / 1000 + 3600) } } } };
    return { body: { errors: [{ message: 'Too many requests.', extensions: { errorCode: 'KT-CT-1199' } }] } };
  });
  await assert.rejects(new Octopus(s).telemetryToday(), (e) => e instanceof HttpError && e.status === 429);
});

test('Octopus client: public rates URL, paging, and no key needed', async () => {
  const s = loadSettings(memStore());
  s.octopus.tariff = 'E-1R-AGILE-24-10-01-C';
  let page = 0;
  fakeFetch((url) => {
    page++;
    const results = page === 1
      ? [{ value_inc_vat: 20, valid_from: '2026-09-25T09:30:00Z', valid_to: '2026-09-25T10:00:00Z' }]
      : [{ value_inc_vat: 10, valid_from: '2026-09-25T09:00:00Z', valid_to: '2026-09-25T09:30:00Z' }];
    return { body: { results, next: page === 1 ? 'https://api.octopus.energy/next' : null } };
  });
  const rates = await new Octopus(s).rates(Date.parse('2026-09-25T09:40:00Z'));
  assert.deepEqual(rates.map((r) => r.p), [10, 20]);
  assert.match(calls[0].url, /\/v1\/products\/AGILE-24-10-01\/electricity-tariffs\/E-1R-AGILE-24-10-01-C\/standard-unit-rates\/\?period_from=2026-09-23T23:00:00.000Z&period_to=2026-09-26T23:00:00.000Z/);
  assert.equal(calls[0].opts.headers, undefined, 'no auth header on the public endpoint');
});

test('Octopus client: optional proxy replaces the Octopus address everywhere, including paging links', async () => {
  const s = loadSettings(memStore());
  Object.assign(s.octopus, { tariff: 'E-1R-AGILE-24-10-01-C', proxy: 'https://octo.me.workers.dev/', account: 'A-1', apiKey: 'k', discovered: { deviceId: 'd' } });
  let page = 0;
  fakeFetch((url, opts) => {
    if (url.endsWith('/v1/graphql/')) return { body: { data: { obtainKrakenToken: { token: jwt(Date.now() / 1000 + 3600) }, smartMeterTelemetry: [] } } };
    page++;
    return { body: { results: [], next: page === 1 ? 'https://api.octopus.energy/v1/products/X/?page=2' : null } };
  });
  const o = new Octopus(s);
  await o.rates(Date.parse('2026-09-25T09:40:00Z'));
  await o.telemetryToday();
  assert.deepEqual(calls.map((c) => new URL(c.url).origin), Array(4).fill('https://octo.me.workers.dev'));
  assert.equal(calls[1].url, 'https://octo.me.workers.dev/v1/products/X/?page=2');
  s.octopus.proxy = 'http://insecure.example';
  assert.throws(() => o.base, /must look like https/, 'never sends keys to a non-https proxy');
  s.octopus.proxy = '';
  assert.equal(o.base, 'https://api.octopus.energy');
});

test('Octopus client: a rate limit while getting a token also counts as a rate limit', async () => {
  const s = loadSettings(memStore());
  Object.assign(s.octopus, { account: 'A-1', apiKey: 'sk_x', discovered: { deviceId: 'd' } });
  fakeFetch(() => ({ body: { errors: [{ message: 'Too many requests.', extensions: { errorCode: 'KT-CT-1199' } }] } }));
  await assert.rejects(new Octopus(s).telemetryToday(), (e) => e instanceof HttpError && e.status === 429);
  assert.equal(calls.length, 1, 'no immediate second attempt');
});
