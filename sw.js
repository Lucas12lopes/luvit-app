const VERSION = "luvit-v4-address-mobile";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const LOCAL_ASSETS = ["/", "/index.html", "/login.html", "/cadastro.html", "/recuperar-senha.html", "/app/", "/app/index.html", "/manifest.json", "/css/global.css", "/css/landing.css", "/css/auth.css", "/css/app.css", "/js/config.js", "/js/ui.js", "/js/landing.js", "/js/supabase-client.js", "/js/auth.js", "/js/app.js", "/js/maps.js", "/js/routes.js", "/js/storage.js", "/assets/icons/favicon-32.png", "/assets/icons/apple-touch-icon.png", "/assets/icons/icon-192x192.png", "/assets/icons/icon-512x512.png"];
self.addEventListener("install", event => { event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(LOCAL_ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => !key.startsWith(VERSION)).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
function isPrivateOrExternal(url) { return url.origin !== self.location.origin || /supabase|photon|nominatim|openstreetmap|cartocdn|osrm|waze|google/i.test(url.href); }
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url); if (isPrivateOrExternal(url)) return;
  if (event.request.mode === "navigate") { event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(PAGE_CACHE).then(cache => cache.put(event.request, copy)); return response; }).catch(async () => (await caches.match(event.request)) || (url.pathname.startsWith("/app") ? caches.match("/app/index.html") : caches.match("/index.html")))); return; }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(STATIC_CACHE).then(cache => cache.put(event.request, copy)); } return response; })));
});
