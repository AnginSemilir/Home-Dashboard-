import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startOfDay, tzOffset, hhmm, dayKey, inWindow, ago } from '../../js/time.js';
import { ratesFromOctopus, priceSummary, todaysRates, band, hasTomorrow, currentIndex, round1, priceAt } from '../../js/agile.js';

const iso = (s) => Date.parse(s);
const slots = (from, n, price = (i) => 10 + i) => [...Array(n)].map((_, i) => ({ start: from + i * 1800e3, end: from + (i + 1) * 1800e3, p: price(i) }));

test('startOfDay: summer (BST) and winter (GMT)', () => {
  assert.equal(new Date(startOfDay(iso('2026-09-25T09:41:00+01:00'))).toISOString(), '2026-09-24T23:00:00.000Z');
  assert.equal(new Date(startOfDay(iso('2026-12-10T15:00:00Z'))).toISOString(), '2026-12-10T00:00:00.000Z');
  assert.equal(new Date(startOfDay(iso('2026-09-25T09:41:00+01:00'), undefined, 1)).toISOString(), '2026-09-25T23:00:00.000Z');
});

test('startOfDay: clock-change days', () => {
  // 29 Mar 2026: clocks go forward at 01:00 GMT. Midnight is still GMT.
  assert.equal(new Date(startOfDay(iso('2026-03-29T12:00:00Z'))).toISOString(), '2026-03-29T00:00:00.000Z');
  assert.equal(new Date(startOfDay(iso('2026-03-29T12:00:00Z'), undefined, 1)).toISOString(), '2026-03-29T23:00:00.000Z');
  // 25 Oct 2026: clocks go back at 02:00 BST. Midnight is BST.
  assert.equal(new Date(startOfDay(iso('2026-10-25T12:00:00Z'))).toISOString(), '2026-10-24T23:00:00.000Z');
  assert.equal(new Date(startOfDay(iso('2026-10-25T12:00:00Z'), undefined, 1)).toISOString(), '2026-10-26T00:00:00.000Z');
});

test('tzOffset, hhmm and dayKey use UK time regardless of the machine zone', () => {
  assert.equal(tzOffset(iso('2026-07-01T12:00:00Z')), 3600e3);
  assert.equal(tzOffset(iso('2026-01-01T12:00:00Z')), 0);
  assert.equal(hhmm(iso('2026-09-25T23:30:00Z')), '00:30');
  assert.equal(dayKey(iso('2026-09-25T23:30:00Z')), '2026-09-26');
});

test('inWindow handles windows that wrap past midnight', () => {
  assert.equal(inWindow(iso('2026-09-25T22:00:00Z'), '22:30', '06:30'), true); // 23:00 BST
  assert.equal(inWindow(iso('2026-09-25T04:00:00Z'), '22:30', '06:30'), true); // 05:00
  assert.equal(inWindow(iso('2026-09-25T11:00:00Z'), '22:30', '06:30'), false);
  assert.equal(inWindow(iso('2026-09-25T11:00:00Z'), '09:00', '17:00'), true);
});

test('ago', () => {
  const now = iso('2026-09-25T12:00:00Z');
  assert.equal(ago(now - 30e3, now), 'just now');
  assert.equal(ago(now - 12 * 60e3, now), '12 min ago');
  assert.equal(ago(now - 2 * 3600e3, now), '2 h ago');
  assert.equal(ago(now - 3 * 864e5, now), '3 days ago');
});

test('ratesFromOctopus: sorts, de-duplicates, prefers direct-debit prices, fills open ends', () => {
  const rates = ratesFromOctopus([
    { value_inc_vat: 20, valid_from: '2026-09-25T10:00:00Z', valid_to: '2026-09-25T10:30:00Z' },
    { value_inc_vat: 19, valid_from: '2026-09-25T09:30:00Z', valid_to: '2026-09-25T10:00:00Z' },
    { value_inc_vat: 19, valid_from: '2026-09-25T09:30:00Z', valid_to: '2026-09-25T10:00:00Z' },
    { value_inc_vat: 99, valid_from: '2026-09-25T10:30:00Z', valid_to: null, payment_method: 'NON_DIRECT_DEBIT' },
    { value_inc_vat: 25, valid_from: '2026-09-25T10:30:00Z', valid_to: null, payment_method: 'DIRECT_DEBIT' },
  ]);
  assert.deepEqual(rates.map((r) => r.p), [19, 20, 25]);
  assert.equal(rates[2].end - rates[2].start, 1800e3);
});

test('ratesFromOctopus: a fixed/variable tariff\'s open-ended current rate covers the whole period asked for', () => {
  const until = iso('2026-09-27T00:00:00+01:00');
  const rates = ratesFromOctopus([
    { value_inc_vat: 24.5, valid_from: '2026-07-01T00:00:00+01:00', valid_to: null },
    { value_inc_vat: 26, valid_from: '2026-04-01T00:00:00+01:00', valid_to: '2026-07-01T00:00:00+01:00' },
  ], { until });
  assert.equal(rates[1].end, until);
  assert.equal(priceSummary(rates, iso('2026-09-25T12:00:00+01:00')).current.p, 24.5);
});

test('priceSummary: current, next, cheapest ahead (including tomorrow and "now")', () => {
  const dayStart = iso('2026-09-24T23:00:00Z'); // Fri 25 Sep 00:00 BST
  const rates = slots(dayStart, 96, (i) => (i === 50 ? 2 : 20 + (i % 3)));
  const s = priceSummary(rates, dayStart + 10 * 3600e3 + 5 * 60e3); // 10:05
  assert.equal(s.current.p, 20 + (20 % 3));
  assert.equal(s.next.start, dayStart + 10.5 * 3600e3);
  assert.equal(s.cheapest.p, 2);
  assert.equal(s.cheapestLabel, '01:00 tomorrow');
  const cheapNow = priceSummary(slots(dayStart, 4, (i) => [5, 9, 9, 9][i]), dayStart + 60e3);
  assert.equal(cheapNow.cheapestIsNow, true);
  assert.equal(cheapNow.cheapestLabel, 'now');
  assert.equal(priceSummary(rates, dayStart - 1), null);
});

test('todaysRates: 48 slots normally, 46 and 50 on clock-change days', () => {
  const normal = iso('2026-09-24T23:00:00Z');
  assert.equal(todaysRates(slots(normal - 864e5, 48 * 3), normal + 3600e3).length, 48);
  const spring = iso('2026-03-29T00:00:00Z');
  assert.equal(todaysRates(slots(spring - 864e5, 48 * 3), spring + 12 * 3600e3).length, 46);
  const autumn = iso('2026-10-24T23:00:00Z');
  assert.equal(todaysRates(slots(autumn - 864e5, 48 * 3), autumn + 12 * 3600e3).length, 50);
});

test('hasTomorrow / currentIndex / priceAt', () => {
  const dayStart = iso('2026-09-24T23:00:00Z');
  assert.equal(hasTomorrow(slots(dayStart, 48), dayStart + 3600e3), false);
  assert.equal(hasTomorrow(slots(dayStart, 60), dayStart + 3600e3), true);
  assert.equal(currentIndex(slots(dayStart, 4), dayStart + 45 * 60e3), 1);
  assert.equal(priceAt(slots(dayStart, 4), dayStart + 45 * 60e3), 11);
  assert.equal(priceAt(slots(dayStart, 4), dayStart - 1), null);
});

test('band: colour follows the value shown (rounded to 0.1p)', () => {
  assert.equal(band(-1), 'plunge');
  assert.equal(band(0.04), 'plunge'); // shows as 0.0p
  assert.equal(band(14.94), 'cheap');
  assert.equal(band(14.96), 'mid');   // shows as 15.0p
  assert.equal(band(24.9), 'mid');
  assert.equal(band(25), 'high');
  assert.equal(band(NaN), 'none');
  assert.equal(band(12, { cheap: 10, pricey: 20 }), 'mid');
  assert.equal(round1(17.66), 17.7);
});
