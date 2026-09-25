// Google sign-in for Nest (Smart Device Management) and Calendar, done entirely in the
// browser the same way Google's own sample does (google/device-access-sample-web-app):
// authorisation-code flow → refresh token → short-lived access tokens.

import { fetchJSON, HttpError } from './util.js';

export const SCOPE_SDM = 'https://www.googleapis.com/auth/sdm.service';
export const SCOPE_CAL = 'https://www.googleapis.com/auth/calendar.readonly';
// oauth2.googleapis.com is the documented endpoint; the second is the one Google's sample uses.
export const TOKEN_URLS = ['https://oauth2.googleapis.com/token', 'https://www.googleapis.com/oauth2/v4/token'];

/** The exact redirect URI to register in Google Cloud: this page's address without query/hash. */
export function redirectUri(loc = globalThis.location) {
  return `${loc.origin}${loc.pathname.replace(/index\.html$/, '')}`;
}

/** Where to send the user to sign in. With a Nest project ID, Google's device picker is shown too. */
export function authUrl(g, redirect, state) {
  const scopes = [g.projectId ? SCOPE_SDM : null, SCOPE_CAL].filter(Boolean).join(' ');
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
      return await call(false);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) return call(true);
      throw e;
    }
  }
}
