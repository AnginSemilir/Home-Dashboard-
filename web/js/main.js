// Wall panel entry point: loads settings, starts each data source on its own timer, renders.

import { loadSettings, saveSettings, loadCache, saveCache } from './config.js';
import { backoffMs, describeError, HttpError } from './util.js';
import { inWindow, partsInTz, hhmm, startOfDay, weekdayShort, dayKey } from './time.js';
import { Octopus, costToday } from './octopus.js';
import { PriceStats } from './stats.js';
import { Bright, usageBetween, fixedCost } from './bright.js';
import { Fuse, FuseSignedOut, dayTotals } from './fuse.js';
import { Google, redirectUri } from './google.js';
import { Spotify, spotifyEnded } from './spotify.js';
import { DoorbellListener, SUB_RE } from './doorbell.js';
import { Chime } from './chime.js';
import { Nest, LiveStream, parseThermostat, parseCamera } from './nest.js';
import { fetchEvents } from './calendar.js';
import { fetchWeather } from './weather.js';
import { fetchKia } from './kia.js';
import { actionFor, detectEnv, perform, musicApp, assistantApp, MUSIC_APPS } from './launcher.js';
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
  ratesTariff: cache.ratesTariff || null, // the tariff those prices are for
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
  music: null, // what Spotify is playing (not kept: it's out of date within seconds)
  place: cache.place || null, // { lat, lon, at }: where the tablet is, for sunrise and sunset
  brightSlots: cache.brightSlots || [], // half-hourly kWh from Bright, yesterday and today
  brightLive: cache.brightLive || null, // { w, at } from a Glow display, if there is one
  brightDemand: cache.brightDemand || [], // the Glow display's last two hours, for the sparkline
  fuseDays: cache.fuseDays || {}, // Fuse's hourly bars for today and yesterday: { 'YYYY-MM-DD': { at, elec, gas, export, has } }
  fuseNewest: cache.fuseNewest || null, // { elec, gas }: when each fuel's newest reading ends (for the ⚙ checklist)
};

const persist = () => saveCache({
  rates: state.rates, ratesTariff: state.ratesTariff, standingP: state.standingP, tele: state.tele, demand: state.demand, lastDemandAt: state.lastDemandAt, costP: state.costP,
  thermo: state.thermo, camera: state.camera, events: state.events, weather: state.weather, kia: state.kia, shopping: state.shopping,
  place: state.place, brightSlots: state.brightSlots, brightLive: state.brightLive, brightDemand: state.brightDemand,
  fuseDays: state.fuseDays, fuseNewest: state.fuseNewest,
});

const google = new Google(settings, save);
const spotify = new Spotify(settings);
const octopus = new Octopus(settings);
const bright = new Bright(settings);
if (!bright.configured) bright.forget(); // the Bright email or password was cleared: so is its sign-in
// Usage from Bright (any supplier, a fixed price), or from Fuse (electricity and gas), instead of
// Octopus (Agile and the Home Mini).
const useBright = () => settings.energy.source === 'bright';
const useFuse = () => settings.energy.source === 'fuse';
const fuse = new Fuse(settings);
const priceStats = new PriceStats({ octopus, settings, tz });
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
  const bv = useBright() ? brightView(now) : null;
  const fv = useFuse() ? fuseView(now) : null;
  if (fv) ui.renderFuse(refs, fv, now, tz);
  else if (bv) ui.renderBright(refs, bv, now, tz);
  else ui.renderPrice(refs, state.rates, now, state.status.rates, priceOpts(), tz);
  ui.renderTiles(refs, state, settings, now, tz, bv, fv);
  ui.renderCamera(refs, settings, state, live);
  ui.renderDock(refs, settings);
  renderMusic();
  ui.renderShopping(refs, state.shopping, state.status.shopping, shoppingInfo());
  renderStats();
  renderUsage();
}

function shoppingInfo() {
  const list = settings.google.shoppingList;
  const why = !google.signedIn ? 'Sign in to Google in Settings to show your shopping list'
    : !google.hasTasks ? 'Sign in to Google again (⚙ → Sign in with Google) to show your shopping list'
      : !list?.id ? 'Choose your Google Tasks shopping list in Settings' : '';
  return { listName: list?.name, ready: !why, why };
}

// ---------- Bright: usage for any supplier, on a fixed price ----------
/**
 * What the Bright cards show: today and yesterday from the half-hourly readings, priced at the fixed
 * rate. When Bright is behind, the chart and the day tile show the newest day it has, dated.
 */
function brightView(now = Date.now()) {
  const dayStart = startOfDay(now, tz), dayEnd = startOfDay(now, tz, 1), yStart = startOfDay(now, tz, -1);
  const slots = state.brightSlots;
  const today = usageBetween(slots, dayStart, now);
  const newest = [...slots].reverse().find((x) => x.kwh != null) || null;
  // The latest whole day: yesterday, or the newest day Bright has.
  const dayOf = (t) => ({ start: startOfDay(t, tz), end: startOfDay(t, tz, 1) });
  const day = !usageBetween(slots, yStart, dayStart).slots && newest && newest.start < yStart ? dayOf(newest.start) : { start: yStart, end: dayStart };
  const lastDay = { ...usageBetween(slots, day.start, day.end), ...day };
  lastDay.complete = lastDay.last >= day.end;
  // The chart: today once it has a reading, until then the newest day Bright has.
  const shown = !today.slots && newest && newest.start < dayStart ? dayOf(newest.start) : { start: dayStart, end: dayEnd };
  const rates = { unitRate: Number(settings.energy.unitRate) || 0, standing: Number(settings.energy.standing) || 0 };
  const priced = rates.unitRate > 0;
  return {
    today, yesterday: lastDay, priced, rates, dayStart, dayEnd, yStart, shown, newest,
    lastHalf: newest && newest.start >= yStart ? newest : null, // "Last half hour" is never days old
    todayP: priced ? fixedCost(today.kwh, rates) : null,
    yesterdayP: priced ? fixedCost(lastDay.kwh, rates) : null,
    slots, live: state.brightLive, demand: state.brightDemand, configured: bright.configured,
    status: state.status.bright, liveStatus: state.status.brightlive,
  };
}

/** What a tap on the Bright card or tiles says: never nothing while the card is empty or stale. */
function explainBright(st = state.status.bright) {
  if (!bright.configured) return ui.toast(refs, "Bright isn't set up on this panel yet: ⚙ → Electricity → type your Bright email and password → Save & close.", 8000);
  if (!st) return ui.toast(refs, 'Asking Bright for your readings…', 4000);
  if (st.error) return explain(st);
  const v = brightView();
  if (v.newest && (st.stale || !v.today.slots)) {
    return ui.toast(refs, `Bright's newest half hour is ${ui.slotWhen(v.newest, Date.now(), tz)}. Bright is often a few hours behind, sometimes a day or more; the Bright app shows the same. If the app has newer readings, press Connect in ⚙ → Electricity.`, 9000);
  }
  explain(st);
}

/**
 * What the Fuse card and tiles show: today and yesterday for electricity and gas, from Fuse's
 * hourly bars. Today counts the hour in progress (Fuse keeps topping it up), and includes the
 * standing charge for the hours so far, as the Fuse app does.
 */
function fuseView(now = Date.now()) {
  const todayKey = dayKey(now, tz), yKey = dayKey(startOfDay(now, tz, -1), tz);
  // Only this property's figures: another Fuse account's, kept from before, are ignored.
  const pid = settings.fuse.premisesId;
  const days = Object.fromEntries(Object.entries(state.fuseDays || {}).filter(([, d]) => d?.pid === pid));
  const sum = (key) => ({ elec: dayTotals(days[key]?.elec), gas: dayTotals(days[key]?.gas) });
  const today = sum(todayKey), yesterday = sum(yKey);
  const known = [todayKey, yKey].filter((k) => days[k]);
  const hasGas = known.some((k) => days[k].has?.gas);
  const hasElec = !known.length || known.some((k) => days[k].has?.elec);
  // Yesterday is whole once its readings reach midnight.
  const midnight = startOfDay(now, tz);
  for (const fuel of ['elec', 'gas']) yesterday[fuel].complete = yesterday[fuel].last >= midnight;
  const hasToday = today.elec.kwh > 0 || today.gas.kwh > 0;
  const hasYesterday = yesterday.elec.hours + yesterday.gas.hours > 0;
  // Before today's first reading the chart shows the newest day Fuse has.
  const shownKey = hasToday || !hasYesterday ? todayKey : yKey;
  const shown = shownKey === todayKey ? { start: startOfDay(now, tz), end: startOfDay(now, tz, 1) } : { start: startOfDay(now, tz, -1), end: startOfDay(now, tz) };
  const newest = (fuel) => Math.max(today[fuel].last ?? 0, yesterday[fuel].last ?? 0) || null;
  const part = (t) => (t.kwh > 0 ? Math.round(t.pence) : 0);
  const signedIn = fuse.signedIn;
  return {
    today, yesterday, hasToday, shown, shownDay: days[shownKey] || null,
    newest: { elec: newest('elec'), gas: newest('gas') },
    hasGas, hasElec,
    // A fuel counts once it has usage (a meter that has only its standing charge hasn't reported yet), each
    // part to the penny first, so the total is the sum of what's shown beside it.
    parts: { elec: part(today.elec), gas: part(today.gas) },
    totalP: part(today.elec) + part(today.gas),
    signedIn, signedOut: !signedIn && !!settings.fuse.premisesId, notSetUp: !signedIn && !settings.fuse.premisesId,
    status: state.status.fuse,
  };
}

/**
 * What a tap on the Fuse card or tiles says: never nothing while what it shows is empty or stale.
 * `which` ('elec' or 'gas'): the tile tapped, which is explained when its own fuel has nothing today.
 */
function explainFuse(which, st = state.status.fuse) {
  const v = fuseView();
  if (v.notSetUp) return ui.toast(refs, "Fuse isn't connected on this panel yet: ⚙ → Electricity → type your mobile number → Send code.", 8000);
  if (v.signedOut) return ui.toast(refs, 'Fuse signed the panel out. ⚙ → Electricity → Send code to sign in again.', 8000);
  if (!st) return ui.toast(refs, 'Asking Fuse for your usage…', 4000);
  if (st.error) return explain(st);
  const missing = !v.hasToday || (which === 'elec' && !(v.today.elec.kwh > 0)) || (which === 'gas' && v.hasGas && !(v.today.gas.kwh > 0));
  if (st.stale || missing) {
    const upTo = ui.fuseNewestText(v, Date.now(), tz);
    return ui.toast(refs, `${upTo ? `Fuse's newest readings: ${upTo}. ` : 'Fuse has sent no readings yet. '}Fuse is usually about an hour behind, and gas can be a day behind; the Fuse app shows the same.`, 9000);
  }
  explain(st);
}

const FUSE_REFETCH_YESTERDAY = 2 * 3600e3; // Fuse keeps revising the hours that have just closed

async function refreshFuse() {
  const now = Date.now();
  if (!settings.fuse.premisesId) {
    const p = await fuse.premises();
    Object.assign(settings.fuse, { premisesId: p.id, premisesName: p.name });
    save();
  }
  const id = settings.fuse.premisesId;
  const todayKey = dayKey(now, tz), yKey = dayKey(startOfDay(now, tz, -1), tz);
  const days = { ...state.fuseDays };
  days[todayKey] = { at: now, pid: id, ...(await fuse.day(id, todayKey, tz)) };
  // Yesterday: if it isn't kept (or is another property's), was fetched before the day ended, or has had time to settle.
  const y = days[yKey];
  if (!y || y.pid !== id || y.at < startOfDay(now, tz) || now - y.at >= FUSE_REFETCH_YESTERDAY) {
    try { days[yKey] = { at: now, pid: id, ...(await fuse.day(id, yKey, tz)) }; } catch (e) {
      if (e instanceof FuseSignedOut) throw e;
      console.warn('[fuse] yesterday', e);
    }
  }
  state.fuseDays = Object.fromEntries(Object.entries(days).filter(([k]) => k === todayKey || k === yKey));
  const last = (fuel) => Math.max(0, ...Object.values(state.fuseDays).map((d) => dayTotals(d[fuel]).last ?? 0)) || null;
  state.fuseNewest = { pid: id, elec: last('elec'), gas: last('gas') };
}

/** When Fuse's newest electricity reading ends (to turn the dot amber when readings stop, or never came). */
const fuseDataAt = () => state.fuseNewest?.elec || 0;

const LIVE_FRESH = 15 * 60e3; // a Glow display reading older than this means the display has stopped

/** Find the meter in the Bright account (once a day, or when the email changes), and whether a Glow display gives live usage. */
async function ensureBrightFound() {
  const d = settings.bright.discovered;
  // Lookups from before the account was noted belong to whichever account is set up now.
  const mine = !!d && (d.user ?? settings.bright.username) === settings.bright.username;
  // Daily; after a failed lookup (the saved meter still in use), hourly rather than at every refresh.
  if (mine && d.user && (Date.now() - d.at < 24 * 3600e3 || Date.now() - (d.lookupFailedAt || 0) < 3600e3)) return d;
  let found;
  try {
    found = await bright.discover();
  } catch (e) {
    // Keep reading the meter already found; a wrong password still shows, as readings fail too.
    if (!mine) throw e;
    console.warn('[bright] account lookup failed; using the meter already found', e);
    d.lookupFailedAt = Date.now();
    save();
    return d;
  }
  settings.bright.discovered = found;
  save();
  if (found.live) setTimeout(() => sources.brightlive?.run(), 0); // a Glow display (perhaps new, or another account's)
  return found;
}

// When the panel last asked Bright to catch up, kept across reloads (Hildebrand asks for at most every half hour).
const CATCHUP_KEY = 'wallpanel.bright.catchup';
let olderLook = null; // { for, at, until, slots }: the last look further back, when Bright is behind
const catchupAt = () => { try { return Number(localStorage.getItem(CATCHUP_KEY)) || 0; } catch { return 0; } };

async function refreshBright() {
  const d = await ensureBrightFound();
  const now = Date.now();
  // Ask Bright to fetch the newest half hours from the meter; the readings arrive a few minutes
  // later, at the next refresh.
  if (now - catchupAt() >= 30 * 60e3) {
    try { localStorage.setItem(CATCHUP_KEY, String(now)); } catch { /* fine */ }
    try { await bright.catchup(d.consumption); } catch (e) { console.warn('[bright] catch-up', e); }
  }
  const yStart = startOfDay(now, tz, -1);
  const recent = await bright.readings(d.consumption, yStart, now);
  let slots = recent;
  if (!recent.some((x) => x.kwh != null)) {
    // Nothing for yesterday or today (Bright can be a day or more behind): look back over the
    // week before for its newest readings, at most once an hour.
    if (olderLook?.for !== d.consumption || olderLook.until !== yStart || now - olderLook.at >= 3600e3) {
      olderLook = { for: d.consumption, at: now, until: yStart, slots: await bright.readings(d.consumption, startOfDay(now, tz, -9), yStart) };
    }
    slots = [...olderLook.slots, ...recent];
  }
  state.brightSlots = slots;
  const newest = [...slots].reverse().find((x) => x.kwh != null);
  state.brightNewest = newest || null; // for the ⚙ checklist
  // No live usage: look again every few hours, for a new Glow display or one that was off at the daily lookup.
  if (!d.live && now - (d.liveCheckedAt || d.at) >= 3 * 3600e3) {
    d.liveCheckedAt = now;
    try {
      const c = await bright.current(d.consumption);
      if (c && now - c.at < LIVE_FRESH) { d.live = true; setTimeout(() => sources.brightlive?.run(), 0); }
    } catch { /* still no Glow display */ }
    save();
  }
  if (!slots.some((x) => x.kwh != null)) {
    throw new Error("Bright hasn't sent any readings for over a week. Open the Bright app: if it has nothing recent either, it may ask you to confirm access to your meter again. If it does, press Connect in ⚙ → Electricity.");
  }
}

async function refreshBrightLive() {
  const c = await bright.current(settings.bright.discovered.consumption);
  if (!c) throw new Error('The Glow display sent no live reading. Check it\'s on and connected.');
  state.brightLive = c;
  // A display that has stopped: an error, so the panel slows down and says so (and the daily
  // lookup turns live usage off if it stays that way).
  if (Date.now() - c.at >= LIVE_FRESH) throw new Error(`The Glow display's newest reading is from ${hhmm(c.at, tz)}. Check it's on and connected.`);
  state.brightDemand.push({ t: c.at, w: c.w });
  state.brightDemand = state.brightDemand.filter((p) => p.t > Date.now() - 2 * 3600e3);
}

/** When Bright's newest reading ends (to turn the dot amber when readings stop coming, or never came). */
const brightDataAt = () => {
  const last = [...state.brightSlots].reverse().find((x) => x.kwh != null);
  return last ? last.end : 0;
};

// ---------- Average prices (the small button on the price card) ----------
let statsLoad = { loading: false, error: '', usageError: '', day: '' };
const livePrices = () => ({ rates: state.rates, tariff: state.ratesTariff });

function renderStats() {
  if (!refs || !ui.statsIsOpen(refs)) return;
  const now = Date.now();
  const rows = octopus.tariff() ? priceStats.rows(now, livePrices(), state.tele) : null;
  ui.renderStats(refs, rows, { ...statsLoad, standingP: state.standingP, usage: octopus.canReadUsage, hasKey: octopus.hasKey }, priceOpts(), tz);
  if (rows?.some((r) => r.missing)) loadIfNewDay(now);
}

// Left open past midnight: the new "yesterday" is needed (once a day; after an error, reopen to retry).
function loadIfNewDay(now) {
  if (!statsLoad.loading && statsLoad.day !== dayKey(now, tz)) loadStats();
}

// ---------- When you use electricity (the clock button on the price card) ----------
const USAGE_PERIOD = 'wallpanel.usage.period'; // the period last shown, on this device
let usagePeriod = (() => {
  try { const v = localStorage.getItem(USAGE_PERIOD); return ui.USAGE_PERIODS.some(([id]) => id === v) ? v : 'today'; } catch { return 'today'; }
})();
let usageHour = -1; // the bar tapped
const USAGE_VIEW = 'wallpanel.usage.view'; // chart or table, on this device
let usageView = (() => { try { return localStorage.getItem(USAGE_VIEW) === 'table' ? 'table' : 'chart'; } catch { return 'chart'; } })();

function renderUsage() {
  if (!refs || !ui.usageIsOpen(refs)) return;
  const now = Date.now();
  const data = octopus.tariff() ? priceStats.usageByHour(now, livePrices(), state.tele, usagePeriod) : null;
  ui.renderUsage(refs, data, { ...statsLoad, period: usagePeriod, view: usageView, selected: usageHour, hasKey: octopus.hasKey }, priceOpts(), tz);
  if (data?.missing) loadIfNewDay(now);
}

function openUsage() {
  closeMusic();
  closeStats();
  ui.openUsage(refs);
  usageHour = -1;
  statsLoad = { loading: false, error: '', usageError: '', day: '' };
  if (octopus.tariff() || octopus.hasKey) loadStats();
  else renderUsage();
}

function closeUsage() { ui.closeUsage(refs); }

function setUsagePeriod(id) {
  usagePeriod = id;
  usageHour = -1;
  try { localStorage.setItem(USAGE_PERIOD, id); } catch { /* fine: it just starts on Today */ }
  renderUsage();
}

function setUsageView(view) {
  usageView = view;
  try { localStorage.setItem(USAGE_VIEW, view); } catch { /* fine: it just starts as a chart */ }
  renderUsage();
}

function tapUsageHour(hr) {
  usageHour = usageHour === hr ? -1 : hr;
  renderUsage();
}

function pickUsageHour(hr) {
  if (hr === usageHour) return;
  usageHour = hr;
  renderUsage();
}

/** The first time, the year's prices and usage come from Octopus (a few seconds); after that, very little. */
async function loadStats() {
  statsLoad = { ...statsLoad, loading: true, error: '', usageError: '', day: dayKey(Date.now(), tz) };
  renderStats();
  renderUsage();
  try {
    try {
      await ensureDiscovered({ history: true });
    } catch (e) {
      // Without the account's tariff history, past days could be priced with the wrong tariff.
      if (octopus.hasKey && !settings.octopus.discovered?.history) throw e;
    }
    if (octopus.tariff()) await priceStats.ensure(Date.now(), livePrices());
  } catch (e) {
    if (e?.what === 'usage') statsLoad.usageError = describeError(e);
    else statsLoad.error = describeError(e);
    console.warn('[stats]', e);
  }
  statsLoad.loading = false;
  renderStats();
  renderUsage();
}

function openStats() {
  closeMusic();
  closeUsage();
  ui.openStats(refs);
  statsLoad = { loading: false, error: '', usageError: '', day: '' };
  if (octopus.tariff() || octopus.hasKey) loadStats();
  else renderStats();
}

function closeStats() { ui.closeStats(refs); }

// ---------- Data sources ----------
const sources = {};

/**
 * Run `fn` now and then every `interval()` ms. Failures back off (30 s → 15 min). A source
 * turns stale (amber) once its data is older than `staleAfter`; `dataAt()` says how old the
 * data itself is when that differs from the last successful call (e.g. a Home Mini that has
 * stopped reporting still answers). `clear()` forgets cached data when the source is switched off.
 */
function source(name, fn, interval, { staleAfter, dataAt, clear, enabled = () => true, render = renderAll, rateLimitFailures = 4 } = {}) {
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
      if (rateLimited) failures = Math.max(failures, rateLimitFailures);
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
/**
 * Look up tariff, meter and Home Mini from the account (once a day). Shared by both sources.
 * `history`: also needs the tariff history (the average prices), which older lookups lack.
 */
async function ensureDiscovered({ history = false } = {}) {
  if (!(settings.octopus.apiKey && settings.octopus.account)) return;
  const d = settings.octopus.discovered;
  if (d && Date.now() - d.at < 24 * 3600e3 && (!history || d.history)) return;
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
  const tariff = octopus.tariff();
  state.rates = await octopus.rates(Date.now(), tz);
  state.ratesTariff = tariff;
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
  const prev = state.tele;
  const tele = await octopus.telemetryToday(Date.now(), tz);
  // A day just ended: keep its half hours for the average prices until the meter's own arrive.
  if (prev?.slots?.length) priceStats.keepReadings(prev.slots, Date.now());
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
/**
 * Live view. A tap on the camera button opens it (a tap on the picture toggles full screen /
 * corner). A doorbell press opens that doorbell full screen, with `ring`.
 */
async function openCamera({ device, ring = false } = {}) {
  const cam = device || settings.google.cameraId;
  if (live && live.state !== 'ended') {
    if (!ring) { live.expanded = !live.expanded; ui.renderCamera(refs, settings, state, live); return; }
    // Pressed again while it's showing: no new stream (Google allows few commands a minute).
    if (live.device === cam) { Object.assign(live, { ring: true, ringAt: Date.now(), expanded: true }); ui.renderCamera(refs, settings, state, live); return; }
    await closeCamera();
  }
  if (!cam) { ui.toast(refs, 'Set up the Nest camera in Settings'); return; }
  // Each tap gets its own session object; callbacks from an older stream can't touch a newer one.
  const mine = { state: 'connecting', expanded: true, endsAt: 0, device: cam, ring, ringAt: ring ? Date.now() : 0,
    name: cam === settings.google.cameraId ? null : 'Doorbell' };
  live = mine;
  const stream = new LiveStream(nest, cam, {
    battery: cam === settings.google.cameraId ? settings.panel.cameraBattery : true,
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
      if (mine.ring) ui.toast(refs, `Someone's at the door (the live view didn't start: ${describeError(e)})`, 30e3);
      else ui.toast(refs, `Camera: ${describeError(e)}`);
      if (live === mine) live = null;
    }
  }
  ui.renderCamera(refs, settings, state, live);
}

async function closeCamera() {
  const s = live?.stream;
  const wasRing = !!live?.ring;
  live = null;
  if (wasRing) resumeMusicAfterRing();
  ui.renderCamera(refs, settings, state, live);
  updateNight();
  await s?.stop();
}

// ---------- Doorbell ----------
const RING_CLOSE_MS = 120e3; // an unanswered ring closes itself after 2 minutes without a touch
const chime = SUB_RE.test(settings.google.doorbellSub.trim()) ? new Chime() : null;
let doorbell = null;

/** Someone pressed the doorbell: its live view over everything, a chime, and the screen lit. */
let musicPausedByRing = false;
function ring({ device } = {}) {
  closeMusic();
  closeStats();
  closeUsage();
  // Music would drown the chime: pause Spotify, and carry on when the doorbell view closes.
  if (spotifyReady() && state.music?.playing && !musicPausedByRing) {
    musicPausedByRing = true;
    spotify.pause().then(() => { if (state.music) state.music.playing = false; renderMusic(); }).catch(() => { musicPausedByRing = false; });
    setTimeout(() => { if (!live?.ring) resumeMusicAfterRing(); }, RING_CLOSE_MS + 5e3); // if the view never opened
  }
  nightSnoozeUntil = Date.now() + RING_CLOSE_MS;
  openCamera({ device: device || settings.google.cameraId, ring: true });
  updateNight();
  (chime || new Chime()).ring().then((ok) => { if (!ok) ui.soundHint(refs, true); });
}

function resumeMusicAfterRing() {
  if (!musicPausedByRing) return;
  musicPausedByRing = false;
  spotify.play().then(() => sources.spotify?.run()).catch(() => {});
}

function startDoorbell() {
  const sub = settings.google.doorbellSub.trim();
  if (!sub) { state.status.doorbell = null; return; }
  if (!google.hasNest || !google.hasPubsub || !SUB_RE.test(sub)) return; // the checklist says why
  doorbell = new DoorbellListener({
    google, nest, sub, projectId: settings.google.projectId,
    onRing: ring,
    onStatus: (st) => { state.status.doorbell = st; },
  });
  if (document.visibilityState === 'visible') doorbell.start();
}

// ---------- Buttons ----------
function launch(button, hold) {
  const name = button === 'music' ? musicApp(settings) : button === 'ai' ? assistantApp(settings) : button;
  const env = settings.panel.launcher === 'auto' ? detectEnv() : settings.panel.launcher;
  // With Spotify connected, a tap on the music button opens the controls (hold opens the app).
  if (button === 'music' && !hold && spotifyReady()) { openMusic(); return; }
  // Its sign-in ended (Spotify ends them after 6 months): say so, rather than quietly change.
  if (button === 'music' && !hold && musicApp(settings) === 'spotify' && settings.spotify.clientId && spotifyEnded()) {
    ui.toast(refs, 'Spotify\'s sign-in has ended (Spotify ends them after 6 months): ⚙ → Spotify → Connect Spotify. Hold the button to open the Spotify app.', 9000);
    return;
  }
  const pkg = name === 'car' ? settings.panel.carApp : undefined;
  perform(actionFor(name, env, { hold, pkg }), window, (t) => ui.toast(refs, t));
}

// ---------- Spotify controls ----------
const spotifyReady = () => musicApp(settings) === 'spotify' && spotify.connected;
// While Spotify can't be reached, don't keep claiming a song is playing.
const renderMusic = () => {
  const m = state.music && state.status.spotify?.error && Date.now() - state.music.at > 120e3 ? { ...state.music, playing: false } : state.music;
  ui.renderMusic(refs, m, state.status.spotify, { ready: spotifyReady(), label: MUSIC_APPS[musicApp(settings)] });
};

async function refreshMusic() {
  const prev = state.music;
  const m = await spotify.player();
  // Still "playing" the same track but not moving on (a speaker that dropped off): don't keep
  // polling every few seconds for a track change that isn't coming.
  if (m && prev && m.playing && m.title === prev.title && m.progress <= prev.progress + 1000) m.stuck = true;
  state.music = m;
}

/**
 * How often to ask Spotify what's playing: often while the controls are open, at the end of each
 * track while something plays, rarely otherwise (Spotify limits how many calls an app makes).
 */
function musicInterval() {
  if (document.visibilityState !== 'visible' || (nightNow() && Date.now() - lastTouch > 90e3)) return 5 * 60e3;
  if (ui.musicIsOpen(refs)) return 4e3;
  const m = state.music;
  if (m?.playing && !m.stuck) {
    const left = m.duration ? m.duration - ui.musicPosition(m) : Infinity;
    return Math.max(3e3, Math.min(20e3, left + 1500));
  }
  return 60e3;
}

async function loadMusicDevices() {
  try {
    ui.renderMusicDevices(refs, await spotify.devices(), state.music?.device?.id);
  } catch (e) {
    ui.musicSay(refs, describeError(e), true);
  }
}

function openMusic() {
  ui.openMusic(refs);
  renderMusic();
  // Not while Spotify has asked us to wait: the pop-up shows the reason instead.
  if (Date.now() >= spotify.blockedUntil()) { sources.spotify?.run(); loadMusicDevices(); }
  else ui.musicSay(refs, 'Spotify has paused the panel\'s access for a while (too many requests). It will try again later.', true);
}

function closeMusic() { ui.closeMusic(refs); }

/** A button in the controls. The panel shows the change straight away, then checks with Spotify. */
async function musicCmd(cmd, arg) {
  if (cmd === 'app') { closeMusic(); launch('music', true); return; }
  const m = state.music;
  const now = Date.now();
  try {
    ui.musicSay(refs, '');
    if (cmd === 'toggle') {
      if (m?.playing) {
        await spotify.pause();
        Object.assign(m, { playing: false, progress: ui.musicPosition(m, now), at: now });
      } else {
        await spotify.play();
        if (m) Object.assign(m, { playing: true, progress: ui.musicPosition(m, now), at: now });
      }
    } else if (cmd === 'next') await spotify.next();
    else if (cmd === 'previous') await spotify.previous();
    else if (cmd === 'volume') {
      await spotify.volume(arg);
      if (m?.device) m.device.volume = arg;
    } else if (cmd === 'device') {
      ui.musicSay(refs, 'Moving the music…');
      await spotify.transfer(arg, true);
      ui.musicSay(refs, '');
    }
  } catch (e) {
    ui.musicSay(refs, describeError(e), true);
    if (e?.reason === 'NO_ACTIVE_DEVICE') loadMusicDevices();
  }
  renderMusic();
  // Spotify applies commands in its own time: look again shortly (not while it asked us to wait).
  setTimeout(() => { if (Date.now() < spotify.blockedUntil()) return; sources.spotify?.run(); if (cmd === 'device') loadMusicDevices(); }, 800);
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

// Sunrise and sunset where the tablet is (its own location, if known in the last 30 days),
// else at the weather location.
const PLACE_KEEP = 30 * 864e5;
const placeNow = (now = Date.now()) => (state.place && now - state.place.at < PLACE_KEEP ? state.place : null);
const sun = (now = Date.now()) => {
  const p = placeNow(now);
  return p ? sunToday(now, { lat: p.lat, lon: p.lon, tz }) : sunToday(now, { weather: state.weather, lat: settings.weather.lat, lon: settings.weather.lon, tz });
};

// ?theme=light|dark|auto overrides the setting for this page, for screenshots and tests.
const THEME_PIN = (() => {
  try { const t = new URLSearchParams(location.search).get('theme'); return ['light', 'dark', 'auto'].includes(t) ? t : null; } catch { return null; }
})();

/**
 * Where the tablet is, for the Auto theme's sunrise and sunset. Only a rounded position is kept,
 * on this tablet. The browser may ask permission, so the panel asks with care: never during the
 * automatic nightly reload, not again by itself after a refusal (⚙ → Theme has a button for
 * that), and at most daily after no answer. Refused: the saved position is forgotten, and the
 * weather location is used.
 */
const LOCATION = 'wallpanel.location.v1'; // { outcome, at }
const lastLocate = () => { try { return JSON.parse(localStorage.getItem(LOCATION) || 'null'); } catch { return null; } };
function usePlace(place) {
  state.place = place;
  persist();
  applyTheme();
}
async function refreshPlace({ asked = false } = {}) {
  let perm = null;
  try { perm = (await navigator.permissions?.query({ name: 'geolocation' }))?.state || null; } catch { /* not supported */ }
  const last = lastLocate();
  const record = (outcome) => { try { localStorage.setItem(LOCATION, JSON.stringify({ outcome, at: Date.now() })); } catch { /* storage full */ } };
  if (perm === 'denied') {
    if (state.place) { state.place = null; persist(); applyTheme(); }
    record('denied');
    return 'denied';
  }
  if (!asked && perm !== 'granted') {
    // Asking might put a prompt on screen: not while nobody's there, and not to nag.
    if (autoReloaded) return null;
    if (last?.outcome === 'denied') return 'denied';
    if (last && last.outcome !== 'ok' && Date.now() - last.at < 864e5) return last.outcome;
  }
  const r = await locate(undefined, { onLate: (p) => { usePlace(p); record('ok'); } });
  if (r.place) { usePlace(r.place); record('ok'); return 'ok'; }
  if (r.error === 'denied' && state.place) { state.place = null; persist(); applyTheme(); }
  record(r.error);
  return r.error;
}

/** Light between sunrise and sunset (or always light/dark, as set). Returns true if it changed. */
function applyTheme(now = Date.now()) {
  const theme = themeFor(THEME_PIN || settings.panel.theme, now, sun(now));
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
let autoReloaded = false; // this start is the automatic nightly reload
try { if (sessionStorage.getItem(AUTO_RELOAD)) { lastTouch = 0; autoReloaded = true; sessionStorage.removeItem(AUTO_RELOAD); } } catch { /* storage blocked */ }
let nightSnoozeUntil = 0;
function updateNight() {
  const show = nightNow() && Date.now() > nightSnoozeUntil && Date.now() - lastTouch > 90e3 && !live;
  if (show && ui.musicIsOpen(refs)) closeMusic(); // don't leave the bright pop-ups over the night screen
  if (show && ui.statsIsOpen(refs)) closeStats();
  if (show && ui.usageIsOpen(refs)) closeUsage();
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
    settings: () => openSettings(document.body, { settings, save, state, google, sun, spotify, chime, testRing: () => ring({ device: settings.google.cameraId }), place: placeNow, locateNow: () => refreshPlace({ asked: true }), locateStatus: lastLocate }),
    tile: (key) => {
      if (key === 'car' && !settings.kia.url) return launch('car', false);
      // The live reading only while the tile shows it (a stopped Glow display: the tile and its tap are Bright's).
      if ((key === 'usage' || key === 'cost') && useFuse()) { const v = fuseView(); return explainFuse(key === 'usage' ? (v.hasElec ? 'elec' : 'gas') : v.hasElec && v.hasGas ? 'gas' : undefined); }
      if (key === 'usage' && useBright()) return settings.bright.discovered?.live && state.brightLive && Date.now() - state.brightLive.at < LIVE_FRESH ? explain(state.status.brightlive) : explainBright();
      if (key === 'cost' && useBright()) return explainBright();
      if (key === 'usage') return explain(state.status.homemini, homeMiniStaleWhy());
      if (key === 'cost') return explain(ui.worst(state.status.homemini, state.status.rates), homeMiniStaleWhy());
      explain(state.status[{ indoor: 'thermostat', car: 'kia' }[key]]);
    },
    status: (key) => (key === 'rates' && useFuse() ? explainFuse() : key === 'rates' && useBright() ? explainBright() : explain(state.status[key])),
    chartTap: (hit) => (useFuse() ? ui.showFuseTip(refs, hit, tz) : useBright() ? ui.showUsageTip(refs, hit, tz) : ui.showChartTip(refs, hit, priceOpts(), tz)),
    musicCmd,
    musicClose: closeMusic,
    stats: openStats,
    statsClose: closeStats,
    usage: openUsage,
    usageClose: closeUsage,
    usagePeriod: setUsagePeriod,
    usageTap: tapUsageHour,
    usagePick: pickUsageHour,
    usageView: setUsageView,
    ringClose: closeCamera,
    shopTick: tickShopping,
    shopAdd: addShopping,
    nightTap: () => { nightSnoozeUntil = Date.now() + 5 * 60e3; updateNight(); },
  });
  document.addEventListener('pointerdown', () => { lastTouch = Date.now(); }, true);

  // Spotify's sign-in comes back to the same address as Google's; each checks its own state.
  const spotifyResult = await spotify.handleRedirect(location, sessionStorage, history, redirectUri(location));
  const result = await google.handleRedirect();
  renderAll();
  if (spotifyResult) ui.toast(refs, spotifyResult === 'connected' ? 'Spotify connected. Tap the music button for the controls.' : `Spotify: ${spotifyResult.slice(7)}`, 7000);
  if (result === 'signed-in') {
    // Google lets people untick parts of the sign-in; say which parts won't work.
    const missing = google.missingScopes();
    ui.toast(refs, missing.length
      ? `Signed in to Google, but it didn't allow ${missing.join(' or ')}. To use ${missing.length > 1 ? 'them' : 'it'}, sign in again and make sure every box is ticked (or tick Select all).`
      : 'Signed in to Google. Now choose your camera, thermostat, calendars and shopping list in Settings.', missing.length ? 15000 : 7000);
  } else if (result) {
    ui.toast(refs, `Google sign-in: ${result.slice(7)}`, 7000);
  }

  const nothingSetUp = !settings.weather.lat && !settings.octopus.tariff && !settings.octopus.apiKey && !settings.bright.username && !settings.fuse.phone && !settings.google.refreshToken;
  if (nothingSetUp || result === 'signed-in') openSettings(document.body, { settings, save, state, google, sun, spotify, chime, testRing: () => ring({ device: settings.google.cameraId }), place: placeNow, locateNow: () => refreshPlace({ asked: true }), locateStatus: lastLocate });

  const minutes = (m) => () => m * 60e3;
  // A source that's switched off (signed out, key removed…) also forgets what it showed.
  source('rates', refreshRates, minutes(15), {
    staleAfter: 3 * 3600e3, enabled: () => !useBright() && !useFuse() && !!(settings.octopus.tariff || (settings.octopus.apiKey && settings.octopus.account)),
    clear: () => { state.rates = []; state.ratesTariff = null; state.standingP = null; state.costP = null; },
  })();
  source('homemini', refreshHomeMini, () => (nightNow() ? 300e3 : Math.max(30, settings.octopus.pollSeconds) * 1000), {
    staleAfter: HOME_MINI_STALE, dataAt: homeMiniDataAt, enabled: () => !useBright() && !useFuse() && !!(settings.octopus.apiKey && settings.octopus.account),
    clear: () => { state.tele = null; state.demand = []; state.lastDemandAt = null; state.costP = null; },
  })();
  // Bright: half-hourly readings every 10 minutes (30 at night); live usage every 30 s with a Glow display.
  source('bright', refreshBright, () => (nightNow() ? 30 : 10) * 60e3, {
    staleAfter: 4 * 3600e3, dataAt: brightDataAt, enabled: () => useBright() && bright.configured,
    clear: () => { state.brightSlots = []; state.brightLive = null; },
  })();
  source('brightlive', refreshBrightLive, () => (nightNow() ? 300e3 : 30e3), {
    staleAfter: 10 * 60e3, dataAt: () => state.brightLive?.at, enabled: () => useBright() && bright.configured && !!settings.bright.discovered?.live && settings.bright.discovered.user === settings.bright.username,
    clear: () => { state.brightLive = null; state.brightDemand = []; },
  })();
  // Fuse: hourly bars for electricity and gas, every 15 minutes (30 at night). A refused session
  // isn't retried by itself: the panel waits for the user to sign in again.
  source('fuse', refreshFuse, () => (nightNow() ? 30 : 15) * 60e3, {
    staleAfter: 3 * 3600e3, dataAt: fuseDataAt, enabled: () => useFuse() && fuse.signedIn, rateLimitFailures: 6,
    clear: () => { state.fuseDays = {}; state.fuseNewest = null; },
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
  source('spotify', refreshMusic, musicInterval, { enabled: spotifyReady, clear: () => { state.music = null; }, render: renderMusic })();
  source('kia', refreshKia, minutes(15), { staleAfter: 6 * 3600e3, enabled: () => !!(settings.kia.url && settings.kia.key), clear: () => { state.kia = null; } })();
  refreshPlace();

  // Every second: clock + camera countdown. Every 30 s: price/chart (slot changes), staleness, night.
  setInterval(() => {
    const now = Date.now();
    ui.renderClock(refs, now, tz);
    ui.renderCamTimer(refs, live, now);
    // An unanswered doorbell ring closes itself (a touch keeps it open to the camera's own limit).
    if (live?.ring && now - Math.max(live.ringAt, lastTouch) > RING_CLOSE_MS) closeCamera();
    if (ui.musicIsOpen(refs)) {
      ui.renderMusicProgress(refs, state.music, now);
      // Left open with nobody using it: close after 2 minutes.
      if (now - (refs.music.touched || 0) > 120e3) closeMusic();
    }
    if (ui.statsIsOpen(refs) && now - (refs.stats.touched || 0) > 120e3) closeStats();
    if (ui.usageIsOpen(refs) && now - (refs.usage.touched || 0) > 120e3) closeUsage();
  }, 1000);
  setInterval(() => { for (const s of Object.values(sources)) s.staleCheck(); applyTheme(); renderAll(); updateNight(); }, 30e3);
  let lastW = innerWidth, lastH = innerHeight;
  addEventListener('resize', () => { if (innerWidth !== lastW || innerHeight !== lastH) { lastW = innerWidth; lastH = innerHeight; renderAll(); } });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { keepAwake(); for (const s of Object.values(sources)) s.runIfDue(); doorbell?.start(); }
    else {
      if (live) closeCamera(); // don't leave a stream running in the background
      doorbell?.stop(); // and don't take presses meant for the panel on screen
    }
  });
  startDoorbell();
  if (chime) {
    chime.onChange = (ready) => ui.soundHint(refs, !ready);
    // Only a plain Chrome tab should need a tap for sound; say so if it does.
    setTimeout(() => { if (!chime.ready) ui.soundHint(refs, true); }, 1500);
  }
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
