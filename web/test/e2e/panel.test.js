import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { startBrowser, openPanel, recordNavigations, text, NOW, UA } from '../support/browser.js';
import { agilePrice } from '../support/mocks.js';
import { APPS, launchIntent } from '../../js/launcher.js';

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
const shownPrice = (ms) => (Math.round(agilePrice(ms) * 10) / 10).toFixed(1);
const slotStart = (ms) => Math.floor(ms / 1800e3) * 1800e3;
const ready = (page) => page.locator('.tile.car .t-value', { hasText: '%' }).waitFor();

test('every card renders from the fake services, with the right auth on each call', async () => {
  const { ctx, page, calls, problems } = await openPanel(env);
  await ready(page);
  await page.locator('.tile.indoor .t-value', { hasText: '°' }).waitFor();
  await page.locator('#cal', { hasText: 'Dentist' }).waitFor();
  assert.equal(await text(page, '#clock .time'), '09:41');
  assert.equal(await text(page, '#clock .date'), 'Friday 25 September');
  assert.match(await text(page, '#clock .wx-now'), /14°/);
  assert.match(await text(page, '#price .big'), new RegExp(`^${shownPrice(slotStart(NOW))}`));
  assert.match(await text(page, '#price .sub'), /until 10:00 · then \d+\.\dp\s+cheapest ahead: \d+\.\dp at \d\d:\d\d/);
  assert.match(await text(page, '.tile.usage .t-value'), /^\d+ W$/);
  assert.match(await text(page, '.tile.cost .t-value'), /^£\d+\.\d\d$/);
  assert.match(await text(page, '.tile.indoor .t-value'), /^20\.5°/);
  assert.match(await text(page, '.tile.indoor .extra'), /Heating · Hallway/);
  assert.match(await text(page, '.tile.car .t-value'), /^78%/);
  const cal = await text(page, '#cal');
  assert.match(cal, /Bin day/);
  assert.doesNotMatch(cal, /School run/, 'finished events are hidden');
  assert.match(cal, /Tomorrow[\s\S]*Parkrun/);
  assert.ok(await page.locator('#chart svg .ch-bar').count() > 20);
  assert.equal(await page.locator('.dot.error, .dot.stale').count(), 0);

  const tele = calls.find((c) => c.service === 'octopus' && /smartMeterTelemetry/.test(c.body || ''));
  assert.match(tele.headers.authorization, /^JWT h\./);
  const rates = calls.find((c) => /standard-unit-rates/.test(c.url));
  assert.equal(rates.headers.authorization, undefined, 'prices need no key');
  const refresh = calls.find((c) => c.service === 'google-token');
  assert.equal(refresh.grant, 'refresh_token');
  assert.equal(refresh.body.refresh_token, 'rt-123');
  const nest = calls.find((c) => c.service === 'nest');
  assert.equal(nest.auth, 'Bearer at-refreshed');
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('calendar text is shown as text, never run as HTML', async () => {
  const { ctx, page } = await openPanel(env, { xss: true });
  await page.locator('#cal', { hasText: 'Boiler service' }).waitFor();
  assert.match(await text(page, '#cal'), /<img src=x onerror=/);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.locator('#cal img').count(), 0);
  await ctx.close();
});

test('when a service fails, the card keeps its last data and shows a red dot with the reason', async () => {
  const fail = new Set();
  const { ctx, page } = await openPanel(env, { fail });
  await ready(page);
  await page.locator('.tile.indoor .t-value', { hasText: '°' }).waitFor();
  const price = await text(page, '#price .big');
  fail.add('octopus'); fail.add('google');
  await page.reload();
  await page.locator('#price .dot.error').waitFor();
  await page.locator('.tile.indoor .dot.error').waitFor();
  assert.equal(await text(page, '#price .big'), price, 'cached price still shown');
  assert.match(await text(page, '.tile.indoor .t-value'), /^20\.5°/, 'cached temperature still shown');
  assert.match(await page.locator('.tile.indoor .dot').getAttribute('title'), /sign in again/i);
  assert.match(await page.locator('.tile.usage .dot').getAttribute('class'), /error/);
  await page.locator('.tile.indoor').click();
  await page.locator('.toast', { hasText: /sign in again/i }).waitFor();
  await ctx.close();
});

test('the price moves on at the half hour, and the day rolls over at midnight', async () => {
  const at = Date.parse('2026-09-25T09:59:20+01:00');
  let { ctx, page } = await openPanel(env, { now: at, clock: 'install' });
  await ready(page);
  const before = shownPrice(slotStart(at));
  const after = shownPrice(slotStart(at) + 1800e3);
  assert.notEqual(before, after, 'fixture slots differ');
  assert.match(await text(page, '#price .big'), new RegExp(`^${before}`));
  await page.clock.runFor(60e3);
  assert.match(await text(page, '#price .big'), new RegExp(`^${after}`));
  assert.match(await text(page, '#price .sub'), /until 10:30/);
  await ctx.close();

  const late = Date.parse('2026-09-25T23:59:00+01:00');
  ({ ctx, page } = await openPanel(env, { now: late, clock: 'install' }));
  await ready(page);
  await page.locator('#cal', { hasText: 'Parkrun' }).waitFor();
  assert.equal(await text(page, '#clock .date'), 'Friday 25 September');
  assert.match(await text(page, '#cal'), /^Today\s+25 September/);
  await page.clock.runFor(90e3);
  assert.equal(await text(page, '#clock .time'), '00:00');
  assert.equal(await text(page, '#clock .date'), 'Saturday 26 September');
  const cal = await text(page, '#cal');
  assert.match(cal, /^Today\s+26 September[\s\S]*Parkrun[\s\S]*Boiler service/);
  assert.doesNotMatch(cal, /Dinner/);
  assert.match(await text(page, '#price .big'), new RegExp(`^${shownPrice(Date.parse('2026-09-26T00:00:00+01:00'))}`));
  await ctx.close();
});

test('night mode dims the panel when idle, a tap wakes it for 5 minutes', async () => {
  const { ctx, page } = await openPanel(env, { now: Date.parse('2026-09-25T22:40:00+01:00'), clock: 'install' });
  await ready(page);
  assert.equal(await page.locator('#night').isVisible(), false);
  await page.clock.runFor(120e3);
  assert.equal(await page.locator('#night').isVisible(), true);
  await page.locator('#night').click();
  assert.equal(await page.locator('#night').isVisible(), false);
  await page.clock.runFor(4 * 60e3);
  assert.equal(await page.locator('#night').isVisible(), false, 'snoozed');
  await page.clock.runFor(2 * 60e3);
  assert.equal(await page.locator('#night').isVisible(), true);
  await ctx.close();

  const day = await openPanel(env, { now: Date.parse('2026-09-25T14:00:00+01:00'), clock: 'install' });
  await ready(day.page);
  await day.page.clock.runFor(5 * 60e3);
  assert.equal(await day.page.locator('#night').isVisible(), false, 'never in the daytime');
  await day.ctx.close();
});

// Like a real browser: applying the answer fires 'track' straight away with a *muted* video
// track (no frames yet). window.__unmute() makes frames "arrive". The mock's answer SDP is fake,
// so the real setRemoteDescription is skipped.
const fakeCameraRTC = () => {
  const Real = window.RTCPeerConnection;
  window.RTCPeerConnection = class extends Real {
    async setRemoteDescription(d) {
      window.__answer = d.sdp;
      const track = document.createElement('canvas').captureStream().getVideoTracks()[0];
      Object.defineProperty(track, 'muted', { value: true, configurable: true });
      window.__unmute = () => { Object.defineProperty(track, 'muted', { value: false, configurable: true }); track.dispatchEvent(new Event('unmute')); };
      const ev = new Event('track');
      ev.track = track;
      this.dispatchEvent(ev);
    }
  };
};
const nestCmds = (calls) => calls.filter((c) => c.service === 'nest' && c.url.endsWith(':executeCommand')).map((c) => JSON.parse(c.body));

test('camera: a tap asks Nest for a WebRTC stream and a battery camera stops after 5 minutes', async () => {
  const { ctx, page, calls, problems } = await openPanel(env, { clock: 'install', initScript: fakeCameraRTC });
  await ready(page);
  await page.locator('#cam').click();
  const gen = await waitFor(() => nestCmds(calls).find((c) => c.command.endsWith('GenerateWebRtcStream')), 'GenerateWebRtcStream');
  assert.ok(calls.find((c) => c.service === 'nest' && c.url.endsWith(':executeCommand')).url.endsWith('/devices/CAM1:executeCommand'));
  const sdp = gen.params.offerSdp;
  assert.ok(sdp.indexOf('m=audio') < sdp.indexOf('m=video') && sdp.indexOf('m=video') < sdp.indexOf('m=application'), 'audio, video, data in that order');
  await waitFor(() => page.evaluate(() => window.__answer), 'answer');
  assert.equal(await page.evaluate(() => window.__answer), 'v=0\r\nfake-answer\n');
  assert.match(await page.locator('#cam').getAttribute('class'), /expanded/);
  assert.equal(await page.evaluate(() => document.querySelector('#cam video').muted), true, 'camera audio stays muted');
  await page.clock.runFor(2000);
  assert.match(await text(page, '.cam-bar'), /connecting/, 'not "live" until frames arrive');
  await page.evaluate(() => window.__unmute());
  await page.clock.runFor(1000);
  assert.match(await text(page, '.cam-bar'), /LIVE[\s\S]*4:5\d/);
  await page.clock.runFor(60e3);
  assert.equal(nestCmds(calls).some((c) => c.command.endsWith('StopWebRtcStream')), false, 'the 30 s no-video check passed');
  await page.clock.runFor(4 * 60e3);
  const stop = await waitFor(() => nestCmds(calls).find((c) => c.command.endsWith('StopWebRtcStream')), 'StopWebRtcStream');
  assert.deepEqual(stop.params, { mediaSessionId: 'session-1' });
  assert.doesNotMatch(await page.locator('#cam').getAttribute('class'), /expanded/);
  assert.equal(await page.locator('.cam-bar').isVisible(), false);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('camera: if no video arrives it gives up after 30 s and says so', async () => {
  const { ctx, page, calls } = await openPanel(env, { clock: 'install', initScript: fakeCameraRTC });
  await ready(page);
  await page.locator('#cam').click();
  await page.locator('.cam-bar', { hasText: 'connecting' }).waitFor();
  await waitFor(() => page.evaluate(() => window.__answer), 'answer');
  await page.clock.runFor(31e3);
  await page.locator('.toast', { hasText: "didn't send any video" }).waitFor();
  await waitFor(() => nestCmds(calls).some((c) => c.command.endsWith('StopWebRtcStream')), 'StopWebRtcStream');
  assert.equal(await page.locator('.cam-bar').isVisible(), false);
  await ctx.close();
});

test('camera: closing while it connects is clean, and a new stream is not disturbed by the old one', async () => {
  const { ctx, page, calls, problems } = await openPanel(env, { initScript: fakeCameraRTC });
  await ready(page);
  // Hold Google's reply to the first GenerateWebRtcStream until the test lets it go.
  let release;
  const held = new Promise((r) => { release = r; });
  let first = true;
  await page.route(/smartdevicemanagement\.googleapis\.com\/.*:executeCommand/, async (route) => {
    if (first && /GenerateWebRtcStream/.test(route.request().postData() || '')) { first = false; await held; }
    return route.fallback();
  });
  await page.locator('#cam').click();
  await page.locator('.cam-bar', { hasText: 'connecting' }).waitFor();
  await page.locator('.cam-bar .close').click();
  assert.equal(await page.locator('.cam-bar').isVisible(), false);
  await page.locator('#cam').click(); // second stream
  await waitFor(() => page.evaluate(() => window.__answer), 'second answer');
  await page.evaluate(() => window.__unmute());
  await page.locator('.cam-bar', { hasText: 'LIVE' }).waitFor();
  release(); // the first stream's reply finally arrives
  await waitFor(() => nestCmds(calls).filter((c) => c.command.endsWith('StopWebRtcStream')).length >= 1, 'Stop for the abandoned stream');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.cam-bar', { hasText: 'LIVE' }).isVisible(), true, 'second stream still showing');
  assert.equal(await page.locator('#cam .dot.error').count(), 0, 'no false camera error');
  assert.equal(await page.locator('.toast:not(.hidden)', { hasText: 'Camera:' }).count(), 0);
  await page.locator('.cam-bar .close').click();
  await waitFor(() => nestCmds(calls).filter((c) => c.command.endsWith('StopWebRtcStream')).length >= 2, 'Stop for the second stream');
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('buttons in the kiosk app (Android WebView) open Android apps and screens', async () => {
  const { ctx, page } = await openPanel(env, { userAgent: UA.webview });
  await ready(page);
  const nav = await recordNavigations(page);
  for (const app of ['home', 'claude', 'gemini', 'spotify', 'shopping']) await page.locator(`.dock [data-app="${app}"]`).click();
  const box = await page.locator('.dock [data-app="claude"]').boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await waitFor(() => nav.length >= 6, 'six navigations');
  assert.match(nav[0], /^intent:#Intent;action=android\.intent\.action\.MAIN;category=android\.intent\.category\.HOME;/);
  assert.match(nav[1], /^intent:#Intent;action=android\.intent\.action\.VOICE_ASSIST;component=com\.anthropic\.claude\//);
  assert.deepEqual(nav, [
    APPS.home.special,
    APPS.claude.special,
    APPS.gemini.special,
    launchIntent('com.spotify.music'),
    launchIntent('com.google.android.keep'),
    launchIntent('com.anthropic.claude'), // press and hold: the normal Claude app
  ]);
  await ctx.close();
});

test('buttons in Chrome use links Chrome allows, and Home explains the gesture', async () => {
  const { ctx, page } = await openPanel(env, { userAgent: UA.chrome });
  await ready(page);
  const nav = await recordNavigations(page);
  await page.locator('.dock [data-app="home"]').click();
  await page.locator('.toast', { hasText: /swipe up/i }).waitFor();
  await page.locator('.dock [data-app="claude"]').click();
  await page.locator('.dock [data-app="spotify"]').click();
  await waitFor(() => nav.length >= 2, 'two navigations');
  assert.deepEqual(nav, [
    'intent://claude.ai/new#Intent;scheme=https;package=com.anthropic.claude;end',
    'intent://open.spotify.com/#Intent;scheme=https;package=com.spotify.music;end',
  ]);
  await ctx.close();
});

test('fits the screen at 1280×800, 1333×800 and 960×600 with nothing cut off', async () => {
  await mkdir('shots', { recursive: true });
  for (const [width, height] of [[1280, 800], [1333, 800], [960, 600]]) {
    const { ctx, page, problems } = await openPanel(env, { viewport: { width, height } });
    await ready(page);
    await page.locator('#cal', { hasText: 'Dentist' }).waitFor();
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const d = document.documentElement;
      const cut = [...document.querySelectorAll('.tile .t-value, .tile .t-label, .dock button span, #price .big, #clock .time')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => `${el.className}: ${el.textContent}`);
      const dock = document.querySelector('.dock').getBoundingClientRect();
      return { sw: d.scrollWidth, sh: d.scrollHeight, w: innerWidth, h: innerHeight, dockBottom: dock.bottom, cut };
    });
    assert.ok(m.sw <= m.w && m.sh <= m.h, `no page scroll at ${width}×${height}: ${JSON.stringify(m)}`);
    assert.ok(m.dockBottom <= m.h, `dock on screen at ${width}×${height}`);
    assert.deepEqual(m.cut, [], `nothing truncated at ${width}×${height}`);
    assert.deepEqual(problems, [], `no console errors at ${width}×${height}`);
    await page.screenshot({ path: `shots/e2e-${width}x${height}.png` });
    await ctx.close();
  }
});
