// Shopping list (Google Tasks), chart pop-ups, the chart before tomorrow's prices, and the
// camera button in the dock.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser, openPanel, text, NOW } from '../support/browser.js';
import { fullSettings } from '../support/mocks.js';

let env;
before(async () => { env = await startBrowser(); });
after(async () => { await env?.close(); });

const waitFor = async (fn, what, ms = 5000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
};

test('shopping list: shows the Google Tasks list; tap ticks off (with undo); + adds', async () => {
  const { ctx, page, calls, problems } = await openPanel(env);
  const shop = page.locator('#shop');
  await shop.locator('li[data-id]', { hasText: 'Milk' }).waitFor();
  assert.deepEqual(await shop.locator('li[data-id] .what').allInnerTexts(), ['Milk', 'Bread', 'Bananas', 'Washing-up liquid']);

  await shop.locator('li[data-id]', { hasText: 'Milk' }).click();
  await page.locator('.toast', { hasText: 'Ticked off Milk' }).waitFor();
  assert.equal(await shop.locator('li[data-id]', { hasText: 'Milk' }).count(), 0);
  const patch = await waitFor(() => calls.find((c) => c.service === 'tasks' && c.method === 'PATCH'), 'PATCH');
  assert.match(patch.url, /\/lists\/shop\/tasks\/t1$/);
  assert.deepEqual(patch.body, { status: 'completed' });

  await page.locator('.toast .toast-action', { hasText: 'Undo' }).click();
  await waitFor(() => calls.filter((c) => c.service === 'tasks' && c.method === 'PATCH').length === 2, 'undo PATCH');
  assert.deepEqual(calls.filter((c) => c.method === 'PATCH')[1].body, { status: 'needsAction', completed: null });
  await shop.locator('li[data-id]', { hasText: 'Milk' }).waitFor();

  await shop.locator('.shop-plus').click();
  await shop.locator('.shop-add input').fill('Eggs');
  await shop.locator('.shop-add input').press('Enter');
  await shop.locator('li[data-id]', { hasText: 'Eggs' }).waitFor();
  const post = calls.find((c) => c.service === 'tasks' && c.method === 'POST');
  assert.deepEqual(post.body, { title: 'Eggs' });
  assert.equal(await page.locator('.dock [data-app="shopping"]').count(), 0);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('shopping list: an older Google sign-in is asked to sign in again; no list chosen says so', async () => {
  const s = fullSettings(NOW);
  s.google.scopes = 'https://www.googleapis.com/auth/sdm.service https://www.googleapis.com/auth/calendar.readonly';
  const a = await openPanel(env, { settings: s });
  await a.page.locator('#shop', { hasText: 'Sign in to Google again' }).waitFor();
  assert.equal(a.calls.some((c) => c.service === 'tasks'), false);
  await a.ctx.close();

  const s2 = fullSettings(NOW);
  s2.google.shoppingList = null;
  const b = await openPanel(env, { settings: s2 });
  await b.page.locator('#shop', { hasText: 'Choose your Google Tasks shopping list' }).waitFor();
  await b.ctx.close();
});

test('settings: choose (or create) the shopping list', async () => {
  const s = fullSettings(NOW);
  s.google.shoppingList = null;
  const { ctx, page } = await openPanel(env, { settings: s });
  await page.locator('#clock .gear').click();
  const settings = page.locator('#settings');
  await settings.getByRole('button', { name: 'Choose shopping list' }).click();
  await settings.getByLabel('Shopping', { exact: true }).check();
  await settings.getByRole('button', { name: 'Save & close' }).click();
  await page.locator('#shop li[data-id]', { hasText: 'Bread' }).waitFor();
  await ctx.close();
});

test('tapping a price bar shows its time and price', async () => {
  const { ctx, page } = await openPanel(env);
  await page.locator('#chart svg .ch-hit').first().waitFor();
  const bars = page.locator('#chart svg .ch-hit');
  const n = await bars.count();
  const target = bars.nth(Math.floor(n / 2));
  const [start, end, p] = await target.evaluate((el) => [el.dataset.start, el.dataset.end, el.dataset.p].map(Number));
  await target.click({ force: true });
  const tip = page.locator('#chart .chart-tip');
  await tip.waitFor();
  const t = await tip.innerText();
  const hm = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
  assert.match(t, new RegExp(`${(Math.round(p * 10) / 10).toFixed(1)}p`));
  assert.ok(t.includes(`${hm(start)}–${hm(end)}`), t);
  assert.match(t, /Cheap|Normal|Peak|Plunge/);
  assert.equal(await page.locator('.toast:not(.hidden)').count(), 0, 'a bar tap is not a card tap');
  await ctx.close();
});

test('before tomorrow\'s prices, the chart fills its width with today\'s', async () => {
  const { ctx, page } = await openPanel(env); // 09:41: only today's prices are published
  await page.locator('#chart svg .ch-bar').first().waitFor();
  const m = await page.evaluate(() => {
    const svg = document.querySelector('#chart svg');
    const bars = [...svg.querySelectorAll('.ch-bar')].map((b) => b.getBBox());
    const right = Math.max(...bars.map((b) => b.x + b.width));
    return { right, width: svg.viewBox.baseVal.width, pending: svg.querySelectorAll('.ch-pending').length, note: svg.querySelector('.ch-soon')?.textContent };
  });
  assert.ok(m.right > m.width * 0.95, `bars reach the right edge (${m.right} of ${m.width})`);
  assert.equal(m.pending, 0);
  assert.match(m.note, /Tomorrow's prices from ~4pm/);
  await ctx.close();

  const evening = await openPanel(env, { now: Date.parse('2026-09-25T18:10:00+01:00') });
  await evening.page.locator('#chart svg .ch-day', { hasText: 'Sat' }).waitFor();
  assert.equal(await evening.page.locator('#chart svg .ch-soon').count(), 0);
  await evening.ctx.close();
});

test('the camera is the first button in the dock and still opens full screen', async () => {
  const { ctx, page } = await openPanel(env);
  await page.locator('.dock #cam').waitFor();
  assert.equal(await page.locator('.dock > *').first().getAttribute('id'), 'cam');
  assert.match(await text(page, '#cam'), /Front door/);
  await ctx.close();
});
