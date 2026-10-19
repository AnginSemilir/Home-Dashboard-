// The doorbell chime: a two-note ding-dong made with Web Audio (no sound file). Browsers only
// let a page make sound after a tap, except in WebView Kiosk and an installed Chrome app, where
// a top-level page may play without one; any tap on the panel unlocks it for the rest of the day.
//
// A page can't raise the tablet's volume, so the chime is made as loud as a page can make it at
// whatever the media volume is: a bright bell pitched where ears and small speakers are most
// sensitive, driven hard into a clipper so it sits at almost full level the whole time (close
// to the loudest any sound can be at that volume), and played three times.
//
// Measured (offline render, 5 s, hearing-weighted): about 18 dB louder than the first chime and
// 7 dB louder than the previous one at the same volume, peaks still under full scale. The price
// is tone: a harder, more alarm-like ding-dong.

const NOTES = [987.77, 783.99]; // B5, G5
const REPEATS = 3;              // ding-dong, three times
const REPEAT_GAP = 1.9;         // seconds between them
// Bell overtones: [multiple of the note, level, seconds to fade].
const PARTIALS = [[1, 1, 3.5], [2, 0.6, 2.5], [3, 0.45, 1.9], [4.2, 0.35, 1.45], [5.4, 0.25, 1.05]];
const LEVEL = 0.98;             // the loudest the output stage goes (full scale is 1)
const WAKE_LEAD = 0.5;          // Bluetooth speakers can miss the first half second after a pause
const QUIET_AFTER = 15e3;       // suspend the audio this long after a chime (saves power)
const AGAIN_WITHIN = 5e3;       // a second ring this soon doesn't chime again

/**
 * The volume bar (0.1 to 1) as a gain. The bar moves in even steps of loudness, not of amplitude: each 10% is
 * about 4 dB, so 100% is the full chime, 50% a tenth of its amplitude (20 dB down) and 10% 36 dB down.
 */
export function volumeGain(volume) {
  const v = Number.isFinite(volume) ? Math.min(1, Math.max(0.1, volume)) : 1;
  return 10 ** (-2 * (1 - v));
}

export class Chime {
  /** `volume`: a function giving the volume bar's value now, 0.1 to 1 (read at each ring, so Settings changes count). */
  constructor({ win = globalThis, now = () => Date.now(), volume = () => 1 } = {}) {
    this.win = win;
    this.now = now;
    this.volume = volume;
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

  /** Notes → soft clipper → volume → speakers. The clipper keeps the loudness up as each note decays. */
  chain() {
    const c = this.ctx;
    this.master = c.createGain(); // the volume bar acts here, after the clipper
    this.master.gain.value = LEVEL;
    this.master.connect(c.destination);
    if (typeof c.createWaveShaper !== 'function') return this.master;
    const bus = c.createGain();
    bus.gain.value = 2;
    const shaper = c.createWaveShaper();
    const n = 2048, drive = 16, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(drive * x) / Math.tanh(drive); }
    shaper.curve = curve;
    shaper.oversample = 'none'; // oversampling's filter overshoots full scale when driven this hard
    bus.connect(shaper);
    shaper.connect(this.master);
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
  async ring({ force = false, volume } = {}) {
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
    this.master.gain.value = LEVEL * volumeGain(volume ?? this.volume());
    const t0 = this.ctx.currentTime + lead;
    for (let rep = 0; rep < REPEATS; rep++) NOTES.forEach((f, i) => this.note(f, t0 + rep * REPEAT_GAP + i * 0.55));
    clearTimeout(this.quiet);
    this.quiet = setTimeout(() => { if (this.now() - this.last >= QUIET_AFTER - 50) this.ctx.suspend().catch(() => {}); }, QUIET_AFTER);
    this.quiet?.unref?.(); // (tests in Node: don't hold the process open)
    return true;
  }

  /** The Settings "Test chime" button (the tap itself unlocks the sound), at the volume on the bar there. */
  test({ volume } = {}) { return this.ring({ force: true, volume }); }

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
