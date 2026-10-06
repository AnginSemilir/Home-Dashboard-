// The average prices pop-up: the small button on the price card. Octopus is faked (mocks.js),
// so the expected figures are worked out here from the same fake prices and readings.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser, openPanel, NOW } from '../support/browser.js';
import { agilePrice, usedKwh } from '../support/mocks.js';

let env;
before(async () => { env = await startBrowser(); });
after(async () => { await env?.close(); });

const HALF = 1800e3;
const TODAY = Date.parse('2026-09-25T00:00:00+01:00'); // NOW is Friday 25 September 2026, 09:41 (BST)
/**
 * From `from` to NOW: the plain average of the prices, and what was paid per kWh. Readings are
 * whole half hours; today's newest one (from the Home Mini) runs from 09:30 to now.
 */
function expected(from) {
  let sum = 0, min = 0, cost = 0, kwh = 0;
  for (let t = Math.floor(from / HALF) * HALF; t < NOW; t += HALF) {
    const a = Math.max(t, from), b = Math.min(t + HALF, NOW);
    sum += agilePrice(t) * (b - a);
    min += b - a;
    const end = Math.min(t + HALF, NOW);
    const k = (usedKwh(t) * (b - a)) / (end - t);
    cost += k * agilePrice(t);
    kwh += k;
  }
  return { avg: sum / min, paid: cost / kwh, kwh };
}
const STARTS = {
  min30: NOW - 30 * 60e3,
  hour: NOW - 60 * 60e3,
  today: TODAY,
  week: Date.parse('2026-09-21T00:00:00+01:00'),
  month: Date.parse('2026-09-01T00:00:00+01:00'),
  year: Date.parse('2026-01-01T00:00:00Z'),
};
const SINCE = { min30: 'since 09:11', hour: 'since 08:41', today: 'since midnight', week: 'since Monday', month: 'since 1 September', year: 'since 1 January' };
const priceHistory = (calls) => calls.filter((c) => c.service === 'octopus' && /standard-unit-rates/.test(c.url) && /page_size=1500/.test(c.url));
const usage = (calls) => calls.filter((c) => c.service === 'octopus' && /\/consumption\//.test(c.url));
const rows = (page) => page.$$eval('#stats .st-row', (els) => els.map((el) => ({
  id: el.dataset.id, label: el.querySelector('.st-label').textContent, since: el.querySelector('.st-since').textContent,
  paid: el.querySelector('.st-paid').textContent, avg: el.querySelector('.st-avg').textContent, dot: !!el.querySelector('.st-paid .band-dot'),
})));
const pence = (text) => Number(text.replace(/p$/, ''));
const fmtKwh = (k) => (k < 10 ? k.toFixed(1) : Math.round(k).toLocaleString('en-GB'));
const loaded = (page) => page.locator('#stats .st-row[data-id="year"] .st-paid:not(.none)').waitFor();

test('what you paid and the plain average, last 30 minutes to this year, right to a tenth of a penny', async () => {
  const { ctx, page, calls, problems } = await openPanel(env);
  await page.locator('#price .big .num').waitFor();
  const btn = page.locator('#price .stats-btn');
  assert.equal(await btn.getAttribute('aria-label'), 'Average prices');
  await btn.click();
  await loaded(page);
  assert.deepEqual(await page.$$eval('#stats .st-head span', (s) => s.map((x) => x.textContent)), ['', 'You paid', 'Agile price']);
  const got = await rows(page);
  assert.deepEqual(got.map((r) => r.label), ['Last 30 minutes', 'Last hour', 'Today', 'This week', 'This month', 'This year']);
  for (const r of got) {
    const want = expected(STARTS[r.id]);
    assert.match(r.paid, /^-?\d+\.\dp$/, r.id);
    assert.match(r.avg, /^-?\d+\.\dp$/, r.id);
    assert.ok(Math.abs(pence(r.paid) - want.paid) <= 0.051, `${r.id}: paid shows ${r.paid}, expected ${want.paid.toFixed(3)}`);
    assert.ok(Math.abs(pence(r.avg) - want.avg) <= 0.051, `${r.id}: average shows ${r.avg}, expected ${want.avg.toFixed(3)}`);
    assert.equal(r.since, `${SINCE[r.id]} · ${fmtKwh(want.kwh)} kWh`);
    assert.ok(r.dot, `${r.id} has its band dot`);
  }
  // Readings: one request, with the key; prices a month at a time, no key. Thursday was in the
  // panel's own price list.
  assert.equal(usage(calls).length, 1);
  assert.match(usage(calls)[0].url, /\/electricity-meter-points\/1900026354329\/meters\/22L4132637\/consumption\/\?period_from=2026-01-01T00:00:00\.000Z&period_to=2026-09-24T23:00:00\.000Z/);
  assert.match(usage(calls)[0].headers.authorization, /^Basic /);
  const first = priceHistory(calls);
  assert.equal(first.length, 9);
  assert.ok(first.every((c) => c.headers.authorization === undefined), 'public prices: no key sent');
  assert.equal(await page.locator('#stats .st-msg').textContent(), '');
  assert.match(await page.locator('#stats .st-note').textContent(), /Neither includes the standing charge \(47\.9p a day\)\./);

  // A tap outside closes it; opening it again needs nothing from Octopus.
  await page.mouse.click(8, 8);
  await page.locator('#stats').waitFor({ state: 'hidden' });
  await btn.click();
  await loaded(page);
  assert.equal(priceHistory(calls).length, first.length);
  assert.equal(usage(calls).length, 1);
  // It fits the screen.
  const box = await page.locator('#stats .st-card').boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height <= 800 && box.x >= 0 && box.x + box.width <= 1280, JSON.stringify(box));
  assert.equal(await page.evaluate(() => { const c = document.querySelector('#stats .st-card'); return c.scrollHeight <= c.clientHeight + 1; }), true, 'no scrolling at 1280×800');
  await page.locator('#stats .st-close').click();
  await page.locator('#stats').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.toast:not(.hidden)').count(), 0, 'the button is not a tap on the card');

  // After a reload, the saved days are used.
  await page.reload();
  await page.locator('#price .stats-btn').click();
  await loaded(page);
  assert.equal(priceHistory(calls).length, first.length);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('readings that are late or fail: dashes and a reason, never a wrong figure; prices still show', async () => {
  // Yesterday's readings stop at 6am.
  let { ctx, page } = await openPanel(env, { readingsUntil: Date.parse('2026-09-24T06:00:00+01:00') });
  await page.locator('#price .big .num').waitFor();
  await page.locator('#price .stats-btn').click();
  await loaded(page);
  let got = Object.fromEntries((await rows(page)).map((r) => [r.id, r]));
  assert.equal(got.week.paid, '–', 'four days, one mostly missing: no figure');
  assert.match(got.week.avg, /^\d+\.\dp$/);
  assert.match(got.year.paid, /^\d+\.\dp$/, 'the year is nearly all there');
  assert.match(await page.locator('#stats .st-msg').textContent(), /newest meter readings aren't in yet/);
  await ctx.close();

  ({ ctx, page } = await openPanel(env, { fail: new Set(['usage']), viewport: { width: 960, height: 600 } }));
  await page.locator('#price .big .num').waitFor();
  await page.locator('#price .stats-btn').click();
  await page.locator('#stats .st-msg .bad').waitFor();
  assert.match(await page.locator('#stats .st-msg').textContent(), /Couldn't get your usage from Octopus \(“You paid” needs it\): 503/);
  got = Object.fromEntries((await rows(page)).map((r) => [r.id, r]));
  assert.match(got.today.paid, /^\d+\.\dp$/, 'today is from the Home Mini');
  assert.equal(got.year.paid, '–');
  assert.match(got.year.avg, /^\d+\.\dp$/);
  const box = await page.locator('#stats .st-card').boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height <= 600, 'fits a small screen');
  await ctx.close();
});

test('if the older prices fail, the recent figures still show and the older ones say why', async () => {
  const { ctx, page } = await openPanel(env, { fail: new Set(['rate-history']) });
  await page.locator('#price .big .num').waitFor();
  await page.locator('#price .stats-btn').click();
  await page.locator('#stats .st-msg .bad').waitFor();
  assert.match(await page.locator('#stats .st-msg').textContent(), /Couldn't get the older prices from Octopus: 503/);
  const got = Object.fromEntries((await rows(page)).map((r) => [r.id, r]));
  assert.match(got.today.paid, /^\d+\.\dp$/);
  assert.match(got.today.avg, /^\d+\.\dp$/);
  assert.equal(got.week.avg, '–', 'Monday to Wednesday never came: no average from part of the week');
  assert.equal(got.year.paid, '–');
  await ctx.close();
});

test('without Octopus details the pop-up says what to do', async () => {
  const { ctx, page } = await openPanel(env, { settings: { weather: { lat: 51.5, lon: -0.12, place: 'Westminster' } } });
  await page.locator('#price .stats-btn').click();
  await page.locator('#stats .st-empty', { hasText: 'Add your Octopus details in Settings' }).waitFor();
  await ctx.close();
});
