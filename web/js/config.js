// Settings live only in this browser's localStorage. Nothing here is ever sent anywhere
// except to the service it belongs to (Octopus key → Octopus, Google secrets → Google).

const KEY = 'wallpanel.settings.v1';
const CACHE_KEY = 'wallpanel.cache.v1';

export const DEFAULTS = Object.freeze({
  tz: 'Europe/London',
  octopus: {
    account: '',        // A-XXXXXXXX
    apiKey: '',         // sk_live_…
    tariff: '',         // optional override, e.g. E-1R-AGILE-24-10-01-C (else discovered)
    pollSeconds: 60,    // Home Mini refresh; Octopus allows ~100 API calls an hour
    discovered: null,   // { tariff, product, mpan, serial, deviceId, at }
    proxy: '',          // only if the browser can't reach Octopus directly: https://….workers.dev (docs/octopus.md)
  },
  google: {
    clientId: '',
    clientSecret: '',
    projectId: '',      // Device Access project ID (Nest); leave empty for Calendar only
    refreshToken: '',
    scopes: '',
    calendars: [],      // [{ id, name, color }]
    cameraId: '',       // enterprises/…/devices/…
    thermostatId: '',
  },
  weather: { lat: null, lon: null, place: '' },
  kia: { url: '', key: '' },
  panel: {
    cameraName: 'Front door',
    cameraBattery: true,   // battery cams: tap-for-live, Google stops the stream after 5 minutes
    cheap: 15,             // p/kWh: below this is green
    pricey: 25,            // p/kWh: at or above this is red
    nightFrom: '22:30',
    nightTo: '06:30',
    reloadAt: '03:30',
    launcher: 'auto',      // auto | webview | chrome | fully
    carApp: 'com.kia.oneapp.eu',
    carName: 'e-Niro',
  },
});

const clone = (o) => JSON.parse(JSON.stringify(o));

function merge(base, over) {
  const out = clone(base);
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = merge(out[k], v);
    } else if (k in out) {
      out[k] = v;
    }
  }
  return out;
}

export function loadSettings(storage = globalThis.localStorage) {
  try {
    return merge(DEFAULTS, JSON.parse(storage.getItem(KEY) || '{}'));
  } catch {
    return clone(DEFAULTS);
  }
}

export function saveSettings(s, storage = globalThis.localStorage) {
  storage.setItem(KEY, JSON.stringify(s));
}

/** Settings as text, to copy from one browser to another on the same tablet. Contains secrets. */
export const exportSettings = (s) => JSON.stringify(s);

export function importSettings(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('panel' in parsed || 'octopus' in parsed || 'google' in parsed)) {
    throw new Error("That doesn't look like wall panel settings");
  }
  return merge(DEFAULTS, parsed);
}

export function loadCache(storage = globalThis.localStorage) {
  try { return JSON.parse(storage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
}

export function saveCache(c, storage = globalThis.localStorage) {
  try { storage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* quota: not fatal */ }
}
