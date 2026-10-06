// The average prices pop-up: the small button on the price card. Octopus is faked (mocks.js),
// so the expected averages are worked out here from the same fake prices.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser, openPanel, NOW } from '../support/browser.js';
import { agilePrice } from '../support/mocks.js';

let env;
before(async () => { env = await startBrowser(); });
after(async () => { await env?.close(); });

/** The fake prices averaged over time from `from` to NOW (each half hour at its start price). */
function expected(from) {
  let sum = 0, min = 0;
  for (let t = Math.floor(from / 1800e3) * 1800e3; t < NOW; t += 1800e3) {
    const a = Math.max(t, from), b = Math.min(t + 1800e3, NOW);
    sum += agilePrice(t) * (b - a);
    min += b - a;
  }
  return sum / min;
}
// NOW is Friday 25 September 2026, 09:41 (BST).
const STARTS = {
  min30: NOW - 30 * 60e3,
  hour: NOW - 60 * 60e3,
  today: Date.parse('2026-09-25T00:00:00+01:00'),
  week: Date.parse('2026-09-21T00:00:00+01:00'),
  month: Date.parse('2026-09-01T00:00:00+01:00'),
  year: Date.parse('2026-01-01T00:00:00Z'),
};
const SINCE = { min30: 'since 09:11', hour: 'since 08:41', today: 'since midnight', week: 'since Monday', month: 'since 1 September', year: 'since 1 January' };
const history = (calls) => calls.filter((c) => c.service === 'octopus' && /standard-unit-rates/.test(c.url) && /page_size=1500/.test(c.url));
const rows = (page) => page.$$eval('#stats .st-row', (els) => els.map((el) => ({
  id: el.dataset.id, label: el.querySelector('.st-label').textContent, since: el.querySelector('.st-since').textContent,
  value: el.querySelector('.st-val').textContent, dot: !!el.querySelector('.st-val .band-dot'),
})));

test('the averages: last 30 minutes to this year, right to a tenth of a penny; the year is fetched once', async () => {
  const { ctx, page, calls, problems } = await openPanel(env);
  await page.locator('#price .big .num').waitFor();
  const btn = page.locator('#price .stats-btn');
  assert.equal(await btn.getAttribute('aria-label'), 'Average prices');
  await btn.click();
  await page.locator('#stats .st-row[data-id="year"] .st-val:not(.none)').waitFor();
  const got = await rows(page);
  assert.deepEqual(got.map((r) => r.label), ['Last 30 minutes', 'Last hour', 'Today', 'This week', 'This month', 'This year']);
  for (const r of got) {
    const want = expected(STARTS[r.id]);
    const shown = Number(r.value.replace(/p$/, ''));
    assert.match(r.value, /^-?\d+\.\dp$/, r.id);
    assert.ok(Math.abs(shown - want) <= 0.051, `${r.id}: shows ${r.value}, expected ${want.toFixed(3)}`);
    assert.equal(r.since, SINCE[r.id]);
    assert.ok(r.dot, `${r.id} has its band dot`);
  }
  // 1 January to Wednesday from Octopus, a page of 1500 half hours at a time; Thursday was in
  // the panel's own list.
  const first = history(calls);
  assert.equal(first.length, Math.ceil(((Date.parse('2026-09-24T00:00:00+01:00') - STARTS.year) / 1800e3) / 1500));
  assert.match(first[0].url, /period_from=2026-01-01T00:00:00\.000Z&period_to=2026-09-23T23:00:00\.000Z/);
  assert.equal(first[0].headers.authorization, undefined, 'public prices: no key sent');
  assert.equal(await page.locator('#stats .st-msg').textContent(), '');

  // A tap outside closes it; opening it again needs nothing from Octopus.
  await page.mouse.click(8, 8);
  await page.locator('#stats').waitFor({ state: 'hidden' });
  await btn.click();
  await page.locator('#stats .st-row[data-id="year"] .st-val:not(.none)').waitFor();
  assert.equal(history(calls).length, first.length);
  // It fits the screen.
  const box = await page.locator('#stats .st-card').boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height <= 800 && box.x >= 0 && box.x + box.width <= 1280, JSON.stringify(box));
  assert.equal(await page.evaluate(() => document.querySelector('#stats .st-card').scrollHeight <= document.querySelector('#stats .st-card').clientHeight + 1), true, 'no scrolling at 1280×800');
  await page.locator('#stats .st-close').click();
  await page.locator('#stats').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.toast:not(.hidden)').count(), 0, 'the button is not a tap on the card');

  // After a reload, the saved days are used.
  await page.reload();
  await page.locator('#price .stats-btn').click();
  await page.locator('#stats .st-row[data-id="year"] .st-val:not(.none)').waitFor();
  assert.equal(history(calls).length, first.length);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('if Octopus fails, the recent averages still show and the older ones say why', async () => {
  const { ctx, page } = await openPanel(env, { fail: new Set(['rate-history']), viewport: { width: 960, height: 600 } });
  await page.locator('#price .big .num').waitFor();
  await page.locator('#price .stats-btn').click();
  await page.locator('#stats .st-msg.bad').waitFor();
  assert.match(await page.locator('#stats .st-msg').textContent(), /^Couldn't get the older prices from Octopus: 503/);
  const got = Object.fromEntries((await rows(page)).map((r) => [r.id, r.value]));
  assert.match(got.today, /^\d+\.\dp$/);
  assert.equal(got.week, '–', 'Monday to Wednesday never came: no average from part of the week');
  assert.equal(got.year, '–');
  const box = await page.locator('#stats .st-card').boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height <= 600, 'fits a small screen');
  await ctx.close();
});

test('without Octopus details the pop-up says what to do', async () => {
  const { ctx, page } = await openPanel(env, { settings: { weather: { lat: 51.5, lon: -0.12, place: 'Westminster' } } });
  await page.locator('#price .stats-btn').click();
  await page.locator('#stats .st-empty', { hasText: 'Add your Octopus details in Settings' }).waitFor();
  await ctx.close();
});
