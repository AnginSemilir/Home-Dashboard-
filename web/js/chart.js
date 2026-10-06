// Agile price bar chart as an SVG string. Built only from numbers and fixed labels.
// Styling (text, gridlines, the now marker, themed bar colours) lives in the style sheets
// (css/bold.css, css/ambient.css); the bar fills here are only a fallback.

import { band } from './agile.js';
import { partsInTz, weekdayShort, DEFAULT_TZ } from './time.js';

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
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="chart-svg uc-svg" role="img" aria-label="Electricity used in each hour of the day">`];
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
