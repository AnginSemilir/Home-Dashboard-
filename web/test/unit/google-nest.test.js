import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Google, authUrl, redirectUri, TOKEN_URLS, SCOPE_CAL, SCOPE_SDM } from '../../js/google.js';
import { parseThermostat, parseCamera, deviceName, LiveStream, isCamera, isThermostat } from '../../js/nest.js';
import { loadSettings } from '../../js/config.js';

const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const loc = (href) => { const u = new URL(href); return { origin: u.origin, pathname: u.pathname, search: u.search, hash: u.hash, assign(v) { this.assigned = v; } }; };

test('redirectUri and authUrl', () => {
  assert.equal(redirectUri(loc('https://me.github.io/Home-Dashboard-/index.html?code=1#x')), 'https://me.github.io/Home-Dashboard-/');
  const withNest = new URL(authUrl({ clientId: 'c', projectId: 'p-1' }, 'https://r/', 'st'));
  assert.equal(withNest.origin + withNest.pathname, 'https://nestservices.google.com/partnerconnections/p-1/auth');
  assert.equal(withNest.searchParams.get('scope'), `${SCOPE_SDM} ${SCOPE_CAL}`);
  assert.equal(withNest.searchParams.get('access_type'), 'offline');
  assert.equal(withNest.searchParams.get('prompt'), 'consent');
  const calOnly = new URL(authUrl({ clientId: 'c', projectId: '' }, 'https://r/', 'st'));
  assert.equal(calOnly.host, 'accounts.google.com');
  assert.equal(calOnly.searchParams.get('scope'), SCOPE_CAL);
});

function fakeFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    const r = await handler(url, opts);
    if (r === 'network') throw new TypeError('Failed to fetch');
    return { ok: (r.status || 200) < 400, status: r.status || 200, statusText: '', text: async () => JSON.stringify(r.body) };
  };
  return calls;
}

test('handleRedirect: rejects a wrong state, exchanges a good code and stores the refresh token', async () => {
  const s = loadSettings(memStore());
  Object.assign(s.google, { clientId: 'c', clientSecret: 'sec' });
  let saved = 0;
  const g = new Google(s, () => saved++);
  const session = memStore();
  const hist = { replaceState(_a, _b, u) { this.url = u; } };
  session.setItem('wallpanel.oauth.state', 'good');
  assert.match(await g.handleRedirect(loc('https://me.github.io/p/?code=abc&state=bad'), session, hist), /state did not match/);
  assert.equal(hist.url, 'https://me.github.io/p/');

  session.setItem('wallpanel.oauth.state', 'good');
  const calls = fakeFetch(() => ({ body: { access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: SCOPE_SDM } }));
  assert.equal(await g.handleRedirect(loc('https://me.github.io/p/?code=abc&state=good'), session, hist), 'signed-in');
  assert.equal(s.google.refreshToken, 'rt');
  assert.equal(saved, 1);
  const body = new URLSearchParams(calls[0].opts.body);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('redirect_uri'), 'https://me.github.io/p/');
  assert.equal(calls[0].opts.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(await g.handleRedirect(loc('https://me.github.io/p/'), session, hist), null);
});

test('accessToken: refreshes, caches, falls back to the second endpoint on network error, explains invalid_grant', async () => {
  const s = loadSettings(memStore());
  Object.assign(s.google, { clientId: 'c', clientSecret: 'sec', refreshToken: 'rt' });
  const g = new Google(s, () => {});
  let first = true;
  const calls = fakeFetch((url) => {
    if (url === TOKEN_URLS[0] && first) { first = false; return 'network'; }
    return { body: { access_token: 'at-2', expires_in: 3600 } };
  });
  assert.equal(await g.accessToken(), 'at-2');
  assert.deepEqual(calls.map((c) => c.url), TOKEN_URLS);
  assert.equal(await g.accessToken(), 'at-2');
  assert.equal(calls.length, 2, 'cached');
  fakeFetch(() => ({ status: 400, body: { error: 'invalid_grant' } }));
  await assert.rejects(g.accessToken(true), /sign in again/);
});

const thermo = (traits, extra = {}) => ({ name: 'enterprises/p/devices/T', type: 'sdm.devices.types.THERMOSTAT', traits, ...extra });

test('parseThermostat / parseCamera / deviceName', () => {
  const t = parseThermostat(thermo({
    'sdm.devices.traits.Temperature': { ambientTemperatureCelsius: 20.5 },
    'sdm.devices.traits.ThermostatTemperatureSetpoint': { heatCelsius: 21 },
    'sdm.devices.traits.ThermostatHvac': { status: 'HEATING' },
    'sdm.devices.traits.ThermostatEco': { mode: 'OFF' },
  }, { parentRelations: [{ displayName: 'Hallway' }] }));
  assert.deepEqual([t.name, t.tempC, t.setpointC, t.hvac, t.eco], ['Hallway', 20.5, 21, 'HEATING', false]);
  const eco = parseThermostat(thermo({ 'sdm.devices.traits.ThermostatEco': { mode: 'MANUAL_ECO', heatCelsius: 16 }, 'sdm.devices.traits.ThermostatTemperatureSetpoint': { heatCelsius: 21 } }));
  assert.equal(eco.setpointC, 16);
  assert.equal(eco.eco, true);
  const cam = { type: 'sdm.devices.types.CAMERA', traits: { 'sdm.devices.traits.Info': { customName: 'Front door' }, 'sdm.devices.traits.CameraLiveStream': { supportedProtocols: ['WEB_RTC'] } } };
  assert.deepEqual(parseCamera(cam), { name: 'Front door', webrtc: true, rtsp: false, doorbell: false });
  assert.equal(isCamera(cam), true);
  assert.equal(isThermostat(cam), false);
  assert.equal(deviceName({ type: 'sdm.devices.types.DOORBELL' }), 'doorbell');
});

class FakeRTC {
  constructor() { this.tx = []; this.dc = []; this.listeners = {}; this.connectionState = 'new'; FakeRTC.last = this; }
  addTransceiver(kind, opts) { this.tx.push([kind, opts.direction]); }
  createDataChannel(n) { this.dc.push(n); }
  addEventListener(n, f) { this.listeners[n] = f; }
  async createOffer() { return { type: 'offer', sdp: 'v=0\r\noffer' }; }
  async setLocalDescription() {}
  async setRemoteDescription(d) { this.remote = d; }
  close() { this.closed = true; }
}
globalThis.MediaStream ??= class { addTrack() {} };
/** A fake track; muted ones "unmute" when the test calls .unmute(). */
function videoTrack(muted = true, kind = 'video') {
  const l = {};
  return { kind, muted, addEventListener: (n, f) => { l[n] = f; }, unmute() { this.muted = false; l.unmute?.(); } };
}

function fakeNest() {
  const cmds = [];
  return { cmds, command: async (id, command, params) => { cmds.push({ id, command, params }); return command.endsWith('Generate') || command.endsWith('GenerateWebRtcStream') ? { answerSdp: 'v=0\r\nanswer', mediaSessionId: 'S1', expiresAt: new Date(Date.now() + 300e3).toISOString() } : {}; } };
}

test('LiveStream (battery): audio+video+data offer, answer newline fix, stops itself after 5 minutes', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.parse('2026-09-25T09:00:00Z') });
  try {
    const nest = fakeNest();
    const states = [];
    const ls = new LiveStream(nest, 'dev/CAM', { battery: true, RTC: FakeRTC, onState: (s) => states.push(s) });
    await ls.start({});
    FakeRTC.last.listeners.track({ track: videoTrack(false) });
    assert.deepEqual(states, ['connecting', 'live']);
    assert.deepEqual(FakeRTC.last.tx, [['audio', 'recvonly'], ['video', 'recvonly']]);
    assert.equal(FakeRTC.last.dc.length, 1);
    assert.equal(nest.cmds[0].command, 'sdm.devices.commands.CameraLiveStream.GenerateWebRtcStream');
    assert.equal(nest.cmds[0].params.offerSdp, 'v=0\r\noffer');
    assert.equal(FakeRTC.last.remote.sdp, 'v=0\r\nanswer\n');
    mock.timers.tick(299e3);
    assert.equal(nest.cmds.length, 1);
    mock.timers.tick(2e3);
    await new Promise((r) => setImmediate(r));
    assert.equal(nest.cmds[1].command, 'sdm.devices.commands.CameraLiveStream.StopWebRtcStream');
    assert.deepEqual(nest.cmds[1].params, { mediaSessionId: 'S1' });
    assert.equal(FakeRTC.last.closed, true);
    assert.ok(states.includes('ended'));
  } finally {
    mock.timers.reset();
  }
});

test('LiveStream (wired): extends every 4 minutes and never stops by itself', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.parse('2026-09-25T09:00:00Z') });
  try {
    const nest = fakeNest();
    const ls = new LiveStream(nest, 'dev/CAM', { battery: false, RTC: FakeRTC });
    await ls.start({});
    FakeRTC.last.listeners.track({ track: videoTrack(false) });
    mock.timers.tick(8 * 60e3 + 1000);
    await new Promise((r) => setImmediate(r));
    assert.equal(nest.cmds.filter((c) => c.command.endsWith('ExtendWebRtcStream')).length, 2);
    assert.equal(nest.cmds.some((c) => c.command.endsWith('StopWebRtcStream')), false);
    await ls.stop();
    assert.equal(nest.cmds.at(-1).command, 'sdm.devices.commands.CameraLiveStream.StopWebRtcStream');
  } finally {
    mock.timers.reset();
  }
});

test('LiveStream: gives up after 30 s if no video arrives', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.parse('2026-09-25T09:00:00Z') });
  try {
    const nest = fakeNest();
    const states = [];
    const ls = new LiveStream(nest, 'dev/CAM', { battery: true, RTC: FakeRTC, onState: (s) => states.push(s) });
    await ls.start({});
    mock.timers.tick(29e3);
    assert.equal(nest.cmds.length, 1);
    mock.timers.tick(2e3);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(states, ['connecting', 'timeout', 'ended']);
    assert.equal(nest.cmds[1].command, 'sdm.devices.commands.CameraLiveStream.StopWebRtcStream');
  } finally {
    mock.timers.reset();
  }
});

test('LiveStream: "live" only once video actually flows (track unmutes), not when the answer is applied', async () => {
  const nest = fakeNest();
  const states = [];
  const ls = new LiveStream(nest, 'dev/CAM', { battery: true, RTC: FakeRTC, onState: (s) => states.push(s) });
  await ls.start({});
  const audio = videoTrack(false, 'audio');
  const video = videoTrack(true);
  FakeRTC.last.listeners.track({ track: audio });
  FakeRTC.last.listeners.track({ track: video });
  assert.deepEqual(states, ['connecting']);
  video.unmute();
  assert.deepEqual(states, ['connecting', 'live']);
  await ls.stop();
});

test('LiveStream: closed while Google is still setting up: no error, and the new session is stopped', async () => {
  let release;
  const cmds = [];
  const nest = {
    command: async (id, command, params) => {
      cmds.push({ command, params });
      if (command.endsWith('GenerateWebRtcStream')) {
        await new Promise((r) => { release = r; });
        return { answerSdp: 'v=0', mediaSessionId: 'S9', expiresAt: new Date(Date.now() + 300e3).toISOString() };
      }
      return {};
    },
  };
  const states = [];
  const ls = new LiveStream(nest, 'dev/CAM', { battery: true, RTC: FakeRTC, onState: (s) => states.push(s) });
  const started = ls.start({});
  await new Promise((r) => setImmediate(r));
  await ls.stop();
  await ls.stop(); // twice is fine
  release();
  assert.equal(await started, null);
  assert.equal(FakeRTC.last.remote, undefined, 'answer never applied to the closed connection');
  assert.deepEqual(cmds.map((c) => c.command.split('.').pop()), ['GenerateWebRtcStream', 'StopWebRtcStream']);
  assert.deepEqual(cmds[1].params, { mediaSessionId: 'S9' });
  assert.deepEqual(states, ['connecting', 'ended']);
});

test('LiveStream: a failed connection stops the stream properly', async () => {
  const nest = fakeNest();
  const states = [];
  const ls = new LiveStream(nest, 'dev/CAM', { battery: false, RTC: FakeRTC, onState: (s) => states.push(s) });
  await ls.start({});
  const pc = FakeRTC.last;
  pc.connectionState = 'failed';
  pc.listeners.connectionstatechange();
  await new Promise((r) => setImmediate(r));
  assert.equal(pc.closed, true);
  assert.ok(nest.cmds.some((c) => c.command.endsWith('StopWebRtcStream')));
  assert.deepEqual(states, ['connecting', 'ended']);
});
