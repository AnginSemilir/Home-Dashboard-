// Average electricity price over the last 30 minutes and the last hour, and today, this week
// (from Monday), this month and this year so far. It's an average over time: every half hour
// counts the same, whatever the house was using then.
//
// Past days never change, so each day's total is worked out once and kept on this tablet (a
// few kB). The panel's own price list already covers yesterday and today, so once the year is
// loaded nothing more needs fetching.

import { startOfDay, dayKey, partsInTz, DEFAULT_TZ } from './time.js';

export const STATS_KEY = 'wallpanel.stats.v1';
const MIN = 60e3;

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

const r2 = (x) => Math.round(x * 100) / 100;

/** Each day's [Σ price × minutes, minutes] from `rates` (sorted by time). */
export function dayTotals(rates, days) {
  const out = {};
  let i = 0;
  for (const d of days) {
    const acc = { sum: 0, min: 0 };
    while (i < rates.length && rates[i].end <= d.start) i++;
    for (let j = i; j < rates.length && rates[j].start < d.end; j++) addRates(acc, [rates[j]], d.start, d.end);
    out[d.key] = [r2(acc.sum), r2(acc.min)];
  }
  return out;
}

/**
 * Which tariff applied when: the account's agreements (so a year that started on another tariff
 * is priced with that tariff), else the one tariff known. A tariff typed into Settings wins.
 */
export function tariffSegments(settings) {
  const o = settings.octopus;
  if (o.tariff) return [{ tariff: o.tariff, from: null, to: null }];
  const d = o.discovered;
  if (d?.history?.length) return d.history;
  return d?.tariff ? [{ tariff: d.tariff, from: null, to: null }] : [];
}

// Economy 7 and other two-rate tariffs have day and night prices in other lists: not covered.
const singleRate = (tariff) => /^E-1R-/.test(tariff);
const segFrom = (x) => x.from ?? -Infinity;
const segTo = (x) => x.to ?? Infinity;

/** Consecutive days → runs, so each stretch is one request (or a few pages). */
function runs(days) {
  const out = [];
  for (const d of days) {
    const last = out[out.length - 1];
    if (last && last[last.length - 1].end === d.start) last.push(d);
    else out.push([d]);
  }
  return out;
}

export class PriceStats {
  /** `octopus`: the Octopus client (for unitRates and the current tariff). */
  constructor({ octopus, settings, tz = DEFAULT_TZ, storage = globalThis.localStorage }) {
    this.o = octopus;
    this.s = settings;
    this.tz = tz;
    this.storage = storage;
    this.busy = null;
    this.data = this.#load();
  }

  #load() {
    try {
      const d = JSON.parse(this.storage.getItem(STATS_KEY) || 'null');
      if (d?.v === 1 && d.days && typeof d.days === 'object') return d;
    } catch { /* unreadable: start again */ }
    return { v: 1, sig: '', days: {} };
  }

  #save() {
    try { this.storage.setItem(STATS_KEY, JSON.stringify(this.data)); } catch { /* storage full: it just loads again next time */ }
  }

  /** The tariffs in use; a change (a new tariff, a corrected history) starts the saved days again. */
  #segments() {
    const segs = tariffSegments(this.s);
    const sig = segs.map((x) => `${x.tariff}@${x.from ?? ''}-${x.to ?? ''}`).join(',');
    if (sig !== this.data.sig) this.data = { v: 1, sig, days: {} };
    return segs;
  }

  /** Days before today the averages need: from Monday or 1 January, whichever is earlier. */
  #needed(now) {
    const s = periodStarts(now, this.tz);
    return daysBetween(Math.min(s.week, s.year), s.today, this.tz);
  }

  /** How many past days aren't known yet. */
  missing(now) {
    this.#segments();
    return this.#needed(now).filter((d) => !(d.key in this.data.days)).length;
  }

  /** Get whatever past days aren't known yet. `live`: the panel's own price list. One at a time. */
  ensure(now, live) {
    this.busy ??= this.#fill(now, live).finally(() => { this.busy = null; });
    return this.busy;
  }

  async #fill(now, live) {
    const segs = this.#segments();
    const need = this.#needed(now);
    // Forget days no period needs any more (last year's, once this week is past New Year).
    for (const k of Object.keys(this.data.days)) if (!need.length || k < need[0].key) delete this.data.days[k];
    let missing = need.filter((d) => !(d.key in this.data.days));
    if (!missing.length) { this.#save(); return; }

    // Days the panel's own list covers in full, on the tariff it shows (yesterday, usually).
    const cur = this.o.tariff();
    const onCurrent = (d) => segs.some((x) => x.tariff === cur && segFrom(x) <= d.start && d.end <= segTo(x));
    const fromLive = dayTotals(live || [], missing);
    missing = missing.filter((d) => {
      const whole = (d.end - d.start) / MIN;
      if (!onCurrent(d) || fromLive[d.key][1] < whole) return true;
      this.data.days[d.key] = fromLive[d.key];
      return false;
    });
    this.#save();

    // The rest from Octopus, a stretch at a time, saved as each one arrives.
    for (const run of runs(missing)) {
      const totals = Object.fromEntries(run.map((d) => [d.key, [0, 0]]));
      for (const seg of segs) {
        const from = Math.max(run[0].start, segFrom(seg)), to = Math.min(run[run.length - 1].end, segTo(seg));
        if (to <= from || !singleRate(seg.tariff)) continue;
        const rates = (await this.o.unitRates(seg.tariff, from, to))
          .map((r) => ({ start: Math.max(r.start, from), end: Math.min(r.end, to), p: r.p }))
          .filter((r) => r.end > r.start);
        const t = dayTotals(rates, run);
        for (const k of Object.keys(t)) { totals[k][0] = r2(totals[k][0] + t[k][0]); totals[k][1] = r2(totals[k][1] + t[k][1]); }
      }
      Object.assign(this.data.days, totals);
      this.#save();
    }
  }

  /**
   * The averages. Each row: { id, from, avg (pence, or null), missing (past days not loaded),
   * firstAt (when prices start, if after `from`), short (some of the period has no price) }.
   */
  rows(now, live) {
    this.#segments();
    const s = periodStarts(now, this.tz);
    const covered = (acc, from) => acc.min >= (now - from) / MIN - 1;
    const recent = (id, from) => {
      const acc = addRates({ sum: 0, min: 0 }, live, from, now);
      return { id, from, avg: acc.min ? acc.sum / acc.min : null, missing: 0, firstAt: null, short: !!acc.min && !covered(acc, from) };
    };
    const today = recent('today', s.today);
    const span = (id, from) => {
      const acc = addRates({ sum: 0, min: 0 }, live, s.today, now);
      let missing = 0, firstAt = null;
      for (const d of daysBetween(from, s.today, this.tz)) {
        const v = this.data.days[d.key];
        if (!v) { missing++; continue; }
        acc.sum += v[0];
        acc.min += v[1];
        if (v[1] > 0 && firstAt == null) firstAt = d.start;
      }
      if (firstAt == null && today.avg != null) firstAt = s.today;
      const avg = !missing && acc.min ? acc.sum / acc.min : null;
      return { id, from, avg, missing, firstAt: firstAt > from ? firstAt : null, short: avg != null && !covered(acc, from) };
    };
    return [recent('min30', s.min30), recent('hour', s.hour), today, span('week', s.week), span('month', s.month), span('year', s.year)];
  }
}
