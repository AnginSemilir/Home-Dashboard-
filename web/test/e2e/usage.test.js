// When you use electricity: the clock button on the price card. Octopus is faked (mocks.js), so
// the expected figures are worked out here from the same fake readings.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser, openPanel, NOW } from '../support/browser.js';
import { usedKwh, agilePrice } from '../support/mocks.js';

let env;
before(async () => { env = await startBrowser(); });
after(async () => { await env?.close(); });

const HALF = 1800e3;
const TODAY = Date.parse('2026-09-25T00:00:00+01:00'); // NOW is Friday 25 September 2026, 09:41 (BST)
const YEAR = Date.parse('2026-01-01T00:00:00Z');
const kwhText = (k) => (k < 1 ? k.toFixed(2) : k < 10 ? k.toFixed(1) : Math.round(k).toLocaleString('en-GB'));
/** kWh from `from` to now (today's newest half hour, from the Home Mini, counts whole). */
function total(from) {
  let k = 0;
  for (let t = from; t < NOW; t += HALF) k += usedKwh(t);
  return k;
}
const bars = (page) => page.locator('#usage .uc-chart svg .ch-bar').count();
/** Pick a period and wait for its bars (the year may still be loading from Octopus). */
const period = async (page, id, n = 24) => {
  await page.locator(`#usage .uc-seg button[data-period="${id}"]`).click();
  await page.locator('#usage:not([data-loading="1"])').waitFor();
  await page.waitForFunction((want) => document.querySelectorAll('#usage .uc-chart svg .ch-bar').length === want, n);
};
const open = async (page) => {
  await page.locator('#price .big .num').waitFor();
  await page.locator('#price .usage-btn').click();
  await page.locator('#usage .uc-chart svg .ch-bar').first().waitFor();
};
/** Wait until the year has finished loading (the chart is redrawn when it does). */
const settled = (page) => page.locator('#usage:not([data-loading="1"])').waitFor();

test('today by the hour; tap a bar for its numbers; switch to the year; the choice is remembered', async () => {
  const { ctx, page, calls, problems } = await openPanel(env);
  await open(page);
  assert.equal(await page.locator('#price .usage-btn').getAttribute('aria-label'), 'When you use electricity');
  assert.equal(await page.locator('#usage .uc-seg [aria-pressed="true"]').textContent(), 'Today');
  assert.equal(await page.locator('#usage .st-sub').textContent(), 'kWh used in each hour today');
  assert.equal(await bars(page), 10, 'midnight to 09:41: ten hours');
  assert.equal(await page.locator('#usage .uc-hit').count(), 24);
  assert.match(await page.locator('#usage .uc-sum').textContent(), new RegExp(`^${kwhText(total(TODAY)).replace('.', '\\.')} kWh so far · most at \\d\\d:00–\\d\\d:00$`));

  // 03:00–04:00: two half hours.
  await settled(page);
  await page.locator('#usage .uc-hit[data-h="3"]').click();
  const t3 = Date.parse('2026-09-25T03:00:00+01:00');
  const k3 = usedKwh(t3) + usedKwh(t3 + HALF);
  const p3 = (usedKwh(t3) * agilePrice(t3) + usedKwh(t3 + HALF) * agilePrice(t3 + HALF)) / k3;
  const share = Math.round((k3 / total(TODAY)) * 100);
  assert.equal(await page.locator('#usage .uc-info').textContent(), `03:00–04:00 · ${kwhText(k3)} kWh · ${share}% of your use · paid ${(Math.round(p3 * 10) / 10).toFixed(1)}p a kWh`);
  assert.equal(await page.locator('#usage .uc-chart.has-sel .ch-bar.on').count(), 1, 'the other bars fade');

  // The year: the same cache as the average prices (one load for both).
  await period(page, 'year');
  assert.equal(await page.locator('#usage .st-sub').textContent(), 'Average kWh a day in each hour');
  assert.match(await page.locator('#usage .uc-sum').textContent(), new RegExp(`^${kwhText(total(YEAR))} kWh · [\\d.]+ kWh a day · most at`));
  const history = calls.filter((c) => /page_size=1500/.test(c.url)).length;
  await page.locator('#usage .st-close').click();
  await page.locator('#price .stats-btn').click();
  await page.locator('#stats .st-row[data-id="year"] .st-paid:not(.none)').waitFor();
  assert.equal(calls.filter((c) => /page_size=1500/.test(c.url)).length, history, 'the average prices need nothing more');
  await page.locator('#stats .st-close').click();

  // Remembered on this device.
  await page.reload();
  await open(page);
  assert.equal(await page.locator('#usage .uc-seg [aria-pressed="true"]').textContent(), 'This year');
  // It fits, with no scrolling.
  const box = await page.locator('#usage .st-card').boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height <= 800, JSON.stringify(box));
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('the week and month, on a small screen; a tap outside closes it', async () => {
  const { ctx, page } = await openPanel(env, { viewport: { width: 960, height: 600 } });
  await open(page);
  for (const [id, from] of [['week', Date.parse('2026-09-21T00:00:00+01:00')], ['month', Date.parse('2026-09-01T00:00:00+01:00')]]) {
    await period(page, id);
    assert.match(await page.locator('#usage .uc-sum').textContent(), new RegExp(`^${kwhText(total(from))} kWh · `), id);
  }
  const box = await page.locator('#usage .st-card').boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height <= 600 && box.x >= 0 && box.x + box.width <= 960, JSON.stringify(box));
  assert.equal(await page.evaluate(() => { const c = document.querySelector('#usage .st-card'); return c.scrollHeight <= c.clientHeight + 1; }), true, 'no scrolling at 960×600');
  await page.mouse.click(5, 5);
  await page.locator('#usage').waitFor({ state: 'hidden' });
  await ctx.close();
});

test('without the API key it says what to add', async () => {
  const s = { weather: { lat: 51.5, lon: -0.12, place: 'Westminster' }, octopus: { tariff: 'E-1R-AGILE-24-10-01-C' } };
  const { ctx, page } = await openPanel(env, { settings: s });
  await page.locator('#price .big .num').waitFor();
  await page.locator('#price .usage-btn').click();
  await page.locator('#usage .st-empty', { hasText: 'Add your Octopus account number and API key in Settings to see your usage.' }).waitFor();
  await ctx.close();
});

test('the table view: every hour in two halves, the busiest in bold, rows tap like bars; remembered', async () => {
  const { ctx, page, problems } = await openPanel(env, { viewport: { width: 960, height: 600 } });
  await open(page);
  assert.equal(await page.locator('#usage .uc-view [aria-pressed="true"]').textContent(), 'Chart');
  await settled(page);
  await page.locator('#usage .uc-view button[data-view="table"]').click();
  assert.equal(await page.locator('#usage .uc-view [aria-pressed="true"]').textContent(), 'Table');
  assert.equal(await page.locator('#usage .uc-chart').isVisible(), false);
  assert.equal(await page.locator('#usage .uc-table table').count(), 2);
  assert.equal(await page.locator('#usage .uc-table tbody tr').count(), 24);
  assert.deepEqual(await page.$$eval('#usage .uc-table table:first-child thead th', (t) => t.map((x) => x.textContent)), ['Hour', 'kWh', 'Share', 'Paid']);
  // Today, 03:00: the same figures as the chart's tap.
  const t3 = Date.parse('2026-09-25T03:00:00+01:00');
  const k3 = usedKwh(t3) + usedKwh(t3 + HALF);
  const p3 = (usedKwh(t3) * agilePrice(t3) + usedKwh(t3 + HALF) * agilePrice(t3 + HALF)) / k3;
  const row3 = await page.$$eval('#usage .uc-table tr[data-h="3"] > *', (c) => c.map((x) => x.textContent));
  assert.deepEqual(row3, ['03:00', kwhText(k3), `${Math.round((k3 / total(TODAY)) * 100)}%`, `${(Math.round(p3 * 10) / 10).toFixed(1)}p`]);
  assert.ok(await page.locator('#usage .uc-table tr[data-h="3"] .band-dot').count(), 'the price band dot');
  assert.deepEqual(await page.$$eval('#usage .uc-table tr[data-h="15"] td', (c) => c.map((x) => x.textContent)), ['–', '–', '–'], 'later today: nothing yet');
  assert.equal(await page.locator('#usage .uc-table tr.peak').count(), 1);
  // A tap on a row picks that hour.
  await page.locator('#usage .uc-table tr[data-h="3"]').click();
  assert.equal(await page.locator('#usage .uc-table tr.on').getAttribute('data-h'), '3');
  assert.match(await page.locator('#usage .uc-info').textContent(), /^03:00–04:00 · /);
  // Another period keeps the table (once the month has loaded).
  await page.locator('#usage .uc-seg button[data-period="month"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#usage .uc-table tbody tr').length === 24 && !document.querySelector('#usage .uc-table').classList.contains('hidden'));
  assert.equal(await page.locator('#usage .uc-table thead th').nth(1).textContent(), 'kWh a day');
  assert.equal(await page.locator('#usage .uc-table tbody td:has-text("–")').count(), 0, 'every hour has a figure this month');
  // It fits, and it's remembered.
  assert.equal(await page.evaluate(() => { const c = document.querySelector('#usage .st-card'); return c.scrollHeight <= c.clientHeight + 1; }), true, 'no scrolling at 960×600');
  await page.reload();
  await page.locator('#price .big .num').waitFor();
  await page.locator('#price .usage-btn').click();
  await page.locator('#usage .uc-table tbody tr').first().waitFor();
  assert.equal(await page.locator('#usage .uc-view [aria-pressed="true"]').textContent(), 'Table');
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('slide a finger along the bars to pick an hour; tap the picked one again to clear', async () => {
  const { ctx, page } = await openPanel(env, { touch: true });
  await open(page);
  await period(page, 'month');
  await settled(page);
  const box = await page.locator('#usage .uc-chart').boundingBox();
  const at = (hr) => page.evaluate((h) => {
    const r = document.querySelector(`#usage .uc-hit[data-h="${h}"]`).getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  }, hr);
  const [x3, y] = await at(3), [x9] = await at(9);
  await page.mouse.move(x3, y);
  await page.mouse.down();
  assert.match(await page.locator('#usage .uc-info').textContent(), /^03:00–04:00/);
  for (let i = 1; i <= 6; i++) await page.mouse.move(x3 + ((x9 - x3) * i) / 6, y);
  assert.match(await page.locator('#usage .uc-info').textContent(), /^09:00–10:00/, 'followed the finger');
  await page.mouse.up();
  assert.equal(await page.locator('#usage .ch-bar.on').count(), 1);
  // Tapping the picked hour again clears it.
  await page.mouse.click(x9, y);
  assert.equal(await page.locator('#usage .ch-bar.on').count(), 0);
  assert.match(await page.locator('#usage .uc-info').textContent(), /^Tap or slide/);
  assert.ok(box.height > 100);
  // The two small buttons on the price card are at least 40px and don't touch.
  const a = await page.locator('#price .usage-btn').boundingBox(), b = await page.locator('#price .stats-btn').boundingBox();
  assert.ok(a.width >= 40 && a.height >= 40 && b.width >= 40, JSON.stringify([a, b]));
  assert.ok(b.x - (a.x + a.width) >= 4, 'a gap between them');
  await ctx.close();
});

test('a Home Mini that stopped: today says so instead of showing the missing hours as no use', async () => {
  const { ctx, page } = await openPanel(env, { homeMiniStopsAt: Date.parse('2026-09-25T05:00:00+01:00') });
  await open(page);
  assert.match(await page.locator('#usage .uc-sum').textContent(), /^[\d.]+ kWh until 05:30 · most at/);
  assert.match(await page.locator('#usage .st-msg').textContent(), /The Home Mini's readings stop at 05:30, so later hours are missing\./);
  await ctx.close();
});

test('Monday morning: this week is shown as used so far, not scaled up into a day', async () => {
  const monday = Date.parse('2026-09-21T08:05:00+01:00');
  const { ctx, page } = await openPanel(env, { now: monday });
  await page.locator('#price .big .num').waitFor();
  await page.locator('#price .usage-btn').click();
  await page.locator('#usage .uc-seg button[data-period="week"]').click();
  await page.locator('#usage .uc-chart svg .ch-bar').first().waitFor();
  assert.equal(await page.locator('#usage .st-sub').textContent(), 'kWh used in each hour so far (the first day)');
  assert.match(await page.locator('#usage .uc-sum').textContent(), /^[\d.]+ kWh so far · most at/);
  assert.doesNotMatch(await page.locator('#usage .uc-sum').textContent(), /a day/);
  await ctx.close();
});
