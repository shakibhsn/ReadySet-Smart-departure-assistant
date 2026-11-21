// PWA plumbing: service-worker registration and the "install app" prompt.

/**
 * Registers /sw.js in production builds only (in development a service worker would serve stale files).
 * The worker caches ONLY the static app shell; it never sees or stores API responses or the auth token.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        // Hand over the static files this page already loaded, so the first visit also works offline.
        const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => new URL(u).pathname.startsWith('/assets/'))
        registration.active?.postMessage({ type: 'CACHE_URLS', urls })
      })
      .catch(() => {
        /* offline support is optional: the app works normally without it */
      })
  })
}

/** True when the app runs as an installed app (home screen / desktop window). */
export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)

export const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !('MSStream' in window)
