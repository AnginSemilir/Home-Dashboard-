// Average electricity prices for the pop-up on the price card: over the last 30 minutes and the
// last hour, and today, this week (from Monday), this month and this year so far.
// - "You paid": what the electricity you used cost, divided by the kWh. Half hours when you used
//   more count for more. This is the figure to set against a fixed price.
// - "Agile price": the plain average over time, every half hour counting the same.
// Neither includes the standing charge.
//
// Past days never change, so each day's totals are worked out once and kept on this tablet (a
// few kB). Prices come from Octopus's public price list; usage from the smart meter's
// half-hourly readings. Those usually arrive the next day (sometimes later), so until they do,
// the Home Mini's readings stand in: the ones the panel kept as each day ended, or, failing
// that, the Home Mini's history from Octopus. Today's usage is the Home Mini's.

import { startOfDay, dayKey, partsInTz, DEFAULT_TZ } from './time.js';
import { HttpError } from './util.js';

export const STATS_KEY = 'wallpanel.stats.v1';
const VERSION = 2;
const MIN = 60e3;
const HALF = 1800e3;
const CHUNK_DAYS = 31;            // prices a month at a time (one request each), newest first
const USAGE_RECHECK = 30 * 60e3;  // look again for late meter readings at most this often
const USAGE_GIVE_UP = 10;         // days: readings still missing after this are left out for good
const MINI_DAYS = 7;              // the Home Mini's history is asked for this far back at most

/** Where each period starts. Weeks start on Monday. */
export function periodStarts(now, tz = DEFAULT_TZ) {
  const p = partsInTz(now, tz);
  const date = Date.UTC(p.y, p.m - 1, p.d);
  const sinceMonday = (new Date(date).getUTCDay() + 6) % 7;
  const sinceNewYear = Math.round((date - Date.UTC(p.y, 0, 1)) / 864e5);
  return {
    min30: now - 30 * MIN,
    hour: now - 60 * MIN,
    today: startOfDay(now, tz),
    week: startOfDay(now, tz, -sinceMonday),
    month: startOfDay(now, tz, -(p.d - 1)),
    year: startOfDay(now, tz, -sinceNewYear),
  };
}

/** Add each rate's price × the minutes it overlaps [from, to) to `acc` ({ sum, min }). */
export function addRates(acc, rates, from, to) {
  for (const r of rates || []) {
    const a = Math.max(r.start, from), b = Math.min(r.end, to);
    if (b > a && Number.isFinite(r.p)) {
      acc.sum += (r.p * (b - a)) / MIN;
      acc.min += (b - a) / MIN;
    }
  }
  return acc;
}

/** The price in force at `t`, from rates sorted by time (null if none). */
export function priceFinder(rates) {
  return (t) => {
    let lo = 0, hi = rates.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, r = rates[mid];
      if (t < r.start) hi = mid - 1;
      else if (t >= r.end) lo = mid + 1;
      else return Number.isFinite(r.p) ? r.p : null;
    }
    return null;
  };
}

/**
 * Add usage ({ start, end, kwh }) that overlaps [from, to) to `acc` ({ cost, kwh, n }), each
 * reading at the price when it started. Part of a reading counts pro rata; `n` is in half hours.
 */
export function addUsage(acc, usage, priceAt, from, to) {
  for (const u of usage || []) {
    const a = Math.max(u.start, from), b = Math.min(u.end, to);
    if (!(b > a) || !Number.isFinite(u.kwh)) continue;
    const p = priceAt(u.start);
    if (p == null) continue;
    const kwh = (u.kwh * (b - a)) / (u.end - u.start);
    acc.cost += kwh * p;
    acc.kwh += kwh;
    acc.n += (b - a) / HALF;
  }
  return acc;
}

/** The local days from midnight `from` up to `to`: [{ key, start, end }] (23 or 25 hours on clock-change days). */
export function daysBetween(from, to, tz = DEFAULT_TZ) {
  const out = [];
  for (let s = from; s < to;) {
    const e = startOfDay(s, tz, 1);
    if (!(e > s)) break;
    out.push({ key: dayKey(s, tz), start: s, end: e });
    s = e;
  }
  return out;
}

const r4 = (x) => Math.round(x * 1e4) / 1e4;

/**
 * Which tariff applied when: the account's agreements (so a year that started on another tariff
 * is priced with that tariff), else the one tariff known (typed in Settings, or found).
 */
export function tariffSegments(settings) {
  const o = settings.octopus;
  const d = o.discovered;
  if (d?.history?.length) return d.history;
  const t = o.tariff || d?.tariff;
  return t ? [{ tariff: t, from: null, to: null }] : [];
}

// Economy 7 and other two-rate tariffs have day and night prices in other lists: not covered.
const singleRate = (tariff) => /^E-1R-/.test(tariff);
const segFrom = (x) => x.from ?? -Infinity;
const segTo = (x) => x.to ?? Infinity;

/** Minutes of [from, to) that a single-price tariff covers (`skip`: tariffs Octopus didn't know). */
function pricedMinutes(segs, from, to, skip) {
  let m = 0;
  for (const x of segs) {
    if (singleRate(x.tariff) && !skip.has(x.tariff)) m += Math.max(0, Math.min(to, segTo(x)) - Math.max(from, segFrom(x))) / MIN;
  }
  return m;
}

/** Consecutive days → stretches of at most `max` days, so each is one request. */
function stretches(days, max) {
  const out = [];
  for (const d of days) {
    const last = out[out.length - 1];
    if (last && last.length < max && last[last.length - 1].end === d.start) last.push(d);
    else out.push([d]);
  }
  return out;
}

/** Readings (sorted) → Map of day key → that day's readings, for days sorted by time. */
function byDay(list, days) {
  const out = new Map();
  let i = 0;
  for (const d of days) {
    const mine = [];
    while (i < list.length && list[i].start < d.start) i++;
    while (i < list.length && list[i].start < d.end) mine.push(list[i++]);
    out.set(d.key, mine);
  }
  return out;
}

/** Does the list cover the whole day? */
function coversDay(rates, d) {
  return addRates({ sum: 0, min: 0 }, rates, d.start, d.end).min >= (d.end - d.start) / MIN;
}

export class PriceStats {
  /** `octopus`: the Octopus client (tariff(), unitRates(), consumption(), canReadUsage). */
  constructor({ octopus, settings, tz = DEFAULT_TZ, storage = globalThis.localStorage }) {
    this.o = octopus;
    this.s = settings;
    this.tz = tz;
    this.storage = storage;
    this.busy = null;
    this.usageAt = 0;
    this.data = this.#load();
  }

  #load() {
    try {
      const d = JSON.parse(this.storage.getItem(STATS_KEY) || 'null');
      if (d?.v === VERSION && d.days && typeof d.days === 'object') return { mini: {}, ...d };
    } catch { /* unreadable: start again */ }
    return { v: VERSION, sig: '', days: {}, mini: {} };
  }

  #save(data) {
    if (data !== this.data) return; // replaced while loading (see #segments)
    try { this.storage.setItem(STATS_KEY, JSON.stringify(data)); } catch { /* storage full: it just loads again next time */ }
  }

  /** The tariffs in use. A change (new tariff, corrected history, another meter) starts the saved days again. */
  #segments() {
    const segs = tariffSegments(this.s);
    const d = this.s.octopus.discovered;
    const meter = this.o.canReadUsage ? `${d.mpan}/${d.serial}` : '';
    const sig = `${segs.map((x) => `${x.tariff}@${x.from ?? ''}-${x.to ?? ''}`).join(',')}|${meter}`;
    // (The Home Mini's readings don't depend on the tariff: they're kept.)
    if (sig !== this.data.sig) this.data = { v: VERSION, sig, days: {}, mini: this.data.mini || {} };
    return segs;
  }

  /**
   * Keep the Home Mini's half hours for days that have ended ({ start, kwh }; today's are
   * ignored). The panel passes its readings as each day ends, so the averages needn't wait for
   * the meter's own readings, which Octopus usually has the next day.
   */
  keepReadings(slots, now) {
    this.#segments();
    const today = dayKey(now, this.tz), oldest = dayKey(now - USAGE_GIVE_UP * 864e5, this.tz);
    const days = {};
    for (const x of slots || []) {
      const k = dayKey(x.start, this.tz);
      if (k >= today || k < oldest || !Number.isFinite(x.kwh)) continue;
      (days[k] ||= []).push([x.start, r4(x.kwh)]);
    }
    let changed = false;
    for (const [k, list] of Object.entries(days)) {
      if ((this.data.mini[k]?.length || 0) > list.length) continue; // keep the fuller copy
      this.data.mini[k] = list;
      changed = true;
      if (this.data.days[k] && !this.data.days[k].u) this.usageAt = 0; // worth working that day out again
    }
    if (changed) this.#save(this.data);
  }

  /** Days before today the averages need: from Monday or 1 January, whichever is earlier. */
  #needed(now) {
    const s = periodStarts(now, this.tz);
    return daysBetween(Math.min(s.week, s.year), s.today, this.tz);
  }

  /** How many past days have no prices yet. */
  missing(now) {
    this.#segments();
    return this.#needed(now).filter((d) => !this.data.days[d.key]).length;
  }

  /**
   * Get whatever the averages still need: prices for past days not seen yet, and meter readings
   * that hadn't arrived last time. `live`: the panel's own list, { rates, tariff }. One at a time.
   * Throws (after saving what it got) if Octopus fails; `err.what` is 'usage' for the readings.
   */
  ensure(now, live) {
    this.busy ??= this.#fill(now, live).finally(() => { this.busy = null; });
    return this.busy;
  }

  async #fill(now, live) {
    const segs = this.#segments();
    const data = this.data;
    const gone = () => data !== this.data; // the tariff changed meanwhile: don't mix the two
    const need = this.#needed(now);
    // Forget days no period needs any more (last year's, once this week is past New Year).
    for (const k of Object.keys(data.days)) if (!need.length || k < need[0].key) delete data.days[k];
    const today = periodStarts(now, this.tz).today;
    const oldest = dayKey(today - USAGE_GIVE_UP * 864e5, this.tz);
    for (const k of Object.keys(data.mini)) if (k < oldest) delete data.mini[k];
    const usage = this.o.canReadUsage;
    const noPrices = need.filter((d) => !data.days[d.key]);
    const late = usage && now - this.usageAt >= USAGE_RECHECK ? need.filter((d) => data.days[d.key] && !data.days[d.key].u) : [];
    if (!noPrices.length && !late.length) { this.#save(data); return; }

    // Readings first, in one go: if they fail, the prices still load.
    let readings = null, usageErr = null;
    const wanted = [...noPrices, ...late].sort((a, b) => a.start - b.start);
    if (usage && wanted.length) {
      this.usageAt = now;
      try {
        readings = await this.o.consumption(wanted[0].start, wanted[wanted.length - 1].end);
      } catch (e) {
        usageErr = e;
        e.what = 'usage';
      }
      if (gone()) return;
    }
    const meter = readings ? byDay(readings, wanted) : new Map();
    // Recent days the meter's readings haven't reached, and the panel didn't keep: ask Octopus
    // for the Home Mini's (best effort: if that fails, those days wait for the meter).
    const gaps = wanted.filter((d) => d.start >= today - MINI_DAYS * 864e5 && !data.mini[d.key]?.length
      && (meter.get(d.key)?.length || 0) < (d.end - d.start) / HALF);
    if (this.o.hasHomeMini && gaps.length) {
      try {
        const got = await this.o.homeMiniReadings(gaps[0].start, gaps[gaps.length - 1].end);
        if (gone()) return;
        for (const [k, list] of byDay(got, gaps)) if (list.length) data.mini[k] = list.map((x) => [x.start, r4(x.kwh)]);
      } catch (e) {
        console.warn('[stats] Home Mini history', e);
      }
    }
    const work = readings ? wanted : noPrices;
    const unknown = new Set(); // tariffs Octopus has no prices for: their days count as unpriced

    const put = (d, rates) => {
      const pr = addRates({ sum: 0, min: 0 }, rates, d.start, d.end);
      const e = pricedMinutes(segs, d.start, d.end, unknown);
      const old = data.days[d.key];
      const day = { p: r4(pr.sum), m: r4(pr.min), e: r4(e) };
      // The meter's readings, with the Home Mini's for any half hour they don't have yet.
      const own = meter.get(d.key) || [];
      const have = new Set(own.map((x) => x.start));
      const mini = (data.mini[d.key] || []).filter(([start]) => !have.has(start)).map(([start, kwh]) => ({ start, end: start + HALF, kwh }));
      if (readings || mini.length) {
        const priceAt = priceFinder(rates);
        const u = addUsage({ cost: 0, kwh: 0, n: 0 }, [...own, ...mini], priceAt, d.start, d.end);
        const fromMeter = addUsage({ cost: 0, kwh: 0, n: 0 }, own, priceAt, d.start, d.end).n;
        // Done once the meter has a reading for every priced half hour, or it's too late to
        // expect them (only decided when Octopus answered).
        const done = !!readings && (fromMeter >= pr.min / 30 - 0.01 || d.start < today - USAGE_GIVE_UP * 864e5);
        Object.assign(day, { c: r4(u.cost), k: r4(u.kwh), n: r4(u.n), u: done ? 1 : 0 });
      } else if (old) Object.assign(day, { c: old.c, k: old.k, n: old.n, u: old.u });
      else Object.assign(day, { c: 0, k: 0, n: 0, u: usage ? 0 : 1 });
      data.days[d.key] = day;
    };

    // Prices: the panel's own list where it covers the whole day on the tariff it was fetched
    // for (yesterday, usually); the rest from Octopus a month at a time, newest first, saved as
    // each month arrives.
    const onLive = (d) => !!live?.tariff && segs.some((x) => x.tariff === live.tariff && segFrom(x) <= d.start && d.end <= segTo(x)) && coversDay(live.rates, d);
    for (const d of work.filter(onLive)) put(d, live.rates);
    this.#save(data);
    for (const days of stretches(work.filter((d) => !onLive(d)), CHUNK_DAYS).reverse()) {
      const from = days[0].start, to = days[days.length - 1].end;
      const rates = [];
      for (const seg of segs) {
        const a = Math.max(from, segFrom(seg)), b = Math.min(to, segTo(seg));
        if (b <= a || !singleRate(seg.tariff) || unknown.has(seg.tariff)) continue;
        let got;
        try {
          got = await this.o.unitRates(seg.tariff, a, b);
        } catch (e) {
          // Octopus doesn't know that tariff (an old or special one): those days have no price,
          // rather than the whole year failing every time. Any other error is tried again.
          if (e instanceof HttpError && e.status === 404) { unknown.add(seg.tariff); continue; }
          throw e;
        }
        if (gone()) return;
        for (const r of got) {
          const start = Math.max(r.start, a), end = Math.min(r.end, b);
          if (end > start) rates.push({ start, end, p: r.p });
        }
      }
      rates.sort((x, y) => x.start - y.start);
      for (const d of days) put(d, rates);
      this.#save(data);
    }
    if (usageErr) throw usageErr;
  }

  /**
   * The averages. `live`: the panel's own prices ({ rates }); `tele`: today's Home Mini readings.
   * Each row: { id, from, avg (pence) | null, paid (pence per kWh) | null, kwh, missing (past days
   * with no prices yet), firstAt (when prices start, if after `from`), short (Octopus has no price
   * for some half hours), gapDays (days, or parts, with no single price: Economy 7), usageShort
   * (some half hours have no reading yet, but should have soon) }.
   */
  rows(now, live, tele) {
    this.#segments();
    const rates = live?.rates || [];
    const priceAt = priceFinder(rates);
    const s = periodStarts(now, this.tz);
    const usage = this.o.canReadUsage;
    // The Home Mini's half hours: today's, and yesterday's kept ones (for the last hour just
    // after midnight).
    let readings = null;
    if (tele?.slots) {
      const all = new Map((this.data.mini[dayKey(s.today - HALF, this.tz)] || []).map(([start, kwh]) => [start, { start, end: start + HALF, kwh }]));
      for (const x of tele.slots) all.set(x.start, { start: x.start, end: Math.min(x.start + HALF, now), kwh: x.kwh });
      readings = [...all.values()].filter((x) => x.end > x.start && x.start < now).sort((a, b) => a.start - b.start);
    }
    const half = (from) => (now - from) / HALF;

    const recent = (id, from) => {
      const pr = addRates({ sum: 0, min: 0 }, rates, from, now);
      const u = readings ? addUsage({ cost: 0, kwh: 0, n: 0 }, readings, priceAt, from, now) : null;
      // Most of the window needs readings (the Home Mini's newest can be a minute or two late).
      const enough = !!u && u.n >= (id === 'today' ? half(from) - 1 : 0.9 * half(from));
      return {
        id, from,
        avg: pr.min ? pr.sum / pr.min : null,
        paid: enough && u.kwh > 0 ? u.cost / u.kwh : null,
        kwh: enough ? u.kwh : null,
        missing: 0, firstAt: null, gapDays: 0,
        short: !!pr.min && pr.min < (now - from) / MIN - 1,
        usageShort: !!u && !enough,
      };
    };
    const today = recent('today', s.today);

    const span = (id, from) => {
      const pr = addRates({ sum: 0, min: 0 }, rates, s.today, now);
      let expect = pr.min, missing = 0, firstAt = null, gapDays = 0, usageShort = today.usageShort;
      const u = readings ? addUsage({ cost: 0, kwh: 0, n: 0 }, readings, priceAt, s.today, now) : { cost: 0, kwh: 0, n: 0 };
      for (const d of daysBetween(from, s.today, this.tz)) {
        const v = this.data.days[d.key];
        if (!v) { missing++; continue; }
        pr.sum += v.p;
        pr.min += v.m;
        expect += v.e;
        u.cost += v.c;
        u.kwh += v.k;
        u.n += v.n;
        if (!v.u && v.n < v.m / 30 - 0.01) usageShort = true; // readings still expected
        if (v.m > 0 && firstAt == null) firstAt = d.start;
        if (firstAt != null && v.e < (d.end - d.start) / MIN - 1) gapDays++;
      }
      if (firstAt == null && pr.min) firstAt = s.today;
      const avg = !missing && pr.min ? pr.sum / pr.min : null;
      // A figure only once most of the period has readings: a week with yesterday's still to
      // come shows a dash, a year with one day to come still shows (with a note).
      const enough = u.n >= 0.9 * (pr.min / 30);
      return {
        id, from, avg,
        paid: usage && !missing && enough && u.kwh > 0 ? u.cost / u.kwh : null,
        kwh: usage && !missing && enough ? u.kwh : null,
        missing,
        firstAt: firstAt > from ? firstAt : null,
        short: avg != null && pr.min < expect - 1,
        gapDays,
        usageShort: usage && usageShort,
      };
    };
    return [recent('min30', s.min30), recent('hour', s.hour), today, span('week', s.week), span('month', s.month), span('year', s.year)];
  }
}
