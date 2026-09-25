// Time helpers. Everything is shown in the panel's time zone (default Europe/London),
// whatever the tablet's own zone. Timestamps are epoch milliseconds, so they are
// unaffected by clock changes (BST/GMT).

export const DEFAULT_TZ = 'Europe/London';

const fmtCache = new Map();
function fmt(tz, opts) {
  const key = tz + JSON.stringify(opts);
  if (!fmtCache.has(key)) fmtCache.set(key, new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }));
  return fmtCache.get(key);
}

/** Wall-clock parts of an instant in a time zone. */
export function partsInTz(ms, tz = DEFAULT_TZ) {
  const p = {};
  for (const { type, value } of fmt(tz, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms))) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

/** Offset of the time zone from UTC at an instant, in ms (e.g. +3600000 during BST). */
export function tzOffset(ms, tz = DEFAULT_TZ) {
  const p = partsInTz(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000;
}

/** Epoch ms of local midnight at the start of the day containing `ms`, plus `addDays` days. */
export function startOfDay(ms, tz = DEFAULT_TZ, addDays = 0) {
  const p = partsInTz(ms, tz);
  const guessUtc = Date.UTC(p.y, p.m - 1, p.d + addDays, 0, 0, 0);
  let t = guessUtc - tzOffset(guessUtc, tz);
  t = guessUtc - tzOffset(t, tz); // second pass settles clock-change days
  return t;
}

/** "Local calendar date" key, e.g. "2026-09-25". */
export function dayKey(ms, tz = DEFAULT_TZ) {
  const p = partsInTz(ms, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

export const hhmm = (ms, tz = DEFAULT_TZ) => fmt(tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
export const weekdayShort = (ms, tz = DEFAULT_TZ) => fmt(tz, { weekday: 'short' }).format(new Date(ms));
export const longDate = (ms, tz = DEFAULT_TZ) => fmt(tz, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ms));

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function ago(ms, now) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 90) return 'just now';
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Is the local time-of-day of `ms` inside [from, to) where from/to are "HH:MM" (may wrap midnight)? */
export function inWindow(ms, from, to, tz = DEFAULT_TZ) {
  const p = partsInTz(ms, tz);
  const cur = p.h * 60 + p.min;
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const f = fh * 60 + fm, t = th * 60 + tm;
  return f <= t ? cur >= f && cur < t : cur >= f || cur < t;
}
