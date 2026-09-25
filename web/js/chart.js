// Agile price bar chart as an SVG string. Built only from numbers and fixed labels.

import { band } from './agile.js';
import { partsInTz, weekdayShort, DEFAULT_TZ } from './time.js';

export const BAND_COLOURS = { plunge: '#3d9bff', cheap: '#3fb950', mid: '#f0a02c', high: '#f25f55', none: '#667' };

function niceStep(range) {
  for (const s of [2, 5, 10, 20, 50]) if (range / s <= 5) return s;
  return 100;
}

/**
 * @param {object} o
 * @param {{start:number,end:number,p:number}[]} o.rates
 * @param {number} o.now epoch ms
 * @param {number} o.width  pixels
 * @param {number} o.height pixels
 */
export function renderChart({ rates, now, width, height, tz = DEFAULT_TZ, cheap = 15, pricey = 25, hoursBefore = 1, hours = 24 }) {
  const W = Math.max(120, Math.round(width));
  const H = Math.max(80, Math.round(height));
  const padL = 30, padR = 6, padT = 16, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const from = Math.floor(now / 1800e3) * 1800e3 - hoursBefore * 3600e3;
  const to = from + hours * 3600e3;
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

  // Grid + y labels
  for (let v = bottom; v <= top + 1e-9; v += step) {
    const yy = y(v).toFixed(1);
    out.push(`<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" class="${v === 0 ? 'ch-zero' : 'ch-grid'}"/>`);
    out.push(`<text x="${padL - 5}" y="${(+yy + 3.5).toFixed(1)}" text-anchor="end" class="ch-y">${v}</text>`);
  }

  // Bars
  for (const r of shown) {
    const x0 = x(Math.max(r.start, from)), x1 = x(Math.min(r.end, to));
    const w = Math.max(1, x1 - x0 - Math.min(2, (x1 - x0) * 0.18));
    const y0 = y(Math.max(r.p, 0)), y1 = y(Math.min(r.p, 0));
    const past = r.end <= now ? ' ch-past' : '';
    out.push(`<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, y1 - y0).toFixed(1)}" rx="1.5" fill="${BAND_COLOURS[band(r.p, { cheap, pricey })]}" class="ch-bar${past}"/>`);
  }

  // X labels: every 3 hours on the local clock; the day name at midnight.
  for (let t = Math.ceil(from / 3600e3) * 3600e3; t <= to; t += 3600e3) {
    const p = partsInTz(t, tz);
    if (p.min !== 0 || p.h % 3 !== 0) continue;
    const xx = x(t);
    if (xx < padL + 12 || xx > W - padR - 12) continue;
    const label = p.h === 0 ? weekdayShort(t, tz) : `${String(p.h).padStart(2, '0')}:00`;
    out.push(`<line x1="${xx.toFixed(1)}" x2="${xx.toFixed(1)}" y1="${H - padB}" y2="${H - padB + 4}" class="ch-tick"/>`);
    out.push(`<text x="${xx.toFixed(1)}" y="${H - 6}" text-anchor="middle" class="ch-x${p.h === 0 ? ' ch-day' : ''}">${label}</text>`);
  }

  // Tomorrow's prices aren't published until about 4pm: say so in the empty space.
  const lastEnd = Math.max(...shown.map((r) => r.end));
  if (to - lastEnd > 3 * 3600e3) {
    const cx = (x(lastEnd) + x(to)) / 2;
    out.push(`<text x="${cx.toFixed(1)}" y="${(padT + plotH / 2).toFixed(1)}" text-anchor="middle" class="ch-note">prices from</text>`);
    out.push(`<text x="${cx.toFixed(1)}" y="${(padT + plotH / 2 + 15).toFixed(1)}" text-anchor="middle" class="ch-note">~4pm</text>`);
  }

  // Now marker
  const nx = x(now).toFixed(1);
  out.push(`<line x1="${nx}" x2="${nx}" y1="${padT - 4}" y2="${H - padB}" class="ch-now"/>`);
  out.push(`<text x="${nx}" y="${padT - 6}" text-anchor="middle" class="ch-now-label">now</text>`);
  out.push('</svg>');
  return out.join('');
}
