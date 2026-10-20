import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chime } from '../../js/chime.js';
import { SOUNDS, soundById } from '../../js/chime-sounds.js';
import { checkPlayable, addTrack, trackName, MAX_BYTES } from '../../js/tracks.js';
import { fakeAudio } from '../support/fake-audio.js';

const T0 = 10 + 0.1; // the fake's clock, plus the lead before a running context's sound starts

test('every built-in sound plays notes only inside its own length, never beyond 12 seconds, and a wrong id is the classic', async () => {
  assert.deepEqual(SOUNDS.map((s) => s.id), ['classic', 'cuckoo', 'musicbox', 'windchimes', 'arcade', 'telephone', 'fanfare']);
  for (const { id } of SOUNDS) {
    const a = fakeAudio();
    const c = new Chime({ win: a.win, sound: () => id });
    assert.equal(await c.ring(), true, id);
    assert.ok(a.starts.length > 5, `${id} makes notes`);
    assert.ok(Math.min(...a.starts) >= T0 - 1e-9, `${id} doesn't start before it should`);
    assert.ok(Math.max(...a.stops) <= T0 + 12, `${id} is over within 12 seconds (${(Math.max(...a.stops) - T0).toFixed(1)})`);
    assert.ok(a.stops.length === a.starts.length, `${id}: every note is stopped`);
  }
  const a = fakeAudio();
  const c = new Chime({ win: a.win, sound: () => 'no-such-sound' });
  await c.ring();
  assert.equal(a.starts.length, 30, 'the classic ding-dong');
  assert.equal(soundById('nope').id, 'classic');
});

test('the sounds are chosen at each ring, test() can choose its own, and a ring cuts what is still playing', async () => {
  const a = fakeAudio();
  let choice = 'cuckoo';
  const c = new Chime({ win: a.win, sound: () => choice });
  await c.ring();
  const cuckoo = a.starts.length;
  assert.equal(cuckoo, 4 * 2 * 3, 'four cuckoos of two notes, three tones each');
  choice = 'classic';
  await c.test();
  assert.equal(a.starts.length - cuckoo, 30);
  await c.test({ sound: 'fanfare' });
  assert.ok(a.starts.length - cuckoo - 30 > 10);
});

test('everything is cut at 30 seconds: a gate fades it out, and stop() ends it at once', async () => {
  const a = fakeAudio();
  const c = new Chime({ win: a.win });
  await c.ring();
  const gate = c.gate;
  assert.deepEqual(gate.rec.ramps, [[0, T0 + 30]], 'fades to nothing at 30 s');
  assert.deepEqual(gate.rec.sets[1], [1, T0 + 28.5], '…over the last second and a half');
  c.stop();
  assert.equal(gate.rec.target, 0, 'stop() fades it out at once');
  assert.equal(c.gate, null);
  c.stop(); // nothing playing: nothing happens
});

/** A fake <audio>: records play and pause. */
const fakeEl = ({ playError } = {}) => {
  const el = { plays: 0, paused: false, src: '', preload: '', play() { el.plays++; return playError ? Promise.reject(Object.assign(new Error('blocked'), { name: playError })) : Promise.resolve(); }, pause() { el.paused = true; } };
  return el;
};
/** Run a ring that waits on timers, with the timers under the test's control. */
const settle = async (t, promise, tick = 100) => {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 50 && !done; i++) { await new Promise((r) => setImmediate(r)); t.mock.timers.tick(tick); }
  return promise;
};

test('a track you added: its first 30 seconds play through the same output, then it is cut', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const a = fakeAudio();
  const el = fakeEl();
  const c = new Chime({ win: a.win, sound: () => 'track:abc', loadTrack: async (id) => (id === 'abc' ? new Blob(['x'], { type: 'audio/mpeg' }) : null), makeAudio: () => el });
  assert.equal(await settle(t, c.ring()), true);
  assert.equal(el.plays, 1);
  assert.equal(a.sources.length, 1, 'through the chime\'s own output stage');
  assert.equal(a.starts.length, 0, 'no built-in sound as well');
  assert.equal(el.paused, false);
  t.mock.timers.tick(29_000);
  assert.equal(el.paused, false, 'still playing at 29 s');
  t.mock.timers.tick(1_500);
  assert.equal(el.paused, true, 'cut at 30 s');
  assert.equal(a.sources[0].gone, true);
});

test('closing the doorbell view stops a track at once', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const a = fakeAudio();
  const el = fakeEl();
  const c = new Chime({ win: a.win, sound: () => 'track:abc', loadTrack: async () => new Blob(['x']), makeAudio: () => el });
  await settle(t, c.ring());
  c.stop();
  assert.equal(el.paused, true);
});

test('a track that is gone or won\'t play: the classic chime plays instead (never silence); a blocked page says so', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gone = fakeAudio();
  const c1 = new Chime({ win: gone.win, sound: () => 'track:missing', loadTrack: async () => null, makeAudio: () => fakeEl() });
  assert.equal(await settle(t, c1.ring()), true);
  assert.equal(gone.starts.length, 30, 'the classic ding-dong');

  const broken = fakeAudio();
  const c2 = new Chime({ win: broken.win, sound: () => 'track:abc', loadTrack: async () => new Blob(['x']), makeAudio: () => fakeEl({ playError: 'EncodingError' }) });
  assert.equal(await settle(t, c2.ring()), true);
  assert.equal(broken.starts.length, 30);

  const dead = fakeAudio();
  const c3 = new Chime({ win: dead.win, sound: () => 'track:abc', loadTrack: async () => { throw new Error('no storage'); }, makeAudio: () => fakeEl() });
  assert.equal(await settle(t, c3.ring()), true);
  assert.equal(dead.starts.length, 30, 'a store that fails is the same as a missing track');

  const blocked = fakeAudio();
  const c4 = new Chime({ win: blocked.win, sound: () => 'track:abc', loadTrack: async () => new Blob(['x']), makeAudio: () => fakeEl({ playError: 'NotAllowedError' }) });
  assert.equal(await settle(t, c4.ring()), false, 'needs a tap first');
  assert.equal(blocked.starts.length, 0, 'and not the classic chime either');
});

test('the context is kept awake for a whole track, and a second ring cuts the first', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const a = fakeAudio();
  const el1 = fakeEl(), el2 = fakeEl();
  const els = [el1, el2];
  let now = 0;
  const c = new Chime({ win: a.win, now: () => now, sound: () => 'track:abc', loadTrack: async () => new Blob(['x']), makeAudio: () => els.shift() });
  await settle(t, c.ring());
  t.mock.timers.tick(20_000);
  now += 20_000;
  assert.equal(c.ctx.suspended, 0, 'not suspended at 20 s: the track is still playing');
  await settle(t, c.test());
  assert.equal(el1.paused, true, 'the first one was cut by the second ring');
  assert.equal(el2.plays, 1);
});

test('tracks: names, size limits and the playable check', async () => {
  assert.equal(trackName({ name: 'Fukai_Mori (live).mp3' }), 'Fukai Mori (live)');
  assert.equal(trackName({ name: '' }), 'My track');
  assert.equal(trackName({ name: 'x'.repeat(100) + '.wav' }).length, 60);
  await assert.rejects(addTrack({ size: MAX_BYTES + 1, name: 'big.mp3' }), /limit is 15 MB.*first 30 seconds/);
  await assert.rejects(addTrack({ size: 0, name: 'empty.mp3' }), /empty/);
  await assert.rejects(addTrack(null), /Choose a sound file/);

  const ok = { load() {}, removeAttribute() {}, set src(v) { setImmediate(() => { this.duration = 222; this.onloadedmetadata(); }); } };
  assert.equal(await checkPlayable(new Blob(['x']), { makeAudio: () => ok }), 222);
  const bad = { load() {}, removeAttribute() {}, set src(v) { setImmediate(() => this.onerror()); } };
  await assert.rejects(checkPlayable(new Blob(['x']), { makeAudio: () => bad }), /can't play that file/);
  const silent = { load() {}, removeAttribute() {}, set src(v) {} };
  await assert.rejects(checkPlayable(new Blob(['x']), { makeAudio: () => silent, timeout: 20 }), /can't play that file/);
});
