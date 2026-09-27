// Google sign-in for Nest (Smart Device Management) and Calendar, done entirely in the
// browser the same way Google's own sample does (google/device-access-sample-web-app):
// authorisation-code flow → refresh token → short-lived access tokens.

import { fetchJSON, HttpError } from './util.js';

export const SCOPE_SDM = 'https://www.googleapis.com/auth/sdm.service';
export const SCOPE_CAL = 'https://www.googleapis.com/auth/calendar.readonly';
export const SCOPE_TASKS = 'https://www.googleapis.com/auth/tasks'; // the shopping list (Google Tasks)
// oauth2.googleapis.com is the documented endpoint; the second is the one Google's sample uses.
export const TOKEN_URLS = ['https://oauth2.googleapis.com/token', 'https://www.googleapis.com/oauth2/v4/token'];

// What each Google API is called in the Cloud console, and what it's for on the panel.
const APIS = [
  { host: 'smartdevicemanagement.googleapis.com', service: 'smartdevicemanagement.googleapis.com', title: 'Smart Device Management API', what: 'your Nest devices' },
  { host: 'www.googleapis.com', path: '/calendar/', service: 'calendar-json.googleapis.com', title: 'Google Calendar API', what: 'Google Calendar' },
  { host: 'www.googleapis.com', path: '/tasks/', service: 'tasks.googleapis.com', title: 'Google Tasks API', what: 'Google Tasks (the shopping list)' },
];
const CONSOLE_HOSTS = ['console.cloud.google.com', 'console.developers.google.com'];

/**
 * Google's "403 Forbidden" in plain words. Two causes the owner can fix: the API is switched
 * off in their Cloud project (the error then carries a link that turns it on), or their
 * sign-in didn't allow this part. Anything else is returned unchanged.
 */
export function explainGoogleError(e, url = '') {
  if (!(e instanceof HttpError) || e.status !== 403) return e;
  const err = (e.body && typeof e.body === 'object' && e.body.error && typeof e.body.error === 'object') ? e.body.error : {};
  const info = (Array.isArray(err.details) ? err.details : []).find((d) => String(d?.['@type'] || '').endsWith('google.rpc.ErrorInfo')) || {};
  const meta = info.metadata || {};
  const reasons = [info.reason, ...(Array.isArray(err.errors) ? err.errors.map((x) => x?.reason) : [])].filter(Boolean).join(' ');
  const text = String(err.message || '');
  let u = null;
  try { u = new URL(url); } catch { /* no URL: work from the error alone */ }
  const api = APIS.find((a) => a.service === meta.service)
    || APIS.find((a) => u && u.host === a.host && (!a.path || u.pathname.startsWith(a.path)))
    || { title: meta.serviceTitle || 'Google API', what: 'this part of the panel' };
  const title = meta.serviceTitle || api.title;
  if (/SERVICE_DISABLED|accessNotConfigured/.test(reasons) || /has not been used in project|API .*is disabled|it is disabled/i.test(text)) {
    // The project Google means is the one the panel's OAuth client belongs to (the number at
    // the start of the client ID), which isn't always the one open in the Cloud console.
    const n = String(meta.containerInfo || meta.consumer || (/in project (\S+) before/i.exec(text) || [])[1] || '').replace(/^projects\//, '');
    const project = /^[\w-]{1,64}$/.test(n) ? n : '';
    const out = new HttpError(403, project
      ? `The ${title} is switched off in Google Cloud project ${project} (the project your client ID belongs to). Turn it on (Google Cloud → APIs & Services → Library → ${title} → Enable), then allow a few minutes (up to 5) and try again. Still refused after 10 minutes? It was switched on in a different project: use the link, which opens project ${project}.`
      : `The ${title} is switched off in the Google Cloud project your client ID belongs to. Turn it on (Google Cloud → APIs & Services → Library → ${title} → Enable), then allow a few minutes (up to 5) and try again. Still refused after 10 minutes? It must be switched on in the project whose APIs & Services → Credentials page lists your client ID.`, e.body);
    let link = null;
    try {
      const a = new URL(meta.activationUrl);
      if (a.protocol === 'https:' && CONSOLE_HOSTS.includes(a.host)) link = a.href;
    } catch { /* no usable link in the error */ }
    if (!link && api.service) link = `https://console.cloud.google.com/apis/library/${api.service}${project ? `?project=${encodeURIComponent(project)}` : ''}`;
    if (link) out.link = { href: link, text: `Turn on the ${title}` };
    return out;
  }
  if (/ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions/.test(reasons) || /insufficient authentication scopes/i.test(text)) {
    // Google may show newly asked-for permissions unticked, so "make sure", not "leave".
    return new HttpError(403, `Your Google sign-in doesn't allow ${api.what}. In Chrome, ⚙ → Sign in with Google again, and make sure every box is ticked on Google's screen (or tick Select all).`, e.body);
  }
  return e;
}

/** The exact redirect URI to register in Google Cloud: this page's address without query/hash. */
export function redirectUri(loc = globalThis.location) {
  return `${loc.origin}${loc.pathname.replace(/index\.html$/, '')}`;
}

/** Where to send the user to sign in. With a Nest project ID, Google's device picker is shown too. */
export function authUrl(g, redirect, state) {
  const scopes = [g.projectId ? SCOPE_SDM : null, SCOPE_CAL, SCOPE_TASKS].filter(Boolean).join(' ');
  const base = g.projectId
    ? `https://nestservices.google.com/partnerconnections/${encodeURIComponent(g.projectId)}/auth`
    : 'https://accounts.google.com/o/oauth2/v2/auth';
  const params = new URLSearchParams({
    client_id: g.clientId,
    redirect_uri: redirect,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: scopes,
    state,
  });
  return `${base}?${params}`;
}

async function tokenRequest(params) {
  let lastErr;
  for (const url of TOKEN_URLS) {
    try {
      // Form encoding keeps this a "simple" cross-origin request (no CORS preflight).
      return await fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      });
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError) throw e; // Google answered: don't retry elsewhere
    }
  }
  throw lastErr;
}

export async function exchangeCode(g, code, redirect) {
  return tokenRequest({
    code,
    client_id: g.clientId,
    client_secret: g.clientSecret,
    redirect_uri: redirect,
    grant_type: 'authorization_code',
  });
}

export class Google {
  constructor(settings, save) {
    this.s = settings;
    this.save = save;
    this.access = null;
    this.accessExp = 0;
  }

  get signedIn() { return !!this.s.google.refreshToken; }
  /** Signed in with permission for Google Tasks (older sign-ins need to sign in again). */
  get hasTasks() { return !!(this.s.google.refreshToken && this.s.google.scopes.includes('/auth/tasks')); }

  get hasNest() { return !!(this.s.google.projectId && this.s.google.scopes.includes('sdm.service')); }

  /** Start sign-in (navigates away to Google). */
  signIn(loc = globalThis.location, storage = globalThis.sessionStorage) {
    const state = crypto.getRandomValues(new Uint32Array(4)).join('-');
    storage.setItem('wallpanel.oauth.state', state);
    loc.assign(authUrl(this.s.google, redirectUri(loc), state));
  }

  /**
   * If this page load is Google's redirect back (?code=…&state=…), finish sign-in.
   * Returns 'signed-in', 'error: …' or null when there was nothing to do.
   */
  async handleRedirect(loc = globalThis.location, storage = globalThis.sessionStorage, history = globalThis.history) {
    const params = new URLSearchParams(loc.search);
    if (!params.has('code') && !params.has('error')) return null;
    const clean = () => history.replaceState(null, '', redirectUri(loc) + loc.hash);
    const expected = storage.getItem('wallpanel.oauth.state');
    storage.removeItem('wallpanel.oauth.state');
    if (params.get('error')) { clean(); return `error: ${params.get('error')}`; }
    if (!expected || params.get('state') !== expected) { clean(); return 'error: sign-in state did not match; please try again'; }
    try {
      const tok = await exchangeCode(this.s.google, params.get('code'), redirectUri(loc));
      if (!tok.refresh_token) throw new Error('Google did not return a refresh token');
      this.s.google.refreshToken = tok.refresh_token;
      this.s.google.scopes = tok.scope || '';
      this.save();
      this.access = tok.access_token;
      this.accessExp = Date.now() + (tok.expires_in || 3600) * 1000;
      return 'signed-in';
    } catch (e) {
      return `error: ${e.message}`;
    } finally {
      clean();
    }
  }

  async accessToken(force = false) {
    if (!this.signedIn) throw new Error('Not signed in to Google');
    if (!force && this.access && Date.now() < this.accessExp - 60e3) return this.access;
    try {
      const tok = await tokenRequest({
        refresh_token: this.s.google.refreshToken,
        client_id: this.s.google.clientId,
        client_secret: this.s.google.clientSecret,
        grant_type: 'refresh_token',
      });
      this.access = tok.access_token;
      this.accessExp = Date.now() + (tok.expires_in || 3600) * 1000;
      return this.access;
    } catch (e) {
      if (e instanceof HttpError && e.body?.error === 'invalid_grant') {
        throw new Error('Google sign-in expired or was revoked: sign in again in Settings');
      }
      throw e;
    }
  }

  /** Authorised JSON request to a Google API; retries once with a fresh token on 401. */
  async api(url, opts = {}) {
    const call = async (force) => fetchJSON(url, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: `Bearer ${await this.accessToken(force)}` },
    });
    try {
      try {
        return await call(false);
      } catch (e) {
        if (e instanceof HttpError && e.status === 401) return await call(true);
        throw e;
      }
    } catch (e) {
      throw explainGoogleError(e, url);
    }
  }

  /** Which of the panel's Google parts this sign-in didn't allow, e.g. ['Google Tasks (the shopping list)']. */
  missingScopes() {
    const sc = this.s.google.scopes || '';
    return [
      this.s.google.projectId && !sc.includes('sdm.service') ? 'your Nest devices' : null,
      !sc.includes('/auth/calendar') ? 'Google Calendar' : null,
      !sc.includes('/auth/tasks') ? 'Google Tasks (the shopping list)' : null,
    ].filter(Boolean);
  }
}
