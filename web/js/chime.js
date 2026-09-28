// The doorbell chime: a two-note ding-dong made with Web Audio (no sound file). Browsers only
// let a page make sound after a tap, except in WebView Kiosk and an installed Chrome app, where
// a top-level page may play without one; any tap on the panel unlocks it for the rest of the day.
//
// A page can't raise the tablet's volume, so the chime is made to sound as loud as possible at
// whatever the media volume is: a bright bell (overtones up where the ear is most sensitive),
// soft-clipped so the ring stays near full level instead of fading, and played three times.

const NOTES = [659.25, 523.25]; // E5, C5
const REPEATS = 3;              // ding-dong, three times
const REPEAT_GAP = 1.9;         // seconds between them
// Bell overtones: [multiple of the note, level, seconds to fade].
const PARTIALS = [[1, 1, 2.2], [2, 0.6, 1.55], [3, 0.45, 1.2], [4.2, 0.35, 0.9], [5.4, 0.25, 0.65]];
const WAKE_LEAD = 0.5;          // Bluetooth speakers can miss the first half second after a pause
const QUIET_AFTER = 15e3;       // suspend the audio this long after a chime (saves power)
const AGAIN_WITHIN = 5e3;       // a second ring this soon doesn't chime again

export class Chime {
  constructor({ win = globalThis, now = () => Date.now() } = {}) {
    this.win = win;
    this.now = now;
    this.last = -Infinity; // when it last chimed
    this.unlocked = false;
    this.onChange = () => {};
    const AC = win.AudioContext || win.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { return; }
    this.out = this.chain();
    this.check();
    // A tap (not just a finger down: that doesn't count as permission) lets it start.
    const unlock = () => {
      if (this.ctx.state !== 'running') this.ctx.resume().then(() => this.check(), () => {});
      else this.check();
    };
    for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) win.addEventListener?.(ev, unlock, { capture: true, passive: true });
    this.ctx.addEventListener?.('statechange', () => this.check());
  }

  /** Notes → soft clipper → speakers. The clipper keeps the loudness up as each note decays. */
  chain() {
    const c = this.ctx;
    if (typeof c.createWaveShaper !== 'function') return c.destination;
    const bus = c.createGain();
    bus.gain.value = 0.8;
    const shaper = c.createWaveShaper();
    // Measured against the first version at the same volume: about 9 dB louder on average
    // (roughly twice as loud to the ear), peaks still just under full scale.
    const n = 2048, drive = 4, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(drive * x) / Math.tanh(drive); }
    shaper.curve = curve;
    shaper.oversample = '4x';
    const master = c.createGain();
    master.gain.value = 0.98;
    bus.connect(shaper);
    shaper.connect(master);
    master.connect(c.destination);
    return bus;
  }

  check() {
    if (!this.unlocked && this.ctx?.state === 'running') {
      this.unlocked = true;
      this.onChange(true);
    }
  }

  /** Can it make a sound right now? (false = it needs a tap first) */
  get ready() { return !!this.ctx && this.unlocked; }

  /** Ring. Resolves true if the chime played (or had just played), false if sound is blocked. */
  async ring({ force = false } = {}) {
    if (!this.ctx) return false;
    const now = this.now();
    if (!force && now - this.last < AGAIN_WITHIN) return true;
    let lead = 0.1;
    if (this.ctx.state !== 'running') {
      lead = WAKE_LEAD; // the sound output was asleep: give a Bluetooth speaker time to wake
      // A blocked page's resume() can stay pending rather than fail: don't wait for ever.
      await Promise.race([this.ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 500))]);
      this.check();
      if (this.ctx.state !== 'running') return false;
    }
    this.last = now;
    const t0 = this.ctx.currentTime + lead;
    for (let rep = 0; rep < REPEATS; rep++) NOTES.forEach((f, i) => this.note(f, t0 + rep * REPEAT_GAP + i * 0.55));
    clearTimeout(this.quiet);
    this.quiet = setTimeout(() => { if (this.now() - this.last >= QUIET_AFTER - 50) this.ctx.suspend().catch(() => {}); }, QUIET_AFTER);
    this.quiet?.unref?.(); // (tests in Node: don't hold the process open)
    return true;
  }

  /** The Settings "Test chime" button (the tap itself unlocks the sound). */
  test() { return this.ring({ force: true }); }

  note(freq, at) {
    const c = this.ctx;
    for (const [mult, level, fade] of PARTIALS) {
      const gain = c.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(level, at + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, at + fade);
      gain.connect(this.out || c.destination);
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      osc.connect(gain);
      osc.start(at);
      osc.stop(at + fade + 0.05);
    }
  }
}
