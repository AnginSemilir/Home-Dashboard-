// The doorbell sound, made with Web Audio. Browsers only let a page make sound after a tap, except in
// WebView Kiosk and an installed Chrome app, where a top-level page may play without one; any tap on the
// panel unlocks it for the rest of the day.
//
// What plays is chosen in Settings: one of the built-in sounds (chime-sounds.js: the classic ding-dong, a
// cuckoo, a music box…) or a track you added (tracks.js). Whatever it is, it is cut at 30 seconds, and it
// stops at once when the doorbell view is closed.
//
// A page can't raise the tablet's volume, so the built-in sounds are made as loud as a page can make them at
// whatever the media volume is: driven hard into a clipper so they sit at almost full level the whole time
// (close to the loudest any sound can be at that volume). The classic ding-dong is a bright bell pitched
// where ears and small speakers are most sensitive, played three times: about 18 dB louder than the first
// chime and 7 dB louder than the second, at the same volume, peaks still under full scale. The price is
// tone: a harder, more alarm-like ding-dong. The volume bar in Settings acts after the clipper.

import { soundById } from './chime-sounds.js';
import { getTrack } from './tracks.js';

const LEVEL = 0.98;             // the loudest the output stage goes (full scale is 1)
const CUT_AT = 30;              // seconds: nothing plays longer than this
const CUT_FADE = 1.5;           // …fading out over the last of them
const WAKE_LEAD = 0.5;          // Bluetooth speakers can miss the first half second after a pause
const QUIET_AFTER = 15e3;       // suspend the audio this long after a chime (saves power)
const QUIET_AFTER_TRACK = 35e3; // (after a track, which may run to the cut)
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
  /**
   * @param {object} [o]
   * @param {() => number} [o.volume]  the volume bar's value now, 0.1 to 1 (read at each ring, so Settings changes count)
   * @param {() => string} [o.sound]   what to play now: a built-in sound's id, or 'track:<id>' (read at each ring)
   * @param {(id: string) => Promise<Blob|null>} [o.loadTrack]
   * @param {() => HTMLAudioElement} [o.makeAudio]
   */
  constructor({ win = globalThis, now = () => Date.now(), volume = () => 1, sound = () => 'classic', loadTrack = (id) => getTrack(id), makeAudio = () => new Audio() } = {}) {
    this.win = win;
    this.now = now;
    this.volume = volume;
    this.sound = sound;
    this.loadTrack = loadTrack;
    this.makeAudio = makeAudio;
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

  /** Sounds → soft clipper → volume → speakers. The clipper keeps the loudness up as each note decays. */
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
  async ring({ force = false, volume, sound } = {}) {
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
    this.stop(); // anything still sounding from an earlier ring
    this.master.gain.value = LEVEL * volumeGain(volume ?? this.volume());
    const id = String(sound ?? this.sound() ?? 'classic');
    let ok = true;
    if (id.startsWith('track:')) ok = await this.playTrack(id.slice(6), lead);
    if (!id.startsWith('track:') || ok === 'fallback') this.playBuiltIn(id.startsWith('track:') ? 'classic' : id, lead);
    clearTimeout(this.quiet);
    const quietAfter = id.startsWith('track:') && ok === true ? QUIET_AFTER_TRACK : QUIET_AFTER;
    this.quiet = setTimeout(() => { if (this.now() - this.last >= quietAfter - 50) this.ctx.suspend().catch(() => {}); }, quietAfter);
    this.quiet?.unref?.(); // (tests in Node: don't hold the process open)
    return ok === 'fallback' ? true : ok;
  }

  /** The Settings "Test chime" button (the tap itself unlocks the sound), at the volume bar's and the sound's choice there. */
  test({ volume, sound } = {}) { return this.ring({ force: true, volume, sound }); }

  /** A gate every sound of this ring goes through: the cut at 30 seconds, and a way to stop it at once. */
  openGate(at) {
    const c = this.ctx;
    const gate = c.createGain();
    gate.gain.setValueAtTime(1, at);
    gate.gain.setValueAtTime(1, at + CUT_AT - CUT_FADE);
    gate.gain.linearRampToValueAtTime(0, at + CUT_AT);
    gate.connect(this.out || c.destination);
    this.gate = gate;
    clearTimeout(this.cut);
    this.cut = setTimeout(() => this.stop(), CUT_AT * 1000 + 100);
    this.cut?.unref?.();
    return gate;
  }

  playBuiltIn(id, lead) {
    const at = this.ctx.currentTime + lead;
    const gate = this.openGate(at);
    soundById(id).play({ ctx: this.ctx, dest: gate }, at);
  }

  /**
   * A track the user added: the first 30 seconds. Resolves true (playing), false (the browser needs a tap
   * first) or 'fallback' (the file is gone or can't be played: the classic chime plays instead; never silence).
   */
  async playTrack(id, lead) {
    let blob;
    try { blob = await this.loadTrack(id); } catch { blob = null; }
    if (!blob) return 'fallback';
    const el = this.makeAudio();
    const url = URL.createObjectURL(blob);
    try {
      el.src = url;
      el.preload = 'auto';
      const source = this.ctx.createMediaElementSource(el);
      const gate = this.openGate(this.ctx.currentTime + lead);
      source.connect(gate);
      this.media = { el, url, source };
      await new Promise((r) => setTimeout(r, lead * 1000)); // a Bluetooth speaker wakes first
      if (this.media?.el !== el) return true; // stopped while waiting
      await el.play();
      // The cut counts from when it really starts.
      const t = this.ctx.currentTime;
      gate.gain.cancelScheduledValues?.(0);
      gate.gain.setValueAtTime(1, t);
      gate.gain.setValueAtTime(1, t + CUT_AT - CUT_FADE);
      gate.gain.linearRampToValueAtTime(0, t + CUT_AT);
      clearTimeout(this.cut);
      this.cut = setTimeout(() => this.stop(), CUT_AT * 1000);
      this.cut?.unref?.();
      return true;
    } catch (e) {
      if (this.media?.el !== el) return true; // closed (or another ring began) meanwhile: not a failure
      this.stop();
      return e?.name === 'NotAllowedError' ? false : 'fallback';
    }
  }

  /** Stop whatever is sounding now (the doorbell view was closed, or another ring starts). */
  stop() {
    clearTimeout(this.cut);
    const gate = this.gate, media = this.media;
    this.gate = this.media = null;
    if (gate) {
      gate.gain.cancelScheduledValues?.(0);
      gate.gain.setTargetAtTime?.(0, this.ctx.currentTime, 0.02);
      const off = setTimeout(() => { try { gate.disconnect?.(); } catch { /* gone already */ } }, 300);
      off?.unref?.();
    }
    if (media) {
      try { media.el.pause(); media.source.disconnect?.(); } catch { /* fine */ }
      URL.revokeObjectURL(media.url);
    }
  }
}

