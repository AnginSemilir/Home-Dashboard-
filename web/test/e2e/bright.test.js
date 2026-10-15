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
const kwhFrom = (from, until) => { let k = 0; for (let t = from; t + HALF <= until; t += HALF) k += usedKwh(t); return k; };
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
  assert.deepEqual(bright.map((c) => c.path).slice(0, 6), ['/auth', '/virtualentity', '/virtualentity/ve-1/resources', '/resource/res-elec/current', '/resource/res-elec/catchup', '/resource/res-elec/readings']);
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
  await set.getByText('Connected: meter found (electricity consumption, DCC Sourced); live usage needs a Glow display.').waitFor();
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

// Settings as the panel saves them once Bright has been connected (with a Glow display, if `live`).
const connected = (live, user = 'sam@example.com', consumption = 'res-elec') => {
  const s = brightSettings(NOW);
  s.bright.discovered = { ve: 've-1', consumption, cost: 'res-elec-cost', live, at: NOW, user };
  return s;
};
const brightCalls = (calls, end) => calls.filter((c) => c.service === 'bright' && c.path.endsWith(end));

test('a Glow display that stops: back to the last half hour, it says why, and asks less and less often', async () => {
  const { ctx, page, calls } = await openPanel(env, { settings: connected(true), glow: NOW - 20 * 60e3, clock: 'install' });
  await page.locator('.tile.usage .t-label', { hasText: 'Last half hour' }).waitFor();
  await page.clock.runFor(10 * 60e3);
  const n = brightCalls(calls, '/current').length;
  assert.ok(n >= 2 && n <= 6, `backing off, not every 30 seconds (${n} in 10 minutes)`);
  await page.locator('#clock .gear').click();
  await page.locator('#settings').getByText(/Live usage \(Glow display\) · The Glow display's newest reading is from 09:21\. Check it's on and connected\./).waitFor();
  await ctx.close();
});

test('the live sparkline stays when the screen goes off and on', async () => {
  const { ctx, page } = await openPanel(env, { settings: connected(true), glow: true, clock: 'install' });
  await page.locator('.tile.usage .t-label', { hasText: 'Using now' }).waitFor();
  await page.clock.runFor(31e3);
  await page.locator('.tile.usage svg.spark').waitFor();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(1000);
  assert.equal(await page.locator('.tile.usage svg.spark').count(), 1);
  await ctx.close();
});

test('Connect checks the password, even with the panel already signed in', async () => {
  const { ctx, page, calls } = await openPanel(env, { settings: connected(false) });
  await page.locator('#price .big .num', { hasText: '£' }).waitFor();
  await page.locator('#clock .gear').click();
  const set = page.locator('#settings');
  await set.getByLabel('Bright password').fill('wrong');
  await set.getByRole('button', { name: 'Connect', exact: true }).first().click();
  await set.getByText(/didn't accept the email and password/).waitFor();
  // A password with a space at the end is sent as typed.
  await set.getByLabel('Bright password').fill('bright-pass ');
  await set.getByRole('button', { name: 'Connect', exact: true }).first().click();
  await set.getByText(/didn't accept the email and password/).waitFor();
  assert.equal(JSON.parse(brightCalls(calls, '/auth').at(-1).body).password, 'bright-pass ');
  await ctx.close();
});

test('a new Bright email: the meter is looked up again, without pressing Connect', async () => {
  const { ctx, page, calls } = await openPanel(env, { settings: connected(true, 'old@example.com', 'res-old') });
  await page.locator('#price .big .num', { hasText: '£' }).waitFor();
  assert.equal(brightCalls(calls, '/virtualentity').length, 1);
  assert.equal(calls.filter((c) => c.service === 'bright' && c.path.includes('res-old')).length, 0, 'the old account\'s meter is never asked');
  assert.ok(brightCalls(calls, '/res-elec/readings').length >= 1);
  await ctx.close();
});

test('asking Bright to catch up: at most every half hour, even across reloads', async () => {
  const { ctx, page, calls } = await openPanel(env, { settings: connected(false) });
  await page.locator('#price .big .num', { hasText: '£' }).waitFor();
  assert.equal(brightCalls(calls, '/catchup').length, 1);
  const r = brightCalls(calls, '/readings').length;
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#price .big .num')?.textContent.includes('£'));
  await page.waitForTimeout(300);
  assert.ok(brightCalls(calls, '/readings').length > r, 'read again after the reload');
  assert.equal(brightCalls(calls, '/catchup').length, 1, 'no second catch-up');
  await ctx.close();
});

test('after days off: no old half hour passed off as the last one', async () => {
  // The newest reading kept from last Sunday, and Bright not answering now.
  const { ctx, page } = await openPanel(env, { settings: connected(false), fail: new Set(['bright']), initScript: () => {
    const start = Date.parse('2026-09-20T18:00:00+01:00');
    if (!sessionStorage.getItem('cached')) { localStorage.setItem('wallpanel.cache.v1', JSON.stringify({ brightSlots: [{ start, end: start + 1800e3, kwh: 0.4 }] })); sessionStorage.setItem('cached', '1'); }
  } });
  await page.locator('#price .sub', { hasText: 'Usage unavailable' }).waitFor();
  assert.equal(await text(page, '.tile.usage .t-value'), '–');
  await ctx.close();
});

// ---------- The panel never sits blank without saying why ----------

test('Bright chosen but not set up on this panel: it says so, and how', async () => {
  const s = brightSettings(NOW);
  s.bright.username = '';
  s.bright.password = '';
  const { ctx, page, calls } = await openPanel(env, { settings: s });
  await page.locator('#price .sub', { hasText: "Bright isn't set up on this panel yet" }).waitFor();
  assert.match(await text(page, '#price .sub'), /⚙ → Electricity: your Bright email and password, then Save & close/);
  assert.equal(await text(page, '.tile.usage .extra'), 'Bright not set up yet');
  await page.locator('#price').click();
  await page.locator('.toast', { hasText: 'type your Bright email and password → Save & close' }).waitFor();
  assert.equal(calls.filter((c) => c.service === 'bright').length, 0);
  await page.locator('#clock .gear').click();
  await page.locator('#settings').getByText('Electricity usage (Bright) · type your Bright email and password, then Save & close').waitFor();
  await ctx.close();
});

test('Connect saves at once: Cancel afterwards still leaves Bright working', async () => {
  const s = brightSettings(NOW);
  s.bright.username = '';
  s.bright.password = '';
  const { ctx, page } = await openPanel(env, { settings: s });
  await page.locator('#clock .gear').click();
  const set = page.locator('#settings');
  await set.getByLabel('Bright email').fill('sam@example.com');
  await set.getByLabel('Bright password').fill('bright-pass');
  await set.getByRole('button', { name: 'Connect', exact: true }).first().click();
  await set.getByText('Bright connected and saved').waitFor();
  await set.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#price .big .num', { hasText: '£' }).waitFor();
  assert.equal(await text(page, '#price .label'), 'Today so far');
  await ctx.close();
});

test('Bright two days behind: the newest day it has, dated, and a tap says why', async () => {
  const until = Date.parse('2026-09-23T21:00:00+01:00'); // Wednesday evening; now is Friday 09:41
  const { ctx, page, calls } = await openPanel(env, { settings: connected(false), brightUntil: until });
  await page.locator('#price .sub', { hasText: 'No readings for today yet' }).waitFor();
  assert.equal(await text(page, '#price .big'), '–');
  assert.match(await text(page, '#price .sub'), /Bright's newest: Wed 23 September 20:30–21:00/);
  // The chart shows Wednesday, up to 21:00.
  assert.match(await text(page, '#chart .chart-head .label'), /^Usage Wed 23 September\s*kWh per half hour$/);
  assert.equal(await page.locator('#chart .ch-bar.ch-use').count(), 42);
  // The day tile shows Wednesday too (with readings to 21:00); "last half hour" isn't passed off.
  assert.equal(await text(page, '.tile.cost .t-label'), 'Wed 23 September');
  const wed = Date.parse('2026-09-23T00:00:00+01:00');
  assert.equal(await text(page, '.tile.cost .t-value'), pounds(kwhFrom(wed, until)));
  assert.equal(await text(page, '.tile.usage .t-value'), '–');
  assert.equal(await text(page, '.tile.usage .extra'), 'Bright is behind · tap');
  await page.locator('#price').click();
  await page.locator('.toast', { hasText: "Bright's newest half hour is Wed 23 September 20:30–21:00" }).waitFor();
  // It looked further back once, not at every refresh.
  const looks = calls.filter((c) => c.service === 'bright' && c.path.endsWith('/readings') && new URL(c.url).searchParams.get('from') === '2026-09-15T23:00:00');
  assert.equal(looks.length, 1);
  await ctx.close();
});

test('nothing from Bright for over a week, or answers with no readings: a red dot and the reason', async () => {
  let { ctx, page } = await openPanel(env, { settings: connected(false), brightUntil: Date.parse('2026-09-01T00:00:00+01:00') });
  await page.locator('#price .sub', { hasText: 'Usage unavailable (tap for why)' }).waitFor();
  await page.locator('#price').click();
  await page.locator('.toast', { hasText: "Bright hasn't sent any readings for over a week" }).waitFor();
  await ctx.close();

  ({ ctx, page } = await openPanel(env, { settings: connected(false), fail: new Set(['bright-empty']) }));
  await page.locator('#price .sub', { hasText: 'Usage unavailable (tap for why)' }).waitFor();
  await page.locator('#clock .gear').click();
  await page.locator('#settings').getByText(/Electricity usage \(Bright\) · Bright hasn't sent any readings for over a week/).waitFor();
  await ctx.close();
});

test('an account with two places, or an "adhoc" meter listed first: the meter with readings is used', async () => {
  for (const brightAccount of ['two-places', 'adhoc']) {
    const { ctx, page, calls } = await openPanel(env, { settings: brightSettings(NOW), brightAccount });
    await page.locator('#price .big .num', { hasText: pounds(kwh(TODAY, NOW)) }).waitFor();
    const halfHours = calls.filter((c) => c.service === 'bright' && c.path.endsWith('/readings') && new URL(c.url).searchParams.get('period') === 'PT30M');
    assert.ok(halfHours.length && halfHours.every((c) => c.path === '/resource/res-elec/readings'), `${brightAccount}: only the meter with readings is read`);
    await ctx.close();
  }
});

test('early morning, before today\'s first reading: yesterday on the chart, and why', async () => {
  const at = Date.parse('2026-09-25T00:40:00+01:00');
  const { ctx, page } = await openPanel(env, { now: at, settings: { ...connected(false), bright: { ...connected(false).bright, discovered: { ...connected(false).bright.discovered, at } } }, brightUntil: Date.parse('2026-09-25T00:00:00+01:00') });
  await page.locator('#price .sub', { hasText: 'No readings for today yet' }).waitFor();
  assert.match(await text(page, '#price .sub'), /Bright's newest: yesterday 23:30–00:00/);
  assert.match(await text(page, '#chart .chart-head .label'), /^Usage yesterday/);
  assert.equal(await text(page, '.tile.cost .t-label'), 'Yesterday');
  assert.equal(await text(page, '.tile.usage .t-label'), 'Last half hour');
  await ctx.close();
});

// ---------- Found by the review of the fix above ----------

test('the meter\'s own half hours are used even when a one-off ("adhoc") reading is newer', async () => {
  const until = Date.parse('2026-09-24T21:00:00+01:00'); // the DCC half hours stop at 21:00 yesterday
  const { ctx, page, calls } = await openPanel(env, { settings: brightSettings(NOW), brightAccount: 'adhoc', brightUntil: until });
  await page.locator('#price .sub', { hasText: 'No readings for today yet' }).waitFor();
  const halfHours = calls.filter((c) => c.service === 'bright' && c.path.endsWith('/readings') && new URL(c.url).searchParams.get('period') === 'PT30M');
  assert.ok(halfHours.length && halfHours.every((c) => c.path === '/resource/res-elec/readings'));
  assert.match(await text(page, '#price .sub'), /Bright's newest: yesterday 20:30–21:00/);
  await ctx.close();
});

test('an old place in the account that can\'t answer doesn\'t hide the meter', async () => {
  const { ctx, page } = await openPanel(env, { settings: brightSettings(NOW), brightAccount: 'broken-place' });
  await page.locator('#price .big .num', { hasText: pounds(kwh(TODAY, NOW)) }).waitFor();
  await ctx.close();
});

test('Connect, then back to Octopus and Cancel: still Octopus (the Bright sign-in is kept)', async () => {
  const { ctx, page } = await openPanel(env, { settings: fullSettings(NOW) });
  await page.locator('#price .big .num').waitFor();
  await page.locator('#clock .gear').click();
  const set = page.locator('#settings');
  await set.getByLabel('Usage comes from').selectOption('bright');
  await set.getByLabel('Bright email').fill('sam@example.com');
  await set.getByLabel('Bright password').fill('bright-pass');
  await set.getByLabel('Unit rate (p/kWh, including VAT)').fill('30');
  await set.getByRole('button', { name: 'Connect', exact: true }).first().click();
  await set.getByText('Bright connected and saved').waitFor();
  await set.getByLabel('Usage comes from').selectOption('octopus');
  await set.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForLoadState('load');
  await page.locator('#price .big .num').waitFor();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wallpanel.settings.v1')));
  assert.equal(saved.energy.source, 'octopus');
  assert.equal(saved.energy.unitRate, 0, 'the unit rate waited for Save & close');
  assert.equal(saved.bright.username, 'sam@example.com');
  assert.notEqual(await text(page, '#price .label'), 'Today so far');
  await ctx.close();
});

test('after Connect fixes a refused password, the checklist says so too', async () => {
  const s = connected(false);
  s.bright.password = 'old-pass';
  const { ctx, page } = await openPanel(env, { settings: s });
  await page.locator('#price .sub', { hasText: 'Usage unavailable' }).waitFor();
  await page.locator('#clock .gear').click();
  const set = page.locator('#settings');
  const line = set.locator('.checklist li', { hasText: 'Electricity usage (Bright)' });
  await line.getByText(/didn't accept the email and password/).waitFor();
  await set.getByLabel('Bright password').fill('bright-pass');
  await set.getByRole('button', { name: 'Connect', exact: true }).first().click();
  await set.getByText('Bright connected and saved').waitFor();
  assert.equal(await line.locator('.ok').count(), 1);
  assert.doesNotMatch(await line.innerText(), /didn't accept/);
  await ctx.close();
});

test('readings from this morning, then the panel\'s own requests fail: it says unavailable, not "Bright is behind"', async () => {
  const { ctx, page } = await openPanel(env, { settings: connected(false), fail: new Set(['bright-auth']), initScript: () => {
    const day = Date.parse('2026-09-25T00:00:00+01:00');
    const slots = Array.from({ length: 12 }, (_, i) => ({ start: day + i * 1800e3, end: day + (i + 1) * 1800e3, kwh: 0.2 }));
    if (!sessionStorage.getItem('cached')) { localStorage.setItem('wallpanel.cache.v1', JSON.stringify({ brightSlots: slots })); sessionStorage.setItem('cached', '1'); }
  } });
  await page.locator('#price .sub', { hasText: 'Usage unavailable (tap for why)' }).waitFor();
  assert.match(await text(page, '#price .sub'), /readings to 06:00 · Usage unavailable \(tap for why\)/);
  assert.doesNotMatch(await text(page, '#price .sub'), /hours behind/);
  await ctx.close();
});

test('a stopped Glow display and Bright behind: the usage tile\'s tap explains Bright', async () => {
  const { ctx, page } = await openPanel(env, { settings: connected(true), glow: NOW - 20 * 60e3, brightUntil: Date.parse('2026-09-23T21:00:00+01:00') });
  await page.locator('.tile.usage .extra', { hasText: 'Bright is behind · tap' }).waitFor();
  await page.locator('.tile.usage').click();
  await page.locator('.toast', { hasText: "Bright's newest half hour is Wed 23 September 20:30–21:00" }).waitFor();
  await ctx.close();
});
