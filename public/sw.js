/* ReadySet service worker.
 *
 * WHAT IT CACHES: only the static application shell (HTML shell, hashed JS/CSS under /assets/, icons, offline page).
 * Those files are identical for every user and contain no personal data.
 *
 * WHAT IT NEVER TOUCHES: every request that is not a same-origin GET for those static files. In particular all API
 * calls (other origin, or any /api/ path) and anything carrying an Authorization header go straight to the network and
 * are never read, cached or replayed here. The authentication token is never visible to this file.
 * Offline copies of a user's own events and checklists live in the page's IndexedDB (see src/lib/offline), per user,
 * and are removed on logout. So signing out or switching accounts leaves nothing user-specific in any shared cache.
 */
const VERSION = 'v1'
const SHELL = `readyset-shell-${VERSION}`
const ASSETS = `readyset-assets-${VERSION}`
const PRECACHE = ['/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/readyset-logo.png']
const MAX_ASSETS = 120

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL)
      await cache.addAll(PRECACHE)
      try {
        const res = await fetch('/', { cache: 'no-cache' })
        if (res.ok) await cache.put('/index.html', res) // the SPA shell: the same document for every route and every user
      } catch {
        /* installed while offline-ish: the shell is cached on the next successful navigation */
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (![SHELL, ASSETS].includes(name)) await caches.delete(name) // older versions
      }
      await self.clients.claim()
    })(),
  )
})

const isStatic = (url) => url.pathname.startsWith('/assets/') || PRECACHE.includes(url.pathname)

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(request.url.includes('/assets/') ? ASSETS : SHELL)
    await cache.put(request, response.clone())
    if (request.url.includes('/assets/')) trim(cache)
  }
  return response
}

async function trim(cache) {
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(key)
}

async function navigate(request) {
  try {
    const response = await fetch(request)
    if (response.ok && new URL(request.url).pathname === '/' && (response.headers.get('content-type') ?? '').includes('text/html')) {
      const cache = await caches.open(SHELL)
      await cache.put('/index.html', response.clone())
    }
    return response
  } catch {
    return (await caches.match('/index.html')) ?? (await caches.match('/offline.html')) ?? Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || request.headers.has('authorization')) return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return // API and third parties: untouched
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request))
  } else if (isStatic(url)) {
    event.respondWith(cacheFirst(request))
  }
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data?.type === 'CACHE_URLS' && Array.isArray(event.data.urls)) {
    // Files the page already loaded before this worker took control (so the very first visit also works offline).
    event.waitUntil(
      (async () => {
        const cache = await caches.open(ASSETS)
        for (const raw of event.data.urls.slice(0, MAX_ASSETS)) {
          try {
            const url = new URL(raw, self.location.origin)
            if (url.origin !== self.location.origin || !url.pathname.startsWith('/assets/')) continue
            if (!(await cache.match(url.pathname))) await cache.add(url.pathname)
          } catch {
            /* skip */
          }
        }
      })(),
    )
  }
})
