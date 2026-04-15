const CACHE_NAME = 'daytrace-v2'

// Install: cache the app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(['/'])
    )
  )
  self.skipWaiting()
})

// Activate: clean up old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch: network-first for navigation & API, cache-first for assets
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // Never cache API requests
  if (url.pathname.startsWith('/api/')) return

  // Navigation requests (HTML): network-first, fallback to cache
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          const clone = resp.clone()
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone))
          return resp
        })
        .catch(() => caches.match('/'))
    )
    return
  }

  // Static assets (JS, CSS, images): cache-first, fallback to network
  if (url.pathname.match(/\.(js|css|svg|png|jpg|woff2?)$/)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(resp => {
          const clone = resp.clone()
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone))
          return resp
        }).catch(() => cached)
        return cached || fetchPromise
      })
    )
    return
  }
})
