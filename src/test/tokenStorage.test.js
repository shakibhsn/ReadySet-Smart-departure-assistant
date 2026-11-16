import { describe, expect, it, vi } from 'vitest'
import { clearToken, getToken, setToken } from '@/lib/tokenStorage'

const KEY = 'readyset.token'
const inSession = () => window.sessionStorage.getItem(KEY)
const inLocal = () => window.localStorage.getItem(KEY)

describe('tokenStorage', () => {
  it('uses sessionStorage by default (and never localStorage)', () => {
    setToken('t1')
    expect(inSession()).toBe('t1')
    expect(inLocal()).toBeNull()
    expect(getToken()).toBe('t1')
  })

  it('uses localStorage only when remember is true (and not sessionStorage)', () => {
    setToken('t2', { remember: true })
    expect(inLocal()).toBe('t2')
    expect(inSession()).toBeNull()
    expect(getToken()).toBe('t2')
  })

  it('never leaves a stale copy in the other store when the mode changes', () => {
    setToken('old', { remember: true })
    setToken('new') // now session-only
    expect(inLocal()).toBeNull()
    expect(inSession()).toBe('new')

    setToken('newer', { remember: true })
    expect(inSession()).toBeNull()
    expect(inLocal()).toBe('newer')
  })

  it('clearToken removes the token from BOTH storage locations', () => {
    window.sessionStorage.setItem(KEY, 'a')
    window.localStorage.setItem(KEY, 'b')
    clearToken()
    expect(inSession()).toBeNull()
    expect(inLocal()).toBeNull()
    expect(getToken()).toBeNull()
  })

  it('does not throw and behaves as signed-out when storage is blocked', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked)
    expect(() => setToken('x')).not.toThrow()
    expect(getToken()).toBeNull()
    expect(() => clearToken()).not.toThrow()
    vi.restoreAllMocks()
  })

  it('never writes the token to the console', () => {
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    setToken('super-secret-token', { remember: true })
    getToken()
    clearToken()
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain('super-secret-token')
    }
    vi.restoreAllMocks()
  })
})
