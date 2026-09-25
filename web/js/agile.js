// Pure Agile price logic. A "rate" is { start, end, p } with start/end in epoch ms and p in
// pence per kWh including VAT. Slots are usually 30 minutes, but nothing here assumes that.

import { startOfDay, hhmm, dayKey, DEFAULT_TZ } from './time.js';

/** Convert Octopus REST `standard-unit-rates` results into sorted, de-duplicated rates. */
export function ratesFromOctopus(results, { preferDirectDebit = true, until } = {}) {
  const out = new Map();
  for (const r of results || []) {
    if (r.payment_method && preferDirectDebit && r.payment_method.toUpperCase() !== 'DIRECT_DEBIT') continue;
    if (r.payment_method && !preferDirectDebit && r.payment_method.toUpperCase() === 'DIRECT_DEBIT') continue;
    const start = Date.parse(r.valid_from);
    const end = r.valid_to ? Date.parse(r.valid_to) : NaN;
    const p = Number(r.value_inc_vat);
    if (!Number.isFinite(start) || !Number.isFinite(p)) continue;
    out.set(start, { start, end, p });
  }
  const sorted = [...out.values()].sort((a, b) => a.start - b.start);
  // Rates without an end (a fixed or variable tariff's current rate) end where the next one
  // starts, or run to the end of the period asked for. (Not Infinity: it's saved as JSON.)
  for (let i = 0; i < sorted.length; i++) {
    if (!Number.isFinite(sorted[i].end)) {
      sorted[i].end = sorted[i + 1] ? sorted[i + 1].start : Math.max(sorted[i].start + 30 * 60e3, Number.isFinite(until) ? until : 0);
    }
  }
  return sorted;
}

export function currentIndex(rates, now) {
  return rates.findIndex((r) => r.start <= now && now < r.end);
}

/** Round to one decimal place, the precision shown on the panel. */
export const round1 = (p) => Math.round(p * 10) / 10;

/** Colour band for a price (pence). Thresholds are configurable; the displayed (rounded) value decides. */
export function band(p, { cheap = 15, pricey = 25 } = {}) {
  if (!Number.isFinite(p)) return 'none';
  const v = round1(p);
  if (v <= 0) return 'plunge';
  if (v < cheap) return 'cheap';
  if (v < pricey) return 'mid';
  return 'high';
}

/**
 * Everything the "price now" card needs.
 * Returns null if the current slot isn't in the data.
 */
export function priceSummary(rates, now, tz = DEFAULT_TZ) {
  const i = currentIndex(rates, now);
  if (i < 0) return null;
  const cur = rates[i];
  const ahead = rates.slice(i + 1);
  let best = cur;
  for (const r of ahead) if (r.p < best.p) best = r;
  const today = dayKey(now, tz);
  return {
    current: cur,
    next: ahead[0] || null,
    cheapest: best,
    cheapestIsNow: best === cur,
    cheapestLabel: best === cur ? 'now' : `${hhmm(best.start, tz)}${dayKey(best.start, tz) === today ? '' : ' tomorrow'}`,
    knownUntil: rates.length ? rates[rates.length - 1].end : null,
  };
}

/** Rates that overlap [from, to). */
export function window(rates, from, to) {
  return rates.filter((r) => r.end > from && r.start < to);
}

/** Today's slots in the panel time zone (46, 48 or 50 on clock-change days if the data is complete). */
export function todaysRates(rates, now, tz = DEFAULT_TZ) {
  return window(rates, startOfDay(now, tz), startOfDay(now, tz, 1));
}

/** True once Octopus has published tomorrow's prices (they usually appear 4–8pm). */
export function hasTomorrow(rates, now, tz = DEFAULT_TZ) {
  const s = startOfDay(now, tz, 1);
  return rates.some((r) => r.start >= s && r.start < startOfDay(now, tz, 2));
}

/** Price (pence) in force at an instant, or null. */
export function priceAt(rates, ms) {
  const r = rates.find((x) => x.start <= ms && ms < x.end);
  return r ? r.p : null;
}
