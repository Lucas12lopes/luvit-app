const CACHE_NAME = 'luvit-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
  // Ignora requisições de API (deixa o navegador buscar direto)
  if (e.request.url.includes('photon.komoot.io') || e.request.url.includes('openstreetmap')) {
    return;
  }
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});