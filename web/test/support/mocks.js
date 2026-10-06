// Fake versions of every outside service, for browser tests and screenshots.
// Prices, telemetry, weather and events are generated around the given "now".

import { encryptReading } from '../../js/kia.js';

export const ACCOUNT = 'A-1234ABCD';
export const TARIFF = 'E-1R-AGILE-24-10-01-C';
export const CAMERA_ID = 'enterprises/proj-123/devices/CAM1';
export const THERMO_ID = 'enterprises/proj-123/devices/THERMO1';
export const KIA_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8='; // 32 bytes, test only
export const KIA_URL = 'https://raw.githubusercontent.com/example/panel/kia-data/kia.json';

/** A realistic Agile day: cheap overnight, solar dip at lunch, 4–7pm peak. Pence inc VAT. */
export function agilePrice(ms) {
  const d = new Date(ms);
  const hr = (d.getUTCHours() + 1) % 24 + d.getUTCMinutes() / 60; // BST-ish local hour for shape only
  let p = 17 + 5 * Math.sin(((hr - 9) / 24) * 2 * Math.PI);
  if (hr >= 2 && hr < 5.5) p -= 10;
  if (hr >= 12 && hr < 14.5) p -= 8;
  if (hr >= 16 && hr < 19) p += 14;
  if (hr >= 3 && hr < 4) p = -1.2; // a plunge slot
  return Math.round(p * 100) / 100;
}

/** Octopus REST results (newest first, like the real API), from `from` to `to`, 30-min slots. */
export function rateResults(from, to) {
  const out = [];
  for (let t = from; t < to; t += 1800e3) {
    out.push({ value_exc_vat: +(agilePrice(t) / 1.05).toFixed(4), value_inc_vat: agilePrice(t), valid_from: new Date(t).toISOString().replace('.000', ''), valid_to: new Date(t + 1800e3).toISOString().replace('.000', ''), payment_method: null });
  }
  return out.reverse();
}

/** kWh used in the half hour starting at `t` (the Home Mini and the smart meter agree). */
export const usedKwh = (t) => (180 + (Math.floor(t / 1800e3) % 5) * 60) / 1000;

export function telemetry(now, dayStart, stopsAt = Infinity, end = Infinity) {
  const rows = [];
  for (let t = dayStart; t <= Math.min(now, stopsAt) && t < end; t += 1800e3) {
    rows.push({ readAt: new Date(t).toISOString(), consumption: 1000, consumptionDelta: usedKwh(t) * 1000, demand: 520 + ((t / 1800e3) % 7) * 40, export: 0 });
  }
  return rows;
}

/** Smart meter readings (REST), oldest first: every half hour until `until` (readings arrive late). */
export function consumptionResults(from, to, until) {
  const out = [];
  for (let t = from; t < Math.min(to, until); t += 1800e3) {
    out.push({ consumption: usedKwh(t), interval_start: new Date(t).toISOString().replace('.000Z', 'Z'), interval_end: new Date(t + 1800e3).toISOString().replace('.000Z', 'Z') });
  }
  return out;
}

export function weather(now) {
  const days = [...Array(5)].map((_, i) => new Date(now + i * 864e5).toISOString().slice(0, 10));
  return {
    current: { temperature_2m: 14.2, apparent_temperature: 12.6, weather_code: 2, is_day: 1, wind_speed_10m: 9, relative_humidity_2m: 71, precipitation: 0 },
    daily: {
      time: days,
      weather_code: [2, 61, 3, 0, 80],
      temperature_2m_max: [17.4, 15.1, 16.3, 19.2, 18.0],
      temperature_2m_min: [9.1, 10.4, 8.2, 9.3, 11.0],
      precipitation_probability_max: [10, 80, 20, 0, 60],
      sunrise: days.map((d) => `${d}T06:53`),
      sunset: days.map((d) => `${d}T18:55`),
    },
  };
}

export function calendarEvents(dayStart, { xss = false } = {}) {
  const at = (hours) => new Date(dayStart + hours * 3600e3).toISOString();
  const date = (offset) => new Date(dayStart + offset * 864e5 + 12 * 3600e3).toISOString().slice(0, 10);
  return {
    family: [
      { id: 'bin', summary: 'Bin day – recycling', start: { date: date(0) }, end: { date: date(1) } },
      { id: 'school', summary: 'School run', start: { dateTime: at(8.25) }, end: { dateTime: at(8.75) } },
      { id: 'dentist', summary: 'Dentist – Sam', location: 'High St Dental', start: { dateTime: at(11.5) }, end: { dateTime: at(12.5) } },
      { id: 'swim', summary: 'Swimming lessons', start: { dateTime: at(16.75) }, end: { dateTime: at(17.75) } },
      { id: 'dinner', summary: 'Dinner with Alex & Jo', location: 'The Crown', start: { dateTime: at(19.5) }, end: { dateTime: at(22) } },
      { id: 'parkrun', summary: 'Parkrun', start: { dateTime: at(24 + 9) }, end: { dateTime: at(24 + 10) } },
      { id: 'boiler', summary: xss ? '<img src=x onerror="window.__xss=1">Boiler service' : 'Boiler service', start: { dateTime: at(24 + 13) }, end: { dateTime: at(24 + 14) } },
    ],
  };
}

export function thermostat() {
  return {
    name: THERMO_ID, type: 'sdm.devices.types.THERMOSTAT',
    traits: {
      'sdm.devices.traits.Info': { customName: '' },
      'sdm.devices.traits.Temperature': { ambientTemperatureCelsius: 20.54 },
      'sdm.devices.traits.Humidity': { ambientHumidityPercent: 48 },
      'sdm.devices.traits.ThermostatMode': { mode: 'HEAT' },
      'sdm.devices.traits.ThermostatEco': { mode: 'OFF', heatCelsius: 16 },
      'sdm.devices.traits.ThermostatHvac': { status: 'HEATING' },
      'sdm.devices.traits.ThermostatTemperatureSetpoint': { heatCelsius: 21 },
    },
    parentRelations: [{ parent: 'enterprises/proj-123/structures/S/rooms/R', displayName: 'Hallway' }],
  };
}

export function camera() {
  return {
    name: CAMERA_ID, type: 'sdm.devices.types.CAMERA',
    traits: {
      'sdm.devices.traits.Info': { customName: 'Front door' },
      'sdm.devices.traits.CameraLiveStream': { supportedProtocols: ['WEB_RTC'], videoCodecs: ['H264'], audioCodecs: ['OPUS'] },
    },
  };
}

/** Settings as they'd look after a complete setup. */
export function fullSettings(now) {
  return {
    octopus: { account: ACCOUNT, apiKey: 'sk_test_key', pollSeconds: 60, discovered: { tariff: TARIFF, product: 'AGILE-24-10-01', mpan: '1900026354329', serial: '22L4132637', deviceId: '00-11-22-33-44-55-66-77', at: now } },
    google: { clientId: 'cid.apps.googleusercontent.com', clientSecret: 'secret', projectId: 'proj-123', refreshToken: 'rt-123', scopes: 'https://www.googleapis.com/auth/sdm.service https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks', calendars: [{ id: 'family@group.calendar.google.com', name: 'Family', color: '#4f9cff' }], shoppingList: { id: 'shop', name: 'Shopping' }, cameraId: CAMERA_ID, thermostatId: THERMO_ID },
    weather: { lat: 51.5, lon: -0.12, place: 'Westminster' },
    kia: { url: KIA_URL, key: KIA_KEY },
    spotify: { clientId: 'sp-client' }, // connected only when a test also seeds the sign-in (openPanel spotify: true)
    panel: { cameraName: 'Front door', cameraBattery: true, launcher: 'auto' },
  };
}

/**
 * Install fake network for a Playwright page. Returns a log of calls, and `fail` to make a
 * service return errors (e.g. fail.add('octopus')).
 */
export async function installMocks(page, { now, dayStart, fail = new Set(), kiaReading, xss = false, homeMiniStopsAt, readingsUntil } = {}) {
  const calls = [];
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  const kiaPayload = await encryptReading(kiaReading || { battery: 78, range: 182, charging: false, plugged: false, updated: now - 2 * 3600e3 }, KIA_KEY);

  await page.route(/^https:\/\/api\.octopus\.energy\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    calls.push({ service: 'octopus', url: req.url(), headers: req.headers(), body: req.postData() });
    if (fail.has('octopus')) return json(route, { detail: 'Service unavailable' }, 503);
    if (url.pathname === '/v1/graphql/' && fail.has('graphql')) return json(route, { errors: [{ message: 'Invalid API key.', extensions: { errorCode: 'KT-CT-1138' } }] });
    if (url.pathname.includes('/standard-unit-rates/') && fail.has('rates')) return json(route, { detail: 'Service unavailable' }, 503);
    // Only the long lookups (the price averages ask for 1500 a page): the panel's own prices still work.
    if (url.pathname.includes('/standard-unit-rates/') && fail.has('rate-history') && url.searchParams.get('page_size') === '1500') return json(route, { detail: 'Service unavailable' }, 503);
    if (url.pathname === '/v1/graphql/') {
      const q = JSON.parse(req.postData() || '{}').query || '';
      if (q.includes('obtainKrakenToken')) {
        const exp = Math.floor(now / 1000) + 3600;
        const token = `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`;
        return json(route, { data: { obtainKrakenToken: { token, refreshToken: 'krt', refreshExpiresIn: exp + 86400 } } });
      }
      if (q.includes('smartMeterTelemetry')) {
        // Any range, like the real service (the panel asks for today; the averages for past days).
        const from = Date.parse(/start: "([^"]+)"/.exec(q)?.[1]), to = Date.parse(/end: "([^"]+)"/.exec(q)?.[1]);
        return json(route, { data: { smartMeterTelemetry: telemetry(now, Number.isFinite(from) ? from : dayStart, homeMiniStopsAt, Number.isFinite(to) ? to : Infinity) } });
      }
      if (q.includes('electricityAgreements')) {
        return json(route, { data: { account: { electricityAgreements: [{ meterPoint: { mpan: '1900026354329', direction: 'IMPORT', meters: [{ serialNumber: '22L4132637', smartImportElectricityMeter: { deviceId: '00-11-22-33-44-55-66-77' } }], agreements: [{ validFrom: '2025-01-01T00:00:00+00:00', validTo: null, tariff: { productCode: 'AGILE-24-10-01', tariffCode: TARIFF } }] } }] } } });
      }
      return json(route, { errors: [{ message: 'unknown query' }] });
    }
    if (url.pathname.includes('/standard-unit-rates/')) {
      const from = Date.parse(url.searchParams.get('period_from'));
      let to = Date.parse(url.searchParams.get('period_to'));
      // Like the real service: tomorrow's prices only exist after 4pm UK time.
      const publishedUntil = now >= dayStart + 16 * 3600e3 ? dayStart + 2 * 864e5 : dayStart + 864e5;
      to = Math.min(to, publishedUntil);
      // Pages, newest first, like the real service.
      const all = rateResults(from, to);
      const size = Math.min(1500, Number(url.searchParams.get('page_size')) || 100);
      const page = Number(url.searchParams.get('page')) || 1;
      const next = page * size < all.length ? new URL(url) : null;
      next?.searchParams.set('page', String(page + 1));
      return json(route, { count: all.length, next: next ? next.toString() : null, previous: null, results: all.slice((page - 1) * size, page * size) });
    }
    if (/^\/v1\/electricity-meter-points\/[^/]+\/meters\/[^/]+\/consumption\/$/.test(url.pathname)) {
      if (req.headers().authorization !== `Basic ${Buffer.from('sk_test_key:').toString('base64')}`) return json(route, { detail: 'Authentication credentials were not provided.' }, 401);
      if (fail.has('usage')) return json(route, { detail: 'Service unavailable' }, 503);
      // By default the meter's readings are in up to midnight (yesterday complete).
      const results = consumptionResults(Date.parse(url.searchParams.get('period_from')), Date.parse(url.searchParams.get('period_to')), readingsUntil ?? dayStart);
      return json(route, { count: results.length, next: null, previous: null, results });
    }
    if (url.pathname.includes('/standing-charges/')) return json(route, { results: [{ value_exc_vat: 45.6, value_inc_vat: 47.88, valid_from: '2025-04-01T00:00:00Z', valid_to: null }] });
    return json(route, { detail: 'Not found' }, 404);
  });

  await page.route(/^https:\/\/(oauth2\.googleapis\.com\/token|www\.googleapis\.com\/oauth2\/v4\/token)/, async (route) => {
    const body = new URLSearchParams(route.request().postData() || '');
    calls.push({ service: 'google-token', url: route.request().url(), grant: body.get('grant_type'), body: Object.fromEntries(body) });
    if (fail.has('google')) return json(route, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400);
    if (body.get('grant_type') === 'authorization_code') return json(route, { access_token: 'at-new', refresh_token: 'rt-new', expires_in: 3599, scope: 'https://www.googleapis.com/auth/sdm.service https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks', token_type: 'Bearer' });
    return json(route, { access_token: 'at-refreshed', expires_in: 3599, token_type: 'Bearer' });
  });

  await page.route(/^https:\/\/oauth2\.googleapis\.com\/revoke/, (route) => {
    calls.push({ service: 'google-revoke', body: Object.fromEntries(new URLSearchParams(route.request().postData() || '')) });
    return json(route, {});
  });
  await page.route(/^https:\/\/smartdevicemanagement\.googleapis\.com\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    calls.push({ service: 'nest', url: req.url(), method: req.method(), body: req.postData(), auth: req.headers().authorization });
    if (fail.has('nest')) return json(route, { error: { message: 'Nest unavailable' } }, 503);
    if (url.pathname.endsWith(':executeCommand')) {
      const cmd = JSON.parse(req.postData());
      if (cmd.command.endsWith('GenerateWebRtcStream')) return json(route, { results: { answerSdp: 'v=0\r\nfake-answer', expiresAt: new Date(now + 5 * 60e3).toISOString(), mediaSessionId: 'session-1' } });
      return json(route, { results: {} });
    }
    if (url.pathname.endsWith('/devices')) return json(route, { devices: [camera(), thermostat()] });
    if (url.pathname.endsWith('THERMO1')) return json(route, thermostat());
    if (url.pathname.endsWith('CAM1')) return json(route, camera());
    return json(route, { error: { message: 'not found' } }, 404);
  });

  // Google Tasks: the shopping list.
  const shopping = [
    { id: 't1', title: 'Milk', status: 'needsAction', position: '00000000000000000001' },
    { id: 't2', title: 'Bread', status: 'needsAction', position: '00000000000000000002' },
    { id: 't3', title: 'Bananas', status: 'needsAction', position: '00000000000000000003' },
    { id: 't4', title: 'Washing-up liquid', status: 'needsAction', position: '00000000000000000004' },
  ];
  await page.route(/^https:\/\/www\.googleapis\.com\/tasks\/v1\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    calls.push({ service: 'tasks', method: req.method(), url: req.url(), body });
    if (fail.has('tasks')) return json(route, { error: { code: 403, message: 'Request had insufficient authentication scopes.', status: 'PERMISSION_DENIED', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', metadata: { service: 'tasks.googleapis.com' } }] } }, 403);
    if (fail.has('tasks-off')) {
      return json(route, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Google Tasks API has not been used in project 123 before or it is disabled.', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED', metadata: { service: 'tasks.googleapis.com', serviceTitle: 'Google Tasks API', activationUrl: 'https://console.developers.google.com/apis/api/tasks.googleapis.com/overview?project=123' } }] } }, 403);
    }
    if (url.pathname.endsWith('/users/@me/lists')) {
      if (req.method() === 'POST') return json(route, { id: 'shop', title: body.title });
      return json(route, { items: [{ id: 'mine', title: 'My Tasks' }, { id: 'shop', title: 'Shopping' }] });
    }
    const m = /\/lists\/([^/]+)\/tasks(?:\/([^/?]+))?/.exec(url.pathname);
    if (m && req.method() === 'GET') return json(route, { items: shopping.filter((t) => t.status !== 'completed') });
    if (m && req.method() === 'POST') { const t = { id: `t${shopping.length + 1}`, title: body.title, status: 'needsAction', position: '0' }; shopping.unshift(t); return json(route, t); }
    if (m && req.method() === 'PATCH') { const t = shopping.find((x) => x.id === decodeURIComponent(m[2])); Object.assign(t, body); return json(route, t); }
    return json(route, { error: { message: 'not found' } }, 404);
  });

  await page.route(/^https:\/\/www\.googleapis\.com\/calendar\/v3\//, async (route) => {
    const url = new URL(route.request().url());
    calls.push({ service: 'calendar', url: route.request().url() });
    if (fail.has('calendar')) return json(route, { error: { message: 'Calendar unavailable' } }, 500);
    if (url.pathname.endsWith('/calendarList')) return json(route, { items: [{ id: 'family@group.calendar.google.com', summary: 'Family', backgroundColor: '#4f9cff' }, { id: 'me@gmail.com', summary: 'me@gmail.com', primary: true, backgroundColor: '#ff7f50' }] });
    return json(route, { items: calendarEvents(dayStart, { xss }).family });
  });

  await page.route(/^https:\/\/api\.open-meteo\.com\//, (route) => {
    calls.push({ service: 'weather', url: route.request().url() });
    return fail.has('weather') ? json(route, { reason: 'down' }, 500) : json(route, weather(now));
  });
  await page.route(/^https:\/\/api\.postcodes\.io\//, (route) => json(route, { status: 200, result: { postcode: 'SW1A 1AA', latitude: 51.501, longitude: -0.1416, admin_district: 'Westminster' } }));
  await page.route(/^https:\/\/geocoding-api\.open-meteo\.com\//, (route) => json(route, { results: [{ name: 'Leeds', latitude: 53.8, longitude: -1.55 }] }));
  await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => {
    calls.push({ service: 'kia', url: route.request().url() });
    return fail.has('kia') ? json(route, {}, 404) : json(route, kiaPayload);
  });
  // Spotify: sign-in (PKCE), tokens that rotate, and a player on a kitchen speaker.
  const track = (name, artist) => ({ name, duration_ms: 185000, artists: [{ name: artist }], album: { images: [{ url: 'https://i.scdn.co/image/big', width: 640 }, { url: 'https://i.scdn.co/image/mid', width: 300 }, { url: 'https://i.scdn.co/image/small', width: 64 }] } });
  const sp = {
    playing: true, item: track('Here Comes the Sun', 'The Beatles'), progress: 61000, active: 'kitchen', volume: 40,
    devices: [
      { id: 'kitchen', name: 'Kitchen speaker', type: 'Speaker', supports_volume: true },
      { id: 'tablet', name: 'Lenovo TB328FU', type: 'Tablet', supports_volume: false },
    ],
  };
  let spTokens = 0;
  await page.route(/^https:\/\/accounts\.spotify\.com\/authorize/, (route) => {
    const u = new URL(route.request().url());
    calls.push({ service: 'spotify-auth', url: route.request().url() });
    const back = `${u.searchParams.get('redirect_uri')}?code=sp-code&state=${encodeURIComponent(u.searchParams.get('state'))}`;
    return route.fulfill({ status: 302, headers: { location: back } });
  });
  await page.route(/^https:\/\/accounts\.spotify\.com\/api\/token/, (route) => {
    const body = new URLSearchParams(route.request().postData() || '');
    calls.push({ service: 'spotify-token', grant: body.get('grant_type'), body: Object.fromEntries(body) });
    if (fail.has('spotify-expired')) return json(route, { error: 'invalid_grant', error_description: 'Refresh token revoked' }, 400);
    spTokens++;
    return json(route, { access_token: `sp-at-${spTokens}`, token_type: 'Bearer', expires_in: 3600, refresh_token: `sp-rt-${spTokens}`, scope: 'user-read-playback-state user-modify-playback-state' });
  });
  await page.route(/^https:\/\/api\.spotify\.com\/v1\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname.replace('/v1', '');
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    calls.push({ service: 'spotify', method: req.method(), path: p, query: url.search, body, auth: req.headers().authorization });
    const done = () => route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    const dev = () => sp.devices.find((d) => d.id === sp.active);
    if (fail.has('spotify-idle') && !sp.active) {
      if (req.method() === 'GET' && p === '/me/player') return done();
      if (p.startsWith('/me/player/play')) return json(route, { error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } }, 404);
    }
    if (req.method() !== 'GET' && fail.has('spotify-premium')) return json(route, { error: { status: 403, message: 'Player command failed: Premium required', reason: 'PREMIUM_REQUIRED' } }, 403);
    if (req.method() === 'GET' && p === '/me/player') {
      const d = dev();
      return json(route, { is_playing: sp.playing, progress_ms: sp.progress, shuffle_state: false, currently_playing_type: 'track', item: sp.item, device: d && { id: d.id, name: d.name, type: d.type, is_active: true, is_restricted: false, supports_volume: d.supports_volume, volume_percent: d.supports_volume ? sp.volume : null } });
    }
    if (req.method() === 'GET' && p === '/me/player/devices') return json(route, { devices: sp.devices.map((d) => ({ ...d, is_active: d.id === sp.active, is_restricted: false, volume_percent: d.supports_volume ? sp.volume : null })) });
    if (p === '/me/player/pause') { sp.playing = false; return done(); }
    if (p === '/me/player/play') { sp.playing = true; return done(); }
    if (p === '/me/player/next') { sp.item = track('Something', 'The Beatles'); sp.progress = 0; return done(); }
    if (p === '/me/player/previous') { sp.progress = 0; return done(); }
    if (p === '/me/player/volume') { sp.volume = Number(url.searchParams.get('volume_percent')); return done(); }
    if (p === '/me/player' && req.method() === 'PUT') { sp.active = body.device_ids[0]; sp.playing = body.play !== false; if (!sp.item) sp.item = track('Here Comes the Sun', 'The Beatles'); return done(); }
    return json(route, { error: { status: 404, message: 'not found' } }, 404);
  });
  if (fail.has('spotify-idle')) { sp.active = null; sp.playing = false; sp.item = null; }
  await page.route(/^https:\/\/i\.scdn\.co\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') }));
  calls.spotify = sp;

  // Google Cloud Pub/Sub: the doorbell subscription. Tests push events into calls.pubsub.queue.
  calls.pubsub = { queue: [], pulls: 0, acks: [] };
  let ackN = 0;
  await page.route(/^https:\/\/pubsub\.googleapis\.com\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'POST' } });
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    if (fail.has('pubsub-404')) return json(route, { error: { code: 404, message: `Resource not found (resource=panel-doorbell).`, status: 'NOT_FOUND' } }, 404);
    if (fail.has('pubsub-disabled')) return json(route, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Cloud Pub/Sub API has not been used in project 555 before or it is disabled.', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED', metadata: { service: 'pubsub.googleapis.com', serviceTitle: 'Cloud Pub/Sub API', consumer: 'projects/555' } }] } }, 403);
    if (url.pathname.endsWith(':acknowledge')) { calls.pubsub.acks.push(...body.ackIds); return json(route, {}); }
    if (url.pathname.endsWith(':pull')) {
      calls.pubsub.pulls++;
      calls.pubsub.lastPull = { url: req.url(), body, auth: req.headers().authorization };
      if (!calls.pubsub.queue.length) await new Promise((r) => setTimeout(r, 250)); // Google holds an empty pull a while
      const got = calls.pubsub.queue.splice(0);
      return json(route, got.length ? { receivedMessages: got.map((ev) => ({ ackId: `ack-${++ackN}`, message: { data: Buffer.from(JSON.stringify(ev)).toString('base64'), messageId: String(ackN), publishTime: ev.timestamp } })) } : {});
    }
    return json(route, { error: { code: 404, message: 'not found' } }, 404);
  });

  // Google's sign-in page: pretend the user approved and bounce back with a code.
  await page.route(/^https:\/\/(nestservices\.google\.com|accounts\.google\.com)\//, (route) => {
    const u = new URL(route.request().url());
    calls.push({ service: 'google-auth', url: route.request().url() });
    const back = `${u.searchParams.get('redirect_uri')}?code=auth-code-1&state=${encodeURIComponent(u.searchParams.get('state'))}&scope=x`;
    return route.fulfill({ status: 302, headers: { location: back } });
  });
  return calls;
}
