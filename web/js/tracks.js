// The doorbell's own sound files. They are kept in this browser (IndexedDB), never uploaded anywhere, and
// not part of "Copy settings" (a file can't travel in it): add them again on another tablet. Only the
// first 30 seconds of a track ever play (chime.js), so a long file is fine but a huge one is refused.

const DB_NAME = 'wallpanel-sounds';
const STORE = 'tracks';
export const MAX_TRACKS = 10;
export const MAX_BYTES = 15 * 1024 * 1024;
const CANT_PLAY = "This browser can't play that file. Try an mp3, m4a, ogg or wav.";

function open() {
  return new Promise((resolve, reject) => {
    const idb = globalThis.indexedDB;
    if (!idb) return reject(new Error("This browser can't keep sound files (is private browsing on?)."));
    let req;
    try { req = idb.open(DB_NAME, 1); } catch (e) { return reject(new Error("This browser can't keep sound files (is private browsing on?).")); }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error("This browser can't keep sound files (is private browsing on?)."));
  });
}

/** One transaction: `fn(store)` returns the request whose result we want. */
async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req?.result); };
    t.onerror = t.onabort = () => { db.close(); reject(new Error(t.error?.name === 'QuotaExceededError' ? 'There is no room on this tablet for that file.' : "This browser couldn't save the file.")); };
  });
}

/** The saved tracks, oldest first: [{ id, name, size }]. */
export async function listTracks() {
  const all = (await run('readonly', (s) => s.getAll())) || [];
  return all.sort((a, b) => a.at - b.at).map(({ id, name, size }) => ({ id, name, size }));
}

/** A saved track's file (a Blob), or null if it's gone. */
export async function getTrack(id) {
  return (await run('readonly', (s) => s.get(String(id))))?.blob || null;
}

export async function removeTrack(id) {
  await run('readwrite', (s) => s.delete(String(id)));
}

/** Can this browser play it? Resolves with its length in seconds (or null if it doesn't say). */
export function checkPlayable(blob, { timeout = 8000, makeAudio = () => new Audio() } = {}) {
  return new Promise((resolve, reject) => {
    const a = makeAudio();
    const url = URL.createObjectURL(blob);
    let timer;
    const done = (err, secs) => {
      clearTimeout(timer);
      a.onloadedmetadata = a.onerror = null;
      try { a.removeAttribute('src'); a.load?.(); } catch { /* fine */ }
      URL.revokeObjectURL(url);
      if (err) reject(err); else resolve(secs);
    };
    timer = setTimeout(() => done(new Error(CANT_PLAY)), timeout);
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(null, Number.isFinite(a.duration) ? a.duration : null);
    a.onerror = () => done(new Error(CANT_PLAY));
    a.src = url;
  });
}

/** A file's name as a track name: without the extension, tidy, not too long. */
export const trackName = (file) => String(file?.name || 'My track').replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[_]+/g, ' ').trim().slice(0, 60) || 'My track';

/** Check and keep a file chosen in Settings. Resolves with { id, name, size, seconds }. */
export async function addTrack(file, opts = {}) {
  if (!file) throw new Error('Choose a sound file.');
  if (file.size > MAX_BYTES) throw new Error(`That file is ${(file.size / 1048576).toFixed(1)} MB and the limit is ${MAX_BYTES / 1048576} MB. Only the first 30 seconds ever play, so use a shorter or smaller copy.`);
  if (!file.size) throw new Error('That file is empty.');
  if ((await listTracks()).length >= MAX_TRACKS) throw new Error(`You can keep ${MAX_TRACKS} tracks. Remove one first.`);
  const seconds = await checkPlayable(file, opts);
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const name = trackName(file);
  await run('readwrite', (s) => s.put({ id, name, size: file.size, type: file.type, at: Date.now(), blob: file }));
  return { id, name, size: file.size, seconds };
}
