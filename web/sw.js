// Keeps the panel's own files available if the Wi-Fi drops during the nightly reload.
// Network first (so updates show up straight away), cache as a fallback. Data from Octopus,
// Google etc. is never cached here.
const CACHE = 'wallpanel-shell-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      // no-cache: always ask GitHub whether the file changed (a cheap 304 if not), so a
      // reload never runs an old copy from the browser's 10-minute HTTP cache.
      const res = await fetch(e.request, { cache: 'no-cache' });
      if (res.ok && !url.search.includes('code=')) {
        const cache = await caches.open(CACHE);
        cache.put(e.request, res.clone());
      }
      // A GitHub Pages error (404/5xx) during the nightly reload: use the last good copy.
      // Redirects (e.g. to a new custom domain) are followed as normal.
      if (res.type !== 'opaqueredirect' && (res.status === 404 || res.status >= 500)) {
        const hit = await caches.match(e.request, { ignoreSearch: true });
        if (hit) return hit;
      }
      return res;
    } catch {
      const hit = await caches.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      throw new Error('offline');
    }
  })());
});
