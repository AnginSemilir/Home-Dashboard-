// Builds the panel and renders each card from the current state. All text from outside
// sources (calendar titles, place names) goes in as text nodes, never as HTML.

import { h, svg } from './util.js';
import { UI, WEATHER } from './icons.js';
import { hhmm, longDate, weekdayShort, ago, DEFAULT_TZ } from './time.js';
import { priceSummary, band, round1 } from './agile.js';
import { renderChart } from './chart.js';
import { groupDays } from './calendar.js';
import { describe } from './weather.js';

const icon = (name, set = UI) => svg(set[name] || UI.camera);

const DOCK = [
  { id: 'shopping', label: 'Shopping', icon: 'cart' },
  { id: 'spotify', label: 'Spotify', icon: 'music' },
  { id: 'claude', label: 'Claude', icon: 'spark' },
  { id: 'gemini', label: 'Gemini', icon: 'mic' },
  { id: 'home', label: 'Home', icon: 'home' },
];

/** Tap vs press-and-hold (550 ms) on an element. */
function pressable(el, onTap, onHold) {
  let timer = null, held = false;
  el.addEventListener('pointerdown', () => {
    held = false;
    timer = setTimeout(() => { held = true; onHold?.(); }, 550);
  });
  const cancel = () => clearTimeout(timer);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerup', () => { cancel(); if (!held) onTap?.(); });
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
  r.cam = h('section', { class: 'card cam', id: 'cam' }, r.video, r.camIdle, r.camBar, (r.camDot = dot()));
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
  r.chart = h('section', { class: 'card chart', id: 'chart' }, h('div', { class: 'label' }, 'Agile price (p/kWh)'), r.chartBox, (r.chartDot = dot()));

  r.priceBig = h('div', { class: 'big' });
  r.priceSub = h('div', { class: 'sub' });
  r.price = h('section', { class: 'card price', id: 'price' }, h('div', { class: 'label' }, 'Agile price now'), r.priceBig, r.priceSub, (r.priceDot = dot()));

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

  r.dock = h('nav', { class: 'dock', id: 'dock' });
  for (const b of DOCK) {
    const btn = h('button', { class: `b-${b.id}`, 'data-app': b.id }, icon(b.icon), h('span', {}, b.label));
    pressable(btn, () => on.launch?.(b.id, false), () => on.launch?.(b.id, true));
    r.dock.append(btn);
  }

  for (const [el, key] of [[r.clock, 'weather'], [r.cal, 'calendar'], [r.chart, 'rates'], [r.price, 'rates']]) {
    el.addEventListener('click', (e) => { if (!e.target.closest('button')) on.status?.(key); });
  }

  r.panel = h('main', { class: 'panel' }, r.cam, r.clock, r.cal, r.chart, r.price, r.tiles, r.dock);
  r.nightTime = h('div');
  r.night = h('div', { class: 'night hidden', id: 'night' }, r.nightTime);
  r.night.addEventListener('click', () => on.nightTap?.());
  r.toast = h('div', { class: 'toast hidden', role: 'status' });
  root.replaceChildren(r.panel, r.night, r.toast);
  return r;
}

let toastTimer = null;
export function toast(r, text, ms = 3500) {
  r.toast.textContent = text;
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
      items.push(h('div', { class: 'ev' }, h('div', { class: 'when' }, starts, h('br'), e.end - e.start < 864e5 ? hhmm(e.end, tz) : ''), what));
    }
    const empty = !allDay.length && !timed.length ? h('div', { class: 'empty' }, day.label === 'Today' ? 'Nothing else today' : 'Nothing planned') : null;
    return h('div', { class: 'cal-day' },
      h('h3', {}, h('span', {}, day.label), h('span', {}, longDate(day.dayStart + 12 * 3600e3, tz).replace(/^\w+ /, ''))),
      chips, ...items, empty, hidden ? h('div', { class: 'more' }, `+${hidden} more`) : null);
  });
  r.calBody.replaceChildren(...days);
}

export function renderPrice(r, rates, now, st, opts, tz = DEFAULT_TZ) {
  setDot(r.priceDot, st);
  setDot(r.chartDot, st);
  const s = rates?.length ? priceSummary(rates, now, tz) : null;
  if (!s) {
    r.priceBig.className = 'big';
    r.priceBig.textContent = '–';
    r.priceSub.replaceChildren(st?.error ? 'Prices unavailable' : rates?.length ? 'No price for right now yet' : 'Waiting for prices…');
  } else {
    r.priceBig.className = `big band-${band(s.current.p, opts)}`;
    r.priceBig.replaceChildren(`${round1(s.current.p).toFixed(1)}`, h('small', {}, 'p/kWh'));
    r.priceSub.replaceChildren(
      `until ${hhmm(s.current.end, tz)}`, s.next ? ` · then ${round1(s.next.p).toFixed(1)}p` : '', h('br'),
      'cheapest ahead: ', h('b', {}, `${round1(s.cheapest.p).toFixed(1)}p`), ` ${s.cheapestIsNow ? 'now' : `at ${s.cheapestLabel}`}`);
  }
  const box = r.chartBox.getBoundingClientRect();
  r.chartBox.replaceChildren(svg(renderChart({ rates: rates || [], now, width: box.width || 500, height: box.height || 260, tz, ...opts })));
}

function sparkline(points, now, minutes = 60) {
  const pts = points.filter((p) => p.t > now - minutes * 60e3 && Number.isFinite(p.w));
  if (pts.length < 2) return null;
  const W = 200, H = 40;
  const max = Math.max(100, ...pts.map((p) => p.w));
  const xy = pts.map((p) => [((p.t - (now - minutes * 60e3)) / (minutes * 60e3)) * W, H - (p.w / max) * (H - 3) - 1.5]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)} ${H} L${xy[0][0].toFixed(1)} ${H} Z`;
  return svg(`<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path class="a" d="${area}"/><path class="l" d="${line}"/></svg>`);
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
    r.tIndoor.extra.replaceChildren(h('div', { class: 'muted' }, t.name ? `${doing} · ${t.name}` : doing));
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
    r.tCar.extra.replaceChildren(h('div', { class: 'meter' }, bar), h('div', { class: 'muted' }, st.kia.updated ? `updated ${ago(st.kia.updated, now)}` : ''));
  } else {
    r.tCar.value.textContent = s.kia.url ? '–' : 'Kia app';
    r.tCar.extra.replaceChildren(h('span', { class: 'muted' }, s.kia.url ? '' : 'Tap to open'));
  }
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
}

export function renderCamTimer(r, live, now) {
  if (!live || live.state === 'ended') { r.camTimer.textContent = ''; return; }
  if (live.state === 'connecting') { r.camTimer.textContent = 'connecting…'; return; }
  if (!live.endsAt) { r.camTimer.textContent = ''; return; }
  const s = Math.max(0, Math.round((live.endsAt - now) / 1000));
  r.camTimer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
