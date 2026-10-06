import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodStarts, addRates, daysBetween, dayTotals, tariffSegments, PriceStats, STATS_KEY } from '../../js/stats.js';
import { loadSettings } from '../../js/config.js';

const TZ = 'Europe/London';
const at = (s) => Date.parse(s);
const memStore = () => { const m = new Map(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('periodStarts: weeks from Monday, months, years, in UK time', () => {
  const tue = periodStarts(at('2026-10-06T14:10:00+01:00'), TZ);
  assert.equal(tue.min30, at('2026-10-06T13:40:00+01:00'));
  assert.equal(tue.hour, at('2026-10-06T13:10:00+01:00'));
  assert.equal(tue.today, at('2026-10-06T00:00:00+01:00'));
  assert.equal(tue.week, at('2026-10-05T00:00:00+01:00'));
  assert.equal(tue.month, at('2026-10-01T00:00:00+01:00'));
  assert.equal(tue.year, at('2026-01-01T00:00:00Z'), 'New Year is in GMT');
  assert.equal(periodStarts(at('2026-10-11T22:00:00+01:00'), TZ).week, at('2026-10-05T00:00:00+01:00'), 'Sunday: still the week from Monday');
  assert.equal(periodStarts(at('2026-10-05T08:00:00+01:00'), TZ).week, at('2026-10-05T00:00:00+01:00'), 'Monday: the week is today');
  // A week that started last year.
  const jan = periodStarts(at('2027-01-02T12:00:00Z'), TZ);
  assert.equal(jan.week, at('2026-12-28T00:00:00Z'));
  assert.equal(jan.year, at('2027-01-01T00:00:00Z'));
  // Just after midnight UK time, while it's still yesterday in UTC.
  assert.equal(periodStarts(at('2026-11-01T00:10:00Z'), TZ).month, at('2026-11-01T00:00:00Z'));
  assert.equal(periodStarts(at('2026-10-01T00:10:00+01:00'), TZ).month, at('2026-10-01T00:00:00+01:00'));
});

test('addRates averages over time, counting part of a half hour', () => {
  const s = at('2026-10-06T13:00:00Z');
  const rates = [{ start: s, end: s + 1800e3, p: 10 }, { start: s + 1800e3, end: s + 3600e3, p: 20 }];
  const acc = addRates({ sum: 0, min: 0 }, rates, s + 20 * 60e3, s + 40 * 60e3);
  assert.equal(acc.min, 20);
  assert.equal(acc.sum / acc.min, 15);
  const last30 = addRates({ sum: 0, min: 0 }, rates, s + 10 * 60e3, s + 40 * 60e3);
  assert.equal(Math.round((last30.sum / last30.min) * 1000) / 1000, 13.333);
});

test('daysBetween and dayTotals: clock-change days, and a price that runs for days', () => {
  const days = daysBetween(at('2026-10-24T00:00:00+01:00'), at('2026-10-27T00:00:00Z'), TZ);
  assert.deepEqual(days.map((d) => d.key), ['2026-10-24', '2026-10-25', '2026-10-26']);
  assert.deepEqual(days.map((d) => (d.end - d.start) / 3600e3), [24, 25, 24], 'the clocks go back on the 25th');
  // Half-hourly prices on the long day: 50 of them.
  const slots = [];
  for (let t = days[1].start; t < days[1].end; t += 1800e3) slots.push({ start: t, end: t + 1800e3, p: 12 });
  assert.equal(slots.length, 50);
  // A fixed price before the 25th, from the middle of the 23rd.
  const rates = [{ start: at('2026-10-23T12:00:00+01:00'), end: days[1].start, p: 30 }, ...slots];
  const t = dayTotals(rates, days);
  assert.deepEqual(t['2026-10-24'], [30 * 1440, 1440]);
  assert.deepEqual(t['2026-10-25'], [12 * 1500, 1500]);
  assert.deepEqual(t['2026-10-26'], [0, 0]);
});

test('tariffSegments: a typed-in tariff wins, then the account history, then the one tariff known', () => {
  const s = loadSettings(memStore());
  assert.deepEqual(tariffSegments(s), []);
  s.octopus.discovered = { tariff: 'E-1R-AGILE-24-10-01-C' };
  assert.deepEqual(tariffSegments(s), [{ tariff: 'E-1R-AGILE-24-10-01-C', from: null, to: null }]);
  s.octopus.discovered.history = [{ tariff: 'E-1R-A-C', from: 1, to: null }];
  assert.deepEqual(tariffSegments(s), [{ tariff: 'E-1R-A-C', from: 1, to: null }]);
  s.octopus.tariff = 'E-1R-AGILE-24-10-01-B';
  assert.deepEqual(tariffSegments(s), [{ tariff: 'E-1R-AGILE-24-10-01-B', from: null, to: null }]);
});

// A fake Octopus: Agile prices that follow a pattern, a fixed price for anything else.
const AGILE = 'E-1R-AGILE-24-10-01-C';
const agile = (t) => 5 + (Math.floor(t / 1800e3) % 9) * 3; // 5p … 29p, by half hour
function fakeOctopus(current = AGILE, price = (tariff, t) => (tariff === AGILE ? agile(t) : 24.5)) {
  const o = {
    calls: [], fail: null,
    tariff: () => current,
    async unitRates(tariff, from, to) {
      o.calls.push({ tariff, from, to });
      if (o.fail) throw new Error(o.fail);
      const out = [];
      for (let t = Math.floor(from / 1800e3) * 1800e3; t < to; t += 1800e3) out.push({ start: t, end: t + 1800e3, p: price(tariff, t) });
      return out;
    },
  };
  return o;
}
/** The panel's own list: yesterday 00:00 to tomorrow 00:00. */
function live(now, tariff = AGILE, price = agile) {
  const out = [];
  const from = periodStarts(now, TZ).today - 864e5 - 3600e3; // a little early is fine (clipped)
  for (let t = Math.floor(from / 1800e3) * 1800e3; t < now + 864e5; t += 1800e3) out.push({ start: t, end: t + 1800e3, p: tariff === AGILE ? price(t) : 24.5 });
  return out;
}
/** The plain answer: every minute from `from` to `now`, at its price. */
function bruteAverage(from, now, priceAt) {
  let sum = 0, n = 0;
  for (let t = from; t < now; t += 60e3) { sum += priceAt(t); n++; }
  return sum / n;
}
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

function setup({ history, current = AGILE } = {}) {
  const settings = loadSettings(memStore());
  settings.octopus.discovered = { tariff: current, ...(history ? { history } : {}) };
  const storage = memStore();
  const octopus = fakeOctopus(current);
  return { settings, storage, octopus, stats: new PriceStats({ octopus, settings, tz: TZ, storage }) };
}

test('PriceStats: the year comes from Octopus once, yesterday from the panel, then nothing', async () => {
  const now = at('2026-10-06T14:10:00+01:00');
  const { settings, storage, octopus, stats } = setup();
  assert.equal(stats.missing(now), 278, '1 Jan to 5 Oct');
  const before = stats.rows(now, live(now));
  assert.equal(before.find((r) => r.id === 'year').avg, null, 'not loaded yet');
  assert.equal(before.find((r) => r.id === 'year').missing, 278);
  assert.ok(before.find((r) => r.id === 'today').avg > 0, 'today needs nothing more');

  await stats.ensure(now, live(now));
  // One request: 1 January up to yesterday (yesterday is in the panel's own list).
  assert.deepEqual(octopus.calls, [{ tariff: AGILE, from: at('2026-01-01T00:00:00Z'), to: at('2026-10-05T00:00:00+01:00') }]);
  assert.equal(stats.missing(now), 0);

  const rows = Object.fromEntries(stats.rows(now, live(now)).map((r) => [r.id, r]));
  const s = periodStarts(now, TZ);
  for (const id of ['min30', 'hour', 'today', 'week', 'month', 'year']) {
    near(rows[id].avg, bruteAverage(s[id], now, agile), id);
    assert.equal(rows[id].missing, 0);
    assert.equal(rows[id].firstAt, null);
    assert.equal(rows[id].short, false, id);
  }

  // Kept on the tablet: a fresh start asks Octopus for nothing.
  const again = new PriceStats({ octopus, settings, tz: TZ, storage });
  await again.ensure(now, live(now));
  assert.equal(octopus.calls.length, 1);
  assert.ok(storage.m.get(STATS_KEY).length < 20000, 'a few kB');

  // The next day: the new "yesterday" comes from the panel's list.
  const tomorrow = now + 864e5;
  await again.ensure(tomorrow, live(tomorrow));
  assert.equal(octopus.calls.length, 1);
  near(again.rows(tomorrow, live(tomorrow)).find((r) => r.id === 'year').avg, bruteAverage(s.year, tomorrow, agile), 'year, a day later');
});

test('PriceStats: a year that started on other tariffs is priced with them', async () => {
  const now = at('2026-10-06T14:10:00+01:00');
  const feb = at('2026-02-01T00:00:00Z'), mar = at('2026-03-01T00:00:00Z');
  const { octopus, stats } = setup({ history: [
    { tariff: 'E-2R-ECO7-C', from: null, to: feb }, // Economy 7: not covered
    { tariff: 'E-1R-FIX-12M-C', from: feb, to: mar },
    { tariff: AGILE, from: mar, to: null },
  ] });
  await stats.ensure(now, live(now));
  assert.deepEqual(octopus.calls.map((c) => [c.tariff, new Date(c.from).toISOString(), new Date(c.to).toISOString()]), [
    ['E-1R-FIX-12M-C', '2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z'],
    [AGILE, '2026-03-01T00:00:00.000Z', '2026-10-04T23:00:00.000Z'],
  ]);
  const year = stats.rows(now, live(now)).find((r) => r.id === 'year');
  assert.equal(year.firstAt, feb, 'prices from 1 February');
  near(year.avg, bruteAverage(feb, now, (t) => (t < mar ? 24.5 : agile(t))), 'year');
  assert.equal(stats.rows(now, live(now)).find((r) => r.id === 'month').firstAt, null);
});

test('PriceStats: a new tariff starts again; a failure leaves the older periods blank, not wrong', async () => {
  const now = at('2026-10-06T14:10:00+01:00');
  const { settings, octopus, stats } = setup();
  octopus.fail = 'Service unavailable';
  await assert.rejects(stats.ensure(now, live(now)), /Service unavailable/);
  const rows = Object.fromEntries(stats.rows(now, live(now)).map((r) => [r.id, r]));
  assert.ok(rows.today.avg > 0);
  // Monday (yesterday) is in the panel's own list, so the week is whole; the month isn't.
  near(rows.week.avg, bruteAverage(periodStarts(now, TZ).week, now, agile), 'week');
  assert.equal(rows.month.avg, null, 'no average from part of the month');
  assert.ok(rows.month.missing > 0);
  assert.equal(rows.year.avg, null);

  octopus.fail = null;
  await stats.ensure(now, live(now));
  assert.equal(stats.missing(now), 0);
  // Moved to Agile in another region (the account says so): everything again.
  settings.octopus.discovered = { tariff: 'E-1R-AGILE-24-10-01-B', history: [{ tariff: 'E-1R-AGILE-24-10-01-B', from: null, to: null }] };
  assert.equal(stats.missing(now), 278);
});

test('PriceStats: only one load at a time, and old days are forgotten', async () => {
  const now = at('2027-01-06T12:00:00Z');
  const { octopus, stats, storage } = setup();
  await Promise.all([stats.ensure(now, live(now)), stats.ensure(now, live(now))]);
  assert.equal(octopus.calls.length, 1, 'opening the pop-up twice fetches once');
  // Next Monday the days from last year aren't needed any more.
  const later = at('2027-01-12T12:00:00Z');
  await stats.ensure(later, live(later));
  const kept = Object.keys(JSON.parse(storage.m.get(STATS_KEY)).days);
  assert.equal(kept[0] >= '2027-01-01', true, kept[0]);
});
