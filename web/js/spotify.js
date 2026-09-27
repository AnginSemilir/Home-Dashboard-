// Spotify: a remote control for whatever Spotify is playing on (the tablet's app, a speaker, a
// phone). The Web API with Authorization Code + PKCE, all in the browser: no client secret and
// no server. Spotify's rules (2026): the controls need Premium, a development-mode app works
// for up to 5 listed accounts, and a sign-in lasts at most 6 months. See docs/spotify.md.

import { fetchJSON, HttpError } from './util.js';

export const SPOTIFY_ACCOUNTS = 'https://accounts.spotify.com';
export const SPOTIFY_API = 'https://api.spotify.com/v1';
export const SPOTIFY_SCOPES = 'user-read-playback-state user-read-currently-playing user-modify-playback-state';
const TOKENS = 'wallpanel.spotify.v1';     // { refreshToken, access, accessExp }: kept apart from the
                                           // settings so Save & close can never put back an old token
const STATE = 'wallpanel.spotify.state';   // sign-in round trip (sessionStorage)
const VERIFIER = 'wallpanel.spotify.verifier';

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A PKCE code verifier: 64 random bytes as base64url (86 characters, within the 43–128 allowed). */
export const newVerifier = () => b64url(crypto.getRandomValues(new Uint8Array(64)));

/** Its S256 challenge. */
export async function challengeFor(verifier) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

/** What the panel needs from GET /me/player (null when nothing is loaded on any device). */
export function parsePlayer(b, now = Date.now()) {
  if (!b || typeof b !== 'object') return null;
  const it = b.item || null;
  const images = it?.album?.images || it?.images || it?.show?.images || [];
  // The smallest picture that's still sharp at about 300 px.
  const art = [...images].filter((i) => i?.url).sort((a, c) => (a.width || 0) - (c.width || 0)).find((i) => (i.width || 0) >= 280) || images[0];
  const d = b.device || null;
  return {
    playing: !!b.is_playing,
    title: it?.name || (b.currently_playing_type === 'ad' ? 'Advert' : ''),
    artist: it ? (it.artists || []).map((a) => a.name).filter(Boolean).join(', ') || it.show?.name || '' : '',
    art: art?.url || '',
    progress: Number(b.progress_ms) || 0,
    duration: Number(it?.duration_ms) || 0,
    at: now,
    shuffle: !!b.shuffle_state,
    device: d ? { id: d.id, name: d.name || 'Spotify', type: d.type || '', volume: d.volume_percent, supportsVolume: d.supports_volume !== false && d.volume_percent != null, restricted: !!d.is_restricted } : null,
  };
}

/** Spotify's errors in plain words. */
export function explainSpotifyError(e) {
  if (!(e instanceof HttpError)) return e;
  const reason = e.body?.error?.reason || '';
  const text = String(e.body?.error?.message || e.body?.error_description || '');
  const wrap = (msg) => Object.assign(new HttpError(e.status, msg, e.body), { reason });
  if (reason === 'PREMIUM_REQUIRED' || /premium required/i.test(text)) return wrap('Spotify only lets Premium accounts use the controls.');
  if (reason === 'NO_ACTIVE_DEVICE' || /no active device/i.test(text)) return wrap('Nothing is ready to play. Choose where to play, or open Spotify on the tablet.');
  if (/not registered|user may not be registered/i.test(text)) return wrap('This Spotify account isn\'t allowed to use your Spotify app yet: add it under User Management in the Spotify developer dashboard.');
  if (reason === 'VOLUME_CONTROL_DISALLOW') return wrap('This device doesn\'t let the panel change its volume.');
  if (e.status === 429) return wrap(/QUOTA/i.test(reason + text) ? 'Spotify has paused the panel\'s access for a while (too many requests). It will try again later.' : 'Spotify asked the panel to slow down. It will try again shortly.');
  return e;
}

export class Spotify {
  constructor(settings, { storage = globalThis.localStorage } = {}) {
    this.s = settings;
    this.store = storage;
    this.refreshing = null;
  }

  tokens() {
    try { return JSON.parse(this.store.getItem(TOKENS) || '{}') || {}; } catch { return {}; }
  }

  setTokens(t) {
    if (t) this.store.setItem(TOKENS, JSON.stringify(t)); else this.store.removeItem(TOKENS);
  }

  get connected() { return !!(this.s.spotify.clientId && this.tokens().refreshToken); }

  /** Spotify's sign-in page for this panel (the verifier and state wait in sessionStorage). */
  async authUrl(redirect, session = globalThis.sessionStorage) {
    const verifier = newVerifier();
    const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
    session.setItem(VERIFIER, verifier);
    session.setItem(STATE, state);
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: this.s.spotify.clientId,
      scope: SPOTIFY_SCOPES,
      redirect_uri: redirect,
      code_challenge_method: 'S256',
      code_challenge: await challengeFor(verifier),
      state,
    });
    return `${SPOTIFY_ACCOUNTS}/authorize?${q}`;
  }

  /**
   * Spotify's redirect back (?code=…&state=… with our state). Returns 'connected', 'error: …', or
   * null when this page load isn't Spotify's (Google's sign-in uses the same address).
   */
  async handleRedirect(loc = globalThis.location, session = globalThis.sessionStorage, history = globalThis.history, redirect) {
    const params = new URLSearchParams(loc.search);
    const expected = session.getItem(STATE);
    if (!expected || params.get('state') !== expected || !(params.has('code') || params.has('error'))) return null;
    const verifier = session.getItem(VERIFIER);
    session.removeItem(STATE);
    session.removeItem(VERIFIER);
    history.replaceState(null, '', redirect + loc.hash);
    if (params.get('error')) return `error: ${params.get('error') === 'access_denied' ? 'you chose not to allow it' : params.get('error')}`;
    try {
      const tok = await fetchJSON(`${SPOTIFY_ACCOUNTS}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code: params.get('code'), redirect_uri: redirect, client_id: this.s.spotify.clientId, code_verifier: verifier || '' }).toString(),
      });
      if (!tok?.refresh_token) throw new Error('Spotify did not return a sign-in to keep');
      this.setTokens({ refreshToken: tok.refresh_token, access: tok.access_token, accessExp: Date.now() + (tok.expires_in || 3600) * 1000 });
      return 'connected';
    } catch (e) {
      return `error: ${e.message}`;
    }
  }

  disconnect() { this.setTokens(null); }

  /** A current access token. Refreshes one at a time: Spotify replaces the refresh token as it goes. */
  async accessToken(force = false) {
    const t = this.tokens();
    if (!this.s.spotify.clientId || !t.refreshToken) throw new Error('Spotify isn\'t connected: ⚙ → Spotify → Connect Spotify');
    if (!force && t.access && Date.now() < t.accessExp - 60e3) return t.access;
    this.refreshing ??= (async () => {
      try {
        const tok = await fetchJSON(`${SPOTIFY_ACCOUNTS}/api/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refreshToken, client_id: this.s.spotify.clientId }).toString(),
        });
        // A new refresh token replaces the old one straight away; without one, keep the old.
        this.setTokens({ refreshToken: tok.refresh_token || t.refreshToken, access: tok.access_token, accessExp: Date.now() + (tok.expires_in || 3600) * 1000 });
        return tok.access_token;
      } catch (e) {
        if (e instanceof HttpError && e.status === 400 && /invalid_grant|invalid_client/.test(JSON.stringify(e.body || ''))) {
          this.setTokens(null);
          throw new Error('The Spotify sign-in has ended (Spotify ends them after 6 months, or when access is removed): ⚙ → Spotify → Connect Spotify again');
        }
        throw e;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  /** An authorised Web API call. Retries once with a fresh token on 401. */
  async api(method, path, body) {
    const call = async (force) => fetchJSON(`${SPOTIFY_API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await this.accessToken(force)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    try {
      try {
        return await call(false);
      } catch (e) {
        if (e instanceof HttpError && e.status === 401) return await call(true);
        throw e;
      }
    } catch (e) {
      throw explainSpotifyError(e);
    }
  }

  async player() { return parsePlayer(await this.api('GET', '/me/player?additional_types=episode')); }

  async devices() {
    const b = await this.api('GET', '/me/player/devices');
    return (b?.devices || []).filter((d) => d.id).map((d) => ({ id: d.id, name: d.name || 'Spotify', type: d.type || '', active: !!d.is_active, restricted: !!d.is_restricted, volume: d.volume_percent, supportsVolume: d.supports_volume !== false }));
  }

  play(deviceId) { return this.api('PUT', `/me/player/play${deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ''}`); }
  pause() { return this.api('PUT', '/me/player/pause'); }
  next() { return this.api('POST', '/me/player/next'); }
  previous() { return this.api('POST', '/me/player/previous'); }
  transfer(deviceId, play = true) { return this.api('PUT', '/me/player', { device_ids: [deviceId], play }); }
  volume(percent) { return this.api('PUT', `/me/player/volume?volume_percent=${Math.max(0, Math.min(100, Math.round(percent)))}`); }
}

/** Move the Spotify sign-in with "Copy settings" (only one browser may hold it: it rotates). */
export function exportSpotify(storage = globalThis.localStorage) {
  try { return JSON.parse(storage.getItem(TOKENS) || 'null')?.refreshToken || null; } catch { return null; }
}
export function importSpotify(refreshToken, storage = globalThis.localStorage) {
  if (typeof refreshToken === 'string' && refreshToken) storage.setItem(TOKENS, JSON.stringify({ refreshToken }));
}
