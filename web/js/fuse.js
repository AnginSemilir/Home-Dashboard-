// SPDX-License-Identifier: AGPL-3.0-only
// Fuse Energy client. Based on simonsolts/fuse-homeassistant (Copyright (C) 2026 Simon Solts,
// AGPL-3.0-only) and yakupafsin/fuse-energy-ha (Copyright (c) 2026 Yakup Afsin, MIT; see
// LICENSES/). Translated to JavaScript and changed for the wall panel, Oct 2026. See NOTICE.
//
// Electricity and gas usage from Fuse Energy's private mobile API (Fuse has no public one). It
// signs in with a mobile number and an SMS code, then reads the same hourly chart the Fuse app
// shows: hourly bars per supply, about an hour behind, with the hour in progress climbing as the
// meter reports. Nothing here is live (watts): that needs a Glow display on the meter.
//
// The sign-in tokens and a device ID live on this tablet (their own key, not the settings, and not
// in a settings export: they rotate, so two browsers sharing them would sign each other out).
// They go only to Fuse, or to the optional relay (docs/fuse.md).

import { fetchJSON, HttpError } from './util.js';
import { cspAllows } from './octopus.js';
import { startOfDay, partsInTz, localToMs, dayKey, DEFAULT_TZ } from './time.js';

export const FUSE_API = 'https://api.fuseenergy.com';
export const FUSE_WEB = 'https://www.fuseenergy.com';
// The website's sign-in call carries this as `x-fuse-app-version`. Fuse turned old values away
// before (HTTP 426 / 500), though the SMS call currently accepts anything. If sign-in starts failing
// with a version complaint, bump this to the value the Fuse website sends. Read off the live
// web app on 20 Sep 2026 (yakupafsin/fuse-energy-ha const.py).
export const FUSE_APP_VERSION = '0.5.388';
const TOKEN_KEY = 'wallpanel.fuse.v1'; // { deviceId, access, refresh }
const HOUR = 3600e3;

/** Fuse ended the session (its refresh was refused): a new SMS code is needed. Never retried by itself. */
export class FuseSignedOut extends Error {
  constructor(message = 'Fuse signed the panel out. ⚙ → Electricity → Send code to sign in again.') {
    super(message);
    this.name = 'FuseSignedOut';
  }
}

/** Fuse said no to a sign-in step; `code` is its reason (status_string / errorCode). */
export class FuseRefusal extends Error {
  constructor(code, message) {
    super(message || refusalWords(code));
    this.name = 'FuseRefusal';
    this.code = code;
  }
}

const REFUSALS = {
  incorrect_phone_number: "Fuse doesn't recognise that mobile number. Use the one on your Fuse account.",
  issue_otp_premature_retry: 'Fuse wants you to wait a few minutes before asking for another code. Try again then, without pressing the button in between.',
  rate_limited: 'Fuse wants you to wait a few minutes before asking for another code.',
  invalid_code: "That code isn't right, or it has run out. Check the text message, or press Send code for a new one.",
  flow_not_started: 'Press Send code first.',
};
const refusalWords = (code) => REFUSALS[code] || `Fuse wouldn't continue (${code}). Press Send code to start again.`;

/** Plain words for what went wrong (like explainBrightError for Bright). */
export function explainFuseError(e) {
  if (e instanceof FuseSignedOut || e instanceof FuseRefusal) return e;
  if (e instanceof TypeError) return new Error("Fuse didn't answer this browser. If the weather works, Fuse is blocking web pages: docs/fuse.md has the free 5-minute fix.");
  if (e instanceof HttpError && (e.status === 401 || e.status === 403)) return new Error("Fuse didn't accept the panel's sign-in. ⚙ → Electricity → Send code to sign in again.");
  if (e instanceof HttpError && e.status === 426) return new HttpError(426, 'Fuse wants a newer app version. Update FUSE_APP_VERSION in web/js/fuse.js (docs/fuse.md says how).');
  if (e instanceof HttpError && e.status === 429) return new HttpError(429, 'Fuse asked the panel to slow down; it will try again later');
  return e;
}

// ---------- Sign-in parsing ----------

/**
 * Find Fuse's refusal code in the SMS call's body, whatever envelope it used. tRPC answers application
 * errors with HTTP 200 and the reason in the body, in several shapes: the procedure's own
 * `result.data.error`, a top-level `error`, either wrapped again in `json` (superjson), and any of
 * those inside a list (a batch). Only containers actually named `error` are searched: a missed
 * shape costs one confused user, but a false positive would break sign-in for everyone.
 */
export function refusalCode(payload) {
  if (Array.isArray(payload)) {
    for (const p of payload) { const c = refusalCode(p); if (c) return c; }
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  for (const key of ['json', 'result', 'data']) {
    const c = payload[key] != null ? refusalCode(payload[key]) : null;
    if (c) return c;
  }
  return payload.error != null ? codeInError(payload.error) : null;
}

function codeInError(error) {
  if (typeof error === 'string') return error || null;
  if (!error || typeof error !== 'object') return null;
  if (error.errorCode != null && error.errorCode !== '') return String(error.errorCode);
  // Look underneath before `code`: tRPC puts a numeric JSON-RPC code on top and the useful
  // string one below it.
  for (const key of ['json', 'data']) {
    const c = error[key] != null ? codeInError(error[key]) : null;
    if (c) return c;
  }
  return error.code != null && error.code !== '' ? String(error.code) : null;
}

/** A mobile number in the +44… shape Fuse takes, or null if it can't be one. */
export function normalisePhone(text) {
  let t = String(text || '').replace(/[\s().-]/g, '');
  if (/^\+?44/.test(t) && !t.startsWith('+')) t = `+${t}`;
  else if (t.startsWith('00')) t = `+${t.slice(2)}`;
  else if (t.startsWith('0')) t = `+44${t.slice(1)}`;
  return /^\+\d{10,15}$/.test(t) ? t : null;
}

/** A typed date of birth as YYYY-MM-DD (Fuse refuses anything else), or null. Day first for UK users. */
export function normaliseDateAnswer(text) {
  const t = String(text || '').trim();
  const real = (y, m, d) => {
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
      ? `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  };
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return real(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t); // 04/03/1965, 4-3-1965, 04.03.1965
  if (m) return real(+m[3], +m[2], +m[1]);
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(t);
  return m ? real(+m[1], +m[2], +m[3]) : null;
}

/** An access token's expiry (ms) from its JWT `exp`, or null if it isn't one. */
function jwtExpiry(token) {
  try {
    const body = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const exp = Number(JSON.parse(atob(body)).exp);
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch { return null; }
}

/** What an auth answer means: signed in (tokens saved by the caller), or Fuse has more questions. */
function interpret(payload) {
  const challenge = payload?.challenge_type;
  const data = payload?.data || {};
  if (challenge === 'AUTHORIZED') {
    if (!data.access_token || !data.refresh_token) throw new FuseRefusal('bad_response', 'Fuse said you were signed in but sent no tokens. Press Send code to try again.');
    return { done: true, access: data.access_token, refresh: data.refresh_token };
  }
  if (challenge === 'ADDITIONAL_INFO') {
    return {
      done: false,
      title: data.title || '',
      subtitle: data.subtitle || '',
      questions: (data.questions || []).filter((q) => q?.key).map((q) => ({ key: q.key, title: q.title || q.key, kind: q.type === 'DATE' ? 'DATE' : 'TEXT' })),
    };
  }
  throw new FuseRefusal('unsupported_challenge', `Fuse asked for something the panel can't do yet (${challenge}). Please tell Claude.`);
}

export class Fuse {
  /** `locks`: navigator.locks (tabs take turns refreshing); `now`: the clock (tests set it). */
  constructor(settings, storage = globalThis.localStorage, { locks = globalThis.navigator?.locks, now = () => Date.now() } = {}) {
    this.s = settings;
    this.storage = storage;
    this.locks = locks;
    this.now = now;
    this.flow = null; // the sign-in's short-lived token, between "Send code" and "Sign in" (memory only)
    this.refreshing = null;
    this.mem = null;
  }

  // ----- Where it talks to: Fuse, or the optional relay (docs/fuse.md) -----

  #relay() {
    const p = (this.s.fuse.proxy || '').trim().replace(/\/+$/, '');
    if (!p) return '';
    if (!/^https:\/\/[^/]+$/.test(p)) throw new Error('The Fuse relay address must look like https://name.example.workers.dev');
    if (!cspAllows(p)) throw new Error(`Add ${p} to connect-src in web/index.html first (see docs/fuse.md)`);
    return p;
  }

  /** The mobile API's address for a path like /api/v3/auth. */
  url(path) { return `${this.#relay() || FUSE_API}${path}`; }

  /** The website's SMS call (the relay maps /web/… to www.fuseenergy.com). */
  smsUrl() { const r = this.#relay(); return r ? `${r}/web/api/trpc/phoneSignIn` : `${FUSE_WEB}/api/trpc/phoneSignIn`; }

  // ----- What's kept on this tablet -----

  /** What's stored, read every time (another tab may have refreshed). Writes nothing. */
  #peek() {
    // The copy in memory is for a storage that is full or blocked, so the sign-in isn't lost to it.
    let t = null;
    try { t = JSON.parse(this.storage.getItem(TOKEN_KEY) || 'null'); } catch { /* use the copy in memory */ }
    return t && typeof t === 'object' ? t : { ...(this.mem || {}) };
  }

  #load() {
    const t = this.#peek();
    if (!t.deviceId) {
      // Fuse ties a session to its device ID, so it's made once and kept, even across sign-out.
      t.deviceId = globalThis.crypto.randomUUID();
      this.#save(t);
    }
    return t;
  }

  #save(t) { this.mem = t; try { this.storage.setItem(TOKEN_KEY, JSON.stringify(t)); } catch { /* the sign-in only lasts until the page reloads then */ } }

  get deviceId() { return this.#load().deviceId; }

  get signedIn() { const t = this.#peek(); return !!(t.access && t.refresh); }

  signOut() { const { deviceId } = this.#load(); this.flow = null; this.#save({ deviceId }); }

  // ----- Signing in: a number, an SMS code, sometimes identity questions -----

  async #auth(body, bearer) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'Device-Id': this.deviceId };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    try {
      return await fetchJSON(this.url('/api/v3/auth'), { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (e) {
      // Fuse names its reason in `status_string`; a server fault isn't the user's to fix.
      if (e instanceof HttpError && e.status >= 400 && e.status < 500 && ![401, 403, 426, 429].includes(e.status)) throw new FuseRefusal(String(e.body?.status_string || 'unknown'));
      if (e instanceof HttpError && [401, 403].includes(e.status)) throw new FuseRefusal(String(e.body?.status_string || 'invalid_code'));
      if (e instanceof HttpError && e.status >= 500) throw new Error(`Fuse had a problem (${e.status}). Try again in a few minutes.`);
      throw explainFuseError(e);
    }
  }

  /**
   * "Send code": two calls, because Fuse splits them. The first starts the sign-in (and sends nothing);
   * the second, on Fuse's website, is what makes the SMS go. Only ever called by the user's own tap.
   */
  async startSignIn(phoneText) {
    const phone = normalisePhone(phoneText);
    if (!phone) throw new FuseRefusal('incorrect_phone_number', 'Check the mobile number: it should look like 07700 900123.');
    this.flow = null;
    const first = await this.#auth({ challenge_type: 'INITIAL', data: { method: 'PHONE', data: { phone_number: phone, prelude_dispatch_id: null } } });
    if (!first?.auth_flow_token) throw new FuseRefusal('bad_response', 'Fuse started the sign-in but gave no way to continue. Try again in a few minutes.');
    this.flow = first.auth_flow_token;
    await this.#sendSms(phone);
  }

  async #sendSms(phone) {
    let body;
    try {
      body = await fetchJSON(this.smsUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-fuse-app-version': FUSE_APP_VERSION },
        body: JSON.stringify({ phone }),
      });
    } catch (e) {
      if (e instanceof HttpError && e.status < 500) throw new FuseRefusal(refusalCode(e.body) || `http_${e.status}`);
      if (e instanceof HttpError) throw new Error(`Fuse's website had a problem (${e.status}) sending the code. Try again in a few minutes.`);
      throw explainFuseError(e);
    }
    // Refusals arrive as HTTP 200 with the reason in the body: the body is the authority.
    const code = refusalCode(body);
    if (code) throw new FuseRefusal(code);
  }

  async #advance(body) {
    if (!this.flow) throw new FuseRefusal('flow_not_started');
    const answer = await this.#auth(body, this.flow);
    // Fuse reissues the flow token between steps: keep the newest.
    if (answer?.auth_flow_token) this.flow = answer.auth_flow_token;
    const result = interpret(answer);
    if (result.done) {
      this.flow = null;
      this.#save({ ...this.#load(), access: result.access, refresh: result.refresh });
      return { done: true };
    }
    return result;
  }

  /** "Sign in": the six-digit code. Returns { done: true }, or Fuse's identity questions. */
  submitCode(code) { return this.#advance({ challenge_type: 'PHONE_OTP', data: { code: String(code || '').replace(/\s/g, '') } }); }

  /** Answers to identity questions ({ DATE_OF_BIRTH: '1965-03-04' }); Fuse may ask again. */
  answer(responses) { return this.#advance({ challenge_type: 'ADDITIONAL_INFO', data: { responses } }); }

  // ----- Staying signed in: both tokens rotate on every refresh -----

  /**
   * Swap the token pair for a new one, once, however many callers (or tabs) hit a 401 together.
   * `used` is the access token the caller sent: if storage has moved on, someone already refreshed.
   * The new pair is saved before anything uses it, because Fuse kills the old refresh token at once.
   */
  refresh(used) {
    const run = async () => {
      const t = this.#load();
      if (!t.refresh) throw new FuseSignedOut();
      if (used && t.access && t.access !== used) return t.access;
      let body;
      try {
        body = await fetchJSON(this.url('/api/v1/auth/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Device-Id': t.deviceId, Authorization: `Bearer ${t.access}` },
          body: JSON.stringify({ refresh_token: t.refresh, original_request_path: null }),
        });
      } catch (e) {
        // A refusal means the session is over; a server or network fault just means try later.
        if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 429) { this.#save({ deviceId: t.deviceId }); throw new FuseSignedOut(); }
        throw explainFuseError(e);
      }
      if (!body?.access_token || !body?.refresh_token) throw new Error("Fuse's reply to the sign-in renewal was missing its tokens. The panel will try again.");
      this.#save({ deviceId: t.deviceId, access: body.access_token, refresh: body.refresh_token });
      return body.access_token;
    };
    this.refreshing ??= (this.locks ? this.locks.request('wallpanel-fuse-refresh', run) : run()).finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  /** A signed-in GET (renewing the sign-in first if it's about to run out, or once on a 401). */
  async api(path, params) {
    let t = this.#load();
    if (!t.access || !t.refresh) throw new FuseSignedOut();
    const exp = jwtExpiry(t.access);
    if (exp && exp - this.now() < 60e3) { await this.refresh(t.access); t = this.#load(); }
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetchJSON(`${this.url(path)}${qs}`, { headers: { Accept: 'application/json', 'Device-Id': t.deviceId, Authorization: `Bearer ${t.access}` } });
      } catch (e) {
        if (attempt === 0 && e instanceof HttpError && e.status === 401) { await this.refresh(t.access); t = this.#load(); continue; }
        throw explainFuseError(e);
      }
    }
  }

  // ----- The data -----

  /** The first property on the account: { id, name }. */
  async premises() {
    const list = await this.api('/api/v2/customer/premises');
    for (const entry of Array.isArray(list) ? list : []) {
      const p = entry?.premises;
      if (p?.id) return { id: String(p.id), name: p.address_line_1 || p.name || '' };
    }
    throw new Error("Fuse shows no property on this account. Open the Fuse app and check it's set up.");
  }

  /** One day's hourly bars (ymd 'YYYY-MM-DD', UK time): { elec, gas, export, current }. */
  async day(premisesId, ymd, tz = DEFAULT_TZ) {
    const [year, month, day] = ymd.split('-').map(Number);
    const body = await this.api(`/api/v1/premises/${encodeURIComponent(premisesId)}/chart`, { year, month, day });
    return parseChart(body, ymd, { tz, now: this.now() });
  }
}

// ---------- Reading the chart ----------

const num = (v) => { const n = Number(v); return v == null || v === '' || !Number.isFinite(n) ? null : n; };

/**
 * An hour's cost in pence. Fuse states it twice: `money.amount`, truncated to the penny, and a
 * `breakdown` of components (usage, standing charge…) to 4 decimals. The rounded figure runs about
 * 10% low (checked against the Fuse app), so the components are summed; every one is added, so a
 * tariff with a levy or a discount stays right. Null if the bar has neither.
 */
function barPence(entry) {
  const parts = (Array.isArray(entry.breakdown) ? entry.breakdown : []).map((c) => num(c?.value?.amount)).filter((n) => n != null);
  const pounds = parts.length ? parts.reduce((a, b) => a + b, 0) : num(entry.bar?.money?.amount);
  return pounds == null ? null : Math.round(pounds * 1e4) / 100;
}

const standingPence = (entry) => {
  const parts = (Array.isArray(entry.breakdown) ? entry.breakdown : []).filter((c) => /standing/i.test(c?.name || '')).map((c) => num(c?.value?.amount)).filter((n) => n != null);
  return Math.round(parts.reduce((a, b) => a + b, 0) * 1e4) / 100;
};

const FUELS = { ELEC_IMPORT: 'elec', ELEC_EXPORT: 'export', GAS: 'gas' };

/**
 * A day's chart → { elec, gas, export: Hour[], has, current }, each Hour { start, end, kwh, pence,
 * standingP, inProgress } (epoch ms; oldest first). `has` says which supplies the account lists
 * at all (a gas meter with no readings yet is not the same as no gas).
 *
 * - Fuse numbers the bars by UK clock hour. Each is placed on the day's real hours, so the 25-hour
 *   day in October (hour 1 comes twice: the second is GMT) and the 23-hour day in March come out right.
 * - Only REALISED bars count; later hours are FORECASTED. Bars from other days (padding) are dropped.
 * - The hour in progress is REALISED too, with a value that climbs as the meter reports (it steps at
 *   half past). It counts towards "today so far" and is marked `inProgress`.
 */
export function parseChart(body, ymd, { tz = DEFAULT_TZ, now = Date.now() } = {}) {
  const out = { elec: [], gas: [], export: [], has: { elec: false, gas: false, export: false }, current: null };
  const [Y, M, D] = ymd.split('-').map(Number);
  const noon = localToMs(`${ymd}T12:00`, tz);
  const first = startOfDay(noon, tz), end = startOfDay(noon, tz, 1);
  const byHour = new Map(); // local clock hour → the real hours (UTC starts) that show it
  for (let t = first; t < end; t += HOUR) {
    const h = partsInTz(t, tz).h;
    byHour.set(h, [...(byHour.get(h) || []), t]);
  }
  const sameDay = (i) => +i?.year === Y && +i?.month === M && +i?.day === D;
  const cur = body?.current_index;
  for (const supply of Array.isArray(body?.supplies) ? body.supplies : []) {
    const fuel = FUELS[supply?.supply_type];
    if (!fuel) continue;
    out.has[fuel] = true;
    const seen = new Map();
    for (const entry of Array.isArray(supply.bars) ? supply.bars : []) {
      const bar = entry?.bar;
      if (!bar || !sameDay(bar.index)) continue;
      const hour = Number(bar.index.hour);
      const nth = seen.get(hour) || 0;
      seen.set(hour, nth + 1);
      const start = byHour.get(hour)?.[nth];
      const kwh = num(bar.kWh ?? bar.kwh);
      const pence = barPence(entry);
      if (start == null || kwh == null || pence == null || bar.type !== 'REALISED') continue;
      const isCurrent = (sameDay(cur) && Number(cur.hour) === hour && nth === 0) || (start <= now && now < start + HOUR);
      out[fuel].push({ start, end: start + HOUR, kwh, pence, standingP: standingPence(entry), inProgress: isCurrent });
      if (isCurrent) out.current = start;
    }
    out[fuel].sort((a, b) => a.start - b.start);
  }
  return out;
}

/**
 * kWh and pence for some hours, and when the readings reach: { kwh, pence, hours, last }. `last` is the
 * end of the newest hour with usage; for the hour in progress it's half past (Fuse updates it then).
 */
export function dayTotals(hours) {
  let kwh = 0, pence = 0, last = null, n = 0;
  for (const h of hours || []) {
    kwh += h.kwh;
    pence += h.pence;
    if (h.kwh > 0) { n++; last = Math.max(last ?? 0, h.inProgress ? h.start + HOUR / 2 : h.end); }
  }
  return { kwh, pence, hours: n, last };
}

/** Today's date as the chart wants it. */
export const fuseDay = (ms, tz = DEFAULT_TZ) => dayKey(ms, tz);
