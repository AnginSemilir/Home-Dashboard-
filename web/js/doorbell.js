// Doorbell presses. Google sends Nest doorbell presses only as Device Access events, published to
// a Cloud Pub/Sub topic in the owner's own project; the panel reads its subscription straight
// from the browser (a "pull", held open by Google until something arrives) and acknowledges
// every message. Only a DoorbellChime.Chime from this Device Access project, less than a minute
// old and not seen before, rings. See docs/doorbell.md and docs/research/2026-09-27-doorbell.md.

import { HttpError } from './util.js';
import { explainGoogleError } from './google.js';

export const PUBSUB = 'https://pubsub.googleapis.com/v1';
export const CHIME = 'sdm.devices.events.DoorbellChime.Chime';
export const SUB_RE = /^projects\/([^/\s?#]+)\/subscriptions\/([^/\s?#]+)$/;
export const STALE_MS = 60e3;          // older presses are dropped (the door is long answered)
export const PULL_TIMEOUT_MS = 120e3;  // Google holds an empty pull for up to ~90 s
export const MIN_CYCLE_MS = 2e3;       // at most one pull a second per loop: stays in the free tier
export const LOOPS = 2;                // two pulls waiting at once, for a quicker ring
const BACKOFF_START_MS = 2e3, BACKOFF_MAX_MS = 60e3, CONFIG_RETRY_MS = 10 * 60e3, OFFLINE_AFTER_MS = 2 * 60e3, SEEN_KEEP_MS = 15 * 60e3;
const SEEN_KEY = 'wallpanel.doorbell.seen';
const JSON_H = { 'Content-Type': 'application/json' };

/** Why a pasted subscription name won't do ('' = fine or empty). */
export function checkSubName(name, deviceAccessId) {
  const n = String(name || '').trim();
  if (!n) return '';
  if (/\/topics\//.test(n)) return "That's the topic. Paste the subscription name: projects/…/subscriptions/panel-doorbell";
  const m = SUB_RE.exec(n);
  if (!m) return 'Paste the full name, like projects/your-cloud-project-id/subscriptions/panel-doorbell';
  if (deviceAccessId && m[1] === deviceAccessId) return "That's your Device Access project ID. Use the Google Cloud project ID (Cloud console → project picker → ID).";
  return '';
}

/** A Pub/Sub message's data (base64 of UTF-8 JSON). */
export function decodeData(b64) {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
}

/**
 * A doorbell press in an event, or null (not a press, or not ours), or { stale: true }.
 * One press arrives as several messages (STARTED, UPDATED…) repeating the same Chime, and
 * Pub/Sub may deliver twice: `key` is the same for all of them.
 */
export function parseChime(p, { projectId, publishTime, now = Date.now() } = {}) {
  const name = p?.resourceUpdate?.name;
  const ev = p?.resourceUpdate?.events?.[CHIME];
  if (!ev || typeof name !== 'string' || !projectId || !name.startsWith(`enterprises/${projectId}/devices/`)) return null;
  const at = Date.parse(p.timestamp || publishTime);
  if (!Number.isFinite(at) || now - at > STALE_MS) return { stale: true };
  const key = ev.eventId ? `${name}|${ev.eventSessionId || ''}|${ev.eventId}` : `${name}|${p.eventThreadId || ev.eventSessionId || p.eventId}`;
  return { device: name, key, at };
}

/** Pub/Sub's refusals in plain words. */
export function explainDoorbellError(e, sub) {
  const g = explainGoogleError(e, `${PUBSUB}/${sub}:pull`);
  if (g !== e) return g;
  if (!(e instanceof HttpError)) return e;
  const text = JSON.stringify(e.body || '');
  if (/BILLING/i.test(text) || /billing/i.test(e.message)) return new HttpError(e.status, 'Google Cloud billing is off for your project, so doorbell alerts have stopped. The free trial may have ended: Google Cloud → Billing → Upgrade.', e.body);
  if (e.status === 404) return new HttpError(404, `Google can't find the doorbell subscription "${sub}". Check the name in Settings (copy it from Google Cloud → Pub/Sub → Subscriptions). If it's gone, create it again with Expiration period: Never expire.`, e.body);
  if (e.status === 403) return new HttpError(403, "The Google account you signed in with isn't allowed to read the doorbell subscription. Sign in with the account that owns the Google Cloud project, or give this account the Pub/Sub Subscriber role on the subscription.", e.body);
  if (e.status === 400) return new HttpError(400, 'The doorbell subscription name is wrong. It should look like projects/your-cloud-project-id/subscriptions/panel-doorbell.', e.body);
  return e;
}

/** Errors that waiting won't fix: the setup needs changing. */
const isConfigError = (e) => (e instanceof HttpError && [400, 401, 403, 404].includes(e.status)) || /sign in again/i.test(e?.message || '');

const defaultSleep = (ms, signal) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

export class DoorbellListener {
  /**
   * @param {object} o
   * @param {{api: Function}} o.google  the panel's Google client
   * @param {{devices: Function}} [o.nest] used once: Google starts sending events after a device list
   * @param {string} o.sub  projects/…/subscriptions/…
   * @param {string} o.projectId  the Device Access project ID
   * @param {(ring: {device: string, at: number}) => void} o.onRing
   * @param {(status: object) => void} [o.onStatus]
   */
  constructor({ google, nest, sub, projectId, onRing, onStatus = () => {}, now = () => Date.now(), sleep = defaultSleep, storage = globalThis.sessionStorage, loops = LOOPS }) {
    Object.assign(this, { g: google, nest, sub: String(sub).trim(), projectId, onRing, onStatus, now, sleep, storage, loops });
    this.gen = 0;
    this.running = false;
    this.failingSince = 0;
    this.seen = new Map();
    try { for (const [k, t] of JSON.parse(storage?.getItem(SEEN_KEY) || '[]')) this.seen.set(k, t); } catch { /* none kept */ }
    this.triggered = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const gen = ++this.gen;
    this.ctrl = new AbortController();
    // Google begins publishing a project's events after a device list with the current sign-in.
    if (!this.triggered && this.nest) { this.triggered = true; this.nest.devices().catch(() => {}); }
    for (let i = 0; i < this.loops; i++) this.sleep(i * 1000, this.ctrl.signal).then(() => this.loop(gen));
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.gen++;
    this.ctrl?.abort();
  }

  async loop(gen) {
    let backoff = 0;
    while (gen === this.gen) {
      const t0 = this.now();
      let r;
      try {
        r = await this.g.api(`${PUBSUB}/${this.sub}:pull`, { method: 'POST', headers: JSON_H, body: '{"maxMessages":10}', signal: this.ctrl.signal }, PULL_TIMEOUT_MS);
      } catch (e) {
        if (gen !== this.gen) return; // stopped
        if (e?.name === 'AbortError') continue; // our own time limit on an empty pull: pull again
        const config = isConfigError(e);
        this.fail(explainDoorbellError(e, this.sub), config);
        backoff = config ? CONFIG_RETRY_MS : Math.min(BACKOFF_MAX_MS, backoff ? backoff * 2 : BACKOFF_START_MS);
        await this.sleep(backoff, this.ctrl.signal);
        if (config) backoff = 0;
        continue;
      }
      // Arrived after stop(): leave it unacknowledged, Google offers it again shortly.
      if (gen !== this.gen) return;
      backoff = 0;
      this.ok();
      const got = r?.receivedMessages || [];
      if (got.length) {
        for (const m of got) this.handle(m); // ring first…
        // …then acknowledge every message, pressed or not, so none come back.
        this.g.api(`${PUBSUB}/${this.sub}:acknowledge`, { method: 'POST', headers: JSON_H, body: JSON.stringify({ ackIds: got.map((m) => m.ackId) }) }).catch(() => {});
      } else if (this.now() - t0 < MIN_CYCLE_MS) {
        await this.sleep(MIN_CYCLE_MS - (this.now() - t0), this.ctrl.signal);
      }
    }
  }

  handle(m) {
    let hit;
    try {
      hit = parseChime(decodeData(m?.message?.data || ''), { projectId: this.projectId, publishTime: m?.message?.publishTime, now: this.now() });
    } catch {
      return; // not an event we can read
    }
    if (!hit || hit.stale) return;
    const now = this.now();
    for (const [k, t] of this.seen) if (now - t > SEEN_KEEP_MS) this.seen.delete(k);
    if (this.seen.has(hit.key)) return;
    this.seen.set(hit.key, now);
    try { this.storage?.setItem(SEEN_KEY, JSON.stringify([...this.seen])); } catch { /* fine */ }
    this.onRing({ device: hit.device, at: hit.at });
  }

  ok() {
    this.failingSince = 0;
    this.onStatus({ ok: true, at: this.now() });
  }

  fail(e, config) {
    const now = this.now();
    if (!this.failingSince) this.failingSince = now;
    // A network blip isn't worth a red dot; two minutes of them, or a setup problem, is.
    if (config || now - this.failingSince > OFFLINE_AFTER_MS) {
      this.onStatus({ error: config ? e.message : "Doorbell alerts: can't reach Google (retrying)", link: e.link, at: now });
    }
  }
}
