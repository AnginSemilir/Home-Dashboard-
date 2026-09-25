// Small shared helpers: safe DOM building, fetch with timeout, errors.

export class HttpError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** fetch() + JSON with a timeout. Throws HttpError on non-2xx, TypeError on network/CORS failure. */
export async function fetchJSON(url, opts = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) {
      const msg = (body && (body.error_description || body.error?.message || body.detail || body.error)) || res.statusText;
      throw new HttpError(res.status, `${res.status} ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`, body);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** Build an element. Text children are always inserted as text (never parsed as HTML). */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Parse a trusted, locally-authored SVG string (icons/charts built from numbers only). */
export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Exponential backoff with a cap, in ms: 30s, 60s, 2m, 4m … max 15m. */
export const backoffMs = (failures) => Math.min(15 * 60e3, 30e3 * 2 ** Math.max(0, failures - 1));

export function b64ToBytes(b64) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function bytesToB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** Human message for an error from any data source. */
export function describeError(e) {
  if (!e) return 'Unknown error';
  if (e.name === 'AbortError') return 'Timed out';
  if (e instanceof TypeError) return 'Network error (offline, or the service blocked a browser request)';
  return e.message || String(e);
}
