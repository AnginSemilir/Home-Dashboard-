// Usage from Bright (any supplier, a fixed price), for a household that left Octopus. The
// Glowmarkt API is faked (mocks.js): readings about 40 minutes behind, and with `glow`, live watts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser, openPanel, NOW } from '../support/browser.js';
import { brightSettings, fullSettings, usedKwh } from '../support/mocks.js';

let env;
before(async () => { env = await startBrowser(); });
after(async () => { await env?.close(); });

const HALF = 1800e3;
const TODAY = Date.parse('2026-09-25T00:00:00+01:00'); // NOW is Friday 25 September 2026, 09:41 (BST)
const YESTERDAY = TODAY - 864e5;
const UNTIL = NOW - 40 * 60e3; // the fake Bright's newest reading ends here (half hours ending by 09:01)
const kwh = (from, to) => {
  let k = 0;
  for (let t = from; t < to && t + HALF <= UNTIL; t += HALF) k += usedKwh(t);
  return k;
};
const pounds = (k) => `£${((47.35 + k * 26.64) / 100).toFixed(2)}`;
const text = (page, sel) => page.locator(sel).innerText();

test('left Octopus: today so far in pounds, today\'s half hours, the last half hour and yesterday', async () => {
  const { ctx, page, calls, problems } = await openPanel(env, { settings: brightSettings(NOW), initScript: () => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  } });
  await page.locator('#price .big .num', { hasText: '£' }).waitFor();
  const today = kwh(TODAY, NOW);
  assert.equal(await text(page, '#price .label'), 'Today so far');
  assert.equal(await text(page, '#price .big .num'), pounds(today));
  assert.equal(await text(page, '#price .band-chip'), `${today.toFixed(1)} kWh`);
  assert.match(await text(page, '#price .sub'), /readings to 09:00 · Bright is about half an hour behind\s+26\.6p a kWh \+ 47\.4p a day/);

  // Today's half hours: midnight to 09:00 (eighteen), with the gap to now marked.
  assert.match(await text(page, '#chart .chart-head .label'), /^Usage today\s*kWh per half hour$/);
  assert.equal(await page.locator('#chart .ch-bar.ch-use').count(), 18);
  await page.locator('#chart .ch-hit').nth(6).click(); // 03:00–03:30
  const k3 = usedKwh(Date.parse('2026-09-25T03:00:00+01:00'));
  assert.equal(await text(page, '#chart .chart-tip'), `${k3.toFixed(2)} kWh 03:00–03:30 · about ${Math.round(k3 * 2000)} W`);

  // The newest half hour (no Glow display, so nothing live) and yesterday.
  const last = usedKwh(Date.parse('2026-09-25T08:30:00+01:00'));
  assert.equal(await text(page, '.tile.usage .t-label'), 'Last half hour');
  assert.equal(await text(page, '.tile.usage .t-value'), `${Math.round(last * 2000)} W`);
  assert.equal(await text(page, '.tile.usage .extra'), '08:30–09:00 average');
  const y = kwh(YESTERDAY, TODAY);
  assert.equal(await text(page, '.tile.cost .t-label'), 'Yesterday');
  assert.equal(await text(page, '.tile.cost .t-value'), pounds(y));
  assert.equal(await text(page, '.tile.cost .extra'), `${y.toFixed(1)} kWh`);

  // Agile-only parts are gone, Octopus is never asked, and Bright is asked the right way.
  assert.equal(await page.locator('#price .stats-btn').isVisible(), false);
  assert.equal(await page.locator('#price .usage-btn').isVisible(), false);
  assert.equal(calls.filter((c) => c.service === 'octopus').length, 0, 'no Octopus calls');
  const bright = calls.filter((c) => c.service === 'bright');
  assert.deepEqual(bright.map((c) => c.path).slice(0, 5), ['/auth', '/virtualentity', '/resource/res-elec/current', '/resource/res-elec/catchup', '/resource/res-elec/readings']);
  const r = new URL(bright.find((c) => c.path.endsWith('/readings')).url);
  assert.equal(r.searchParams.get('from'), '2026-09-23T23:00:00', 'from yesterday 00:00 (UK time)');
  assert.equal(r.searchParams.get('period'), 'PT30M');
  assert.ok(bright.every((c) => !c.url.includes('bright-pass')), 'the password is never in a URL');

  // The checklist.
  await page.locator('#clock .gear').click();
  const set = page.locator('#settings');
  await set.getByText(/Electricity usage \(Bright\) · 26\.64p a kWh \+ 47\.35p a day/).waitFor();
  await set.getByText('Live usage (Glow display) · optional: needs a Glow display/CAD').waitFor();
  assert.equal(await set.getByText('Octopus Agile prices').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__csp), []);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('with a Glow display: live usage every 30 seconds', async () => {
  const { ctx, page, calls } = await openPanel(env, { settings: brightSettings(NOW), glow: true });
  await page.locator('.tile.usage .t-value', { hasText: '742 W' }).waitFor();
  assert.equal(await text(page, '.tile.usage .t-label'), 'Using now');
  assert.ok(calls.filter((c) => c.service === 'bright' && c.path.endsWith('/current')).length >= 2, 'checked, then polled');
  await page.locator('#clock .gear').click();
  await page.locator('#settings').getByText(/Live usage \(Glow display\)$/).waitFor();
  await ctx.close();
});

test('no unit rate yet: kWh instead of pounds, and it says where to add it', async () => {
  const s = brightSettings(NOW);
  s.energy.unitRate = 0;
  const { ctx, page } = await openPanel(env, { settings: s });
  await page.locator('#price .big small', { hasText: 'kWh' }).waitFor();
  assert.equal(await text(page, '#price .big .num'), kwh(TODAY, NOW).toFixed(1));
  assert.match(await text(page, '#price .sub'), /Add your unit rate in Settings \(⚙ → Electricity\) for £/);
  assert.match(await text(page, '.tile.cost .t-value'), /^[\d.]+ kWh$/);
  await ctx.close();
});

test('Bright blocked in this browser, or the password wrong: plain words, and where to look', async () => {
  let { ctx, page } = await openPanel(env, { settings: brightSettings(NOW), fail: new Set(['bright-blocked']) });
  await page.locator('#price .sub', { hasText: 'Usage unavailable (tap for why)' }).waitFor();
  await page.locator('#price').click();
  await page.locator('.toast', { hasText: "Bright didn't answer this browser" }).waitFor();
  await page.locator('#clock .gear').click();
  await page.locator('#settings').getByText(/Electricity usage \(Bright\) · Bright didn't answer this browser.*docs\/bright\.md/).waitFor();
  await ctx.close();

  ({ ctx, page } = await openPanel(env, { settings: brightSettings(NOW), fail: new Set(['bright-auth']) }));
  await page.locator('#clock .gear').click();
  await page.locator('#settings').getByText(/didn't accept the email and password/).waitFor();
  await ctx.close();
});

test('switching from Octopus to Bright in Settings', async () => {
  const { ctx, page, calls } = await openPanel(env, { settings: fullSettings(NOW) });
  await page.locator('#price .big .num').waitFor();
  await page.locator('#clock .gear').click();
  const set = page.locator('#settings');
  assert.equal(await set.getByLabel('Bright email').isVisible(), false, 'Bright details hidden while on Octopus');
  await set.getByLabel('Usage comes from').selectOption('bright');
  assert.equal(await set.getByRole('heading', { name: 'Octopus Energy' }).isVisible(), false);
  await set.getByLabel('Bright email').fill('sam@example.com');
  await set.getByLabel('Bright password').fill('wrong');
  await set.getByRole('button', { name: 'Connect', exact: true }).first().click();
  await set.getByText(/didn't accept the email and password/).waitFor();
  await set.getByLabel('Bright password').fill('bright-pass');
  await set.getByRole('button', { name: 'Connect', exact: true }).first().click();
  await set.getByText('Bright connected').waitFor();
  await set.getByText('Connected: meter found (half-hourly readings; live usage needs a Glow display).').waitFor();
  await set.getByLabel('Unit rate (p/kWh, including VAT)').fill('26.64');
  await set.getByLabel('Standing charge (p/day, including VAT)').fill('47.35');
  const before = calls.filter((c) => c.service === 'octopus').length;
  await set.getByRole('button', { name: 'Save & close' }).click();
  await page.waitForLoadState('load');
  await page.locator('#price .label', { hasText: 'Today so far' }).waitFor();
  await page.locator('#price .big .num', { hasText: '£' }).waitFor();
  await page.waitForTimeout(500);
  assert.equal(calls.filter((c) => c.service === 'octopus').length - before <= 0, true, 'Octopus no longer asked after the switch');
  await ctx.close();
});
