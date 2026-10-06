import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodStarts, addRates, addUsage, priceFinder, daysBetween, tariffSegments, byHour, PriceStats, STATS_KEY } from '../../js/stats.js';
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
  // About 300 bytes a day (totals, and usage by hour): under 100 kB for a year, of the ~5 MB a site gets.
  assert.ok(storage.m.get(STATS_KEY).length < 100000, `${storage.m.get(STATS_KEY).length} bytes`);
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

test('PriceStats: until the meter\'s readings arrive, the Home Mini\'s stand in (kept at midnight, or its history)', async () => {
  const lag = at('2026-10-05T00:00:00+01:00'); // nothing from yesterday (Monday) yet
  const yesterday = (now) => tele(periodStarts(now, TZ).today - 1).slots; // Monday's, as the panel held them at midnight
  // (a) The panel kept Monday's Home Mini readings when the day ended.
  let { octopus, stats } = setup({ readingsUntil: lag });
  stats.keepReadings([...yesterday(NOW), ...tele(NOW).slots], NOW); // today's are ignored
  await stats.ensure(NOW, live(NOW));
  let rows = byId(stats.rows(NOW, live(NOW), tele(NOW)));
  near(rows.week.paid, brute(periodStarts(NOW, TZ).week, NOW).paid, 'week, with Monday from the Home Mini');
  assert.equal(rows.week.usageShort, false);
  // Still asks for the meter's own readings later (they're what Octopus bills).
  octopus.readingsUntil = Infinity;
  octopus.calls.length = 0;
  await stats.ensure(NOW + 3600e3, live(NOW));
  assert.deepEqual(octopus.calls.map((c) => c.what), ['usage']);
  octopus.calls.length = 0;
  await stats.ensure(NOW + 3 * 3600e3, live(NOW));
  assert.deepEqual(octopus.calls, [], 'and then stops');

  // (b) Nothing kept (the panel was off at midnight): one request for the Home Mini's history.
  ({ octopus, stats } = setup({ readingsUntil: lag }));
  octopus.hasHomeMini = true;
  octopus.mini = [];
  octopus.homeMiniReadings = async (from, to) => {
    octopus.mini.push({ from, to });
    const out = [];
    for (let t = from; t < to; t += HALF) out.push({ start: t, end: t + HALF, kwh: used(t) });
    return out;
  };
  await stats.ensure(NOW, live(NOW));
  assert.deepEqual(octopus.mini, [{ from: at('2026-10-05T00:00:00+01:00'), to: at('2026-10-06T00:00:00+01:00') }], 'only the day the meter is missing');
  rows = byId(stats.rows(NOW, live(NOW), tele(NOW)));
  near(rows.week.paid, brute(periodStarts(NOW, TZ).week, NOW).paid, 'week, from the Home Mini');
  near(rows.month.paid, brute(periodStarts(NOW, TZ).month, NOW).paid, 'month');
  await stats.ensure(NOW + 3600e3, live(NOW));
  assert.equal(octopus.mini.length, 1, 'not asked again once kept');

  // (c) The Home Mini's history fails: the days wait for the meter, with a note.
  ({ octopus, stats } = setup({ readingsUntil: lag }));
  octopus.hasHomeMini = true;
  octopus.homeMiniReadings = async () => { throw new HttpError(429, 'Octopus rate limit reached'); };
  await stats.ensure(NOW, live(NOW));
  rows = byId(stats.rows(NOW, live(NOW), tele(NOW)));
  assert.equal(rows.week.paid, null);
  assert.equal(rows.week.usageShort, true);
});

test('PriceStats: "Last hour" just after midnight uses the half hours kept from yesterday', async () => {
  const now = at('2026-10-06T00:10:00+01:00');
  const { stats } = setup();
  const todayOnly = tele(now); // the Home Mini's list: today's 00:00 half hour so far
  let rows = byId(stats.rows(now, live(now), todayOnly));
  assert.equal(rows.hour.paid, null, 'only 10 minutes of the hour: no figure');
  assert.equal(rows.hour.usageShort, true);
  near(rows.min30.avg, brute(now - 30 * 60e3, now).avg, 'the prices are all there');
  stats.keepReadings(tele(periodStarts(now, TZ).today - 1).slots, now);
  rows = byId(stats.rows(now, live(now), todayOnly));
  near(rows.hour.paid, brute(now - 3600e3, now).paid, 'last hour');
  near(rows.min30.paid, brute(now - 1800e3, now).paid, 'last 30 minutes');
  near(rows.today.paid, brute(periodStarts(now, TZ).today, now).paid, 'today is only today');
});

test('PriceStats: a passing error on a price request is tried again, not taken as "no prices"', async () => {
  const { octopus, stats } = setup();
  let once = true;
  const real = octopus.unitRates;
  octopus.unitRates = async (...a) => { if (once) { once = false; throw new HttpError(403, '403 Forbidden'); } return real(...a); };
  await assert.rejects(stats.ensure(NOW, live(NOW)), /403/);
  await stats.ensure(NOW + 60e3, live(NOW));
  const year = byId(stats.rows(NOW, live(NOW), tele(NOW))).year;
  near(year.avg, brute(periodStarts(NOW, TZ).year, NOW).avg, 'the whole year');
  assert.equal(year.firstAt, null);
});

test('PriceStats: no "readings not in yet" note for gaps long past, or without a Home Mini', async () => {
  // Readings missing for a week in August: given up on, and the note doesn't stay all year.
  const { octopus, stats } = setup();
  const real = octopus.consumption;
  octopus.consumption = async (from, to) => (await real(from, to)).filter((r) => r.start < at('2026-08-01T00:00:00+01:00') || r.start >= at('2026-08-08T00:00:00+01:00'));
  await stats.ensure(NOW, live(NOW));
  let rows = byId(stats.rows(NOW, live(NOW), tele(NOW)));
  assert.equal(rows.year.usageShort, false);
  assert.ok(rows.year.paid > 0);
  // No Home Mini: today has no usage; the past days still give a figure, without the note.
  rows = byId(stats.rows(NOW, live(NOW), null));
  assert.equal(rows.month.usageShort, false);
  assert.equal(rows.today.paid, null);
});

test('byHour: half hours into clock hours, on ordinary and clock-change days', () => {
  const priceAt = () => 10;
  const day = { start: at('2026-10-06T00:00:00+01:00'), end: at('2026-10-07T00:00:00+01:00') };
  const r = (iso, kwh) => ({ start: at(iso), end: at(iso) + HALF, kwh });
  let h = byHour(day, [r('2026-10-06T18:00:00+01:00', 1), r('2026-10-06T18:30:00+01:00', 0.5), r('2026-10-05T23:30:00+01:00', 9)], priceAt, TZ);
  assert.equal(h.k[18], 1.5);
  assert.equal(h.c[18], 15);
  assert.equal(h.n[18], 2);
  assert.equal(h.k.reduce((a, b) => a + b), 1.5, 'nothing from another day');
  // 25 October: 01:00-02:00 happens twice (four half hours).
  const long = { start: at('2026-10-25T00:00:00+01:00'), end: at('2026-10-26T00:00:00Z') };
  const halves = [];
  for (let t = long.start; t < long.end; t += HALF) halves.push({ start: t, end: t + HALF, kwh: 1 });
  h = byHour(long, halves, priceAt, TZ);
  assert.equal(h.n[1], 4);
  assert.equal(h.k[1], 4);
  assert.equal(h.n.reduce((a, b) => a + b), 50);
  // 29 March: 01:00-02:00 never happens.
  const short = { start: at('2026-03-29T00:00:00Z'), end: at('2026-03-30T00:00:00+01:00') };
  const fewer = [];
  for (let t = short.start; t < short.end; t += HALF) fewer.push({ start: t, end: t + HALF, kwh: 1 });
  h = byHour(short, fewer, priceAt, TZ);
  assert.equal(h.n[1], 0);
  assert.equal(h.n.reduce((a, b) => a + b), 46);
});

test('PriceStats.usageByHour: each hour\'s average a day, for today, the week, the month and the year', async () => {
  const { stats } = setup();
  await stats.ensure(NOW, live(NOW));
  const s = periodStarts(NOW, TZ);
  // The plain answer: every half hour from the start of the period to now, by clock hour.
  const want = (from) => {
    const kwh = Array(24).fill(0), cost = Array(24).fill(0), days = Array(24).fill(0);
    for (let t = from; t < NOW; t += HALF) {
      const hr = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(t));
      const part = Math.min(1, (NOW - t) / HALF);
      kwh[hr] += used(t) * part; cost[hr] += used(t) * part * agile(t); days[hr] += part / 2;
    }
    return { kwh, cost, days };
  };
  for (const id of ['today', 'week', 'month', 'year']) {
    const got = stats.usageByHour(NOW, live(NOW), tele(NOW), id);
    const w = want(s[id]);
    for (let h = 0; h < 24; h++) {
      near(got.kwh[h], w.kwh[h], `${id} ${h}:00 kWh`);
      // (Each stored day-hour's cost is to a tenth of a penny.)
      assert.ok(Math.abs(got.cost[h] - w.cost[h]) <= 0.05 * Math.ceil(got.days[h]) + 1e-9, `${id} ${h}:00 cost ${got.cost[h]} vs ${w.cost[h]}`);
      near(got.days[h], w.days[h], `${id} ${h}:00 days`);
    }
    near(got.total, w.kwh.reduce((a, b) => a + b), `${id} total`);
    assert.equal(got.missing, 0);
  }
  // Before the year is loaded: the week says how many days are missing.
  const fresh = setup().stats;
  assert.equal(fresh.usageByHour(NOW, live(NOW), tele(NOW), 'week').missing, 1);
});

test('usageByHour: says when today has no Home Mini, or its readings stop early', async () => {
  const { stats } = setup();
  await stats.ensure(NOW, live(NOW));
  let u = stats.usageByHour(NOW, live(NOW), null, 'today');
  assert.equal(u.todayKnown, false, 'no Home Mini: not "no use"');
  const early = { slots: tele(NOW).slots.filter((x) => x.start < at('2026-10-06T05:00:00+01:00')) };
  u = stats.usageByHour(NOW, live(NOW), early, 'today');
  assert.equal(u.todayKnown, true);
  assert.equal(u.todayShort, true);
  assert.equal(u.todayUntil, at('2026-10-06T05:00:00+01:00'));
  assert.equal(u.usageShort, true);
  u = stats.usageByHour(NOW, live(NOW), tele(NOW), 'today');
  assert.equal(u.todayShort, false);
  // Without a Home Mini the week still has its past days, with today simply not counted.
  u = stats.usageByHour(NOW, live(NOW), null, 'week');
  assert.equal(u.short, false);
  near(u.total, brute(periodStarts(NOW, TZ).week, periodStarts(NOW, TZ).today).kwh, 'Monday only');
});

test('usageByHour: the first day of a week or month is shown as used, not averaged', async () => {
  const mon = at('2026-10-05T08:05:00+01:00'), first = at('2026-10-01T07:10:00+01:00');
  const { stats } = setup();
  await stats.ensure(mon, live(mon));
  assert.equal(stats.usageByHour(mon, live(mon), tele(mon), 'week').partial, true);
  assert.equal(stats.usageByHour(mon, live(mon), tele(mon), 'month').partial, false);
  assert.equal(stats.usageByHour(NOW, live(NOW), tele(NOW), 'week').partial, false, 'Tuesday: Monday to average');
  await stats.ensure(first, live(first));
  assert.equal(stats.usageByHour(first, live(first), tele(first), 'month').partial, true);
});

test('usageByHour: a period mostly without readings gives no total rather than part of one', async () => {
  const { octopus, stats } = setup();
  octopus.failUsage = true;
  await assert.rejects(stats.ensure(NOW, live(NOW)));
  const u = stats.usageByHour(NOW, live(NOW), tele(NOW), 'year');
  assert.equal(u.short, true);
  assert.equal(u.missing, 0);
  assert.ok(u.held > 0);
});

test('usageByHour: usage counts whether or not it had a single price (Economy 7)', async () => {
  const may = at('2026-05-01T00:00:00+01:00'), jul = at('2026-07-01T00:00:00+01:00');
  const { stats } = setup({ history: [
    { tariff: AGILE, from: null, to: may }, { tariff: 'E-2R-ECO7-C', from: may, to: jul }, { tariff: AGILE, from: jul, to: null },
  ] });
  await stats.ensure(NOW, live(NOW));
  const u = stats.usageByHour(NOW, live(NOW), tele(NOW), 'year');
  near(u.total, brute(periodStarts(NOW, TZ).year, NOW).kwh, 'every kWh, Economy 7 months included');
  const priced = u.priced.reduce((a, b) => a + b);
  near(priced, brute(periodStarts(NOW, TZ).year, NOW, agile, (t) => t >= may && t < jul).kwh, 'priced: the rest');
  assert.equal(u.short, false);
});

test('PriceStats: days the Home Mini stood in for aren\'t wiped when the meter is more than 10 days late', async () => {
  const stop = at('2026-09-20T00:00:00+01:00');
  const { octopus, stats } = setup({ readingsUntil: stop });
  octopus.hasHomeMini = true;
  octopus.homeMiniReadings = async (from, to) => {
    const out = [];
    for (let t = from; t < to; t += HALF) out.push({ start: t, end: t + HALF, kwh: used(t) });
    return out;
  };
  const sep23 = at('2026-09-23T12:00:00+01:00');
  await stats.ensure(sep23, live(sep23));
  const oct2 = at('2026-10-02T12:00:00+01:00');
  await stats.ensure(oct2, live(oct2));
  const day = (now) => stats.usageByHour(now, live(now), tele(now), 'month');
  const sep21 = brute(at('2026-09-21T00:00:00+01:00'), at('2026-09-22T00:00:00+01:00')).kwh;
  // 11 days on: the 21st was settled using the Home Mini's readings, not emptied.
  const u = stats.usageByHour(oct2, live(oct2), tele(oct2), 'week');
  assert.ok(u.total > 0);
  const raw = JSON.parse(JSON.stringify(stats.data.days['2026-09-21']));
  near(raw.k > 0 ? raw.h.reduce((a, b) => a + b) / 1e3 : 0, sep21, '21 September kept');
  assert.equal(raw.u, 1);
  assert.ok(day(oct2));
});
