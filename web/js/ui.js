// Builds the panel and renders each card from the current state. All text from outside
// sources (calendar titles, place names) goes in as text nodes, never as HTML.

import { h, svg } from './util.js';
import { UI, WEATHER } from './icons.js';
import { hhmm, longDate, weekdayShort, dayMonth, ago, partsInTz, startOfDay, DEFAULT_TZ } from './time.js';
import { priceSummary, band, round1 } from './agile.js';
import { renderChart, renderHours, renderUsageDay, renderFuseChart as renderFuseChart_ } from './chart.js';
import { groupDays } from './calendar.js';
import { describe } from './weather.js';
import { MUSIC_APPS, musicApp, ASSISTANTS, assistantApp } from './launcher.js';

const icon = (name, set = UI) => svg(set[name] || UI.camera);

/** Words for the price bands: colour is never the only cue. */
export const BAND_WORD = { plunge: 'Plunge', cheap: 'Cheap', mid: 'Normal', high: 'Peak' };

/** Part of the day, for the Ambient style's faint background tint. */
export function timeOfDay(hour) {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'dusk';
  return 'night';
}

const DOCK = [
  { id: 'music', label: 'Spotify', icon: 'music' }, // Spotify or Amazon Music: see renderDock
  { id: 'ai', label: 'Claude', icon: 'spark' }, // Claude or Gemini: see renderDock
  { id: 'assistant', label: 'Assistant', icon: 'mic' }, // the tablet's own voice assistant
  { id: 'home', label: 'Home', icon: 'home' },
];

/**
 * Tap vs press-and-hold (550 ms) on an element. The tap acts on the click, after the finger has
 * lifted: acting on pointerup would let the same touch's click land on whatever the tap opened
 * (a pop-up's backdrop would close it again at once).
 */
function pressable(el, onTap, onHold) {
  let timer = null, held = false;
  el.addEventListener('pointerdown', () => {
    held = false;
    timer = setTimeout(() => { held = true; onHold?.(); }, 550);
  });
  const cancel = () => clearTimeout(timer);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerup', cancel);
  el.addEventListener('click', () => { if (!held) onTap?.(); held = false; });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function buildPanel(root, on) {
  const r = {};
  const dot = () => h('span', { class: 'dot' });

  r.video = h('video', { playsinline: true, autoplay: true, class: 'hidden' });
  // The muted *attribute* doesn't mute a stream set later; the property does. Muted video may
  // autoplay without a fresh tap (a sleeping camera can take a while), and the panel stays quiet.
  r.video.muted = true;
  r.video.defaultMuted = true;
  r.camName = h('div', { class: 'cam-name' });
  r.camHint = h('div', { class: 'cam-hint' }, icon('play'), h('span', {}, 'Tap for live view'));
  r.camSub = h('div', { class: 'muted' });
  r.camIdle = h('div', { class: 'cam-idle' }, h('div', { class: 'ico' }, icon('camera')), r.camName, r.camSub, r.camHint);
  r.camTimer = h('span');
  r.camBarName = h('span');
  r.camClose = h('button', { class: 'close', 'aria-label': 'Close live view' }, icon('close'));
  r.camBar = h('div', { class: 'cam-bar hidden' }, h('span', { class: 'live-badge' }, 'LIVE'), r.camBarName, h('span', { class: 'spacer' }), r.camTimer, r.camClose);
  // A doorbell press: a big line across the top of the live view.
  r.camRing = h('div', { class: 'ring-banner hidden', role: 'alert', 'aria-live': 'assertive' });
  r.cam = h('section', { class: 'card cam', id: 'cam' }, r.video, r.camIdle, r.camBar, r.camRing, (r.camDot = dot()));
  r.cam.addEventListener('click', (e) => { if (!r.camClose.contains(e.target)) on.camera?.(); });
  r.camClose.addEventListener('click', (e) => { e.stopPropagation(); on.cameraClose?.(); });

  r.time = h('div', { class: 'time' });
  r.date = h('div', { class: 'date' });
  r.wxNow = h('div', { class: 'wx-now' });
  r.wxDays = h('div', { class: 'wx-days' });
  const gear = h('button', { class: 'gear', 'aria-label': 'Settings' }, icon('gear'));
  gear.addEventListener('click', () => on.settings?.());
  r.clock = h('section', { class: 'card clock', id: 'clock' }, r.time, r.date, r.wxNow, r.wxDays, gear, (r.wxDot = dot()));

  r.calBody = h('div', { class: 'cal-body' });
  r.cal = h('section', { class: 'card cal', id: 'cal' }, r.calBody, (r.calDot = dot()));

  r.chartBox = h('div', { class: 'chart-box' });
  r.chartTip = h('div', { class: 'chart-tip hidden', role: 'status' });
  r.chartBox.addEventListener('click', (e) => {
    const hit = e.target.closest?.('.ch-hit');
    if (!hit) return;
    e.stopPropagation(); // a bar tap isn't a tap on the card (which explains a red dot)
    on.chartTap?.(hit);
  });
  r.legend = h('div', { class: 'legend' });
  r.chartLabel = h('div', { class: 'label' }, 'Agile price ', h('span', { class: 'unit' }, 'p/kWh'));
  // Fuse's chart: D (the day by the hour), M (the month by the day), Y (the year by the month), and stacked. Only shown in Fuse mode.
  const names = { D: 'The day, by the hour', M: 'This month, by the day', Y: 'This year, by the month' };
  r.fuseViews = Object.keys(names).map((k) => {
    const b = h('button', { class: 'fz-seg', type: 'button', 'data-view': k, 'aria-label': names[k], 'aria-pressed': 'false' }, k);
    b.addEventListener('click', (e) => { e.stopPropagation(); on.fuseView?.(k); });
    return b;
  });
  r.fuseStack = h('button', { class: 'fz-stack hidden', type: 'button', 'aria-pressed': 'false' }, 'Stacked');
  r.fuseStack.addEventListener('click', (e) => { e.stopPropagation(); on.fuseStyle?.(); });
  r.fuseCtl = h('div', { class: 'fuse-ctl hidden' }, h('div', { class: 'fz-segs', role: 'group', 'aria-label': 'Chart range' }, ...r.fuseViews), r.fuseStack);
  r.chart = h('section', { class: 'card chart', id: 'chart' },
    h('div', { class: 'chart-head' }, r.chartLabel, r.legend, r.fuseCtl),
    r.chartBox, r.chartTip, (r.chartDot = dot()));

  r.priceBig = h('div', { class: 'big' });
  r.priceBand = h('span', { class: 'band-chip hidden' });
  r.priceSub = h('div', { class: 'sub' });
  // Small buttons in the corner: when you use electricity, and the average prices.
  r.usageBtn = h('button', { class: 'usage-btn', 'aria-label': 'When you use electricity' }, icon('clock'));
  r.usageBtn.addEventListener('click', () => on.usage?.());
  r.statsBtn = h('button', { class: 'stats-btn', 'aria-label': 'Average prices' }, icon('stats'));
  r.statsBtn.addEventListener('click', () => on.stats?.());
  r.priceLabel = h('div', { class: 'label' }, 'Agile price now');
  // Fuse: which fuel the headline (and chart) is for.
  const fuelNames = { both: 'Both', elec: 'Electric', gas: 'Gas' };
  r.fuelViews = Object.keys(fuelNames).map((k) => {
    const b = h('button', { class: 'fz-seg', type: 'button', 'data-fuel': k, 'aria-pressed': 'false' }, fuelNames[k]);
    b.addEventListener('click', (e) => { e.stopPropagation(); on.fuseFuel?.(k); });
    return b;
  });
  r.fuelCtl = h('div', { class: 'fz-segs fuel-ctl hidden', role: 'group', 'aria-label': 'Which fuel' }, ...r.fuelViews);
  r.price = h('section', { class: 'card price', id: 'price' }, h('div', { class: 'price-head' }, r.priceLabel, r.fuelCtl),
    h('div', { class: 'price-main' }, r.priceBig, r.priceBand), r.priceSub, r.usageBtn, r.statsBtn, (r.priceDot = dot()));

  const tile = (cls, ico, label) => {
    const t = { value: h('div', { class: 't-value' }), label: h('div', { class: 't-label' }, label), extra: h('div', { class: 'extra' }), dot: dot() };
    t.el = h('button', { class: `card tile ${cls}` }, h('div', { class: 'ico' }, icon(ico)), t.label, t.value, t.extra, t.dot);
    return t;
  };
  r.tUsage = tile('usage', 'bolt', 'Using now');
  r.tCar = tile('car', 'car', 'Car');
  r.tCost = tile('cost', 'pound', 'Today so far');
  r.tIndoor = tile('indoor', 'thermo', 'Indoor');
  r.tiles = h('div', { class: 'tiles', id: 'tiles' }, r.tUsage.el, r.tCost.el, r.tCar.el, r.tIndoor.el); // the two usage tiles (electricity, gas) side by side
  for (const [key, t] of Object.entries({ usage: r.tUsage, car: r.tCar, cost: r.tCost, indoor: r.tIndoor })) {
    t.el.addEventListener('click', () => on.tile?.(key));
  }

  // Shopping list (Google Tasks): tap an item to tick it off, + to add one.
  r.shopList = h('ul', { class: 'shop-items' });
  r.shopInput = h('input', { type: 'text', placeholder: 'Add items, separated by commas', enterkeyhint: 'done', autocomplete: 'off', maxlength: '1000' });
  r.shopForm = h('form', { class: 'shop-add hidden' }, r.shopInput, h('button', { type: 'submit', class: 'shop-go' }, 'Add'));
  r.shopForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = r.shopInput.value.trim();
    if (text) on.shopAdd?.(text);
    r.shopInput.value = '';
    r.shopForm.classList.add('hidden');
    r.shopInput.blur();
    fitList(r.shopList);
  });
  const plus = h('button', { class: 'shop-plus', 'aria-label': 'Add to the shopping list' }, icon('plus'));
  plus.addEventListener('click', () => {
    r.shopForm.classList.toggle('hidden');
    if (!r.shopForm.classList.contains('hidden')) r.shopInput.focus();
    fitList(r.shopList); // the form takes room from the list
  });
  r.shopList.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (li) on.shopTick?.(li.dataset.id, li.dataset.title);
  });
  r.shop = h('section', { class: 'card shop', id: 'shop' },
    h('div', { class: 'shop-head' }, h('h3', {}, 'Shopping'), plus), r.shopForm, r.shopList, (r.shopDot = dot()));

  // The camera sits in the dock as the first button; its live view still fills the screen.
  r.dock = h('nav', { class: 'dock', id: 'dock' }, r.cam);
  r.dockBtn = {};
  for (const b of DOCK) {
    // The music button can also show what's playing: artwork, title and artist.
    const btn = b.id === 'music'
      ? h('button', { class: `b-${b.id}`, 'data-app': b.id }, h('span', { class: 'd-ico' }, icon(b.icon), h('img', { class: 'np-art', alt: '' })),
        h('span', { class: 'd-text' }, h('span', { class: 'd-label' }, b.label), h('span', { class: 'd-sub' })))
      : h('button', { class: `b-${b.id}`, 'data-app': b.id }, h('span', { class: 'd-ico' }, icon(b.icon)), h('span', { class: 'd-label' }, b.label));
    r.dockBtn[b.id] = btn;
    pressable(btn, () => on.launch?.(b.id, false), () => on.launch?.(b.id, true));
    r.dock.append(btn);
  }

  for (const [el, key] of [[r.clock, 'weather'], [r.cal, 'calendar'], [r.chart, 'rates'], [r.price, 'rates'], [r.shop, 'shopping']]) {
    el.addEventListener('click', (e) => { if (!e.target.closest('button, li[data-id], form')) on.status?.(key); });
  }

  // Two columns for the Bold style; the Ambient style lays the main column's cards out on
  // its own grid (its stylesheet makes that wrapper transparent with display: contents).
  r.panel = h('main', { class: 'panel' },
    h('div', { class: 'col-main' }, r.clock, r.price, r.chart, r.tiles),
    h('div', { class: 'col-side' }, r.cal, r.shop),
    r.dock);
  r.nightTime = h('div');
  r.night = h('div', { class: 'night hidden', id: 'night' }, r.nightTime);
  r.night.addEventListener('click', () => on.nightTap?.());
  r.toast = h('div', { class: 'toast hidden', role: 'status' });
  r.soundHint = h('div', { class: 'sound-hint hidden', role: 'status' }, icon('volume'), h('span', {}, 'Tap once to turn on the doorbell sound'));
  r.music = buildMusic(on);
  r.stats = buildStats(on);
  r.usage = buildUsage(on);
  root.replaceChildren(r.panel, r.music.sheet, r.stats.sheet, r.usage.sheet, r.night, r.toast, r.soundHint);
  return r;
}

/** The Spotify controls: a pop-up over the panel, opened from the music button. */
function buildMusic(on) {
  const m = {};
  const cmd = (name, arg) => { m.touched = Date.now(); on.musicCmd?.(name, arg); };
  m.img = h('img', { alt: '' });
  m.art = h('div', { class: 'ms-art' }, icon('music'), m.img);
  m.title = h('div', { class: 'ms-title' });
  m.artist = h('div', { class: 'ms-artist' });
  m.device = h('div', { class: 'ms-device' });
  m.bar = h('span');
  m.pos = h('span', { class: 'ms-time' });
  m.dur = h('span', { class: 'ms-time' });
  const btn = (cls, ico, label, fn) => {
    const b = h('button', { class: cls, 'aria-label': label }, icon(ico));
    b.addEventListener('click', fn);
    return b;
  };
  m.play = btn('ms-play', 'play', 'Play', () => cmd('toggle'));
  m.prev = btn('ms-prev', 'prev', 'Previous', () => cmd('previous'));
  m.next = btn('ms-next', 'next', 'Next', () => cmd('next'));
  m.vol = h('input', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': 'Volume' });
  let volTimer = null;
  m.vol.addEventListener('input', () => {
    m.touched = Date.now();
    clearTimeout(volTimer);
    volTimer = setTimeout(() => cmd('volume', Number(m.vol.value)), 250);
  });
  m.volRow = h('label', { class: 'ms-vol' }, icon('volume'), m.vol);
  m.msg = h('div', { class: 'ms-msg', role: 'status' });
  m.devices = h('div', { class: 'ms-devices' });
  m.devices.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (b) cmd('device', b.dataset.id);
  });
  const close = btn('ms-close', 'close', 'Close', () => on.musicClose?.());
  const app = h('button', { class: 'ms-app' }, icon('music'), h('span', {}, 'Open Spotify'));
  app.addEventListener('click', () => cmd('app'));
  m.card = h('div', { class: 'ms-card' }, close,
    h('div', { class: 'ms-main' }, m.art,
      h('div', { class: 'ms-info' }, m.title, m.artist, m.device,
        h('div', { class: 'ms-progress' }, m.pos, h('div', { class: 'ms-bar' }, m.bar), m.dur),
        h('div', { class: 'ms-controls' }, m.prev, m.play, m.next), m.volRow)),
    m.msg,
    h('div', { class: 'ms-devices-head' }, h('span', {}, 'Play on'), app),
    m.devices);
  m.sheet = h('div', { class: 'music-sheet hidden', id: 'music', role: 'dialog', 'aria-label': 'Spotify' }, m.card);
  // A tap outside the card closes it: only a tap that started there (not the end of the tap
  // that opened it).
  m.sheet.addEventListener('pointerdown', (e) => { m.downOutside = e.target === m.sheet; });
  m.sheet.addEventListener('click', (e) => { if (e.target === m.sheet && m.downOutside) on.musicClose?.(); m.downOutside = false; });
  m.card.addEventListener('pointerdown', () => { m.touched = Date.now(); });
  return m;
}

export const musicIsOpen = (r) => !r.music.sheet.classList.contains('hidden');

export function openMusic(r) {
  r.music.sheet.classList.remove('hidden');
  r.music.touched = Date.now();
  r.music.msg.textContent = '';
}

export function closeMusic(r) { r.music.sheet.classList.add('hidden'); }

/** A line in the pop-up: what went wrong, or what's happening. `fromStatus`: it came from a poll. */
export function musicSay(r, text, bad = false, fromStatus = false) {
  r.music.msg.textContent = text || '';
  r.music.msg.classList.toggle('bad', !!bad);
  r.music.msg.dataset.src = fromStatus ? 'status' : '';
}

const safeImg = (url) => (/^https:\/\/[\w.-]+\.(scdn\.co|spotifycdn\.com)\//.test(url || '') ? url : '');
const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** How far into the track we are now, moving on from the last reading while it plays. */
export function musicPosition(m, now = Date.now()) {
  if (!m) return 0;
  const p = m.playing ? m.progress + (now - m.at) : m.progress;
  return m.duration ? Math.min(m.duration, Math.max(0, p)) : Math.max(0, p);
}

/**
 * The music button (what's playing) and the pop-up. `m` is the player state (null = nothing
 * loaded); `ready` = Spotify is chosen and connected.
 */
export function renderMusic(r, m, st, { ready, label = 'Spotify' } = {}) {
  const btn = r.dockBtn.music;
  const np = !!(ready && m?.title);
  btn.classList.toggle('np', np);
  btn.classList.toggle('playing', np && m.playing);
  btn.querySelector('.d-label').textContent = np ? m.title : label;
  btn.querySelector('.d-sub').textContent = np ? m.artist : '';
  const art = safeImg(np ? m.art : '');
  const img = btn.querySelector('.np-art');
  if (img.getAttribute('src') !== art) { if (art) img.setAttribute('src', art); else img.removeAttribute('src'); }
  btn.classList.toggle('has-art', !!art);
  if (!ready) return;

  const M = r.music;
  // Nothing playing anywhere: Play/Next would only fail, so the speakers are the thing to tap.
  M.sheet.classList.toggle('idle', !m);
  for (const el of [M.play.parentElement, M.pos.parentElement]) el.classList.toggle('hidden', !m);
  M.title.textContent = m?.title || 'Nothing playing';
  M.artist.textContent = m?.artist || (m ? '' : 'Choose where to play below, or open Spotify');
  M.device.replaceChildren(...(m?.device ? [icon('speaker'), h('span', {}, `${m.playing ? 'Playing on' : 'On'} ${m.device.name}`)] : []));
  const big = safeImg(m?.art);
  if (M.img.getAttribute('src') !== big) { if (big) M.img.setAttribute('src', big); else M.img.removeAttribute('src'); }
  M.art.classList.toggle('has-art', !!big);
  M.play.replaceChildren(icon(m?.playing ? 'pause' : 'play'));
  M.play.setAttribute('aria-label', m?.playing ? 'Pause' : 'Play');
  const vol = m?.device?.supportsVolume && !m.device.restricted;
  M.volRow.classList.toggle('hidden', !vol);
  // Don't move the slider under a finger that's using it.
  if (vol && document.activeElement !== M.vol && Date.now() - (M.touched || 0) > 1500) M.vol.value = String(m.device.volume ?? 50);
  for (const b of [M.play, M.prev, M.next]) b.disabled = !!m?.device?.restricted;
  if (st?.error && !M.msg.textContent) musicSay(r, st.error, true, true);
  else if (st?.ok && M.msg.dataset.src === 'status') musicSay(r, ''); // it recovered
  renderMusicProgress(r, m);
}

export function renderMusicProgress(r, m, now = Date.now()) {
  const M = r.music;
  const pos = musicPosition(m, now);
  M.pos.textContent = m?.duration ? mmss(pos) : '';
  M.dur.textContent = m?.duration ? mmss(m.duration) : '';
  M.bar.style.width = m?.duration ? `${(pos / m.duration) * 100}%` : '0%';
}

/** Where Spotify can play: the speakers, phones and apps it can see right now. */
export function renderMusicDevices(r, devices, activeId) {
  const M = r.music;
  M.devices.replaceChildren(...devices.map((d) => {
    const b = h('button', { class: `ms-dev${d.id === activeId || d.active ? ' on' : ''}`, 'data-id': d.id, disabled: d.restricted }, icon('speaker'), h('span', {}, d.name));
    return b;
  }), devices.length ? '' : h('div', { class: 'ms-none' }, 'No speakers or apps are showing. Open Spotify on the tablet (or cast from a phone) and they\'ll appear here.'));
}

/** Average prices: a pop-up from the small button on the price card. */
function buildStats(on) {
  const st = {};
  st.rows = h('div', { class: 'st-rows' });
  st.msg = h('div', { class: 'st-msg', role: 'status' });
  st.standing = h('span');
  const close = h('button', { class: 'st-close', 'aria-label': 'Close' }, icon('close'));
  close.addEventListener('click', () => on.statsClose?.());
  st.card = h('div', { class: 'st-card' }, close,
    h('h2', {}, 'Average price'),
    h('div', { class: 'st-sub' }, 'Per kWh, including VAT'),
    st.rows, st.msg,
    h('p', { class: 'st-note' },
      h('b', {}, 'You paid'), ': what the electricity you used cost ÷ the kWh, so the times you used more count for more. ',
      h('b', {}, 'Agile price'), ': the plain average, every half hour counting the same. ', st.standing));
  st.sheet = h('div', { class: 'stats-sheet hidden', id: 'stats', role: 'dialog', 'aria-label': 'Average price' }, st.card);
  // As with the music pop-up: a tap that started outside the card closes it.
  st.sheet.addEventListener('pointerdown', (e) => { st.downOutside = e.target === st.sheet; });
  st.sheet.addEventListener('click', (e) => { if (e.target === st.sheet && st.downOutside) on.statsClose?.(); st.downOutside = false; });
  st.card.addEventListener('pointerdown', () => { st.touched = Date.now(); });
  return st;
}

export const statsIsOpen = (r) => !r.stats.sheet.classList.contains('hidden');

export function openStats(r) {
  r.stats.sheet.classList.remove('hidden');
  r.stats.touched = Date.now();
}

export function closeStats(r) { r.stats.sheet.classList.add('hidden'); }

const STAT_LABEL = { min30: 'Last 30 minutes', hour: 'Last hour', today: 'Today', week: 'This week', month: 'This month', year: 'This year' };

/** What each row covers: "since 13:42", "since Monday", "since 1 October"… */
function statSince(row, tz) {
  if (row.firstAt) return `prices from ${dayMonth(row.firstAt, tz)}`;
  if (row.id === 'min30' || row.id === 'hour') return `since ${hhmm(row.from, tz)}`;
  if (row.id === 'today') return 'since midnight';
  if (row.id === 'week') return 'since Monday';
  return `since ${dayMonth(row.from, tz)}`;
}

const fmtKwh = (k) => (k < 10 ? k.toFixed(1) : Math.round(k).toLocaleString('en-GB'));

/**
 * The average prices. `rows` from PriceStats.rows (null: no tariff yet). `st`: { loading (older
 * days still coming), error, usageError, standingP, usage (usage readable), hasKey }.
 */
export function renderStats(r, rows, st = {}, opts = {}, tz = DEFAULT_TZ) {
  const S = r.stats;
  S.standing.textContent = Number.isFinite(st.standingP) ? `Neither includes the standing charge (${round1(st.standingP).toFixed(1)}p a day).` : 'Neither includes the standing charge.';
  const say = (...lines) => S.msg.replaceChildren(...lines.filter(Boolean).map(([text, bad]) => h('div', { class: bad ? 'bad' : '' }, text)));
  if (!rows) {
    S.rows.replaceChildren(h('div', { class: 'st-empty' },
      st.loading ? 'Looking up your tariff…' : st.error ? '' : 'Add your Octopus details in Settings to see average prices.'));
    say(st.error && [`Couldn't look up your tariff: ${st.error}`, true]);
    return;
  }
  const pending = (row) => row.missing && st.loading;
  const pence = (p) => [`${round1(p).toFixed(1)}`, h('small', {}, 'p')];
  S.rows.replaceChildren(
    h('div', { class: 'st-head' }, h('span'), h('span', {}, 'You paid'), h('span', {}, 'Agile price')),
    ...rows.map((row) => {
      // Why there's no "You paid" figure, when there are prices.
      const why = row.paid == null && st.usage && row.avg != null ? (row.usageShort ? ' · readings not in yet' : ' · too few readings') : '';
      const since = pending(row) ? 'loading…' : `${statSince(row, tz)}${row.kwh != null && row.paid != null ? ` · ${fmtKwh(row.kwh)} kWh` : why}`;
      return h('div', { class: 'st-row', 'data-id': row.id },
        h('div', { class: 'st-what' }, h('div', { class: 'st-label' }, STAT_LABEL[row.id] || row.id), h('div', { class: 'st-since' }, since)),
        row.paid != null ? h('div', { class: 'st-paid' }, bandDot(row.paid, opts), ...pence(row.paid)) : h('div', { class: 'st-paid none' }, pending(row) ? '…' : '–'),
        h('div', { class: `st-avg${row.avg == null ? ' none' : ''}` }, ...(row.avg != null ? pence(row.avg) : [pending(row) ? '…' : '–'])));
    }));
  const year = rows[rows.length - 1];
  const loadingOld = st.loading && rows.some((x) => x.missing);
  say(
    st.error && [`Couldn't get the older prices from Octopus: ${st.error}`, true],
    st.usageError && [`Couldn't get your usage from Octopus (“You paid” needs it): ${st.usageError}`, true],
    loadingOld && ['Getting this year\'s prices and usage from Octopus (only the first time)…'],
    !st.usage && !st.loading && [st.hasKey ? 'Your meter isn\'t known yet, so “You paid” can\'t be worked out.' : 'Add your Octopus account number and API key in Settings to see what you paid.'],
    year.gapDays > 0 && [`${year.gapDays} day${year.gapDays === 1 ? '' : 's'} on a tariff with no single price (Economy 7, for example) ${year.gapDays === 1 ? 'is' : 'are'} left out.`],
    rows.some((x) => x.short) && ['Octopus has no price for a few half hours; they\'re left out.'],
    st.usage && !loadingOld && !st.usageError && rows.some((x) => x.usageShort) && ['Your newest meter readings aren\'t in yet (they usually arrive the next day), so “You paid” leaves those half hours out.'],
  );
}

/** When you use electricity: usage by hour of the day, from the clock button on the price card. */
export const USAGE_PERIODS = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year']];
export const USAGE_VIEWS = [['chart', 'Chart'], ['table', 'Table']];

function buildUsage(on) {
  const u = {};
  u.buttons = USAGE_PERIODS.map(([id, label]) => {
    const b = h('button', { 'data-period': id, 'aria-pressed': 'false' }, label);
    b.addEventListener('click', () => on.usagePeriod?.(id));
    return b;
  });
  u.seg = h('div', { class: 'uc-seg', role: 'group', 'aria-label': 'Period' }, ...u.buttons);
  u.sub = h('div', { class: 'st-sub' });
  u.sum = h('div', { class: 'uc-sum' });
  // Chart or table, at the end of the summary line.
  u.viewButtons = USAGE_VIEWS.map(([id, label]) => {
    const b = h('button', { 'data-view': id, 'aria-pressed': 'false' }, label);
    b.addEventListener('click', () => on.usageView?.(id));
    return b;
  });
  u.sumRow = h('div', { class: 'uc-sumrow' }, u.sum, h('div', { class: 'uc-view', role: 'group', 'aria-label': 'Show as' }, ...u.viewButtons));
  u.box = h('div', { class: 'uc-chart' });
  // Tap a bar for its hour (again to clear), or slide a finger along the bars: the columns are
  // narrow, so the hour under the finger follows it.
  const hourAt = (e) => {
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.uc-hit');
    return hit && u.box.contains(hit) ? Number(hit.dataset.h) : null;
  };
  let drag = null;
  u.box.addEventListener('pointerdown', (e) => {
    const hr = hourAt(e);
    if (hr == null) return;
    drag = { hr, moved: false, again: hr === u.sel };
    try { u.box.setPointerCapture(e.pointerId); } catch { /* fine without */ }
    on.usagePick?.(hr);
  });
  u.box.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const hr = hourAt(e);
    if (hr != null && hr !== drag.hr) { drag.hr = hr; drag.moved = true; on.usagePick?.(hr); }
  });
  const end = () => {
    if (drag && !drag.moved && drag.again) on.usagePick?.(-1);
    drag = null;
  };
  u.box.addEventListener('pointerup', end);
  u.box.addEventListener('pointercancel', () => { drag = null; });
  u.table = h('div', { class: 'uc-table hidden' });
  u.table.addEventListener('click', (e) => {
    const row = e.target.closest?.('tr[data-h]');
    if (row) on.usageTap?.(Number(row.dataset.h));
  });
  u.info = h('div', { class: 'uc-info', role: 'status' });
  u.legend = h('div', { class: 'legend uc-legend' });
  u.msg = h('div', { class: 'st-msg', role: 'status' });
  const close = h('button', { class: 'st-close', 'aria-label': 'Close' }, icon('close'));
  close.addEventListener('click', () => on.usageClose?.());
  u.card = h('div', { class: 'st-card uc-card' }, close,
    h('h2', {}, 'When you use electricity'), u.sub, u.seg, u.sumRow, u.box, u.table, u.info, u.legend, u.msg);
  u.sheet = h('div', { class: 'stats-sheet hidden', id: 'usage', role: 'dialog', 'aria-label': 'When you use electricity' }, u.card);
  u.sheet.addEventListener('pointerdown', (e) => { u.downOutside = e.target === u.sheet; });
  u.sheet.addEventListener('click', (e) => { if (e.target === u.sheet && u.downOutside) on.usageClose?.(); u.downOutside = false; });
  u.card.addEventListener('pointerdown', () => { u.touched = Date.now(); });
  return u;
}

export const usageIsOpen = (r) => !r.usage.sheet.classList.contains('hidden');

export function openUsage(r) {
  r.usage.sheet.classList.remove('hidden');
  r.usage.touched = Date.now();
}

export function closeUsage(r) { r.usage.sheet.classList.add('hidden'); }

const kwhText = (k) => (k < 1 ? k.toFixed(2) : k < 10 ? k.toFixed(1) : Math.round(k).toLocaleString('en-GB'));
const hourSpan = (hr) => `${String(hr).padStart(2, '0')}:00–${String((hr + 1) % 24).padStart(2, '0')}:00`;

/** The table view: the 24 hours in two halves side by side (so it fits without scrolling). */
function usageTable({ values, paid, share, peak, sel, today, opts }) {
  const half = (from) => h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Hour'), h('th', {}, today ? 'kWh' : 'kWh a day'), h('th', {}, 'Share'), h('th', {}, 'Paid'))),
    h('tbody', {}, ...Array.from({ length: 12 }, (_, i) => {
      const hr = from + i;
      const v = values[hr];
      return h('tr', { 'data-h': hr, class: [hr === sel ? 'on' : '', hr === peak ? 'peak' : ''].filter(Boolean).join(' ') || null },
        h('th', { scope: 'row' }, `${String(hr).padStart(2, '0')}:00`),
        h('td', {}, Number.isFinite(v) ? kwhText(v) : '–'),
        h('td', {}, Number.isFinite(v) ? `${share[hr]}%` : '–'),
        h('td', {}, ...(paid[hr] != null ? [bandDot(paid[hr], opts), `${round1(paid[hr]).toFixed(1)}p`] : ['–'])));
    })));
  return [half(0), half(12)];
}

/**
 * The usage chart (or table). `data` from PriceStats.usageByHour (null: no tariff yet). `st`:
 * { period, view ('chart' | 'table'), selected (hour, or -1), loading, error, usageError, hasKey }.
 */
export function renderUsage(r, data, st = {}, opts = {}, tz = DEFAULT_TZ) {
  const U = r.usage;
  U.sheet.dataset.loading = st.loading ? '1' : ''; // (also lets the tests wait for the year)
  const asTable = st.view === 'table';
  // Today, or the first day of a week, month or year (nothing to average yet): kWh as used.
  const asUsed = st.period === 'today' || !!data?.partial;
  for (const b of U.buttons) b.setAttribute('aria-pressed', String(b.dataset.period === st.period));
  for (const b of U.viewButtons) b.setAttribute('aria-pressed', String(b.dataset.view === (asTable ? 'table' : 'chart')));
  U.sub.textContent = st.period === 'today' ? 'kWh used in each hour today' : asUsed ? 'kWh used in each hour so far (the first day)' : 'Average kWh a day in each hour';
  const say = (...lines) => U.msg.replaceChildren(...lines.filter(Boolean).map(([text, bad]) => h('div', { class: bad ? 'bad' : '' }, text)));
  // One message where the chart goes (the box keeps its size, so nothing jumps).
  const blank = (text) => {
    U.sum.textContent = '';
    U.box.replaceChildren(h('div', { class: 'st-empty' }, text));
    U.box.classList.add('empty');
    U.box.classList.remove('hidden', 'has-sel');
    U.table.classList.add('hidden');
    U.info.textContent = '';
    U.legend.replaceChildren();
  };
  const usageFailed = st.usageError && [`Couldn't get your usage from Octopus: ${st.usageError}`, true];
  if (!data || !data.usage) {
    blank(st.loading ? 'Looking up your meter…' : st.hasKey ? 'Your meter isn\'t known yet.' : 'Add your Octopus account number and API key in Settings to see your usage.');
    say(st.error && [`Couldn't look up your tariff: ${st.error}`, true]);
    return;
  }
  // Days still to load: wait unless nearly all the period is here already (the newest day, on
  // the morning after), so a part-loaded period never passes for the whole of it.
  if (data.missing && data.missing >= Math.max(1, 0.1 * (data.missing + data.held))) {
    blank(!st.loading ? '–' : data.held ? 'Getting the newest days from Octopus…' : 'Getting your usage from Octopus (only the first time)…');
    say(st.error && [`Couldn't get the older prices from Octopus: ${st.error}`, true], usageFailed);
    return;
  }
  if (st.period === 'today' && !data.todayKnown) {
    blank('–');
    say(['Today\'s use comes from the Home Mini, so it shows here once one is sending readings. Your meter\'s own readings arrive the next day: see This week.']);
    return;
  }
  if (data.short) { // most of the period has no readings: no total rather than a wrong one
    blank('–');
    say(usageFailed || ['Only some of this period\'s days have meter readings yet.']);
    return;
  }
  // Each hour: kWh as used, or the average a day; and the band of what you paid then.
  const values = data.kwh.map((k, hr) => (data.days[hr] > 0 ? (asUsed ? k : k / data.days[hr]) : null));
  if (!values.some((v) => v > 0)) {
    blank(st.period === 'today' ? 'No Home Mini readings yet today.' : 'No readings for this period yet.');
    say(usageFailed);
    return;
  }
  U.box.classList.remove('empty');
  const paid = data.priced.map((k, hr) => (k > 0 ? data.cost[hr] / k : null));
  const bands = paid.map((p) => (p == null ? 'none' : band(p, opts)));
  const sel = st.selected >= 0 && Number.isFinite(values[st.selected]) ? st.selected : -1;
  U.sel = sel;
  let peak = -1;
  values.forEach((v, hr) => { if (Number.isFinite(v) && (peak < 0 || v > values[peak])) peak = hr; });
  const perDay = values.reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0);
  const until = st.period === 'today' && data.todayShort && data.todayUntil ? ` until ${hhmm(data.todayUntil, tz)}` : asUsed ? ' so far' : '';
  U.sum.replaceChildren(h('b', {}, `${kwhText(data.total)} kWh`), until || ` · ${kwhText(perDay)} kWh a day`, ' · most at ', h('b', {}, hourSpan(peak)));
  const share = data.kwh.map((k) => (data.total > 0 ? Math.round((k / data.total) * 100) : 0));
  U.box.classList.toggle('hidden', asTable);
  U.table.classList.toggle('hidden', !asTable);
  if (asTable) {
    U.table.replaceChildren(...usageTable({ values, paid, share, peak, sel, today: asUsed, opts }));
  } else {
    // Measure after the sheet is on screen (the chart fills its box).
    const box = U.box.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(U.box).fontSize) || 12;
    U.box.classList.toggle('has-sel', sel >= 0);
    U.box.replaceChildren(svg(renderHours({ values, bands, width: box.width || 520, height: box.height || 220, fs, selected: sel })));
  }
  if (sel >= 0) {
    U.info.replaceChildren(h('b', {}, hourSpan(sel)), ` · ${kwhText(values[sel])} kWh${asUsed ? '' : ' a day'} · ${share[sel]}% of your use`,
      ...(paid[sel] != null ? [' · paid ', bandDot(paid[sel], opts), h('b', {}, `${round1(paid[sel]).toFixed(1)}p`), ' a kWh'] : []));
  } else U.info.textContent = asTable ? 'The busiest hour is in bold. Dot: what you paid then.' : 'Tap or slide along the bars for an hour. Colour: what you paid then.';
  // A key for the colours drawn (in the panel's usual order).
  const shown = new Set(bands.filter((b, hr) => Number.isFinite(values[hr]) && values[hr] > 0 && b !== 'none'));
  const item = (b, text) => h('span', { class: `lg lg-${b}` }, h('span', { class: `sw band-${b}` }), text);
  U.legend.replaceChildren(...[
    shown.has('plunge') && item('plunge', 'Plunge ≤0'), shown.has('cheap') && item('cheap', `Cheap <${opts.cheap ?? 15}p`),
    shown.has('mid') && item('mid', 'Normal'), shown.has('high') && item('high', `Peak ${opts.pricey ?? 25}p+`),
  ].filter(Boolean));
  say(
    usageFailed,
    data.missing > 0 && st.loading && ['Getting the newest days from Octopus…'],
    data.missing > 0 && !st.loading && st.error && [`Couldn't get the newest days from Octopus: ${st.error}`, true],
    st.period === 'today' && data.todayShort && [data.todayUntil ? `The Home Mini's readings stop at ${hhmm(data.todayUntil, tz)}, so later hours are missing.` : 'No Home Mini readings yet today.'],
    st.period !== 'today' && data.usageShort && !st.loading && ['The newest meter readings aren\'t in yet (they usually arrive the next day), so the total leaves those hours out.'],
  );
}

let toastTimer = null;
/** A short message at the bottom. `action` adds a button to it, e.g. { label: 'Undo', fn }. */
export function toast(r, text, ms = 3500, action = null) {
  r.toast.replaceChildren(text);
  if (action) {
    const b = h('button', { class: 'toast-action' }, action.label);
    b.addEventListener('click', () => { r.toast.classList.add('hidden'); action.fn(); });
    r.toast.append(b);
  }
  r.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => r.toast.classList.add('hidden'), ms);
}

/** The more serious of two statuses (error > stale > ok). */
export function worst(a, b) {
  const rank = (s) => (s?.error ? 2 : s?.stale ? 1 : 0);
  return rank(b) > rank(a) ? b : a;
}

function setDot(el, st) {
  el.className = 'dot' + (st?.error ? ' error' : st?.stale ? ' stale' : '');
  el.title = st?.error || (st?.stale ? 'Data is out of date' : '');
}

export function renderClock(r, now, tz = DEFAULT_TZ) {
  r.time.textContent = hhmm(now, tz);
  r.date.textContent = longDate(now, tz);
  r.nightTime.textContent = hhmm(now, tz);
  const tod = `tod-${timeOfDay(partsInTz(now, tz).h)}`;
  if (!r.panel.classList.contains(tod)) {
    r.panel.classList.remove('tod-dawn', 'tod-day', 'tod-dusk', 'tod-night');
    r.panel.classList.add(tod);
  }
}

export function renderWeather(r, w, st, tz = DEFAULT_TZ) {
  setDot(r.wxDot, st);
  if (!w) {
    r.wxNow.replaceChildren(h('span', { class: 'muted' }, st?.error ? 'Weather unavailable' : 'Set your location in Settings'));
    r.wxDays.replaceChildren();
    return;
  }
  const d = describe(w.now.code, w.now.day);
  r.wxNow.replaceChildren(
    h('div', { class: 'wx-ico' }, icon(d.icon, WEATHER)),
    h('div', { class: 'wx-temp' }, `${Math.round(w.now.temp)}°`),
    h('div', {}, h('div', {}, d.label), h('div', { class: 'muted' }, `Feels ${Math.round(w.now.feels)}° · wind ${Math.round(w.now.wind)} mph`)),
  );
  const days = w.days.slice(0, 5);
  const lo = Math.min(...days.map((x) => x.min)), hi = Math.max(...days.map((x) => x.max));
  r.wxDays.replaceChildren(...days.map((x, i) => {
    const span = h('span');
    const range = Math.max(1, hi - lo);
    span.style.left = `${((x.min - lo) / range) * 100}%`;
    span.style.right = `${((hi - x.max) / range) * 100}%`;
    const dayMs = Date.parse(`${x.date}T12:00:00Z`);
    return h('div', { class: 'wx-day' },
      h('span', {}, i === 0 ? 'Today' : weekdayShort(dayMs, tz)),
      h('span', { class: 'wx-ico' }, icon(describe(x.code, true).icon, WEATHER)),
      h('span', { class: 'min' }, `${Math.round(x.min)}°`),
      h('span', { class: 'wx-bar' }, span),
      h('span', { class: 'max' }, `${Math.round(x.max)}°`));
  }));
  fitRows(r.wxDays);
}

/** Hide trailing rows that would be cut off, so the card never shows half a row. */
export function fitRows(container) {
  const rows = [...container.children];
  rows.forEach((row) => row.classList.remove('hidden'));
  const bottom = container.getBoundingClientRect().bottom;
  for (const row of rows) if (row.getBoundingClientRect().bottom > bottom + 1) row.classList.add('hidden');
}

export function renderCalendar(r, events, now, st, tz = DEFAULT_TZ, maxRows = 9, signedIn = false) {
  setDot(r.calDot, st);
  if (!events) {
    const why = st?.error ? 'Calendar unavailable'
      : signedIn ? 'Choose calendars in Settings to show them here' : 'Sign in to Google in Settings to show your calendar';
    r.calBody.replaceChildren(h('div', { class: 'empty' }, why));
    return;
  }
  let rows = 0;
  const days = groupDays(events, now, tz, 2).map((day) => {
    const allDay = day.events.filter((e) => e.allDay);
    const timed = day.events.filter((e) => !e.allDay);
    const chips = allDay.length ? h('div', { class: 'chips' }, ...allDay.map((e) => {
      const c = h('span', { class: 'chip' }, e.title);
      if (e.color) c.style.borderLeftColor = e.color;
      return c;
    })) : null;
    const items = [];
    let hidden = 0;
    for (const e of timed) {
      if (rows >= maxRows) { hidden++; continue; }
      rows++;
      const what = h('div', { class: 'what' }, h('div', { class: 'title' }, e.title), e.location ? h('div', { class: 'where' }, e.location) : null);
      if (e.color) what.style.borderLeftColor = e.color;
      const starts = e.start < day.dayStart ? '…' : hhmm(e.start, tz);
      items.push(h('div', { class: 'ev' }, h('div', { class: 'when' }, h('span', { class: 't-start' }, starts), h('br'),
        h('span', { class: 't-end end' }, e.end - e.start < 864e5 ? hhmm(e.end, tz) : '')), what));
    }
    const empty = !allDay.length && !timed.length ? h('div', { class: 'empty' }, day.label === 'Today' ? 'Nothing else today' : 'Nothing planned') : null;
    return h('div', { class: 'cal-day' },
      h('h3', {}, h('span', {}, day.label), h('span', {}, longDate(day.dayStart + 12 * 3600e3, tz).replace(/^\w+ /, ''))),
      chips, ...items, empty, h('div', { class: `more${hidden ? '' : ' hidden'}`, 'data-n': hidden }, `+${hidden} more`));
  });
  r.calBody.replaceChildren(...days);
  fitCalendar(r.calBody);
  // Re-fit when the column changes size (Settings closed, screen rotated…).
  if (!r.calFit && typeof ResizeObserver === 'function') {
    r.calFit = new ResizeObserver(([e]) => {
      const hgt = Math.round(e.contentRect.height);
      if (hgt === r.calH) return; // only a real change of space, never our own re-render
      r.calH = hgt;
      if (r.lastCal) renderCalendar(...r.lastCal);
    });
    r.calFit.observe(r.calBody);
  }
  r.lastCal = [r, events, now, st, tz, maxRows, signedIn];
}

/** Hide events from the end until the calendar fits its space, keeping each day's "+N more" right. */
function fitCalendar(body) {
  if (!body.clientHeight) return;
  const evs = [...body.querySelectorAll('.ev')];
  const fits = () => body.scrollHeight <= body.clientHeight + 1;
  while (!fits() && evs.length) {
    const ev = evs.pop();
    ev.classList.add('hidden');
    const more = ev.closest('.cal-day').querySelector('.more');
    const n = Number(more.dataset.n) + 1;
    more.dataset.n = n;
    more.textContent = `+${n} more`;
    more.classList.remove('hidden');
  }
  // A day with no room for any of its events just says how many it has.
  for (const day of body.querySelectorAll('.cal-day')) {
    const more = day.querySelector('.more');
    const all = !!day.querySelector('.ev') && !day.querySelector('.ev:not(.hidden)');
    more.classList.toggle('all', all);
    if (all) more.textContent = `${more.dataset.n} event${more.dataset.n === '1' ? '' : 's'}`;
  }
}

/** A small coloured mark beside a price; the number next to it carries the meaning. */
const bandDot = (p, opts) => h('span', { class: `band-dot band-${band(p, opts)}` });

/** Band key for the chart. Plunge only appears when a price at or below 0p is on the chart. */
function renderLegend(r, rates, now, opts) {
  const from = Math.floor(now / 1800e3) * 1800e3 - 3600e3, to = from + 24 * 3600e3; // the chart's window
  const plunge = (rates || []).some((x) => x.end > from && x.start < to && band(x.p, opts) === 'plunge');
  const key = `${opts.cheap}/${opts.pricey}/${plunge}/${!!rates?.length}`;
  if (r.legend.dataset.key === key) return;
  r.legend.dataset.key = key;
  if (!rates?.length) { r.legend.replaceChildren(); return; }
  const item = (b, text) => h('span', { class: `lg lg-${b}` }, h('span', { class: `sw band-${b}` }), text);
  r.legend.replaceChildren(...[
    plunge ? item('plunge', 'Plunge ≤0') : null,
    item('cheap', `Cheap <${opts.cheap}`), item('mid', 'Normal'), item('high', `Peak ${opts.pricey}+`),
  ].filter(Boolean));
}

export function renderPrice(r, rates, now, st, opts, tz = DEFAULT_TZ) {
  setDot(r.priceDot, st);
  setDot(r.chartDot, st);
  const s = rates?.length ? priceSummary(rates, now, tz) : null;
  if (!s) {
    r.priceBig.className = 'big none';
    r.priceBig.textContent = '–';
    r.priceBand.className = 'band-chip hidden';
    delete r.price.dataset.band;
    r.priceSub.replaceChildren(st?.error ? 'Prices unavailable' : rates?.length ? 'No price for right now yet' : 'Waiting for prices…');
  } else {
    // The number stays in text ink; the band is a chip with a word (never colour alone).
    const b = band(s.current.p, opts);
    r.priceBig.className = 'big';
    r.priceBig.replaceChildren(h('span', { class: 'num' }, `${round1(s.current.p).toFixed(1)}`), h('small', {}, 'p/kWh'));
    r.priceBand.className = `band-chip chip-${b} band-${b}`;
    r.priceBand.textContent = BAND_WORD[b] || '';
    r.price.dataset.band = b;
    r.priceSub.replaceChildren(
      h('div', {}, `until ${hhmm(s.current.end, tz)}`, ...(s.next ? [' · then ', bandDot(s.next.p, opts), h('b', {}, `${round1(s.next.p).toFixed(1)}p`)] : [])),
      h('div', {}, 'cheapest ahead: ', bandDot(s.cheapest.p, opts), h('b', {}, `${round1(s.cheapest.p).toFixed(1)}p`), ` ${s.cheapestIsNow ? 'now' : `at ${s.cheapestLabel}`}`));
  }
  renderLegend(r, rates, now, opts);
  const box = r.chartBox.getBoundingClientRect();
  const fs = parseFloat(getComputedStyle(r.chartBox).fontSize) || 12;
  r.chartBox.replaceChildren(svg(renderChart({ rates: rates || [], now, width: box.width || 500, height: box.height || 260, tz, fs, ...opts })));
}

function sparkline(points, now, minutes = 60) {
  const pts = points.filter((p) => p.t > now - minutes * 60e3 && Number.isFinite(p.w));
  if (pts.length < 2) return null;
  const W = 200, H = 40;
  const max = Math.max(100, ...pts.map((p) => p.w));
  const xy = pts.map((p) => [((p.t - (now - minutes * 60e3)) / (minutes * 60e3)) * W, H - (p.w / max) * (H - 6) - 3]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)} ${H} L${xy[0][0].toFixed(1)} ${H} Z`;
  const [ex, ey] = xy[xy.length - 1];
  // The stretched viewBox would squash a circle, so the end dot is a zero-length round-capped
  // stroke drawn at a fixed screen width (vector-effect, set in the stylesheet).
  return svg(`<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path class="a" d="${area}"/><path class="l" d="${line}" vector-effect="non-scaling-stroke"/><path class="e" d="M${ex.toFixed(1)} ${ey.toFixed(1)}h0"/></svg>`);
}

const fmtKw = (w) => (w >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${Math.round(w)} W`);

export function renderTiles(r, st, s, now, tz = DEFAULT_TZ, bright = null, fuse = null) {
  delete r.tUsage.el.dataset.fuel; delete r.tCost.el.dataset.fuel;
  if (fuse) renderFuseTiles(r, fuse, now, tz);
  else if (bright) renderBrightTiles(r, bright, now, tz);
  else renderOctopusTiles(r, st, s, now);

  // Indoor (Nest)
  setDot(r.tIndoor.dot, st.status.thermostat);
  const t = st.thermo;
  if (t && Number.isFinite(t.tempC)) {
    r.tIndoor.value.replaceChildren(`${t.tempC.toFixed(1)}°`, t.setpointC != null ? h('small', {}, `→ ${round1(t.setpointC)}°`) : '');
    const doing = t.hvac === 'HEATING' ? 'Heating' : t.hvac === 'COOLING' ? 'Cooling' : t.eco ? 'Eco' : t.mode === 'OFF' ? 'Off' : 'Idle';
    const state = t.hvac === 'HEATING' ? h('span', { class: 'heat' }, icon('flame'), doing) : doing;
    r.tIndoor.extra.replaceChildren(h('div', { class: 'muted state' }, state, t.name ? ` · ${t.name}` : ''));
  } else {
    r.tIndoor.value.textContent = '–';
    r.tIndoor.extra.replaceChildren(h('span', { class: 'muted' }, s.google.projectId ? '' : 'Set up Nest'));
  }

  // Car (optional)
  setDot(r.tCar.dot, st.status.kia);
  r.tCar.label.textContent = s.panel.carName || 'Car';
  if (st.kia && Number.isFinite(st.kia.battery)) {
    const bar = h('span');
    bar.style.width = `${Math.max(0, Math.min(100, st.kia.battery))}%`;
    r.tCar.value.replaceChildren(`${Math.round(st.kia.battery)}%`, st.kia.charging ? h('small', {}, 'charging') : st.kia.range ? h('small', {}, `${Math.round(st.kia.range)} mi`) : '');
    r.tCar.extra.replaceChildren(h('div', { class: `meter${st.kia.battery <= 20 ? ' low' : ''}` }, bar), h('div', { class: 'muted' }, st.kia.updated ? `updated ${ago(st.kia.updated, now)}` : ''));
  } else {
    r.tCar.value.textContent = s.kia.url ? '–' : 'Kia app';
    r.tCar.extra.replaceChildren(h('span', { class: 'muted' }, s.kia.url ? '' : 'Tap to open'));
  }
}

/** Using now and Today so far, from the Octopus Home Mini. */
function renderOctopusTiles(r, st, s, now) {
  // Using now (Home Mini)
  setDot(r.tUsage.dot, st.status.homemini);
  if (Number.isFinite(st.tele?.demandW)) {
    r.tUsage.value.textContent = fmtKw(st.tele.demandW);
    r.tUsage.extra.replaceChildren(sparkline(st.demand || [], now) || '');
  } else {
    r.tUsage.value.textContent = '–';
    r.tUsage.extra.replaceChildren(h('span', { class: 'muted' }, s.octopus.apiKey ? '' : 'Add Octopus key'));
  }

  // Today so far
  setDot(r.tCost.dot, worst(st.status.homemini, st.status.rates));
  if (st.costP != null && st.tele) {
    r.tCost.value.textContent = `£${(st.costP / 100).toFixed(2)}`;
    r.tCost.extra.replaceChildren(h('div', { class: 'muted' }, `${st.tele.todayKWh.toFixed(1)} kWh used`));
  } else {
    r.tCost.value.textContent = '–';
    r.tCost.extra.replaceChildren();
  }
}

const kwhShort = (k) => (k < 10 ? k.toFixed(1) : Math.round(k).toLocaleString('en-GB'));
const pounds = (p) => `£${(p / 100).toFixed(2)}`;

/** A day in words: 'today', 'yesterday' or 'Wed 23 September'. */
export function dayWords(t, now, tz = DEFAULT_TZ) {
  const d0 = startOfDay(now, tz);
  if (t >= d0 && t < startOfDay(now, tz, 1)) return 'today';
  if (t >= startOfDay(now, tz, -1) && t < d0) return 'yesterday';
  return `${weekdayShort(t, tz)} ${dayMonth(t, tz)}`;
}
const capital = (w) => w.charAt(0).toUpperCase() + w.slice(1);

/** Where readings reach, in words: '14:30', 'yesterday 23:00', 'yesterday midnight' (the end of the day, not the start of the next). */
export function untilWords(ms, now, tz = DEFAULT_TZ) {
  const day = dayWords(ms - 1, now, tz);
  return `${day === 'today' ? '' : `${day} `}${hhmm(ms, tz) === '00:00' ? 'midnight' : hhmm(ms, tz)}`;
}

/** A half hour in words: '13:00–13:30' today, else with its day ('yesterday 23:30–00:00'). */
export function slotWhen(slot, now, tz = DEFAULT_TZ) {
  const day = dayWords(slot.start, now, tz);
  return `${day === 'today' ? '' : `${day} `}${hhmm(slot.start, tz)}–${hhmm(slot.end, tz)}`;
}

/** What the card says while today has no readings: never just "waiting", always why. */
function brightQuiet(v, now, tz) {
  if (!v.configured) return [h('div', {}, "Bright isn't set up on this panel yet"), h('div', {}, '⚙ → Electricity: your Bright email and password, then ', h('b', {}, 'Save & close'))];
  if (v.status?.error) return ['Usage unavailable (tap for why)'];
  if (!v.status) return ['Asking Bright…'];
  if (v.newest) return [h('div', {}, 'No readings for today yet · tap for why'), h('div', {}, "Bright's newest: ", h('b', {}, slotWhen(v.newest, now, tz)))];
  return ['No readings from Bright yet'];
}

/**
 * Bright (any supplier, fixed price): the hero says what today has cost so far, the chart shows
 * today's half hours (until today has one, the newest day Bright has). `v` from main.js brightView:
 * { today, yesterday (the latest whole day: { kwh, slots, last, start, end, complete }), priced,
 * todayP, yesterdayP, rates, slots, newest, shown ({ start, end }), live, lastHalf, configured,
 * status, liveStatus, dayStart, dayEnd, yStart }.
 */
export function renderBright(r, v, now, tz = DEFAULT_TZ) {
  r.panel.classList.add('src-bright');
  r.priceLabel.textContent = 'Today so far';
  setDot(r.priceDot, v.status);
  setDot(r.chartDot, v.status);
  delete r.price.dataset.band;
  const t = v.today;
  if (!t.slots) {
    r.priceBig.className = 'big none';
    r.priceBig.textContent = '–';
    r.priceBand.className = 'band-chip hidden';
    r.priceSub.replaceChildren(...brightQuiet(v, now, tz));
  } else {
    r.priceBig.className = 'big';
    r.priceBig.replaceChildren(...(v.priced ? [h('span', { class: 'num' }, pounds(v.todayP))] : [h('span', { class: 'num' }, kwhShort(t.kwh)), h('small', {}, 'kWh')]));
    r.priceBand.className = v.priced ? 'band-chip chip-use' : 'band-chip hidden';
    r.priceBand.textContent = `${t.kwh.toFixed(1)} kWh`;
    r.priceSub.replaceChildren(
      // Bright's lag, unless it's the panel's own requests failing (then the tap says why).
      h('div', {}, 'readings to ', h('b', {}, hhmm(t.last, tz)), v.status?.error ? ' · Usage unavailable (tap for why)' : now - t.last <= 90 * 60e3 ? ' · Bright is about half an hour behind' : ` · Bright is ${Math.round((now - t.last) / 3600e3)} hours behind`),
      h('div', {}, v.priced ? [h('b', {}, `${round1(v.rates.unitRate).toFixed(1)}p`), ' a kWh + ', h('b', {}, `${round1(v.rates.standing).toFixed(1)}p`), ' a day'] : 'Add your unit rate in Settings (⚙ → Electricity) for £'));
  }
  const day = dayWords(v.shown.start, now, tz);
  r.chartLabel.replaceChildren(`Usage ${day} `, h('span', { class: 'unit' }, 'kWh per half hour'));
  r.legend.dataset.key = '';
  r.legend.replaceChildren();
  const box = r.chartBox.getBoundingClientRect();
  const fs = parseFloat(getComputedStyle(r.chartBox).fontSize) || 12;
  r.chartBox.replaceChildren(svg(renderUsageDay({ slots: v.slots, now, dayStart: v.shown.start, dayEnd: v.shown.end, width: box.width || 500, height: box.height || 260, fs, tz, day })));
}

/** Using now (live with a Glow display, else the newest half hour) and Yesterday. */
function renderBrightTiles(r, v, now, tz) {
  const live = v.live && now - v.live.at < 15 * 60e3 ? v.live : null;
  setDot(r.tUsage.dot, live ? v.liveStatus : v.status);
  if (live) {
    r.tUsage.label.textContent = 'Using now';
    r.tUsage.value.textContent = fmtKw(live.w);
    r.tUsage.extra.replaceChildren(sparkline(v.demand || [], now) || '');
  } else if (v.lastHalf) {
    // No live reading without a Glow display: the newest half hour's average instead.
    r.tUsage.label.textContent = 'Last half hour';
    r.tUsage.value.textContent = fmtKw(v.lastHalf.kwh * 2000);
    r.tUsage.extra.replaceChildren(h('div', { class: 'muted' }, `${hhmm(v.lastHalf.start, tz)}–${hhmm(v.lastHalf.end, tz)} average`));
  } else {
    r.tUsage.label.textContent = v.newest ? 'Last half hour' : 'Using now';
    r.tUsage.value.textContent = '–';
    const why = !v.configured ? 'Bright not set up yet' : v.status?.error ? '' : !v.status ? 'Asking Bright…' : v.newest ? 'Bright is behind · tap' : 'No readings yet';
    r.tUsage.extra.replaceChildren(h('span', { class: 'muted' }, why));
  }
  setDot(r.tCost.dot, v.status);
  const y = v.yesterday;
  r.tCost.label.textContent = capital(dayWords(y.start, now, tz));
  if (y.slots) {
    r.tCost.value.textContent = v.priced ? pounds(v.yesterdayP) : `${kwhShort(y.kwh)} kWh`;
    r.tCost.extra.replaceChildren(h('div', { class: 'muted' }, v.priced ? `${y.kwh.toFixed(1)} kWh` : '', y.complete ? '' : `${v.priced ? ' · ' : ''}readings to ${hhmm(y.last, tz)}`));
  } else {
    r.tCost.value.textContent = '–';
    r.tCost.extra.replaceChildren();
  }
}

// ---------- Fuse (electricity and gas, hourly) ----------

/** Pence as people say them: '3.4p', '11p', '£1.85'. */
const pence = (p) => (p >= 100 ? pounds(p) : `${p < 10 ? p.toFixed(1) : Math.round(p)}p`);

/** How far each fuel's readings reach, in words: 'electricity to 14:30, gas to yesterday 23:00'. */
export function fuseNewestText(v, now, tz = DEFAULT_TZ) {
  return [
    v.hasElec && v.newest.elec ? `electricity to ${untilWords(v.newest.elec, now, tz)}` : '',
    v.hasGas && v.newest.gas ? `gas to ${untilWords(v.newest.gas, now, tz)}` : '',
  ].filter(Boolean).join(', ');
}

const FUSE_RANGE_WORDS = { D: 'Today', M: 'This month', Y: 'This year' };

/** What the card says while it has no total to show: never just "waiting", always why. */
function fuseQuiet(v, now, tz) {
  if (v.notSetUp) return [h('div', {}, "Fuse isn't connected on this panel yet"), h('div', {}, '⚙ → Electricity → Send code')];
  if (v.signedOut) return [h('div', {}, 'Fuse signed the panel out'), h('div', {}, '⚙ → Electricity → Send code to sign in again')];
  if (v.status?.error) return ['Usage unavailable (tap for why)'];
  if (!v.status) return ['Asking Fuse…'];
  const T = v.total, when = T.wait === 'year' || T.view === 'Y' ? 'this year' : 'this month';
  if (!T.ready) return [T.load.error ? `Couldn't load ${when} from Fuse: ${T.load.error}` : `Loading ${when} from Fuse…`];
  const upTo = fuseNewestText(v, now, tz);
  const none = { D: 'No usage for today yet', M: 'No usage this month yet', Y: 'No usage this year yet' }[T.view];
  return upTo ? [h('div', {}, `${none} · tap for why`), h('div', {}, "Fuse's newest: ", h('b', {}, upTo))] : ['No readings from Fuse yet'];
}

/**
 * Fuse: the headline says what the day, month or year so far has cost (the range chosen with D / M / Y, the
 * fuels with Both / Electric / Gas; standing charges included, as the Fuse app counts it; gas's newest days,
 * which Fuse hasn't got yet, estimated from the daily average of the week before). The chart shows the same
 * range by the hour, day or month. `v` from main.js fuseView.
 */
export function renderFuse(r, v, now, tz = DEFAULT_TZ) {
  const T = v.total;
  r.panel.classList.add('src-fuse');
  // With both fuels on the account the label says which one the total is for (when it isn't both).
  const which = v.hasElec && v.hasGas && !(T.fuels.elec && T.fuels.gas) ? (T.fuels.gas ? ' · gas' : ' · electricity') : '';
  r.priceLabel.textContent = `${FUSE_RANGE_WORDS[T.view]} so far${which}`;
  r.fuelCtl.classList.toggle('hidden', !(v.hasElec && v.hasGas));
  r.fuelViews.forEach((b) => { const on = b.dataset.fuel === T.fuel; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  setDot(r.priceDot, v.status);
  setDot(r.chartDot, v.status);
  delete r.price.dataset.band;
  const e = T.elec, g = T.gas;
  if (!T.ready || !T.has) { // (what Fuse last sent still shows when it is signed out or failing: the reach line says so)
    r.priceBig.className = 'big none';
    r.priceBig.textContent = '–';
    r.priceBand.className = 'band-chip hidden';
    r.priceSub.replaceChildren(...fuseQuiet(v, now, tz));
  } else {
    // A month or a year is a longer number than a day: the figure steps down in size so the rest still fits beside it.
    const size = pounds(T.totalP).length >= 9 ? ' xlong' : pounds(T.totalP).length >= 7 ? ' long' : '';
    r.priceBig.className = `big${size}`;
    r.priceBig.replaceChildren(h('span', { class: 'num' }, pounds(T.totalP)));
    r.priceBand.className = `band-chip chip-fuel${size ? ' compact' : ''}`;
    const kwh = (x) => (x?.kwh > 0 ? `${x.estKwh > 0 ? '≈' : ''}${x.kwh >= 100 ? Math.round(x.kwh) : x.kwh.toFixed(1)} kWh` : '–');
    r.priceBand.replaceChildren(
      T.fuels.elec ? h('span', { class: 'fz fz-elec' }, icon('bolt'), kwh(e)) : '',
      T.fuels.gas ? h('span', { class: 'fz fz-gas' }, icon('flame'), kwh(g)) : '');
    // Where the readings reach (the newest of the fuels shown). Gas often comes later than electricity: say so when it does.
    const both = T.fuels.elec && T.fuels.gas;
    const reaches = T.fuels.elec ? (v.newest.elec ?? v.newest.gas ?? now) : (v.newest.gas ?? now);
    const lag = now - reaches;
    const gasBehind = both && (!v.newest.gas || (v.newest.elec ?? 0) - v.newest.gas > 2 * 3600e3);
    const to = untilWords(reaches, now, tz);
    const reach = v.status?.error ? ['readings to ', h('b', {}, to), ' · Usage unavailable (tap for why)']
      : !T.fuels.elec ? (v.newest.gas ? ['gas readings to ', h('b', {}, to), ' · Fuse reads gas about once a day'] : ['no gas readings yet'])
        : gasBehind ? [fuseNewestText(v, now, tz), v.newest.gas ? '' : ' · no gas readings yet']
          : ['readings to ', h('b', {}, to), lag <= 2 * 3600e3 ? ' · Fuse is about an hour behind' : ` · Fuse is ${Math.round(lag / 3600e3)} hours behind`];
    // The amounts that make up the total, for each fuel shown (one that hasn't reported yet says so; estimated gas says how much).
    const bits = [T.fuels.elec && (e?.kwh > 0 ? ['Electricity ', h('b', {}, pounds(T.parts.elec))] : 'electricity not reported yet'),
      T.fuels.gas && (g?.kwh > 0 ? ['Gas ', h('b', {}, pounds(T.parts.gas)), T.parts.est > 0 ? ` (${pounds(T.parts.est)} estimated)` : ''] : 'gas not reported yet')].filter(Boolean);
    const split = bits.flatMap((b, i) => (i ? [' · ', b] : [b]));
    r.priceSub.replaceChildren(h('div', {}, ...reach), h('div', {}, ...split, bits.length === 1 ? ' · standing charge included' : ''));
  }
  renderFuseChart(r, v, now, tz);
}

/** Fuse's chart: a day by the hour, a month by the day or a year by the month; split into a row per fuel, or stacked in pounds. */
function renderFuseChart(r, v, now, tz) {
  const c = v.chart;
  // The controls: which view, and (when there is something to stack) stacked.
  r.fuseCtl.classList.remove('hidden');
  r.fuseViews.forEach((b) => { const on = b.dataset.view === c.view; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  const stacked = c.style === 'stacked' && c.canStack;
  r.fuseStack.classList.toggle('hidden', !c.canStack);
  r.fuseStack.classList.toggle('on', stacked);
  r.fuseStack.setAttribute('aria-pressed', String(stacked));

  const month = c.view === 'M', year = c.view === 'Y';
  const level = c.view === 'D' ? 'hour' : c.period.level;
  const from = c.view === 'D' ? v.shown.start : c.period.start, to = c.view === 'D' ? v.shown.end : c.period.end;
  const when = c.view === 'D' ? dayWords(v.shown.start, now, tz) : month ? 'this month' : 'this year';
  const data = c.view === 'D' ? v.shownDay : c.range;
  r.chartLabel.replaceChildren(`${stacked ? 'Cost' : 'Usage'} ${when} `,
    h('span', { class: 'unit' }, `${stacked ? '£' : 'kWh'} per ${{ hour: 'hour', day: 'day', month: 'month' }[level]}${c.view === 'D' && c.gasEven && c.fuels.gas && c.fuels.elec ? " · gas isn't hourly" : ''}`));

  // Rows: electricity, and gas (by the hour only when Fuse really sends it that way).
  const gasShown = c.fuels.gas && (c.view !== 'D' || c.gasHourly);
  const min = { hour: { elec: 0.5, gas: 1, pounds: 0.25 }, day: { elec: 5, gas: 15, pounds: 2 }, month: { elec: 100, gas: 300, pounds: 25 } }[level];
  const rows = [];
  if (c.fuels.elec) rows.push({ fuel: 'elec', label: 'Electricity', min: min.elec, hours: data?.elec || [] });
  if (gasShown) rows.push({ fuel: 'gas', label: 'Gas', min: min.gas, hours: data?.gas || [] });
  r.legend.dataset.key = `fuse/${rows.length}`;
  const item = (cls, text) => h('span', { class: 'lg' }, h('span', { class: `sw sw-${cls}` }), text);
  // Split rows carry their own swatch and name; the legend is for the stacked bars.
  r.legend.replaceChildren(...(stacked && rows.length > 1 ? [item('elec', 'Electricity'), item('gas', 'Gas')] : []));

  // Gas alone, and not hourly: there is nothing to draw by the hour.
  if (c.view === 'D' && !rows.length) { r.chartBox.replaceChildren(h('div', { class: 'chart-msg' }, "Fuse gives gas once a day, not by the hour. Choose M or Y to see it.")); return; }

  // A month or year that hasn't come, or can't be drawn, says why instead of leaving the box empty.
  const what = month ? 'month' : 'year';
  const nothing = !data ? (c.load.error ? `Couldn't load this ${what} from Fuse: ${c.load.error}` : `Loading this ${what} from Fuse…`)
    : (c.view !== 'D' && !data.elec.length && !data.gas.length)
      ? `Fuse sent no ${month ? 'daily' : 'monthly'} figures for this ${what} yet.${data.skipped ? ` (It sent ${data.skipped} bars the panel couldn't place: ⚙ → Electricity → Show what Fuse sent.)` : ''}` : '';
  if (c.view !== 'D' && nothing) { r.chartBox.replaceChildren(h('div', { class: 'chart-msg' }, nothing)); return; }
  const box = r.chartBox.getBoundingClientRect();
  const fs = parseFloat(getComputedStyle(r.chartBox).fontSize) || 12;
  r.chartBox.replaceChildren(svg(renderFuseChart_({ rows, stacked, minPounds: min.pounds, level, now, start: from, end: to, width: box.width || 500, height: box.height || 260, fs, tz, day: when })));
}

/** Electricity (replaces "Using now": Fuse has nothing live) and Gas (or yesterday, with no gas). */
function renderFuseTiles(r, v, now, tz) {
  setDot(r.tUsage.dot, v.status);
  setDot(r.tCost.dot, v.status);
  const why = (what) => (v.notSetUp ? 'Fuse not set up yet' : v.signedOut ? 'Signed out · tap' : v.status?.error ? '' : !v.status ? 'Asking Fuse…' : what);
  const money = (t) => pounds(Math.round(t.pence));
  // Yesterday, with how far its readings reach if Fuse hasn't sent all of it.
  const yesterday = (y) => (y.hours ? h('div', { class: 'muted yest' }, `Yesterday ${money(y)}`, y.complete ? '' : ` · to ${hhmm(y.last, tz)}`) : '');
  const tile = (t, label, today, yest, none) => {
    t.label.textContent = label;
    if (today.kwh > 0) {
      t.value.textContent = money(today);
      t.extra.replaceChildren(h('div', { class: 'muted' }, `${today.kwh.toFixed(1)} kWh today`), yesterday(yest));
    } else {
      t.value.textContent = '–';
      t.extra.replaceChildren(h('div', { class: 'muted' }, why(none)), v.notSetUp || v.signedOut ? '' : yesterday(yest));
    }
  };
  // Gas is read about once a day, so its box is yesterday's total, the newest day that is really in.
  const gasYesterday = (t) => {
    t.label.textContent = 'Gas · yesterday';
    const y = v.yesterday.gas;
    if (y.kwh > 0) {
      t.value.textContent = money(y);
      t.extra.replaceChildren(h('div', { class: 'muted' }, `${y.kwh.toFixed(1)} kWh`, y.complete ? '' : ` · to ${hhmm(y.last, tz)}`));
    } else {
      t.value.textContent = '–';
      t.extra.replaceChildren(h('div', { class: 'muted' }, why('No gas for yesterday yet · tap')));
    }
  };
  const FUEL = { elec: { label: 'Electricity', icon: 'bolt', none: 'No readings yet today · tap' }, gas: { label: 'Gas', icon: 'flame' } };
  const fuels = [v.hasElec && 'elec', v.hasGas && 'gas'].filter(Boolean);
  const first = fuels[0] || 'elec';
  const fill = (t, f) => {
    t.el.querySelector('.ico').replaceChildren(icon(FUEL[f].icon));
    t.el.dataset.fuel = f;
    if (f === 'gas') gasYesterday(t); else tile(t, FUEL[f].label, v.today[f], v.yesterday[f], FUEL[f].none);
  };
  fill(r.tUsage, first);
  if (fuels[1]) fill(r.tCost, fuels[1]);
  else if (first === 'gas') {
    // Gas alone: the other box is the month so far (gas's newest days estimated).
    const m = v.monthGas;
    r.tCost.label.textContent = 'This month';
    r.tCost.value.textContent = m ? money(m) : '–';
    r.tCost.extra.replaceChildren(m ? h('div', { class: 'muted' }, `${m.estKwh > 0 ? '≈' : ''}${m.kwh.toFixed(1)} kWh`, m.estPence > 0 ? ' · part estimated' : '') : h('div', { class: 'muted' }, why('Loading…')));
  } else {
    // Electricity alone: the other box says what yesterday cost instead.
    const y = v.yesterday[first];
    r.tCost.label.textContent = 'Yesterday';
    r.tCost.value.textContent = y.hours ? money(y) : '–';
    r.tCost.extra.replaceChildren(y.hours ? h('div', { class: 'muted' }, `${y.kwh.toFixed(1)} kWh`, y.complete ? '' : ` · to ${hhmm(y.last, tz)}`) : '');
  }
}

/** The pop-up over a tapped bar: "Electricity 13:00–14:00 · 0.42 kWh · 11p (so far)", or for a stacked bar both fuels. */
export function showFuseTip(r, hit, tz = DEFAULT_TZ) {
  const d = hit.dataset, start = Number(d.start), end = Number(d.end);
  const level = d.level || 'hour';
  const when = level === 'hour' ? `${hhmm(start, tz)}–${hhmm(end, tz)}`
    : level === 'day' ? `${weekdayShort(start, tz)} ${dayMonth(start, tz)}`
      : new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: tz }).format(new Date(start));
  const kwhText = (k) => `${k >= 100 ? Math.round(k) : k >= 10 ? k.toFixed(1) : k.toFixed(2)} kWh`;
  const so = d.sofar === '1' ? ' so far' : '';
  if (d.fuel === 'both') {
    const e = [Number(d.elecKwh), Number(d.elecPence)], g = [Number(d.gasKwh), Number(d.gasPence)];
    r.chartTip.replaceChildren(h('b', {}, when), h('span', { class: 'tip-band' }, ` · ${pence(e[1] + g[1])}${so} · Electricity ${pence(e[1])} (${kwhText(e[0])}) · Gas ${pence(g[1])} (${kwhText(g[0])})`));
  } else {
    r.chartTip.replaceChildren(h('b', {}, d.fuel === 'gas' ? 'Gas' : 'Electricity'), ` ${when}`, h('span', { class: 'tip-band' }, ` · ${kwhText(Number(d.kwh))} · ${pence(Number(d.pence))}${so}`));
  }
  placeTip(r, hit);
}

const AI_ICON = { claude: 'spark', gemini: 'gem' };

/** The music and assistant buttons say which app they open (and take its colour in the Ambient style). */
export function renderDock(r, s) {
  const set = (btn, app, label, ico) => {
    if (btn.dataset.service === app) return;
    btn.dataset.service = app;
    btn.className = `b-${btn.dataset.app} b-${app}`;
    btn.querySelector('.d-label').textContent = label;
    if (ico) btn.querySelector('.d-ico').replaceChildren(icon(ico));
  };
  const music = musicApp(s), ai = assistantApp(s);
  set(r.dockBtn.music, music, MUSIC_APPS[music]);
  set(r.dockBtn.ai, ai, ASSISTANTS[ai], AI_ICON[ai]);
}

export function renderCamera(r, s, st, live) {
  setDot(r.camDot, st.status.camera);
  r.camName.textContent = s.panel.cameraName || st.camera?.name || 'Camera';
  r.camBarName.textContent = r.camName.textContent;
  const ready = !!(s.google.projectId && s.google.cameraId);
  r.camHint.classList.toggle('hidden', !ready);
  r.camSub.textContent = !ready ? 'Set up Nest in Settings to see the camera'
    : s.panel.cameraBattery ? 'Battery camera: live view stops after 5 minutes' : '';
  const isLive = live && live.state !== 'ended';
  r.video.classList.toggle('hidden', !isLive);
  r.camIdle.classList.toggle('hidden', !!isLive);
  r.camBar.classList.toggle('hidden', !isLive);
  r.cam.classList.toggle('expanded', !!(isLive && live.expanded));
  if (isLive && live.name) r.camBarName.textContent = live.name;
  const ringing = !!(isLive && live.ring);
  r.cam.classList.toggle('ring', ringing);
  r.camRing.classList.toggle('hidden', !ringing);
  if (ringing) r.camRing.textContent = `Someone's at the door · ${hhmm(live.ringAt)}`;
}

/** "Tap once to turn on the doorbell sound" (only where the browser blocks sound until a tap). */
export function soundHint(r, show) { r.soundHint.classList.toggle('hidden', !show); }

export function renderCamTimer(r, live, now) {
  if (!live || live.state === 'ended') { r.camTimer.textContent = ''; return; }
  if (live.state === 'connecting') { r.camTimer.textContent = 'connecting…'; return; }
  if (!live.endsAt) { r.camTimer.textContent = ''; return; }
  const s = Math.max(0, Math.round((live.endsAt - now) / 1000));
  r.camTimer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The pop-up over a tapped bar: "18:00–18:30 · 35.8p · Peak". */
export function showChartTip(r, hit, opts, tz = DEFAULT_TZ) {
  const start = Number(hit.dataset.start), end = Number(hit.dataset.end), p = Number(hit.dataset.p);
  const b = band(p, opts);
  r.chartTip.replaceChildren(
    h('span', { class: `band-dot band-${b}` }),
    h('b', {}, `${round1(p).toFixed(1)}p`),
    ` ${hhmm(start, tz)}–${hhmm(end, tz)}`,
    h('span', { class: 'tip-band' }, ` · ${BAND_WORD[b] || ''}`));
  placeTip(r, hit);
}

/** The pop-up over a tapped half hour of today's usage: "13:00–13:30 · 0.42 kWh · about 0.84 kW". */
export function showUsageTip(r, hit, tz = DEFAULT_TZ) {
  const start = Number(hit.dataset.start), end = Number(hit.dataset.end), kwh = Number(hit.dataset.kwh);
  r.chartTip.replaceChildren(h('b', {}, `${kwh.toFixed(2)} kWh`), ` ${hhmm(start, tz)}–${hhmm(end, tz)}`,
    h('span', { class: 'tip-band' }, ` · about ${fmtKw((kwh * 3600e3) / (end - start) * 1000)}`));
  placeTip(r, hit);
}

function placeTip(r, hit) {
  // Highlight the half hour, and sit the pop-up just above its bar (bars and tap targets are
  // drawn in the same order), with its pointer on the bar even when it's pushed off an edge.
  const hits = [...r.chartBox.querySelectorAll('.ch-hit')];
  hits.forEach((x) => x.classList.toggle('on', x === hit));
  const bar = r.chartBox.querySelectorAll('.ch-bar')[hits.indexOf(hit)] || hit;
  const box = r.chart.getBoundingClientRect(), col = hit.getBoundingClientRect(), top = bar.getBoundingClientRect().top;
  r.chartTip.classList.remove('hidden');
  const w = r.chartTip.offsetWidth, tipH = r.chartTip.offsetHeight;
  const cx = col.left - box.left + col.width / 2;
  const left = Math.min(Math.max(8, cx - w / 2), box.width - w - 8);
  r.chartTip.style.left = `${Math.round(left)}px`;
  // No room above a tall bar: hang it below the bar's top instead, pointing up.
  const above = top - box.top - tipH - 8;
  r.chartTip.classList.toggle('below', above < 4);
  r.chartTip.style.top = `${Math.round(above < 4 ? top - box.top + 8 : above)}px`;
  r.chartTip.style.setProperty('--caret', `${Math.round(Math.min(Math.max(12, cx - left), w - 12))}px`);
  clearTimeout(r.chartTipTimer);
  r.chartTipTimer = setTimeout(() => {
    r.chartTip.classList.add('hidden');
    r.chartBox.querySelector('.ch-hit.on')?.classList.remove('on');
  }, 4000);
}

/** Shopping list card. `items` null = not loaded yet. */
export function renderShopping(r, items, st, { listName, ready, why }) {
  setDot(r.shopDot, st);
  r.shop.classList.toggle('off', !ready);
  if (!ready) {
    r.shopList.replaceChildren(h('li', { class: 'empty' }, why));
    return;
  }
  if (!items) { r.shopList.replaceChildren(h('li', { class: 'empty' }, 'Loading…')); return; }
  if (!items.length) { r.shopList.replaceChildren(h('li', { class: 'empty' }, `Nothing on ${listName || 'the list'}`)); return; }
  r.shopList.replaceChildren(...items.map((it) => h('li', { 'data-id': it.id, 'data-title': it.title },
    h('span', { class: 'tick' }, icon('check')), h('span', { class: 'what' }, it.title))));
  fitList(r.shopList);
}

/** Hide items that don't fit, with a "+N more" line (the full list is in Google Tasks). */
function fitList(ul) {
  ul.querySelector('li.more')?.remove();
  const items = [...ul.querySelectorAll('li[data-id]')];
  items.forEach((li) => li.classList.remove('hidden'));
  if (!ul.clientHeight) return;
  let hidden = 0;
  const more = h('li', { class: 'more' });
  while (ul.scrollHeight > ul.clientHeight + 1 && items.length > 1) {
    items.pop().classList.add('hidden');
    hidden++;
    more.textContent = `+${hidden} more in Google Tasks`;
    if (!more.isConnected) ul.append(more);
  }
}
