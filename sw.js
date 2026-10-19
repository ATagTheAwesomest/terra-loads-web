/* TERRA-loads-web service worker: precache the app shell, serve cache-first. */
importScripts('version.js');

const CACHE = `terra-loads-${self.TERRA_VERSION}`;

// Every file the app needs to run offline. Add new files here.
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './version.js',
  './css/app.css',
  './js/app.js',
  './js/model.js',
  './js/parts.js',
  './js/store.js',
  './js/updater.js',
  './data/master_parts.csv',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('terra-loads-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The version check must always hit the network so updates are seen.
  if (url.searchParams.has('versioncheck')) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => {
        // Offline navigation to an uncached URL: fall back to the app shell.
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
