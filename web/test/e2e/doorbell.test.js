// Doorbell presses: Google's events reach the panel through a Pub/Sub subscription (faked in
// web/test/support/mocks.js). A press opens the doorbell's live view over everything, with a
// banner and a chime, even at night.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser, openPanel, UA } from '../support/browser.js';
import { fullSettings, CAMERA_ID } from '../support/mocks.js';

let env;
before(async () => { env = await startBrowser(); });
after(async () => { await env?.close(); });

const NIGHT = Date.parse('2026-09-25T23:15:00+01:00');
const SUB = 'projects/home-panel-123/subscriptions/panel-doorbell';
const waitFor = async (fn, what, ms = 8000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
};
const withDoorbell = (s = fullSettings(NIGHT)) => {
  s.google.doorbellSub = SUB;
  s.google.scopes += ' https://www.googleapis.com/auth/pubsub';
  return s;
};
const press = (now, { ago = 2000, eventId = 'chime-1', state = 'STARTED', device = CAMERA_ID } = {}) => ({
  eventId: `top-${eventId}-${state}`, timestamp: new Date(now - ago).toISOString(), eventThreadId: 'thread-1', eventThreadState: state,
  resourceUpdate: { name: device, events: { 'sdm.devices.events.DoorbellChime.Chime': { eventSessionId: 'sess-1', eventId } } },
});
// The page as it runs overnight: nobody has touched it, and sound is counted.
const nightAndSound = () => {
  sessionStorage.setItem('wallpanel.autoreload', '1');
  window.__notes = 0;
  const start = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (...a) { window.__notes++; return start.apply(this, a); };
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
  // Pretend WebRTC connects (as in the camera tests).
  const Real = window.RTCPeerConnection;
  window.RTCPeerConnection = class extends Real {
    async setRemoteDescription() {
      const track = document.createElement('canvas').captureStream().getVideoTracks()[0];
      const ev = new Event('track');
      ev.track = track;
      this.dispatchEvent(ev);
    }
  };
};
const nestCmds = (calls) => calls.filter((c) => c.service === 'nest' && c.url.endsWith(':executeCommand')).map((c) => JSON.parse(c.body).command);

test('a press at night: the live view over everything, a banner, a chime; each press once', async () => {
  const { ctx, page, calls, problems } = await openPanel(env, { now: NIGHT, settings: withDoorbell(), initScript: nightAndSound });
  await page.locator('#night').waitFor();
  await waitFor(() => calls.pubsub.pulls >= 1, 'a pull');
  assert.equal(calls.pubsub.lastPull.url, `https://pubsub.googleapis.com/v1/${SUB}:pull`);
  assert.deepEqual(calls.pubsub.lastPull.body, { maxMessages: 10 });
  assert.match(calls.pubsub.lastPull.auth, /^Bearer /);
  assert.ok(calls.some((c) => c.service === 'nest' && /\/devices$/.test(c.url)), 'the device list that starts Google sending events');

  // Someone rings, and the same press arrives again as an update.
  calls.pubsub.queue.push(press(NIGHT), press(NIGHT, { state: 'UPDATED' }));
  await page.locator('#cam.expanded.ring').waitFor();
  await page.locator('#night').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.ring-banner').innerText(), "Someone's at the door · 23:15");
  await waitFor(() => calls.pubsub.acks.length >= 2, 'both acknowledged');
  await waitFor(() => page.evaluate(() => window.__notes > 0), 'a chime');
  assert.equal(await page.evaluate(() => window.__notes), 8, 'one ding-dong, twice');
  assert.deepEqual(nestCmds(calls).filter((c) => c.endsWith('GenerateWebRtcStream')).length, 1);

  // Stale presses and a person walking past: acknowledged, no ring.
  const acksBefore = calls.pubsub.acks.length;
  calls.pubsub.queue.push(press(NIGHT, { ago: 5 * 60e3, eventId: 'old' }), {
    timestamp: new Date(NIGHT).toISOString(), resourceUpdate: { name: CAMERA_ID, events: { 'sdm.devices.events.CameraPerson.Person': { eventSessionId: 's2', eventId: 'p1' } } },
  });
  await waitFor(() => calls.pubsub.acks.length >= acksBefore + 2, 'acknowledged');
  assert.equal(await page.evaluate(() => window.__notes), 8, 'no second chime');

  // The ring sits above Settings.
  await page.evaluate(() => { document.querySelector('#clock .gear').click(); });
  await page.locator('#settings').waitFor();
  assert.equal(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2).closest('#cam')?.id), 'cam');
  assert.deepEqual(await page.evaluate(() => window.__csp), []);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('an unanswered ring closes itself after 2 minutes and the night dimming comes back', async () => {
  const { ctx, page, calls } = await openPanel(env, { now: NIGHT, settings: withDoorbell(), clock: 'install', initScript: nightAndSound });
  await page.locator('#night').waitFor();
  await waitFor(() => calls.pubsub.pulls >= 1, 'a pull');
  calls.pubsub.queue.push(press(NIGHT, { ago: 0 }));
  await page.clock.runFor(3000);
  await page.locator('#cam.expanded.ring').waitFor();
  await page.clock.runFor(125e3);
  await page.locator('#cam.ring').waitFor({ state: 'detached' }).catch(() => {});
  await waitFor(async () => !(await page.locator('#cam').getAttribute('class')).includes('ring'), 'the ring closed');
  await waitFor(() => nestCmds(calls).some((c) => c.endsWith('StopWebRtcStream')), 'the stream stopped');
  await page.clock.runFor(35e3);
  await page.locator('#night').waitFor();
  await ctx.close();
});

test('setup problems show in the checklist in plain words; sign-in asks for Pub/Sub', async () => {
  const a = await openPanel(env, { settings: withDoorbell(fullSettings(NIGHT)), fail: new Set(['pubsub-404']) });
  await waitFor(() => a.page.evaluate(() => true), 'load');
  await a.page.locator('#clock .gear').click();
  await a.page.locator('#settings').getByText(/Doorbell alerts \(pop-up and chime\) · Google can't find the doorbell subscription/).waitFor({ timeout: 10000 });
  await a.ctx.close();

  // Set up but signed in before: sign in again; the sign-in asks for Pub/Sub.
  const s = fullSettings(NIGHT);
  s.google.doorbellSub = SUB;
  const b = await openPanel(env, { settings: s, userAgent: UA.chrome });
  await b.page.locator('#clock .gear').click();
  const set = b.page.locator('#settings');
  await set.getByText('Doorbell alerts (pop-up and chime) · sign in to Google again to allow it').waitFor();
  await set.getByText('Signed in, but not for doorbell alerts yet').waitFor();
  assert.equal(b.calls.pubsub.pulls, 0, 'no pulls without permission');
  await set.getByRole('button', { name: 'Sign in with Google' }).click();
  await b.page.locator('.toast').first().waitFor();
  const auth = new URL(b.calls.find((c) => c.service === 'google-auth').url);
  assert.match(auth.searchParams.get('scope'), /auth\/pubsub/);
  await b.ctx.close();

  // A pasted topic instead of the subscription.
  const c = await openPanel(env, { settings: fullSettings(NIGHT) });
  await c.page.locator('#clock .gear').click();
  await c.page.locator('#settings').getByLabel('Doorbell subscription (optional)').fill('projects/home-panel-123/topics/nest-events');
  await c.page.locator('#settings').getByText("That's the topic.").first().waitFor();
  await c.ctx.close();
});

test('Test chime and Test doorbell buttons; a hidden panel doesn\'t take presses', async () => {
  const { ctx, page, calls } = await openPanel(env, { now: NIGHT, settings: withDoorbell(), initScript: nightAndSound });
  await waitFor(() => calls.pubsub.pulls >= 1, 'a pull');
  await page.locator('#night').click(); // wake it
  await page.locator('#clock .gear').click();
  const set = page.locator('#settings');
  await set.getByRole('button', { name: 'Test chime' }).click();
  await set.getByText('Ding-dong!').waitFor();
  assert.equal(await page.evaluate(() => window.__notes), 8);
  await set.getByRole('button', { name: 'Test doorbell' }).click();
  await page.locator('#cam.expanded.ring').waitFor();
  await page.locator('#cam .cam-bar .close').click();
  await waitFor(async () => !(await page.locator('#cam').getAttribute('class')).includes('ring'), 'closed');

  // Another app in front: the panel stops pulling, so it can't swallow a press.
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(600);
  const n = calls.pubsub.pulls;
  await page.waitForTimeout(3000);
  assert.ok(calls.pubsub.pulls <= n + 1, `no new pulls while hidden (${n} → ${calls.pubsub.pulls})`);
  await ctx.close();
});
