// Electricity usage from Hildebrand's Bright app (the Glowmarkt API), for any supplier. Bright
// reads the smart meter through the national smart meter network (the DCC), so it keeps working
// after a switch: half-hourly readings, usually about 30 minutes behind. With a Glow display/CAD
// on the meter it also gives live usage (watts, every few seconds).
//
// The Bright email and password stay on this tablet and go only to Glowmarkt (or the optional
// relay: docs/bright.md). The sign-in lasts a week; it's kept apart from the settings.

import { fetchJSON, HttpError } from './util.js';
import { cspAllows } from './octopus.js';

export const GLOW_API = 'https://api.glowmarkt.com';
// The application ID Hildebrand publishes for Bright users reading their own data.
export const BRIGHT_APP_ID = 'b0f1b774-a586-4f72-9edd-27ead8aa7a8d';
const TOKEN_KEY = 'wallpanel.bright.v1'; // { token, exp, user }
const HALF = 1800e3;
const HOUR = 3600e3;

/** Glowmarkt wants times as UTC without a zone: 2026-10-13T23:00:00. */
export const glowTime = (ms) => new Date(ms).toISOString().slice(0, 19);

/** Readings → [{ start, end, kwh }] (kwh null where Bright has nothing yet), oldest first. */
export function parseReadings(body, periodMs = HALF) {
  const rows = (body?.data || [])
    .map(([ts, v]) => ({ start: Number(ts) * 1000, end: Number(ts) * 1000 + periodMs, kwh: v == null || !Number.isFinite(Number(v)) ? null : Number(v) }))
    .filter((r) => Number.isFinite(r.start));
  return rows.sort((a, b) => a.start - b.start);
}

/** Live demand from /current → { w, at } or null (no Glow display/CAD: nothing live). */
export function parseCurrent(body) {
  const row = body?.data?.[0];
  if (!row) return null;
  const at = Number(row[0]) * 1000, v = Number(row[1]);
  if (!Number.isFinite(at) || !Number.isFinite(v)) return null;
  const units = String(body.units || 'W');
  return { w: /^kW$/i.test(units) ? v * 1000 : v, at };
}

/** The electricity resources in the account: consumption (kWh) and its cost, if listed. */
export function pickResources(entities) {
  for (const ve of entities || []) {
    const res = ve.resources || [];
    const use = res.find((r) => r.classifier === 'electricity.consumption');
    if (use) return { ve: ve.veId, consumption: use.resourceId, cost: res.find((r) => r.classifier === 'electricity.consumption.cost')?.resourceId || '' };
  }
  return null;
}

/** Plain words for what went wrong. */
export function explainBrightError(e) {
  if (e instanceof TypeError) return new Error("Bright didn't answer this browser. If the weather works, Bright is blocking web pages: docs/bright.md has the free 5-minute fix.");
  if (e instanceof HttpError && (e.status === 401 || e.status === 403)) return new Error('Bright didn\'t accept the email and password (⚙ → Electricity). They\'re the ones you use in the Bright app.');
  if (e instanceof HttpError && e.status === 429) return new HttpError(429, 'Bright asked the panel to slow down; it will try again later');
  return e;
}

export class Bright {
  constructor(settings, storage = globalThis.localStorage) {
    this.s = settings;
    this.storage = storage;
    this.signing = null;
    this.mem = null; // the sign-in, also kept here in case storage is full or blocked
    this.signedAt = 0; // when this tab last signed in
    this.refused = null; // { user, pass, at }: Bright said no to these, so don't ask again for a while
  }

  get configured() { return !!(this.s.bright.username && this.s.bright.password); }

  /** Glowmarkt, or the optional relay in front of it (docs/bright.md). */
  get base() {
    const p = (this.s.bright.proxy || '').trim().replace(/\/+$/, '');
    if (!p) return `${GLOW_API}/api/v0-1`;
    if (!/^https:\/\/[^/]+$/.test(p)) throw new Error('The Bright relay address must look like https://name.example.workers.dev');
    if (!cspAllows(p)) throw new Error(`Add ${p} to connect-src in web/index.html first (see docs/bright.md)`);
    return `${p}/api/v0-1`;
  }

  #saved() {
    // A sign-in belongs to the account it was made with.
    const mine = (t) => (t?.token && t.user === this.s.bright.username ? t : null);
    if (mine(this.mem)) return this.mem;
    try { return mine(JSON.parse(this.storage.getItem(TOKEN_KEY) || 'null')); } catch { return null; }
  }

  forget() {
    this.mem = null;
    try { this.storage.removeItem(TOKEN_KEY); } catch { /* fine */ }
  }

  /** A sign-in token (a week long), reused until a day before it runs out. One sign-in at a time. */
  async token(now = Date.now()) {
    const t = this.#saved();
    if (t && t.exp - 864e5 > now) return t.token;
    const { username: user, password: pass } = this.s.bright;
    // A refused email and password aren't tried again for a few hours (or until they're changed),
    // so a password changed in the Bright app doesn't mean a failed sign-in every few minutes.
    const r = this.refused;
    if (r && r.user === user && r.pass === pass && now - r.at < 6 * HOUR) throw new HttpError(401, 'Bright sign-in refused');
    this.signing ??= (async () => {
      let body;
      try {
        body = await fetchJSON(`${this.base}/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', applicationId: BRIGHT_APP_ID },
          body: JSON.stringify({ username: user, password: pass }),
        });
        if (!body?.valid || !body.token) throw new HttpError(401, 'Bright sign-in refused');
      } catch (e) {
        if (e instanceof HttpError && (e.status === 401 || e.status === 403)) this.refused = { user, pass, at: now };
        throw e;
      }
      this.refused = null;
      const exp = Number(body.exp) > 1e12 ? Number(body.exp) : Number(body.exp) * 1000;
      const saved = { token: body.token, exp: Number.isFinite(exp) && exp > now ? exp : now + 6 * 864e5, user };
      this.mem = saved;
      this.signedAt = Date.now();
      try { this.storage.setItem(TOKEN_KEY, JSON.stringify(saved)); } catch { /* kept in memory instead */ }
      return saved.token;
    })().finally(() => { this.signing = null; });
    return this.signing;
  }

  /**
   * A Glowmarkt call. A refused sign-in from earlier (run out or revoked) is dropped and renewed
   * once; one from the last hour is kept, as signing in again wouldn't change Bright's answer.
   */
  async api(path, { params, method = 'GET' } = {}) {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    for (let attempt = 0; ; attempt++) {
      const old = !!this.#saved() && Date.now() - this.signedAt > HOUR;
      let token;
      try { token = await this.token(); } catch (e) { throw explainBrightError(e); }
      try {
        return await fetchJSON(`${this.base}/${path}${qs}`, { method, headers: { 'Content-Type': 'application/json', applicationId: BRIGHT_APP_ID, token } });
      } catch (e) {
        const refused = e instanceof HttpError && (e.status === 401 || e.status === 403);
        if (refused && old) {
          this.forget();
          if (attempt === 0) continue;
        }
        // Signed in just now, yet refused: the password is fine, it's this meter (another account's?).
        if (refused) throw new Error("Bright accepted the sign-in but won't share this meter's readings. Press Connect in ⚙ → Electricity to look the meter up again.");
        throw explainBrightError(e);
      }
    }
  }

  /** Find the meter's electricity readings in the account, and whether a Glow display/CAD gives live usage. */
  async discover(now = Date.now()) {
    let found;
    try {
      const list = await this.api('virtualentity');
      found = pickResources(list);
      // Some accounts list the resources separately.
      for (const ve of list || []) {
        if (found) break;
        found = pickResources([{ veId: ve.veId, resources: (await this.api(`virtualentity/${encodeURIComponent(ve.veId)}/resources`))?.resources }]);
      }
    } catch (e) {
      throw explainBrightError(e);
    }
    if (!found) throw new Error('Bright has no electricity readings for this account yet. Open the Bright app and finish connecting your meter.');
    let live = false;
    try { const c = await this.current(found.consumption); live = !!c && now - c.at < 15 * 60e3; } catch { /* no Glow: no live usage */ }
    return { ...found, live, at: now, user: this.s.bright.username };
  }

  /** Half-hourly kWh from `from` to `to` (Bright's own clock is UTC; the panel works out the days). */
  async readings(resource, from, to) {
    const body = await this.api(`resource/${encodeURIComponent(resource)}/readings`, {
      params: { from: glowTime(from), to: glowTime(to), period: 'PT30M', offset: 0, function: 'sum', nulls: 1 },
    });
    return parseReadings(body).filter((r) => r.start >= from && r.start < to);
  }

  /** Live demand from a Glow display/CAD: { w, at }, or null. */
  async current(resource) {
    return parseCurrent(await this.api(`resource/${encodeURIComponent(resource)}/current`));
  }

  /** Ask Bright to fetch the newest half hours from the meter (Hildebrand: at most every half hour). */
  async catchup(resource) {
    return this.api(`resource/${encodeURIComponent(resource)}/catchup`);
  }
}

/** kWh in [from, to) from half-hourly readings: { kwh, slots (with readings), last (end of the newest) }. */
export function usageBetween(slots, from, to) {
  let kwh = 0, n = 0, last = null;
  for (const s of slots || []) {
    if (s.start < from || s.start >= to || s.kwh == null) continue;
    kwh += s.kwh;
    n++;
    last = Math.max(last ?? 0, s.end);
  }
  return { kwh, slots: n, last };
}

/** Pounds for a day's use on a fixed tariff: kWh × unit rate + the daily standing charge (pence in, pence out). */
export const fixedCost = (kwh, { unitRate = 0, standing = 0 } = {}) => kwh * (Number(unitRate) || 0) + (Number(standing) || 0);
