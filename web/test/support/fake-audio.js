// A stand-in for the browser's audio for the unit tests: records what the chime schedules.
export function fakeAudio({ state = 'running', resumes = true } = {}) {
  const starts = [], stops = [], gates = [], sources = [], listeners = {};
  const param = (rec = {}) => ({ value: 0, setValueAtTime(v, t) { (rec.sets ||= []).push([v, t]); }, linearRampToValueAtTime(v, t) { (rec.ramps ||= []).push([v, t]); }, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime(v) { rec.target = v; } });
  class Ctx {
    constructor() { this.state = state; this.currentTime = 10; this.destination = {}; this.suspended = 0; }
    resume() { if (resumes === 'never') return new Promise(() => {}); if (resumes) this.state = 'running'; return Promise.resolve(); }
    suspend() { this.suspended++; return Promise.resolve(); }
    addEventListener() {}
    createGain() { const rec = {}; const g = { rec, gain: param(rec), connect() {}, disconnect() { rec.disconnected = true; } }; gates.push(g); return g; }
    createOscillator() { return { type: '', frequency: param(), connect() {}, start: (t) => starts.push(t), stop: (t) => stops.push(t) }; }
    createMediaElementSource(el) { const src = { el, connect() {}, disconnect() { src.gone = true; } }; sources.push(src); return src; }
  }
  return { win: { AudioContext: Ctx, addEventListener: (ev, fn) => { listeners[ev] = fn; } }, starts, stops, gates, sources, listeners };
}
