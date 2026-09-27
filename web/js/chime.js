// The doorbell chime: a two-note ding-dong made with Web Audio (no sound file). Browsers only
// let a page make sound after a tap, except in WebView Kiosk and an installed Chrome app, where
// a top-level page may play without one; any tap on the panel unlocks it for the rest of the day.

const NOTES = [659.25, 523.25]; // E5, C5
const REPEAT_GAP = 2;           // seconds between the two ding-dongs
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
    this.check();
    // A tap (not just a finger down: that doesn't count as permission) lets it start.
    const unlock = () => {
      if (this.ctx.state !== 'running') this.ctx.resume().then(() => this.check(), () => {});
      else this.check();
    };
    for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) win.addEventListener?.(ev, unlock, { capture: true, passive: true });
    this.ctx.addEventListener?.('statechange', () => this.check());
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
    if (this.ctx.state !== 'running') {
      // A blocked page's resume() can stay pending rather than fail: don't wait for ever.
      await Promise.race([this.ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 500))]);
      this.check();
      if (this.ctx.state !== 'running') return false;
    }
    this.last = now;
    const t0 = this.ctx.currentTime + 0.05;
    for (const rep of [0, REPEAT_GAP]) NOTES.forEach((f, i) => this.note(f, t0 + rep + i * 0.5));
    clearTimeout(this.quiet);
    this.quiet = setTimeout(() => { if (this.now() - this.last >= QUIET_AFTER - 50) this.ctx.suspend().catch(() => {}); }, QUIET_AFTER);
    this.quiet?.unref?.(); // (tests in Node: don't hold the process open)
    return true;
  }

  /** The Settings "Test chime" button (the tap itself unlocks the sound). */
  test() { return this.ring({ force: true }); }

  note(freq, at) {
    const c = this.ctx;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.8, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 1.4);
    gain.connect(c.destination);
    for (const [mult, level] of [[1, 1], [2, 0.25]]) {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      if (level === 1) osc.connect(gain);
      else {
        const g2 = c.createGain();
        g2.gain.value = level;
        osc.connect(g2);
        g2.connect(gain);
      }
      osc.start(at);
      osc.stop(at + 1.5);
    }
  }
}
