import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Spotify, challengeFor, newVerifier, parsePlayer, explainSpotifyError, exportSpotify, importSpotify, spotifyEnded, SPOTIFY_SCOPES } from '../../js/spotify.js';
import { HttpError } from '../../js/util.js';

const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const settings = (clientId = 'cid') => ({ spotify: { clientId } });

function fakeFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    const r = await handler(url, opts, calls.length);
    return { ok: (r.status || 200) < 400, status: r.status || 200, statusText: '', text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)) };
  };
  return calls;
}

test('PKCE: the S256 challenge matches RFC 7636, and verifiers are long and URL-safe', async () => {
  assert.equal(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  const v = newVerifier();
  assert.match(v, /^[A-Za-z0-9_-]{43,128}$/);
  assert.notEqual(v, newVerifier());
});

test('sign-in: the authorise address, then the code exchange; another app\'s redirect is left alone', async () => {
  const store = memStore(), session = memStore();
  const sp = new Spotify(settings(), { storage: store });
  const u = new URL(await sp.authUrl('https://me.github.io/p/', session));
  assert.equal(u.origin + u.pathname, 'https://accounts.spotify.com/authorize');
  assert.equal(u.searchParams.get('scope'), SPOTIFY_SCOPES);
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('code_challenge'), await challengeFor(session.getItem('wallpanel.spotify.verifier')));
  const state = u.searchParams.get('state');
  const hist = { replaceState(_a, _b, x) { this.url = x; } };

  // Google's redirect (a different state) isn't Spotify's.
  assert.equal(await sp.handleRedirect({ search: '?code=g&state=other', hash: '' }, session, hist, 'https://me.github.io/p/'), null);
  assert.equal(hist.url, undefined);

  const verifier = session.getItem('wallpanel.spotify.verifier');
  const calls = fakeFetch(() => ({ body: { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 } }));
  assert.equal(await sp.handleRedirect({ search: `?code=c1&state=${state}`, hash: '' }, session, hist, 'https://me.github.io/p/'), 'connected');
  const form = new URLSearchParams(calls[0].opts.body);
  assert.deepEqual(Object.fromEntries(form), { grant_type: 'authorization_code', code: 'c1', redirect_uri: 'https://me.github.io/p/', client_id: 'cid', code_verifier: verifier });
  assert.equal(hist.url, 'https://me.github.io/p/', 'code removed from the address');
  assert.equal(sp.connected, true);
  assert.equal(session.getItem('wallpanel.spotify.state'), null);
  // Cancelled on Spotify's page.
  const u2 = new URL(await sp.authUrl('https://me.github.io/p/', session));
  assert.match(await sp.handleRedirect({ search: `?error=access_denied&state=${u2.searchParams.get('state')}`, hash: '' }, session, hist, 'https://me.github.io/p/'), /chose not to allow/);
});

test('tokens: one refresh at a time, the rotated refresh token is kept, an ended sign-in disconnects', async () => {
  const store = memStore();
  importSpotify('rt-0', store);
  const sp = new Spotify(settings(), { storage: store });
  let n = 0;
  const calls = fakeFetch(async () => { n++; await new Promise((r) => setTimeout(r, 10)); return { body: { access_token: `at-${n}`, refresh_token: `rt-${n}`, expires_in: 3600 } }; });
  const [a, b] = await Promise.all([sp.accessToken(), sp.accessToken()]);
  assert.equal(a, 'at-1');
  assert.equal(b, 'at-1');
  assert.equal(calls.length, 1, 'single-flight');
  assert.equal(new URLSearchParams(calls[0].opts.body).get('refresh_token'), 'rt-0');
  assert.equal(exportSpotify(store), 'rt-1', 'rotated token saved');
  assert.equal(await sp.accessToken(), 'at-1', 'cached');
  // No new refresh token in the answer: keep the old one.
  fakeFetch(() => ({ body: { access_token: 'at-x', expires_in: 3600 } }));
  await sp.accessToken(true);
  assert.equal(exportSpotify(store), 'rt-1');
  // Spotify ended the sign-in (6 months, or access removed).
  fakeFetch(() => ({ status: 400, body: { error: 'invalid_grant', error_description: 'Refresh token revoked' } }));
  await assert.rejects(sp.accessToken(true), /Connect Spotify again/);
  assert.equal(sp.connected, false);
});

test('api: retries once on 401 with a fresh token; 204 is "nothing"; errors are explained', async () => {
  const store = memStore();
  importSpotify('rt-0', store);
  const sp = new Spotify(settings(), { storage: store });
  let tokenCalls = 0;
  const calls = fakeFetch((url, _o, i) => {
    if (url.includes('/api/token')) { tokenCalls++; return { body: { access_token: `at-${tokenCalls}`, expires_in: 3600 } }; }
    const apiCalls = calls.filter((c) => !c.url.includes('/api/token')).length;
    return apiCalls === 1 ? { status: 401, body: { error: { status: 401, message: 'The access token expired' } } } : { status: 204 };
  });
  assert.equal(await sp.player(), null);
  assert.equal(tokenCalls, 2);
  fakeFetch((url) => (url.includes('/api/token') ? { body: { access_token: 'at', expires_in: 3600 } } : { status: 403, body: { error: { status: 403, message: 'Player command failed: Premium required', reason: 'PREMIUM_REQUIRED' } } }));
  await assert.rejects(sp.pause(), /Premium/);
});

test('parsePlayer: a track, an episode, nothing', () => {
  const t = parsePlayer({
    is_playing: true, progress_ms: 61000, shuffle_state: false, currently_playing_type: 'track',
    item: { name: 'Here Comes the Sun', duration_ms: 185000, artists: [{ name: 'The Beatles' }, { name: 'Friend' }], album: { images: [{ url: 'https://i.scdn.co/big', width: 640 }, { url: 'https://i.scdn.co/mid', width: 300 }, { url: 'https://i.scdn.co/small', width: 64 }] } },
    device: { id: 'k', name: 'Kitchen', type: 'Speaker', supports_volume: true, volume_percent: 40, is_restricted: false },
  }, 1000);
  assert.deepEqual(t, { playing: true, title: 'Here Comes the Sun', artist: 'The Beatles, Friend', art: 'https://i.scdn.co/mid', progress: 61000, duration: 185000, at: 1000, shuffle: false, device: { id: 'k', name: 'Kitchen', type: 'Speaker', volume: 40, supportsVolume: true, restricted: false } });
  const ep = parsePlayer({ is_playing: false, progress_ms: 5, currently_playing_type: 'episode', item: { name: 'Ep 1', duration_ms: 1000, show: { name: 'The Show' }, images: [{ url: 'https://i.scdn.co/e', width: 300 }] }, device: { id: 'p', name: 'Phone', volume_percent: null } });
  assert.equal(ep.artist, 'The Show');
  assert.equal(ep.art, 'https://i.scdn.co/e');
  assert.equal(ep.device.supportsVolume, false);
  assert.equal(parsePlayer(null), null);
});

test('explainSpotifyError: plain words for the common refusals', () => {
  const e = (status, error) => new HttpError(status, `${status}`, { error });
  assert.match(explainSpotifyError(e(404, { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' })).message, /Choose where to play/);
  assert.equal(explainSpotifyError(e(404, { reason: 'NO_ACTIVE_DEVICE' })).reason, 'NO_ACTIVE_DEVICE');
  assert.match(explainSpotifyError(e(403, { status: 403, message: 'Check settings on developer.spotify.com/dashboard, the user may not be registered.' })).message, /User Management/);
  assert.match(explainSpotifyError(e(429, { status: 429, message: 'API rate limit exceeded' })).message, /slow down/);
  const other = new HttpError(500, '500 Server error', null);
  assert.equal(explainSpotifyError(other), other);
});

test('a used or foreign Spotify return is handled as Spotify\'s, never passed on as a failed Google sign-in', async () => {
  const store = memStore(), session = memStore();
  const sp = new Spotify(settings(), { storage: store });
  const hist = { replaceState(_a, _b, x) { this.url = x; } };
  // Google's return: not Spotify's (Google's states don't start with "sp.").
  assert.equal(await sp.handleRedirect({ search: '?code=g&state=123-456', hash: '' }, session, hist, 'https://p/'), null);
  // A Spotify return whose sign-in was already used (Back to Spotify's page): Spotify's message.
  assert.match(await sp.handleRedirect({ search: '?code=c&state=sp.old', hash: '' }, session, hist, 'https://p/'), /already been used/);
  assert.equal(hist.url, 'https://p/', 'the code is removed from the address');
});

test('rate limit: Spotify\'s wait is kept, and no call is made until it\'s over', async () => {
  const store = memStore();
  importSpotify('rt-0', store);
  const sp = new Spotify(settings(), { storage: store });
  const calls = fakeFetch((url) => (url.includes('/api/token') ? { body: { access_token: 'at', expires_in: 3600 } } : { status: 429, body: { error: { status: 429, message: 'API rate limit exceeded', reason: 'QUOTA_EXCEEDED' } } }));
  await assert.rejects(sp.pause(), /paused the panel's access/);
  assert.ok(sp.blockedUntil() > Date.now() + 5 * 3600e3, 'hours for the daily quota');
  const n = calls.length;
  await assert.rejects(sp.player(), /paused the panel's access/);
  assert.equal(calls.length, n, 'nothing sent while blocked');
});

test('explainSpotifyError: "Restriction violated" and bare 403s', () => {
  const e = (status, error) => new HttpError(status, `${status}`, { error });
  assert.match(explainSpotifyError(e(403, { status: 403, message: 'Player command failed: Restriction violated', reason: 'UNKNOWN' })).message, /didn't allow that just now/);
  assert.match(explainSpotifyError(new HttpError(403, '403 ', null)).message, /User Management/);
});

test('a refresh doesn\'t undo a Disconnect made while it was in flight; an ended sign-in leaves a note', async () => {
  const store = memStore();
  importSpotify('rt-0', store);
  const sp = new Spotify(settings(), { storage: store });
  let release;
  fakeFetch(() => new Promise((r) => { release = () => r({ body: { access_token: 'at', refresh_token: 'rt-1', expires_in: 3600 } }); }));
  const p = sp.accessToken();
  await new Promise((r) => setTimeout(r, 0));
  sp.disconnect();
  release();
  await p;
  assert.equal(sp.connected, false, 'still disconnected');
  importSpotify('rt-2', store);
  fakeFetch(() => ({ status: 400, body: { error: 'invalid_grant' } }));
  await assert.rejects(sp.accessToken(true));
  assert.ok(spotifyEnded(store) > 0);
});
