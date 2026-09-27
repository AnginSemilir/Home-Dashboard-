// Wall panel entry point: loads settings, starts each data source on its own timer, renders.

import { loadSettings, saveSettings, loadCache, saveCache } from './config.js';
import { backoffMs, describeError, HttpError } from './util.js';
import { inWindow, partsInTz, hhmm, startOfDay, weekdayShort } from './time.js';
import { Octopus, costToday } from './octopus.js';
import { Google } from './google.js';
import { Nest, LiveStream, parseThermostat, parseCamera } from './nest.js';
import { fetchEvents } from './calendar.js';
import { fetchWeather } from './weather.js';
import { fetchKia } from './kia.js';
import { actionFor, detectEnv, perform, musicApp, assistantApp } from './launcher.js';
import * as ui from './ui.js';
import { sunToday, themeFor, locate } from './sun.js';
import { fetchItems, setDone, addItem } from './tasks.js';
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
  lastDemandAt: cache.lastDemandAt ?? null, // newest Home Mini reading ever seen (survives midnight)
  costP: cache.costP ?? null,
  thermo: cache.thermo || null,
  camera: cache.camera || null,
  events: cache.events || null,
  weather: cache.weather || null,
  kia: cache.kia || null,
  shopping: cache.shopping || null,
  status: {},
  place: cache.place || null, // { lat, lon, at }: where the tablet is, for sunrise and sunset
};

const persist = () => saveCache({
  rates: state.rates, standingP: state.standingP, tele: state.tele, demand: state.demand, lastDemandAt: state.lastDemandAt, costP: state.costP,
  thermo: state.thermo, camera: state.camera, events: state.events, weather: state.weather, kia: state.kia, shopping: state.shopping,
  place: state.place,
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
  ui.renderCalendar(refs, state.events, now, state.status.calendar, tz, 9, google.signedIn);
  ui.renderPrice(refs, state.rates, now, state.status.rates, priceOpts(), tz);
  ui.renderTiles(refs, state, settings, now, tz);
  ui.renderCamera(refs, settings, state, live);
  ui.renderDock(refs, settings);
  ui.renderShopping(refs, state.shopping, state.status.shopping, shoppingInfo());
}

function shoppingInfo() {
  const list = settings.google.shoppingList;
  const why = !google.signedIn ? 'Sign in to Google in Settings to show your shopping list'
    : !google.hasTasks ? 'Sign in to Google again (⚙ → Sign in with Google) to show your shopping list'
      : !list?.id ? 'Choose your Google Tasks shopping list in Settings' : '';
  return { listName: list?.name, ready: !why, why };
}

// ---------- Data sources ----------
const sources = {};

/**
 * Run `fn` now and then every `interval()` ms. Failures back off (30 s → 15 min). A source
 * turns stale (amber) once its data is older than `staleAfter`; `dataAt()` says how old the
 * data itself is when that differs from the last successful call (e.g. a Home Mini that has
 * stopped reporting still answers). `clear()` forgets cached data when the source is switched off.
 */
function source(name, fn, interval, { staleAfter, dataAt, clear, enabled = () => true, render = renderAll } = {}) {
  let failures = 0, timer = null, lastOk = 0, busy = false, nextAt = 0;
  const staleCheck = () => {
    const st = state.status[name];
    const t = dataAt?.() ?? lastOk;
    if (st?.ok && staleAfter && Date.now() - t > staleAfter) st.stale = true;
  };
  const run = async () => {
    if (busy) return;
    clearTimeout(timer);
    if (!enabled()) {
      state.status[name] = null;
      if (clear) { clear(); persist(); render(); }
      return;
    }
    busy = true;
    try {
      await fn();
      failures = 0;
      lastOk = Date.now();
      state.status[name] = { ok: true, at: lastOk };
      staleCheck();
    } catch (e) {
      failures++;
      const rateLimited = e instanceof HttpError && e.status === 429;
      state.status[name] = { error: describeError(e), at: Date.now(), stale: true };
      if (rateLimited) failures = Math.max(failures, 4);
      console.warn(`[${name}]`, e);
    } finally {
      busy = false;
    }
    persist();
    render();
    const delay = failures ? backoffMs(failures) : interval();
    nextAt = Date.now() + delay;
    timer = setTimeout(run, delay);
  };
  // Coming back to the panel: refresh now, unless it's backing off after errors.
  const runIfDue = () => { if (!busy && (failures === 0 || Date.now() >= nextAt)) run(); };
  sources[name] = { run, runIfDue, staleCheck };
  return run;
}

const nightNow = () => inWindow(Date.now(), settings.panel.nightFrom, settings.panel.nightTo, tz);

// Half-hourly readings are stamped with the start of their half hour, so a healthy reading
// can be up to ~30 minutes old.
const HOME_MINI_STALE = 45 * 60e3;

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
  try {
    await ensureDiscovered();
  } catch (e) {
    // Prices are public: keep them coming with the tariff we already know.
    if (!octopus.tariff()) throw e;
    console.warn('[rates] account lookup failed; using the known tariff', e);
  }
  state.rates = await octopus.rates(Date.now(), tz);
  try { state.standingP = await octopus.standingCharge(); } catch { /* cost just omits it */ }
  updateCost();
}

function updateCost() {
  // No figure rather than a wrong one: every half hour with usage needs a known price.
  const priced = (s) => !s.kwh || state.rates.some((r) => r.start <= s.start && s.start < r.end);
  state.costP = state.tele && state.tele.slots.every(priced) ? costToday(state.tele.slots, state.rates, state.standingP || 0) : null;
}

async function refreshHomeMini() {
  await ensureDiscovered();
  const tele = await octopus.telemetryToday(Date.now(), tz);
  state.tele = tele;
  if (tele.demandAt) state.lastDemandAt = Math.max(state.lastDemandAt || 0, tele.demandAt);
  if (Number.isFinite(tele.demandW) && Date.now() - tele.demandAt < HOME_MINI_STALE) {
    state.demand.push({ t: Date.now(), w: tele.demandW });
    state.demand = state.demand.filter((p) => p.t > Date.now() - 2 * 3600e3);
  }
  updateCost();
}

async function refreshNest() {
  const d = await nest.device(settings.google.thermostatId);
  state.thermo = { ...parseThermostat(d), at: Date.now() };
  if (settings.google.cameraId && state.camera?.id !== settings.google.cameraId) {
    try { state.camera = { ...parseCamera(await nest.device(settings.google.cameraId)), id: settings.google.cameraId }; } catch { /* name only */ }
  }
}

async function refreshCalendar() {
  const { events, failed } = await fetchEvents(google, settings.google.calendars, Date.now(), tz);
  state.events = events;
  // Show what we have, but say which calendar is missing.
  if (failed.length) throw new Error(`Couldn't read ${failed.map((f) => `"${f.name}" (${describeError(f.error)})`).join(', ')}`);
}

async function refreshWeather() {
  state.weather = await fetchWeather(settings.weather, tz);
  applyTheme(); // today's exact sunrise/sunset for this place
}

async function refreshShopping() {
  state.shopping = await fetchItems(google, settings.google.shoppingList.id);
}

async function tickShopping(id, title) {
  const list = settings.google.shoppingList?.id;
  if (!list || !state.shopping) return;
  state.shopping = state.shopping.filter((x) => x.id !== id); // straight off the screen
  renderAll();
  try {
    await setDone(google, list, id, true);
    ui.toast(refs, `Ticked off ${title}`, 6000, { label: 'Undo', fn: async () => {
      try { await setDone(google, list, id, false); } catch (e) { ui.toast(refs, `Couldn't undo: ${describeError(e)}`); }
      sources.shopping?.run();
    } });
  } catch (e) {
    ui.toast(refs, `Couldn't tick off ${title}: ${describeError(e)}`, 6000);
    sources.shopping?.run();
  }
}

async function addShopping(text) {
  const list = settings.google.shoppingList?.id;
  if (!list) return;
  state.shopping = [{ id: `new-${Date.now()}`, title: text }, ...(state.shopping || [])];
  renderAll();
  try { await addItem(google, list, text); } catch (e) { ui.toast(refs, `Couldn't add ${text}: ${describeError(e)}`, 6000); }
  sources.shopping?.run();
}

async function refreshKia() {
  const r = await fetchKia(settings.kia);
  state.kia = r;
  // The reading stays on screen, but say so if the GitHub job has stopped updating it.
  if (r.fetched && Date.now() - r.fetched > KIA_JOB_STALE) {
    throw new Error(`The Kia GitHub job last ran ${Math.round((Date.now() - r.fetched) / 3600e3)} h ago. Check the repository's Actions tab.`);
  }
}
const KIA_JOB_STALE = 3 * 3600e3;

// ---------- Camera ----------
async function openCamera() {
  if (live && live.state !== 'ended') { live.expanded = !live.expanded; ui.renderCamera(refs, settings, state, live); return; }
  if (!settings.google.cameraId) { ui.toast(refs, 'Set up the Nest camera in Settings'); return; }
  // Each tap gets its own session object; callbacks from an older stream can't touch a newer one.
  const mine = { state: 'connecting', expanded: true, endsAt: 0 };
  live = mine;
  const stream = new LiveStream(nest, settings.google.cameraId, {
    battery: settings.panel.cameraBattery,
    onState: (st) => {
      if (live !== mine) return;
      if (st === 'timeout') { ui.toast(refs, "The camera didn't send any video. Tap to try again."); return; }
      mine.state = st;
      if (st === 'ended') live = null;
      ui.renderCamera(refs, settings, state, live);
    },
  });
  mine.stream = stream;
  ui.renderCamera(refs, settings, state, live);
  try {
    await stream.start(refs.video);
    if (live === mine) {
      mine.endsAt = stream.endsAt;
      state.status.camera = { ok: true, at: Date.now() };
    }
  } catch (e) {
    // Decide before stop(): its 'ended' callback clears `live`. A session the user already
    // closed (live !== mine) fails quietly; the one on screen reports why.
    const current = live === mine;
    await stream.stop();
    if (current) {
      state.status.camera = { error: describeError(e), at: Date.now() };
      ui.toast(refs, `Camera: ${describeError(e)}`);
      if (live === mine) live = null;
    }
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
function launch(button, hold) {
  const name = button === 'music' ? musicApp(settings) : button === 'ai' ? assistantApp(settings) : button;
  const env = settings.panel.launcher === 'auto' ? detectEnv() : settings.panel.launcher;
  const pkg = name === 'car' ? settings.panel.carApp : undefined;
  perform(actionFor(name, env, { hold, pkg }), window, (t) => ui.toast(refs, t));
}

/** Tapping a card with a red or amber dot says why. */
function explain(st, staleWhy = 'Not updated recently. The panel keeps retrying by itself.') {
  const why = st?.error || (st?.stale ? staleWhy : '');
  if (why) ui.toast(refs, why, 6000);
}

/**
 * When the Home Mini last reported. After midnight "today" can be empty, so fall back to the
 * newest reading ever seen, and failing that to midnight (nothing at all today).
 */
function homeMiniDataAt() {
  if (!state.tele) return null;
  return state.tele.demandAt ?? state.lastDemandAt ?? startOfDay(Date.now(), tz);
}

function homeMiniStaleWhy() {
  const t = state.tele?.demandAt ?? state.lastDemandAt;
  if (!t) return state.tele ? "No Home Mini reading yet today. Check it's plugged in and on Wi-Fi." : undefined;
  const when = t < startOfDay(Date.now(), tz) ? `${weekdayShort(t, tz)} ${hhmm(t, tz)}` : hhmm(t, tz);
  return `No new Home Mini reading since ${when}. Check it's plugged in and on Wi-Fi (the Octopus app shows the same).`;
}

// ---------- Look: style (Bold / Ambient) and theme (light from sunrise to sunset) ----------
const STYLES = ['bold', 'ambient'];

/** Load the chosen style sheet before anything is drawn (the chart measures its box). */
function applyStyle() {
  const style = STYLES.includes(settings.panel.style) ? settings.panel.style : STYLES[0];
  document.documentElement.dataset.style = style;
  const link = document.getElementById('style-css');
  const href = `css/${style}.css`;
  if (!link || link.getAttribute('href') === href) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    link.addEventListener('load', done, { once: true });
    link.addEventListener('error', done, { once: true });
    setTimeout(done, 3000); // never hang the panel on a slow style sheet
    link.setAttribute('href', href);
  });
}

// Sunrise and sunset where the tablet is (its own location), else at the weather location.
const sun = (now = Date.now()) => (state.place
  ? sunToday(now, { lat: state.place.lat, lon: state.place.lon, tz })
  : sunToday(now, { weather: state.weather, lat: settings.weather.lat, lon: settings.weather.lon, tz }));

// ?theme=light or ?theme=dark pins one theme, for screenshots and tests. There's no setting:
// the panel is light from sunrise to sunset.
const THEME_PIN = (() => {
  try { const t = new URLSearchParams(location.search).get('theme'); return t === 'light' || t === 'dark' ? t : 'auto'; } catch { return 'auto'; }
})();

/**
 * Where the tablet is, for sunrise and sunset. Asked at each start (the page reloads every
 * night). The browser asks permission the first time; if location is off or refused, the
 * weather location is used instead. Only a rounded position is kept, on this tablet.
 */
async function refreshPlace() {
  const p = await locate();
  if (!p) return;
  state.place = p;
  persist();
  applyTheme();
}

/** Light between sunrise and sunset. Returns true if it changed. */
function applyTheme(now = Date.now()) {
  const theme = themeFor(THEME_PIN, now, sun(now));
  const root = document.documentElement;
  if (root.dataset.theme === theme) return false;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f5f7' : '#0e0f11');
  return true;
}

// ---------- Night mode, wake lock, daily reload ----------
// An automatic nightly reload isn't a touch, so it shouldn't wake the screen.
const AUTO_RELOAD = 'wallpanel.autoreload';
let lastTouch = Date.now();
try { if (sessionStorage.getItem(AUTO_RELOAD)) { lastTouch = 0; sessionStorage.removeItem(AUTO_RELOAD); } } catch { /* storage blocked */ }
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
    if (p.h === h && p.min === m && !live && document.visibilityState === 'visible') {
      try { sessionStorage.setItem(AUTO_RELOAD, '1'); } catch { /* fine */ }
      location.reload();
    }
  }, 60e3);
}

// ---------- Boot ----------
async function boot() {
  applyTheme();
  await applyStyle();
  refs = ui.buildPanel(document.getElementById('app'), {
    camera: openCamera,
    cameraClose: closeCamera,
    launch,
    settings: () => openSettings(document.body, { settings, save, state, google }),
    tile: (key) => {
      if (key === 'car' && !settings.kia.url) return launch('car', false);
      if (key === 'usage') return explain(state.status.homemini, homeMiniStaleWhy());
      if (key === 'cost') return explain(ui.worst(state.status.homemini, state.status.rates), homeMiniStaleWhy());
      explain(state.status[{ indoor: 'thermostat', car: 'kia' }[key]]);
    },
    status: (key) => explain(state.status[key]),
    chartTap: (hit) => ui.showChartTip(refs, hit, priceOpts(), tz),
    shopTick: tickShopping,
    shopAdd: addShopping,
    nightTap: () => { nightSnoozeUntil = Date.now() + 5 * 60e3; updateNight(); },
  });
  document.addEventListener('pointerdown', () => { lastTouch = Date.now(); }, true);

  const result = await google.handleRedirect();
  renderAll();
  if (result === 'signed-in') {
    // Google lets people untick parts of the sign-in; say which parts won't work.
    const missing = google.missingScopes();
    ui.toast(refs, missing.length
      ? `Signed in to Google, but it didn't allow ${missing.join(' or ')}. To use ${missing.length > 1 ? 'them' : 'it'}, sign in again and make sure every box is ticked (or tick Select all).`
      : 'Signed in to Google. Now choose your camera, thermostat, calendars and shopping list in Settings.', missing.length ? 15000 : 7000);
  } else if (result) {
    ui.toast(refs, `Google sign-in: ${result.slice(7)}`, 7000);
  }

  const nothingSetUp = !settings.weather.lat && !settings.octopus.tariff && !settings.octopus.apiKey && !settings.google.refreshToken;
  if (nothingSetUp || result === 'signed-in') openSettings(document.body, { settings, save, state, google });

  const minutes = (m) => () => m * 60e3;
  // A source that's switched off (signed out, key removed…) also forgets what it showed.
  source('rates', refreshRates, minutes(15), {
    staleAfter: 3 * 3600e3, enabled: () => !!(settings.octopus.tariff || (settings.octopus.apiKey && settings.octopus.account)),
    clear: () => { state.rates = []; state.standingP = null; state.costP = null; },
  })();
  source('homemini', refreshHomeMini, () => (nightNow() ? 300e3 : Math.max(30, settings.octopus.pollSeconds) * 1000), {
    staleAfter: HOME_MINI_STALE, dataAt: homeMiniDataAt, enabled: () => !!(settings.octopus.apiKey && settings.octopus.account),
    clear: () => { state.tele = null; state.demand = []; state.lastDemandAt = null; state.costP = null; },
  })();
  source('thermostat', refreshNest, minutes(5), {
    staleAfter: 30 * 60e3, enabled: () => !!(google.signedIn && settings.google.thermostatId),
    clear: () => { state.thermo = null; state.camera = null; },
  })();
  source('calendar', refreshCalendar, minutes(10), {
    staleAfter: 60 * 60e3, enabled: () => !!(google.signedIn && settings.google.calendars.length), clear: () => { state.events = null; },
  })();
  source('weather', refreshWeather, minutes(30), { staleAfter: 3 * 3600e3, enabled: () => settings.weather.lat != null, clear: () => { state.weather = null; } })();
  source('shopping', refreshShopping, minutes(2), {
    staleAfter: 30 * 60e3, enabled: () => !!(google.hasTasks && settings.google.shoppingList?.id), clear: () => { state.shopping = null; },
  })();
  source('kia', refreshKia, minutes(15), { staleAfter: 6 * 3600e3, enabled: () => !!(settings.kia.url && settings.kia.key), clear: () => { state.kia = null; } })();
  refreshPlace();

  // Every second: clock + camera countdown. Every 30 s: price/chart (slot changes), staleness, night.
  setInterval(() => { const now = Date.now(); ui.renderClock(refs, now, tz); ui.renderCamTimer(refs, live, now); }, 1000);
  setInterval(() => { for (const s of Object.values(sources)) s.staleCheck(); applyTheme(); renderAll(); updateNight(); }, 30e3);
  let lastW = innerWidth, lastH = innerHeight;
  addEventListener('resize', () => { if (innerWidth !== lastW || innerHeight !== lastH) { lastW = innerWidth; lastH = innerHeight; renderAll(); } });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { keepAwake(); for (const s of Object.values(sources)) s.runIfDue(); }
    else if (live) closeCamera(); // don't leave a stream running in the background
  });
  keepAwake();
  scheduleDailyReload();
  updateNight();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// A wall tablet has no console to look at, so unexpected errors are shown on screen.
addEventListener('error', (e) => { if (refs) ui.toast(refs, `Something went wrong: ${e.message}`, 8000); });
addEventListener('unhandledrejection', (e) => { if (refs) ui.toast(refs, `Something went wrong: ${describeError(e.reason)}`, 8000); });

boot();
