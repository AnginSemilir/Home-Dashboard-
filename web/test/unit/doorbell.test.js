import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DoorbellListener, checkSubName, decodeData, parseChime, explainDoorbellError, CHIME, PUBSUB, PULL_TIMEOUT_MS } from '../../js/doorbell.js';
import { Chime } from '../../js/chime.js';
import { authUrl, Google, SCOPE_SDM, SCOPE_CAL, SCOPE_TASKS, SCOPE_PUBSUB } from '../../js/google.js';
import { HttpError } from '../../js/util.js';
import { loadSettings } from '../../js/config.js';

const NOW = Date.parse('2026-09-27T21:15:00Z');
const DEV = 'enterprises/proj-123/devices/DOORBELL1';
const SUB = 'projects/home-panel-123/subscriptions/panel-doorbell';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

/** A doorbell press as Google sends it (shape from google-nest-sdm's test fixtures). */
const chimeEvent = ({ ago = 2000, state = 'STARTED', eventId = 'chime-1', session = 'sess-1', device = DEV, extra = {} } = {}) => ({
  eventId: `top-${Math.random()}`, timestamp: new Date(NOW - ago).toISOString(), userId: 'u1',
  eventThreadId: 'thread-1', eventThreadState: state, resourceGroup: [device],
  resourceUpdate: { name: device, events: { [CHIME]: { eventSessionId: session, eventId }, ...extra } },
});
const personEvent = () => ({ timestamp: new Date(NOW - 1000).toISOString(), resourceUpdate: { name: DEV, events: { 'sdm.devices.events.CameraPerson.Person': { eventSessionId: 's', eventId: 'p' } } } });
const traitsEvent = () => ({ timestamp: new Date(NOW - 1000).toISOString(), resourceUpdate: { name: 'enterprises/proj-123/devices/T1', traits: { 'sdm.devices.traits.Temperature': { ambientTemperatureCelsius: 20 } } } });

test('checkSubName: the full subscription name, not the topic or the Device Access ID', () => {
  assert.equal(checkSubName(SUB, 'proj-123'), '');
  assert.equal(checkSubName('  ' + SUB + ' ', 'proj-123'), '');
  assert.equal(checkSubName('', 'proj-123'), '');
  assert.match(checkSubName('projects/home-panel-123/topics/nest-events'), /That's the topic/);
  assert.match(checkSubName('panel-doorbell'), /full name/);
  assert.match(checkSubName('projects/a/subscriptions/b?x=1'), /full name/);
  assert.match(checkSubName('projects/proj-123/subscriptions/x', 'proj-123'), /Device Access project ID/);
});

test('decodeData: base64 UTF-8 JSON (device names with accents survive)', () => {
  assert.deepEqual(decodeData(b64({ name: "Porte d'entrée" })), { name: "Porte d'entrée" });
  assert.throws(() => decodeData('%%%'));
});

test('parseChime: only fresh doorbell presses from this project; one key per press', () => {
  const opts = { projectId: 'proj-123', now: NOW };
  const a = parseChime(chimeEvent(), opts);
  assert.equal(a.device, DEV);
  const b = parseChime(chimeEvent({ state: 'UPDATED', extra: { 'sdm.devices.events.CameraClipPreview.ClipPreview': { eventSessionId: 'sess-1', previewUrl: 'x' } } }), opts);
  assert.equal(b.key, a.key, 'the same press repeated in an update');
  assert.notEqual(parseChime(chimeEvent({ eventId: 'chime-2' }), opts).key, a.key, 'a second press rings again');
  assert.equal(parseChime({ ...chimeEvent(), resourceUpdate: { name: DEV, events: { 'sdm.devices.events.CameraClipPreview.ClipPreview': {} } } }, opts), null);
  assert.equal(parseChime(personEvent(), opts), null);
  assert.equal(parseChime(traitsEvent(), opts), null);
  assert.equal(parseChime({ relationUpdate: { type: 'CREATED' } }, opts), null);
  assert.equal(parseChime(chimeEvent({ device: 'enterprises/other/devices/D' }), opts), null);
  assert.deepEqual(parseChime(chimeEvent({ ago: 61e3 }), opts), { stale: true });
  assert.equal(parseChime(chimeEvent({ ago: 59e3 }), opts).device, DEV);
  assert.equal(parseChime(chimeEvent({ ago: -30e3 }), opts).device, DEV, 'a clock a little ahead is fine');
  const nanos = { ...chimeEvent(), timestamp: '2026-09-27T21:14:58.123456789Z' };
  assert.equal(parseChime(nanos, opts).device, DEV);
  const noStamp = { ...chimeEvent(), timestamp: undefined };
  assert.equal(parseChime(noStamp, { ...opts, publishTime: new Date(NOW - 1000).toISOString() }).device, DEV);
});

test('sign-in asks for Pub/Sub only when a doorbell subscription is set', () => {
  const scope = (g) => new URL(authUrl({ clientId: 'c', ...g }, 'https://r/', 's')).searchParams.get('scope');
  assert.equal(scope({ projectId: 'p', doorbellSub: SUB }), `${SCOPE_SDM} ${SCOPE_PUBSUB} ${SCOPE_CAL} ${SCOPE_TASKS}`);
  assert.equal(scope({ projectId: 'p', doorbellSub: '' }), `${SCOPE_SDM} ${SCOPE_CAL} ${SCOPE_TASKS}`);
  assert.equal(scope({ projectId: '', doorbellSub: SUB }), `${SCOPE_CAL} ${SCOPE_TASKS}`);
  const s = loadSettings(memStore());
  Object.assign(s.google, { projectId: 'p', refreshToken: 'rt', scopes: `${SCOPE_SDM} ${SCOPE_CAL} ${SCOPE_TASKS}`, doorbellSub: SUB });
  const g = new Google(s, () => {});
  assert.deepEqual(g.missingScopes(), ['doorbell alerts']);
  assert.equal(g.hasPubsub, false);
  s.google.scopes += ` ${SCOPE_PUBSUB}`;
  assert.equal(g.hasPubsub, true);
  assert.deepEqual(g.missingScopes(), []);
});

test('explainDoorbellError: plain words for each setup problem', () => {
  const e = (status, error) => new HttpError(status, `${status}`, { error });
  assert.match(explainDoorbellError(e(404, { code: 404, message: 'Resource not found', status: 'NOT_FOUND' }), SUB).message, /can't find the doorbell subscription "projects\/home-panel-123/);
  assert.match(explainDoorbellError(e(403, { code: 403, message: 'Cloud Pub/Sub API has not been used in project 555 before or it is disabled.', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED', metadata: { service: 'pubsub.googleapis.com', consumer: 'projects/555' } }] }), SUB).message, /Cloud Pub\/Sub API is switched off in Google Cloud project 555/);
  assert.match(explainDoorbellError(e(403, { code: 403, message: 'Request had insufficient authentication scopes.' }), SUB).message, /doesn't allow doorbell alerts/);
  assert.match(explainDoorbellError(e(403, { code: 403, message: 'User not authorized to perform this action.', status: 'PERMISSION_DENIED' }), SUB).message, /Pub\/Sub Subscriber role/);
  assert.match(explainDoorbellError(e(403, { code: 403, message: 'This API method requires billing to be enabled.', details: [{ reason: 'BILLING_DISABLED' }] }), SUB).message, /billing is off/);
  assert.match(explainDoorbellError(e(400, { code: 400, message: 'Invalid resource name' }), SUB).message, /name is wrong/);
});

/** A listener with fake Google, clock and sleep. `replies` is used in order; then pulls wait for ever. */
function harness(replies, { storage = memStore() } = {}) {
  const calls = [], sleeps = [], rings = [], statuses = [];
  let t = NOW;
  const google = {
    api: async (url, opts, timeout) => {
      calls.push({ url, body: opts?.body, timeout, order: calls.length });
      if (url.endsWith(':acknowledge')) return {};
      if (!replies.length) return new Promise(() => {});
      const r = replies.shift();
      if (r instanceof Error) throw r;
      return r;
    },
  };
  let devices = 0;
  const l = new DoorbellListener({
    google, nest: { devices: async () => { devices++; return []; } }, sub: SUB, projectId: 'proj-123', loops: 1, storage,
    onRing: (x) => rings.push({ ...x, order: calls.length }), onStatus: (s) => statuses.push(s),
    now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; },
  });
  const settle = () => new Promise((r) => setTimeout(r, 20));
  return { l, calls, sleeps, rings, statuses, settle, devices: () => devices, advance: (ms) => { t += ms; } };
}
const pulled = (...events) => ({ receivedMessages: events.map((ev, i) => ({ ackId: `a${i}`, message: { data: b64(ev), publishTime: ev.timestamp } })) });

test('listener: pulls, rings once per press, then acknowledges every message', async () => {
  const h = harness([pulled(chimeEvent(), traitsEvent()), pulled(chimeEvent({ state: 'UPDATED' })), pulled(chimeEvent({ ago: 120e3, eventId: 'old' }), personEvent())]);
  h.l.start();
  await h.settle();
  assert.equal(h.devices(), 1, 'the device list that starts Google sending events');
  const pulls = h.calls.filter((c) => c.url.endsWith(':pull'));
  assert.equal(pulls[0].url, `${PUBSUB}/${SUB}:pull`);
  assert.equal(pulls[0].body, '{"maxMessages":10}');
  assert.equal(pulls[0].timeout, PULL_TIMEOUT_MS);
  assert.equal(h.rings.length, 1, 'the update and the old press and the person don\'t ring');
  assert.equal(h.rings[0].device, DEV);
  const acks = h.calls.filter((c) => c.url.endsWith(':acknowledge')).map((c) => JSON.parse(c.body).ackIds);
  assert.deepEqual(acks, [['a0', 'a1'], ['a0'], ['a0', 'a1']], 'everything acknowledged');
  const firstAck = h.calls.find((c) => c.url.endsWith(':acknowledge'));
  assert.ok(h.rings[0].order <= firstAck.order, 'rings before acknowledging');
  assert.deepEqual(h.statuses.at(-1).ok, true);
  h.l.stop();
});

test('listener: an empty answer waits 2 s; network trouble backs off; setup problems wait 10 min', async () => {
  const h = harness([{}, new TypeError('Failed to fetch'), new HttpError(503, '503'), new HttpError(503, '503'), {}, new HttpError(404, '404', { error: { code: 404 } })]);
  h.l.start();
  await h.settle();
  assert.deepEqual(h.sleeps.slice(0, 5), [0, 2000, 2000, 4000, 8000], 'first loop starts at once; 2 s floor; then 2, 4, 8 s');
  assert.equal(h.sleeps.at(-1), 10 * 60e3);
  const err = h.statuses.find((s) => s.error);
  assert.match(err.error, /can't find the doorbell subscription/);
  // Network trouble alone only shows after 2 minutes of it.
  assert.equal(h.statuses.filter((s) => s.error && /reach Google/.test(s.error)).length, 0);
  h.l.stop();
});

test('listener: our own time limit on an empty pull just pulls again; stop() drops a late answer', async () => {
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  const h = harness([abort]);
  h.l.start();
  await h.settle();
  assert.equal(h.calls.filter((c) => c.url.endsWith(':pull')).length, 2, 'pulled again straight away');
  assert.equal(h.statuses.length, 0, 'not an error');
  h.l.stop();

  let answer;
  const g = { api: (url) => (url.endsWith(':pull') ? new Promise((r) => { answer = r; }) : Promise.resolve({})) };
  const rings = [];
  const l = new DoorbellListener({ google: g, sub: SUB, projectId: 'proj-123', loops: 1, storage: memStore(), onRing: (x) => rings.push(x), now: () => NOW, sleep: async () => {} });
  l.start();
  await new Promise((r) => setTimeout(r, 10));
  l.stop();
  answer(pulled(chimeEvent()));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(rings.length, 0, 'a press that arrives after stopping is left for Google to offer again');
});

test('listener: a press already rung isn\'t rung again after a reload (kept in sessionStorage)', async () => {
  const storage = memStore();
  const a = harness([pulled(chimeEvent())], { storage });
  a.l.start();
  await a.settle();
  a.l.stop();
  const b = harness([pulled(chimeEvent({ state: 'UPDATED' }))], { storage });
  b.l.start();
  await b.settle();
  assert.equal(a.rings.length + b.rings.length, 1);
  b.l.stop();
});

/** A stand-in for the browser's audio. */
function fakeAudio({ state = 'running', resumes = true } = {}) {
  const starts = [], listeners = {};
  class Ctx {
    constructor() { this.state = state; this.currentTime = 10; this.destination = {}; this.suspended = 0; }
    resume() { if (resumes === 'never') return new Promise(() => {}); if (resumes) this.state = 'running'; return Promise.resolve(); }
    suspend() { this.suspended++; return Promise.resolve(); }
    addEventListener() {}
    createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, start: (t) => starts.push(t), stop() {} }; }
  }
  return { win: { AudioContext: Ctx, addEventListener: (ev, fn) => { listeners[ev] = fn; } }, starts, listeners };
}

test('chime: a two-note ding-dong three times (five overtones each); not again within 5 s; test() always plays', async () => {
  const a = fakeAudio();
  let t = 1000;
  const c = new Chime({ win: a.win, now: () => t });
  assert.equal(c.ready, true, 'kiosk / installed app: sound allowed without a tap');
  assert.equal(await c.ring(), true);
  assert.equal(a.starts.length, 30, '2 notes × 5 overtones × 3 times');
  assert.deepEqual([...a.starts].sort((x, y) => x - y), a.starts.slice().sort((x, y) => x - y));
  t += 3000;
  assert.equal(await c.ring(), true);
  assert.equal(a.starts.length, 30, 'rang 3 s ago: no second chime');
  assert.equal(await c.test(), true);
  assert.equal(a.starts.length, 60);
});

test('chime: blocked until a tap (pointerup, not pointerdown); a resume that never answers gives up', async () => {
  const a = fakeAudio({ state: 'suspended', resumes: false });
  const c = new Chime({ win: a.win });
  assert.equal(c.ready, false);
  assert.equal(await c.ring(), false);
  assert.equal(a.listeners.pointerdown, undefined, 'a finger down alone doesn\'t count');
  c.ctx.state = 'running'; // what a real tap's resume() does
  a.listeners.pointerup();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(c.ready, true);

  const n = fakeAudio({ state: 'interrupted', resumes: 'never' });
  const c2 = new Chime({ win: n.win });
  const t0 = Date.now();
  assert.equal(await c2.ring(), false);
  assert.ok(Date.now() - t0 < 900, 'gave up after about half a second');
  assert.equal(new Chime({ win: {} }).ready, false, 'no Web Audio at all');
});
