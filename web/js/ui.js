// Builds the panel and renders each card from the current state. All text from outside
// sources (calendar titles, place names) goes in as text nodes, never as HTML.

import { h, svg } from './util.js';
import { UI, WEATHER } from './icons.js';
import { hhmm, longDate, weekdayShort, dayMonth, ago, partsInTz, DEFAULT_TZ } from './time.js';
import { priceSummary, band, round1 } from './agile.js';
import { renderChart } from './chart.js';
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
  r.chart = h('section', { class: 'card chart', id: 'chart' },
    h('div', { class: 'chart-head' }, h('div', { class: 'label' }, 'Agile price ', h('span', { class: 'unit' }, 'p/kWh')), r.legend),
    r.chartBox, r.chartTip, (r.chartDot = dot()));

  r.priceBig = h('div', { class: 'big' });
  r.priceBand = h('span', { class: 'band-chip hidden' });
  r.priceSub = h('div', { class: 'sub' });
  // A small button in the corner opens the average prices (today, this week…).
  r.statsBtn = h('button', { class: 'stats-btn', 'aria-label': 'Average prices' }, icon('stats'));
  r.statsBtn.addEventListener('click', () => on.stats?.());
  r.price = h('section', { class: 'card price', id: 'price' }, h('div', { class: 'label' }, 'Agile price now'),
    h('div', { class: 'price-main' }, r.priceBig, r.priceBand), r.priceSub, r.statsBtn, (r.priceDot = dot()));

  const tile = (cls, ico, label) => {
    const t = { value: h('div', { class: 't-value' }), label: h('div', { class: 't-label' }, label), extra: h('div', { class: 'extra' }), dot: dot() };
    t.el = h('button', { class: `card tile ${cls}` }, h('div', { class: 'ico' }, icon(ico)), t.label, t.value, t.extra, t.dot);
    return t;
  };
  r.tUsage = tile('usage', 'bolt', 'Using now');
  r.tCar = tile('car', 'car', 'Car');
  r.tCost = tile('cost', 'pound', 'Today so far');
  r.tIndoor = tile('indoor', 'thermo', 'Indoor');
  r.tiles = h('div', { class: 'tiles', id: 'tiles' }, r.tUsage.el, r.tCar.el, r.tCost.el, r.tIndoor.el);
  for (const [key, t] of Object.entries({ usage: r.tUsage, car: r.tCar, cost: r.tCost, indoor: r.tIndoor })) {
    t.el.addEventListener('click', () => on.tile?.(key));
  }

  // Shopping list (Google Tasks): tap an item to tick it off, + to add one.
  r.shopList = h('ul', { class: 'shop-items' });
  r.shopInput = h('input', { type: 'text', placeholder: 'Add an item', enterkeyhint: 'done', autocomplete: 'off', maxlength: '200' });
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
  root.replaceChildren(r.panel, r.music.sheet, r.stats.sheet, r.night, r.toast, r.soundHint);
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
  const close = h('button', { class: 'st-close', 'aria-label': 'Close' }, icon('close'));
  close.addEventListener('click', () => on.statsClose?.());
  st.card = h('div', { class: 'st-card' }, close,
    h('h2', {}, 'Average price'),
    h('div', { class: 'st-sub' }, 'Your unit price, including VAT'),
    st.rows, st.msg,
    h('p', { class: 'st-note' }, 'Every half hour counts the same, whatever you were using at the time.'));
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

/**
 * The average prices. `rows` from PriceStats.rows (null: no tariff yet); `loading`: older days
 * are still coming from Octopus; `error`: why they didn't.
 */
export function renderStats(r, rows, { loading = false, error = '' } = {}, opts = {}, tz = DEFAULT_TZ) {
  const S = r.stats;
  if (!rows) {
    S.rows.replaceChildren(h('div', { class: 'st-empty' }, 'Add your Octopus details in Settings to see average prices.'));
    S.msg.textContent = '';
    return;
  }
  S.rows.replaceChildren(...rows.map((row) => {
    const value = row.avg != null
      ? h('div', { class: 'st-val' }, bandDot(row.avg, opts), `${round1(row.avg).toFixed(1)}`, h('small', {}, 'p'))
      : h('div', { class: 'st-val none' }, row.missing && loading ? '…' : '–');
    return h('div', { class: 'st-row', 'data-id': row.id },
      h('div', { class: 'st-what' }, h('div', { class: 'st-label' }, STAT_LABEL[row.id] || row.id),
        h('div', { class: 'st-since' }, row.missing && loading ? 'loading…' : statSince(row, tz))),
      value);
  }));
  const short = rows.some((x) => x.short && !x.firstAt);
  S.msg.textContent = error ? `Couldn't get the older prices from Octopus: ${error}`
    : loading && rows.some((x) => x.missing) ? 'Getting this year\'s prices from Octopus (only the first time)…'
      : short ? 'Octopus has no price for a few of the half hours; the averages leave them out.' : '';
  S.msg.classList.toggle('bad', !!error);
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

export function renderTiles(r, st, s, now, tz = DEFAULT_TZ) {
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
