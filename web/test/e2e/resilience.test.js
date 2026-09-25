// What the panel does when things quietly go wrong: a Home Mini that stops reporting, a Kia
// job that stops running, an account lookup that fails, prices that can't load, signing out,
// and the nightly reload during night mode.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser, openPanel, text, NOW } from '../support/browser.js';
import { fullSettings } from '../support/mocks.js';

let env;
before(async () => { env = await startBrowser(); });
after(async () => { await env?.close(); });

const ready = (page) => page.locator('.tile.car .t-value', { hasText: '%' }).waitFor();

test('a Home Mini that stops reporting turns amber and says since when', async () => {
  const { ctx, page } = await openPanel(env, { homeMiniStopsAt: NOW - 2 * 3600e3 });
  await ready(page);
  await page.locator('.tile.usage .dot.stale').waitFor();
  await page.locator('.tile.usage').click();
  await page.locator('.toast', { hasText: /No new Home Mini reading since 07:\d\d/ }).waitFor();
  await ctx.close();
});

test('a Kia job that has stopped running keeps the last reading but shows a red dot', async () => {
  const { ctx, page } = await openPanel(env, { kiaReading: { battery: 64, range: 150, updated: NOW - 5 * 3600e3, fetched: NOW - 10 * 3600e3 } });
  await page.locator('.tile.car .dot.error').waitFor();
  assert.match(await text(page, '.tile.car .t-value'), /^64%/);
  await page.locator('.tile.car').click();
  await page.locator('.toast', { hasText: /Kia GitHub job last ran 10 h ago/ }).waitFor();
  await ctx.close();
});

test('if the daily account lookup fails, prices keep coming with the known tariff', async () => {
  const s = fullSettings(NOW);
  s.octopus.discovered.at = NOW - 25 * 3600e3; // due for a fresh lookup
  const { ctx, page, calls } = await openPanel(env, { settings: s, fail: new Set(['graphql']) });
  await page.locator('#price .big', { hasText: 'p/kWh' }).waitFor();
  assert.equal(await page.locator('#price .dot.error').count(), 0);
  await page.locator('.tile.usage .dot.error').waitFor(); // Home Mini genuinely needs the key
  assert.ok(calls.some((c) => /standard-unit-rates/.test(c.url)));
  await ctx.close();
});

test('with no prices, "Today so far" shows – rather than a wrong total', async () => {
  const { ctx, page } = await openPanel(env, { fail: new Set(['rates']) });
  await page.locator('.tile.usage .t-value', { hasText: 'W' }).waitFor();
  await page.locator('#price .dot.error').waitFor();
  assert.equal(await text(page, '.tile.cost .t-value'), '–');
  assert.match(await page.locator('.tile.cost .dot').getAttribute('class'), /error/);
  await ctx.close();
});

test('signing out revokes access at Google and clears the calendar and thermostat from the panel', async () => {
  const { ctx, page, calls } = await openPanel(env);
  await page.locator('#cal', { hasText: 'Dentist' }).waitFor();
  await page.locator('.tile.indoor .t-value', { hasText: '20.5°' }).waitFor();
  await page.locator('#clock .gear').click();
  const settings = page.locator('#settings');
  await settings.getByRole('button', { name: 'Sign out of Google' }).click();
  await settings.getByText(/Signed out of Google/).waitFor();
  assert.deepEqual(calls.find((c) => c.service === 'google-revoke')?.body, { token: 'rt-123' });
  await settings.getByRole('button', { name: 'Save & close' }).click();
  await page.locator('#cal', { hasText: 'Sign in to Google' }).waitFor();
  assert.equal(await text(page, '.tile.indoor .t-value'), '–');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wallpanel.settings.v1')).google);
  assert.equal(saved.refreshToken, '');
  assert.deepEqual(saved.calendars, []);
  const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('wallpanel.cache.v1')));
  assert.equal(cache.events, null);
  assert.equal(cache.thermo, null);
  await ctx.close();
});

test('the automatic nightly reload keeps the screen dark; a manual reload at night does not', async () => {
  const at = Date.parse('2026-09-25T03:30:10+01:00');
  const auto = await openPanel(env, { now: at, clock: 'install', initScript: () => sessionStorage.setItem('wallpanel.autoreload', '1') });
  await ready(auto.page);
  assert.equal(await auto.page.locator('#night').isVisible(), true);
  await auto.ctx.close();

  const manual = await openPanel(env, { now: at, clock: 'install' });
  await ready(manual.page);
  assert.equal(await manual.page.locator('#night').isVisible(), false, 'someone just reloaded it, so stay awake for now');
  await manual.page.clock.runFor(120e3);
  assert.equal(await manual.page.locator('#night').isVisible(), true);
  await manual.ctx.close();
});
