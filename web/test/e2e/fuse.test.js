// SPDX-License-Identifier: AGPL-3.0-only
// Electricity and gas from the Fuse app (hourly, about an hour behind), for a household on a Fuse
// tariff. Fuse's private API is faked (mocks.js): sign-in by SMS code, rotating tokens, hourly charts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser, openPanel, NOW } from '../support/browser.js';
import { fuseSettings, usedKwh, FUSE_RELAY } from '../support/mocks.js';

let env;
before(async () => { env = await startBrowser(); });
after(async () => { await env?.close(); });

const HOUR = 3600e3;
const MID = Date.parse('2026-09-25T00:00:00+01:00'); // NOW is Friday 25 September 2026, 09:41 (BST)
const text = (page, sel) => page.locator(sel).first().innerText();
const fuseCalls = (calls) => calls.filter((c) => c.service === 'fuse');
const onPath = (calls, p) => fuseCalls(calls).filter((c) => c.path === p);

// What the fake Fuse sends, worked out again here (rates as in mocks.js).
const elecHour = (start) => +(usedKwh(start) + usedKwh(start + 1800e3)).toFixed(3);
const gasHour = (h) => (h >= 6 && h < 9 ? 2.9 : h >= 17 && h < 22 ? 2.1 : 0.25);
const poundsFor = (fuel, kwh) => +(kwh * (fuel === 'gas' ? 0.0687 : 0.2664)).toFixed(4) + +((fuel === 'gas' ? 0.28 : 0.4735) / 24).toFixed(4);
const day = (fuel, hours, midnight = MID) => hours.map((h) => {
  const kwh = fuel === 'gas' ? gasHour(h) : elecHour(midnight + h * HOUR);
  return { kwh, pence: poundsFor(fuel, kwh) * 100 };
});
const total = (rows) => rows.reduce((t, r) => ({ kwh: t.kwh + r.kwh, pence: t.pence + r.pence }), { kwh: 0, pence: 0 });
const gbp = (p) => `£${(Math.round(p) / 100).toFixed(2)}`;
const short = (p) => (p >= 100 ? gbp(p) : `${p < 10 ? p.toFixed(1) : Math.round(p)}p`);
// Today at 09:41: complete hours 00–08, then 09:00–10:00 in progress (half its usage, as it's past half past).
const half = (fuel, h) => { const r = day(fuel, [h])[0]; const kwh = +(r.kwh / 2).toFixed(3); return { kwh, pence: poundsFor(fuel, kwh) * 100 }; };
const todayRows = (fuel) => [...day(fuel, [0, 1, 2, 3, 4, 5, 6, 7, 8]), half(fuel, 9)];
const yesterdayRows = (fuel) => day(fuel, [...Array(24).keys()], MID - 864e5);
const T = { elec: total(todayRows('elec')), gas: total(todayRows('gas')) };
const Y = { elec: total(yesterdayRows('elec')), gas: total(yesterdayRows('gas')) };

const notSignedIn = () => { const s = fuseSettings(NOW); s.fuse = { phone: '', proxy: '', premisesId: '', premisesName: '' }; return s; };

test('today so far: electricity and gas on the card, in the two-row chart, and in the tiles', async () => {
  const { ctx, page, calls, problems } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true, initScript: () => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  } });
  await page.locator('#price .big .num').waitFor();
  const e = T.elec, g = T.gas;
  assert.equal(await text(page, '#price .label'), 'Today so far');
  assert.equal(await text(page, '#price .big .num'), gbp(Math.round(e.pence) + Math.round(g.pence)), 'the total is the sum of the two parts shown');
  assert.deepEqual(await page.locator('#price .band-chip .fz').allInnerTexts(), [`${e.kwh.toFixed(1)} kWh`, `${g.kwh.toFixed(1)} kWh`]);
  assert.match(await text(page, '#price .sub'), /readings to 09:30 · Fuse is about an hour behind/);
  assert.ok((await text(page, '#price .sub')).includes(`Electricity ${gbp(e.pence)} · Gas ${gbp(g.pence)}`));

  // The chart: a row for each fuel, an hour per bar, the hour in progress lighter.
  assert.match(await text(page, '#chart .chart-head .label'), /^Usage today\s*kWh per hour$/);
  assert.equal(await page.locator('#chart .ch-bar.ch-elec').count(), 10);
  assert.equal(await page.locator('#chart .ch-bar.ch-gas').count(), 10);
  assert.equal(await page.locator('#chart .ch-bar.ch-sofar').count(), 2, 'the hour in progress, for each fuel');
  assert.deepEqual(await page.locator('#chart .ch-rowname').allTextContents(), ['Electricity', 'Gas'], 'each row names its fuel (so no separate legend)');
  assert.equal(await page.locator('#chart .legend .lg').count(), 0);
  assert.deepEqual(await page.locator('#chart .fz-seg').allInnerTexts(), ['D', 'M', 'Y']);
  assert.equal(await page.locator('#chart .fz-seg[aria-pressed="true"]').innerText(), 'D', 'the day, to start with');
  await page.locator('#chart .ch-hit[data-fuel="elec"]').nth(3).click(); // 03:00–04:00
  const h3 = day('elec', [3])[0];
  assert.equal(await text(page, '#chart .chart-tip'), `Electricity 03:00–04:00 · ${h3.kwh.toFixed(2)} kWh · ${short(h3.pence)}`);
  await page.locator('#chart .ch-hit[data-fuel="gas"]').nth(9).click(); // the hour in progress
  const now9 = half('gas', 9);
  assert.equal(await text(page, '#chart .chart-tip'), `Gas 09:00–10:00 · ${now9.kwh.toFixed(2)} kWh · ${short(now9.pence)} so far`);

  // No live figure from Fuse: the "Using now" tile is Electricity, and the third tile is Gas.
  assert.equal(await text(page, '.tile.usage .t-label'), 'Electricity');
  assert.equal(await text(page, '.tile.usage .t-value'), gbp(e.pence));
  assert.equal(await text(page, '.tile.usage .extra'), `${e.kwh.toFixed(1)} kWh today\nYesterday ${gbp(Y.elec.pence)}`);
  assert.equal(await text(page, '.tile.cost .t-label'), 'Gas');
  assert.equal(await text(page, '.tile.cost .t-value'), gbp(g.pence));
  assert.equal(await text(page, '.tile.cost .extra'), `${g.kwh.toFixed(1)} kWh today\nYesterday ${gbp(Y.gas.pence)}`);
  assert.equal(await page.locator('#tiles', { hasText: 'Using now' }).count(), 0);
  assert.equal(await page.locator('#price .stats-btn').isVisible(), false, 'the Agile buttons are hidden');
  assert.equal(await page.locator('#price .usage-btn').isVisible(), false);

  // What was asked of Fuse: today and yesterday's chart, as the signed-in device. Nobody else is asked.
  const charts = onPath(calls, '/api/v1/premises/prem-1/chart');
  assert.deepEqual(charts.map((c) => Object.fromEntries(new URL(c.url).searchParams)), [{ year: '2026', month: '9', day: '25' }, { year: '2026', month: '9', day: '24' }]);
  assert.ok(charts.every((c) => c.headers.authorization === 'Bearer fuse-acc-1' && c.headers['device-id'] === 'dev-test'));
  assert.equal(onPath(calls, '/api/trpc/phoneSignIn').length, 0, 'no text message was asked for');
  assert.equal(calls.filter((c) => ['octopus', 'bright'].includes(c.service)).length, 0);
  assert.deepEqual(await page.evaluate(() => window.__csp), []);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('an electricity-only account: one row, no gas chip, and the third tile is yesterday', async () => {
  const { ctx, page } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true, fuseNoGas: true });
  await page.locator('#price .big .num').waitFor();
  assert.equal(await text(page, '#price .big .num'), gbp(T.elec.pence));
  assert.equal(await page.locator('#price .band-chip .fz').count(), 1, 'only the electricity chip');
  assert.equal(await page.locator('#chart .ch-bar.ch-gas').count(), 0);
  assert.equal(await page.locator('#chart .ch-bar.ch-elec').count(), 10);
  assert.match(await text(page, '#price .sub'), /Electricity .* · standing charge included/);
  assert.equal(await text(page, '.tile.cost .t-label'), 'Yesterday');
  assert.equal(await text(page, '.tile.cost .t-value'), gbp(Y.elec.pence));
  await ctx.close();
});

test('gas not reported yet today: said so on the card and tile, with yesterday still shown', async () => {
  const { ctx, page } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true, fail: new Set(['fuse-no-gas-today']) });
  await page.locator('#price .big .num').waitFor();
  assert.equal(await text(page, '#price .big .num'), gbp(T.elec.pence));
  assert.match(await text(page, '#price .sub'), /electricity to 09:30, gas to yesterday midnight/);
  assert.match(await text(page, '#price .sub'), /Electricity .* · gas not reported yet/);
  assert.equal(await text(page, '.tile.cost .t-value'), '–');
  assert.equal(await text(page, '.tile.cost .extra'), `No gas readings yet today · tap\nYesterday ${gbp(Y.gas.pence)}`);
  assert.match(await text(page, '#chart'), /No gas readings yet today/);
  await page.locator('.tile.cost').click();
  await page.locator('.toast', { hasText: "Fuse's newest readings: electricity to 09:30, gas to yesterday midnight." }).waitFor();
  await ctx.close();
});

test('Fuse well behind: the newest day it has, dated, and every tap says why', async () => {
  const until = Date.parse('2026-09-24T05:00:00+01:00'); // yesterday 05:00
  const { ctx, page } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true, fuseUntil: until });
  await page.locator('#price .sub', { hasText: 'No usage for today yet' }).waitFor();
  assert.equal(await text(page, '#price .big'), '–');
  assert.match(await text(page, '#price .sub'), /Fuse's newest: electricity to yesterday 05:00, gas to yesterday 05:00/);
  assert.match(await text(page, '#chart .chart-head .label'), /^Usage yesterday/);
  assert.equal(await page.locator('#chart .ch-bar.ch-elec').count(), 5);
  assert.equal(await text(page, '.tile.usage .t-value'), '–');
  assert.match(await text(page, '.tile.usage .extra'), /No readings yet today · tap\nYesterday £\d+\.\d\d · to 05:00/);
  for (const sel of ['#price', '.tile.usage', '.tile.cost']) {
    await page.reload(); // a fresh page, so each tap's toast is its own
    await page.locator('#price .sub', { hasText: 'No usage for today yet' }).waitFor();
    await page.locator(sel).click();
    await page.locator('.toast', { hasText: "Fuse's newest readings: electricity to yesterday 05:00" }).waitFor();
  }
  await ctx.close();
});

test('not signed in to Fuse on this panel: it says so, and how; nothing is asked of Fuse', async () => {
  const { ctx, page, calls } = await openPanel(env, { settings: notSignedIn() });
  await page.locator('#price .sub', { hasText: "Fuse isn't connected on this panel yet" }).waitFor();
  assert.match(await text(page, '#price .sub'), /⚙ → Electricity → Send code/);
  assert.equal(await text(page, '.tile.usage .extra'), 'Fuse not set up yet');
  await page.locator('#price').click();
  await page.locator('.toast', { hasText: 'type your mobile number → Send code' }).waitFor();
  await page.locator('#clock .gear').click();
  await page.locator('#settings').getByText('Electricity and gas (Fuse) · press Send code, then type the code Fuse texts you').waitFor();
  assert.equal(fuseCalls(calls).length, 0);
  await ctx.close();
});

test('signing in from Settings: number, code, identity question; saved at once, and Cancel keeps it', async () => {
  const { ctx, page, calls } = await openPanel(env, { settings: notSignedIn(), fail: new Set(['fuse-dob']) });
  await page.locator('#price .sub', { hasText: "Fuse isn't connected" }).waitFor();
  await page.locator('#clock .gear').click();
  const set = page.locator('#settings');
  assert.equal(fuseCalls(calls).length, 0, 'opening Settings sends nothing');
  await set.getByLabel('Mobile number on your Fuse account').fill('07700 900123');
  assert.equal(fuseCalls(calls).length, 0, 'typing the number sends nothing either');

  await set.getByRole('button', { name: 'Send code' }).click();
  await set.getByText(/Code sent\. Type it below/).waitFor();
  const [start, sms] = fuseCalls(calls);
  assert.deepEqual([start.path, sms.path], ['/api/v3/auth', '/api/trpc/phoneSignIn']);
  assert.deepEqual(start.body, { challenge_type: 'INITIAL', data: { method: 'PHONE', data: { phone_number: '+447700900123', prelude_dispatch_id: null } } });
  assert.match(start.headers['device-id'], /^[0-9a-f-]{36}$/);
  assert.deepEqual(sms.body, { phone: '+447700900123' });
  assert.equal(sms.headers['x-fuse-app-version'], '0.5.388');

  // A wrong code is turned away in plain words, with no more texts sent.
  await set.getByLabel('Code from the text message').fill('000000');
  await set.getByRole('button', { name: 'Sign in', exact: true }).click();
  await set.getByText(/That code isn't right/).waitFor();
  await set.getByLabel('Code from the text message').fill('123456');
  await set.getByRole('button', { name: 'Sign in', exact: true }).click();
  await set.getByText('Verify your date of birth: Fuse needs to check it is you').waitFor();
  // A date typed the wrong way round is caught before Fuse is asked.
  await set.getByRole('button', { name: 'Continue' }).click();
  await set.getByText('Date of birth: type the date like 04/03/1965.').waitFor();
  await set.locator('input[type=date]').fill('1965-03-04');
  await set.getByRole('button', { name: 'Continue' }).click();
  await set.getByText('Fuse connected and saved').waitFor();
  assert.equal(onPath(calls, '/api/trpc/phoneSignIn').length, 1, 'one text message for the whole sign-in');
  await set.getByText(/Electricity and gas \(Fuse\) · 1 Test Street/).waitFor();
  assert.equal(await set.locator('.checklist li', { hasText: 'Electricity and gas (Fuse)' }).locator('.ok').count(), 1);
  assert.equal(await set.getByLabel('Usage comes from').inputValue(), 'fuse');

  await set.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForLoadState('load');
  await page.locator('#price .big .num').waitFor();
  assert.equal(await text(page, '#price .label'), 'Today so far');
  const saved = await page.evaluate(() => ({ s: JSON.parse(localStorage.getItem('wallpanel.settings.v1')), t: JSON.parse(localStorage.getItem('wallpanel.fuse.v1')) }));
  assert.deepEqual([saved.s.energy.source, saved.s.fuse.premisesId, saved.s.fuse.premisesName], ['fuse', 'prem-1', '1 Test Street']);
  assert.deepEqual([saved.t.access, saved.t.refresh], ['fuse-acc-1', 'fuse-ref-1']);
  assert.equal(onPath(calls, '/api/trpc/phoneSignIn').length, 1, 'and none after the reload');
  await ctx.close();
});

test('Fuse asking to wait, and a number that can\'t be one: plain words beside the button', async () => {
  let { ctx, page, calls } = await openPanel(env, { settings: notSignedIn(), fail: new Set(['fuse-sms-wait']) });
  await page.locator('#clock .gear').click();
  let set = page.locator('#settings');
  await set.getByLabel('Mobile number on your Fuse account').fill('hello');
  await set.getByRole('button', { name: 'Send code' }).click();
  await set.getByText(/Check the mobile number/).waitFor();
  assert.equal(fuseCalls(calls).length, 0, 'a number that can\'t be one never reaches Fuse');
  await set.getByLabel('Mobile number on your Fuse account').fill('07700 900123');
  await set.getByRole('button', { name: 'Send code' }).click();
  await set.getByText(/Fuse wants you to wait a few minutes before asking for another code/).waitFor();
  assert.equal(onPath(calls, '/api/trpc/phoneSignIn').length, 1);
  assert.equal(await set.getByLabel('Code from the text message').isVisible(), false, 'no code box for a text that was never sent');
  await ctx.close();

  ({ ctx, page, calls } = await openPanel(env, { settings: notSignedIn() }));
  await page.locator('#clock .gear').click();
  set = page.locator('#settings');
  await set.getByLabel('Mobile number on your Fuse account').fill('07123 456789');
  await set.getByRole('button', { name: 'Send code' }).click();
  await set.getByText(/Fuse wouldn't continue \(unknown_user\)|doesn't recognise/).waitFor();
  await ctx.close();
});

test('the access token has run out: renewed once, the new pair saved, and the panel carries on', async () => {
  const { ctx, page, calls } = await openPanel(env, { settings: fuseSettings(NOW), fuse: { access: 'fuse-acc-0', refresh: 'fuse-ref-1' } });
  await page.locator('#price .big .num').waitFor();
  assert.equal(await text(page, '#price .big .num'), gbp(Math.round(T.elec.pence) + Math.round(T.gas.pence)));
  const refreshes = onPath(calls, '/api/v1/auth/refresh');
  assert.equal(refreshes.length, 1);
  assert.deepEqual(refreshes[0].body, { refresh_token: 'fuse-ref-1', original_request_path: null });
  assert.equal(refreshes[0].headers.authorization, 'Bearer fuse-acc-0');
  const charts = onPath(calls, '/api/v1/premises/prem-1/chart');
  assert.deepEqual(charts.map((c) => c.headers.authorization), ['Bearer fuse-acc-0', 'Bearer fuse-acc-2', 'Bearer fuse-acc-2']);
  const t = await page.evaluate(() => JSON.parse(localStorage.getItem('wallpanel.fuse.v1')));
  assert.deepEqual([t.access, t.refresh, t.deviceId], ['fuse-acc-2', 'fuse-ref-2', 'dev-test']);
  await ctx.close();
});

test('Fuse ends the session: the card, the tap and the checklist say so, and no text is ever sent by itself', async () => {
  const { ctx, page, calls } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true, fail: new Set(['fuse-signed-out']) });
  await page.locator('#price .sub', { hasText: 'Fuse signed the panel out' }).waitFor();
  assert.match(await text(page, '#price .sub'), /⚙ → Electricity → Send code to sign in again/);
  await page.locator('#price').click();
  await page.locator('.toast', { hasText: 'Fuse signed the panel out. ⚙ → Electricity → Send code to sign in again.' }).waitFor();
  await page.locator('#clock .gear').click();
  const line = page.locator('#settings .checklist li', { hasText: 'Electricity and gas (Fuse)' });
  await line.getByText(/Fuse signed the panel out/).waitFor();
  assert.equal(await line.locator('.bad').count(), 1);
  await page.waitForTimeout(1500);
  assert.equal(onPath(calls, '/api/v1/auth/refresh').length, 1, 'one refused renewal, not a stream of them');
  assert.equal(onPath(calls, '/api/trpc/phoneSignIn').length + onPath(calls, '/api/v3/auth').length, 0, 'nothing that could send a text');
  const t = await page.evaluate(() => JSON.parse(localStorage.getItem('wallpanel.fuse.v1')));
  assert.deepEqual(t, { deviceId: 'dev-test' }, 'the dead tokens are gone, the device ID stays');
  await ctx.close();
});

test('a Fuse that wants a newer app version says so', async () => {
  const { ctx, page } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true, fail: new Set(['fuse-426']) });
  await page.locator('#price .sub', { hasText: 'Usage unavailable (tap for why)' }).waitFor();
  await page.locator('#price').click();
  await page.locator('.toast', { hasText: 'Fuse wants a newer app version. Update FUSE_APP_VERSION in web/js/fuse.js' }).waitFor();
  await ctx.close();
});

test('Fuse blocked in this browser: plain words and where to look; with a relay, every call goes through it', async () => {
  let { ctx, page } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true, fail: new Set(['fuse-blocked']) });
  await page.locator('#price .sub', { hasText: 'Usage unavailable (tap for why)' }).waitFor();
  await page.locator('#price').click();
  await page.locator('.toast', { hasText: "Fuse didn't answer this browser" }).waitFor();
  await page.locator('#clock .gear').click();
  await page.locator('#settings').getByText(/Electricity and gas \(Fuse\) · Fuse didn't answer this browser.*docs\/fuse\.md/).waitFor();
  await ctx.close();

  // A relay on workers.dev needs nothing edited in index.html, and is then used for everything.
  const s = fuseSettings(NOW);
  s.fuse.proxy = FUSE_RELAY;
  let calls;
  ({ ctx, page, calls } = await openPanel(env, { settings: s, fuse: true }));
  await page.locator('#price .big .num').waitFor();
  assert.ok(fuseCalls(calls).length >= 2);
  assert.ok(fuseCalls(calls).every((c) => c.host === 'fuse-relay.example.workers.dev'), 'nothing went to Fuse directly');
  await ctx.close();

  // A relay on another domain isn't in the policy: refused, and the panel says what to do.
  s.fuse.proxy = 'https://relay.example.com';
  ({ ctx, page, calls } = await openPanel(env, { settings: s, fuse: true }));
  await page.locator('#price .sub', { hasText: 'Usage unavailable (tap for why)' }).waitFor();
  await page.locator('#price').click();
  await page.locator('.toast', { hasText: 'Add https://relay.example.com to connect-src in web/index.html first (see docs/fuse.md)' }).waitFor();
  assert.equal(fuseCalls(calls).length, 0);
  await ctx.close();
});

test('Fuse answering with nothing at all: it says so (never blank and silent)', async () => {
  const { ctx, page } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true, fail: new Set(['fuse-empty']) });
  await page.locator('#price .sub', { hasText: 'No readings from Fuse yet' }).waitFor();
  await page.locator('#price').click();
  await page.locator('.toast', { hasText: 'Fuse has sent no readings yet.' }).waitFor();
  await ctx.close();
});

test('sign out of Fuse, and what "copy settings" leaves out', async () => {
  const { ctx, page, calls } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('#price .big .num').waitFor();
  await page.locator('#clock .gear').click();
  const set = page.locator('#settings');
  await set.getByRole('button', { name: 'Copy settings' }).click();
  await set.getByText(/^Copied\./).waitFor();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(copied.length > 50, 'the settings were copied');
  assert.ok(!/fuse-acc-1|fuse-ref-1|dev-test/.test(copied), 'the Fuse sign-in and device ID are not copied');
  assert.ok(copied.includes('"premisesId":"prem-1"'), 'the rest of the Fuse settings are');
  await set.getByRole('button', { name: 'Sign out of Fuse' }).click();
  await set.getByText('Signed out of Fuse.').waitFor();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('wallpanel.fuse.v1'))), { deviceId: 'dev-test' });
  await set.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForLoadState('load');
  await page.locator('#price .sub', { hasText: "Fuse isn't connected on this panel yet" }).waitFor();
  assert.equal(onPath(calls, '/api/trpc/phoneSignIn').length, 0);
  await ctx.close();
});

// ---------- Found by the review ----------

test('a gas meter that has only sent its standing charge: gas is "not reported yet", and the total is the sum of the parts shown', async () => {
  const { ctx, page } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true, fail: new Set(['fuse-gas-standing-only']) });
  await page.locator('#price .big .num').waitFor();
  assert.equal(await text(page, '#price .big .num'), gbp(T.elec.pence), 'the standing charge alone is not counted as gas used');
  assert.match(await text(page, '#price .sub'), new RegExp(`Electricity ${gbp(T.elec.pence)} · gas not reported yet`));
  assert.deepEqual(await page.locator('#price .band-chip .fz').allInnerTexts(), [`${T.elec.kwh.toFixed(1)} kWh`, '–']);
  assert.equal(await text(page, '.tile.cost .t-value'), '–');
  await ctx.close();
});

test('a gas-only account: one row, one chip, and the readings time is gas\'s (never "now")', async () => {
  const { ctx, page } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true, fuseNoElec: true });
  await page.locator('#price .big .num').waitFor();
  assert.equal(await text(page, '#price .big .num'), gbp(T.gas.pence));
  assert.deepEqual(await page.locator('#price .band-chip .fz').allInnerTexts(), [`${T.gas.kwh.toFixed(1)} kWh`]);
  assert.match(await text(page, '#price .sub'), /readings to 09:30 · Fuse is about an hour behind/);
  assert.match(await text(page, '#price .sub'), new RegExp(`Gas ${gbp(T.gas.pence)} · standing charge included`));
  assert.doesNotMatch(await text(page, '#price .sub'), /Electricity/);
  assert.equal(await page.locator('#chart .ch-bar.ch-elec').count(), 0);
  assert.equal(await page.locator('#chart .ch-bar.ch-gas').count(), 10);
  assert.equal(await text(page, '.tile.usage .t-label'), 'Gas');
  assert.equal(await text(page, '.tile.cost .t-label'), 'Yesterday');
  assert.equal(await text(page, '.tile.cost .t-value'), gbp(Y.gas.pence));
  await ctx.close();
});

test('the property look-up failing after a good code: press the button again, no second text message and no used-up code', async () => {
  const { ctx, page, calls } = await openPanel(env, { settings: notSignedIn(), fail: new Set(['fuse-premises-once']) });
  await page.locator('#clock .gear').click();
  const set = page.locator('#settings');
  await set.getByLabel('Mobile number on your Fuse account').fill('07700 900123');
  await set.getByRole('button', { name: 'Send code' }).click();
  await set.getByLabel('Code from the text message').fill('123456');
  await set.getByRole('button', { name: 'Sign in', exact: true }).click();
  await set.getByText(/You're signed in, but Fuse didn't list your property.*no new code is needed/).waitFor();
  await set.getByRole('button', { name: 'Sign in', exact: true }).click();
  await set.getByText(/Fuse connected and saved/).waitFor();
  assert.equal(onPath(calls, '/api/trpc/phoneSignIn').length, 1);
  assert.equal(fuseCalls(calls).filter((c) => c.body?.challenge_type === 'PHONE_OTP').length, 1, 'the code was only used once');
  await ctx.close();
});

test('figures kept from another Fuse property are not shown as yesterday\'s', async () => {
  const { ctx, page } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true, initScript: () => {
    if (sessionStorage.getItem('seeded-cache')) return;
    const start = Date.parse('2026-09-24T00:00:00+01:00');
    const hours = Array.from({ length: 24 }, (_, i) => ({ start: start + i * 3600e3, end: start + (i + 1) * 3600e3, kwh: 50, pence: 5000, standingP: 1, inProgress: false }));
    // Fetched a few minutes ago, so the panel's own rule would keep it: only the property tells them apart.
    localStorage.setItem('wallpanel.cache.v1', JSON.stringify({ fuseDays: { '2026-09-24': { at: Date.parse('2026-09-25T09:30:00+01:00'), pid: 'someone-elses', elec: hours, gas: [], export: [], has: { elec: true, gas: false, export: false } } }, fuseNewest: { pid: 'someone-elses', elec: start + 864e5, gas: null } }));
    sessionStorage.setItem('seeded-cache', '1');
  } });
  await page.locator('.tile.usage .extra', { hasText: 'Yesterday' }).waitFor();
  assert.equal(await text(page, '.tile.usage .extra'), `${T.elec.kwh.toFixed(1)} kWh today\nYesterday ${gbp(Y.elec.pence)}`);
  await ctx.close();
});

test('"Show what Fuse sent" puts the day\'s numbers on screen, for troubleshooting', async () => {
  const { ctx, page } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true });
  await page.locator('#price .big .num').waitFor();
  await page.locator('#clock .gear').click();
  const set = page.locator('#settings');
  await set.getByRole('button', { name: 'Show what Fuse sent (for troubleshooting)' }).click();
  const diag = set.locator('pre.diag');
  await diag.waitFor();
  const t = await diag.innerText();
  assert.match(t, /Fuse's chart for 2026-09-25/);
  assert.match(t, /Fuse's chart for 2026-09-24/);
  assert.match(t, /GAS: 24 bars/);
  assert.match(t, /09\.25\.06=2\.9 09\.25\.07=2\.9 09\.25\.08=2\.9/);
  assert.match(t, /09\.25\.10=0\.25\?/, 'the hours still to come are marked');
  assert.ok(!/prem-1|supply_fid=|1 Test Street|dev-test|fuse-acc/.test(t), 'no IDs, address or tokens');
  await ctx.close();
});

// ---------- The chart's views: D / M / Y, and stacked ----------

const kwhText = (k) => `${k >= 100 ? Math.round(k) : k >= 10 ? k.toFixed(1) : k.toFixed(2)} kWh`;
const midnightOfDay = (d) => Date.parse(`2026-09-${String(d).padStart(2, '0')}T00:00:00+01:00`);
// A span of hours as Fuse totals it: the usage at the unit rate, and the standing charge for each hour counted.
const spanOf = (fuel, kwh, hours) => ({ kwh, pence: (kwh * (fuel === 'gas' ? 0.0687 : 0.2664) + (hours * (fuel === 'gas' ? 0.28 : 0.4735)) / 24) * 100 });
const septDay = (fuel, d) => spanOf(fuel, total(day(fuel, [...Array(24).keys()], midnightOfDay(d))).kwh, 24);
const rangeCalls = (calls) => onPath(calls, '/api/v1/premises/prem-1/chart').map((c) => Object.fromEntries(new URL(c.url).searchParams)).filter((q) => !q.day);
const view = (page, v) => page.locator(`#chart .fz-seg[data-view="${v}"]`).click();
const pressed = (page) => page.locator('#chart .fz-seg[aria-pressed="true"]').innerText();
const label = async (page) => (await text(page, '#chart .chart-head .label')).replace(/\s+/g, ' ');

test('D, M and Y: the day by the hour, the month by the day, the year by the month; asked for only when chosen', async () => {
  const { ctx, page, calls, problems } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true });
  await page.locator('#price .big .num').waitFor();
  assert.deepEqual(rangeCalls(calls), [], 'the day view never asks for a month or a year');

  // M: a bar a day for each fuel (the 25th, still going, lighter), and its own tap text.
  await view(page, 'M');
  await page.locator('#chart .ch-bar.ch-gas').first().waitFor();
  assert.equal(await label(page), 'Usage this month kWh per day');
  assert.equal(await pressed(page), 'M');
  assert.equal(await page.locator('#chart .ch-bar.ch-elec').count(), 25);
  assert.equal(await page.locator('#chart .ch-bar.ch-gas').count(), 25);
  assert.equal(await page.locator('#chart .ch-bar.ch-sofar').count(), 2, 'the 25th, for each fuel');
  assert.deepEqual(await page.locator('#chart .ch-x').allTextContents(), ['1', '5', '10', '15', '20', '25', '30']);
  await page.locator('#chart .ch-hit[data-fuel="elec"]').nth(2).click(); // 3 September
  const e3 = septDay('elec', 3), g3 = septDay('gas', 3);
  assert.equal(await text(page, '#chart .chart-tip'), `Electricity Thu 3 September · ${kwhText(e3.kwh)} · ${short(e3.pence)}`);
  await page.locator('#chart .ch-hit[data-fuel="gas"]').nth(2).click();
  assert.equal(await text(page, '#chart .chart-tip'), `Gas Thu 3 September · ${kwhText(g3.kwh)} · ${short(g3.pence)}`);
  await page.locator('#chart .ch-hit[data-fuel="elec"]').nth(24).click(); // the 25th: hours 00–08, and half of the 09:00 hour
  const e25 = spanOf('elec', total([...day('elec', [...Array(9).keys()], midnightOfDay(25)), half('elec', 9)]).kwh, 10);
  assert.equal(await text(page, '#chart .chart-tip'), `Electricity Fri 25 September · ${kwhText(e25.kwh)} · ${short(e25.pence)} so far`);
  assert.deepEqual(rangeCalls(calls), [{ year: '2026', month: '9' }], 'one call for the month: no day in it');

  // Y: a bar a month, January to September.
  await view(page, 'Y');
  await page.locator('#chart .ch-bar.ch-gas').nth(8).waitFor();
  assert.equal(await label(page), 'Usage this year kWh per month');
  assert.equal(await page.locator('#chart .ch-bar.ch-elec').count(), 9, 'a bar for each month Fuse has: January to September');
  assert.equal(await page.locator('#chart .ch-bar.ch-sofar').count(), 2, 'September, still going');
  assert.deepEqual(await page.locator('#chart .ch-x').allTextContents(), ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
  await page.locator('#chart .ch-hit[data-fuel="elec"]').nth(0).click();
  let jan = 0;
  for (let t = Date.parse('2026-01-01T00:00:00Z'); t < Date.parse('2026-02-01T00:00:00Z'); t += HOUR) jan += elecHour(t);
  assert.match(await text(page, '#chart .chart-tip'), new RegExp(`^Electricity January 2026 · ${kwhText(jan).replace('.', '\\.')} · £\\d+\\.\\d\\d$`));
  assert.deepEqual(rangeCalls(calls), [{ year: '2026', month: '9' }, { year: '2026' }], 'the year: no month, no day');

  // Back and forth within the half hour uses what it has; D never asks again either.
  await view(page, 'M');
  await view(page, 'D');
  assert.equal(await label(page), 'Usage today kWh per hour');
  assert.equal(await page.locator('#chart .ch-bar.ch-elec').count(), 10);
  await view(page, 'Y');
  assert.equal(rangeCalls(calls).length, 2);

  // The choice is remembered across a reload.
  await page.reload();
  await page.locator('#chart .ch-bar.ch-gas').nth(8).waitFor();
  assert.equal(await pressed(page), 'Y');
  assert.equal(await label(page), 'Usage this year kWh per month');
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('stacked: pounds a bar with the electricity under the gas, for the day, the month and the year', async () => {
  const { ctx, page, problems } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true });
  await page.locator('#price .big .num').waitFor();
  assert.equal(await page.locator('#chart .fz-stack').getAttribute('aria-pressed'), 'false');
  await page.locator('#chart .fz-stack').click();
  assert.equal(await label(page), 'Cost today £ per hour');
  assert.equal(await page.locator('#chart .fz-stack').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#chart .ch-stack').count(), 10, 'one stack an hour');
  assert.equal(await page.locator('#chart .ch-stack .ch-seg.ch-elec').count(), 10);
  assert.equal(await page.locator('#chart .ch-stack .ch-seg.ch-gas').count(), 10);
  assert.equal(await page.locator('#chart .ch-stack.ch-sofar').count(), 1, 'the hour in progress');
  assert.deepEqual(await page.locator('#chart .legend .lg').allInnerTexts(), ['Electricity', 'Gas'], 'the legend is for the stacked bars');
  assert.equal(await page.locator('#chart .ch-rowname').count(), 0, 'one plot, not rows');
  // Electricity is the lower segment.
  const [eBox, gBox] = await Promise.all(['elec', 'gas'].map((f) => page.locator(`#chart .ch-stack .ch-seg.ch-${f}`).nth(7).boundingBox()));
  assert.ok(eBox.y > gBox.y, 'gas sits on top of electricity');
  await page.locator('#chart .ch-hit[data-fuel="both"]').nth(7).click(); // 07:00–08:00
  const e7 = day('elec', [7])[0], g7 = day('gas', [7])[0];
  assert.equal(await text(page, '#chart .chart-tip'), `07:00–08:00 · ${short(e7.pence + g7.pence)} · Electricity ${short(e7.pence)} (${kwhText(e7.kwh)}) · Gas ${short(g7.pence)} (${kwhText(g7.kwh)})`);

  await view(page, 'M');
  await page.locator('#chart .ch-stack').first().waitFor();
  assert.equal(await label(page), 'Cost this month £ per day');
  assert.equal(await page.locator('#chart .ch-stack').count(), 25);
  await page.locator('#chart .ch-hit[data-fuel="both"]').nth(2).click();
  const e3 = septDay('elec', 3), g3 = septDay('gas', 3);
  assert.equal(await text(page, '#chart .chart-tip'), `Thu 3 September · ${short(e3.pence + g3.pence)} · Electricity ${short(e3.pence)} (${kwhText(e3.kwh)}) · Gas ${short(g3.pence)} (${kwhText(g3.kwh)})`);
  await view(page, 'Y');
  await page.locator('#chart .ch-stack').nth(8).waitFor();
  assert.equal(await label(page), 'Cost this year £ per month');
  assert.equal(await page.locator('#chart .ch-stack').count(), 9);

  // Remembered, and switched off again.
  await page.reload();
  await page.locator('#chart .ch-stack').nth(8).waitFor();
  assert.equal(await page.locator('#chart .fz-stack').getAttribute('aria-pressed'), 'true');
  await page.locator('#chart .fz-stack').click();
  assert.equal(await label(page), 'Usage this year kWh per month');
  assert.equal(await page.locator('#chart .ch-stack').count(), 0);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('gas that Fuse shares out evenly through the day: no hourly gas graph, and no stacking by the hour', async () => {
  const { ctx, page, problems } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true, fail: new Set(['fuse-gas-flat']),
    initScript: () => { try { localStorage.setItem('wallpanel.fuse.style', 'stacked'); } catch { /* none */ } } });
  await page.locator('#price .big .num').waitFor();
  // The day: electricity only, saying why. Today's even-spread gas is an estimate, so it isn't counted: the card,
  // the total and the tile say gas comes once a day, with yesterday's real total.
  assert.equal(await label(page), "Usage today kWh per hour · gas isn't hourly");
  assert.deepEqual(await page.locator('#chart .ch-rowname').allTextContents(), ['Electricity']);
  assert.equal(await page.locator('#chart .ch-bar.ch-gas').count(), 0);
  assert.equal(await page.locator('#chart .ch-stack').count(), 0, 'stacked is saved, but there is no hourly gas to stack');
  assert.equal(await page.locator('#chart .fz-stack').isVisible(), false);
  assert.match(await text(page, '#price .sub'), /Electricity £\d+\.\d\d · Gas comes once a day · yesterday £\d+\.\d\d/);
  assert.equal(await text(page, '#price .big .num'), gbp(Math.round(T.elec.pence)), "the total is the electricity so far; today's estimated gas isn't in it");
  assert.deepEqual(await page.locator('#price .band-chip .fz').allInnerTexts(), [`${T.elec.kwh.toFixed(1)} kWh`, '–']);
  assert.equal(await text(page, '.tile.cost .t-label'), 'Gas');
  assert.equal(await text(page, '.tile.cost .t-value'), '–');
  assert.match(await text(page, '.tile.cost .extra'), /^Comes once a day · tap\nYesterday £\d+\.\d\d$/);
  await page.locator('.tile.cost').click();
  await page.locator('.toast', { hasText: "Fuse reads gas about once a day, so today's gas isn't known yet and isn't in the total." }).waitFor();
  assert.equal(await page.locator('#chart .fz-seg').count(), 3, 'D, M and Y stay');

  // The month and the year have Fuse's daily and monthly gas, so both rows return, and stacking with them.
  await view(page, 'M');
  await page.locator('#chart .ch-stack').first().waitFor();
  assert.equal(await label(page), 'Cost this month £ per day', 'the saved stacked choice applies where gas can be stacked');
  assert.equal(await page.locator('#chart .fz-stack').isVisible(), true);
  assert.equal(await page.locator('#chart .ch-stack').count(), 25);
  await page.locator('#chart .fz-stack').click();
  assert.equal(await page.locator('#chart .ch-rowname').count(), 2);
  await view(page, 'D');
  assert.deepEqual(await page.locator('#chart .ch-rowname').allTextContents(), ['Electricity']);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('a month or year Fuse will not give: it says so in the chart, and the day still works', async () => {
  const { ctx, page, problems } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true, fail: new Set(['fuse-range-fails']) });
  await page.locator('#price .big .num').waitFor();
  await view(page, 'M');
  await page.locator('#chart .chart-msg').waitFor();
  await page.locator('#chart .chart-msg', { hasText: "Couldn't load this month from Fuse: " }).waitFor();
  assert.equal(await page.locator('#chart .ch-bar').count(), 0);
  await view(page, 'Y');
  await page.locator('#chart .chart-msg', { hasText: "Couldn't load this year from Fuse: " }).waitFor();
  assert.equal(await text(page, '#price .big .num'), gbp(Math.round(T.elec.pence) + Math.round(T.gas.pence)), 'today so far is untouched');
  await view(page, 'D');
  assert.equal(await page.locator('#chart .chart-msg').count(), 0);
  assert.equal(await page.locator('#chart .ch-bar.ch-elec').count(), 10);
  await ctx.close();
});

test('a month Fuse has nothing for yet: said plainly, not an empty box', async () => {
  const { ctx, page } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true, fail: new Set(['fuse-empty']),
    initScript: () => { try { localStorage.setItem('wallpanel.fuse.view', 'M'); } catch { /* none */ } } });
  await page.locator('#chart .chart-msg', { hasText: 'Fuse sent no daily figures for this month yet.' }).waitFor();
  await view(page, 'Y');
  await page.locator('#chart .chart-msg', { hasText: 'Fuse sent no monthly figures for this year yet.' }).waitFor();
  await ctx.close();
});

test('"Show what Fuse sent" also shows this month and this year', async () => {
  const { ctx, page } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true });
  await page.locator('#price .big .num').waitFor();
  await page.locator('#clock .gear').click();
  const set = page.locator('#settings');
  await set.getByRole('button', { name: 'Show what Fuse sent (for troubleshooting)' }).click();
  const diag = set.locator('pre.diag');
  await diag.waitFor();
  const t = await diag.innerText();
  assert.match(t, /Fuse's chart for 2026-09 \(this month, a bar per day\)/);
  assert.match(t, /Fuse's chart for 2026 \(this year, a bar per month\)/);
  assert.match(t, /GAS: 30 bars/, 'the whole of September, a bar a day (those to come marked)');
  assert.match(t, /09\.01=\d+(\.\d+)?/, 'the daily bars, month.day=kWh');
  assert.ok(!/prem-1|supply_fid=|1 Test Street|dev-test|fuse-acc/.test(t), 'no IDs, address or tokens');
  await ctx.close();
});

test('the month and year fail on their own without losing the day in "Show what Fuse sent"', async () => {
  const { ctx, page } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true, fail: new Set(['fuse-range-fails']) });
  await page.locator('#price .big .num').waitFor();
  await page.locator('#clock .gear').click();
  const set = page.locator('#settings');
  await set.getByRole('button', { name: 'Show what Fuse sent (for troubleshooting)' }).click();
  const diag = set.locator('pre.diag');
  await diag.waitFor();
  const t = await diag.innerText();
  assert.match(t, /Fuse's chart for 2026-09-25/);
  assert.match(t, /Fuse's chart for 2026-09 \(this month, a bar per day\)\ncouldn't be read: /);
  await ctx.close();
});

test('a gas-only account whose gas comes once a day: the day says so instead of drawing nothing', async () => {
  const { ctx, page, problems } = await openPanel(env, { settings: fuseSettings(NOW), fuse: true, fuseNoElec: true, fail: new Set(['fuse-gas-flat']) });
  await page.locator('#chart .chart-msg').waitFor();
  assert.equal(await text(page, '#chart .chart-msg'), 'Fuse gives gas once a day, not by the hour. Choose M or Y to see it.');
  await view(page, 'M');
  await page.locator('#chart .ch-bar.ch-gas').first().waitFor();
  assert.equal(await page.locator('#chart .ch-rowname').count(), 1);
  assert.deepEqual(problems, []);
  await ctx.close();
});
