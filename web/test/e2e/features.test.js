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

test('settings: choosing a shopping list says what to do instead of "403"', async () => {
  // A sign-in from before the shopping list: told to sign in again, and Google isn't asked.
  const s = fullSettings(NOW);
  s.google.shoppingList = null;
  s.google.scopes = 'https://www.googleapis.com/auth/sdm.service https://www.googleapis.com/auth/calendar.readonly';
  const a = await openPanel(env, { settings: s });
  await a.page.locator('#clock .gear').click();
  const set = a.page.locator('#settings');
  await set.getByText('Shopping list (Google Tasks) · sign in to Google again to allow it').waitFor();
  await set.getByRole('button', { name: 'Choose shopping list' }).click();
  await set.locator('.btn-status.bad', { hasText: "doesn't allow Google Tasks yet" }).waitFor();
  assert.equal(a.calls.some((c) => c.service === 'tasks'), false);
  await a.ctx.close();

  // The Tasks API switched off in Google Cloud: says so, with a link that turns it on.
  const s2 = fullSettings(NOW);
  s2.google.shoppingList = null;
  const b = await openPanel(env, { settings: s2, fail: new Set(['tasks-off']) });
  await b.page.locator('#clock .gear').click();
  const set2 = b.page.locator('#settings');
  await set2.getByRole('button', { name: 'Choose shopping list' }).click();
  const status = set2.locator('.btn-status.bad', { hasText: 'Google Tasks API is switched off' });
  await status.waitFor();
  assert.doesNotMatch(await status.innerText(), /^403/);
  assert.equal(await status.locator('a').getAttribute('href'), 'https://console.developers.google.com/apis/api/tasks.googleapis.com/overview?project=123');
  assert.equal(await status.locator('a').getAttribute('target'), '_blank');
  await b.ctx.close();

  // On the panel, a sign-in without Tasks: the card's reason says what to do.
  const c = await openPanel(env, { fail: new Set(['tasks']) });
  await c.page.locator('#shop .dot.error').waitFor();
  await c.page.locator('#shop').click();
  await c.page.locator('.toast', { hasText: "doesn't allow Google Tasks (the shopping list)" }).waitFor();
  await c.ctx.close();
});

test('signing in without ticking Tasks says the shopping list won\'t work', async () => {
  const s = fullSettings(NOW);
  s.google.refreshToken = '';
  s.google.scopes = '';
  const { ctx, page } = await openPanel(env, { settings: s, initScript: () => {
    // Google's answer when the Tasks box was unticked on its screen.
    const real = window.fetch;
    window.fetch = async (url, opts) => {
      const res = await real(url, opts);
      if (String(url).includes('/token') && String(opts?.body || '').includes('authorization_code')) {
        const b = await res.json();
        b.scope = 'https://www.googleapis.com/auth/sdm.service https://www.googleapis.com/auth/calendar.readonly';
        return new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return res;
    };
  } });
  await page.locator('#clock .gear').click();
  await page.locator('#settings').getByRole('button', { name: 'Sign in with Google' }).click();
  await page.locator('.toast', { hasText: "didn't allow Google Tasks (the shopping list)" }).waitFor();
  await ctx.close();
});

test('Auto theme: light and dark follow sunrise and sunset where the tablet is; Always light/dark still there', async () => {
  const at = Date.parse('2026-09-25T07:10:00+01:00'); // after sunrise in London (06:53), before it in Reykjavik (~08:20 BST)
  // Location refused: the weather location (London) decides. Light.
  const a = await openPanel(env, { now: at, theme: 'auto' });
  await a.page.locator('#price .big').waitFor();
  assert.equal(await a.page.evaluate(() => document.documentElement.dataset.theme), 'light');
  await a.page.locator('#clock .gear').click();
  await a.page.locator('#settings').getByText('Today: light from 06:53 (sunrise) to 18:55 (sunset) at the weather location').waitFor();
  // Always dark still wins over the sun.
  await a.page.locator('#settings').getByLabel('Theme').selectOption('dark');
  await a.page.locator('#settings').getByRole('button', { name: 'Save & close' }).click();
  await a.page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await a.ctx.close();
  // The tablet is in Reykjavik: still dark there. Only a rounded position is kept.
  const b = await openPanel(env, { now: at, theme: 'auto', geolocation: { latitude: 64.14681, longitude: -21.94229 } });
  await b.page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  const place = await b.page.evaluate(() => JSON.parse(localStorage.getItem('wallpanel.cache.v1')).place);
  assert.deepEqual([place.lat, place.lon], [64.15, -21.94]);
  await b.page.locator('#clock .gear').click();
  await b.page.locator('#settings').getByText(/Today: light from 08:\d\d \(sunrise\) to 20:\d\d \(sunset\) where the tablet is/).waitFor();
  await b.page.locator('#settings').getByRole('button', { name: 'Cancel' }).click();
  // The place is remembered: after a reload with location off, still Reykjavik's sun.
  await b.ctx.setGeolocation(null).catch(() => {});
  await b.ctx.clearPermissions();
  await b.page.reload();
  await b.page.locator('#price .big').waitFor();
  assert.equal(await b.page.evaluate(() => document.documentElement.dataset.theme), 'dark');
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
