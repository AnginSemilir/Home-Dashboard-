// Google Calendar: today's and tomorrow's events from one or more calendars.

import { startOfDay, DEFAULT_TZ } from './time.js';

export const CAL = 'https://www.googleapis.com/calendar/v3';

/** Midnight (in tz) of a Google all-day date "YYYY-MM-DD". */
export function dateToMs(date, tz = DEFAULT_TZ) {
  const [y, m, d] = date.split('-').map(Number);
  // Noon UTC is safely inside that calendar date in any UK time; then take its local midnight.
  return startOfDay(Date.UTC(y, m - 1, d, 12), tz);
}

export function normalizeEvent(e, cal = {}, tz = DEFAULT_TZ) {
  if (!e || e.status === 'cancelled') return null;
  const allDay = !!e.start?.date;
  const start = allDay ? dateToMs(e.start.date, tz) : Date.parse(e.start?.dateTime);
  const end = allDay ? dateToMs(e.end?.date || e.start.date, tz) : Date.parse(e.end?.dateTime || e.start?.dateTime);
  if (!Number.isFinite(start)) return null;
  // Skip events you've declined.
  if ((e.attendees || []).some((a) => a.self && a.responseStatus === 'declined')) return null;
  return {
    id: `${cal.id || ''}/${e.id || start}`,
    // The same meeting on two chosen calendars (e.g. family + your own) has the same iCalUID.
    key: `${e.iCalUID || e.id || ''}|${e.originalStartTime?.dateTime ? Date.parse(e.originalStartTime.dateTime) : e.originalStartTime?.date || start}`,
    title: e.summary || '(no title)',
    location: e.location || '',
    start,
    end: Number.isFinite(end) && end > start ? end : start + (allDay ? 864e5 : 0),
    allDay,
    color: cal.color || '',
    calendar: cal.name || '',
  };
}

/**
 * Group events into "Today" and "Tomorrow" (in tz). Events that have finished are hidden;
 * multi-day events appear on every day they cover. All-day events first, then by start time.
 */
export function groupDays(events, now, tz = DEFAULT_TZ, days = 2) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const from = startOfDay(now, tz, i);
    const to = startOfDay(now, tz, i + 1);
    const list = events
      .filter((e) => e && e.start < to && e.end > from && (i > 0 || e.end > now)) // today: hide finished events
      .filter((e, idx, arr) => arr.findIndex((x) => (x.key || x.id) === (e.key || e.id)) === idx)
      .sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start) || a.title.localeCompare(b.title));
    out.push({ label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : '', dayStart: from, events: list });
  }
  return out;
}

export async function listCalendars(google) {
  const body = await google.api(`${CAL}/users/me/calendarList?minAccessRole=reader&maxResults=100`);
  return (body?.items || []).map((c) => ({ id: c.id, name: c.summaryOverride || c.summary, color: c.backgroundColor || '', primary: !!c.primary }));
}

export async function fetchEvents(google, calendars, now, tz = DEFAULT_TZ) {
  const timeMin = new Date(startOfDay(now, tz)).toISOString();
  const timeMax = new Date(startOfDay(now, tz, 2)).toISOString();
  const events = [];
  const failed = [];
  const results = await Promise.allSettled(calendars.map(async (cal) => {
    const url = `${CAL}/calendars/${encodeURIComponent(cal.id)}/events?singleEvents=true&orderBy=startTime&maxResults=100&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
    const body = await google.api(url);
    return (body?.items || []).map((e) => normalizeEvent(e, cal, tz)).filter(Boolean);
  }));
  results.forEach((r, i) => (r.status === 'fulfilled' ? events.push(...r.value) : failed.push({ name: calendars[i].name || calendars[i].id, error: r.reason })));
  // Every calendar failing is an error; some failing still shows the rest (the caller reports them).
  if (failed.length && failed.length === calendars.length) throw failed[0].error;
  return { events, failed };
}
