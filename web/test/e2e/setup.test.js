import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser, openPanel, text, UA } from '../support/browser.js';
import { ACCOUNT } from '../support/mocks.js';

let env;
before(async () => { env = await startBrowser(); });
after(async () => { await env?.close(); });

test('first run: settings open, then weather, Octopus and Google sign-in all set up from the page', async () => {
  const { ctx, page, calls, problems } = await openPanel(env, { settings: null });
  const settings = page.locator('#settings');
  await settings.waitFor();
  assert.match(await text(page, '#settings .checklist'), /○\s*Weather location[\s\S]*○\s*Google sign-in/);
  assert.match(await text(page, '#settings'), new RegExp(`Redirect URI to add to your Google OAuth client: ${env.url.replace(/[.]/g, '\\.')}`));

  await page.getByLabel('Where is the panel?').fill('SW1A 1AA');
  await settings.getByRole('button', { name: 'Find' }).click();
  await settings.getByText('Found Westminster').waitFor();

  await page.getByLabel('Account number').fill(ACCOUNT);
  await page.getByLabel('API key').fill('sk_test_key');
  await settings.getByRole('button', { name: 'Connect' }).click();
  await settings.getByText('Octopus connected').waitFor();
  assert.match(await text(page, '#settings'), /tariff E-1R-AGILE-24-10-01-C \(region C\)[\s\S]*Home Mini yes/);

  await page.getByLabel('OAuth client ID').fill('cid.apps.googleusercontent.com');
  await page.getByLabel('OAuth client secret').fill('secret');
  await page.getByLabel('Device Access project ID (Nest)').fill('proj-123');
  await settings.getByRole('button', { name: 'Sign in with Google' }).click();

  // Google (faked) sends the browser back with ?code=…; the page swaps it for a refresh token.
  await page.locator('.toast', { hasText: 'Signed in to Google' }).waitFor();
  assert.equal(page.url(), env.url, 'code removed from the address bar');
  const auth = new URL(calls.find((c) => c.service === 'google-auth').url);
  assert.equal(auth.origin + auth.pathname, 'https://nestservices.google.com/partnerconnections/proj-123/auth');
  assert.equal(auth.searchParams.get('redirect_uri'), env.url);
  const exchange = calls.find((c) => c.service === 'google-token' && c.grant === 'authorization_code');
  assert.equal(exchange.body.code, 'auth-code-1');
  assert.equal(exchange.body.redirect_uri, env.url);
  assert.equal(exchange.body.client_secret, 'secret');

  await settings.waitFor();
  await settings.getByRole('button', { name: 'Choose camera & thermostat' }).click();
  await settings.getByLabel('Front door').check();
  await settings.getByLabel('Hallway').check();
  await settings.getByRole('button', { name: 'Choose calendars' }).click();
  await settings.getByLabel('Family').check();
  assert.match(await text(page, '#settings .checklist'), /✓\s*Google sign-in[\s\S]*Nest thermostat[\s\S]*✓\s*Nest camera/);
  await settings.getByRole('button', { name: 'Save & close' }).click();

  await page.locator('.tile.indoor .t-value', { hasText: '20.5°' }).waitFor();
  await page.locator('#cal', { hasText: 'Dentist' }).waitFor();
  await page.locator('.tile.usage .t-value', { hasText: 'W' }).waitFor();
  assert.match(await text(page, '#clock .wx-now'), /14°/);
  assert.equal(await page.locator('#settings').count(), 0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wallpanel.settings.v1')));
  assert.equal(saved.google.refreshToken, 'rt-new');
  assert.equal(saved.google.cameraId, 'enterprises/proj-123/devices/CAM1');
  assert.equal(saved.octopus.discovered.deviceId, '00-11-22-33-44-55-66-77');
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('Cancel throws away changes', async () => {
  const { ctx, page } = await openPanel(env);
  await page.locator('.tile.car .t-value', { hasText: '%' }).waitFor();
  await page.locator('#clock .gear').click();
  await page.locator('#settings').getByText('Panel version: dev (not published)').waitFor();
  await page.getByLabel('API key').fill('something-else');
  await page.locator('#settings').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.locator('#settings').count(), 0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wallpanel.settings.v1')));
  assert.equal(saved.octopus.apiKey, 'sk_test_key');
  await ctx.close();
});

test('inside the kiosk app, Google sign-in explains how to use Chrome instead', async () => {
  const { ctx, page, calls } = await openPanel(env, { settings: null, userAgent: UA.webview });
  const settings = page.locator('#settings');
  await page.getByLabel('OAuth client ID').fill('cid');
  await page.getByLabel('OAuth client secret').fill('secret');
  await settings.getByRole('button', { name: 'Sign in with Google' }).click();
  await settings.getByText(/Sign in using Chrome/).waitFor();
  assert.equal(calls.some((c) => c.service === 'google-auth'), false);
  await ctx.close();
});

test('settings copied from one browser can be pasted into another', async () => {
  // Without clipboard access the page falls back to showing the text in a box.
  const a = await openPanel(env, { initScript: () => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); } });
  await a.page.locator('#clock .gear').click();
  await a.page.locator('#settings').getByRole('button', { name: 'Copy settings' }).click();
  await a.page.locator('#settings').getByText('Copy the text in the box below.').waitFor();
  const exported = await a.page.locator('#settings textarea').inputValue();
  assert.match(exported, /"refreshToken":\s*"rt-123"/);
  await a.ctx.close();

  const b = await openPanel(env, { settings: null, userAgent: UA.webview });
  await b.page.locator('#settings textarea').fill(exported);
  await b.page.locator('#settings').getByRole('button', { name: 'Paste settings' }).click();
  await b.page.locator('.tile.indoor .t-value', { hasText: '20.5°' }).waitFor();
  assert.equal(await b.page.locator('#settings').count(), 0);
  await b.ctx.close();
});

test('button results show next to the button: Octopus blocked, Google details missing', async () => {
  const { ctx, page } = await openPanel(env, { settings: null });
  const settings = page.locator('#settings');
  await settings.waitFor();
  // A browser-blocked (CORS) request looks like a network failure to the page.
  await page.route(/^https:\/\/api\.octopus\.energy\//, (route) => route.abort('failed'));
  await page.getByLabel('Account number').fill('A-1234ABCD');
  await page.getByLabel('API key').fill('sk_test_key');
  const connect = settings.locator('.btn-wrap', { has: page.getByRole('button', { name: 'Connect' }) });
  await connect.getByRole('button').click();
  await connect.locator('.btn-status.bad', { hasText: /Octopus didn't answer this browser[\s\S]*docs\/octopus\.md/ }).waitFor();
  assert.equal(await connect.locator('.btn-status').isVisible(), true);

  const signIn = settings.locator('.btn-wrap', { has: page.getByRole('button', { name: 'Sign in with Google' }) });
  await signIn.getByRole('button').click();
  await signIn.locator('.btn-status.bad', { hasText: 'Enter the client ID and secret first' }).waitFor();
  await ctx.close();
});
