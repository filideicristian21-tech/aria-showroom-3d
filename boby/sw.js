// Service worker di Boby: app installabile e utilizzabile anche con rete scarsa.
const V = 'boby-v3';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/style.js', 'js/services.js', 'js/voice.js', 'js/brain.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];
const TILES = 'boby-tiles-v1';

self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && k !== TILES).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trimTiles() {
  const c = await caches.open(TILES); const ks = await c.keys();
  for (let i = 0; i < ks.length - 1500; i++) await c.delete(ks[i]);
}

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Tile, font della mappa e caratteri: prima la cache, poi aggiorno in background.
  if (u.hostname === 'tiles.openfreemap.org' || u.hostname.endsWith('gstatic.com') || u.hostname === 'fonts.googleapis.com' || u.hostname === 'unpkg.com' || u.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then((r) => { if (r.ok) { c.put(e.request, r.clone()); trimTiles(); } return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (u.origin === location.origin) {
    // App: prima la rete (aggiornamenti immediati), la cache se offline.
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(V).then((c) => c.put(e.request, cp)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
  }
});
