// Sunrise and sunset, for the light/dark theme: light from sunrise to sunset where the tablet
// is. The place comes from the tablet's own location (see locate); without it, the weather
// location. This calculation (after Vladimir Agafonkin's SunCalc, from the NOAA formulas) is
// accurate to a minute or two, with no network needed.

import { startOfDay, DEFAULT_TZ } from './time.js';

const RAD = Math.PI / 180;
const DAY = 864e5;
const J1970 = 2440588;
const J2000 = 2451545;
const J0 = 0.0009;
const TILT = RAD * 23.4397;

const toDays = (ms) => ms / DAY - 0.5 + J1970 - J2000;
const fromJulian = (j) => (j + 0.5 - J1970) * DAY;
const meanAnomaly = (d) => RAD * (357.5291 + 0.98560028 * d);
const eclipticLongitude = (m) => m + RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m)) + RAD * 102.9372 + Math.PI;
const transit = (ds, m, l) => J2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l);

/**
 * Sunrise and sunset (epoch ms) on the day that contains `ms`, at a latitude/longitude.
 * Returns null where the sun doesn't rise or set that day (polar day or night).
 */
export function sunTimes(ms, lat, lon) {
  const lw = RAD * -lon, phi = RAD * lat;
  const n = Math.round(toDays(ms) - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + n;
  const m = meanAnomaly(ds);
  const l = eclipticLongitude(m);
  const dec = Math.asin(Math.sin(TILT) * Math.sin(l));
  const cosW = (Math.sin(RAD * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (!(cosW >= -1 && cosW <= 1)) return null;
  const w = Math.acos(cosW);
  const noon = transit(ds, m, l);
  const set = transit(J0 + (w + lw) / (2 * Math.PI) + n, m, l);
  return { rise: fromJulian(noon - (set - noon)), set: fromJulian(set) };
}

/** Today's sun times: Open-Meteo's for the saved place if loaded, else calculated. */
export function sunToday(now, { weather, lat, lon, tz = DEFAULT_TZ } = {}) {
  const day = weather?.days?.find((d) => d.sunrise && d.sunset && d.sunrise < now + DAY && d.sunset > startOfDay(now, tz));
  if (day && day.sunrise >= startOfDay(now, tz) && day.sunrise < startOfDay(now, tz, 1)) return { rise: day.sunrise, set: day.sunset };
  return sunTimes(startOfDay(now, tz) + 12 * 3600e3, lat ?? 51.5, lon ?? -0.12); // UK default: London
}

/**
 * Where the tablet is, from the browser's location service (Wi-Fi or GPS), rounded to about
 * 1 km: plenty for sunrise and sunset, and all that's kept. It never leaves the tablet.
 * Resolves { place } or { error: 'denied' | 'unavailable' | 'timeout' | 'noanswer' | 'unsupported' }.
 * 'noanswer' means nothing came back in time (a permission prompt still on screen, or a WebView
 * that never answers); if a position arrives after all, it goes to `onLate`.
 */
export function locate(geo = globalThis.navigator?.geolocation, { timeout = 30e3, maximumAge = 12 * 3600e3, wait = timeout + 5e3, now = () => Date.now(), onLate } = {}) {
  return new Promise((resolve) => {
    if (typeof geo?.getCurrentPosition !== 'function') { resolve({ error: 'unsupported' }); return; }
    let done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(guard); resolve(v); } };
    const guard = setTimeout(() => finish({ error: 'noanswer' }), wait);
    const r2 = (n) => Math.round(n * 100) / 100;
    try {
      geo.getCurrentPosition((p) => {
        const lat = p?.coords?.latitude, lon = p?.coords?.longitude;
        const ok = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
        const res = ok ? { place: { lat: r2(lat), lon: r2(lon), at: now() } } : { error: 'unavailable' };
        if (done) { if (ok) onLate?.(res.place); } else finish(res);
      }, (err) => finish({ error: ({ 1: 'denied', 2: 'unavailable', 3: 'timeout' })[err?.code] || 'unavailable' }),
      { enableHighAccuracy: false, timeout, maximumAge });
    } catch {
      finish({ error: 'unavailable' });
    }
  });
}

/** Where the tablet's location stands, in words (for Settings). */
export const LOCATION_WHY = {
  denied: 'location access is off for the panel',
  unavailable: 'the tablet couldn\'t find its location',
  timeout: 'the tablet couldn\'t find its location in time',
  noanswer: 'the location request wasn\'t answered',
  unsupported: 'this browser can\'t share location',
};

/** 'light' or 'dark' for a Theme setting of 'auto' (follows the sun) | 'light' | 'dark'. */
export function themeFor(mode, now, sun) {
  if (mode === 'light' || mode === 'dark') return mode;
  return sun && now >= sun.rise && now < sun.set ? 'light' : 'dark';
}
