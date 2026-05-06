const CACHE = 'luvit-v1'
const arquivos = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json'
]

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(arquivos)
    })
  )
})

self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(resposta) {
      return resposta || fetch(e.request)
    })
  )
})