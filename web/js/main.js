// Wall panel entry point: loads settings, starts each data source on its own timer, renders.

import { loadSettings, saveSettings, loadCache, saveCache } from './config.js';
import { backoffMs, describeError, HttpError } from './util.js';
import { inWindow, partsInTz } from './time.js';
import { Octopus, costToday } from './octopus.js';
import { Google } from './google.js';
import { Nest, LiveStream, parseThermostat, parseCamera } from './nest.js';
import { fetchEvents } from './calendar.js';
import { fetchWeather } from './weather.js';
import { fetchKia } from './kia.js';
import { actionFor, detectEnv, perform } from './launcher.js';
import * as ui from './ui.js';
import { openSettings } from './settings-ui.js';

const settings = loadSettings();
const save = () => saveSettings(settings);
const tz = settings.tz;
const cache = loadCache();

export const state = {
  rates: cache.rates || [],
  standingP: cache.standingP ?? null,
  tele: cache.tele || null,
  demand: cache.demand || [],
  costP: cache.costP ?? null,
  thermo: cache.thermo || null,
  camera: cache.camera || null,
  events: cache.events || null,
  weather: cache.weather || null,
  kia: cache.kia || null,
  status: {},
};

const persist = () => saveCache({
  rates: state.rates, standingP: state.standingP, tele: state.tele, demand: state.demand, costP: state.costP,
  thermo: state.thermo, camera: state.camera, events: state.events, weather: state.weather, kia: state.kia,
});

const google = new Google(settings, save);
const octopus = new Octopus(settings);
const nest = new Nest(google, settings);
let refs;
let live = null; // { stream, state, endsAt, expanded }

// ---------- Rendering ----------
const priceOpts = () => ({ cheap: settings.panel.cheap, pricey: settings.panel.pricey });
function renderAll() {
  const now = Date.now();
  ui.renderClock(refs, now, tz);
  ui.renderWeather(refs, state.weather, state.status.weather, tz);
  ui.renderCalendar(refs, state.events, now, state.status.calendar, tz);
  ui.renderPrice(refs, state.rates, now, state.status.rates, priceOpts(), tz);
  ui.renderTiles(refs, state, settings, now, tz);
  ui.renderCamera(refs, settings, state, live);
}

// ---------- Data sources ----------
const sources = {};

/**
 * Run `fn` now and then every `interval()` ms. Failures back off (30 s → 15 min) and mark
 * the source stale once its data is older than `staleAfter`.
 */
function source(name, fn, interval, { staleAfter, enabled = () => true, render = renderAll } = {}) {
  let failures = 0, timer = null, lastOk = 0;
  const run = async () => {
    clearTimeout(timer);
    if (!enabled()) { state.status[name] = null; return; }
    try {
      await fn();
      failures = 0;
      lastOk = Date.now();
      state.status[name] = { ok: true, at: lastOk };
    } catch (e) {
      failures++;
      const rateLimited = e instanceof HttpError && e.status === 429;
      state.status[name] = { error: describeError(e), at: Date.now(), stale: true };
      if (rateLimited) failures = Math.max(failures, 4);
      console.warn(`[${name}]`, e);
    }
    persist();
    render();
    timer = setTimeout(run, failures ? backoffMs(failures) : interval());
  };
  sources[name] = { run, staleCheck: () => {
    const st = state.status[name];
    if (st?.ok && staleAfter && Date.now() - lastOk > staleAfter) st.stale = true;
  } };
  return run;
}

const nightNow = () => inWindow(Date.now(), settings.panel.nightFrom, settings.panel.nightTo, tz);

let discovering = null;
/** Look up tariff, meter and Home Mini from the account (once a day). Shared by both sources. */
async function ensureDiscovered() {
  if (!(settings.octopus.apiKey && settings.octopus.account)) return;
  const d = settings.octopus.discovered;
  if (d && Date.now() - d.at < 24 * 3600e3) return;
  discovering ??= octopus.discover().then((found) => { settings.octopus.discovered = found; save(); }).finally(() => { discovering = null; });
  await discovering;
}

async function refreshRates() {
  await ensureDiscovered();
  state.rates = await octopus.rates(Date.now(), tz);
  try { state.standingP = await octopus.standingCharge(); } catch { /* cost just omits it */ }
  updateCost();
}

function updateCost() {
  state.costP = state.tele ? costToday(state.tele.slots, state.rates, state.standingP || 0) : null;
}

async function refreshHomeMini() {
  await ensureDiscovered();
  const tele = await octopus.telemetryToday(Date.now(), tz);
  state.tele = tele;
  if (Number.isFinite(tele.demandW)) {
    state.demand.push({ t: Date.now(), w: tele.demandW });
    state.demand = state.demand.filter((p) => p.t > Date.now() - 2 * 3600e3);
  }
  updateCost();
}

async function refreshNest() {
  const d = await nest.device(settings.google.thermostatId);
  state.thermo = { ...parseThermostat(d), at: Date.now() };
  if (settings.google.cameraId && !state.camera) {
    try { state.camera = parseCamera(await nest.device(settings.google.cameraId)); } catch { /* name only */ }
  }
}

async function refreshCalendar() {
  state.events = await fetchEvents(google, settings.google.calendars, Date.now(), tz);
}

async function refreshWeather() {
  state.weather = await fetchWeather(settings.weather, tz);
}

async function refreshKia() {
  state.kia = await fetchKia(settings.kia);
}

// ---------- Camera ----------
async function openCamera() {
  if (live && live.state !== 'ended') { live.expanded = !live.expanded; ui.renderCamera(refs, settings, state, live); return; }
  if (!settings.google.cameraId) { ui.toast(refs, 'Set up the Nest camera in Settings'); return; }
  live = { state: 'connecting', expanded: true, endsAt: 0 };
  const stream = new LiveStream(nest, settings.google.cameraId, {
    battery: settings.panel.cameraBattery,
    onState: (st) => {
      if (!live) return;
      if (st === 'timeout') { ui.toast(refs, "The camera didn't send any video. Tap to try again."); return; }
      live.state = st;
      if (st === 'ended') live = null;
      ui.renderCamera(refs, settings, state, live);
    },
  });
  live.stream = stream;
  ui.renderCamera(refs, settings, state, live);
  try {
    await stream.start(refs.video);
    if (live) live.endsAt = stream.endsAt;
    state.status.camera = { ok: true, at: Date.now() };
  } catch (e) {
    state.status.camera = { error: describeError(e), at: Date.now() };
    ui.toast(refs, `Camera: ${describeError(e)}`);
    await stream.stop();
    live = null;
  }
  ui.renderCamera(refs, settings, state, live);
}

async function closeCamera() {
  const s = live?.stream;
  live = null;
  ui.renderCamera(refs, settings, state, live);
  await s?.stop();
}

// ---------- Buttons ----------
function launch(name, hold) {
  const env = settings.panel.launcher === 'auto' ? detectEnv() : settings.panel.launcher;
  const pkg = name === 'car' ? settings.panel.carApp : undefined;
  perform(actionFor(name, env, { hold, pkg }), window, (t) => ui.toast(refs, t));
}

/** Tapping a card with a red or amber dot says why. */
function explain(st) {
  const why = st?.error || (st?.stale ? 'Not updated recently. The panel keeps retrying by itself.' : '');
  if (why) ui.toast(refs, why, 6000);
}

// ---------- Night mode, wake lock, daily reload ----------
let lastTouch = Date.now();
let nightSnoozeUntil = 0;
function updateNight() {
  const show = nightNow() && Date.now() > nightSnoozeUntil && Date.now() - lastTouch > 90e3 && !live;
  refs.night.classList.toggle('hidden', !show);
}

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* not supported or not allowed: Android "Stay awake" covers it */ }
}

function scheduleDailyReload() {
  const [h, m] = settings.panel.reloadAt.split(':').map(Number);
  setInterval(() => {
    const p = partsInTz(Date.now(), tz);
    if (p.h === h && p.min === m && !live && document.visibilityState === 'visible') location.reload();
  }, 60e3);
}

// ---------- Boot ----------
async function boot() {
  refs = ui.buildPanel(document.getElementById('app'), {
    camera: openCamera,
    cameraClose: closeCamera,
    launch,
    settings: () => openSettings(document.body, { settings, save, state, google }),
    tile: (key) => {
      if (key === 'car' && !settings.kia.url) return launch('car', false);
      explain(state.status[{ usage: 'homemini', cost: 'homemini', indoor: 'thermostat', car: 'kia' }[key]]);
    },
    status: (key) => explain(state.status[key]),
    nightTap: () => { nightSnoozeUntil = Date.now() + 5 * 60e3; updateNight(); },
  });
  document.addEventListener('pointerdown', () => { lastTouch = Date.now(); }, true);

  const result = await google.handleRedirect();
  renderAll();
  if (result) ui.toast(refs, result === 'signed-in' ? 'Signed in to Google. Now choose your camera, thermostat and calendars in Settings.' : `Google sign-in: ${result.slice(7)}`, 7000);

  const nothingSetUp = !settings.weather.lat && !settings.octopus.tariff && !settings.octopus.apiKey && !settings.google.refreshToken;
  if (nothingSetUp || result === 'signed-in') openSettings(document.body, { settings, save, state, google });

  const minutes = (m) => () => m * 60e3;
  source('rates', refreshRates, minutes(15), { staleAfter: 3 * 3600e3, enabled: () => !!(settings.octopus.tariff || (settings.octopus.apiKey && settings.octopus.account)) })();
  source('homemini', refreshHomeMini, () => (nightNow() ? 300e3 : Math.max(30, settings.octopus.pollSeconds) * 1000),
    { staleAfter: 15 * 60e3, enabled: () => !!(settings.octopus.apiKey && settings.octopus.account) })();
  source('thermostat', refreshNest, minutes(5), { staleAfter: 30 * 60e3, enabled: () => !!(google.signedIn && settings.google.thermostatId) })();
  source('calendar', refreshCalendar, minutes(10), { staleAfter: 60 * 60e3, enabled: () => !!(google.signedIn && settings.google.calendars.length) })();
  source('weather', refreshWeather, minutes(30), { staleAfter: 3 * 3600e3, enabled: () => settings.weather.lat != null })();
  source('kia', refreshKia, minutes(15), { staleAfter: 6 * 3600e3, enabled: () => !!(settings.kia.url && settings.kia.key) })();

  // Every second: clock + camera countdown. Every 30 s: price/chart (slot changes), staleness, night.
  setInterval(() => { const now = Date.now(); ui.renderClock(refs, now, tz); ui.renderCamTimer(refs, live, now); }, 1000);
  setInterval(() => { for (const s of Object.values(sources)) s.staleCheck(); renderAll(); updateNight(); }, 30e3);
  let lastW = innerWidth, lastH = innerHeight;
  addEventListener('resize', () => { if (innerWidth !== lastW || innerHeight !== lastH) { lastW = innerWidth; lastH = innerHeight; renderAll(); } });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { keepAwake(); for (const s of Object.values(sources)) s.run(); }
    else if (live) closeCamera(); // don't leave a stream running in the background
  });
  keepAwake();
  scheduleDailyReload();
  updateNight();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
