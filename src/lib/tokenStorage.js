// Bearer-token storage (Day 2 MVP).
//
// SECURITY TRADE-OFF: any script running on this page (e.g. through an XSS bug or a compromised
// npm package) can read browser storage, so a stolen token could be used until it expires.
// An HttpOnly cookie would hide the token from JavaScript, but it also needs CSRF protection and
// credentialed CORS. Mitigations used here:
//   - "Remember me" off  -> sessionStorage (cleared when the tab closes)
//   - "Remember me" on   -> localStorage   (persists, so the XSS exposure window is longer)
//   - short-lived tokens (JWT_EXPIRES_IN, default 1 day) and no dangerouslySetInnerHTML in the app.
// Moving to HttpOnly cookies is listed as a future hardening step in the README.

const KEY = 'readyset.token'

const safe = (fn) => {
  try {
    return fn()
  } catch {
    return null // storage blocked (private mode, disabled cookies, ...)
  }
}

export const getToken = () =>
  safe(() => window.sessionStorage.getItem(KEY)) ?? safe(() => window.localStorage.getItem(KEY))

export function setToken(token, { remember = false } = {}) {
  clearToken()
  safe(() => (remember ? window.localStorage : window.sessionStorage).setItem(KEY, token))
}

export function clearToken() {
  safe(() => window.sessionStorage.removeItem(KEY))
  safe(() => window.localStorage.removeItem(KEY))
}
