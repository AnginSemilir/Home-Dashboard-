import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodStarts, addRates, addUsage, priceFinder, daysBetween, tariffSegments, PriceStats, STATS_KEY } from '../../js/stats.js';
import { loadSettings } from '../../js/config.js';
import { HttpError } from '../../js/util.js';

const TZ = 'Europe/London';
const at = (s) => Date.parse(s);
const HALF = 1800e3;
const memStore = () => { const m = new Map(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

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
  const jan = periodStarts(at('2027-01-02T12:00:00Z'), TZ);
  assert.equal(jan.week, at('2026-12-28T00:00:00Z'), 'a week that started last year');
  assert.equal(jan.year, at('2027-01-01T00:00:00Z'));
  assert.equal(periodStarts(at('2026-11-01T00:10:00Z'), TZ).month, at('2026-11-01T00:00:00Z'));
  assert.equal(periodStarts(at('2026-10-01T00:10:00+01:00'), TZ).month, at('2026-10-01T00:00:00+01:00'), 'still September in UTC');
});

test('addRates averages over time; addUsage weights by use, each reading at its own price', () => {
  const s = at('2026-10-06T13:00:00Z');
  const rates = [{ start: s, end: s + HALF, p: 10 }, { start: s + HALF, end: s + 2 * HALF, p: 30 }];
  const acc = addRates({ sum: 0, min: 0 }, rates, s, s + 2 * HALF);
  assert.equal(acc.sum / acc.min, 20, 'plain average');
  const priceAt = priceFinder(rates);
  assert.equal(priceAt(s + HALF - 1), 10);
  assert.equal(priceAt(s + HALF), 30);
  assert.equal(priceAt(s - 1), null);
  const use = [{ start: s, end: s + HALF, kwh: 2 }, { start: s + HALF, end: s + 2 * HALF, kwh: 0.5 }];
  const u = addUsage({ cost: 0, kwh: 0, n: 0 }, use, priceAt, s, s + 2 * HALF);
  assert.equal(u.cost / u.kwh, 14, '(2×10 + 0.5×30) ÷ 2.5');
  assert.equal(u.n, 2);
  // A window through the middle of a reading takes that share of it.
  const part = addUsage({ cost: 0, kwh: 0, n: 0 }, use, priceAt, s + 20 * 60e3, s + 2 * HALF);
  near(part.kwh, 2 / 3 + 0.5, 'a third of the first reading');
  near(part.n, 1 + 1 / 3, 'half hours');
});

test('daysBetween: clock-change days are 23 and 25 hours', () => {
  const days = daysBetween(at('2026-10-24T00:00:00+01:00'), at('2026-10-27T00:00:00Z'), TZ);
  assert.deepEqual(days.map((d) => d.key), ['2026-10-24', '2026-10-25', '2026-10-26']);
  assert.deepEqual(days.map((d) => (d.end - d.start) / 3600e3), [24, 25, 24]);
  assert.deepEqual(daysBetween(at('2026-03-29T00:00:00Z'), at('2026-03-30T00:00:00+01:00'), TZ).map((d) => (d.end - d.start) / 3600e3), [23]);
});

test('tariffSegments: the account history wins; else the tariff typed in or found', () => {
  const s = loadSettings(memStore());
  assert.deepEqual(tariffSegments(s), []);
  s.octopus.discovered = { tariff: 'E-1R-AGILE-24-10-01-C' };
  assert.deepEqual(tariffSegments(s), [{ tariff: 'E-1R-AGILE-24-10-01-C', from: null, to: null }]);
  s.octopus.tariff = 'E-1R-AGILE-24-10-01-B';
  assert.deepEqual(tariffSegments(s), [{ tariff: 'E-1R-AGILE-24-10-01-B', from: null, to: null }]);
  s.octopus.discovered.history = [{ tariff: 'E-1R-FIX-C', from: null, to: 5 }, { tariff: 'E-1R-AGILE-24-10-01-C', from: 5, to: null }];
  assert.deepEqual(tariffSegments(s), s.octopus.discovered.history);
});

// ---------- PriceStats against a fake Octopus ----------
const AGILE = 'E-1R-AGILE-24-10-01-C';
const agile = (t) => 5 + (Math.floor(t / HALF) % 9) * 3; // 5p … 29p, by half hour
const used = (t) => 0.1 + (Math.floor(t / HALF) % 7) * 0.05; // kWh in each half hour
function fakeOctopus({ current = AGILE, fixed = 24.5, readingsUntil = Infinity } = {}) {
  const o = {
    calls: [], fail: null, failUsage: false, unknown: new Set(), gate: null, readingsUntil, canReadUsage: true,
    tariff: () => current,
    async unitRates(tariff, from, to) {
      o.calls.push({ what: 'rates', tariff, from, to });
      if (o.gate) await o.gate;
      if (o.fail && o.fail(o.calls.length)) throw new HttpError(503, '503 Service unavailable');
      if (o.unknown.has(tariff)) throw new HttpError(404, '404 Not found');
      const out = [];
      for (let t = Math.floor(from / HALF) * HALF; t < to; t += HALF) out.push({ start: t, end: t + HALF, p: tariff === AGILE ? agile(t) : fixed });
      return out;
    },
    async consumption(from, to) {
      o.calls.push({ what: 'usage', from, to });
      if (o.failUsage) throw new HttpError(401, '401 Authentication failed');
      const out = [];
      for (let t = from; t < Math.min(to, o.readingsUntil); t += HALF) out.push({ start: t, end: t + HALF, kwh: used(t) });
      return out;
    },
  };
  return o;
}
/** The panel's own prices: yesterday 00:00 to tomorrow. */
function live(now) {
  const rates = [];
  for (let t = periodStarts(now, TZ).today - 864e5; t < now + 864e5; t += HALF) rates.push({ start: t, end: t + HALF, p: agile(t) });
  return { rates, tariff: AGILE };
}
/** Today's Home Mini readings: every half hour since midnight, the current one so far. */
function tele(now) {
  const slots = [];
  for (let t = periodStarts(now, TZ).today; t <= now; t += HALF) slots.push({ start: t, kwh: used(t) * Math.min(1, (now - t) / HALF) });
  return { slots };
}
/** The plain answers, a minute at a time. */
function brute(from, now, price = agile, skip = () => false) {
  let sum = 0, n = 0, cost = 0, kwh = 0;
  for (let t = from; t < now; t += 60e3) {
    if (skip(t)) continue;
    sum += price(t); n++;
    const k = used(t) / 30; // a minute's share of the half hour
    cost += k * price(t); kwh += k;
  }
  return { avg: sum / n, paid: cost / kwh, kwh };
}
function setup(opts = {}) {
  const settings = loadSettings(memStore());
  Object.assign(settings.octopus, { account: 'A-1', apiKey: 'sk_test' });
  settings.octopus.discovered = { tariff: AGILE, mpan: '190', serial: 'S1', ...(opts.history ? { history: opts.history } : {}) };
  const storage = memStore();
  const octopus = fakeOctopus(opts);
  return { settings, storage, octopus, stats: new PriceStats({ octopus, settings, tz: TZ, storage }) };
}
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));
const NOW = at('2026-10-06T14:10:00+01:00'); // a Tuesday

test('PriceStats: what you paid and the plain average, for every period, from one load', async () => {
  const { octopus, stats, settings, storage } = setup();
  assert.equal(stats.missing(NOW), 278, '1 Jan to 5 Oct');
  await stats.ensure(NOW, live(NOW));
  const usage = octopus.calls.filter((c) => c.what === 'usage');
  const rates = octopus.calls.filter((c) => c.what === 'rates');
  assert.deepEqual(usage, [{ what: 'usage', from: at('2026-01-01T00:00:00Z'), to: at('2026-10-06T00:00:00+01:00') }], 'all the readings in one request');
  assert.equal(rates.length, 9, 'prices a month at a time (yesterday is in the panel\'s own list)');
  assert.equal(rates[0].to, at('2026-10-05T00:00:00+01:00'), 'newest first');
  assert.equal(Math.min(...rates.map((c) => c.from)), at('2026-01-01T00:00:00Z'));

  const rows = byId(stats.rows(NOW, live(NOW), tele(NOW)));
  const s = periodStarts(NOW, TZ);
  for (const id of ['min30', 'hour', 'today', 'week', 'month', 'year']) {
    const want = brute(s[id], NOW);
    near(rows[id].avg, want.avg, `${id} average`);
    near(rows[id].paid, want.paid, `${id} paid`);
    near(rows[id].kwh, want.kwh, `${id} kWh`);
    assert.equal(rows[id].missing, 0);
    assert.equal(rows[id].firstAt, null);
    assert.equal(rows[id].short, false, id);
    assert.equal(rows[id].usageShort, false, id);
    assert.equal(rows[id].gapDays, 0);
  }

  // Kept on the tablet: a fresh start asks Octopus for nothing; the next day only for yesterday's readings.
  const again = new PriceStats({ octopus, settings, tz: TZ, storage });
  const n = octopus.calls.length;
  await again.ensure(NOW, live(NOW));
  assert.equal(octopus.calls.length, n);
  assert.ok(storage.m.get(STATS_KEY).length < 40000, `${storage.m.get(STATS_KEY).length} bytes`);
  const tomorrow = NOW + 864e5;
  await again.ensure(tomorrow, live(tomorrow));
  assert.deepEqual(octopus.calls.slice(n).map((c) => [c.what, new Date(c.from).toISOString()]), [['usage', '2026-10-05T23:00:00.000Z']]);
  near(again.rows(tomorrow, live(tomorrow), tele(tomorrow)).find((r) => r.id === 'year').paid, brute(s.year, tomorrow).paid, 'year, a day later');
});

test('PriceStats: readings that arrive late are fetched again (not too often); "You paid" waits for most of them', async () => {
  const lag = at('2026-10-05T06:00:00+01:00'); // yesterday's readings stop at 6am
  const { octopus, stats } = setup({ readingsUntil: lag });
  await stats.ensure(NOW, live(NOW));
  let rows = byId(stats.rows(NOW, live(NOW), tele(NOW)));
  assert.equal(rows.week.usageShort, true);
  assert.equal(rows.week.paid, null, 'most of the week has no readings yet: no figure rather than a wrong one');
  assert.equal(rows.month.paid, null, 'October so far: too much missing');
  assert.ok(rows.year.paid > 0, 'the year is nearly all there: still shown');
  assert.equal(rows.year.usageShort, true);
  near(rows.month.avg, brute(periodStarts(NOW, TZ).month, NOW).avg, 'the prices are complete');

  // Within half an hour: not asked again.
  const n = octopus.calls.length;
  await stats.ensure(NOW + 10 * 60e3, live(NOW));
  assert.equal(octopus.calls.length, n);
  // Later, the readings are in: one request for yesterday's, priced from the panel's own list.
  octopus.readingsUntil = Infinity;
  const later = NOW + 40 * 60e3;
  await stats.ensure(later, live(later));
  assert.deepEqual(octopus.calls.slice(n).map((c) => c.what), ['usage']);
  rows = byId(stats.rows(later, live(later), tele(later)));
  assert.equal(rows.week.usageShort, false);
  near(rows.week.paid, brute(periodStarts(NOW, TZ).week, later).paid, 'week');
});

test('PriceStats: readings missing for more than 10 days are left out for good', async () => {
  const { octopus, stats } = setup({ readingsUntil: at('2026-09-01T00:00:00+01:00') });
  await stats.ensure(NOW, live(NOW));
  octopus.calls.length = 0;
  await stats.ensure(NOW + 3600e3, live(NOW));
  const usage = octopus.calls.filter((c) => c.what === 'usage');
  assert.equal(usage.length, 1);
  assert.ok(usage[0].from >= periodStarts(NOW, TZ).today - 11 * 864e5, 'only the last 10 days are asked for again');
});

test('PriceStats: if the readings fail, the prices still load, and only the readings are tried again', async () => {
  const { octopus, stats } = setup();
  octopus.failUsage = true;
  await assert.rejects(stats.ensure(NOW, live(NOW)), (e) => e.what === 'usage' && /401/.test(e.message));
  const rows = byId(stats.rows(NOW, live(NOW), tele(NOW)));
  near(rows.year.avg, brute(periodStarts(NOW, TZ).year, NOW).avg, 'year average');
  assert.equal(rows.year.paid, null, 'not today\'s figure passed off as the year\'s');
  assert.ok(rows.today.paid > 0, 'today comes from the Home Mini');
  octopus.calls.length = 0;
  await assert.rejects(stats.ensure(NOW + 3600e3, live(NOW)), /401/);
  assert.deepEqual(octopus.calls.map((c) => c.what), ['usage'], 'still failing: one request, no prices');
  octopus.failUsage = false;
  octopus.calls.length = 0;
  await stats.ensure(NOW + 2 * 3600e3, live(NOW));
  assert.equal(octopus.calls.filter((c) => c.what === 'usage').length, 1);
  near(byId(stats.rows(NOW + 2 * 3600e3, live(NOW), tele(NOW + 2 * 3600e3))).year.paid, brute(periodStarts(NOW, TZ).year, NOW + 2 * 3600e3).paid, 'year paid once they work');
});

test('PriceStats: other tariffs earlier in the year, Economy 7 in the middle, and one Octopus no longer knows', async () => {
  const mar = at('2026-03-01T00:00:00Z'), may = at('2026-05-01T00:00:00+01:00'), jul = at('2026-07-01T00:00:00+01:00');
  const { octopus, stats } = setup({ history: [
    { tariff: 'E-1R-OLD-BESPOKE-C', from: null, to: mar },
    { tariff: 'E-1R-FIX-12M-C', from: mar, to: may },
    { tariff: 'E-2R-ECO7-C', from: may, to: jul },
    { tariff: AGILE, from: jul, to: null },
  ] });
  octopus.unknown.add('E-1R-OLD-BESPOKE-C');
  await stats.ensure(NOW, live(NOW));
  const year = byId(stats.rows(NOW, live(NOW), tele(NOW))).year;
  assert.equal(year.firstAt, mar, 'prices from 1 March');
  assert.equal(year.gapDays, 61, 'May and June on Economy 7');
  assert.equal(year.short, false);
  const want = brute(mar, NOW, (t) => (t < may ? 24.5 : agile(t)), (t) => t >= may && t < jul);
  near(year.avg, want.avg, 'year average');
  near(year.paid, want.paid, 'year paid');
  // The unknown tariff isn't asked for again and again.
  const n = octopus.calls.length;
  await stats.ensure(NOW + 3600e3, live(NOW));
  assert.equal(octopus.calls.filter((c, i) => i >= n && c.tariff === 'E-1R-OLD-BESPOKE-C').length, 0);
});

test('PriceStats: a failure part way keeps the newest months; a tariff change mid-load doesn\'t mix', async () => {
  const { octopus, stats, settings, storage } = setup();
  octopus.fail = (n) => n > 2; // the readings, one month of prices, then Octopus fails
  await assert.rejects(stats.ensure(NOW, live(NOW)), /503/);
  let rows = byId(stats.rows(NOW, live(NOW), tele(NOW)));
  near(rows.month.avg, brute(periodStarts(NOW, TZ).month, NOW).avg, 'this month is in');
  near(rows.week.paid, brute(periodStarts(NOW, TZ).week, NOW).paid, 'and this week');
  assert.equal(rows.year.avg, null);
  assert.ok(rows.year.missing > 0);

  // The account's tariff history changes while a load is waiting on Octopus.
  octopus.fail = null;
  let open;
  octopus.gate = new Promise((r) => { open = r; });
  const loading = stats.ensure(NOW, live(NOW));
  await new Promise((r) => setTimeout(r, 5));
  settings.octopus.discovered = { ...settings.octopus.discovered, history: [{ tariff: 'E-1R-AGILE-24-10-01-B', from: null, to: null }] };
  rows = stats.rows(NOW, live(NOW), tele(NOW)); // the panel redraws meanwhile
  open();
  await loading;
  assert.equal(byId(stats.rows(NOW, live(NOW), tele(NOW))).year.missing, 278, 'nothing from the old tariff kept under the new one');
  assert.doesNotMatch(JSON.parse(storage.m.get(STATS_KEY)).sig, /AGILE-24-10-01-B/, 'nor saved');
  await stats.ensure(NOW, live(NOW));
  assert.match(JSON.parse(storage.m.get(STATS_KEY)).sig, /AGILE-24-10-01-B/);
  assert.equal(stats.missing(NOW), 0);
});

test('PriceStats: one load at a time; days from last year are forgotten once not needed', async () => {
  const now = at('2027-01-06T12:00:00Z');
  const { octopus, stats, storage } = setup();
  await Promise.all([stats.ensure(now, live(now)), stats.ensure(now, live(now))]);
  assert.equal(octopus.calls.filter((c) => c.what === 'usage').length, 1, 'opening the pop-up twice fetches once');
  const later = at('2027-01-12T12:00:00Z');
  await stats.ensure(later, live(later));
  const kept = Object.keys(JSON.parse(storage.m.get(STATS_KEY)).days).sort();
  assert.ok(kept[0] >= '2027-01-01', kept[0]);
});

test('PriceStats: without an API key, the plain averages still work', async () => {
  const { octopus, stats, settings } = setup();
  octopus.canReadUsage = false;
  settings.octopus.apiKey = '';
  await stats.ensure(NOW, live(NOW));
  assert.equal(octopus.calls.filter((c) => c.what === 'usage').length, 0);
  const rows = byId(stats.rows(NOW, live(NOW), null));
  assert.ok(rows.year.avg > 0);
  assert.equal(rows.year.paid, null);
  assert.equal(rows.today.paid, null);
  assert.equal(rows.year.usageShort, false);
});
