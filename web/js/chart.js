// Agile price bar chart as an SVG string. Built only from numbers and fixed labels.
// Styling (text, gridlines, the now marker, themed bar colours) lives in the style sheets
// (css/bold.css, css/ambient.css); the bar fills here are only a fallback.

import { band } from './agile.js';
import { partsInTz, weekdayShort, localToMs, startOfDay, DEFAULT_TZ } from './time.js';

export const BAND_COLOURS = { plunge: '#3d9bff', cheap: '#2aa87e', mid: '#f0a02c', high: '#e0524a', none: '#667' };

function niceStep(range) {
  for (const s of [2, 5, 10, 20, 50]) if (range / s <= 5) return s;
  return 100;
}

const f1 = (n) => (Math.round(n * 10) / 10).toString();

/** A bar with a rounded data end (top, or bottom when negative) and a square baseline. */
function barPath(x, w, yTop, yBot, down) {
  const h = yBot - yTop;
  const r = Math.max(0, Math.min(4, w / 2, h));
  const x0 = f1(x), wr = f1(w - 2 * r), rr = f1(r);
  if (!down) return `M${x0} ${f1(yBot)}V${f1(yTop + r)}a${rr} ${rr} 0 0 1 ${rr} -${rr}h${wr}a${rr} ${rr} 0 0 1 ${rr} ${rr}V${f1(yBot)}Z`;
  return `M${x0} ${f1(yTop)}V${f1(yBot - r)}a${rr} ${rr} 0 0 0 ${rr} ${rr}h${wr}a${rr} ${rr} 0 0 0 ${rr} -${rr}V${f1(yTop)}Z`;
}

/**
 * @param {object} o
 * @param {{start:number,end:number,p:number}[]} o.rates
 * @param {number} o.now epoch ms
 * @param {number} o.width  pixels
 * @param {number} o.height pixels
 * @param {number} [o.fs] label font size in pixels (the chart's padding scales with it)
 * @param {number} [o.minHours] shortest window when later prices aren't published yet
 */
export function renderChart({ rates, now, width, height, tz = DEFAULT_TZ, cheap = 15, pricey = 25, hoursBefore = 1, hours = 24, fs = 12, minHours = 6 }) {
  const W = Math.max(120, Math.round(width));
  const H = Math.max(80, Math.round(height));
  const padL = Math.round(fs * 2.4), padR = 2, padT = Math.round(fs * 1.9), padB = Math.round(fs * 2);
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const from = Math.floor(now / 1800e3) * 1800e3 - hoursBefore * 3600e3;
  // Normally 24 hours ahead. Until tomorrow's prices are published (about 4pm), stretch the
  // prices we do have across the width rather than leaving most of the chart empty.
  const full = from + hours * 3600e3;
  const known = rates.filter((r) => r.end > from);
  const lastKnown = known.length ? Math.max(...known.map((r) => r.end)) : full;
  const short = lastKnown < full - 3600e3;
  const to = short ? Math.max(lastKnown, from + minHours * 3600e3) : full;
  const shown = rates.filter((r) => r.end > from && r.start < to);
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="Agile prices">`];

  if (!shown.length) {
    out.push(`<text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="ch-empty">No prices yet</text></svg>`);
    return out.join('');
  }

  const maxP = Math.max(10, ...shown.map((r) => r.p));
  const minP = Math.min(0, ...shown.map((r) => r.p));
  const step = niceStep(maxP - minP);
  const top = Math.ceil(maxP / step) * step;
  const bottom = Math.floor(minP / step) * step;
  const y = (p) => padT + (top - p) / (top - bottom) * plotH;
  const x = (t) => padL + (t - from) / (to - from) * plotW;
  const base = H - padB;

  // Gridlines (solid hairlines) + y labels. The zero line is the baseline, one step stronger.
  for (let v = bottom; v <= top + 1e-9; v += step) {
    const yy = Math.round(y(v)) + 0.5;
    out.push(`<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" class="${v === 0 ? 'ch-zero' : 'ch-grid'}"/>`);
    out.push(`<text x="${padL - Math.round(fs * 0.6)}" y="${f1(yy + fs * 0.35)}" text-anchor="end" class="ch-y">${v}</text>`);
  }

  // Midnight: a hairline across the plot, so tomorrow reads as its own block.
  const ticks = [];
  for (let t = Math.ceil(from / 3600e3) * 3600e3; t <= to; t += 3600e3) {
    const p = partsInTz(t, tz);
    if (p.min !== 0 || p.h % 3 !== 0) continue;
    ticks.push([t, p.h]);
    if (p.h === 0) {
      const xx = Math.round(x(t)) + 0.5;
      out.push(`<line x1="${xx}" x2="${xx}" y1="${padT}" y2="${base}" class="ch-midnight"/>`);
    }
  }

  // Bars: at most 24px wide, centred in their half hour, a 2px gap between neighbours.
  let cur = null, lo = null, hi = null;
  const bars = [];
  for (const r of shown) {
    const x0 = x(Math.max(r.start, from)), x1 = x(Math.min(r.end, to));
    const slot = x1 - x0;
    const w = Math.max(1, Math.min(24, slot - 2));
    const bx = x0 + (slot - w) / 2;
    const y0 = y(Math.max(r.p, 0)), y1 = y(Math.min(r.p, 0));
    const down = r.p < 0;
    const yTop = down ? y0 : Math.min(y0, y1 - 1.5), yBot = down ? Math.max(y1, y0 + 1.5) : y1;
    const b = band(r.p, { cheap, pricey });
    const past = r.end <= now ? ' ch-past' : '';
    out.push(`<path d="${barPath(bx, w, yTop, yBot, down)}" fill="${BAND_COLOURS[b]}" class="ch-bar band-${b}${past}"/>`);
    bars.push({ cx: bx + w / 2, w, yTop, yBot });
    if (r.end > now) {
      const m = { r, cx: bx + w / 2, yTop, yBot, down };
      if (r.start <= now) cur = m;
      if (!lo || r.p < lo.r.p) lo = m;
      if (!hi || r.p > hi.r.p) hi = m;
    }
  }

  // X labels: every 3 hours on the local clock; the day name at midnight.
  for (const [t, hr] of ticks) {
    const xx = x(t);
    if (xx < padL + fs * 1.2 || xx > W - padR - fs * 1.6) continue;
    const label = hr === 0 ? weekdayShort(t, tz) : `${String(hr).padStart(2, '0')}:00`;
    out.push(`<text x="${f1(xx)}" y="${f1(H - fs * 0.45)}" text-anchor="middle" class="ch-x${hr === 0 ? ' ch-day' : ''}">${label}</text>`);
  }

  // Tomorrow's prices aren't published until about 4pm: say so in the empty space.
  const lastEnd = Math.max(...shown.map((r) => r.end));
  if (to - lastEnd > 3 * 3600e3) {
    // A faint box where they'll go, so the gap reads as "not published yet", not as 0p.
    const px = x(lastEnd) + 3;
    out.push(`<rect x="${f1(px)}" y="${padT}" width="${f1(W - padR - px)}" height="${f1(base - padT)}" rx="6" class="ch-pending"/>`);
    const cx = f1((x(lastEnd) + x(to)) / 2);
    const cy = padT + plotH * 0.45;
    if (x(to) - x(lastEnd) > fs * 13) {
      out.push(`<text x="${cx}" y="${f1(cy)}" text-anchor="middle" class="ch-note">Next prices due ~4pm</text>`);
    } else {
      out.push(`<text x="${cx}" y="${f1(cy)}" text-anchor="middle" class="ch-note">Next prices</text>`);
      out.push(`<text x="${cx}" y="${f1(cy + fs * 1.3)}" text-anchor="middle" class="ch-note">due ~4pm</text>`);
    }
  } else if (short) {
    out.push(`<text x="${W - padR}" y="${f1(padT - fs * 0.85)}" text-anchor="end" class="ch-note ch-soon">Tomorrow's prices from ~4pm</text>`);
  }

  // Now marker: a solid accent line with its label above the plot.
  const nx = Math.round(x(now)) + 0.5;
  out.push(`<line x1="${nx}" x2="${nx}" y1="${padT - Math.round(fs * 0.5)}" y2="${base}" class="ch-now"/>`);
  out.push(`<text x="${nx}" y="${padT - Math.round(fs * 0.85)}" text-anchor="middle" class="ch-now-label">now</text>`);

  // Direct labels on the two bars the eye looks for: the cheapest and dearest still to come
  // (not the current slot: the price card already shows it), unless they'd collide.
  const placed = [nx];
  for (const m of [lo, hi]) {
    if (!m || m === cur || (m === hi && hi.r.p === lo?.r.p)) continue;
    if (placed.some((px) => Math.abs(px - m.cx) < fs * 3.2)) continue;
    // Never on top of a neighbouring bar: lift the label clear of any bar under its width,
    // or leave it out if there isn't room.
    const half = fs * 1.2;
    const near = bars.filter((o) => Math.abs(o.cx - m.cx) < half + o.w / 2);
    let ty;
    if (m.down) {
      ty = Math.max(...near.map((o) => o.yBot)) + fs * 1.1;
      if (ty > base + plotH) continue;
    } else {
      ty = Math.min(...near.map((o) => o.yTop)) - fs * 0.45;
      if (ty - fs * 0.8 < padT - fs * 0.2) continue;
    }
    placed.push(m.cx);
    out.push(`<text x="${f1(m.cx)}" y="${f1(ty)}" text-anchor="middle" class="ch-val">${(Math.round(m.r.p * 10) / 10).toFixed(1)}</text>`);
  }
  // Invisible, full-height tap targets: tapping a half hour shows its time and price.
  for (const r of shown) {
    const x0 = Math.max(padL, x(r.start)), x1 = Math.min(W - padR, x(r.end));
    out.push(`<rect x="${f1(x0)}" y="${padT}" width="${f1(x1 - x0)}" height="${f1(base - padT)}" fill="transparent" class="ch-hit" data-start="${r.start}" data-end="${r.end}" data-p="${r.p}"/>`);
  }
  out.push('</svg>');
  return out.join('');
}

/** About four gridlines for a kWh axis. */
function kwhStep(max) {
  for (const s of [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50]) if (max / s <= 4) return s;
  return 100;
}

/**
 * Usage by hour of the day as an SVG string: 24 bars from midnight, each in the colour of the
 * price band you paid at that hour, with full-height tap targets.
 * @param {object} o
 * @param {(number|null)[]} o.values kWh for each hour (null: no readings for that hour)
 * @param {string[]} o.bands price band for each hour ('cheap', 'mid', 'high', 'plunge' or 'none')
 * @param {number} [o.selected] the hour picked (the others fade)
 */
export function renderHours({ values, bands, width, height, fs = 12, selected = -1 }) {
  const W = Math.max(160, Math.round(width));
  const H = Math.max(80, Math.round(height));
  const padL = Math.round(fs * 2.8), padR = 2, padT = Math.round(fs * 0.7), padB = Math.round(fs * 2);
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="chart-svg uc-svg" role="img" aria-label="Electricity used in each hour of the day (Table shows the figures)">`];
  const max = Math.max(0, ...values.filter(Number.isFinite));
  if (!(max > 0)) {
    out.push(`<text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="ch-empty">No usage to show yet</text></svg>`);
    return out.join('');
  }
  const step = kwhStep(max);
  const top = Math.ceil(max / step - 1e-9) * step;
  const y = (v) => padT + (1 - v / top) * plotH;
  const base = H - padB;
  for (let v = 0; v <= top + 1e-9; v += step) {
    const yy = Math.round(y(v)) + 0.5;
    out.push(`<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" class="${v === 0 ? 'ch-zero' : 'ch-grid'}"/>`);
    out.push(`<text x="${padL - Math.round(fs * 0.6)}" y="${f1(yy + fs * 0.35)}" text-anchor="end" class="ch-y">${+v.toFixed(2)}</text>`);
  }
  const slot = plotW / 24;
  const w = Math.max(2, Math.min(28, slot - 2));
  for (let hr = 0; hr < 24; hr++) {
    const v = values[hr];
    const x0 = padL + hr * slot;
    if (Number.isFinite(v) && v > 0) {
      const bx = x0 + (slot - w) / 2;
      const b = bands[hr] || 'none';
      out.push(`<path d="${barPath(bx, w, Math.min(y(v), base - 1.5), base, false)}" fill="${BAND_COLOURS[b]}" class="ch-bar band-${b}${hr === selected ? ' on' : ''}"/>`);
    }
    if (hr % 3 === 0) out.push(`<text x="${f1(x0 + slot / 2)}" y="${f1(H - fs * 0.45)}" text-anchor="middle" class="ch-x">${String(hr).padStart(2, '0')}:00</text>`);
  }
  for (let hr = 0; hr < 24; hr++) {
    out.push(`<rect x="${f1(padL + hr * slot)}" y="${padT}" width="${f1(slot)}" height="${f1(base - padT)}" fill="transparent" class="uc-hit" data-h="${hr}"/>`);
  }
  out.push('</svg>');
  return out.join('');
}

/**
 * Today's usage as an SVG string: a bar for each half hour from midnight to midnight (local
 * clock; 46 or 50 of them on clock-change days), the "now" line, and a faint box where readings
 * haven't arrived yet (Bright is about half an hour behind). Built only from numbers.
 * @param {{start:number,end:number,kwh:number|null}[]} o.slots half-hourly readings
 * @param {number} o.dayStart, o.dayEnd local midnight to midnight (epoch ms)
 */
export function renderUsageDay({ slots, now, dayStart, dayEnd, width, height, fs = 12, tz = DEFAULT_TZ, day = 'today' }) {
  const W = Math.max(160, Math.round(width));
  const H = Math.max(80, Math.round(height));
  const padL = Math.round(fs * 2.8), padR = 2, padT = Math.round(fs * 1.9), padB = Math.round(fs * 2);
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="chart-svg use-svg" role="img" aria-label="Electricity used in each half hour ${/^(today|yesterday)$/.test(day) ? day : `on ${day}`}">`];
  const shown = (slots || []).filter((s) => s.start >= dayStart && s.start < dayEnd && Number.isFinite(s.kwh));
  const x = (t) => padL + ((t - dayStart) / (dayEnd - dayStart)) * plotW;
  const base = H - padB;
  const max = Math.max(0.2, ...shown.map((s) => s.kwh));
  const step = kwhStep(max);
  const top = Math.ceil(max / step - 1e-9) * step;
  const y = (v) => padT + (1 - v / top) * plotH;
  for (let v = 0; v <= top + 1e-9; v += step) {
    const yy = Math.round(y(v)) + 0.5;
    out.push(`<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" class="${v === 0 ? 'ch-zero' : 'ch-grid'}"/>`);
    out.push(`<text x="${padL - Math.round(fs * 0.6)}" y="${f1(yy + fs * 0.35)}" text-anchor="end" class="ch-y">${+v.toFixed(2)}</text>`);
  }
  // X labels every 3 hours on the local clock.
  for (let t = Math.ceil(dayStart / 3600e3) * 3600e3; t < dayEnd; t += 3600e3) {
    const p = partsInTz(t, tz);
    if (p.min !== 0 || p.h % 3 !== 0) continue;
    const xx = x(t);
    if (xx > W - padR - fs * 1.6) continue;
    out.push(`<text x="${f1(Math.max(xx, padL + fs * 1.4))}" y="${f1(H - fs * 0.45)}" text-anchor="middle" class="ch-x">${String(p.h).padStart(2, '0')}:00</text>`);
  }
  // Readings still to come: a faint box from the newest reading to now.
  const lastEnd = shown.length ? Math.max(...shown.map((s) => s.end)) : dayStart;
  if (now - lastEnd > 3600e3 && now > dayStart) {
    const px = x(lastEnd) + 2, nx = x(Math.min(now, dayEnd));
    out.push(`<rect x="${f1(px)}" y="${padT}" width="${f1(Math.max(0, nx - px))}" height="${f1(base - padT)}" rx="6" class="ch-pending"/>`);
    if (nx - px > fs * 9) out.push(`<text x="${f1((px + nx) / 2)}" y="${f1(padT + plotH * 0.45)}" text-anchor="middle" class="ch-note">Readings due</text>`);
  }
  // Bars, a 2px gap between neighbours; the biggest gets its value.
  let biggest = null;
  for (const s of shown) {
    const x0 = x(s.start), x1 = x(Math.min(s.end, dayEnd));
    const w = Math.max(1, Math.min(24, x1 - x0 - 2));
    const bx = x0 + (x1 - x0 - w) / 2;
    const yTop = Math.min(y(s.kwh), base - 1.5);
    out.push(`<path d="${barPath(bx, w, yTop, base, false)}" fill="#4f9cf0" class="ch-bar ch-use"/>`);
    if (!biggest || s.kwh > biggest.s.kwh) biggest = { s, cx: bx + w / 2, yTop };
  }
  if (!shown.length) out.push(`<text x="${f1(padL + plotW / 2)}" y="${f1(padT + plotH * 0.45)}" text-anchor="middle" class="ch-empty">${day === 'today' ? 'No readings yet today' : `No readings for ${day}`}</text>`);
  // Now marker.
  if (now >= dayStart && now < dayEnd) {
    const nx = Math.round(x(now)) + 0.5;
    out.push(`<line x1="${nx}" x2="${nx}" y1="${padT - Math.round(fs * 0.5)}" y2="${base}" class="ch-now"/>`);
    out.push(`<text x="${Math.min(nx, W - padR - fs)}" y="${padT - Math.round(fs * 0.85)}" text-anchor="middle" class="ch-now-label">now</text>`);
  }
  if (biggest && biggest.yTop - fs * 0.8 > padT - fs * 0.2) {
    out.push(`<text x="${f1(biggest.cx)}" y="${f1(biggest.yTop - fs * 0.45)}" text-anchor="middle" class="ch-val">${biggest.s.kwh.toFixed(2)}</text>`);
  }
  // Tap targets: a half hour's kWh and average power.
  for (const s of shown) {
    const x0 = Math.max(padL, x(s.start)), x1 = Math.min(W - padR, x(Math.min(s.end, dayEnd)));
    out.push(`<rect x="${f1(x0)}" y="${padT}" width="${f1(x1 - x0)}" height="${f1(base - padT)}" fill="transparent" class="ch-hit" data-start="${s.start}" data-end="${s.end}" data-kwh="${s.kwh}"/>`);
  }
  out.push('</svg>');
  return out.join('');
}

const FUSE_FALLBACK = { elec: '#3987e5', gas: '#d95926' }; // the style sheets set the real (validated) colours

const poundStep = (max) => {
  for (const st of [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (max / st <= 4) return st;
  return 2000;
};
const pounds0 = (v) => `£${+v.toFixed(2)}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A bar with a square top (the lower segment of a stack). */
const flatBar = (x, w, yTop, yBot) => `M${f1(x)} ${f1(yBot)}V${f1(yTop)}h${f1(w)}V${f1(yBot)}Z`;

/**
 * Fuse's usage as an SVG string, for a day (`level` 'hour': 24 bars), a month ('day') or a year ('month').
 * Split (the default): a row of bars for each fuel on one shared time axis but each with its own kWh scale
 * (the two aren't comparable, and one scale would flatten the smaller). Stacked: one plot of what each bar
 * cost in pounds, electricity at the bottom and gas on top. The bar in progress is lighter: it's "so far".
 * Bars and tap targets (`ch-hit`, with the bar's figures) are drawn in the same order.
 * @param {object} o
 * @param {{fuel:string,label:string,min:number,hours:{start:number,end:number,kwh:number,pence:number,inProgress:boolean}[]}[]} o.rows
 *   `min`: the smallest top of the kWh scale, so a quiet bar doesn't fill the row
 * @param {boolean} [o.stacked]
 * @param {number} [o.minPounds] the smallest top of the stacked scale
 * @param {string} [o.day] 'today', 'yesterday', a date or 'this month'…, for the empty-row note and the description
 */
export function renderFuseChart({ rows, stacked = false, minPounds = 0.25, level = 'hour', now, start: from, end: to, width, height, fs = 12, tz = DEFAULT_TZ, day = 'today' }) {
  const W = Math.max(160, Math.round(width));
  const H = Math.max(120, Math.round(height));
  const padL = Math.round(fs * (stacked ? 3.6 : 2.8)), padR = 2, padT = Math.round(fs * 1.9), padB = Math.round(fs * 2);
  const plotW = W - padL - padR;
  const n = stacked ? 1 : Math.max(1, rows.length), gap = Math.round(fs * 0.7), head = stacked ? 0 : Math.round(fs * 1.4);
  const rowH = (H - padT - padB - gap * (n - 1)) / n;
  const x = (t) => padL + ((t - from) / (to - from)) * plotW;
  const unit = { hour: 'hour', day: 'day', month: 'month' }[level];
  const colour = (f) => FUSE_FALLBACK[f] || '#888';
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="chart-svg use-svg fuse-svg" role="img" aria-label="${stacked ? 'What electricity and gas cost' : 'Electricity and gas used'} in each ${unit} ${/^(today|yesterday)$/.test(day) ? day : `(${day})`}">`];
  const bars = [], hits = [], over = [];
  const box = (b) => {
    const x0 = x(b.start), x1 = x(Math.min(b.end, to));
    const w = Math.max(1, Math.min(24, x1 - x0 - 2));
    return { x: x0 + (x1 - x0 - w) / 2, w, x0, x1 };
  };
  const hit = (b, plotTop, base, attrs) => {
    const bx = box(b), hx0 = Math.max(padL, bx.x0), hx1 = Math.min(W - padR, bx.x1);
    hits.push(`<rect x="${f1(hx0)}" y="${f1(plotTop)}" width="${f1(hx1 - hx0)}" height="${f1(base - plotTop)}" fill="transparent" class="ch-hit" data-level="${level}" data-start="${b.start}" data-end="${b.end}" ${attrs}/>`);
  };
  // A value above the biggest bar, kept inside the plot (clear of the axis figures) when that bar is at an edge.
  const valueLabel = (cx, y, str) => {
    const half = (str.length * fs * 0.62) / 2 + 3;
    return `<text x="${f1(Math.min(Math.max(cx, padL + half), W - padR - half))}" y="${f1(y)}" text-anchor="middle" class="ch-val">${str}</text>`;
  };
  const emptyNote = (cx, cy, what) => out.push(`<text x="${f1(cx)}" y="${f1(cy)}" text-anchor="middle" class="ch-empty">${day === 'today' ? `No ${what}readings yet today` : `No ${what}readings for ${day}`}</text>`);

  if (stacked) {
    // One plot: pounds, the fuels stacked.
    const plotTop = padT, base = padT + rowH;
    const times = [...new Set(rows.flatMap((r) => r.hours.filter((h) => h.start >= from && h.start < to).map((h) => h.start)))].sort((a, b) => a - b);
    const cols = times.map((t) => ({ t, parts: rows.map((r) => ({ fuel: r.fuel, h: r.hours.find((h) => h.start === t) })).filter((p) => p.h) }));
    const total = (c) => c.parts.reduce((a, p) => a + p.h.pence, 0) / 100;
    const max = Math.max(minPounds, ...cols.map(total));
    const step = poundStep(max), topV = Math.ceil(max / step - 1e-9) * step;
    const y = (v) => plotTop + (1 - v / topV) * (base - plotTop);
    for (let v = 0; v <= topV + 1e-9; v += step) {
      const yy = Math.round(y(v)) + 0.5;
      out.push(`<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" class="${v === 0 ? 'ch-zero' : 'ch-grid'}"/>`);
      out.push(`<text x="${padL - Math.round(fs * 0.6)}" y="${f1(yy + fs * 0.35)}" text-anchor="end" class="ch-y">${pounds0(v)}</text>`);
    }
    if (!cols.length) emptyNote(padL + plotW / 2, plotTop + (base - plotTop) * 0.5, '');
    let biggest = null;
    for (const c of cols) {
      const b = { start: c.t, end: c.parts[0].h.end, inProgress: c.parts.some((p) => p.h.inProgress) };
      const bx = box(b);
      let lo = 0;
      const segs = c.parts.map((p, i) => {
        const hi = lo + p.h.pence / 100;
        const yTop = Math.min(y(hi), y(lo) - 1.5), yBot = y(lo) - (i ? 2 : 0); // a 2px gap between the segments
        lo = hi;
        const last = i === c.parts.length - 1;
        return `<path d="${last ? barPath(bx.x, bx.w, yTop, yBot, false) : flatBar(bx.x, bx.w, yTop, yBot)}" fill="${colour(p.fuel)}" class="ch-seg ch-${p.fuel}"/>`;
      });
      bars.push(`<g class="ch-bar ch-stack${b.inProgress ? ' ch-sofar' : ''}">${segs.join('')}</g>`);
      const tot = total(c);
      if (!biggest || tot > biggest.tot) biggest = { tot, cx: bx.x + bx.w / 2, yTop: y(tot) };
      const get = (f, k) => c.parts.find((p) => p.fuel === f)?.h[k] ?? 0;
      hit(b, plotTop, base, `data-fuel="both" data-sofar="${b.inProgress ? 1 : 0}" data-elec-kwh="${get('elec', 'kwh')}" data-elec-pence="${get('elec', 'pence')}" data-gas-kwh="${get('gas', 'kwh')}" data-gas-pence="${get('gas', 'pence')}"`);
    }
    if (biggest && biggest.tot > 0 && biggest.yTop - fs * 0.8 > plotTop - fs * 0.2) over.push(valueLabel(biggest.cx, biggest.yTop - fs * 0.45, pounds0(biggest.tot)));
  } else {
    rows.forEach((row, i) => {
      const top = padT + i * (rowH + gap);
      const plotTop = top + head, base = top + rowH;
      const hours = row.hours.filter((h) => h.start >= from && h.start < to && Number.isFinite(h.kwh));
      const max = Math.max(row.min, ...hours.map((h) => h.kwh));
      const step = kwhStep(max), topV = Math.ceil(max / step - 1e-9) * step;
      const y = (v) => plotTop + (1 - v / topV) * (base - plotTop);
      // The row's name, with a swatch of its colour (the legend; text itself stays in ink).
      out.push(`<rect x="${padL}" y="${f1(top + fs * 0.1)}" width="${f1(fs * 0.8)}" height="${f1(fs * 0.8)}" rx="2" class="ch-key ch-${row.fuel}" fill="${colour(row.fuel)}"/>`);
      out.push(`<text x="${f1(padL + fs * 1.15)}" y="${f1(top + fs * 0.85)}" class="ch-rowname">${row.label}</text>`);
      // Gridlines at each step; all of them labelled only when there's room.
      const roomy = (base - plotTop) / (topV / step) >= fs * 1.8;
      for (let v = 0; v <= topV + 1e-9; v += step) {
        const yy = Math.round(y(v)) + 0.5;
        out.push(`<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" class="${v === 0 ? 'ch-zero' : 'ch-grid'}"/>`);
        if (roomy || v === 0 || v + step > topV + 1e-9) out.push(`<text x="${padL - Math.round(fs * 0.6)}" y="${f1(yy + fs * 0.35)}" text-anchor="end" class="ch-y">${+v.toFixed(2)}</text>`);
      }
      const used = hours.filter((h) => h.kwh > 0);
      if (!used.length) {
        emptyNote(padL + plotW / 2, plotTop + (base - plotTop) * 0.55, `${row.label.toLowerCase()} `);
      } else if (level === 'hour') {
        // Readings still to come: a faint box from this fuel's newest reading to now.
        const lastEnd = Math.max(...used.map((h) => (h.inProgress ? h.start + 1800e3 : h.end)));
        if (now - lastEnd > 90 * 60e3 && now > from && lastEnd < to) {
          const px = x(lastEnd) + 2, nx = x(Math.min(now, to));
          out.push(`<rect x="${f1(px)}" y="${f1(plotTop)}" width="${f1(Math.max(0, nx - px))}" height="${f1(base - plotTop)}" rx="6" class="ch-pending"/>`);
          if (nx - px > fs * 9) out.push(`<text x="${f1((px + nx) / 2)}" y="${f1(plotTop + (base - plotTop) * 0.55)}" text-anchor="middle" class="ch-note">Readings due</text>`);
        }
      }
      // Bars, a 2px gap between neighbours; the biggest gets its value.
      let biggest = null;
      for (const h of hours) {
        const bx = box(h);
        const yTop = Math.min(y(h.kwh), base - 1.5);
        bars.push(`<path d="${barPath(bx.x, bx.w, yTop, base, false)}" fill="${colour(row.fuel)}" class="ch-bar ch-${row.fuel}${h.inProgress ? ' ch-sofar' : ''}"/>`);
        if (!biggest || h.kwh > biggest.h.kwh) biggest = { h, cx: bx.x + bx.w / 2, yTop };
        hit(h, plotTop, base, `data-fuel="${row.fuel}" data-sofar="${h.inProgress ? 1 : 0}" data-kwh="${h.kwh}" data-pence="${h.pence}"`);
      }
      // Its value sits above the bar; not when that lands on the row's name (a bar at the top of the scale, near the left).
      const nameEnd = padL + fs * 1.15 + row.label.length * fs * 0.65;
      const onName = biggest && biggest.yTop - fs * 0.45 < plotTop + fs * 0.2 && biggest.cx - fs * 1.4 < nameEnd;
      if (biggest && biggest.h.kwh > 0 && !onName && biggest.yTop - fs * 0.8 > plotTop - fs * 0.2) {
        over.push(valueLabel(biggest.cx, biggest.yTop - fs * 0.45, biggest.h.kwh.toFixed(biggest.h.kwh >= 100 ? 0 : 2)));
      }
    });
  }

  // X labels, shared by the rows: every 3 hours for a day; the 1st, 5th, 10th… for a month; each month for a year.
  const labelY = f1(H - fs * 0.45), tickAt = (xx) => f1(Math.min(Math.max(xx, padL + fs * 1.4), W - padR - fs * 1.4));
  if (level === 'hour') {
    for (let t = Math.ceil(from / 3600e3) * 3600e3; t < to; t += 3600e3) {
      const p = partsInTz(t, tz);
      if (p.min !== 0 || p.h % 3 !== 0) continue;
      const xx = x(t);
      if (xx > W - padR - fs * 1.6) continue;
      out.push(`<text x="${tickAt(xx)}" y="${labelY}" text-anchor="middle" class="ch-x">${String(p.h).padStart(2, '0')}:00</text>`);
    }
  } else if (level === 'day') {
    const days = Math.round((to - from) / 864e5);
    for (let d = 1; d <= days; d++) {
      if (d !== 1 && d % 5 !== 0) continue;
      if (days - d < 2 && d !== days && d !== 1) continue; // not squeezed against the end
      const t = from + (d - 1) * 864e5 + 12 * 3600e3; // midday: clear of the clock change
      const xx = (x(t - 12 * 3600e3) + x(t + 12 * 3600e3)) / 2;
      out.push(`<text x="${tickAt(xx)}" y="${labelY}" text-anchor="middle" class="ch-x">${d}</text>`);
    }
  } else {
    const yr = partsInTz(from + 6 * 3600e3, tz).y;
    const monthStart = (m) => (m > 11 ? to : startOfDay(localToMs(`${yr}-${String(m + 1).padStart(2, '0')}-01T12:00`, tz), tz));
    for (let m = 0; m < 12; m++) {
      const xx = (x(monthStart(m)) + x(monthStart(m + 1))) / 2;
      out.push(`<text x="${f1(xx)}" y="${labelY}" text-anchor="middle" class="ch-x">${plotW / 12 >= fs * 3.4 ? MONTHS[m] : MONTHS[m][0]}</text>`);
    }
  }
  out.push(...bars, ...over);
  // Now marker (a day only): through every row.
  if (level === 'hour' && now >= from && now < to) {
    const nx = Math.round(x(now)) + 0.5;
    out.push(`<line x1="${nx}" x2="${nx}" y1="${padT - Math.round(fs * 0.5)}" y2="${f1(padT + n * rowH + (n - 1) * gap)}" class="ch-now"/>`);
    out.push(`<text x="${Math.min(nx, W - padR - fs)}" y="${padT - Math.round(fs * 0.85)}" text-anchor="middle" class="ch-now-label">now</text>`);
  }
  out.push(...hits, '</svg>');
  return out.join('');
}
