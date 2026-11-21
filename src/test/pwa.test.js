import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const root = join(import.meta.dirname, '..', '..')
const pub = (p) => join(root, 'public', p)
const manifest = JSON.parse(readFileSync(pub('manifest.webmanifest'), 'utf8'))
const html = readFileSync(join(root, 'index.html'), 'utf8')
const swSource = readFileSync(pub('sw.js'), 'utf8')

describe('installability: manifest, icons and page metadata', () => {
  it('has the fields browsers require to offer installation', () => {
    expect(manifest).toMatchObject({ name: expect.any(String), short_name: 'ReadySet', start_url: '/', scope: '/', display: 'standalone' })
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i)
  })
  it('lists 192 and 512 PNG icons plus a maskable one, and every icon file exists', () => {
    const sizes = manifest.icons.map((i) => i.sizes)
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png')
      expect(existsSync(pub(icon.src.replace(/^\//, ''))), icon.src).toBe(true)
      expect(statSync(pub(icon.src.replace(/^\//, ''))).size).toBeGreaterThan(1000)
    }
  })
  it('shortcut targets are real app routes', () => {
    for (const s of manifest.shortcuts) expect(['/week', '/checklist']).toContain(s.url)
  })
  it('index.html links the manifest, theme colour and touch icon, is valid UTF-8 without a BOM, and keeps the em dash intact', () => {
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"')
    expect(html).toContain('name="theme-color"')
    expect(html).toContain('rel="apple-touch-icon"')
    expect(html.charCodeAt(0)).not.toBe(0xfeff)
    expect(html).toContain('ReadySet — Don\'t rush. Be ready.')
    expect(html).not.toMatch(/â€/) // the classic double-encoding damage
    expect(existsSync(pub('icons/apple-touch-icon.png'))).toBe(true)
  })
  it('has an offline fallback page that explains what needs a connection', () => {
    const page = readFileSync(pub('offline.html'), 'utf8')
    expect(page).toMatch(/offline/i)
    expect(page).toMatch(/need a connection/i)
  })
})

// Runs the real sw.js against a minimal fake service-worker scope, to check what it does and, above all, what it does NOT touch.
function loadWorker(fetchImpl = async () => new Response('ok')) {
  const handlers = {}
  const store = new Map()
  const scope = {
    location: { origin: 'https://app.example' },
    addEventListener: (type, fn) => (handlers[type] = fn),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
  }
  const caches = {
    open: async () => ({ addAll: async () => {}, put: async (k, v) => store.set(typeof k === 'string' ? k : k.url, v), match: async (k) => store.get(typeof k === 'string' ? k : k.url), keys: async () => [], delete: async () => true, add: async () => {} }),
    match: async (k) => store.get(typeof k === 'string' ? k : k.url) ?? undefined,
    keys: async () => [],
    delete: async () => true,
  }
  new Function('self', 'caches', 'fetch', 'Response', swSource)(scope, caches, vi.fn(fetchImpl), Response)
  return { handlers, store }
}
const req = (url, { method = 'GET', headers = {}, mode = 'cors' } = {}) => ({ url, method, mode, headers: new Headers(headers) })
const fire = (handlers, request) => {
  const respondWith = vi.fn((p) => p?.catch?.(() => {})) // a real worker's rejected response is the browser's problem, not ours
  handlers.fetch({ request, respondWith })
  return respondWith
}

describe('service worker: never touches private data', () => {
  const { handlers } = loadWorker()
  it('ignores API calls on any origin, non-GET requests and anything with an Authorization header', () => {
    expect(fire(handlers, req('https://app.example/api/events/upcoming'))).not.toHaveBeenCalled()
    expect(fire(handlers, req('https://api.other.example/api/events'))).not.toHaveBeenCalled()
    expect(fire(handlers, req('https://app.example/assets/app.js', { method: 'POST' }))).not.toHaveBeenCalled()
    expect(fire(handlers, req('https://app.example/assets/app.js', { headers: { Authorization: 'Bearer secret' } }))).not.toHaveBeenCalled()
    expect(fire(handlers, req('https://app.example/some/user/data.json'))).not.toHaveBeenCalled()
  })
  it('handles only navigations and the static shell', () => {
    expect(fire(handlers, req('https://app.example/assets/index-abc.js'))).toHaveBeenCalled()
    expect(fire(handlers, req('https://app.example/icons/icon-192.png'))).toHaveBeenCalled()
    expect(fire(handlers, req('https://app.example/week', { mode: 'navigate' }))).toHaveBeenCalled()
  })
  it('source never reads auth headers/tokens or caches a request it did not classify as static', () => {
    expect(swSource).not.toMatch(/localStorage|sessionStorage|readyset\.token/)
    expect(swSource).not.toMatch(/headers\.get\(['"]authorization/i)
  })
  it('an offline navigation falls back to the saved shell, then to the offline page', async () => {
    const { handlers: h, store } = loadWorker(async () => { throw new TypeError('offline') })
    store.set('/offline.html', new Response('offline page'))
    const respond = fire(h, req('https://app.example/checklist', { mode: 'navigate' }))
    expect(await (await respond.mock.calls[0][0]).text()).toBe('offline page')
    store.set('/index.html', new Response('app shell'))
    const again = fire(h, req('https://app.example/week', { mode: 'navigate' }))
    expect(await (await again.mock.calls[0][0]).text()).toBe('app shell')
  })
})
