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

export function telemetry(now, dayStart) {
  const rows = [];
  for (let t = dayStart; t <= now; t += 1800e3) {
    rows.push({ readAt: new Date(t).toISOString(), consumption: 1000, consumptionDelta: 180 + ((t / 1800e3) % 5) * 60, demand: 520 + ((t / 1800e3) % 7) * 40, export: 0 });
  }
  return rows;
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
    google: { clientId: 'cid.apps.googleusercontent.com', clientSecret: 'secret', projectId: 'proj-123', refreshToken: 'rt-123', scopes: 'https://www.googleapis.com/auth/sdm.service https://www.googleapis.com/auth/calendar.readonly', calendars: [{ id: 'family@group.calendar.google.com', name: 'Family', color: '#4f9cff' }], cameraId: CAMERA_ID, thermostatId: THERMO_ID },
    weather: { lat: 51.5, lon: -0.12, place: 'Westminster' },
    kia: { url: KIA_URL, key: KIA_KEY },
    panel: { cameraName: 'Front door', cameraBattery: true, launcher: 'auto' },
  };
}

/**
 * Install fake network for a Playwright page. Returns a log of calls, and `fail` to make a
 * service return errors (e.g. fail.add('octopus')).
 */
export async function installMocks(page, { now, dayStart, fail = new Set(), kiaReading, xss = false } = {}) {
  const calls = [];
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  const kiaPayload = await encryptReading(kiaReading || { battery: 78, range: 182, charging: false, plugged: false, updated: now - 2 * 3600e3 }, KIA_KEY);

  await page.route(/^https:\/\/api\.octopus\.energy\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    calls.push({ service: 'octopus', url: req.url(), headers: req.headers(), body: req.postData() });
    if (fail.has('octopus')) return json(route, { detail: 'Service unavailable' }, 503);
    if (url.pathname === '/v1/graphql/') {
      const q = JSON.parse(req.postData() || '{}').query || '';
      if (q.includes('obtainKrakenToken')) {
        const exp = Math.floor(now / 1000) + 3600;
        const token = `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`;
        return json(route, { data: { obtainKrakenToken: { token, refreshToken: 'krt', refreshExpiresIn: exp + 86400 } } });
      }
      if (q.includes('smartMeterTelemetry')) return json(route, { data: { smartMeterTelemetry: telemetry(now, dayStart) } });
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
      return json(route, { count: 0, next: null, previous: null, results: rateResults(from, to) });
    }
    if (url.pathname.includes('/standing-charges/')) return json(route, { results: [{ value_exc_vat: 45.6, value_inc_vat: 47.88, valid_from: '2025-04-01T00:00:00Z', valid_to: null }] });
    return json(route, { detail: 'Not found' }, 404);
  });

  await page.route(/^https:\/\/(oauth2\.googleapis\.com\/token|www\.googleapis\.com\/oauth2\/v4\/token)/, async (route) => {
    const body = new URLSearchParams(route.request().postData() || '');
    calls.push({ service: 'google-token', url: route.request().url(), grant: body.get('grant_type'), body: Object.fromEntries(body) });
    if (fail.has('google')) return json(route, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400);
    if (body.get('grant_type') === 'authorization_code') return json(route, { access_token: 'at-new', refresh_token: 'rt-new', expires_in: 3599, scope: 'https://www.googleapis.com/auth/sdm.service https://www.googleapis.com/auth/calendar.readonly', token_type: 'Bearer' });
    return json(route, { access_token: 'at-refreshed', expires_in: 3599, token_type: 'Bearer' });
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
  // Google's sign-in page: pretend the user approved and bounce back with a code.
  await page.route(/^https:\/\/(nestservices\.google\.com|accounts\.google\.com)\//, (route) => {
    const u = new URL(route.request().url());
    calls.push({ service: 'google-auth', url: route.request().url() });
    const back = `${u.searchParams.get('redirect_uri')}?code=auth-code-1&state=${encodeURIComponent(u.searchParams.get('state'))}&scope=x`;
    return route.fulfill({ status: 302, headers: { location: back } });
  });
  return calls;
}
