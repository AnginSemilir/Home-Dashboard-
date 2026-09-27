// Spotify controls: connecting (PKCE), the now-playing button, the pop-up's controls, and the
// ways it can go wrong. Spotify is faked in web/test/support/mocks.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser, openPanel, recordNavigations, NOW, UA } from '../support/browser.js';
import { fullSettings } from '../support/mocks.js';
import { launchIntent } from '../../js/launcher.js';
import { challengeFor } from '../../js/spotify.js';

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
const spCalls = (calls, method, path) => calls.filter((c) => c.service === 'spotify' && (!method || c.method === method) && (!path || c.path === path));

test('connect Spotify from Settings, then the music button shows what\'s playing', async () => {
  const { ctx, page, calls, problems } = await openPanel(env);
  const btn = page.locator('.dock [data-app="music"]');
  assert.equal(await btn.innerText(), 'Spotify', 'not connected yet: the plain button');
  await page.locator('#clock .gear').click();
  const set = page.locator('#settings');
  await set.getByText('Spotify controls (optional, needs Premium) · tap Connect Spotify').waitFor();
  await set.getByRole('button', { name: 'Connect Spotify', exact: true }).click();
  await page.locator('.toast', { hasText: 'Spotify connected' }).waitFor();
  const auth = new URL(calls.find((c) => c.service === 'spotify-auth').url);
  const tok = calls.find((c) => c.service === 'spotify-token' && c.grant === 'authorization_code');
  assert.equal(auth.searchParams.get('client_id'), 'sp-client');
  assert.equal(auth.searchParams.get('code_challenge'), await challengeFor(tok.body.code_verifier), 'the verifier matches the challenge');
  assert.equal(tok.body.redirect_uri, auth.searchParams.get('redirect_uri'));
  assert.equal(tok.body.client_secret, undefined, 'no secret: PKCE');
  assert.doesNotMatch(page.url(), /code=/, 'code removed from the address bar');
  await btn.locator('.d-label', { hasText: 'Here Comes the Sun' }).waitFor();
  assert.equal(await btn.locator('.d-sub').innerText(), 'The Beatles');
  assert.equal(await btn.locator('.np-art').getAttribute('src'), 'https://i.scdn.co/image/mid');
  assert.equal(spCalls(calls, 'GET', '/me/player')[0].auth, 'Bearer sp-at-1');
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('the controls: pause, next, volume, move to another speaker; hold opens the app', async () => {
  const { ctx, page, calls, problems } = await openPanel(env, { spotify: true, userAgent: UA.webview });
  const btn = page.locator('.dock [data-app="music"]');
  await btn.locator('.d-label', { hasText: 'Here Comes the Sun' }).waitFor();
  // The stored sign-in was refreshed, and the new (rotated) one kept.
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('wallpanel.spotify.v1')).refreshToken), 'sp-rt-1');

  await btn.click();
  const sheet = page.locator('#music');
  await sheet.waitFor();
  assert.equal(await sheet.locator('.ms-title').innerText(), 'Here Comes the Sun');
  assert.match(await sheet.locator('.ms-device').innerText(), /Playing on Kitchen speaker/);
  assert.match(await sheet.locator('.ms-progress').innerText(), /1:0\d[\s\S]*3:05/);
  await sheet.locator('.ms-dev', { hasText: 'Lenovo TB328FU' }).waitFor();
  assert.match(await sheet.locator('.ms-dev.on').innerText(), /Kitchen speaker/);

  await sheet.getByRole('button', { name: 'Pause' }).click();
  await waitFor(() => spCalls(calls, 'PUT', '/me/player/pause').length, 'pause');
  await sheet.getByRole('button', { name: 'Play' }).waitFor();
  await btn.locator('.d-sub', { hasText: 'The Beatles' }).waitFor();
  assert.equal(await btn.evaluate((b) => b.classList.contains('playing')), false);

  await sheet.getByRole('button', { name: 'Next' }).click();
  await waitFor(() => spCalls(calls, 'POST', '/me/player/next').length, 'next');
  await sheet.locator('.ms-title', { hasText: 'Something' }).waitFor();

  await sheet.getByLabel('Volume').fill('25');
  const vol = await waitFor(() => spCalls(calls, 'PUT', '/me/player/volume')[0], 'volume');
  assert.equal(vol.query, '?volume_percent=25');

  await sheet.locator('.ms-dev', { hasText: 'Lenovo TB328FU' }).click();
  const moved = await waitFor(() => spCalls(calls, 'PUT', '/me/player')[0], 'transfer');
  assert.deepEqual(moved.body, { device_ids: ['tablet'], play: true });
  await sheet.locator('.ms-device', { hasText: 'Playing on Lenovo TB328FU' }).waitFor();
  await sheet.getByLabel('Volume').waitFor({ state: 'hidden' }); // the tablet doesn't allow remote volume

  await sheet.getByRole('button', { name: 'Close' }).click();
  await sheet.waitFor({ state: 'hidden' });

  // Press and hold: the Spotify app itself.
  const nav = await recordNavigations(page);
  const box = await btn.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await waitFor(() => nav.length, 'a navigation');
  assert.equal(nav[0], launchIntent('com.spotify.music'));
  assert.equal(await sheet.isVisible(), false);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('on a touchscreen, a tap opens the controls and they stay open', async () => {
  const { ctx, page } = await openPanel(env, { spotify: true, touch: true });
  const btn = page.locator('.dock [data-app="music"]');
  await btn.locator('.d-label', { hasText: 'Here Comes the Sun' }).waitFor();
  await btn.tap();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('#music').isVisible(), true, 'still open after the tap');
  // A tap on the dark area outside the card closes it; a tap on the card doesn't.
  await page.locator('#music .ms-title').tap();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#music').isVisible(), true);
  await page.touchscreen.tap(5, 5);
  await page.locator('#music').waitFor({ state: 'hidden' });
  await ctx.close();
});

test('nothing playing anywhere: the pop-up says so and offers the speakers', async () => {
  const { ctx, page, calls } = await openPanel(env, { spotify: true, fail: new Set(['spotify-idle']) });
  await waitFor(() => spCalls(calls, 'GET', '/me/player').length, 'a player check');
  const btn = page.locator('.dock [data-app="music"]');
  assert.equal(await btn.locator('.d-label').innerText(), 'Spotify');
  await btn.click();
  const sheet = page.locator('#music');
  await sheet.locator('.ms-title', { hasText: 'Nothing playing' }).waitFor();
  await sheet.getByRole('button', { name: 'Play' }).click();
  await sheet.locator('.ms-msg.bad', { hasText: 'Nothing is ready to play' }).waitFor();
  await sheet.locator('.ms-dev', { hasText: 'Kitchen speaker' }).click();
  await sheet.locator('.ms-title', { hasText: 'Here Comes the Sun' }).waitFor();
  await ctx.close();
});

test('without Premium, and after the sign-in ends: plain explanations', async () => {
  const a = await openPanel(env, { spotify: true, fail: new Set(['spotify-premium']) });
  await a.page.locator('.dock [data-app="music"] .d-label', { hasText: 'Here Comes the Sun' }).waitFor();
  await a.page.locator('.dock [data-app="music"]').click();
  await a.page.locator('#music').getByRole('button', { name: 'Pause' }).click();
  await a.page.locator('#music .ms-msg.bad', { hasText: 'Premium' }).waitFor();
  await a.ctx.close();

  const b = await openPanel(env, { spotify: true, fail: new Set(['spotify-expired']) });
  await waitFor(() => b.calls.some((c) => c.service === 'spotify-token'), 'a refresh');
  await waitFor(async () => (await b.page.evaluate(() => localStorage.getItem('wallpanel.spotify.v1'))) === null, 'the ended sign-in forgotten');
  assert.equal(await b.page.locator('.dock [data-app="music"]').innerText(), 'Spotify');
  await b.page.locator('#clock .gear').click();
  await b.page.locator('#settings').getByText('Not connected.').waitFor();
  await b.ctx.close();
});

test('Amazon Music chosen: no Spotify calls, the button just opens the app', async () => {
  const s = fullSettings(NOW);
  s.panel.music = 'amazonmusic';
  const { ctx, page, calls } = await openPanel(env, { settings: s, spotify: true, userAgent: UA.webview });
  const nav = await recordNavigations(page);
  await page.locator('.dock [data-app="music"]', { hasText: 'Amazon Music' }).click();
  await waitFor(() => nav.length, 'a navigation');
  assert.equal(nav[0], launchIntent('com.amazon.mp3'));
  assert.equal(calls.some((c) => c.service === 'spotify'), false);
  await ctx.close();
});

test('Copy settings moves the Spotify sign-in to the other browser (it can only live in one)', async () => {
  const a = await openPanel(env, { spotify: true });
  await a.page.locator('.dock [data-app="music"] .d-label', { hasText: 'Here Comes the Sun' }).waitFor();
  await a.page.locator('#clock .gear').click();
  const set = a.page.locator('#settings');
  await set.getByRole('button', { name: 'Copy settings' }).click();
  await set.getByText(/Spotify moves with the settings/).waitFor();
  const text = (await set.locator('textarea').inputValue()) || (await a.page.evaluate(() => navigator.clipboard.readText().catch(() => '')));
  assert.equal(JSON.parse(text).spotifyToken, 'sp-rt-1');
  assert.equal(await a.page.evaluate(() => localStorage.getItem('wallpanel.spotify.v1')), null, 'this browser let go of it');
  await a.ctx.close();

  const b = await openPanel(env, { settings: null });
  await b.page.locator('#settings textarea').fill(text);
  await b.page.locator('#settings').getByRole('button', { name: 'Paste settings' }).click();
  await b.page.locator('.dock [data-app="music"] .d-label', { hasText: 'Here Comes the Sun' }).waitFor();
  await b.ctx.close();
});
