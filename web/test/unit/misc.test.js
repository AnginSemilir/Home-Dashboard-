import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvent, groupDays, dateToMs, fetchEvents } from '../../js/calendar.js';
import { describe, lookupPlace } from '../../js/weather.js';
import { encryptReading, decryptReading, newKey } from '../../js/kia.js';
import { detectEnv, actionFor, appLink, launchIntent, APPS } from '../../js/launcher.js';
import { renderChart } from '../../js/chart.js';
import { loadSettings, saveSettings, importSettings, exportSettings, DEFAULTS } from '../../js/config.js';

const iso = (s) => Date.parse(s);
const cal = { id: 'fam', name: 'Family', color: '#123456' };

test('calendar: all-day, timed, declined and cancelled events', () => {
  assert.equal(new Date(dateToMs('2026-09-25')).toISOString(), '2026-09-24T23:00:00.000Z');
  const allDay = normalizeEvent({ id: 'a', summary: 'Bin day', start: { date: '2026-09-25' }, end: { date: '2026-09-26' } }, cal);
  assert.equal(allDay.allDay, true);
  assert.equal(allDay.end - allDay.start, 864e5);
  assert.equal(allDay.color, '#123456');
  assert.equal(normalizeEvent({ id: 'x', status: 'cancelled', start: { dateTime: '2026-09-25T10:00:00Z' } }), null);
  assert.equal(normalizeEvent({ id: 'd', start: { dateTime: '2026-09-25T10:00:00Z' }, end: { dateTime: '2026-09-25T11:00:00Z' }, attendees: [{ self: true, responseStatus: 'declined' }] }), null);
  assert.equal(normalizeEvent({ id: 'n', start: { dateTime: '2026-09-25T10:00:00Z' } }).title, '(no title)');
});

test('calendar: today hides finished events; all-day first; multi-day on both days', () => {
  const now = iso('2026-09-25T12:00:00+01:00');
  const ev = (id, s, e, extra = {}) => normalizeEvent({ id, summary: id, start: { dateTime: s }, end: { dateTime: e }, ...extra }, cal);
  const events = [
    ev('done', '2026-09-25T08:00:00+01:00', '2026-09-25T09:00:00+01:00'),
    ev('now', '2026-09-25T11:30:00+01:00', '2026-09-25T12:30:00+01:00'),
    ev('later', '2026-09-25T18:00:00+01:00', '2026-09-25T19:00:00+01:00'),
    normalizeEvent({ id: 'hol', summary: 'Holiday', start: { date: '2026-09-25' }, end: { date: '2026-09-28' } }, cal),
    ev('tomorrow', '2026-09-26T09:00:00+01:00', '2026-09-26T10:00:00+01:00'),
  ];
  const [today, tomorrow] = groupDays(events, now);
  assert.deepEqual(today.events.map((e) => e.title), ['Holiday', 'now', 'later']);
  assert.deepEqual(tomorrow.events.map((e) => e.title), ['Holiday', 'tomorrow']);
  assert.equal(today.label, 'Today');
  assert.equal(tomorrow.label, 'Tomorrow');
});

test('calendar: the same event on two chosen calendars shows once', () => {
  const now = iso('2026-09-25T09:00:00+01:00');
  const raw = { id: 'evt123', iCalUID: 'abc@google.com', summary: 'Parents evening', start: { dateTime: '2026-09-25T18:00:00+01:00' }, end: { dateTime: '2026-09-25T19:00:00+01:00' } };
  const events = [normalizeEvent(raw, { id: 'family' }), normalizeEvent(raw, { id: 'me' })];
  assert.deepEqual(groupDays(events, now)[0].events.map((e) => e.title), ['Parents evening']);
});

test('calendar: one failing calendar still shows the others and names the failure; all failing throws', async () => {
  const google = { api: async (url) => { if (url.includes('school')) throw new Error('404 Not Found'); return { items: [] }; } };
  const now = iso('2026-09-25T09:00:00+01:00');
  const r = await fetchEvents(google, [{ id: 'me', name: 'Me' }, { id: 'school', name: 'School' }], now);
  assert.deepEqual(r.events, []);
  assert.deepEqual(r.failed.map((f) => f.name), ['School']);
  await assert.rejects(fetchEvents(google, [{ id: 'school', name: 'School' }], now), /404/);
});

test('weather: WMO codes', () => {
  assert.equal(describe(0, true).icon, 'sun');
  assert.equal(describe(0, false).icon, 'moon');
  assert.equal(describe(63).label, 'Rain');
  assert.equal(describe(81).label, 'Showers');
  assert.equal(describe(95).icon, 'storm');
  assert.equal(describe(73).icon, 'snow');
});

test('weather: postcode goes to postcodes.io, towns to Open-Meteo geocoding', async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    const body = url.includes('postcodes.io') ? { result: { latitude: 51.5, longitude: -0.14, admin_district: 'Westminster' } } : { results: [{ name: 'Leeds', latitude: 53.8, longitude: -1.55 }] };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  assert.equal((await lookupPlace('sw1a 1aa')).place, 'Westminster');
  assert.equal((await lookupPlace('Leeds')).lat, 53.8);
  assert.match(urls[0], /api\.postcodes\.io\/postcodes\/sw1a%201aa/);
  assert.match(urls[1], /geocoding-api\.open-meteo\.com/);
  await assert.rejects(lookupPlace('  '), /Enter a postcode/);
});

test('kia: encrypt/decrypt round trip; wrong key explains itself', async () => {
  const key = newKey();
  const payload = await encryptReading({ battery: 78 }, key);
  assert.deepEqual(Object.keys(payload).sort(), ['data', 'iv', 'v']);
  const other = await encryptReading({ battery: 5, range: 12, charging: true, plugged: true, updated: 1790322000000 }, key);
  assert.equal(payload.data.length, other.data.length, 'same size whatever the reading');
  assert.deepEqual(await decryptReading(payload, key), { battery: 78 });
  await assert.rejects(decryptReading(payload, newKey()), /key does not match/);
  await assert.rejects(decryptReading({ v: 2 }, key), /format/);
});

test('launcher: environment detection', () => {
  const ua = (u) => ({ navigator: { userAgent: u } });
  assert.equal(detectEnv(ua('Mozilla/5.0 (Linux; Android 12; TB328FU Build/SP1A; wv) AppleWebKit/537.36 Chrome/139 Safari/537.36')), 'webview');
  assert.equal(detectEnv(ua('Mozilla/5.0 (Linux; Android 12; TB328FU) AppleWebKit/537.36 Chrome/139 Safari/537.36')), 'chrome');
  assert.equal(detectEnv(ua('Mozilla/5.0 (X11; Linux x86_64) Chrome/139')), 'desktop');
  assert.equal(detectEnv({ fully: { startApplication() {} }, navigator: { userAgent: '' } }), 'fully');
});

test('launcher: what each button does in each environment', () => {
  assert.deepEqual(actionFor('home', 'webview'), { kind: 'navigate', value: APPS.home.special });
  assert.deepEqual(actionFor('claude', 'webview'), { kind: 'navigate', value: APPS.claude.special });
  assert.deepEqual(actionFor('claude', 'webview', { hold: true }), { kind: 'navigate', value: launchIntent('com.anthropic.claude') });
  assert.deepEqual(actionFor('spotify', 'fully'), { kind: 'fully-app', value: 'com.spotify.music' });
  assert.deepEqual(actionFor('gemini', 'fully'), { kind: 'fully-intent', value: APPS.gemini.special });
  assert.equal(actionFor('home', 'chrome').kind, 'message');
  assert.deepEqual(actionFor('claude', 'chrome'), { kind: 'navigate', value: 'intent://claude.ai/new#Intent;scheme=https;package=com.anthropic.claude;end' });
  assert.deepEqual(actionFor('car', 'webview', { pkg: 'com.kia.oneapp.eu' }), { kind: 'navigate', value: launchIntent('com.kia.oneapp.eu') });
  assert.equal(actionFor('shopping', 'desktop').kind, 'message');
  assert.equal(appLink('https://keep.google.com/', 'com.google.android.keep'), 'intent://keep.google.com/#Intent;scheme=https;package=com.google.android.keep;end');
  assert.match(APPS.home.special, /category=android\.intent\.category\.HOME/);
});

test('chart: bars, now marker, tomorrow note, empty state, no NaN', () => {
  const now = iso('2026-09-25T09:41:00+01:00');
  const dayStart = iso('2026-09-24T23:00:00Z');
  const rates = [...Array(48)].map((_, i) => ({ start: dayStart + i * 1800e3, end: dayStart + (i + 1) * 1800e3, p: i === 30 ? -2 : 10 + (i % 20) }));
  const out = renderChart({ rates, now, width: 530, height: 400 });
  assert.equal((out.match(/class="ch-bar/g) || []).length, 31); // 08:30 (an hour before the 09:30 slot) to midnight
  assert.match(out, /class="ch-now"/);
  assert.match(out, /~4pm/);
  assert.match(out, /#3d9bff" class="ch-bar band-plunge/, 'plunge price is blue (and themeable via CSS)');
  assert.doesNotMatch(out, /NaN/);
  assert.match(renderChart({ rates: [], now, width: 300, height: 200 }), /No prices yet/);
});

test('config: defaults, merge, import/export', () => {
  const store = (() => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; })();
  const s = loadSettings(store);
  assert.equal(s.panel.cheap, DEFAULTS.panel.cheap);
  s.octopus.apiKey = 'k';
  saveSettings(s, store);
  assert.equal(loadSettings(store).octopus.apiKey, 'k');
  const imported = importSettings(exportSettings({ panel: { cheap: 12 }, unknownKey: 1 }));
  assert.equal(imported.panel.cheap, 12);
  assert.equal(imported.panel.pricey, DEFAULTS.panel.pricey);
  assert.equal('unknownKey' in imported, false);
  assert.throws(() => importSettings('{"hello":1}'), /doesn't look like/);
});
