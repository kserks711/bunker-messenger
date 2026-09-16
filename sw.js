const CACHE_NAME = 'bunker-v1';
const ASSETS_TO_CACHE = ['/', '/index.html', '/socket.io/socket.io.js', '/manifest.json'];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).catch(err => console.log('[SW] Cache failed:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/socket.io/') || 
      event.request.url.includes('/upload-image') ||
      event.request.url.includes('/uploads/')) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});