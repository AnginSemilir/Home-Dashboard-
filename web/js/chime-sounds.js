// The doorbell's built-in sounds, all made with Web Audio (no sound files). Each one is a function that
// schedules its notes into `b` (the chime's output for this ring: every note goes through the chime's
// loudness stage and the volume bar) and says how many seconds it lasts. None lasts more than about 12
// seconds; the chime also cuts whatever is playing at 30 seconds (chime.js).

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/**
 * One pitched note: an oscillator with a quick attack, an optional hold, then a fade.
 * `b.ctx` is the audio context and `b.dest` where the notes go.
 */
export function tone(b, { at, freq, dur, type = 'sine', level = 1, attack = 0.006, hold = 0, glideTo }) {
  const c = b.ctx;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + attack);
  if (hold) gain.gain.setValueAtTime(level, at + hold);
  gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
  gain.connect(b.dest);
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (glideTo) osc.frequency.linearRampToValueAtTime(glideTo, at + dur);
  osc.connect(gain);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/** A struck bell: the note and some overtones, each fading at its own speed. [multiple of the note, level, seconds to fade] */
function bell(b, at, freq, partials, level = 1) {
  for (const [mult, lv, fade] of partials) tone(b, { at, freq: freq * mult, dur: fade, level: lv * level });
}

// The classic ding-dong: B5 then G5, bright and loud, three times (see chime.js for why it is built like this).
const DING_PARTIALS = [[1, 1, 3.5], [2, 0.6, 2.5], [3, 0.45, 1.9], [4.2, 0.35, 1.45], [5.4, 0.25, 1.05]];
function classic(b, t0) {
  for (let rep = 0; rep < 3; rep++) [987.77, 783.99].forEach((f, i) => bell(b, t0 + rep * 1.9 + i * 0.55, f, DING_PARTIALS));
  return 2 * 1.9 + 0.55 + 3.5;
}

// A cuckoo clock: a falling minor third, four times.
function cuckoo(b, t0) {
  const voice = (at, midi, dur) => {
    tone(b, { at, freq: hz(midi), dur, level: 1, hold: dur * 0.6, attack: 0.03 });
    tone(b, { at, freq: hz(midi) * 2, dur, level: 0.25, hold: dur * 0.6, attack: 0.03 });
    tone(b, { at, freq: hz(midi) * 3, dur, level: 0.1, hold: dur * 0.6, attack: 0.03 });
  };
  for (let rep = 0; rep < 4; rep++) {
    voice(t0 + rep * 1.7, 79, 0.32); // G5
    voice(t0 + rep * 1.7 + 0.42, 76, 0.6); // E5
  }
  return 3 * 1.7 + 0.42 + 0.6;
}

// A music box: a little rising and falling arpeggio, twice.
const TINE = [[1, 1, 1.3], [2.76, 0.35, 0.6], [5.4, 0.15, 0.35]];
function musicbox(b, t0) {
  const run = [84, 88, 91, 96, 91, 88, 84, 88, 91, 96, 100, 96];
  for (let rep = 0; rep < 2; rep++) run.forEach((m, i) => bell(b, t0 + rep * 3.2 + i * 0.17, hz(m), TINE, i === run.length - 1 ? 1 : 0.8));
  return 3.2 + run.length * 0.17 + 1.3;
}

// Wind chimes: a shimmer of notes from a pentatonic scale, in a fixed "random" order.
const CHIME_TUBE = [[1, 1, 2.8], [2.7, 0.3, 1.6], [4.1, 0.12, 1.0]];
function windchimes(b, t0) {
  const scale = [86, 88, 90, 93, 95, 98, 100]; // D major pentatonic, from D6
  let seed = 7, at = 0, end = 0;
  const next = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 16; i++) {
    const m = scale[Math.floor(next() * scale.length)];
    bell(b, t0 + at, hz(m), CHIME_TUBE, 0.55 + next() * 0.45);
    end = at + 2.8;
    at += 0.06 + next() * 0.4;
  }
  return end;
}

// Retro arcade: bright square-wave runs, like a game's "you won" jingle.
function arcade(b, t0) {
  const run = [72, 76, 79, 84, 88, 91];
  for (let rep = 0; rep < 3; rep++) {
    const at = t0 + rep * 1.5;
    run.forEach((m, i) => tone(b, { at: at + i * 0.075, freq: hz(m), dur: 0.09, type: 'square', level: 0.55, attack: 0.004 }));
    const top = at + run.length * 0.075;
    [96, 100, 96].forEach((m, i) => tone(b, { at: top + i * 0.12, freq: hz(m), dur: i === 2 ? 0.5 : 0.13, type: 'square', level: 0.55, attack: 0.004 }));
  }
  return 2 * 1.5 + run.length * 0.075 + 0.24 + 0.5;
}

// An old telephone: the bell's quick trill ("brrring-brrring"), three times.
function telephone(b, t0) {
  for (let ring = 0; ring < 3; ring++) {
    const at = t0 + ring * 3.2;
    for (const f of [1250, 1590]) {
      const gain = b.ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      for (let k = 0; k < 44; k++) { // 22 trills a second for two seconds: on, off, on, off…
        gain.gain.setValueAtTime(0.7, at + k * 0.045);
        gain.gain.setValueAtTime(0, at + k * 0.045 + 0.022);
      }
      gain.connect(b.dest);
      const osc = b.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, at);
      osc.connect(gain);
      osc.start(at);
      osc.stop(at + 2.05);
    }
  }
  return 2 * 3.2 + 2;
}

// A fanfare: "da da da DAAA", twice.
function fanfare(b, t0) {
  const brass = (at, midi, dur, level = 1) => {
    tone(b, { at, freq: hz(midi), dur, type: 'sawtooth', level: 0.4 * level, attack: 0.02, hold: dur * 0.7 });
    tone(b, { at, freq: hz(midi - 12), dur, type: 'triangle', level: 0.55 * level, attack: 0.02, hold: dur * 0.7 });
  };
  for (let rep = 0; rep < 2; rep++) {
    const at = t0 + rep * 3.4;
    [67, 72, 76].forEach((m, i) => brass(at + i * 0.2, m, 0.17));
    [72, 76, 79, 84].forEach((m) => brass(at + 0.65, m, 1.8, 0.7));
  }
  return 3.4 + 0.65 + 1.8;
}

/** The built-in sounds, in the order Settings lists them. `play(b, t0)` returns how many seconds it lasts. */
export const SOUNDS = [
  { id: 'classic', label: 'Ding-dong (the classic, loudest)', play: classic },
  { id: 'cuckoo', label: 'Cuckoo clock', play: cuckoo },
  { id: 'musicbox', label: 'Music box', play: musicbox },
  { id: 'windchimes', label: 'Wind chimes', play: windchimes },
  { id: 'arcade', label: 'Retro arcade', play: arcade },
  { id: 'telephone', label: 'Old telephone', play: telephone },
  { id: 'fanfare', label: 'Fanfare', play: fanfare },
];

export const soundById = (id) => SOUNDS.find((s) => s.id === id) || SOUNDS[0];
