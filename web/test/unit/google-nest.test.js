import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Google, authUrl, redirectUri, TOKEN_URLS, SCOPE_CAL, SCOPE_SDM, SCOPE_TASKS, explainGoogleError } from '../../js/google.js';
import { HttpError } from '../../js/util.js';
import { parseThermostat, parseCamera, deviceName, LiveStream, isCamera, isThermostat } from '../../js/nest.js';
import { loadSettings } from '../../js/config.js';

const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const loc = (href) => { const u = new URL(href); return { origin: u.origin, pathname: u.pathname, search: u.search, hash: u.hash, assign(v) { this.assigned = v; } }; };

test('redirectUri and authUrl', () => {
  assert.equal(redirectUri(loc('https://me.github.io/Home-Dashboard-/index.html?code=1#x')), 'https://me.github.io/Home-Dashboard-/');
  const withNest = new URL(authUrl({ clientId: 'c', projectId: 'p-1' }, 'https://r/', 'st'));
  assert.equal(withNest.origin + withNest.pathname, 'https://nestservices.google.com/partnerconnections/p-1/auth');
  assert.equal(withNest.searchParams.get('scope'), `${SCOPE_SDM} ${SCOPE_CAL} ${SCOPE_TASKS}`);
  assert.equal(withNest.searchParams.get('access_type'), 'offline');
  assert.equal(withNest.searchParams.get('prompt'), 'consent');
  const calOnly = new URL(authUrl({ clientId: 'c', projectId: '' }, 'https://r/', 'st'));
  assert.equal(calOnly.host, 'accounts.google.com');
  assert.equal(calOnly.searchParams.get('scope'), `${SCOPE_CAL} ${SCOPE_TASKS}`);
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

// Google's 403 bodies, as the APIs send them.
const serviceDisabled = (activationUrl = 'https://console.developers.google.com/apis/api/tasks.googleapis.com/overview?project=123') => ({ error: {
  code: 403, status: 'PERMISSION_DENIED',
  message: 'Google Tasks API has not been used in project 123 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/tasks.googleapis.com/overview?project=123 then retry.',
  errors: [{ message: '…', domain: 'usageLimits', reason: 'accessNotConfigured', extendedHelp: 'https://console.developers.google.com' }],
  details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED', domain: 'googleapis.com',
    metadata: { service: 'tasks.googleapis.com', consumer: 'projects/123', serviceTitle: 'Google Tasks API', activationUrl } }],
} });
const scopeMissing = { error: {
  code: 403, status: 'PERMISSION_DENIED', message: 'Request had insufficient authentication scopes.',
  errors: [{ message: 'Insufficient Permission', domain: 'global', reason: 'insufficientPermissions' }],
  details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', domain: 'googleapis.com',
    metadata: { service: 'tasks.googleapis.com', method: 'google.tasks.v1.TasksService.ListTaskLists' } }],
} };
const TASKS_URL = 'https://www.googleapis.com/tasks/v1/users/@me/lists?maxResults=100';
const http403 = (body) => new HttpError(403, `403 ${body.error.message}`, body);

test('explainGoogleError: an API switched off in the Cloud project, with a link that turns it on', () => {
  const e = explainGoogleError(http403(serviceDisabled()), TASKS_URL);
  assert.match(e.message, /Google Tasks API is switched off in Google Cloud project 123 \(the project your client ID belongs to\)/);
  assert.match(e.message, /allow a few minutes \(up to 5\)/);
  assert.match(e.message, /Still refused after 10 minutes\? It was switched on in a different project: use the link, which opens project 123\./);
  assert.equal(e.status, 403);
  assert.deepEqual(e.link, { href: 'https://console.developers.google.com/apis/api/tasks.googleapis.com/overview?project=123', text: 'Turn on the Google Tasks API' });
  // A link anywhere but Google's console is never offered; the plain library page is.
  const odd = explainGoogleError(http403(serviceDisabled('https://example.com/phish')), TASKS_URL);
  assert.equal(odd.link.href, 'https://console.cloud.google.com/apis/library/tasks.googleapis.com?project=123');
  // Older error shape (message only), recognised by its wording and the API's address.
  const bare = explainGoogleError(http403({ error: { code: 403, message: 'Google Calendar API has not been used in project 9 before or it is disabled.' } }), 'https://www.googleapis.com/calendar/v3/users/me/calendarList');
  assert.match(bare.message, /Google Calendar API is switched off in Google Cloud project 9 /);
  assert.equal(bare.link.href, 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=9');
  // No project anywhere in the error: says which project to use instead, and the link opens the plain library page.
  const none = explainGoogleError(http403({ error: { code: 403, message: 'Google Tasks API has not been used in project before or it is disabled.', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED', metadata: { service: 'tasks.googleapis.com', activationUrl: 'https://console.developers.google.com/apis/api/tasks.googleapis.com/overview' } }] } }), TASKS_URL);
  assert.match(none.message, /switched off in the Google Cloud project your client ID belongs to\..*Credentials page lists your client ID/);
  assert.equal(none.link.href, 'https://console.developers.google.com/apis/api/tasks.googleapis.com/overview');
  // Only a plain project number or ID is ever repeated from the error.
  const weird = explainGoogleError(http403({ error: { code: 403, message: 'x', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED', metadata: { service: 'tasks.googleapis.com', consumer: 'projects/<b>hi</b>' } }] } }), TASKS_URL);
  assert.doesNotMatch(weird.message, /<b>/);
  assert.equal(weird.link.href, 'https://console.cloud.google.com/apis/library/tasks.googleapis.com');
});

test('explainGoogleError: a sign-in without the permission; other errors pass through', () => {
  assert.match(explainGoogleError(http403(scopeMissing), TASKS_URL).message, /sign-in doesn't allow Google Tasks \(the shopping list\)\. In Chrome, ⚙ → Sign in with Google again, and make sure every box is ticked/);
  const cal = explainGoogleError(http403({ error: { code: 403, message: 'Request had insufficient authentication scopes.' } }), 'https://www.googleapis.com/calendar/v3/calendars/x/events');
  assert.match(cal.message, /doesn't allow Google Calendar\./);
  const nest = explainGoogleError(http403({ error: { code: 403, message: 'Request had insufficient authentication scopes.' } }), 'https://smartdevicemanagement.googleapis.com/v1/enterprises/p/devices');
  assert.match(nest.message, /doesn't allow your Nest devices/);
  const other = http403({ error: { code: 403, message: 'The caller does not have permission' } });
  assert.equal(explainGoogleError(other, TASKS_URL), other);
  const notFound = new HttpError(404, '404 Not Found', null);
  assert.equal(explainGoogleError(notFound, TASKS_URL), notFound);
  const text403 = new HttpError(403, '403 Forbidden', '<html>Forbidden</html>');
  assert.equal(explainGoogleError(text403, TASKS_URL), text403);
  const net = new TypeError('Failed to fetch');
  assert.equal(explainGoogleError(net, TASKS_URL), net);
});

test('Google.api explains a 403; missingScopes lists what a sign-in left out', async () => {
  const s = loadSettings(memStore());
  Object.assign(s.google, { clientId: 'c', clientSecret: 'sec', refreshToken: 'rt', projectId: 'p', scopes: `${SCOPE_SDM} ${SCOPE_CAL}` });
  const g = new Google(s, () => {});
  fakeFetch((url) => (TOKEN_URLS.includes(url) ? { body: { access_token: 'at', expires_in: 3600 } } : { status: 403, body: serviceDisabled() }));
  await assert.rejects(g.api(TASKS_URL), (e) => /switched off/.test(e.message) && e.link && e.status === 403);
  // A 401 gets one retry with a fresh token: success after it is returned, and a 403 after it is explained.
  let n = 0;
  const calls = fakeFetch((url) => {
    if (TOKEN_URLS.includes(url)) return { body: { access_token: `at-${++n}`, expires_in: 3600 } };
    return calls.filter((c) => !TOKEN_URLS.includes(c.url)).length === 1 ? { status: 401, body: { error: { code: 401, message: 'expired' } } } : { body: { items: [] } };
  });
  g.access = null;
  assert.deepEqual(await g.api(TASKS_URL), { items: [] });
  assert.equal(calls.filter((c) => TOKEN_URLS.includes(c.url)).length, 2, 'a fresh token for the retry');
  const calls2 = fakeFetch((url) => {
    if (TOKEN_URLS.includes(url)) return { body: { access_token: 'at-x', expires_in: 3600 } };
    return calls2.filter((c) => !TOKEN_URLS.includes(c.url)).length === 1 ? { status: 401, body: { error: { code: 401, message: 'expired' } } } : { status: 403, body: scopeMissing };
  });
  await assert.rejects(g.api(TASKS_URL), /doesn't allow Google Tasks/);
  // Two 401s in a row: Google's own error, unchanged.
  fakeFetch((url) => (TOKEN_URLS.includes(url) ? { body: { access_token: 'at-y', expires_in: 3600 } } : { status: 401, body: { error: { code: 401, message: 'Invalid Credentials' } } }));
  await assert.rejects(g.api(TASKS_URL), (e) => e.status === 401 && /Invalid Credentials/.test(e.message));
  assert.deepEqual(g.missingScopes(), ['Google Tasks (the shopping list)']);
  s.google.scopes = SCOPE_TASKS;
  assert.deepEqual(g.missingScopes(), ['your Nest devices', 'Google Calendar']);
  s.google.projectId = '';
  assert.deepEqual(g.missingScopes(), ['Google Calendar']);
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
