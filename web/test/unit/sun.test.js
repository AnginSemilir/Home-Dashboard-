import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunTimes, sunToday, themeFor, locate } from '../../js/sun.js';
import { hhmm } from '../../js/time.js';

const iso = (s) => Date.parse(s);
const near = (ms, hm, mins = 3) => {
  const [h, m] = hm.split(':').map(Number);
  const got = hhmm(ms).split(':').map(Number);
  assert.ok(Math.abs((got[0] * 60 + got[1]) - (h * 60 + m)) <= mins, `${hhmm(ms)} vs ${hm}`);
};

test('sunTimes: London, published almanac times (UK local)', () => {
  const sep = sunTimes(iso('2026-09-25T12:00:00+01:00'), 51.5074, -0.1278);
  near(sep.rise, '06:53'); near(sep.set, '18:55');
  const jun = sunTimes(iso('2026-06-21T12:00:00+01:00'), 51.5074, -0.1278);
  near(jun.rise, '04:43'); near(jun.set, '21:21');
  const dec = sunTimes(iso('2026-12-21T12:00:00Z'), 51.5074, -0.1278);
  near(dec.rise, '08:04'); near(dec.set, '15:53');
});

test('sunTimes: no sunrise in polar night', () => {
  assert.equal(sunTimes(iso('2026-12-21T12:00:00Z'), 78.2, 15.6), null); // Svalbard
});

test('sunToday prefers Open-Meteo times for today, else calculates', () => {
  const now = iso('2026-09-25T09:41:00+01:00');
  const weather = { days: [{ date: '2026-09-25', sunrise: iso('2026-09-25T06:50:00+01:00'), sunset: iso('2026-09-25T18:58:00+01:00') }] };
  assert.deepEqual(sunToday(now, { weather }), { rise: weather.days[0].sunrise, set: weather.days[0].sunset });
  const calc = sunToday(now, { weather: { days: [] }, lat: 51.5, lon: -0.12 });
  near(calc.rise, '06:53');
  const stale = sunToday(now, { weather: { days: [{ date: '2026-09-20', sunrise: iso('2026-09-20T06:45:00+01:00'), sunset: iso('2026-09-20T19:07:00+01:00') }] } });
  near(stale.rise, '06:53', 4); // yesterday's forecast isn't used for today
});

test('themeFor: auto follows the sun; fixed modes ignore it', () => {
  const sun = { rise: iso('2026-09-25T06:53:00+01:00'), set: iso('2026-09-25T18:55:00+01:00') };
  assert.equal(themeFor('auto', iso('2026-09-25T06:52:00+01:00'), sun), 'dark');
  assert.equal(themeFor('auto', iso('2026-09-25T06:53:00+01:00'), sun), 'light');
  assert.equal(themeFor('auto', iso('2026-09-25T18:55:00+01:00'), sun), 'dark');
  assert.equal(themeFor('auto', iso('2026-09-25T12:00:00+01:00'), null), 'dark');
  assert.equal(themeFor('light', iso('2026-09-25T23:00:00+01:00'), sun), 'light');
  assert.equal(themeFor('dark', iso('2026-09-25T12:00:00+01:00'), sun), 'dark');
});

test('locate: the tablet\'s position, rounded to about 1 km; null when location is off, refused or silent', async () => {
  const geo = (fn) => ({ getCurrentPosition: fn });
  let asked;
  const ok = await locate(geo((yes, _no, opts) => { asked = opts; yes({ coords: { latitude: 51.501364, longitude: -0.141890, accuracy: 30 } }); }), { now: () => 42 });
  assert.deepEqual(ok, { lat: 51.5, lon: -0.14, at: 42 });
  assert.equal(asked.enableHighAccuracy, false, 'Wi-Fi location is plenty; no GPS warm-up');
  assert.equal(await locate(geo((_yes, no) => no({ code: 1, message: 'User denied Geolocation' }))), null);
  assert.equal(await locate(undefined), null);
  assert.equal(await locate(geo(() => { throw new Error('blocked'); })), null);
  assert.equal(await locate(geo((yes) => yes({ coords: { latitude: NaN, longitude: 2 } }))), null);
  assert.equal(await locate(geo(() => {}), { timeout: 5 }), null, 'a WebView that never answers');
});
